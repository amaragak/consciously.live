/**
 * EBU R128 loudness normalization for MP3 via ffmpeg (two-pass loudnorm).
 * Target matches common podcast / voice streaming delivery (-16 LUFS integrated).
 *
 * Lambda ffmpeg layer has FDK AAC but not libmp3lame — encode the loudnorm
 * output with the bundled `lame` CLI (see audio-mp3.ts).
 */
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { wavPathToMp3Buffer } from "./audio-mp3";

const execFileAsync = promisify(execFile);

/** Integrated loudness target (LUFS). */
export const OUTPUT_LUFS_I = -16;

type LoudnormMeasure = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};

function ffmpegBin(): string {
  return fs.existsSync("/opt/bin/ffmpeg") ? "/opt/bin/ffmpeg" : "ffmpeg";
}

function binEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
}

function parseLoudnormJson(stderr: string): LoudnormMeasure {
  const anchor = stderr.indexOf('"input_i"');
  if (anchor === -1) {
    throw new Error("loudnorm pass 1: no loudnorm JSON in ffmpeg stderr");
  }
  let start = stderr.lastIndexOf("{", anchor);
  if (start === -1) {
    throw new Error("loudnorm pass 1: no opening brace before input_i");
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < stderr.length; i++) {
    const c = stderr[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error("loudnorm pass 1: unclosed JSON in ffmpeg stderr");
  }
  const raw = stderr.slice(start, end + 1);
  const j = JSON.parse(raw) as Record<string, string>;
  const input_i = j.input_i;
  const input_tp = j.input_tp;
  const input_lra = j.input_lra;
  const input_thresh = j.input_thresh;
  const target_offset = j.target_offset;
  if (
    input_i == null ||
    input_tp == null ||
    input_lra == null ||
    input_thresh == null ||
    target_offset == null
  ) {
    throw new Error("loudnorm pass 1: JSON missing required fields");
  }
  return {
    input_i,
    input_tp,
    input_lra,
    input_thresh,
    target_offset,
  };
}

/**
 * Normalize MP3 buffer to ~OUTPUT_LUFS_I LUFS integrated (true peak capped per filter).
 * Requires `ffmpeg` (+ `lame` on Lambda) on PATH.
 */
export async function loudnormMp3Buffer(buf: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/lufs-in-${id}.mp3`;
  const wavPath = `/tmp/lufs-out-${id}.wav`;
  try {
    fs.writeFileSync(inPath, buf);
    const { stderr: e1 } = await execFileAsync(
      ffmpegBin(),
      [
        "-hide_banner",
        "-nostats",
        "-i",
        inPath,
        "-af",
        `loudnorm=I=${OUTPUT_LUFS_I}:TP=-1.5:LRA=11:print_format=json`,
        "-f",
        "null",
        "-",
      ],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        env: binEnv(),
      },
    );
    const m = parseLoudnormJson(e1);
    const af = [
      "loudnorm",
      `I=${OUTPUT_LUFS_I}`,
      "TP=-1.5",
      "LRA=11",
      `measured_I=${m.input_i}`,
      `measured_TP=${m.input_tp}`,
      `measured_LRA=${m.input_lra}`,
      `measured_thresh=${m.input_thresh}`,
      `offset=${m.target_offset}`,
      "linear=true",
      "print_format=summary",
    ].join(":");
    const afArg = `loudnorm=${af.slice("loudnorm:".length)}`;
    await execFileAsync(
      ffmpegBin(),
      [
        "-hide_banner",
        "-y",
        "-i",
        inPath,
        "-af",
        afArg,
        "-ac",
        "1",
        "-ar",
        "44100",
        wavPath,
      ],
      { env: binEnv() },
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
