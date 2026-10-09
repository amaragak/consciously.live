/**
 * MP3 encode for Lambda: the medimade-ffmpeg layer ships FDK AAC but not
 * libmp3lame — use the bundled `lame` CLI after a PCM decode instead.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function ffmpegBin(): string {
  return fs.existsSync("/opt/bin/ffmpeg") ? "/opt/bin/ffmpeg" : "ffmpeg";
}

function lameBin(): string {
  return fs.existsSync("/opt/bin/lame") ? "/opt/bin/lame" : "lame";
}

function optPathEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
}

/** WAV (or any ffmpeg-readable PCM container) → MP3 via lame CLI (VBR ~q2). */
export async function wavPathToMp3Buffer(wavPath: string): Promise<Buffer> {
  const id = randomUUID();
  const outPath = `/tmp/lame-out-${id}.mp3`;
  try {
    // Prefer in-process libmp3lame when the local ffmpeg has it (dev machines).
    try {
      await execFileAsync(
        ffmpegBin(),
        [
          "-hide_banner",
          "-y",
          "-i",
          wavPath,
          "-ac",
          "1",
          "-ar",
          "44100",
          "-c:a",
          "libmp3lame",
          "-q:a",
          "2",
          outPath,
        ],
        { env: optPathEnv() },
      );
      return fs.readFileSync(outPath);
    } catch {
      /* layer ffmpeg has no libmp3lame */
    }
    await execFileAsync(
      lameBin(),
      ["-V2", "--quiet", "--resample", "44.1", "-m", "m", wavPath, outPath],
      { env: optPathEnv() },
    );
    return fs.readFileSync(outPath);
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* */
    }
  }
}

/** Any ffmpeg-readable buffer → mono 44.1 kHz MP3. */
export async function bufferToMp3(buf: Buffer, inputExt: string): Promise<Buffer> {
  const id = randomUUID();
  const ext = inputExt.startsWith(".") ? inputExt : `.${inputExt}`;
  const inPath = `/tmp/to-mp3-in-${id}${ext}`;
  const wavPath = `/tmp/to-mp3-wav-${id}.wav`;
  fs.writeFileSync(inPath, buf);
  try {
    await execFileAsync(
      ffmpegBin(),
      [
        "-hide_banner",
        "-y",
        "-i",
        inPath,
        "-ac",
        "1",
        "-ar",
        "44100",
        wavPath,
      ],
      { env: optPathEnv() },
    );
    return wavPathToMp3Buffer(wavPath);
  } finally {
    for (const p of [inPath, wavPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}
