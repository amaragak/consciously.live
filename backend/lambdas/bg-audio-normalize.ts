import type { S3Event, Context } from "aws-lambda";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import {
  AAC_CONTENT_TYPE,
  AAC_EXTENSION,
  aacEncodeArgs,
} from "./_shared/audio-aac";
import {
  LOUDNORM_LRA,
  LOUDNORM_TP,
  loudnormReductionDbFromSource,
  measureIntegratedLufs,
} from "./_shared/bg-audio-loudnorm";
import {
  coerceLoudnormRestorePct,
  clearStreamingEditedAt,
  getSoundRow,
  LOUDNORM_FULL_TARGET_LUFS,
  loudnormTargetFromRestore,
  updateSoundLoudnorm,
  updateSoundProcessing,
} from "./_shared/sound-catalog";
import {
  hasAppliedEq,
  hasAppliedTrim,
} from "./_shared/sound-streaming-bake";

const s3 = new S3Client({});
const execFileAsync = promisify(execFile);

const RAW_PREFIX = "background-audio-raw/";
const OUT_PREFIX = "background-audio/";

/**
 * loudnorm's linear mode emits 192 kHz internally; without an explicit rate the
 * intermediate WAV balloons ~4x and fills /tmp on long compositions.
 */
const MAX_SAMPLE_RATE = 48000;

function isAudioKey(key: string): boolean {
  const k = key.toLowerCase();
  return k.endsWith(".mp3") || k.endsWith(".wav");
}

/**
 * Normalized outputs sharing one stem: PCM WAV (pro / archival), MP3 (legacy
 * fallback), and AAC-in-MP4 (.m4a) — Safari-safe streaming default.
 */
function outKeysFromRawKey(key: string): {
  wavKey: string;
  mp3Key: string;
  aacKey: string;
} {
  if (!key.startsWith(RAW_PREFIX)) {
    throw new Error(`key does not start with ${RAW_PREFIX}`);
  }
  const rel = key.slice(RAW_PREFIX.length);
  const lower = rel.toLowerCase();
  let stem: string;
  if (lower.endsWith(".wav")) stem = rel.slice(0, -4);
  else if (lower.endsWith(".mp3")) stem = rel.slice(0, -4);
  else throw new Error(`unsupported audio key: ${key}`);
  return {
    wavKey: OUT_PREFIX + stem + ".wav",
    mp3Key: OUT_PREFIX + stem + ".mp3",
    aacKey: OUT_PREFIX + stem + AAC_EXTENSION,
  };
}

async function downloadToFile(bucket: string, key: string, path: string): Promise<number> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!obj.Body) throw new Error("S3 body is empty");
  await pipeline(obj.Body as Readable, fs.createWriteStream(path));
  return fs.statSync(path).size;
}

async function uploadFile(
  bucket: string,
  key: string,
  path: string,
  contentType: string,
): Promise<number> {
  const bytes = fs.statSync(path).size;
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(path),
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    },
    queueSize: 2,
    partSize: 16 * 1024 * 1024,
  });
  await upload.done();
  return bytes;
}

function ffmpegExecutable(): string {
  if (fs.existsSync("/opt/bin/ffmpeg")) return "/opt/bin/ffmpeg";
  return "ffmpeg";
}

function ffprobeExecutable(): string {
  if (fs.existsSync("/opt/bin/ffprobe")) return "/opt/bin/ffprobe";
  return "ffprobe";
}

/** Last lines of ffmpeg stderr — the part that actually names the failure. */
function stderrTail(stderr: string, lines = 12): string {
  return stderr.split("\n").filter(Boolean).slice(-lines).join("\n");
}

async function execFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegExecutable();
  const env = { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
  try {
    await execFileAsync(bin, args, { env, maxBuffer: 10 * 1024 * 1024 });
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer; message?: string };
    const stderr = stderrTail(e.stderr?.toString?.() ?? "");
    throw new Error(
      `ffmpeg failed (${bin}): ${e.message?.split("\n")[0] ?? String(err)}${
        stderr ? `\n${stderr}` : ""
      }`,
    );
  }
}

type SourceInfo = { sampleRate: number; durationSec: number | null };

async function probeSource(inputPath: string): Promise<SourceInfo> {
  const env = { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
  try {
    const { stdout } = await execFileAsync(
      ffprobeExecutable(),
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=sample_rate:format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      { env, maxBuffer: 1024 * 1024 },
    );
    const [rateRaw, durRaw] = stdout.trim().split("\n");
    const rate = Number(rateRaw);
    const dur = Number(durRaw);
    return {
      sampleRate: Number.isFinite(rate) && rate > 0 ? rate : 44100,
      durationSec: Number.isFinite(dur) && dur > 0 ? dur : null,
    };
  } catch {
    return { sampleRate: 44100, durationSec: null };
  }
}

/** Loud-normalized 24-bit PCM WAV at the source rate (capped). */
async function loudnormToWav(
  inputPath: string,
  outputWavPath: string,
  sampleRate: number,
  targetI: number,
): Promise<void> {
  const i = Number.isFinite(targetI) ? targetI : LOUDNORM_FULL_TARGET_LUFS;
  const filter = `loudnorm=I=${i}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:linear=true`;
  await execFfmpeg([
    "-hide_banner",
    "-y",
    "-i",
    inputPath,
    "-af",
    filter,
    "-ar",
    String(sampleRate),
    "-c:a",
    "pcm_s24le",
    "-rf64",
    "auto",
    outputWavPath,
  ]);
}

/** Resample / PCM copy of the original — no loudnorm. */
async function passthroughToWav(
  inputPath: string,
  outputWavPath: string,
  sampleRate: number,
): Promise<void> {
  await execFfmpeg([
    "-hide_banner",
    "-y",
    "-i",
    inputPath,
    "-ar",
    String(sampleRate),
    "-c:a",
    "pcm_s24le",
    "-rf64",
    "auto",
    outputWavPath,
  ]);
}

async function wavToAac(wavPath: string, outputAacPath: string): Promise<void> {
  // Beds are stereo masters — never fold to mono.
  await execFfmpeg(aacEncodeArgs(wavPath, outputAacPath, { channels: 2 }));
}

async function headObject(
  bucket: string,
  key: string,
): Promise<{ LastModified?: Date } | null> {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    return null;
  }
}

/**
 * Skip only when WAV+AAC already exist and are at least as new as the raw
 * upload. A replaced raw (newer LastModified) must re-normalize.
 */
async function outputsAreCurrent(
  bucket: string,
  rawKey: string,
  wavKey: string,
  aacKey: string,
): Promise<boolean> {
  const [raw, wav, aac] = await Promise.all([
    headObject(bucket, rawKey),
    headObject(bucket, wavKey),
    headObject(bucket, aacKey),
  ]);
  if (!wav || !aac) return false;
  const rawMs = raw?.LastModified?.getTime();
  if (rawMs == null) return true;
  const wavMs = wav.LastModified?.getTime() ?? 0;
  const aacMs = aac.LastModified?.getTime() ?? 0;
  return wavMs >= rawMs && aacMs >= rawMs;
}

function freeTmpMb(): number | null {
  try {
    const st = fs.statfsSync("/tmp");
    return Math.round((Number(st.bavail) * Number(st.bsize)) / (1024 * 1024));
  } catch {
    return null;
  }
}

export async function handler(event: S3Event, context?: Context): Promise<void> {
  for (const rec of event.Records ?? []) {
    const bucket = rec.s3.bucket.name;
    const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, " "));

    // Only process raw prefix audio.
    if (!key.startsWith(RAW_PREFIX)) continue;
    if (!isAudioKey(key)) continue;

    const { wavKey, mp3Key, aacKey } = outKeysFromRawKey(key);

    const id = randomUUID();
    const inExt = key.toLowerCase().endsWith(".mp3") ? "mp3" : "wav";
    const inPath = `/tmp/bg-in-${id}.${inExt}`;
    const tmpWav = `/tmp/bg-norm-${id}.wav`;
    const tmpAac = `/tmp/bg-out-${id}${AAC_EXTENSION}`;
    const startedAt = Date.now();
    let stage: "downloading" | "normalizing" | "encoding" | "storing" = "downloading";
    let source: SourceInfo | null = null;
    let rawBytes = 0;

    const describeSource = () =>
      source
        ? `${Math.round(rawBytes / 1048576)}MB source, ${
            source.durationSec ? `${Math.round(source.durationSec / 60)}min, ` : ""
          }${source.sampleRate}Hz`
        : `${Math.round(rawBytes / 1048576)}MB source`;

    try {
      // Skip when WAV+AAC already exist and are not older than this raw upload.
      // Catalog identity stays `.mp3`-shaped; we no longer write bed MP3 objects.
      if (await outputsAreCurrent(bucket, key, wavKey, aacKey)) {
        console.log("bg audio already normalized, skipping", { key, wavKey, aacKey });
        await updateSoundProcessing(mp3Key, { stage: "done", detail: "already normalized" });
        continue;
      }

      const catalogEarly = await getSoundRow(mp3Key);
      const restorePctEarly = coerceLoudnormRestorePct(
        catalogEarly?.loudnormRestorePct,
        0,
      );
      const restoring = restorePctEarly > 0;
      await updateSoundProcessing(mp3Key, {
        stage: "downloading",
        detail: restoring
          ? `restore ${restorePctEarly}% — downloading raw`
          : "downloading raw",
      });
      rawBytes = await downloadToFile(bucket, key, inPath);
      source = await probeSource(inPath);
      const sampleRate = Math.min(source.sampleRate, MAX_SAMPLE_RATE);

      const catalog = await getSoundRow(mp3Key);
      const restorePct = coerceLoudnormRestorePct(
        catalog?.loudnormRestorePct,
        0,
      );

      stage = "normalizing";
      await updateSoundProcessing(mp3Key, {
        stage: "normalizing",
        detail: `${describeSource()} · measuring LUFS`,
      });
      const sourceLufs = await measureIntegratedLufs(inPath);
      // Prefer catalog target when apply-restore already wrote it (matches fader).
      const catalogTarget = catalog?.loudnormTargetLufs;
      const targetFromRestore =
        sourceLufs != null
          ? loudnormTargetFromRestore({ sourceLufs, restorePct })
          : LOUDNORM_FULL_TARGET_LUFS;
      const targetI =
        catalogTarget != null &&
        Number.isFinite(catalogTarget) &&
        Math.abs(catalogTarget - targetFromRestore) <= 0.15
          ? catalogTarget
          : targetFromRestore;
      const reductionDb =
        sourceLufs != null ? loudnormReductionDbFromSource(sourceLufs) : 0;

      // Always from the raw original (inPath). 100% restore → passthrough.
      // Otherwise → same loudnorm on that original, with I interpolated by the
      // fader (0% = −16, mid = milder target, never loudnorm-of-loudnorm).
      const fullRestore =
        restorePct >= 100 ||
        (sourceLufs != null && Math.abs(targetI - sourceLufs) <= 0.3);
      await updateSoundProcessing(mp3Key, {
        stage: "normalizing",
        detail:
          sourceLufs != null
            ? fullRestore
              ? `${describeSource()} · passthrough original (${sourceLufs} LUFS)`
              : `${describeSource()} · loudnorm original ${sourceLufs}→${targetI} LUFS (${restorePct}% restore)`
            : describeSource(),
      });
      if (fullRestore) {
        await passthroughToWav(inPath, tmpWav, sampleRate);
      } else {
        await loudnormToWav(inPath, tmpWav, sampleRate, targetI);
      }
      fs.unlinkSync(inPath);

      stage = "encoding";
      await updateSoundProcessing(mp3Key, {
        stage: "encoding",
        detail:
          restorePct > 0
            ? `${describeSource()} · encoding restored ${targetI} LUFS`
            : describeSource(),
      });
      await wavToAac(tmpWav, tmpAac);

      stage = "storing";
      await updateSoundProcessing(mp3Key, {
        stage: "storing",
        detail:
          restorePct > 0
            ? `${describeSource()} · storing restored ${targetI} LUFS`
            : describeSource(),
      });
      const wavBytes = await uploadFile(bucket, wavKey, tmpWav, "audio/wav");
      const aacBytes = await uploadFile(bucket, aacKey, tmpAac, AAC_CONTENT_TYPE);

      if (sourceLufs != null) {
        // Nominal output ≈ target (skip a second full-file measure — too slow on long comps).
        await updateSoundLoudnorm(mp3Key, {
          loudnormSourceLufs: sourceLufs,
          loudnormOutputLufs: targetI,
          loudnormTargetLufs: targetI,
          loudnormReductionDb: reductionDb,
          loudnormRestorePct: restorePct,
        });
      }

      // Loudnorm rewrote WAV/AAC without EQ/trim — keep metadata, mark bake stale.
      if (hasAppliedEq(catalog) || hasAppliedTrim(catalog)) {
        await clearStreamingEditedAt(mp3Key);
      }

      await updateSoundProcessing(mp3Key, {
        stage: "done",
        detail:
          sourceLufs != null
            ? restorePct > 0
              ? `restored to ${targetI} LUFS (${restorePct}% toward original ${sourceLufs})`
              : `loudnorm ${sourceLufs}→${targetI} LUFS`
            : describeSource(),
      });
      console.log("normalized bg audio", {
        bucket,
        key,
        wavKey,
        mp3Key,
        aacKey,
        rawBytes,
        wavBytes,
        aacBytes,
        sampleRate,
        durationSec: source.durationSec,
        sourceLufs,
        targetI,
        restorePct,
        reductionDb,
        elapsedMs: Date.now() - startedAt,
        freeTmpMb: freeTmpMb(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const remainingMs = context?.getRemainingTimeInMillis?.() ?? null;
      const detail = [
        `stage=${stage}`,
        describeSource(),
        `elapsed=${Math.round((Date.now() - startedAt) / 1000)}s`,
        `freeTmp=${freeTmpMb() ?? "?"}MB`,
        remainingMs != null ? `remaining=${Math.round(remainingMs / 1000)}s` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      await updateSoundProcessing(mp3Key, { stage: "failed", error: msg, detail });
      console.error("bg audio normalize failed", { bucket, key, mp3Key, stage, detail, msg });
      throw e;
    } finally {
      for (const p of [inPath, tmpWav, tmpAac]) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* */
        }
      }
    }
  }
}
