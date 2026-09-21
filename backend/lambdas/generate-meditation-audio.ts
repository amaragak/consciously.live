import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { siblingOpusKey } from "./_shared/background-audio-keys";
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
} from "./_shared/script-pause-bands";
import {
  getSpeechifyApiKey,
  speechifyRateToSsml,
  speechifyTtsMp3,
} from "./_shared/speechify-tts";
import { getVoiceSpeaker, loadPauseBandSeconds } from "./_shared/voice-admin";
import {
  VOICE_FX_WET_PRESET,
  clampVoiceFxDial,
  voiceFxDialGains,
} from "./_shared/voice-fx-dial";
import { putVoiceStemStreams } from "./_shared/voice-stem-stream";
import {
  createPromptFromProvenance,
  generateAndStoreMeditationCover,
} from "./_shared/meditation-cover";
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
  /** Pedalboard's own processing, as reported by the FX Lambda. */
  fxBoardMs?: number;
  /** True when that section's FX Lambda had to start a fresh container. */
  fxColdStart?: boolean;
  utf8Bytes?: number;
  pauseSec?: number;
};

export type GenerationPhaseTimings = {
  scriptMs?: number;
  metadataMs?: number;
  concatMs?: number;
  /** Single FX pass over the assembled track: loudnorm + Pedalboard. */
  fxMs?: number;
  /** Worker-side ffmpeg inside fxMs: loudnorm + the two format conversions. */
  fxFfmpegMs?: number;
  /** S3 put + VoiceFx invoke + S3 get, i.e. fxMs minus the local ffmpeg work. */
  fxInvokeMs?: number;
  /** Pedalboard's own processing, as reported by the FX Lambda. */
  fxBoardMs?: number;
  /** True when the FX Lambda had to start a fresh container. */
  fxColdStart?: boolean;
  loudnormMs?: number;
  uploadMs?: number;
};

export type GenerationTimings = {
  phases: GenerationPhaseTimings;
  sections: GenerationSectionTiming[];
};

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
}

const secrets = new SecretsManagerClient({});
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const lambdaClient = new LambdaClient({});
const execFileAsync = promisify(execFile);

async function voiceFxWavViaS3(params: {
  /** Prefers WAV — Pedalboard MP3-from-buffer often truncates mid-phrase. */
  audio: Buffer;
  inputFormat: "wav" | "mp3";
  preset: string;
  bucket: string;
  jobId: string;
  /** Mixer reverb pad; omit for the preset default (2s). */
  tailPadSeconds?: number;
}): Promise<{
  wav: Buffer;
  dryWav: Buffer;
  /** Split of the round trip, plus whatever the FX Lambda reported about itself. */
  timings: {
    s3PutMs: number;
    invokeMs: number;
    s3GetMs: number;
    lambda?: Record<string, number>;
    coldStart?: boolean;
  };
}> {
  // One invoke over the joined stem (IAM). HTTP remains for short preview clips.
  const functionName = process.env.VOICE_FX_FUNCTION_NAME?.trim();
  const apiBase = process.env.CONSCIOUSLY_API_URL?.trim().replace(/\/$/, "");
  if (!functionName && !apiBase) {
    throw new Error(
      "VOICE_FX_FUNCTION_NAME or CONSCIOUSLY_API_URL is required for voice-fx",
    );
  }

  const ext = params.inputFormat === "wav" ? "wav" : "mp3";
  const inKey = `tmp/voice-fx/${params.jobId}/in.${ext}`;
  const outKey = `tmp/voice-fx/${params.jobId}/out.wav`;
  const dryOutKey = `tmp/voice-fx/${params.jobId}/dry.wav`;
  const requestBody: Record<string, unknown> = {
    bucket: params.bucket,
    s3KeyIn: inKey,
    s3KeyOut: outKey,
    s3KeyDryOut: dryOutKey,
    preset: params.preset,
    inputFormat: params.inputFormat,
  };
  if (params.tailPadSeconds !== undefined) {
    requestBody.tailPadSeconds = params.tailPadSeconds;
  }

  const putStarted = Date.now();
  await s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: inKey,
      Body: params.audio,
      ContentType: params.inputFormat === "wav" ? "audio/wav" : "audio/mpeg",
      CacheControl: "no-store",
    }),
  );
  const s3PutMs = elapsedMs(putStarted);

  let statusCode = 0;
  let responseBody = "";
  const invokeStarted = Date.now();

  if (functionName) {
    // RequestResponse so errors come back to the worker (Event cannot).
    const invoke = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(
          JSON.stringify({
            body: JSON.stringify(requestBody),
          }),
        ),
      }),
    );
    const rawPayload = invoke.Payload
      ? Buffer.from(invoke.Payload).toString("utf8")
      : "";
    if (invoke.FunctionError) {
      throw new Error(
        `voice-fx Lambda ${invoke.FunctionError}: ${rawPayload.slice(0, 2000)}`,
      );
    }
    let parsed: { statusCode?: number; body?: string } | null = null;
    try {
      parsed = JSON.parse(rawPayload) as { statusCode?: number; body?: string };
    } catch {
      throw new Error(
        `voice-fx Lambda returned non-JSON: ${rawPayload.slice(0, 2000)}`,
      );
    }
    statusCode = Number(parsed.statusCode ?? 500);
    responseBody =
      typeof parsed.body === "string" ? parsed.body : rawPayload;
  } else {
    const res = await fetch(`${apiBase}/audio/voice-fx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    statusCode = res.status;
    responseBody = await res.text();
  }
  const invokeMs = elapsedMs(invokeStarted);

  type VoiceFxResponse = {
    s3KeyOut?: string;
    error?: string;
    timingsMs?: Record<string, number>;
    coldStart?: boolean;
  };
  let data: VoiceFxResponse | null = null;
  try {
    data = JSON.parse(responseBody) as VoiceFxResponse;
  } catch {
    data = null;
  }
  if (statusCode < 200 || statusCode >= 300) {
    const detail = data?.error ?? responseBody.slice(0, 2000);
    throw new Error(`voice-fx failed (${statusCode}): ${detail}`);
  }

  const getStarted = Date.now();
  const fxObj = await s3.send(
    new GetObjectCommand({ Bucket: params.bucket, Key: outKey }),
  );
  const wav = Buffer.from(await fxObj.Body!.transformToByteArray());
  const dryObj = await s3.send(
    new GetObjectCommand({ Bucket: params.bucket, Key: dryOutKey }),
  );
  const dryWav = Buffer.from(await dryObj.Body!.transformToByteArray());
  return {
    wav,
    dryWav,
    timings: {
      s3PutMs,
      invokeMs,
      s3GetMs: elapsedMs(getStarted),
      lambda: data?.timingsMs,
      coldStart: data?.coldStart,
    },
  };
}

async function mp3ToWavBuffer(mp3Buf: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/mp3wav-in-${id}.mp3`;
  const outPath = `/tmp/mp3wav-out-${id}.wav`;
  try {
    fs.writeFileSync(inPath, mp3Buf);
    // Same 44.1 kHz mono as pause files and the joined stem we send through FX.
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
  // Decode with ffmpeg first — Pedalboard MP3 decode was clipping phrases short.
  const toWavStarted = Date.now();
  const wavIn = await mp3ToWavBuffer(loud);
  const mp3ToWavMs = elapsedMs(toWavStarted);
  const fx = await voiceFxWavViaS3({
    audio: wavIn,
    inputFormat: "wav",
    preset: params.preset,
    bucket: params.bucket,
    jobId: params.jobId,
    tailPadSeconds: params.tailPadSeconds,
  });
  const toMp3Started = Date.now();
  const mp3 = await wavToMp3Buffer(fx.wav);
  const wavToMp3Ms = elapsedMs(toMp3Started);
  const split = {
    fxFfmpegMs: loudnormMs + mp3ToWavMs + wavToMp3Ms,
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

async function getMp3DurationSeconds(buf: Buffer): Promise<number | null> {
  try {
    const m = await parseBuffer(buf, { mimeType: "audio/mpeg", size: buf.byteLength });
    const d = m.format.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
    return null;
  } catch {
    return null;
  }
}

function clampGain(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

const BED_GAIN_PEAK_VOLUME = 0.5;

/**
 * Mix speech (input 0) with one or more looped background beds.
 * Each layer gain is 0–100; mixer peak (100) is volume 0.5 so speech at 1.0 stays louder.
 */
async function mixSpeechWithBackgrounds(params: {
  speechBuf: Buffer;
  layers: { key: string; gain: number }[];
  durationSeconds: number | null;
  bucket: string;
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
      // Beds are looped by `aloop` below, so prefer the gapless Opus sibling —
      // MP3 carries encoder padding that would land on every loop seam.
      const requested = layers[i].key.trim();
      const opus = siblingOpusKey(requested);
      let sourceKey = requested;
      let ext = "mp3";
      if (opus) {
        try {
          await s3.send(
            new HeadObjectCommand({ Bucket: params.bucket, Key: opus }),
          );
          sourceKey = opus;
          ext = "opus";
        } catch {
          /* not backfilled yet — fall back to the MP3 */
        }
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
    // - 1.5s background-only intro
    // - speech starts after 1.5s
    // - 8s tail after speech ends, with background fading out over the tail
    const introSeconds = 1.5;
    const tailSeconds = 8;
    const totalDurSeconds =
      dur !== undefined ? dur + introSeconds + tailSeconds : undefined;
    const bedFadeOut =
      totalDurSeconds !== undefined && totalDurSeconds > tailSeconds + 0.06
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
  return { script: text, usage: parseAnthropicMessageUsage(responseText) };
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
  runpod?: { apiKey: string; upstreamUrl: string };
  script: string;
  voiceId: string;
  speed: number;
  fishTtsModel?: string;
  pauseBands?: Awaited<ReturnType<typeof loadPauseBandSeconds>>;
  /** Multiply band seconds at render (default PAUSE_RENDER_SCALE). */
  pauseScale?: number;
  /** When set, loudnorm + Pedalboard run once over the assembled track. */
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
   */
  async function applyVoiceFx(mp3: Buffer): Promise<Buffer> {
    if (!voiceFx) return mp3;
    const fx = await loudnormThenVoiceFxMp3({
      mp3,
      preset: voiceFx.preset,
      bucket: voiceFx.bucket,
      jobId: `${voiceFx.jobId}-full`,
      tailPadSeconds: 2,
    });
    fxPhase.fxMs = fx.ms;
    Object.assign(fxPhase, fx.split);
    return fx.mp3;
  }

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
    audio = await applyVoiceFx(audio);
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
    if (!clean) continue;
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
    const segPath = `/tmp/seg-${id}-${i}.mp3`;
    fs.writeFileSync(segPath, segBuf);
    files.push(segPath);
    speechPaths.push(segPath);

    if (seg.pauseSeconds > 0) {
      const pausePath = `/tmp/pause-${id}-${i}.mp3`;
      await execFileAsync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=mono:sample_rate=44100",
        "-t",
        (seg.pauseSeconds * pauseScale).toFixed(2),
        "-q:a",
        "9",
        "-acodec",
        "libmp3lame",
        pausePath,
      ]);
      files.push(pausePath);
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
    audio = await applyVoiceFx(audio);
    return {
      audio,
      utf8Bytes: Buffer.byteLength(clean, "utf8"),
      voiceFxApplied: Boolean(voiceFx),
      timings: { sections: sectionTimings, phases: { ...fxPhase } },
    };
  }

  if (files.length === 1) {
    const only = await applyVoiceFx(fs.readFileSync(files[0]));
    return {
      audio: only,
      utf8Bytes: totalBytes,
      voiceFxApplied: Boolean(voiceFx),
      timings: { sections: sectionTimings, phases: { ...fxPhase } },
    };
  }

  const listPath = `/tmp/concat-${id}.txt`;
  fs.writeFileSync(
    listPath,
    files.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  const outPath = `/tmp/concat-out-${id}.mp3`;

  const concatStarted = Date.now();
  // Speechify is 24 kHz; pause files are 44.1 kHz. Stream-copy concat left a
  // broken timeline, so FX tails died at every chunk seam. Resample into one
  // 44.1 kHz stem, then apply FX on that joined file.
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
    "-c:a",
    "libmp3lame",
    "-q:a",
    "2",
    outPath,
  ]);
  const concatMs = elapsedMs(concatStarted);

  const outBuf = await applyVoiceFx(fs.readFileSync(outPath));
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
 * the whole script, then one loudnorm + Pedalboard pass. No ffmpeg segmentation.
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
  console.log("meditation-audio worker start", {
    jobId: event.jobId,
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

  let fishKey: string | undefined;
  let speechifyKey: string | undefined;
  const speechifyRate = speechifyRateToSsml(speaker?.speechifyRate);
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
    return json(500, { error: msg });
  }

  let mp3Buf: Buffer;
  let voiceFxApplied = false;
  let scriptUtf8Bytes = 0;
  let pauseSecondsTotal = 0;
  let spokenUtf8Bytes = 0;
  let spokenWordCount = 0;
  try {
    // Script already includes the spoken title when the writer put one in.
    const ttsScript = scriptTextUsed;
    const pauseBands = await loadPauseBandSeconds().catch(() => undefined);
    const spokenPlain = spokenPlainWithoutPauses(ttsScript);
    spokenUtf8Bytes = Buffer.byteLength(spokenPlain, "utf8");
    spokenWordCount = spokenPlain
      ? spokenPlain.split(/\s+/).filter(Boolean).length
      : 0;

    // Dry joined speech only — wet bounce + live mix happen after this.

    pauseSecondsTotal =
      sumPauseMarkerSeconds(ttsScript, pauseBands) * pauseRenderScale;

    const fishPauseMode = normalizeFishPauseMode(jobItem.fishPauseMode);
    // Open / timed multi-minute sits need ffmpeg silence — Fish native tags cannot hold 60–120s.
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
        return json(500, { error: msg });
      }
    } else {
      console.log("voice-fx already applied to full TTS output", {
        preset: voiceFxPreset,
        bytes: mp3Buf.byteLength,
      });
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
    return json(500, { error: msg });
  }

  const stemId = randomUUID();
  const prefix = excludeFromLibrary
    ? `programs/${jobUserId}/${stemId}`
    : `meditations/${jobUserId}/${stemId}`;
  const dryKey = `${prefix}-dry.wav`;
  const wetKey = `${prefix}-wet.wav`;
  const key = `${prefix}.mp3`;
  let dryAudioKey: string | null = dryKey;
  let wetAudioKey: string | null = null;

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
    return json(500, { error: msg });
  }

  const dryBuf = mp3Buf;
  try {
    // Pedalboard's MP3 decoder can return the right duration as all-zero PCM
    // (Speechify/long joins). Decode with ffmpeg first, same as section FX.
    const wavIn = await mp3ToWavBuffer(dryBuf);
    const fx = await voiceFxWavViaS3({
      audio: wavIn,
      inputFormat: "wav",
      preset: VOICE_FX_WET_PRESET,
      bucket: mediaBucketName,
      jobId: `${event.jobId}-wet`,
      tailPadSeconds: 2,
    });
    const { dry: dryGain, wet: wetGain } = voiceFxDialGains(voiceFxDial);
    mp3Buf =
      wetGain >= 1
        ? await wavToMp3Buffer(fx.wav)
        : dryGain >= 1
          ? await wavToMp3Buffer(fx.dryWav)
          : await mixDryWetMp3({
              dryMp3: fx.dryWav,
              wetWav: fx.wav,
              dryGain,
              wetGain,
            });
    wetAudioKey = wetKey;
    voiceFxApplied = true;
    await s3.send(
      new PutObjectCommand({
        Bucket: mediaBucketName,
        Key: wetKey,
        Body: fx.wav,
        ContentType: "audio/wav",
        CacheControl: "no-store",
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: mediaBucketName,
        Key: dryKey,
        Body: fx.dryWav,
        ContentType: "audio/wav",
        CacheControl: "no-store",
      }),
    );
    await putVoiceStemStreams({
      s3,
      bucket: mediaBucketName,
      wavKey: dryKey,
      wavBuf: fx.dryWav,
      cacheControl: "no-store",
    });
    await putVoiceStemStreams({
      s3,
      bucket: mediaBucketName,
      wavKey: wetKey,
      wavBuf: fx.wav,
      cacheControl: "no-store",
    });
    console.log("locked stems uploaded", {
      dryKey,
      wetKey,
      dryBytes: fx.dryWav.byteLength,
      wetBytes: fx.wav.byteLength,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "wet bounce failed";
    console.warn("wet bounce failed; storing dry only", { msg });
    wetAudioKey = null;
    mp3Buf = dryBuf;
  }

  const durationSeconds = await getMp3DurationSeconds(mp3Buf);

  try {
    const uploadStarted = Date.now();
    if (!wetAudioKey) {
      await s3.send(
        new PutObjectCommand({
          Bucket: mediaBucketName,
          Key: dryKey,
          Body: dryBuf,
          ContentType: "audio/mpeg",
          CacheControl: "no-store",
        }),
      );
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: mediaBucketName,
        Key: key,
        Body: mp3Buf,
        ContentType: "audio/mpeg",
        CacheControl: "no-store",
      }),
    );
    generationTimings.phases.uploadMs = elapsedMs(uploadStarted);
    console.log("S3 PutObject success", {
      key,
      dryKey,
      wetKey: wetAudioKey,
      uploadMs: generationTimings.phases.uploadMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "S3 PutObject failed";
    console.error("S3 PutObject failed", { msg });
    await markJobFailed(event.jobId, msg);
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
    const id = randomUUID();
    const jobCreatedAt =
      typeof jobItem.createdAt === "string" && jobItem.createdAt.trim()
        ? jobItem.createdAt.trim()
        : null;
    const jobStartedMs = jobCreatedAt ? Date.parse(jobCreatedAt) : NaN;
    const generationElapsedMs =
      Number.isFinite(jobStartedMs) && jobStartedMs > 0
        ? Math.max(0, Date.parse(createdAt) - jobStartedMs)
        : null;
    const coverImageKey = mediaBucketName
      ? await generateAndStoreMeditationCover({
          s3,
          bucket: mediaBucketName,
          userId: jobUserId,
          meditationId: id,
          input: {
            title: libraryTitle,
            description: libraryDescription,
            meditationStyle: isJournalCatalog ? null : styleTrimmed || null,
            meditationType: libraryMeditationType,
            createPrompt: createPromptFromProvenance(creationProvenance),
          },
        })
      : null;
    await ddb.send(
      new PutCommand({
        TableName: analyticsTableName,
        Item: {
          pk: meditationUserPk(jobUserId),
          sk: `${createdAt}#${id}`,
          id,
          createdAt,
          ...(jobCreatedAt ? { jobCreatedAt } : {}),
          ...(generationElapsedMs != null ? { generationElapsedMs } : {}),
          ...(generationTimings.sections.length > 0 ||
          generationTimings.phases.scriptMs != null ||
          generationTimings.phases.metadataMs != null ||
          generationTimings.phases.concatMs != null ||
          generationTimings.phases.loudnormMs != null ||
          generationTimings.phases.uploadMs != null
            ? { generationTimings }
            : {}),
          ...(event.jobId ? { jobId: event.jobId } : {}),
          s3Key: key,
          audioUrl,
          dryAudioKey,
          wetAudioKey,
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

