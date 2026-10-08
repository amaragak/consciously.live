/**
 * Rebuild streaming AAC from the WAV/MP3 master with optional trim/fade + EQ.
 * Used by apply and clear paths so clearing one adjustment keeps the other.
 *
 * Encodes AAC in one ffmpeg pass (no intermediate PCM WAV) so long beds stay
 * under API Gateway's ~29s limit.
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { execFile } from "child_process";
import fs from "fs";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import { promisify } from "util";
import { randomUUID } from "crypto";
import {
  AAC_CONTENT_TYPE,
  AAC_EXTENSION,
  aacEncodeArgsWithFilter,
  siblingAacKey,
} from "./audio-aac";
import { originalKeyForPublicKey, siblingWavKey } from "./background-audio-keys";
import {
  coerceSoundEqBands,
  ffmpegEqFilter,
  type SoundEqBand,
} from "./sound-eq-bands";
import { clipDurationSec, trimAndFadeFilter } from "./sound-trim-fade";

const execFileAsync = promisify(execFile);

/**
 * Long-lived CDN cache is fine: clients append `?v=<updatedAt>` and the media
 * distribution includes query strings in the cache key.
 */
const STREAMING_AAC_CACHE_CONTROL = "public, max-age=31536000, immutable";

function ffmpegExecutable(): string {
  if (fs.existsSync("/opt/bin/ffmpeg")) return "/opt/bin/ffmpeg";
  return "ffmpeg";
}

function ffprobeExecutable(): string {
  if (fs.existsSync("/opt/bin/ffprobe")) return "/opt/bin/ffprobe";
  return "ffprobe";
}

function binEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
}

async function execFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegExecutable();
  try {
    await execFileAsync(bin, args, { env: binEnv(), maxBuffer: 10 * 1024 * 1024 });
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer; message?: string };
    const stderr = e.stderr?.toString?.().trim() ?? "";
    throw new Error(
      `ffmpeg failed (${bin}): ${e.message ?? String(err)}${stderr ? `\n${stderr}` : ""}`,
    );
  }
}

async function probeDurationSec(path: string): Promise<number> {
  const bin = ffprobeExecutable();
  const { stdout } = await execFileAsync(
    bin,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    { env: binEnv(), maxBuffer: 1024 * 1024 },
  );
  const n = Number(String(stdout).trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Could not read audio duration");
  return n;
}

async function objectExists(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(
  s3: S3Client,
  bucket: string,
  key: string,
  path: string,
): Promise<void> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!obj.Body) throw new Error("S3 body is empty");
  // Stream to disk — buffering full WAV masters OOMs the 2GB Lambda.
  await pipeline(obj.Body as Readable, createWriteStream(path));
}

export type StreamingBakeParams = {
  s3: S3Client;
  bucket: string;
  mp3Key: string;
  /** Prefer archived original for non-cumulative re-bake. */
  preferOriginal?: boolean;
  trimStartSec: number;
  trimEndSec: number | null;
  fadeInSec: number;
  fadeOutSec: number;
  eqBands: SoundEqBand[] | unknown;
};

export type StreamingBakeResult = {
  aacKey: string;
  wavKey: string;
  sourceKey: string;
  filter: string | null;
};

export async function bakeStreamingAac(
  params: StreamingBakeParams,
): Promise<StreamingBakeResult> {
  const {
    s3,
    bucket,
    mp3Key,
    preferOriginal = true,
    trimStartSec,
    trimEndSec,
    fadeInSec,
    fadeOutSec,
  } = params;
  const bands = coerceSoundEqBands(params.eqBands);
  const wavKey = siblingWavKey(mp3Key) ?? `${mp3Key.slice(0, -4)}.wav`;
  const aacKey = siblingAacKey(mp3Key) ?? `${mp3Key.slice(0, -4)}${AAC_EXTENSION}`;
  const origMp3 = originalKeyForPublicKey(mp3Key);
  const origWav = originalKeyForPublicKey(wavKey);

  // Prefer WAV masters; AAC only as last resort. No bed MP3.
  let sourceKey: string | null = null;
  let ext = "wav";
  if (preferOriginal && (await objectExists(s3, bucket, origWav))) {
    sourceKey = origWav;
    ext = "wav";
  } else if (await objectExists(s3, bucket, wavKey)) {
    sourceKey = wavKey;
    ext = "wav";
  } else if (await objectExists(s3, bucket, aacKey)) {
    sourceKey = aacKey;
    ext = "m4a";
  } else if (preferOriginal && (await objectExists(s3, bucket, origMp3))) {
    // Legacy archive only — new beds never write MP3.
    sourceKey = origMp3;
    ext = "mp3";
  }
  if (!sourceKey) throw new Error("Audio object not found (still processing?)");

  const id = randomUUID();
  const inPath = `/tmp/bake-in-${id}.${ext}`;
  const outAac = `/tmp/bake-out-${id}${AAC_EXTENSION}`;

  try {
    await downloadToFile(s3, bucket, sourceKey, inPath);

    const startSec =
      Number.isFinite(trimStartSec) && trimStartSec > 0 ? trimStartSec : 0;
    const endSec =
      trimEndSec != null &&
      Number.isFinite(trimEndSec) &&
      trimEndSec > startSec
        ? trimEndSec
        : null;
    const fi = Number.isFinite(fadeInSec) && fadeInSec > 0 ? fadeInSec : 0;
    const fo = Number.isFinite(fadeOutSec) && fadeOutSec > 0 ? fadeOutSec : 0;

    const hasTrimOrFade = startSec > 0 || endSec != null || fi > 0 || fo > 0;
    const parts: string[] = [];
    if (hasTrimOrFade) {
      const sourceDur = await probeDurationSec(inPath);
      const clipDur = clipDurationSec(startSec, endSec, sourceDur);
      const trimFade = trimAndFadeFilter(startSec, endSec, clipDur, fi, fo);
      if (trimFade) parts.push(trimFade);
    }
    const eqAf = ffmpegEqFilter(bands);
    if (eqAf) parts.push(eqAf);
    const filter = parts.length > 0 ? parts.join(",") : null;

    await execFfmpeg(aacEncodeArgsWithFilter(inPath, outAac, filter));

    // Prove trim landed in the file (not just the catalog).
    if (startSec > 0.01 || endSec != null) {
      const sourceDur = await probeDurationSec(inPath);
      const expected = clipDurationSec(startSec, endSec, sourceDur);
      const actual = await probeDurationSec(outAac);
      // AAC container duration can drift a few hundred ms; 2s is generous.
      if (Math.abs(actual - expected) > 2) {
        throw new Error(
          `Trim bake mismatch: expected ~${expected.toFixed(1)}s AAC, got ${actual.toFixed(1)}s (start=${startSec}, end=${endSec ?? "null"})`,
        );
      }
    }

    const aacBuf = fs.readFileSync(outAac);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: aacKey,
        Body: aacBuf,
        ContentType: AAC_CONTENT_TYPE,
        CacheControl: STREAMING_AAC_CACHE_CONTROL,
      }),
    );

    return { aacKey, wavKey, sourceKey, filter };
  } finally {
    for (const p of [inPath, outAac]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

export function hasAppliedTrim(row: {
  trimStartSec?: number;
  trimEndSec?: number | null;
  fadeInSec?: number;
  fadeOutSec?: number;
} | null | undefined): boolean {
  if (!row) return false;
  const start = Number(row.trimStartSec ?? 0);
  const end = row.trimEndSec;
  const fi = Number(row.fadeInSec ?? 0);
  const fo = Number(row.fadeOutSec ?? 0);
  return (
    (Number.isFinite(start) && start > 0.01) ||
    (end != null && Number.isFinite(Number(end))) ||
    (Number.isFinite(fi) && fi > 0) ||
    (Number.isFinite(fo) && fo > 0)
  );
}

export function hasAppliedEq(row: { eqBands?: unknown } | null | undefined): boolean {
  return coerceSoundEqBands(row?.eqBands).length > 0;
}
