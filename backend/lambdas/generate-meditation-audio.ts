import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  siblingAacKey,
  siblingOpusKey,
  siblingWavKey,
} from "./_shared/background-audio-keys";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { parseBuffer } from "music-metadata";
import { loudnormMp3Buffer } from "./_shared/ffmpeg-loudnorm";
import {
  deriveLibraryMetadataFromClaude,
  fallbackLibraryMetadata,
} from "./_shared/meditation-library-metadata";
import { FIXED_SPEECH_PREVIEW_SPEED } from "./_shared/speaker-sample-speed";
import {
  GLOBAL_MEDITATION_USER_ID,
  meditationUserPk,
} from "./_shared/meditation-user-pk";
import { coerceClaudeModel, parseAnthropicMessageUsage } from "./_shared/anthropic-pricing";
import {
  recordClaudeUsage,
  recordFishTtsUsage,
} from "./_shared/ai-usage";
import { coerceMeditationTargetMinutes } from "./_shared/meditation-target-minutes";
import { sanitizeMeditationCreationProvenance } from "./_shared/meditation-creation-provenance";
import { estimateCoachChatTokensFromTranscript } from "./_shared/claude-coach-chat-estimate";
import { orpheusTtsWav } from "./_shared/orpheus-tts-client";
import {
  normalizeTtsProvider,
  type TtsProvider,
} from "./_shared/orpheus-voices";
import { buildMeditationScriptGenerationPrompt } from "./_shared/meditation-script-generate-prompt";
import {
  fishPauseTagStyleForModel,
  parseScriptIntoSegments,
  replacePauseMarkersWithFishNative,
  stripPauseMarkers as spokenPlainWithoutPauses,
  sumPauseMarkerSeconds,
  withSpokenMeditationTitleIntro,
} from "./_shared/script-pause-bands";
import {
  AAC_CONTENT_TYPE,
  AAC_ENCODER,
  AAC_EXTENSION,
  aacAdtsToMp3Buffer,
  bufferToAacM4a,
} from "./_shared/audio-aac";
import {
  getSpeechifyApiKey,
  MEDITATION_SPEECHIFY_EMOTION,
  speechifyRateToSsml,
  speechifyTtsMp3,
  type SpeechifyEmotionTag,
} from "./_shared/speechify-tts";
import {
  synthesizeSpeechifyPcmFxOla,
  type SpeechifyDryPcmChunk,
} from "./_shared/speechify-pcm-fx-ola";
import { VOICE_FX_PCM_SR } from "./_shared/voice-fx-ffmpeg-chain";
import { getVoiceSpeaker, loadPauseBandSeconds } from "./_shared/voice-admin";
import {
  VOICE_FX_WET_PRESET,
  clampVoiceFxDial,
  voiceFxDialGains,
} from "./_shared/voice-fx-dial";
import { applyCommittedVoiceFx } from "./_shared/voice-fx-apply";
import {
  createPromptFromProvenance,
  generateAndStoreMeditationCover,
} from "./_shared/meditation-cover";
import { scheduleIndexMeditation } from "./_shared/algolia-index-meditation";
import type { MeditationCreationProvenance } from "./_shared/meditation-creation-provenance";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
const FISH_TTS_MODEL =
  (process.env.FISH_TTS_MODEL || "s2.1-pro-free").trim() || "s2.1-pro-free";

/** Allowlisted Fish models for the create-audio quality toggle. */
function normalizeFishTtsModel(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "s1") return "s1";
  // UI “s2.1-pro” maps to the free tier already configured in prod.
  if (s === "s2.1-pro" || s === "s2.1-pro-free" || s === "") {
    return FISH_TTS_MODEL.includes("s2.1") ? FISH_TTS_MODEL : "s2.1-pro-free";
  }
  return FISH_TTS_MODEL;
}
/** Stretch named-band silence slightly at render (1 = as written). */
const PAUSE_RENDER_SCALE = 1.12;

/** Default: our ffmpeg silence chunks. Dev can opt into Fish qualitative tags. */
const DEFAULT_FISH_PAUSE_MODE: "native" | "segmented" = "segmented";

function normalizeFishPauseMode(raw: unknown): "native" | "segmented" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "native") return "native";
  if (s === "segmented") return "segmented";
  return DEFAULT_FISH_PAUSE_MODE;
}

/** Per speech-section + pipeline phase timings (dev flyover / analytics). */
export type GenerationSectionTiming = {
  i: number;
  ttsMs: number;
  fxMs?: number;
  /** Worker-side ffmpeg inside fxMs: loudnorm + the two format conversions. */
  fxFfmpegMs?: number;
  /** S3 put + VoiceFx invoke + S3 get, i.e. fxMs minus the local ffmpeg work. */
  fxInvokeMs?: number;
  /** Worker ffmpeg delay→afir (legacy field name; not Pedalboard). */
  fxBoardMs?: number;
  /** True when that section's FX Lambda had to start a fresh container. */
  fxColdStart?: boolean;
  utf8Bytes?: number;
  pauseSec?: number;
};

export type GenerationPhaseTimings = {
  /**
   * Job `createdAt` → worker handler entry (async Invoke lag + worker
   * cold start). Outside `workerMs`.
   */
  workerWaitMs?: number;
  /** Handler entry → library row written (or worker finish). */
  workerMs?: number;
  scriptMs?: number;
  metadataMs?: number;
  /** Sum of per-section TTS API waits (not wall when pipelined with FX). */
  ttsTotalMs?: number;
  /**
   * Speechify PCM path wall: FX load → TTS∥FX → OLA → AAC. When set, accounted
   * uses this instead of ttsTotal+fx+ola+aac (those overlap / nest).
   */
  ttsPipelineMs?: number;
  /** PCM path: load IR/settings before the TTS∥FX loop. */
  fxLoadMs?: number;
  /** PCM path: wall for TTS∥FX loop (excludes FX load, OLA, AAC). */
  ttsFxLoopMs?: number;
  concatMs?: number;
  /** Speechify PCM: float-bus finalize + dial mix. */
  olaMs?: number;
  /** Final 24 kHz PCM → AAC @ 44.1 kHz encode. */
  aacEncodeMs?: number;
  loudnormMs?: number;
  /** Full wet bounce wall (success). */
  fxMs?: number;
  /** Dev skipVoiceFx — bounce never started. */
  fxSkipped?: boolean;
  /** Bounce threw; see fxFailedMs. */
  fxFailed?: boolean;
  /** Wall spent in FX try before failure (when fxFailed). */
  fxFailedMs?: number;
  /** Worker mp3→wav before FX Lambda. */
  fxMp3ToWavMs?: number;
  /** Worker wav→mp3 after FX Lambda. */
  fxWavToMp3Ms?: number;
  /** Legacy: fxMp3ToWavMs + fxWavToMp3Ms (and old loudnorm-in-fx). */
  fxFfmpegMs?: number;
  /** S3 put of FX input. */
  fxS3PutMs?: number;
  /** FX apply wall in the worker (was VoiceFx Lambda invoke). */
  fxInvokeMs?: number;
  /** S3 get of FX wet+dry outputs. */
  fxS3GetMs?: number;
  /** ffmpeg delay→afir chain (legacy fxBoardMs name). */
  fxBoardMs?: number;
  fxColdStart?: boolean;
  /** encode+upload dry/wet AAC (.m4a) stems after bounce. */
  fxStemEncodeMs?: number;
  uploadMs?: number;
  /**
   * gpt-image cover wall (starts after metadata, overlaps voice build).
   * Full OpenAI call duration — not necessarily additive on the critical path.
   */
  coverMs?: number;
  /**
   * Residual wait for cover after audio upload (0 when cover finished during
   * voice). Used for accounted/gap; coverMs stays the full gen time for the flyout.
   */
  coverWaitMs?: number;
  /** Analytics/library Dynamo Put. */
  libraryWriteMs?: number;
  /** Sum of known in-worker phases (excludes workerWaitMs). */
  accountedMs?: number;
  /** workerMs − accountedMs (untimed gaps inside the handler). */
  gapMs?: number;
};

export type GenerationTimings = {
  phases: GenerationPhaseTimings;
  sections: GenerationSectionTiming[];
};

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
}

/** Roll up TTS total + accounted/gap after all phases are filled. */
function finalizeGenerationTimings(
  timings: GenerationTimings,
  workerStarted: number,
): void {
  const p = timings.phases;
  const ttsTotal = timings.sections.reduce(
    (sum, s) => sum + (Number.isFinite(s.ttsMs) ? s.ttsMs : 0),
    0,
  );
  if (ttsTotal > 0) p.ttsTotalMs = Math.round(ttsTotal);
  p.workerMs = elapsedMs(workerStarted);

  // PCM pipeline wall already includes TTS + overlapped FX + OLA + AAC.
  const pcmPipeline =
    typeof p.ttsPipelineMs === "number" &&
    Number.isFinite(p.ttsPipelineMs) &&
    p.ttsPipelineMs > 0;

  // Cover runs in parallel with voice; only residual wait is on the critical path.
  const coverOnCriticalPath =
    typeof p.coverWaitMs === "number" && Number.isFinite(p.coverWaitMs)
      ? p.coverWaitMs
      : p.coverMs;

  const internal = pcmPipeline
    ? [
        p.scriptMs,
        p.metadataMs,
        p.ttsPipelineMs,
        p.fxStemEncodeMs,
        p.uploadMs,
        coverOnCriticalPath,
        p.libraryWriteMs,
      ]
    : [
        p.scriptMs,
        p.metadataMs,
        p.ttsTotalMs,
        p.concatMs,
        p.loudnormMs,
        p.fxMs,
        p.fxFailedMs,
        p.fxStemEncodeMs,
        p.uploadMs,
        coverOnCriticalPath,
        p.libraryWriteMs,
      ];
  let accounted = 0;
  for (const n of internal) {
    if (typeof n === "number" && Number.isFinite(n) && n > 0) accounted += n;
  }
  p.accountedMs = Math.round(accounted);
  p.gapMs = Math.max(0, Math.round((p.workerMs ?? 0) - accounted));
}

/** Human labels for localhost create-audio Dev · toggles (flyover). */
function buildDevToggleLabels(params: {
  speechifyEmotionVariants?: boolean;
  skipVoiceFx?: boolean;
  skipSpeechifyLoudnorm?: boolean;
  speechifyRate?: number;
}): string[] {
  const labels: string[] = [];
  if (params.speechifyEmotionVariants === true) labels.push("×3 emotions");
  if (
    typeof params.speechifyRate === "number" &&
    Number.isFinite(params.speechifyRate)
  ) {
    const n = Math.round(params.speechifyRate);
    labels.push(`rate ${n > 0 ? "+" : ""}${n}%`);
  }
  if (params.skipVoiceFx === true) labels.push("skip FX");
  if (params.skipSpeechifyLoudnorm === true) {
    labels.push("no Speechify loudnorm");
  }
  return labels;
}

const secrets = new SecretsManagerClient({});
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const execFileAsync = promisify(execFile);

/**
 * Committed admin FX: compressed in → AAC out (no voice WAV encode).
 */
async function voiceFxWavViaS3(params: {
  audio: Buffer;
  inputFormat: "wav" | "mp3" | "aac" | "m4a";
  preset: string;
  bucket: string;
  jobId: string;
  tailPadSeconds?: number;
}): Promise<{
  /** AAC-in-MP4 FX stem */
  wav: Buffer;
  /** AAC-in-MP4 dry stem */
  dryWav: Buffer;
  format: "m4a";
  timings: {
    s3PutMs: number;
    invokeMs: number;
    s3GetMs: number;
    lambda?: Record<string, number>;
    coldStart?: boolean;
  };
}> {
  void params.preset;
  void params.jobId;
  void params.tailPadSeconds;
  const inputExt =
    params.inputFormat === "wav"
      ? ".wav"
      : params.inputFormat === "mp3"
        ? ".mp3"
        : params.inputFormat === "m4a"
          ? ".m4a"
          : ".aac";
  const invokeStarted = Date.now();
  const result = await applyCommittedVoiceFx({
    s3,
    bucket: params.bucket,
    dryAudio: params.audio,
    inputExt,
  });
  const invokeMs = elapsedMs(invokeStarted);
  return {
    wav: result.fxAudio,
    dryWav: result.dryAudio,
    format: "m4a",
    timings: {
      s3PutMs: 0,
      invokeMs,
      s3GetMs: 0,
      lambda: {
        irMs: result.timings.irMs,
        wetMs: result.timings.wetMs,
        mixMs: result.timings.mixMs,
        // Stored as fxBoardMs for older flyouts — this is ffmpeg afir, not Pedalboard.
        boardProcessMs: result.timings.totalMs,
      },
      coldStart: false,
    },
  };
}

/** Dial-bake two AAC stems → AAC (no WAV). */
async function mixDryWetAac(params: {
  dryAac: Buffer;
  wetAac: Buffer;
  dryGain: number;
  wetGain: number;
}): Promise<Buffer> {
  const id = randomUUID();
  const dryPath = `/tmp/mix-dry-${id}.m4a`;
  const wetPath = `/tmp/mix-wet-${id}.m4a`;
  const outPath = `/tmp/mix-out-${id}.m4a`;
  try {
    fs.writeFileSync(dryPath, params.dryAac);
    fs.writeFileSync(wetPath, params.wetAac);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      dryPath,
      "-i",
      wetPath,
      "-filter_complex",
      `[0:a]volume=${params.dryGain.toFixed(4)}[d];[1:a]volume=${params.wetGain.toFixed(4)}[w];[d][w]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0`,
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    for (const p of [dryPath, wetPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

/** ffmpeg-decode any compressed stem (AAC ADTS / m4a / mp3) → 44.1 kHz mono WAV. */
async function compressedToWavBuffer(
  buf: Buffer,
  inputExt: ".aac" | ".m4a" | ".mp3",
): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/fxwav-in-${id}${inputExt}`;
  const outPath = `/tmp/fxwav-out-${id}.wav`;
  try {
    fs.writeFileSync(inPath, buf);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inPath,
      "-ac",
      "1",
      "-ar",
      "44100",
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

function sniffCompressedExt(buf: Buffer): ".aac" | ".m4a" | ".mp3" {
  if (
    buf.length >= 8 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    return ".m4a";
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1]! & 0xf0) === 0xf0) {
    return ".aac";
  }
  return ".mp3";
}

async function loudnormThenVoiceFxMp3(params: {
  mp3: Buffer;
  preset: string;
  bucket: string;
  jobId: string;
  tailPadSeconds?: number;
}): Promise<{
  mp3: Buffer;
  ms: number;
  split: Pick<
    GenerationSectionTiming,
    "fxFfmpegMs" | "fxInvokeMs" | "fxBoardMs" | "fxColdStart"
  >;
}> {
  const started = Date.now();
  const loudStarted = Date.now();
  const loud = await loudnormMp3Buffer(params.mp3);
  const loudnormMs = elapsedMs(loudStarted);
  const fx = await voiceFxWavViaS3({
    audio: loud,
    inputFormat: "mp3",
    preset: params.preset,
    bucket: params.bucket,
    jobId: params.jobId,
    tailPadSeconds: params.tailPadSeconds,
  });
  // FX returns AAC; catalog path still wants MPEG for some callers.
  const toMp3Started = Date.now();
  const mp3 = await aacAdtsToMp3Buffer(fx.wav);
  const wavToMp3Ms = elapsedMs(toMp3Started);
  const split = {
    fxFfmpegMs: loudnormMs + wavToMp3Ms,
    fxInvokeMs:
      fx.timings.s3PutMs + fx.timings.invokeMs + fx.timings.s3GetMs,
    ...(fx.timings.lambda?.boardProcessMs != null
      ? { fxBoardMs: fx.timings.lambda.boardProcessMs }
      : {}),
    ...(fx.timings.coldStart != null ? { fxColdStart: fx.timings.coldStart } : {}),
  };
  console.log("voice-fx timing", {
    jobId: params.jobId,
    totalMs: elapsedMs(started),
    workerLoudnormMs: loudnormMs,
    workerMp3ToWavMs: mp3ToWavMs,
    workerWavToMp3Ms: wavToMp3Ms,
    ...fx.timings,
  });
  return { mp3, ms: elapsedMs(started), split };
}

async function mixDryWetMp3(params: {
  dryMp3: Buffer;
  wetWav: Buffer;
  dryGain: number;
  wetGain: number;
}): Promise<Buffer> {
  const id = randomUUID();
  const dryPath = `/tmp/mix-dry-${id}.mp3`;
  const wetPath = `/tmp/mix-wet-${id}.wav`;
  const outPath = `/tmp/mix-out-${id}.mp3`;
  try {
    fs.writeFileSync(dryPath, params.dryMp3);
    fs.writeFileSync(wetPath, params.wetWav);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      dryPath,
      "-i",
      wetPath,
      "-filter_complex",
      `[0:a]volume=${params.dryGain.toFixed(4)}[d];[1:a]volume=${params.wetGain.toFixed(4)}[w];[d][w]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0`,
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
    for (const p of [dryPath, wetPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

async function wavToMp3Buffer(wavBuf: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/voice-fx-${id}.wav`;
  const outPath = `/tmp/voice-fx-${id}.mp3`;
  try {
    fs.writeFileSync(inPath, wavBuf);
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

let cachedClaudeKey: string | undefined;
let cachedFishKey: string | undefined;
let cachedRunpodApiKey: string | undefined;
let cachedRunpodUpstreamUrl: string | undefined;

/** Duration for MP3 / AAC-ADTS / AAC-in-MP4 (post-FX stems are usually .m4a). */
async function getAudioDurationSeconds(buf: Buffer): Promise<number | null> {
  const ext = sniffCompressedExt(buf);
  const mimeType =
    ext === ".mp3" ? "audio/mpeg" : ext === ".m4a" ? "audio/mp4" : "audio/aac";
  try {
    const m = await parseBuffer(buf, { mimeType, size: buf.byteLength });
    const d = m.format.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
  } catch {
    /* fall through to ffprobe */
  }
  const id = randomUUID();
  const tmp = `/tmp/dur-${id}${ext}`;
  try {
    fs.writeFileSync(tmp, buf);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      tmp,
    ]);
    const d = Number(String(stdout).trim());
    if (Number.isFinite(d) && d > 0) return d;
  } catch {
    /* */
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* */
    }
  }
  return null;
}

function clampGain(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Same peak as ready-made soundscape listen level (0.75 × 0.67). */
const BED_GAIN_PEAK_VOLUME = 0.75 * 0.67;

/**
 * Mix speech (input 0) with one or more looped background beds.
 * Each layer gain is 0–100; mixer peak (100) matches default soundscape playback.
 */
async function mixSpeechWithBackgrounds(params: {
  speechBuf: Buffer;
  layers: { key: string; gain: number }[];
  durationSeconds: number | null;
  bucket: string;
  leadInSeconds?: number;
  fadeOut?: boolean;
}): Promise<Buffer> {
  const layers = params.layers.filter((l) => l.key?.trim());
  if (layers.length === 0) return params.speechBuf;
  if (!process.env.AWS_EXECUTION_ENV) {
    return params.speechBuf;
  }

  try {
    const id = randomUUID();
    const speechPath = `/tmp/speech-${id}.mp3`;
    const outPath = `/tmp/mix-${id}.mp3`;
    const bgPaths: string[] = [];

    fs.writeFileSync(speechPath, params.speechBuf);

    for (let i = 0; i < layers.length; i++) {
      // Beds are looped by `aloop` below, so prefer gapless Opus, then AAC,
      // then WAV master. No bed MP3.
      const requested = layers[i].key.trim();
      const candidates: { key: string; ext: string }[] = [];
      const opus = siblingOpusKey(requested);
      const aac = siblingAacKey(requested);
      const wav = siblingWavKey(requested);
      if (opus) candidates.push({ key: opus, ext: "opus" });
      if (aac) candidates.push({ key: aac, ext: "m4a" });
      if (wav) candidates.push({ key: wav, ext: "wav" });
      if (/\.m4a$/i.test(requested)) {
        candidates.push({ key: requested, ext: "m4a" });
      } else if (/\.wav$/i.test(requested)) {
        candidates.push({ key: requested, ext: "wav" });
      }

      let sourceKey: string | null = null;
      let ext = "m4a";
      for (const c of candidates) {
        try {
          await s3.send(
            new HeadObjectCommand({ Bucket: params.bucket, Key: c.key }),
          );
          sourceKey = c.key;
          ext = c.ext;
          break;
        } catch {
          /* try next */
        }
      }
      if (!sourceKey) {
        throw new Error(`Background bed missing (opus/aac/wav): ${requested}`);
      }
      const bgObj = await s3.send(
        new GetObjectCommand({
          Bucket: params.bucket,
          Key: sourceKey,
        }),
      );
      const bgBuf = Buffer.from(await bgObj.Body!.transformToByteArray());
      const p = `/tmp/bg-${id}-${i}.${ext}`;
      fs.writeFileSync(p, bgBuf);
      bgPaths.push(p);
    }

    const dur =
      params.durationSeconds && params.durationSeconds > 0
        ? params.durationSeconds
        : undefined;

    // Desired structure:
    // - background-only intro (leadInSeconds; default 1.5s for older jobs)
    // - speech starts after intro
    // - optional 8s tail after speech ends, with background fading out
    const introSeconds =
      typeof params.leadInSeconds === "number" &&
      Number.isFinite(params.leadInSeconds) &&
      params.leadInSeconds >= 0
        ? params.leadInSeconds
        : 1.5;
    const wantFadeOut = params.fadeOut !== false;
    const tailSeconds = wantFadeOut ? 8 : 0;
    const totalDurSeconds =
      dur !== undefined ? dur + introSeconds + tailSeconds : undefined;
    const bedFadeOut =
      wantFadeOut &&
      totalDurSeconds !== undefined &&
      totalDurSeconds > tailSeconds + 0.06
        ? `,afade=t=out:st=${Math.max(
            0,
            totalDurSeconds - tailSeconds,
          ).toFixed(2)}:d=${tailSeconds.toFixed(2)}`
        : "";

    const vols = layers.map((l) => (clampGain(l.gain) / 100) * BED_GAIN_PEAK_VOLUME);
    const chainParts: string[] = [];
    const bedLabels: string[] = [];

    for (let i = 0; i < layers.length; i++) {
      const inp = i + 1;
      const label = `b${i}`;
      bedLabels.push(`[${label}]`);
      chainParts.push(
        `[${inp}:a]aloop=loop=-1:size=2e+09,afade=t=in:st=0:d=0.03${bedFadeOut},volume=${vols[i].toFixed(4)}[${label}]`,
      );
    }

    let filter: string;
    if (layers.length === 1) {
      // Delay speech so background starts first.
      // If we know the duration, trim/pad the delayed speech so the mixed output can extend into the tail.
      // Keep speech at volume 1; beds are already scaled. normalize=0 so amix does not duck the voice.
      const speechChain =
        totalDurSeconds !== undefined
          ? `[0:a]volume=1.0,adelay=${(introSeconds * 1000).toFixed(0)}|${(
              introSeconds * 1000
            ).toFixed(0)},apad,atrim=0:${totalDurSeconds.toFixed(2)}[sp]`
          : `[0:a]volume=1.0,adelay=${(introSeconds * 1000).toFixed(0)}|${(
              introSeconds * 1000
            ).toFixed(0)}[sp]`;
      // Use a limiter on the final bus to prevent clipping without auto-attenuating beds.
      filter = `${chainParts.join(";")};${speechChain};[sp][b0]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95`;
    } else {
      const speechChain =
        totalDurSeconds !== undefined
          ? `[0:a]volume=1.0,adelay=${(introSeconds * 1000).toFixed(0)}|${(
              introSeconds * 1000
            ).toFixed(0)},apad,atrim=0:${totalDurSeconds.toFixed(2)}[sp]`
          : `[0:a]volume=1.0,adelay=${(introSeconds * 1000).toFixed(0)}|${(
              introSeconds * 1000
            ).toFixed(0)}[sp]`;
      // IMPORTANT: don't use amix normalize=1 — it ducks speech when beds are present.
      // Instead, mix at the intended per-layer volumes and apply a limiter.
      filter = `${chainParts.join(";")};${bedLabels.join("")}amix=inputs=${layers.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[bed];${speechChain};[sp][bed]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95`;
    }

    const args = ["-y", "-i", speechPath, ...bgPaths.flatMap((p) => ["-i", p]), "-filter_complex", filter];
    if (totalDurSeconds !== undefined) {
      args.push("-t", totalDurSeconds.toFixed(2));
    }
    args.push(outPath);

    await execFileAsync("ffmpeg", args);
    return fs.readFileSync(outPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ffmpeg mix failed";
    console.warn("background mix failed, returning dry speech", { msg });
    return params.speechBuf;
  }
}

async function getClaudeApiKey(): Promise<string> {
  if (cachedClaudeKey) return cachedClaudeKey;
  const arn = process.env.CLAUDE_SECRET_ARN;
  if (!arn) throw new Error("CLAUDE_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Claude API key secret is empty");
  cachedClaudeKey = s;
  return cachedClaudeKey;
}

async function getFishApiKey(): Promise<string> {
  if (cachedFishKey) return cachedFishKey;
  const arn = process.env.FISH_AUDIO_SECRET_ARN;
  if (!arn) throw new Error("FISH_AUDIO_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Fish Audio API key secret is empty");
  cachedFishKey = s;
  return cachedFishKey;
}

async function getRunpodApiKey(): Promise<string> {
  if (cachedRunpodApiKey) return cachedRunpodApiKey;
  const arn = process.env.RUNPODS_SECRET_ARN;
  if (!arn) throw new Error("RUNPODS_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("RunPod API key secret is empty");
  cachedRunpodApiKey = s;
  return cachedRunpodApiKey;
}

async function getRunpodUpstreamUrl(): Promise<string> {
  if (cachedRunpodUpstreamUrl) return cachedRunpodUpstreamUrl;
  const arn = process.env.RUNPODS_URL_SECRET_ARN;
  if (!arn) throw new Error("RUNPODS_URL_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("RunPod URL secret is empty");
  cachedRunpodUpstreamUrl = s;
  return cachedRunpodUpstreamUrl;
}

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

type Role = "user" | "assistant";
type ChatTurn = { role: Role; content: string };

async function generateScriptFromClaude(params: {
  apiKey: string;
  model: string;
  meditationStyle?: string;
  transcript: string;
  speechSpeed: number;
  journalMode: boolean;
  /** Guided length target (2, 5, 10, or 20 minutes); scales word targets. */
  targetMinutes: number;
  /** Experienced pacing — cued open sits (~1–2 min); same Length target. */
  longerBreaks?: boolean;
}): Promise<{
  script: string;
  usage: { input_tokens: number; output_tokens: number } | null;
}> {
  const prompt = buildMeditationScriptGenerationPrompt({
    transcript: params.transcript,
    meditationStyle: params.meditationStyle?.trim() ?? "",
    journalMode: params.journalMode,
    targetMinutes: params.targetMinutes,
    speechSpeed: params.speechSpeed,
    includeSegmentPlaceholders: false,
    longerBreaks: params.longerBreaks === true,
  });

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.userContent } satisfies ChatTurn],
    }),
  });

  const responseText = await upstream.text();
  if (!upstream.ok) {
    return Promise.reject(
      new Error(
        `Anthropic script generation failed: ${responseText.slice(
          0,
          2000,
        )}`,
      ),
    );
  }

  let parsed: { content?: Array<{ type?: string; text?: string }> };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return Promise.reject(new Error("Invalid response from Anthropic"));
  }

  const text = parsed.content?.find((c) => c?.type === "text")?.text?.trim() ?? "";
  if (!text) {
    return Promise.reject(new Error("Empty script returned by Anthropic"));
  }
  const usage = parseAnthropicMessageUsage(responseText);
  if (usage) {
    void recordClaudeUsage({
      model: params.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      feature: "meditation-script",
    });
  }
  return { script: text, usage };
}

/** Keep DynamoDB item under 400 KB (UTF-8 bytes, incl. other attributes). */
const MAX_SCRIPT_BYTES_FOR_LIBRARY = 320_000;

async function fishTtsMp3(params: {
  apiKey: string;
  text: string;
  reference_id: string;
  speed: number;
  /** Fish Audio model id (e.g. s2.1-pro-free, s1). */
  model: string;
}): Promise<Buffer> {
  const maxAttempts = 5;
  let lastErr: string | null = null;
  const model =
    typeof params.model === "string" && params.model.trim()
      ? params.model.trim()
      : FISH_TTS_MODEL;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const upstream = await fetch(FISH_TTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          model,
        },
        body: JSON.stringify({
          text: params.text,
          reference_id: params.reference_id,
          format: "mp3",
          latency: "normal",
          normalize: true,
          prosody: { speed: params.speed, normalize_loudness: true },
        }),
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        const msg = `Fish Audio request failed (attempt ${attempt}, status ${upstream.status}): ${detail.slice(
          0,
          2000,
        )}`;
        lastErr = msg;

        // Retry on transient failures (503/502/504/429).
        if ([429, 502, 503, 504].includes(upstream.status) && attempt < maxAttempts) {
          const retryAfter = upstream.headers.get("retry-after");
          const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
          const backoffMsBase = Number.isFinite(retryAfterMs) ? retryAfterMs : 750 * attempt * attempt;
          const backoffMs = Math.min(15_000, Math.max(250, backoffMsBase)) + Math.floor(Math.random() * 250);
          console.warn("Fish transient failure, retrying", {
            attempt,
            status: upstream.status,
            backoffMs,
          });
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        throw new Error(msg);
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      void recordFishTtsUsage({
        utf8Bytes: Buffer.byteLength(params.text, "utf8"),
        model,
        feature: "meditation-tts",
      });
      return buf;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(15_000, 750 * attempt * attempt) + Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }

  throw new Error(lastErr ?? "Fish Audio request failed");
}

async function synthesizeSegmentMp3(params: {
  provider: TtsProvider;
  fishApiKey?: string;
  speechifyApiKey?: string;
  speechifyRate?: string;
  /** Speechify only — default `calm` for meditation. */
  emotion?: SpeechifyEmotionTag | null;
  /** Speechify only — default true (~−14 LUFS). */
  speechifyLoudnessNormalization?: boolean;
  runpod?: { apiKey: string; upstreamUrl: string };
  text: string;
  voiceId: string;
  speed: number;
  fishTtsModel?: string;
}): Promise<Buffer> {
  if (params.provider === "fish") {
    if (!params.fishApiKey) throw new Error("Fish API key is not configured");
    return fishTtsMp3({
      apiKey: params.fishApiKey,
      text: params.text,
      reference_id: params.voiceId,
      speed: params.speed,
      model: params.fishTtsModel ?? FISH_TTS_MODEL,
    });
  }
  if (params.provider === "speechify") {
    if (!params.speechifyApiKey) {
      throw new Error("Speechify API key is not configured");
    }
    return speechifyTtsMp3({
      apiKey: params.speechifyApiKey,
      text: params.text,
      voiceId: params.voiceId,
      rate: params.speechifyRate,
      emotion: params.emotion ?? MEDITATION_SPEECHIFY_EMOTION,
      loudnessNormalization: params.speechifyLoudnessNormalization,
      // Chunk first (caller), then per-chunk sentence pauses in SSML.
      sentenceBreakMs: 777,
    });
  }
  if (!params.runpod) throw new Error("RunPod TTS is not configured");
  const wav = await orpheusTtsWav({
    apiKey: params.runpod.apiKey,
    upstreamUrl: params.runpod.upstreamUrl,
    text: params.text,
    voice: params.voiceId,
    speed: params.speed,
  });
  return wavToMp3Buffer(wav);
}

async function synthesizeScriptWithPauses(params: {
  provider: TtsProvider;
  fishApiKey?: string;
  speechifyApiKey?: string;
  speechifyRate?: string;
  /** Speechify only — default `calm` for meditation. */
  emotion?: SpeechifyEmotionTag | null;
  /** Speechify only — default true (~−14 LUFS). */
  speechifyLoudnessNormalization?: boolean;
  runpod?: { apiKey: string; upstreamUrl: string };
  script: string;
  voiceId: string;
  speed: number;
  fishTtsModel?: string;
  pauseBands?: Awaited<ReturnType<typeof loadPauseBandSeconds>>;
  /** Multiply band seconds at render (default PAUSE_RENDER_SCALE). */
  pauseScale?: number;
  /** When set, loudnorm + ffmpeg IR FX run once over the assembled track. */
  voiceFx?: { preset: string; bucket: string; jobId: string };
}): Promise<{
  audio: Buffer;
  utf8Bytes: number;
  voiceFxApplied: boolean;
  timings: Pick<GenerationTimings, "sections"> & {
    phases: Pick<
      GenerationPhaseTimings,
      "concatMs" | "fxMs" | "fxFfmpegMs" | "fxInvokeMs" | "fxBoardMs" | "fxColdStart"
    >;
  };
}> {
  const pauseScale = params.pauseScale ?? PAUSE_RENDER_SCALE;
  const segments = parseScriptIntoSegments(params.script, params.pauseBands);
  const ttsOpts = {
    fishTtsModel: params.fishTtsModel,
    speechifyApiKey: params.speechifyApiKey,
    speechifyRate: params.speechifyRate,
    emotion: params.emotion,
    speechifyLoudnessNormalization: params.speechifyLoudnessNormalization,
  };
  const voiceFx = params.voiceFx;
  const sectionTimings: GenerationSectionTiming[] = [];
  const fxPhase: Pick<
    GenerationPhaseTimings,
    "fxMs" | "fxFfmpegMs" | "fxInvokeMs" | "fxBoardMs" | "fxColdStart"
  > = {};

  /**
   * FX after the join only. Per-chunk FX cuts every reverb tail at the
   * segment edge; silence in the assembled stem is where those tails decay.
   * Uses in-worker ffmpeg echo→afir (committed IR), not Pedalboard.
   */
  async function applyVoiceFx(
    audio: Buffer,
    inputFormat: "mp3" | "aac" | "m4a",
  ): Promise<Buffer> {
    if (!voiceFx) return audio;
    if (inputFormat === "mp3") {
      const fx = await loudnormThenVoiceFxMp3({
        mp3: audio,
        preset: voiceFx.preset,
        bucket: voiceFx.bucket,
        jobId: `${voiceFx.jobId}-full`,
        tailPadSeconds: 2,
      });
      fxPhase.fxMs = fx.ms;
      Object.assign(fxPhase, fx.split);
      return fx.mp3;
    }
    // Speechify: already loudness-normalized — skip ffmpeg loudnorm.
    // AAC in → FX → AAC out (no WAV hop).
    const started = Date.now();
    const fx = await voiceFxWavViaS3({
      audio,
      inputFormat: inputFormat === "m4a" ? "m4a" : "aac",
      preset: voiceFx.preset,
      bucket: voiceFx.bucket,
      jobId: `${voiceFx.jobId}-full`,
      tailPadSeconds: 2,
    });
    const m4a = fx.wav;
    fxPhase.fxMs = elapsedMs(started);
    fxPhase.fxFfmpegMs = 0;
    fxPhase.fxInvokeMs =
      fx.timings.s3PutMs + fx.timings.invokeMs + fx.timings.s3GetMs;
    if (fx.timings.lambda?.boardProcessMs != null) {
      fxPhase.fxBoardMs = fx.timings.lambda.boardProcessMs;
    }
    if (fx.timings.coldStart != null) {
      fxPhase.fxColdStart = fx.timings.coldStart;
    }
    return m4a;
  }

  const speechify = params.provider === "speechify";

  if (segments.length === 0) {
    const clean = sanitizeScriptForTts(params.script);
    const ttsStarted = Date.now();
    let audio = await synthesizeSegmentMp3({
      provider: params.provider,
      fishApiKey: params.fishApiKey,
      runpod: params.runpod,
      text: clean,
      voiceId: params.voiceId,
      speed: params.speed,
      ...ttsOpts,
    });
    sectionTimings.push({
      i: 0,
      ttsMs: elapsedMs(ttsStarted),
      utf8Bytes: Buffer.byteLength(clean, "utf8"),
    });
    if (speechify) {
      // Keep Speechify AAC; remux ADTS → m4a for delivery when FX is skipped.
      audio = voiceFx
        ? await applyVoiceFx(audio, "aac")
        : await bufferToAacM4a(audio, ".aac");
    } else {
      audio = await applyVoiceFx(audio, "mp3");
    }
    return {
      audio,
      utf8Bytes: Buffer.byteLength(clean, "utf8"),
      voiceFxApplied: Boolean(voiceFx),
      timings: { sections: sectionTimings, phases: { ...fxPhase } },
    };
  }

  const id = randomUUID();
  const files: string[] = [];
  const speechPaths: string[] = [];
  let totalBytes = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const clean = sanitizeScriptForTts(seg.text);

    if (clean) {
      const utf8Bytes = Buffer.byteLength(clean, "utf8");
      totalBytes += utf8Bytes;

      const ttsStarted = Date.now();
      const segBuf = await synthesizeSegmentMp3({
        provider: params.provider,
        fishApiKey: params.fishApiKey,
        runpod: params.runpod,
        text: clean,
        voiceId: params.voiceId,
        speed: params.speed,
        ...ttsOpts,
      });
      sectionTimings.push({
        i: sectionTimings.length,
        ttsMs: elapsedMs(ttsStarted),
        utf8Bytes,
        pauseSec: seg.pauseSeconds > 0 ? seg.pauseSeconds * pauseScale : undefined,
      });
      // Speechify returns AAC-LC ADTS; Fish/Orpheus paths still return MP3.
      const segExt = params.provider === "speechify" ? "aac" : "mp3";
      const segPath = `/tmp/seg-${id}-${i}.${segExt}`;
      fs.writeFileSync(segPath, segBuf);
      files.push(segPath);
      speechPaths.push(segPath);
    }

    if (seg.pauseSeconds > 0) {
      // Speechify speech is AAC-LC ADTS @ 24 kHz — pauses must match (MP3
      // silence made concat demuxer drop speech into digital quiet).
      // Fish/Orpheus still use MP3 pauses.
      const pausePath = speechify
        ? `/tmp/pause-${id}-${i}.aac`
        : `/tmp/pause-${id}-${i}.mp3`;
      const pauseSec = (seg.pauseSeconds * pauseScale).toFixed(2);
      if (speechify) {
        await execFileAsync("ffmpeg", [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=mono:sample_rate=24000",
          "-t",
          pauseSec,
          "-c:a",
          "aac",
          "-b:a",
          "24k",
          "-f",
          "adts",
          pausePath,
        ]);
      } else {
        await execFileAsync("ffmpeg", [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=mono:sample_rate=44100",
          "-t",
          pauseSec,
          "-q:a",
          "9",
          "-acodec",
          "libmp3lame",
          pausePath,
        ]);
      }
      files.push(pausePath);
      if (!clean) {
        sectionTimings.push({
          i: sectionTimings.length,
          ttsMs: 0,
          utf8Bytes: 0,
          pauseSec: seg.pauseSeconds * pauseScale,
        });
      }
    }
  }

  if (files.length === 0) {
    const clean = sanitizeScriptForTts(params.script);
    const ttsStarted = Date.now();
    let audio = await synthesizeSegmentMp3({
      provider: params.provider,
      fishApiKey: params.fishApiKey,
      runpod: params.runpod,
      text: clean,
      voiceId: params.voiceId,
      speed: params.speed,
      ...ttsOpts,
    });
    sectionTimings.push({
      i: 0,
      ttsMs: elapsedMs(ttsStarted),
      utf8Bytes: Buffer.byteLength(clean, "utf8"),
    });
    if (speechify) {
      audio = voiceFx
        ? await applyVoiceFx(audio, "aac")
        : await bufferToAacM4a(audio, ".aac");
    } else {
      audio = await applyVoiceFx(audio, "mp3");
    }
    return {
      audio,
      utf8Bytes: Buffer.byteLength(clean, "utf8"),
      voiceFxApplied: Boolean(voiceFx),
      timings: { sections: sectionTimings, phases: { ...fxPhase } },
    };
  }

  if (files.length === 1) {
    let onlyBuf: Buffer = fs.readFileSync(files[0]!);
    if (speechify && files[0]!.endsWith(".aac")) {
      onlyBuf = voiceFx
        ? await applyVoiceFx(onlyBuf, "aac")
        : await bufferToAacM4a(onlyBuf, ".aac");
    } else {
      onlyBuf = await applyVoiceFx(onlyBuf, "mp3");
    }
    return {
      audio: onlyBuf,
      utf8Bytes: totalBytes,
      voiceFxApplied: Boolean(voiceFx),
      timings: { sections: sectionTimings, phases: { ...fxPhase } },
    };
  }

  // Speechify → AAC-in-MP4; Fish/Orpheus → MP3. One re-encode into a single
  // 44.1 kHz stem (Speechify speech + pauses are both AAC ADTS @ 24 kHz).
  const outPath = speechify
    ? `/tmp/concat-out-${id}${AAC_EXTENSION}`
    : `/tmp/concat-out-${id}.mp3`;

  const listPath = `/tmp/concat-${id}.txt`;
  fs.writeFileSync(
    listPath,
    files.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );

  const concatStarted = Date.now();
  const speechBytes = speechPaths.reduce(
    (n, p) => n + fs.statSync(p).size,
    0,
  );
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-ac",
    "1",
    "-ar",
    "44100",
    ...(speechify
      ? (["-c:a", AAC_ENCODER, "-b:a", "160k"] as const)
      : (["-c:a", "libmp3lame", "-q:a", "2"] as const)),
    outPath,
  ]);
  const concatMs = elapsedMs(concatStarted);

  const joined = fs.readFileSync(outPath);
  // Joined stem must retain most of the speech payload. Silence-compressed
  // AAC for a multi-minute sit is ~20–40KB; real speech is far larger.
  if (
    speechify &&
    speechPaths.length > 0 &&
    joined.byteLength < Math.max(12_000, Math.floor(speechBytes * 0.35))
  ) {
    throw new Error(
      `Speechify concat produced suspiciously small audio (${joined.byteLength} bytes from ${speechBytes} speech-segment bytes, ${files.length} parts)`,
    );
  }
  console.log("TTS concat", {
    provider: params.provider,
    parts: files.length,
    speechSegments: speechPaths.length,
    speechBytes,
    joinedBytes: joined.byteLength,
    concatMs,
  });
  const outBuf = await applyVoiceFx(joined, speechify ? "m4a" : "mp3");
  return {
    audio: outBuf,
    utf8Bytes: totalBytes,
    voiceFxApplied: Boolean(voiceFx),
    timings: {
      sections: sectionTimings,
      phases: { concatMs, ...fxPhase },
    },
  };
}

/**
 * Single Fish TTS request: convert `[[PAUSE …]]` → Fish qualitative tags
 * (`[break]` / `[short pause]` / `[long pause]` / `[long-break]`), synthesize
 * the whole script, then one loudnorm + ffmpeg IR FX pass. No ffmpeg segmentation.
 */
async function synthesizeScriptWithFishNativePauses(params: {
  fishApiKey: string;
  script: string;
  voiceId: string;
  speed: number;
  fishTtsModel?: string;
  pauseBands?: Awaited<ReturnType<typeof loadPauseBandSeconds>>;
  pauseScale?: number;
  voiceFx?: { preset: string; bucket: string; jobId: string };
}): Promise<{
  audio: Buffer;
  utf8Bytes: number;
  voiceFxApplied: boolean;
  timings: Pick<GenerationTimings, "sections"> & {
    phases: Pick<
      GenerationPhaseTimings,
      "concatMs" | "fxMs" | "fxFfmpegMs" | "fxInvokeMs" | "fxBoardMs" | "fxColdStart"
    >;
  };
}> {
  const style = fishPauseTagStyleForModel(params.fishTtsModel);
  const withFishPauses = replacePauseMarkersWithFishNative(
    params.script,
    style,
    params.pauseBands,
    params.pauseScale ?? 1,
  );
  const clean = sanitizeScriptForTts(withFishPauses);
  const utf8Bytes = Buffer.byteLength(clean, "utf8");
  const sectionTimings: GenerationSectionTiming[] = [];
  const fxPhase: Pick<
    GenerationPhaseTimings,
    "fxMs" | "fxFfmpegMs" | "fxInvokeMs" | "fxBoardMs" | "fxColdStart"
  > = {};

  const ttsStarted = Date.now();
  let audio = await fishTtsMp3({
    apiKey: params.fishApiKey,
    text: clean,
    reference_id: params.voiceId,
    speed: params.speed,
    model: params.fishTtsModel ?? FISH_TTS_MODEL,
  });
  sectionTimings.push({
    i: 0,
    ttsMs: elapsedMs(ttsStarted),
    utf8Bytes,
  });

  if (params.voiceFx) {
    const fx = await loudnormThenVoiceFxMp3({
      mp3: audio,
      preset: params.voiceFx.preset,
      bucket: params.voiceFx.bucket,
      jobId: `${params.voiceFx.jobId}-full`,
      tailPadSeconds: 2,
    });
    fxPhase.fxMs = fx.ms;
    Object.assign(fxPhase, fx.split);
    audio = fx.mp3;
  }

  return {
    audio,
    utf8Bytes,
    voiceFxApplied: Boolean(params.voiceFx),
    timings: { sections: sectionTimings, phases: { ...fxPhase } },
  };
}

function sanitizeScriptForTts(markdown: string): string {
  let t = markdown ?? "";
  // Normalize newlines.
  t = t.replace(/\r\n/g, "\n");

  // Strip markdown heading markers like "# Title" (remove only prefix, keep the title).
  t = t.replace(/^\s*#{1,6}\s+/gm, "");

  // Convert bold **text** -> text (single-line only).
  t = t.replace(/\*\*([^\n*]+)\*\*/g, "$1");
  // Convert italics *text* -> text (single-line only).
  t = t.replace(/\*([^\n*]+)\*/g, "$1");

  // Remove any leftover literal delimiters that Fish would otherwise speak.
  t = t.replace(/[*#]/g, "");

  // Cleanup whitespace around lines; keep [pause] cues intact.
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

type JobBody = {
  jobId: string;
  transcript?: string;
  meditationStyle?: string;
  scriptText?: string;
  referenceId: string;
  backgroundSoundKey?: string;
};

async function markJobFailed(jobId: string, errorMessage: string): Promise<void> {
  const jobsTableName = process.env.MEDITATION_JOBS_TABLE_NAME;
  if (!jobsTableName) return;
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: jobsTableName,
        Key: { jobId },
        UpdateExpression:
          "SET #status = :s, errorMessage = :e, updatedAt = :u",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":s": "failed",
          ":e": errorMessage,
          ":u": new Date().toISOString(),
        },
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "job failure update failed";
    console.warn("markJobFailed update failed", { jobId, msg });
  }
}

export async function handler(event: JobBody): Promise<APIGatewayProxyStructuredResultV2> {
  const workerStarted = Date.now();
  console.log("meditation-audio worker start", {
    jobId: event.jobId,
    workerStartedAt: new Date(workerStarted).toISOString(),
  });

  const jobsTableName = process.env.MEDITATION_JOBS_TABLE_NAME;
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;
  const mediaCloudFrontDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN;
  const analyticsTableName = process.env.MEDITATION_ANALYTICS_TABLE_NAME;
  if (!jobsTableName || !mediaBucketName || !mediaCloudFrontDomain || !analyticsTableName) {
    console.error("Missing required environment");
    return json(500, { error: "Worker not configured" });
  }

  // Load full job record from Dynamo so the worker doesn't depend on the invoke payload.
  type JobItem = {
    jobId: string;
    userId?: string;
    createdAt?: string;
    transcript?: string;
    meditationStyle?: string;
    journalMode?: boolean;
    meditationTargetMinutes?: number;
    claudeModel?: string;
    scriptText?: string;
    referenceId?: string;
    ttsProvider?: TtsProvider;
    fishTtsModel?: string;
    fishPauseMode?: "native" | "segmented";
    speed?: number;
    voiceFxPreset?: string;
    voiceFxDial?: number;
    backgroundSoundKey?: string;
    backgroundNatureKey?: string;
    backgroundMusicKey?: string;
    backgroundDrumsKey?: string;
    backgroundNoiseKey?: string;
    backgroundNatureGain?: number;
    backgroundMusicGain?: number;
    backgroundDrumsGain?: number;
    backgroundNoiseGain?: number;
    excludeFromLibrary?: boolean;
    lifeAreaId?: string;
    creationProvenance?: unknown;
    /** Experienced pacing — cued open sits (~1–2 min); same Length target. */
    longerBreaks?: boolean;
    /** Dev: also render Speechify warm + calm emotion stems (serial). */
    speechifyEmotionVariants?: boolean;
    /** Dev: skip wet Voice FX bounce entirely (dry stem only). */
    skipVoiceFx?: boolean;
    /** Dev: disable Speechify API loudness_normalization (raw volume A/B). */
    skipSpeechifyLoudnorm?: boolean;
    /** Dev override for Speechify SSML rate percent (admin voice when omitted). */
    speechifyRate?: number;
  };

  let jobItem: JobItem | null = null;
  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: jobsTableName,
        Key: { jobId: event.jobId },
      }),
    );
    jobItem = (out.Item as JobItem) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "job lookup failed";
    console.error("job lookup failed", { jobId: event.jobId, msg });
    await markJobFailed(event.jobId, msg);
    return json(500, { error: msg });
  }

  if (!jobItem) {
    const msg = "Job not found";
    console.error("job missing", { jobId: event.jobId });
    await markJobFailed(event.jobId, msg);
    return json(404, { error: msg });
  }

  const jobUserId =
    typeof jobItem.userId === "string" && jobItem.userId.trim()
      ? jobItem.userId.trim()
      : GLOBAL_MEDITATION_USER_ID;
  const jobUserEmail =
    typeof jobItem.email === "string" && jobItem.email.trim()
      ? jobItem.email.trim().toLowerCase()
      : undefined;

  const body: {
    transcript?: string;
    meditationStyle?: string;
    journalMode?: boolean;
    excludeFromLibrary?: boolean;
    lifeAreaId?: string;
    meditationTargetMinutes?: number;
    claudeModel?: string;
    scriptText?: string;
    reference_id?: string;
    ttsProvider?: TtsProvider;
    fishTtsModel?: string;
    fishPauseMode?: "native" | "segmented";
    speed?: number;
    voiceFxPreset?: string;
    voiceFxDial?: number;
    backgroundSoundKey?: string;
    backgroundNatureKey?: string;
    backgroundMusicKey?: string;
    backgroundDrumsKey?: string;
    backgroundNoiseKey?: string;
    backgroundNatureGain?: number;
    backgroundMusicGain?: number;
    backgroundDrumsGain?: number;
    backgroundNoiseGain?: number;
    longerBreaks?: boolean;
    speechifyEmotionVariants?: boolean;
    skipVoiceFx?: boolean;
    skipSpeechifyLoudnorm?: boolean;
    speechifyRate?: number;
  } = {
    transcript: jobItem.transcript,
    meditationStyle: jobItem.meditationStyle,
    journalMode: jobItem.journalMode,
    excludeFromLibrary: jobItem.excludeFromLibrary,
    lifeAreaId: jobItem.lifeAreaId,
    meditationTargetMinutes: jobItem.meditationTargetMinutes,
    claudeModel: jobItem.claudeModel,
    scriptText: jobItem.scriptText,
    reference_id: jobItem.referenceId,
    ttsProvider: jobItem.ttsProvider,
    fishTtsModel: jobItem.fishTtsModel,
    fishPauseMode: jobItem.fishPauseMode,
    speed: jobItem.speed,
    voiceFxPreset: jobItem.voiceFxPreset,
    voiceFxDial: jobItem.voiceFxDial,
    backgroundSoundKey: jobItem.backgroundSoundKey,
    backgroundNatureKey: jobItem.backgroundNatureKey,
    backgroundMusicKey: jobItem.backgroundMusicKey,
    backgroundDrumsKey: jobItem.backgroundDrumsKey,
    backgroundNoiseKey: jobItem.backgroundNoiseKey,
    backgroundNatureGain: jobItem.backgroundNatureGain,
    backgroundMusicGain: jobItem.backgroundMusicGain,
    backgroundDrumsGain: jobItem.backgroundDrumsGain,
    backgroundNoiseGain: jobItem.backgroundNoiseGain,
    longerBreaks: jobItem.longerBreaks === true,
    speechifyEmotionVariants: jobItem.speechifyEmotionVariants === true,
    skipVoiceFx: jobItem.skipVoiceFx === true,
    skipSpeechifyLoudnorm: jobItem.skipSpeechifyLoudnorm === true,
    ...(typeof jobItem.speechifyRate === "number" &&
    Number.isFinite(jobItem.speechifyRate)
      ? {
          speechifyRate: Math.max(
            -50,
            Math.min(50, Math.round(jobItem.speechifyRate)),
          ),
        }
      : {}),
  };

  const requestedProvider = normalizeTtsProvider(
    body.ttsProvider ?? jobItem.ttsProvider,
  );
  const fishTtsModel = normalizeFishTtsModel(body.fishTtsModel);

  const referenceId =
    typeof body.reference_id === "string" && body.reference_id.trim()
      ? body.reference_id.trim()
      : "";
  const speaker = await getVoiceSpeaker(referenceId);
  const ttsProvider =
    speaker?.brand === "speechify"
      ? "speechify"
      : requestedProvider === "orpheus"
        ? "orpheus"
        : "fish";
  if (!referenceId) {
    const msg =
      ttsProvider === "orpheus"
        ? "`reference_id` (Orpheus voice id) is required"
        : ttsProvider === "speechify"
          ? "`reference_id` (Speechify voice id) is required"
          : "`reference_id` (Fish voice model id) is required";
    console.error("job missing referenceId", { jobId: event.jobId, ttsProvider });
    await markJobFailed(event.jobId, msg);
    return json(400, { error: msg });
  }

  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  const meditationStyle =
    typeof body.meditationStyle === "string" ? body.meditationStyle : "";
  const journalModeFromJob = body.journalMode === true;
  const excludeFromLibrary = body.excludeFromLibrary === true;
  const lifeAreaId =
    typeof body.lifeAreaId === "string" && body.lifeAreaId.trim()
      ? body.lifeAreaId.trim().slice(0, 128)
      : undefined;
  const creationProvenance = sanitizeMeditationCreationProvenance(
    jobItem.creationProvenance,
  );
  /** Dev A/B from the create flow; unsupported ids fall back to Haiku. */
  const claudeModel = coerceClaudeModel(body.claudeModel);
  const targetMinutes = coerceMeditationTargetMinutes(
    body.meditationTargetMinutes,
  );
  const longerBreaks = body.longerBreaks === true;
  const pauseRenderScale = PAUSE_RENDER_SCALE;
  const styleTrimmed = meditationStyle.trim();
  const isJournalCatalog =
    journalModeFromJob ||
    !styleTrimmed ||
    styleTrimmed.toLowerCase() === "general";
  const scriptText =
    typeof body.scriptText === "string" ? body.scriptText.trim() : "";
  const speechSpeed = FIXED_SPEECH_PREVIEW_SPEED;
  const voiceFxPreset =
    typeof body.voiceFxPreset === "string" && body.voiceFxPreset.trim().length > 0
      ? body.voiceFxPreset.trim()
      : "";
  const voiceFxDial = clampVoiceFxDial(body.voiceFxDial);
  const backgroundSoundKey =
    typeof body.backgroundSoundKey === "string" &&
    body.backgroundSoundKey.trim().length > 0
      ? body.backgroundSoundKey.trim()
      : "";

  const trimKey = (k: unknown) =>
    typeof k === "string" && k.trim().length > 0 ? k.trim() : "";

  const layeredBackground: { key: string; gain: number }[] = [];
  const nk = trimKey(body.backgroundNatureKey);
  if (nk) {
    layeredBackground.push({
      key: nk,
      gain: clampGain(
        typeof body.backgroundNatureGain === "number"
          ? body.backgroundNatureGain
          : 25,
      ),
    });
  }
  const mk = trimKey(body.backgroundMusicKey);
  if (mk) {
    layeredBackground.push({
      key: mk,
      gain: clampGain(
        typeof body.backgroundMusicGain === "number"
          ? body.backgroundMusicGain
          : 70,
      ),
    });
  }
  const dk = trimKey(body.backgroundDrumsKey);
  if (dk) {
    layeredBackground.push({
      key: dk,
      gain: clampGain(
        typeof body.backgroundDrumsGain === "number"
          ? body.backgroundDrumsGain
          : 55,
      ),
    });
  }
  const zk = trimKey(body.backgroundNoiseKey);
  if (zk) {
    layeredBackground.push({
      key: zk,
      gain: clampGain(
        typeof body.backgroundNoiseGain === "number"
          ? body.backgroundNoiseGain
          : 10,
      ),
    });
  }

  const backgroundLayers =
    layeredBackground.length > 0
      ? layeredBackground
      : backgroundSoundKey
        ? [{ key: backgroundSoundKey, gain: 100 }]
        : [];

  console.log("inputs", {
    transcriptChars: transcript.length,
    meditationStylePresent: Boolean(meditationStyle?.trim()),
    scriptTextChars: scriptText.length,
    reference_id: referenceId,
    ttsProvider,
    speechSpeed,
    backgroundLayerCount: backgroundLayers.length,
  });


  let scriptTextUsed = scriptText;
  const shouldGenerateScript = !scriptTextUsed;
  let claudeWorkerInputTokens = 0;
  let claudeWorkerOutputTokens = 0;
  const generationTimings: GenerationTimings = { phases: {}, sections: [] };
  {
    const jobCreatedAt =
      typeof jobItem.createdAt === "string" && jobItem.createdAt.trim()
        ? jobItem.createdAt.trim()
        : null;
    const jobCreatedMs = jobCreatedAt ? Date.parse(jobCreatedAt) : NaN;
    if (Number.isFinite(jobCreatedMs) && jobCreatedMs > 0) {
      generationTimings.phases.workerWaitMs = Math.max(
        0,
        workerStarted - jobCreatedMs,
      );
      console.log("worker wait (job create → handler)", {
        workerWaitMs: generationTimings.phases.workerWaitMs,
        jobCreatedAt,
      });
    }
  }
  try {
    if (shouldGenerateScript) {
      console.log("generating script from Claude", {
        meditationStylePresent: Boolean(meditationStyle?.trim()),
        targetMinutes,
        longerBreaks,
      });
      const scriptStarted = Date.now();
      const claudeKey = await getClaudeApiKey();
      const gen = await generateScriptFromClaude({
        apiKey: claudeKey,
        model: claudeModel,
        meditationStyle,
        transcript,
        speechSpeed,
        journalMode: journalModeFromJob,
        targetMinutes,
        longerBreaks,
      });
      scriptTextUsed = gen.script;
      generationTimings.phases.scriptMs = elapsedMs(scriptStarted);
      if (gen.usage) {
        claudeWorkerInputTokens += gen.usage.input_tokens;
        claudeWorkerOutputTokens += gen.usage.output_tokens;
      }
      console.log("generated script", {
        chars: scriptTextUsed.length,
        targetMinutes,
        longerBreaks,
        scriptMs: generationTimings.phases.scriptMs,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Script generation failed";
    console.error("script generation failed", { msg });
    await markJobFailed(event.jobId, msg);
    return json(500, { error: msg });
  }

  if (!scriptTextUsed) {
    return json(500, { error: "No script text available to synthesize" });
  }

  // Persist script early so the Library placeholder can show title/description before audio finishes.
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: jobsTableName,
        Key: { jobId: event.jobId },
        UpdateExpression:
          "SET #status = :s, scriptTextUsed = :t, updatedAt = :u REMOVE errorMessage",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":s": "running",
          ":t": scriptTextUsed,
          ":u": new Date().toISOString(),
        },
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "job early script update failed";
    console.warn("job early script update failed", { jobId: event.jobId, msg });
  }

  // Derive library metadata as early as possible (script is ready; audio may take much longer).
  // This is best-effort and must not fail the job.
  let libraryTitle: string;
  let libraryMeditationType: string;
  let libraryDescription: string;
  try {
    const metadataStarted = Date.now();
    const claudeKey = await getClaudeApiKey();
    const createIntent = createPromptFromProvenance(creationProvenance);
    const derived = await deriveLibraryMetadataFromClaude({
      apiKey: claudeKey,
      model: claudeModel,
      meditationStyle,
      transcript,
      scriptPreview: scriptTextUsed,
      journalMode: isJournalCatalog,
      createIntent,
    });
    generationTimings.phases.metadataMs = elapsedMs(metadataStarted);
    libraryTitle = derived.title;
    libraryMeditationType = derived.meditationType;
    libraryDescription = derived.description;
    if (derived.claudeUsage) {
      claudeWorkerInputTokens += derived.claudeUsage.input_tokens;
      claudeWorkerOutputTokens += derived.claudeUsage.output_tokens;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "metadata derive failed";
    console.warn("early library metadata derive failed, using fallback", { msg });
    const fb = fallbackLibraryMetadata({
      meditationStyle,
      transcript,
      scriptPreview: scriptTextUsed,
      journalMode: isJournalCatalog,
      createIntent: createPromptFromProvenance(creationProvenance),
    });
    libraryTitle = fb.title;
    libraryMeditationType = fb.meditationType;
    libraryDescription = fb.description;
  }

  let claudeChatEstInputTokens: number | null = null;
  let claudeChatEstOutputTokens: number | null = null;
  try {
    const ck = await getClaudeApiKey();
    const est = await estimateCoachChatTokensFromTranscript({
      apiKey: ck,
      model: claudeModel,
      meditationStyle,
      transcript,
      journalMode: journalModeFromJob,
    });
    if (est) {
      claudeChatEstInputTokens = est.inputTokens;
      claudeChatEstOutputTokens = est.outputTokens;
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.warn("coach chat Claude token estimate skipped", { m });
  }

  // Persist derived metadata early so the Library placeholder can populate quickly.
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: jobsTableName,
        Key: { jobId: event.jobId },
        UpdateExpression: "SET title = :title, description = :desc, updatedAt = :u",
        ExpressionAttributeValues: {
          ":title": libraryTitle,
          ":desc": libraryDescription,
          ":u": new Date().toISOString(),
        },
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "job metadata update failed";
    console.warn("job metadata update failed", { jobId: event.jobId, msg });
  }

  // Cover needs title/description only — start now so gpt-image overlaps TTS/FX.
  const libraryMeditationId = randomUUID();
  const coverBucket = mediaBucketName;
  const coverPromise: Promise<string | null> =
    !excludeFromLibrary && coverBucket
      ? (async () => {
          const coverStarted = Date.now();
          try {
            return await generateAndStoreMeditationCover({
              s3,
              bucket: coverBucket,
              userId: jobUserId,
              meditationId: libraryMeditationId,
              input: {
                title: libraryTitle,
                description: libraryDescription,
                meditationStyle: isJournalCatalog ? null : styleTrimmed || null,
                meditationType: libraryMeditationType,
                createPrompt: createPromptFromProvenance(creationProvenance),
              },
            });
          } finally {
            generationTimings.phases.coverMs = elapsedMs(coverStarted);
          }
        })()
      : Promise.resolve(null);
  /** Await in-flight cover on failure paths so Lambda does not stall on exit. */
  const drainCover = async () => {
    try {
      await coverPromise;
    } catch {
      /* generateAndStoreMeditationCover already best-effort */
    }
  };

  let fishKey: string | undefined;
  let speechifyKey: string | undefined;
  const speechifyLoudnessNormalization = body.skipSpeechifyLoudnorm !== true;
  const speechifyRate = speechifyRateToSsml(
    typeof body.speechifyRate === "number" && Number.isFinite(body.speechifyRate)
      ? body.speechifyRate
      : speaker?.speechifyRate,
  );
  let runpodCreds: { apiKey: string; upstreamUrl: string } | undefined;
  try {
    if (ttsProvider === "orpheus") {
      runpodCreds = {
        apiKey: await getRunpodApiKey(),
        upstreamUrl: await getRunpodUpstreamUrl(),
      };
    } else if (ttsProvider === "speechify") {
      speechifyKey = await getSpeechifyApiKey();
    } else {
      fishKey = await getFishApiKey();
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : ttsProvider === "orpheus"
          ? "RunPod secret lookup failed"
          : ttsProvider === "speechify"
            ? "Speechify secret lookup failed"
            : "Fish secret lookup failed";
    console.error("tts secret lookup failed", { msg, ttsProvider });
    await markJobFailed(event.jobId, msg);
    await drainCover();
    return json(500, { error: msg });
  }

  let mp3Buf: Buffer;
  let voiceFxApplied = false;
  let scriptUtf8Bytes = 0;
  let pauseSecondsTotal = 0;
  let spokenUtf8Bytes = 0;
  let spokenWordCount = 0;
  /** Speechify PCM pipeline: dry chunks archived async (not served). */
  let dryPcmChunks: SpeechifyDryPcmChunk[] = [];
  let speechifyPcmPipeline = false;
  try {
    // Spoken title after a short lead-in, then a beat before the script body.
    const ttsScript = withSpokenMeditationTitleIntro(
      scriptTextUsed,
      libraryTitle,
    );
    const pauseBands = await loadPauseBandSeconds().catch(() => undefined);
    const spokenPlain = spokenPlainWithoutPauses(ttsScript);
    spokenUtf8Bytes = Buffer.byteLength(spokenPlain, "utf8");
    spokenWordCount = spokenPlain
      ? spokenPlain.split(/\s+/).filter(Boolean).length
      : 0;

    pauseSecondsTotal =
      sumPauseMarkerSeconds(ttsScript, pauseBands) * pauseRenderScale;

    const skipVoiceFxEarly =
      body.skipVoiceFx === true ||
      (ttsProvider === "speechify" && body.skipSpeechifyLoudnorm === true);

    // Speechify: pcm_24000 → per-segment FX → OLA → AAC (dial baked).
    if (ttsProvider === "speechify" && speechifyKey) {
      speechifyPcmPipeline = true;
      console.log("calling Speechify PCM + per-segment FX OLA", {
        reference_id: referenceId,
        applyFx: !skipVoiceFxEarly,
        voiceFxDial,
        pauseRenderScale,
      });
      const result = await synthesizeSpeechifyPcmFxOla({
        s3,
        bucket: mediaBucketName,
        apiKey: speechifyKey,
        script: ttsScript,
        voiceId: referenceId,
        speechifyRate,
        speechifyLoudnessNormalization,
        emotion: MEDITATION_SPEECHIFY_EMOTION,
        pauseBands,
        pauseScale: pauseRenderScale,
        applyFx: !skipVoiceFxEarly,
        voiceFxDial,
      });
      mp3Buf = result.deliveryAac;
      dryPcmChunks = result.dryChunks;
      voiceFxApplied = result.voiceFxApplied;
      scriptUtf8Bytes = result.utf8Bytes;
      generationTimings.sections = result.timings.sections;
      Object.assign(generationTimings.phases, result.timings.phases);
      if (skipVoiceFxEarly) {
        generationTimings.phases.fxSkipped = true;
      }
      console.log("TTS+FX PCM OLA success", {
        bytes: mp3Buf.byteLength,
        dryChunks: dryPcmChunks.length,
        voiceFxApplied,
        ttsPipelineMs: generationTimings.phases.ttsPipelineMs,
        fxLoadMs: generationTimings.phases.fxLoadMs,
        ttsFxLoopMs: generationTimings.phases.ttsFxLoopMs,
        ttsTotalMs: generationTimings.sections.reduce(
          (s, x) => s + (x.ttsMs || 0),
          0,
        ),
        fxMs: generationTimings.phases.fxMs,
        olaMs: generationTimings.phases.olaMs,
        aacEncodeMs: generationTimings.phases.aacEncodeMs,
      });
    } else {
      const fishPauseMode = normalizeFishPauseMode(jobItem.fishPauseMode);
      const useFishNative =
        !longerBreaks &&
        fishPauseMode === "native" &&
        ttsProvider === "fish" &&
        Boolean(fishKey);

      let audio: Buffer;
      let utf8Bytes: number;
      let synthTimings: Awaited<
        ReturnType<typeof synthesizeScriptWithPauses>
      >["timings"];

      if (useFishNative) {
        console.log("calling TTS with Fish-native pauses (single request)", {
          reference_id: referenceId,
          ttsProvider,
          fishTtsModel,
          pauseTagStyle: fishPauseTagStyleForModel(fishTtsModel),
          fishPauseMode,
          pauseSecondsTotal,
        });
        const result = await synthesizeScriptWithFishNativePauses({
          fishApiKey: fishKey!,
          script: ttsScript,
          voiceId: referenceId,
          speed: speechSpeed,
          fishTtsModel,
          pauseBands,
          pauseScale: pauseRenderScale,
        });
        audio = result.audio;
        utf8Bytes = result.utf8Bytes;
        voiceFxApplied = false;
        synthTimings = result.timings;
      } else {
        console.log("calling TTS with pause-aware synthesis", {
          reference_id: referenceId,
          ttsProvider,
          fishTtsModel,
          longerBreaks,
          pauseRenderScale,
        });
        const result = await synthesizeScriptWithPauses({
          provider: ttsProvider,
          fishApiKey: fishKey,
          speechifyApiKey: speechifyKey,
          speechifyRate,
          speechifyLoudnessNormalization,
          emotion: MEDITATION_SPEECHIFY_EMOTION,
          runpod: runpodCreds,
          script: ttsScript,
          voiceId: referenceId,
          speed: speechSpeed,
          fishTtsModel,
          pauseBands,
          pauseScale: pauseRenderScale,
        });
        audio = result.audio;
        utf8Bytes = result.utf8Bytes;
        voiceFxApplied = false;
        synthTimings = result.timings;
      }

      generationTimings.sections = synthTimings.sections;
      Object.assign(generationTimings.phases, synthTimings.phases);
      mp3Buf = audio;
      scriptUtf8Bytes = utf8Bytes;
      console.log("TTS success", {
        bytes: mp3Buf.byteLength,
        ttsProvider,
        voiceFxApplied,
        path: useFishNative ? "fish-native-pauses" : "segmented-pauses",
      });
      if (!voiceFxApplied) {
        try {
          mp3Buf = await loudnormMp3Buffer(mp3Buf);
          console.log("loudnorm -16 LUFS applied to speech", {
            bytes: mp3Buf.byteLength,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "loudnorm failed";
          console.error("loudnorm failed", { msg });
          await markJobFailed(event.jobId, msg);
          await drainCover();
          return json(500, { error: msg });
        }
      } else {
        console.log("voice-fx already applied to full TTS output", {
          preset: voiceFxPreset,
          bytes: mp3Buf.byteLength,
        });
      }
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : ttsProvider === "orpheus"
          ? "Orpheus TTS failed"
          : ttsProvider === "speechify"
            ? "Speechify TTS failed"
            : "Fish TTS failed";
    const kind = /voice-fx/i.test(msg) ? "voice-fx" : "TTS";
    console.error(`${kind} failed`, { msg, ttsProvider });
    await markJobFailed(event.jobId, msg);
    await drainCover();
    return json(500, { error: msg });
  }

  const stemId = randomUUID();
  const prefix = excludeFromLibrary
    ? `programs/${jobUserId}/${stemId}`
    : `meditations/${jobUserId}/${stemId}`;
  const key = `${prefix}.mp3`;
  // Baked mix only — no dry/wet locked stems for live dial crossfade.
  // Preview keeps DualStem dry↔wet; generate bakes `voiceFxDial` into the file.
  let dryAudioKey: string | null = null;
  let wetAudioKey: string | null = null;

  // Speechify PCM pipeline already loudnorm'd (API) + FX/dial + AAC.
  if (speechifyPcmPipeline) {
    console.log("skip post-TTS loudnorm/FX — Speechify PCM OLA path", {
      bytes: mp3Buf.byteLength,
      voiceFxApplied,
    });
    wetAudioKey = null;
    dryAudioKey = null;
  } else if (ttsProvider === "speechify") {
    console.log("skip final ffmpeg loudnorm — Speechify loudness_normalization", {
      bytes: mp3Buf.byteLength,
    });
  } else {
    try {
      const loudnormStarted = Date.now();
      mp3Buf = await loudnormMp3Buffer(mp3Buf);
      generationTimings.phases.loudnormMs = elapsedMs(loudnormStarted);
      console.log("loudnorm -16 LUFS applied to dry stem", {
        bytes: mp3Buf.byteLength,
        loudnormMs: generationTimings.phases.loudnormMs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "final loudnorm failed";
      console.error("final loudnorm failed", { msg });
      await markJobFailed(event.jobId, msg);
      await drainCover();
      return json(500, { error: msg });
    }
  }

  const dryBuf = mp3Buf;
  const skipVoiceFx =
    speechifyPcmPipeline ||
    body.skipVoiceFx === true ||
    (ttsProvider === "speechify" && body.skipSpeechifyLoudnorm === true);
  if (speechifyPcmPipeline) {
    // FX already handled in PCM OLA pipeline.
  } else if (skipVoiceFx) {
    generationTimings.phases.fxSkipped = true;
    console.log("skip wet Voice FX bounce", {
      jobId: event.jobId,
      bytes: dryBuf.byteLength,
      reason:
        body.skipVoiceFx === true
          ? "skipVoiceFx"
          : "skipSpeechifyLoudnorm (also skips FX)",
    });
    wetAudioKey = null;
    voiceFxApplied = false;
  } else {
    const wetFxStarted = Date.now();
    try {
      // AAC/mp3 in → delay→IR → AAC out (no voice WAV hop).
      const inExt = sniffCompressedExt(dryBuf);
      const fx = await voiceFxWavViaS3({
        audio: dryBuf,
        inputFormat:
          inExt === ".m4a" ? "m4a" : inExt === ".aac" ? "aac" : "mp3",
        preset: VOICE_FX_WET_PRESET,
        bucket: mediaBucketName,
        jobId: `${event.jobId}-wet`,
        tailPadSeconds: 2,
      });
      const { dry: dryGain, wet: wetGain } = voiceFxDialGains(voiceFxDial);
      const dialStarted = Date.now();
      mp3Buf =
        wetGain >= 1
          ? fx.wav
          : dryGain >= 1
            ? fx.dryWav
            : await mixDryWetAac({
                dryAac: fx.dryWav,
                wetAac: fx.wav,
                dryGain,
                wetGain,
              });
      const dialMs = elapsedMs(dialStarted);
      generationTimings.phases.fxMs = elapsedMs(wetFxStarted);
      generationTimings.phases.fxMp3ToWavMs = 0;
      generationTimings.phases.fxWavToMp3Ms = dialMs;
      generationTimings.phases.fxFfmpegMs = dialMs;
      generationTimings.phases.fxS3PutMs = fx.timings.s3PutMs;
      generationTimings.phases.fxInvokeMs = fx.timings.invokeMs;
      generationTimings.phases.fxS3GetMs = fx.timings.s3GetMs;
      if (fx.timings.lambda?.boardProcessMs != null) {
        generationTimings.phases.fxBoardMs = fx.timings.lambda.boardProcessMs;
      }
      if (fx.timings.coldStart != null) {
        generationTimings.phases.fxColdStart = fx.timings.coldStart;
      }
      console.log("wet bounce FX timing", {
        fxMs: generationTimings.phases.fxMs,
        voiceFxDial,
        fxInputExt: inExt,
        fxToWavMs: 0,
        fxDialBakeMs: dialMs,
        fxS3PutMs: generationTimings.phases.fxS3PutMs,
        fxInvokeMs: generationTimings.phases.fxInvokeMs,
        fxS3GetMs: generationTimings.phases.fxS3GetMs,
        fxBoardMs: generationTimings.phases.fxBoardMs,
        fxColdStart: generationTimings.phases.fxColdStart,
      });
      dryAudioKey = null;
      wetAudioKey = null;
      voiceFxApplied = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "wet bounce failed";
      generationTimings.phases.fxFailed = true;
      generationTimings.phases.fxFailedMs = elapsedMs(wetFxStarted);
      console.warn("wet bounce failed; storing dry only", {
        msg,
        fxFailedMs: generationTimings.phases.fxFailedMs,
      });
      wetAudioKey = null;
      const dryLooksM4a =
        dryBuf[4] === 0x66 &&
        dryBuf[5] === 0x74 &&
        dryBuf[6] === 0x79 &&
        dryBuf[7] === 0x70;
      const dryLooksAdts =
        dryBuf[0] === 0xff && (dryBuf[1]! & 0xf0) === 0xf0;
      mp3Buf =
        dryLooksM4a || dryLooksAdts
          ? await aacAdtsToMp3Buffer(dryBuf)
          : dryBuf;
    }
  }

  /** Dev: serial Speechify warm/calm stems (rate limits make concurrent risky). */
  type EmotionStemKeys = {
    dryAudioKey: string;
    wetAudioKey: string | null;
  };
  const speechifyEmotionStems: Partial<
    Record<"warm" | "calm", EmotionStemKeys>
  > = {};
  const wantEmotionVariants =
    body.speechifyEmotionVariants === true &&
    ttsProvider === "speechify" &&
    Boolean(speechifyKey);

  if (wantEmotionVariants) {
    const pauseBandsForVariants = await loadPauseBandSeconds().catch(
      () => undefined,
    );
    for (const emotion of ["warm", "calm"] as const) {
      try {
        console.log("Speechify emotion variant — starting", { emotion });
        const variantStarted = Date.now();
        const variantSynth = await synthesizeScriptWithPauses({
          provider: "speechify",
          speechifyApiKey: speechifyKey,
          speechifyRate,
          speechifyLoudnessNormalization,
          emotion,
          script: withSpokenMeditationTitleIntro(scriptTextUsed, libraryTitle),
          voiceId: referenceId,
          speed: speechSpeed,
          pauseBands: pauseBandsForVariants,
          pauseScale: pauseRenderScale,
        });
        // Bake dial into one file — no dry/wet stems (same as main generate).
        let variantMp3 = variantSynth.audio;
        const variantKey = `${prefix}-${emotion}${AAC_EXTENSION}`;
        try {
          const vExt = sniffCompressedExt(variantMp3);
          const fx = await voiceFxWavViaS3({
            audio: variantMp3,
            inputFormat:
              vExt === ".m4a" ? "m4a" : vExt === ".aac" ? "aac" : "mp3",
            preset: VOICE_FX_WET_PRESET,
            bucket: mediaBucketName,
            jobId: `${event.jobId}-${emotion}-wet`,
            tailPadSeconds: 2,
          });
          const { dry: dryGain, wet: wetGain } = voiceFxDialGains(voiceFxDial);
          const baked =
            wetGain >= 1
              ? fx.wav
              : dryGain >= 1
                ? fx.dryWav
                : await mixDryWetAac({
                    dryAac: fx.dryWav,
                    wetAac: fx.wav,
                    dryGain,
                    wetGain,
                  });
          await s3.send(
            new PutObjectCommand({
              Bucket: mediaBucketName,
              Key: variantKey,
              Body: baked,
              ContentType: AAC_CONTENT_TYPE,
              CacheControl: "no-store",
            }),
          );
          speechifyEmotionStems[emotion] = {
            dryAudioKey: variantKey,
            wetAudioKey: null,
          };
        } catch (fxErr) {
          const msg =
            fxErr instanceof Error ? fxErr.message : "variant wet bounce failed";
          console.warn("emotion variant FX failed; uploading dry aac", {
            emotion,
            msg,
          });
          const dryAac = await bufferToAacM4a(
            variantMp3,
            sniffCompressedExt(variantMp3),
          );
          await s3.send(
            new PutObjectCommand({
              Bucket: mediaBucketName,
              Key: variantKey,
              Body: dryAac,
              ContentType: AAC_CONTENT_TYPE,
              CacheControl: "no-store",
            }),
          );
          speechifyEmotionStems[emotion] = {
            dryAudioKey: variantKey,
            wetAudioKey: null,
          };
        }
        console.log("Speechify emotion variant — done", {
          emotion,
          ms: Date.now() - variantStarted,
          stems: speechifyEmotionStems[emotion],
        });
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "emotion variant TTS failed";
        console.warn("Speechify emotion variant failed", { emotion, msg });
      }
    }
  }

  const durationSeconds = await getAudioDurationSeconds(mp3Buf);

  try {
    const uploadStarted = Date.now();

    // Dry PCM chunks in parallel with wet upload (not served; no dry AAC).
    if (dryPcmChunks.length > 0) {
      const chunkPrefix = `${prefix}/dry-pcm`;
      const manifest = {
        sampleRate: VOICE_FX_PCM_SR,
        encoding: "s16le",
        channels: 1,
        chunks: dryPcmChunks.map((c) => ({
          i: c.i,
          startSample: c.startSample,
          bytes: c.pcm.byteLength,
          key: `${chunkPrefix}/${String(c.i).padStart(4, "0")}.s16le`,
        })),
      };
      const dryPuts = [
        ...dryPcmChunks.map((c) => {
          const keyChunk = `${chunkPrefix}/${String(c.i).padStart(4, "0")}.s16le`;
          return s3
            .send(
              new PutObjectCommand({
                Bucket: mediaBucketName,
                Key: keyChunk,
                Body: c.pcm,
                ContentType: "application/octet-stream",
                CacheControl: "no-store",
              }),
            )
            .catch((e) => {
              const msg =
                e instanceof Error ? e.message : "dry PCM chunk put failed";
              console.warn("dry PCM chunk archive failed", { keyChunk, msg });
            });
        }),
        s3
          .send(
            new PutObjectCommand({
              Bucket: mediaBucketName,
              Key: `${chunkPrefix}/manifest.json`,
              Body: Buffer.from(JSON.stringify(manifest)),
              ContentType: "application/json",
              CacheControl: "no-store",
            }),
          )
          .catch((e) => {
            const msg =
              e instanceof Error ? e.message : "dry PCM manifest put failed";
            console.warn("dry PCM manifest archive failed", { msg });
          }),
      ];
      void Promise.allSettled(dryPuts).then(() => {
        console.log("async dry PCM chunk archive done", {
          chunkPrefix,
          chunks: dryPcmChunks.length,
        });
      });
    }

    // Catalog key stays `.mp3` for Dynamo; always upload Safari-safe `.m4a` sibling.
    await s3.send(
      new PutObjectCommand({
        Bucket: mediaBucketName,
        Key: key,
        Body: mp3Buf,
        ContentType: "audio/mpeg",
        CacheControl: "no-store",
      }),
    );
    const bakedAacKey = `${prefix}${AAC_EXTENSION}`;
    const bakedIsM4a =
      mp3Buf[4] === 0x66 &&
      mp3Buf[5] === 0x74 &&
      mp3Buf[6] === 0x79 &&
      mp3Buf[7] === 0x70;
    const bakedAac = bakedIsM4a
      ? mp3Buf
      : await bufferToAacM4a(
          mp3Buf,
          mp3Buf[0] === 0xff && (mp3Buf[1]! & 0xf0) === 0xf0
            ? ".aac"
            : ".mp3",
        );
    await s3.send(
      new PutObjectCommand({
        Bucket: mediaBucketName,
        Key: bakedAacKey,
        Body: bakedAac,
        ContentType: AAC_CONTENT_TYPE,
        CacheControl: "no-store",
      }),
    );
    generationTimings.phases.uploadMs = elapsedMs(uploadStarted);
    console.log("S3 PutObject success", {
      key,
      bakedAacKey,
      dryAudioKey,
      wetAudioKey,
      voiceFxDial,
      uploadMs: generationTimings.phases.uploadMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "S3 PutObject failed";
    console.error("S3 PutObject failed", { msg });
    await markJobFailed(event.jobId, msg);
    await drainCover();
    return json(500, { error: msg });
  }

  const audioUrl = `https://${mediaCloudFrontDomain}/${key}`;
  console.log("done", { audioUrl });

  let scriptForLibrary = scriptTextUsed;
  let scriptTruncated = false;
  while (
    Buffer.byteLength(scriptForLibrary, "utf8") > MAX_SCRIPT_BYTES_FOR_LIBRARY &&
    scriptForLibrary.length > 0
  ) {
    scriptForLibrary = scriptForLibrary.slice(
      0,
      Math.floor(scriptForLibrary.length * 0.9),
    );
    scriptTruncated = true;
  }

  // Library metadata was already derived above (best-effort) so the Library can show it early.

  // Best-effort analytics / library index write (don’t fail the main job if this fails).
  // Program shelf audio stays off the personal library index.
  if (!excludeFromLibrary) {
  try {
    const createdAt = new Date().toISOString();
    const id = libraryMeditationId;
    const jobCreatedAt =
      typeof jobItem.createdAt === "string" && jobItem.createdAt.trim()
        ? jobItem.createdAt.trim()
        : null;
    const jobStartedMs = jobCreatedAt ? Date.parse(jobCreatedAt) : NaN;
    const coverAwaitStarted = Date.now();
    const coverImageKey = await coverPromise;
    generationTimings.phases.coverWaitMs = elapsedMs(coverAwaitStarted);
    console.log("cover timing", {
      coverMs: generationTimings.phases.coverMs,
      coverWaitMs: generationTimings.phases.coverWaitMs,
      coverImageKey,
    });
    const librarySk = `${createdAt}#${id}`;
    finalizeGenerationTimings(generationTimings, workerStarted);
    const devToggles = buildDevToggleLabels({
      speechifyEmotionVariants: body.speechifyEmotionVariants === true,
      skipVoiceFx: body.skipVoiceFx === true,
      skipSpeechifyLoudnorm: body.skipSpeechifyLoudnorm === true,
      ...(typeof body.speechifyRate === "number" &&
      Number.isFinite(body.speechifyRate)
        ? { speechifyRate: Math.round(body.speechifyRate) }
        : {}),
    });
    const libraryWriteStarted = Date.now();
    await ddb.send(
      new PutCommand({
        TableName: analyticsTableName,
        Item: {
          pk: meditationUserPk(jobUserId),
          sk: librarySk,
          id,
          createdAt,
          ...(jobCreatedAt ? { jobCreatedAt } : {}),
          ...(generationTimings.sections.length > 0 ||
          Object.keys(generationTimings.phases).length > 0
            ? { generationTimings }
            : {}),
          // Always write (even []) so the flyover can show "none" vs missing.
          devToggles,
          ...(event.jobId ? { jobId: event.jobId } : {}),
          s3Key: key,
          audioUrl,
          dryAudioKey,
          wetAudioKey,
          ...(Object.keys(speechifyEmotionStems).length > 0
            ? { speechifyEmotionStems }
            : {}),
          ...(coverImageKey ? { coverImageKey } : {}),
          voiceFxDial,
          createdVoiceFxDial: voiceFxDial,
          mp3Bytes: mp3Buf.byteLength,
          durationSeconds: durationSeconds ?? null,
          scriptUtf8Bytes,
          pauseSecondsTotal,
          spokenUtf8Bytes,
          spokenWordCount,
          fishTtsModel,
          ttsProvider,
          claudeHaiku45WorkerInputTokens: claudeWorkerInputTokens,
          claudeHaiku45WorkerOutputTokens: claudeWorkerOutputTokens,
          ...(claudeChatEstInputTokens != null && claudeChatEstOutputTokens != null
            ? {
                claudeHaiku45ChatEstInputTokens: claudeChatEstInputTokens,
                claudeHaiku45ChatEstOutputTokens: claudeChatEstOutputTokens,
              }
            : {}),
          claudeModel,
          speechSpeed,
          referenceId,
          meditationStyle: isJournalCatalog ? null : styleTrimmed || null,
          scriptWasGenerated: shouldGenerateScript,
          title: libraryTitle,
          meditationType: libraryMeditationType,
          description: libraryDescription,
          ...(lifeAreaId ? { lifeAreaId } : {}),
          ...(creationProvenance ? { creationProvenance } : {}),
          scriptText: scriptForLibrary,
          scriptTruncated,
          rating: null,
          liveMix: true,
          ...(body.leadInSeconds === 0 || body.leadInSeconds === 20
            ? { leadInSeconds: body.leadInSeconds }
            : {}),
          ...(typeof body.fadeOut === "boolean"
            ? { fadeOut: body.fadeOut }
            : {}),
          backgroundNatureKey: nk ?? "",
          backgroundMusicKey: mk ?? "",
          backgroundDrumsKey: dk ?? "",
          backgroundNoiseKey: zk ?? "",
          backgroundNatureGain:
            typeof body.backgroundNatureGain === "number" &&
            Number.isFinite(body.backgroundNatureGain)
              ? Math.min(100, Math.max(0, body.backgroundNatureGain))
              : 25,
          backgroundMusicGain:
            typeof body.backgroundMusicGain === "number" &&
            Number.isFinite(body.backgroundMusicGain)
              ? Math.min(100, Math.max(0, body.backgroundMusicGain))
              : 50,
          backgroundDrumsGain:
            typeof body.backgroundDrumsGain === "number" &&
            Number.isFinite(body.backgroundDrumsGain)
              ? Math.min(100, Math.max(0, body.backgroundDrumsGain))
              : 40,
          backgroundNoiseGain:
            typeof body.backgroundNoiseGain === "number" &&
            Number.isFinite(body.backgroundNoiseGain)
              ? Math.min(100, Math.max(0, body.backgroundNoiseGain))
              : 10,
          createdBackgroundNatureKey: nk ?? "",
          createdBackgroundMusicKey: mk ?? "",
          createdBackgroundDrumsKey: dk ?? "",
          createdBackgroundNoiseKey: zk ?? "",
          createdBackgroundNatureGain:
            typeof body.backgroundNatureGain === "number" &&
            Number.isFinite(body.backgroundNatureGain)
              ? Math.min(100, Math.max(0, body.backgroundNatureGain))
              : 25,
          createdBackgroundMusicGain:
            typeof body.backgroundMusicGain === "number" &&
            Number.isFinite(body.backgroundMusicGain)
              ? Math.min(100, Math.max(0, body.backgroundMusicGain))
              : 50,
          createdBackgroundDrumsGain:
            typeof body.backgroundDrumsGain === "number" &&
            Number.isFinite(body.backgroundDrumsGain)
              ? Math.min(100, Math.max(0, body.backgroundDrumsGain))
              : 40,
          createdBackgroundNoiseGain:
            typeof body.backgroundNoiseGain === "number" &&
            Number.isFinite(body.backgroundNoiseGain)
              ? Math.min(100, Math.max(0, body.backgroundNoiseGain))
              : 10,
        },
      }),
    );
    generationTimings.phases.libraryWriteMs = elapsedMs(libraryWriteStarted);
    finalizeGenerationTimings(generationTimings, workerStarted);
    // Job create → library row ready (includes cover + Dynamo put).
    const generationElapsedMs =
      Number.isFinite(jobStartedMs) && jobStartedMs > 0
        ? Math.max(0, Date.now() - jobStartedMs)
        : null;
    console.log("generation timing summary", {
      wallMs: generationElapsedMs,
      ...generationTimings.phases,
      sections: generationTimings.sections.length,
    });
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: analyticsTableName,
          Key: {
            pk: meditationUserPk(jobUserId),
            sk: librarySk,
          },
          UpdateExpression:
            generationElapsedMs != null
              ? "SET generationTimings = :gt, generationElapsedMs = :ge"
              : "SET generationTimings = :gt",
          ExpressionAttributeValues: {
            ":gt": generationTimings,
            ...(generationElapsedMs != null
              ? { ":ge": generationElapsedMs }
              : {}),
          },
        }),
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "generationTimings update failed";
      console.warn("generationTimings update failed", { msg });
    }
    scheduleIndexMeditation({
      email: jobUserEmail,
      sk: librarySk,
      title: libraryTitle,
      description: libraryDescription,
      meditationStyle: isJournalCatalog ? null : styleTrimmed || null,
      meditationType: libraryMeditationType,
      updatedAt: createdAt,
      coverImageKey,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "analytics write failed";
    console.warn("analytics write failed", { msg });
  }
  }

  // Update job record.
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: jobsTableName,
        Key: { jobId: event.jobId },
        UpdateExpression:
          "SET #status = :s, audioUrl = :a, scriptTextUsed = :t, audioKey = :k, updatedAt = :u, durationSeconds = :d",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":s": "completed",
          ":a": audioUrl,
          ":t": scriptTextUsed,
          ":k": key,
          ":u": new Date().toISOString(),
          ":d": durationSeconds ?? null,
        },
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "job update failed";
    console.warn("job update failed", { msg });
  }

  return json(200, {
    audioUrl,
    scriptTextUsed,
    audioKey: key,
    durationSeconds: durationSeconds ?? null,
  });
}

