/**
 * Server-fallback preprocess: trim leading/trailing silence and speed 1.5×
 * so OpenAI billed minutes stay closer to spoken content.
 */

import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

function ffmpegBin(): string {
  if (fs.existsSync("/opt/bin/ffmpeg")) return "/opt/bin/ffmpeg";
  return "ffmpeg";
}

function ffprobeBin(): string {
  if (fs.existsSync("/opt/bin/ffprobe")) return "/opt/bin/ffprobe";
  return "ffprobe";
}

export async function probeAudioDurationSec(buf: Buffer, ext: string): Promise<number | null> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "voice-dur-"));
  const inPath = path.join(dir, `in.${ext}`);
  try {
    await fs.promises.writeFile(inPath, buf);
    const { stdout } = await execFileAsync(
      ffprobeBin(),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inPath,
      ],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    const n = Number(String(stdout).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Returns a shorter/faster copy for Whisper, or the original buffer on failure.
 * Playback original is stored separately by the caller.
 */
export async function preprocessVoiceForServerTranscribe(
  buf: Buffer,
  ext: string,
): Promise<{ buf: Buffer; mime: string; ext: string }> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "voice-prep-"));
  const inPath = path.join(dir, `in.${ext}`);
  const outPath = path.join(dir, `out-${randomUUID().slice(0, 8)}.mp3`);
  try {
    await fs.promises.writeFile(inPath, buf);
    // Trim edges of silence, then 1.5× tempo (atempo max 2.0).
    const af =
      "silenceremove=start_periods=1:start_silence=0.35:start_threshold=-35dB:" +
      "detection=peak,areverse,silenceremove=start_periods=1:start_silence=0.35:" +
      "start_threshold=-35dB:detection=peak,areverse,atempo=1.5";
    await execFileAsync(
      ffmpegBin(),
      [
        "-y",
        "-i",
        inPath,
        "-af",
        af,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "48k",
        outPath,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    const out = await fs.promises.readFile(outPath);
    if (out.length < 64) return { buf, mime: guessMime(ext), ext };
    return { buf: out, mime: "audio/mpeg", ext: "mp3" };
  } catch (e) {
    console.error("preprocessVoiceForServerTranscribe", e);
    return { buf, mime: guessMime(ext), ext };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function guessMime(ext: string): string {
  if (ext === "webm") return "audio/webm";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "flac") return "audio/flac";
  return "application/octet-stream";
}
