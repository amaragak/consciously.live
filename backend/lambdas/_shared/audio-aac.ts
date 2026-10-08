/**
 * AAC-in-MP4 (.m4a) encode for voice stems and background beds.
 * One format that Safari + Chromium both play — no Opus dual-encode.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const AAC_CONTENT_TYPE = "audio/mp4";
export const AAC_EXTENSION = ".m4a";

/** Speech / beds — transparent enough without huge files. */
const AAC_BITRATE = "160k";
/**
 * Prefer Fraunhofer FDK (layer :3+ amd64). Override with AAC_ENCODER=aac for
 * the stock ffmpeg encoder. Layer :1 is x86_64 without FDK.
 */
export const AAC_ENCODER = process.env.AAC_ENCODER?.trim() || "libfdk_aac";

export function aacEncodeArgs(inputPath: string, outputPath: string): string[] {
  return aacEncodeArgsWithFilter(inputPath, outputPath, null);
}

/** One-pass AAC encode; optional `-af` avoids a huge intermediate PCM WAV. */
export function aacEncodeArgsWithFilter(
  inputPath: string,
  outputPath: string,
  audioFilter: string | null,
): string[] {
  const args = ["-hide_banner", "-y", "-i", inputPath];
  if (audioFilter) args.push("-af", audioFilter);
  args.push(
    "-ac",
    "1",
    "-ar",
    "44100",
    "-c:a",
    AAC_ENCODER,
    "-b:a",
    AAC_BITRATE,
    outputPath,
  );
  return args;
}

/** `foo.mp3` / `foo.wav` / `foo.opus` → `foo.m4a`. */
export function siblingAacKey(key: string): string | null {
  const lower = key.toLowerCase();
  if (
    !lower.endsWith(".mp3") &&
    !lower.endsWith(".wav") &&
    !lower.endsWith(".opus") &&
    !lower.endsWith(".m4a")
  ) {
    return null;
  }
  const dot = key.lastIndexOf(".");
  if (dot <= 0) return null;
  return `${key.slice(0, dot)}${AAC_EXTENSION}`;
}

/** AAC (ADTS or M4A) → MP3 for catalog / loudnorm paths that still expect MPEG. */
export async function aacAdtsToMp3Buffer(aac: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const isM4a =
    aac.length >= 8 &&
    aac[4] === 0x66 &&
    aac[5] === 0x74 &&
    aac[6] === 0x79 &&
    aac[7] === 0x70;
  const inPath = `/tmp/aac-in-${id}${isM4a ? AAC_EXTENSION : ".aac"}`;
  const outPath = `/tmp/aac-out-${id}.mp3`;
  fs.writeFileSync(inPath, aac);
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inPath,
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      outPath,
    ]);
    return fs.readFileSync(outPath);
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

/**
 * Any ffmpeg-readable buffer → AAC-in-MP4 (.m4a) for Safari-safe delivery.
 * `inputExt` is the tempfile suffix (e.g. `.aac`, `.mp3`, `.wav`).
 */
export async function bufferToAacM4a(
  buf: Buffer,
  inputExt: string,
): Promise<Buffer> {
  const id = randomUUID();
  const ext = inputExt.startsWith(".") ? inputExt : `.${inputExt}`;
  const inPath = `/tmp/to-m4a-in-${id}${ext}`;
  const outPath = `/tmp/to-m4a-out-${id}${AAC_EXTENSION}`;
  fs.writeFileSync(inPath, buf);
  try {
    await execFileAsync("ffmpeg", aacEncodeArgs(inPath, outPath));
    return fs.readFileSync(outPath);
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
