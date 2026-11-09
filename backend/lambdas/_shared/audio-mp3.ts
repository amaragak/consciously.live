/**
 * MP3 encode for Lambda: the medimade-ffmpeg layer ships FDK AAC but not
 * libmp3lame — use the bundled `lame` CLI after a PCM decode instead.
 *
 * Always feed lame 16-bit PCM WAV: layer ffmpeg often writes float WAV by
 * default, which lame rejects with a bare non-zero exit.
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

function execDetail(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as {
    message?: string;
    stderr?: string | Buffer;
    stdout?: string | Buffer;
  };
  const stderr = e.stderr
    ? typeof e.stderr === "string"
      ? e.stderr
      : e.stderr.toString("utf8")
    : "";
  const stdout = e.stdout
    ? typeof e.stdout === "string"
      ? e.stdout
      : e.stdout.toString("utf8")
    : "";
  const bits = [e.message, stderr.trim(), stdout.trim()].filter(Boolean);
  return bits.join("\n").slice(0, 800) || "unknown encode error";
}

/** Re-encode any ffmpeg-readable audio to mono 44.1 kHz signed 16-bit WAV. */
async function toPcmS16leWav(inputPath: string, outPath: string): Promise<void> {
  await execFileAsync(
    ffmpegBin(),
    [
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "pcm_s16le",
      outPath,
    ],
    { env: optPathEnv() },
  );
}

/** WAV (or any ffmpeg-readable PCM container) → MP3 via lame CLI (VBR ~q2). */
export async function wavPathToMp3Buffer(wavPath: string): Promise<Buffer> {
  const id = randomUUID();
  const pcmPath = `/tmp/lame-pcm-${id}.wav`;
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

    try {
      await toPcmS16leWav(wavPath, pcmPath);
    } catch (e) {
      throw new Error(`wav→pcm_s16le failed: ${execDetail(e)}`);
    }

    try {
      await execFileAsync(
        lameBin(),
        ["-V2", "--quiet", "--resample", "44.1", "-m", "m", pcmPath, outPath],
        { env: optPathEnv() },
      );
    } catch (e) {
      throw new Error(`lame encode failed: ${execDetail(e)}`);
    }
    return fs.readFileSync(outPath);
  } finally {
    for (const p of [pcmPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

/** Any ffmpeg-readable buffer → mono 44.1 kHz MP3. */
export async function bufferToMp3(buf: Buffer, inputExt: string): Promise<Buffer> {
  const id = randomUUID();
  const ext = inputExt.startsWith(".") ? inputExt : `.${inputExt}`;
  const inPath = `/tmp/to-mp3-in-${id}${ext}`;
  fs.writeFileSync(inPath, buf);
  try {
    // Await so finally does not unlink while encode is still running.
    return await wavPathToMp3Buffer(inPath);
  } finally {
    try {
      fs.unlinkSync(inPath);
    } catch {
      /* */
    }
  }
}
