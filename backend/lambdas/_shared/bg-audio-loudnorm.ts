import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { LOUDNORM_FULL_TARGET_LUFS } from "./sound-catalog";

const execFileAsync = promisify(execFile);

export const LOUDNORM_TP = -1.5;
export const LOUDNORM_LRA = 11;

function ffmpegExecutable(): string {
  if (fs.existsSync("/opt/bin/ffmpeg")) return "/opt/bin/ffmpeg";
  return "ffmpeg";
}

function parseLoudnormPrintJson(
  stderr: string,
): { input_i?: string; output_i?: string; input_tp?: string } | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(stderr.slice(start, end + 1)) as {
      input_i?: string;
      output_i?: string;
      input_tp?: string;
    };
  } catch {
    return null;
  }
}

function parseLufsField(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < -70 || n > 0) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Measure integrated LUFS only — writes nothing to disk beyond ffmpeg’s null sink.
 * Uses loudnorm print_format=json (same meter as the normalize pass).
 */
export async function measureIntegratedLufs(
  inputPath: string,
): Promise<number | null> {
  const env = { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
  const filter = `loudnorm=I=${LOUDNORM_FULL_TARGET_LUFS}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:print_format=json`;
  try {
    const { stderr } = await execFileAsync(
      ffmpegExecutable(),
      [
        "-hide_banner",
        "-i",
        inputPath,
        "-af",
        filter,
        "-f",
        "null",
        "-",
      ],
      { env, maxBuffer: 10 * 1024 * 1024 },
    );
    const parsed = parseLoudnormPrintJson(stderr?.toString?.() ?? "");
    return parseLufsField(parsed?.input_i);
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer; message?: string };
    const parsed = parseLoudnormPrintJson(e.stderr?.toString?.() ?? "");
    const fromErr = parseLufsField(parsed?.input_i);
    if (fromErr != null) return fromErr;
    console.warn(
      "measureIntegratedLufs failed",
      e.message?.split("\n")[0] ?? String(err),
    );
    return null;
  }
}

export function loudnormReductionDbFromSource(sourceLufs: number): number {
  return (
    Math.round(Math.max(0, sourceLufs - LOUDNORM_FULL_TARGET_LUFS) * 10) / 10
  );
}
