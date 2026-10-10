/**
 * Backfill AAC-in-MP4 (.m4a) siblings for:
 *   - background-audio/ beds (from WAV master, else MP3)
 *   - meditation / program dry|wet WAVs
 *   - speaker-samples / orpheus-speaker-samples dry|fx|wet WAVs
 *
 * Safe to re-run: skips stems that already have `.m4a` unless `--force`.
 *
 *   export MEDIA_BUCKET_NAME=…          # or --bucket
 *   npm run backfill-aac-streams -- --dry-run
 *   npm run backfill-aac-streams
 *   npm run backfill-aac-streams -- --only bg
 *   npm run backfill-aac-streams -- --only voices --concurrency 4
 *   npm run backfill-aac-streams -- --only samples --force
 *
 * Requires ffmpeg with native `aac` encoder on PATH.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AAC_CONTENT_TYPE,
  AAC_EXTENSION,
  aacEncodeArgs,
} from "../lambdas/_shared/audio-aac";
import { BG_AUDIO_PREFIX } from "../lambdas/_shared/background-audio-keys";

const execFileAsync = promisify(execFile);
const s3 = new S3Client({});

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1]?.trim() || null;
}

const bucket = argValue("--bucket") ?? process.env.MEDIA_BUCKET_NAME ?? "";
const concurrency = Math.max(1, Number(argValue("--concurrency") ?? "3") || 3);
const limit = Number(argValue("--limit") ?? "0") || 0;
/** Skip sources larger than this many MB (0 = no limit). Speeds past hour-long beds. */
const maxSourceMb = Math.max(0, Number(argValue("--max-mb") ?? "0") || 0);
const onlyRaw = (argValue("--only") ?? "all").toLowerCase();
const only =
  onlyRaw === "bg" || onlyRaw === "voices" || onlyRaw === "samples"
    ? onlyRaw
    : "all";

type Job = { aacKey: string; sourceKey: string; label: string; size?: number };

async function listPrefix(
  prefix: string,
): Promise<Array<{ key: string; size: number }>> {
  const out: Array<{ key: string; size: number }> = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key;
      if (key && !key.endsWith("/")) {
        out.push({ key, size: obj.Size ?? 0 });
      }
    }
    token = page.NextContinuationToken;
  } while (token);
  return out;
}

function underSizeCap(size: number): boolean {
  if (maxSourceMb <= 0) return true;
  return size <= maxSourceMb * 1024 * 1024;
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: "bytes=0-0",
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function stemOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot > 0 ? key.slice(0, dot) : key;
}

async function collectBgJobs(): Promise<Job[]> {
  const keys = await listPrefix(BG_AUDIO_PREFIX);
  const byStem = new Map<
    string,
    {
      wav?: string;
      mp3?: string;
      wavSize?: number;
      mp3Size?: number;
      hasAac: boolean;
    }
  >();
  for (const { key, size } of keys) {
    const lower = key.toLowerCase();
    const stem = stemOf(key);
    const rec = byStem.get(stem) ?? { hasAac: false };
    if (lower.endsWith(".wav")) {
      rec.wav = key;
      rec.wavSize = size;
    } else if (lower.endsWith(".mp3")) {
      rec.mp3 = key;
      rec.mp3Size = size;
    } else if (lower.endsWith(AAC_EXTENSION)) rec.hasAac = true;
    byStem.set(stem, rec);
  }
  const jobs: Job[] = [];
  for (const [stem, rec] of byStem) {
    if (rec.hasAac && !force) continue;
    const source = rec.wav ?? rec.mp3;
    const size = rec.wav ? rec.wavSize ?? 0 : rec.mp3Size ?? 0;
    if (!source || !underSizeCap(size)) continue;
    jobs.push({
      aacKey: `${stem}${AAC_EXTENSION}`,
      sourceKey: source,
      label: "bg",
      size,
    });
  }
  // Smallest first so hour-long beds don't block everything.
  jobs.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
  return jobs;
}

function isVoiceStemWav(key: string): boolean {
  return (
    /-(?:dry|wet)\.wav$/i.test(key) ||
    /(?:^|\/)(?:\d+(?:\.\d+)-)?loud-(?:dry|fx|wet)\.wav$/i.test(key)
  );
}

async function collectVoiceJobs(): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const prefix of ["meditations/", "programs/"]) {
    const keys = await listPrefix(prefix);
    for (const { key, size } of keys) {
      if (!isVoiceStemWav(key) || !underSizeCap(size)) continue;
      const aacKey = `${stemOf(key)}${AAC_EXTENSION}`;
      if (!force && (await objectExists(aacKey))) continue;
      jobs.push({ aacKey, sourceKey: key, label: "voice", size });
    }
  }
  jobs.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
  return jobs;
}

async function collectSampleJobs(): Promise<Job[]> {
  const jobs: Job[] = [];
  for (const prefix of ["speaker-samples/", "orpheus-speaker-samples/"]) {
    const keys = await listPrefix(prefix);
    const keySet = new Set(keys.map((k) => k.key));
    for (const { key, size } of keys) {
      const lower = key.toLowerCase();
      // Prefer WAV masters (dry/fx/wet). Else bare preview MP3s.
      const isWav =
        lower.endsWith(".wav") &&
        (isVoiceStemWav(key) || /-(?:dry|fx|wet)\.wav$/i.test(key));
      const isPlainMp3 =
        lower.endsWith(".mp3") &&
        !lower.endsWith("-dry.mp3") &&
        !lower.endsWith("-wet.mp3") &&
        !lower.endsWith("-fx.mp3");
      if (!isWav && !isPlainMp3) continue;
      if (!underSizeCap(size)) continue;
      const aacKey = `${stemOf(key)}${AAC_EXTENSION}`;
      if (!force && (await objectExists(aacKey))) continue;
      // Skip plain mp3 if a wav sibling exists (encode from wav instead).
      if (isPlainMp3 && keySet.has(`${stemOf(key)}.wav`)) continue;
      jobs.push({
        aacKey,
        sourceKey: key,
        label: "sample",
        size,
      });
    }
  }
  jobs.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
  return jobs;
}

async function encodeOne(job: Job): Promise<number> {
  const id = randomUUID();
  const srcLower = job.sourceKey.toLowerCase();
  const ext = srcLower.endsWith(".wav")
    ? "wav"
    : srcLower.endsWith(".mp3")
      ? "mp3"
      : "bin";
  const inPath = path.join(os.tmpdir(), `aac-in-${id}.${ext}`);
  const outPath = path.join(os.tmpdir(), `aac-out-${id}${AAC_EXTENSION}`);
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: job.sourceKey }),
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes?.byteLength) throw new Error("empty source");
    fs.writeFileSync(inPath, Buffer.from(bytes));
    // Beds must stay stereo; voice/sample stems stay mono.
    const channels = job.label === "bg" ? 2 : 1;
    await execFileAsync(
      "ffmpeg",
      aacEncodeArgs(inPath, outPath, { channels: channels === 2 ? 2 : 1 }),
      {
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const body = fs.readFileSync(outPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: job.aacKey,
        Body: body,
        ContentType: AAC_CONTENT_TYPE,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return body.byteLength;
  } finally {
    for (const p of [inPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

async function main(): Promise<void> {
  if (!bucket) {
    throw new Error("MEDIA_BUCKET_NAME is not set (or pass --bucket <name>)");
  }

  const jobs: Job[] = [];
  if (only === "all" || only === "bg") {
    jobs.push(...(await collectBgJobs()));
  }
  if (only === "all" || only === "voices") {
    jobs.push(...(await collectVoiceJobs()));
  }
  if (only === "all" || only === "samples") {
    jobs.push(...(await collectSampleJobs()));
  }
  // Prefer size order when present (bg/voices/samples collectors set it).
  jobs.sort((a, b) => {
    const ds = (a.size ?? 0) - (b.size ?? 0);
    return ds !== 0 ? ds : a.aacKey.localeCompare(b.aacKey);
  });
  const work = limit > 0 ? jobs.slice(0, limit) : jobs;

  console.log(
    `[aac] ${jobs.length} pending (${only}${maxSourceMb > 0 ? `, max ${maxSourceMb}MB` : ""})${dryRun ? " (dry run)" : ""}, running ${work.length}, concurrency ${concurrency}`,
  );

  if (dryRun) {
    for (const j of work) {
      console.log(`[dry-run] ${j.label} ${j.aacKey} ← ${j.sourceKey}`);
    }
    return;
  }

  let done = 0;
  let failed = 0;
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= work.length) return;
      const job = work[index]!;
      try {
        const bytes = await encodeOne(job);
        done++;
        console.log(
          `[aac] ${done}/${work.length} ${job.label} ${job.aacKey} (${bytes} bytes)`,
        );
      } catch (e) {
        failed++;
        console.error(
          `[aac] failed ${job.aacKey}`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, work.length || 1) }, worker),
  );
  console.log(`[aac] complete — encoded ${done}, failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
