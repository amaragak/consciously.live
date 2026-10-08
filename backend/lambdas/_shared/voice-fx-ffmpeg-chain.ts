/**
 * Echo → IR convolution voice FX via ffmpeg.
 * Voice path: compressed (AAC/m4a/mp3/wav) in → AAC-in-MP4 out — no voice WAV encode.
 * IR is a tiny synthetic PCM wav required by afir (not a voice encode hop).
 *
 * Mix is a DAW parallel send (same as compare-reverbs.py):
 *   out = 1.0 * dry + wetGain * peakMatched(delay→IR)
 * No loudnorm. Peak-match only stages the return to dry peak.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AAC_ENCODER, AAC_EXTENSION } from "./audio-aac";
import {
  type VoiceFxSettings,
  voiceFxIrFingerprint,
} from "./voice-fx-settings";

const execFileAsync = promisify(execFile);
const AAC_BITRATE = "160k";
/** Speechify PCM + per-segment FX sample rate. */
export const VOICE_FX_PCM_SR = 24_000;

function binEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
}

function ffmpegBin(): string {
  if (fs.existsSync("/opt/bin/ffmpeg")) return "/opt/bin/ffmpeg";
  return "ffmpeg";
}

function clampWetGain(wetGain: number): number {
  return Math.min(1, Math.max(0, wetGain));
}

async function run(
  cmd: string,
  args: string[],
  label: string,
): Promise<void> {
  try {
    await execFileAsync(cmd, args, {
      env: binEnv(),
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof err.stderr === "string"
        ? err.stderr
        : err.stderr
          ? err.stderr.toString("utf8")
          : "";
    const tail = stderr.trim().split("\n").slice(-12).join("\n");
    throw new Error(
      `${label} failed: ${err.message?.split("\n")[0] ?? String(e)}${
        tail ? `\n${tail}` : ""
      }`,
    );
  }
}

function parsePeakLinear(stderr: string): number {
  const m = /max_volume:\s*([-\d.]+)\s*dB/.exec(stderr);
  if (!m) return 1;
  const db = Number(m[1]);
  if (!Number.isFinite(db) || db < -90) return 1e-6;
  return Math.max(1e-6, Math.pow(10, db / 20));
}

/** Abs peak (linear 0..1) via ffmpeg volumedetect. */
async function detectPeakLinear(
  argsBeforeAf: string[],
  af = "volumedetect",
): Promise<number> {
  const args = [
    "-hide_banner",
    ...argsBeforeAf,
    "-af",
    af,
    "-f",
    "null",
    "-",
  ];
  try {
    const { stderr } = await execFileAsync(ffmpegBin(), args, {
      env: binEnv(),
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
    });
    return parsePeakLinear(stderr);
  } catch (e) {
    const err = e as { stderr?: string | Buffer };
    const stderr =
      typeof err.stderr === "string"
        ? err.stderr
        : err.stderr
          ? err.stderr.toString("utf8")
          : "";
    return parsePeakLinear(stderr);
  }
}

/** delay → afir → pad → [proc]. Inputs: [0]=dry, [1]=ir. */
function delayAfirPadToProc(settings: VoiceFxSettings, sampleRate: number): string {
  const s = settings;
  return (
    `[0:a]aformat=sample_rates=${sampleRate}:channel_layouts=mono,` +
    `aecho=1:1:${s.delayMs}|${s.delayMs2}|${s.delayMs3}:${s.delayDecay}|${s.delayDecay2}|${s.delayDecay3}[e];` +
    `[1:a]aformat=sample_rates=${sampleRate}:channel_layouts=mono[ir];` +
    `[e][ir]afir=dry=1:wet=1,apad=pad_dur=${s.tailPadSec}[proc]`
  );
}

function writeMonoWav(path: string, sr: number, samples: Int16Array): void {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i]!, 44 + i * 2);
  }
  fs.writeFileSync(path, buf);
}

function synthesizeReverbIrSamples(
  settings: VoiceFxSettings,
  sr = 44100,
): Int16Array {
  const n = Math.max(
    Math.floor(sr / 10),
    Math.floor(sr * settings.irLengthSec),
  );
  const samples = new Int16Array(n);
  const pre = Math.min(
    n - 2,
    Math.max(0, Math.floor((settings.soxPredelayMs / 1000) * sr)),
  );
  const reverb = settings.soxReverberance / 100;
  const room = settings.soxRoomScale / 100;
  const damp = settings.soxHfDamping / 100;
  const wetLin = Math.pow(10, settings.soxWetGain / 20);
  const rt60 = 0.35 + room * 2.8;
  const noiseAmp = (0.12 + reverb * 0.55) * wetLin;
  const directAmp = 0.92 * wetLin;

  let rng =
    (Math.floor(settings.irLengthSec * 1000) ^
      (settings.soxReverberance << 3) ^
      (settings.soxRoomScale << 7) ^
      0x9e3779b9) >>>
    0;
  const nextNoise = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return (rng / 0xffffffff) * 2 - 1;
  };

  samples[pre] = Math.max(
    -32767,
    Math.min(32767, Math.round(directAmp * 30000)),
  );

  const earlyCount = 6 + Math.round(room * 10);
  for (let e = 0; e < earlyCount; e++) {
    const tMs = 8 + e * (6 + room * 18) + (e % 3) * 3;
    const idx = pre + Math.floor((tMs / 1000) * sr);
    if (idx <= 0 || idx >= n) continue;
    const amp = noiseAmp * 0.55 * Math.pow(0.78, e);
    samples[idx] = Math.max(
      -32767,
      Math.min(
        32767,
        samples[idx]! + Math.round(amp * 22000 * (e % 2 === 0 ? 1 : -0.7)),
      ),
    );
  }

  let lp = 0;
  const lpCoeff = 0.15 + (1 - damp) * 0.8;
  for (let i = pre + 1; i < n; i++) {
    const t = (i - pre) / sr;
    const env = Math.exp((-6.907 * t) / Math.max(0.05, rt60)) * noiseAmp;
    if (env < 1e-5) break;
    const raw = nextNoise();
    lp += lpCoeff * (raw - lp);
    const v = Math.round(lp * env * 32767);
    samples[i] = Math.max(-32767, Math.min(32767, samples[i]! + v));
  }

  return samples;
}

export async function generateSoxIrWav(
  settings: VoiceFxSettings,
  outPath: string,
  sampleRate = 44100,
): Promise<void> {
  const sr =
    Number.isFinite(sampleRate) && sampleRate > 0
      ? Math.round(sampleRate)
      : 44100;
  writeMonoWav(outPath, sr, synthesizeReverbIrSamples(settings, sr));
}

/**
 * Raw s16le mono @ 24 kHz → delay→afir → parallel send mix → s16le @ 24 kHz.
 * out = 1.0*dry + wetGain*peakMatched(proc). Used for per-segment FX OLA.
 */
export async function applyVoiceFxPcmSegment24k(params: {
  dryPcm: Buffer;
  settings: VoiceFxSettings;
  /** Prebuilt IR wav (any rate; resampled to 24 kHz). */
  irWav?: Buffer;
}): Promise<{ wetPcm: Buffer; ms: number }> {
  const dryPcm = params.dryPcm;
  if (!dryPcm.byteLength || dryPcm.byteLength % 2 !== 0) {
    throw new Error("dryPcm must be non-empty even-length s16le");
  }
  const id = randomUUID();
  const dryPath = `/tmp/fx-pcm-in-${id}.s16le`;
  const irPath = `/tmp/fx-pcm-ir-${id}.wav`;
  const procPath = `/tmp/fx-pcm-proc-${id}.s16le`;
  const outPath = `/tmp/fx-pcm-out-${id}.s16le`;
  const t0 = Date.now();
  const s = params.settings;
  const w = clampWetGain(s.wetGain);
  const pcmIn = [
    "-f",
    "s16le",
    "-ar",
    String(VOICE_FX_PCM_SR),
    "-ac",
    "1",
  ];
  try {
    fs.writeFileSync(dryPath, dryPcm);
    if (params.irWav && params.irWav.byteLength > 100) {
      fs.writeFileSync(irPath, params.irWav);
    } else {
      await generateSoxIrWav(s, irPath, VOICE_FX_PCM_SR);
    }
    await run(
      ffmpegBin(),
      [
        "-hide_banner",
        "-y",
        ...pcmIn,
        "-i",
        dryPath,
        "-i",
        irPath,
        "-filter_complex",
        delayAfirPadToProc(s, VOICE_FX_PCM_SR),
        "-map",
        "[proc]",
        "-f",
        "s16le",
        "-ar",
        String(VOICE_FX_PCM_SR),
        "-ac",
        "1",
        procPath,
      ],
      "ffmpeg voice-fx pcm24k wet return",
    );
    const dryPeak = await detectPeakLinear([
      ...pcmIn,
      "-i",
      dryPath,
    ]);
    const wetPeak = await detectPeakLinear([
      ...pcmIn,
      "-i",
      procPath,
    ]);
    const match = dryPeak / wetPeak;
    const fc =
      `[0:a]aformat=sample_rates=${VOICE_FX_PCM_SR}:channel_layouts=mono[d];` +
      `[1:a]aformat=sample_rates=${VOICE_FX_PCM_SR}:channel_layouts=mono,` +
      `volume=${match.toFixed(8)}[w];` +
      `[d][w]amix=inputs=2:weights=1 ${w.toFixed(4)}:` +
      `normalize=0:duration=longest[fx]`;
    await run(
      ffmpegBin(),
      [
        "-hide_banner",
        "-y",
        ...pcmIn,
        "-i",
        dryPath,
        ...pcmIn,
        "-i",
        procPath,
        "-filter_complex",
        fc,
        "-map",
        "[fx]",
        "-f",
        "s16le",
        "-ar",
        String(VOICE_FX_PCM_SR),
        "-ac",
        "1",
        outPath,
      ],
      "ffmpeg voice-fx pcm24k parallel send",
    );
    return { wetPcm: fs.readFileSync(outPath), ms: Date.now() - t0 };
  } finally {
    for (const p of [dryPath, irPath, procPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

/** Mix dry/wet s16le PCM with linear gains; length = max(dry, wet). */
export function mixDialPcmS16le(
  dryPcm: Buffer,
  wetPcm: Buffer,
  dryGain: number,
  wetGain: number,
): Buffer {
  const n = Math.max(dryPcm.byteLength, wetPcm.byteLength);
  const out = Buffer.alloc(n + (n % 2));
  const samples = out.byteLength / 2;
  for (let i = 0; i < samples; i++) {
    const di = i * 2;
    const d =
      di + 1 < dryPcm.byteLength ? dryPcm.readInt16LE(di) : 0;
    const w =
      di + 1 < wetPcm.byteLength ? wetPcm.readInt16LE(di) : 0;
    const v = Math.round(d * dryGain + w * wetGain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), di);
  }
  return out;
}

/** Overlap-add Int16 samples onto a float bus at sample offset. */
export function olaAddS16leToFloatBus(
  bus: Float32Array,
  pcm: Buffer,
  startSample: number,
): Float32Array {
  const need = startSample + pcm.byteLength / 2;
  let out: Float32Array = bus;
  if (need > out.length) {
    const next = new Float32Array(
      Math.max(need, Math.ceil(out.length * 1.5) || need),
    );
    next.set(out);
    out = next;
  }
  const n = pcm.byteLength / 2;
  for (let i = 0; i < n; i++) {
    out[startSample + i]! += pcm.readInt16LE(i * 2);
  }
  return out;
}

export function floatBusToS16le(bus: Float32Array, sampleCount: number): Buffer {
  const n = Math.max(0, Math.min(sampleCount, bus.length));
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.round(bus[i] ?? 0);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
  }
  return out;
}

/** 24 kHz s16le mono → AAC-in-MP4 @ 44.1 kHz for delivery. */
export async function pcm24kS16leToAac44100(pcm: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/pcm24-in-${id}.s16le`;
  const outPath = `/tmp/pcm24-out-${id}${AAC_EXTENSION}`;
  fs.writeFileSync(inPath, pcm);
  try {
    await run(
      ffmpegBin(),
      [
        "-hide_banner",
        "-y",
        "-f",
        "s16le",
        "-ar",
        String(VOICE_FX_PCM_SR),
        "-ac",
        "1",
        "-i",
        inPath,
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        AAC_ENCODER,
        "-b:a",
        AAC_BITRATE,
        outPath,
      ],
      "ffmpeg pcm24k→aac44100",
    );
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

export type VoiceFxInputExt = ".wav" | ".mp3" | ".aac" | ".m4a";

export type VoiceFxChainResult = {
  /** FX stem: 1.0*dry + wetGain*peakMatched(delay→IR). AAC-in-MP4. */
  fxAudio: Buffer;
  /** Dry stem (resampled). AAC-in-MP4. */
  dryAudio: Buffer;
  /** Peak-matched wet return (delay→IR) when requested. AAC-in-MP4. */
  wetAudio: Buffer | null;
  format: "m4a";
  irFingerprint: string;
  timings: {
    irMs: number;
    peakMs: number;
    encodeMs: number;
    totalMs: number;
    /** Legacy aliases used by gen timing logs. */
    wetMs: number;
    mixMs: number;
  };
  /** @deprecated alias of fxAudio */
  fxWav: Buffer;
  /** @deprecated alias of dryAudio */
  dryWav: Buffer;
  /** @deprecated */
  wetWav: Buffer;
};

/**
 * Compressed/voice in → delay → IR → peak-match → parallel send → AAC out.
 * out = 1.0 * dry + wetGain * peakMatched(proc). No loudnorm.
 */
export async function applyVoiceFxFfmpegChain(params: {
  dryAudio?: Buffer;
  /** @deprecated use dryAudio */
  dryWav?: Buffer;
  inputExt?: VoiceFxInputExt;
  settings: VoiceFxSettings;
  irWav?: Buffer;
  emitWetOnly?: boolean;
}): Promise<VoiceFxChainResult> {
  const dryAudio = params.dryAudio ?? params.dryWav;
  if (!dryAudio) throw new Error("dryAudio is required");
  const inputExt = params.inputExt ?? ".wav";

  const id = randomUUID();
  const dryPath = `/tmp/fx-in-${id}${inputExt}`;
  const irPath = `/tmp/fx-ir-${id}.wav`;
  const procPath = `/tmp/fx-proc-${id}.wav`;
  const fxPath = `/tmp/fx-out-${id}${AAC_EXTENSION}`;
  const dryOutPath = `/tmp/fx-dry-${id}${AAC_EXTENSION}`;
  const wetPath = `/tmp/fx-wet-${id}${AAC_EXTENSION}`;
  const t0 = Date.now();
  let irMs = 0;
  let peakMs = 0;
  let encodeMs = 0;

  try {
    fs.writeFileSync(dryPath, dryAudio);
    const irStarted = Date.now();
    if (params.irWav && params.irWav.byteLength > 100) {
      fs.writeFileSync(irPath, params.irWav);
    } else {
      await generateSoxIrWav(params.settings, irPath);
    }
    irMs = Date.now() - irStarted;

    const w = clampWetGain(params.settings.wetGain);
    const s = params.settings;

    const encodeStarted = Date.now();
    // 1) Wet return only (delay → afir → pad).
    await run(
      ffmpegBin(),
      [
        "-hide_banner",
        "-y",
        "-i",
        dryPath,
        "-i",
        irPath,
        "-filter_complex",
        delayAfirPadToProc(s, 44100),
        "-map",
        "[proc]",
        "-ac",
        "1",
        "-ar",
        "44100",
        procPath,
      ],
      "ffmpeg voice-fx wet return",
    );

    // 2) Peak-match return to dry (send gain-staging — not loudnorm).
    const peakStarted = Date.now();
    const dryPeak = await detectPeakLinear(
      ["-i", dryPath],
      "aformat=sample_rates=44100:channel_layouts=mono,volumedetect",
    );
    const wetPeak = await detectPeakLinear(["-i", procPath]);
    const match = dryPeak / wetPeak;
    peakMs = Date.now() - peakStarted;

    // 3) Parallel send: 1.0 * dry + w * peakMatched(wet).
    const fc =
      `[0:a]aformat=sample_rates=44100:channel_layouts=mono,asplit=2[d][d_out];` +
      `[1:a]aformat=sample_rates=44100:channel_layouts=mono,` +
      `volume=${match.toFixed(8)}[w];` +
      `[d][w]amix=inputs=2:weights=1 ${w.toFixed(4)}:` +
      `normalize=0:duration=longest[fx]`;

    await run(
      ffmpegBin(),
      [
        "-hide_banner",
        "-y",
        "-i",
        dryPath,
        "-i",
        procPath,
        "-filter_complex",
        fc,
        "-map",
        "[fx]",
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        AAC_ENCODER,
        "-b:a",
        AAC_BITRATE,
        fxPath,
        "-map",
        "[d_out]",
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        AAC_ENCODER,
        "-b:a",
        AAC_BITRATE,
        dryOutPath,
      ],
      "ffmpeg voice-fx parallel send aac",
    );

    let wetAudio: Buffer | null = null;
    if (params.emitWetOnly) {
      await run(
        ffmpegBin(),
        [
          "-hide_banner",
          "-y",
          "-i",
          procPath,
          "-af",
          `aformat=sample_rates=44100:channel_layouts=mono,volume=${match.toFixed(8)}`,
          "-ac",
          "1",
          "-ar",
          "44100",
          "-c:a",
          AAC_ENCODER,
          "-b:a",
          AAC_BITRATE,
          wetPath,
        ],
        "ffmpeg voice-fx wet-only aac",
      );
      wetAudio = fs.readFileSync(wetPath);
    }

    encodeMs = Date.now() - encodeStarted;
    const fxAudio = fs.readFileSync(fxPath);
    const dryOut = fs.readFileSync(dryOutPath);

    return {
      fxAudio,
      dryAudio: dryOut,
      wetAudio,
      format: "m4a",
      irFingerprint: voiceFxIrFingerprint(params.settings),
      timings: {
        irMs,
        peakMs,
        encodeMs,
        totalMs: Date.now() - t0,
        wetMs: peakMs,
        mixMs: encodeMs,
      },
      fxWav: fxAudio,
      dryWav: dryOut,
      wetWav: wetAudio ?? fxAudio,
    };
  } finally {
    for (const p of [dryPath, irPath, procPath, fxPath, dryOutPath, wetPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

export async function putIrToS3(params: {
  s3: S3Client;
  bucket: string;
  key: string;
  settings: VoiceFxSettings;
}): Promise<{ fingerprint: string; bytes: number }> {
  const id = randomUUID();
  const irPath = `/tmp/fx-ir-put-${id}.wav`;
  try {
    await generateSoxIrWav(params.settings, irPath);
    const body = fs.readFileSync(irPath);
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: body,
        ContentType: "audio/wav",
        CacheControl: "no-store",
      }),
    );
    return {
      fingerprint: voiceFxIrFingerprint(params.settings),
      bytes: body.byteLength,
    };
  } finally {
    try {
      fs.unlinkSync(irPath);
    } catch {
      /* */
    }
  }
}

export async function loadIrFromS3(params: {
  s3: S3Client;
  bucket: string;
  key: string;
}): Promise<Buffer | null> {
  try {
    const res = await params.s3.send(
      new GetObjectCommand({ Bucket: params.bucket, Key: params.key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes || bytes.byteLength < 100) return null;
    return Buffer.from(bytes);
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (
      err.name === "NoSuchKey" ||
      err.name === "NotFound" ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw e;
  }
}
