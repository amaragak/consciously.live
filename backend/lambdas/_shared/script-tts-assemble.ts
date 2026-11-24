/**
 * Compare TTS helpers — same Speechify PCM + FX OLA path as create
 * (`synthesizeSpeechifyPcmFxOla`). Pauses are zero samples on the dry timeline.
 */
import { S3Client } from "@aws-sdk/client-s3";
import {
  MEDITATION_SPEECHIFY_EMOTION,
  getSpeechifyApiKey,
  speechifyRateSsmlForVoice,
  speechifyVoiceId,
} from "./speechify-tts";
import {
  synthesizeSpeechifyPcmFxOla,
  type SpeechifyPcmFxOlaResult,
} from "./speechify-pcm-fx-ola";
import { clampVoiceFxDial } from "./voice-fx-dial";
import { pcm24kS16leToAac44100 } from "./voice-fx-ffmpeg-chain";
import {
  listVoiceSpeakers,
  loadPauseBandSeconds,
  type PauseBandSeconds,
} from "./voice-admin";

const s3 = new S3Client({});

export type CompareTtsVoice = {
  brand: "speechify";
  voiceId: string;
  name: string;
  /** SSML rate like `-7%`, or undefined for Speechify default. */
  speechifyRate?: string;
};

export type ComparePcmJobResult = SpeechifyPcmFxOlaResult & {
  lengthFit: {
    speechSeconds: number;
    pauseSeconds: number;
    stemSeconds: number;
    longPauseScale: number;
    postScaled: boolean;
  };
  /** Sum of section TTS API ms from the OLA pipeline. */
  ttsMs: number;
};

/** Prefer first visible Speechify speaker (admin compare uses Speechify). */
export async function resolveCompareTtsVoice(): Promise<CompareTtsVoice> {
  const rows = await listVoiceSpeakers();
  const speechify =
    rows.find(
      (s) => !s.hidden && s.brand === "speechify" && s.modelId?.trim(),
    ) ?? rows.find((s) => s.brand === "speechify" && s.modelId?.trim());
  const voiceId = speechify?.modelId?.trim() || speechifyVoiceId();
  let speechifyRate: string | undefined;
  if (typeof speechify?.speechifyRate === "number") {
    const n = Math.round(speechify.speechifyRate);
    speechifyRate = `${n >= 0 ? "+" : ""}${n}%`;
  } else {
    speechifyRate = await speechifyRateSsmlForVoice(voiceId).catch(
      () => undefined,
    );
  }
  return {
    brand: "speechify",
    voiceId,
    name: speechify?.name || voiceId,
    ...(speechifyRate ? { speechifyRate } : {}),
  };
}

export async function loadCompareTtsContext(): Promise<{
  apiKey: string;
  voice: CompareTtsVoice;
  pauseBands: PauseBandSeconds;
  pauseScale: number;
  bucket: string;
  voiceFxDial: number;
}> {
  const bucket = (process.env.MEDIA_BUCKET_NAME || "").trim();
  if (!bucket) throw new Error("MEDIA_BUCKET_NAME is not set");
  const [apiKey, voice, pauseBands] = await Promise.all([
    getSpeechifyApiKey(),
    resolveCompareTtsVoice(),
    loadPauseBandSeconds(),
  ]);
  return {
    apiKey,
    voice,
    pauseBands,
    pauseScale: 1.12,
    bucket,
    voiceFxDial: clampVoiceFxDial(50),
  };
}

function ttsMsFromResult(r: ComparePcmJobResult): number {
  return r.timings.sections.reduce((s, x) => s + (x.ttsMs || 0), 0);
}

/** One script chunk via create's Speechify PCM + FX OLA. */
export async function synthesizeComparePcm(params: {
  apiKey: string;
  script: string;
  voiceId: string;
  speechifyRate?: string;
  pauseBands?: PauseBandSeconds;
  pauseScale?: number;
  bucket: string;
  voiceFxDial?: number;
  /** Default false for phase stitch; true for gated single call. */
  encodeAac?: boolean;
  applyFx?: boolean;
}): Promise<ComparePcmJobResult> {
  const result = await synthesizeSpeechifyPcmFxOla({
    s3,
    bucket: params.bucket,
    apiKey: params.apiKey,
    script: params.script,
    voiceId: params.voiceId,
    speechifyRate: params.speechifyRate,
    emotion: MEDITATION_SPEECHIFY_EMOTION,
    pauseBands: params.pauseBands,
    pauseScale: params.pauseScale ?? 1.12,
    applyFx: params.applyFx !== false,
    voiceFxDial: clampVoiceFxDial(params.voiceFxDial ?? 50),
    encodeAac: params.encodeAac === true,
  });
  return { ...result, ttsMs: ttsMsFromResult(result as ComparePcmJobResult) };
}

export function kickPhasePcmJob(params: {
  jobs: Map<number, Promise<ComparePcmJobResult>>;
  phaseIndex: number;
  script: string;
  apiKey: string;
  voiceId: string;
  speechifyRate?: string;
  pauseBands?: PauseBandSeconds;
  pauseScale?: number;
  bucket: string;
  voiceFxDial?: number;
}): void {
  if (params.jobs.has(params.phaseIndex)) return;
  const body = params.script?.trim() ?? "";
  if (!body) return;
  const job = synthesizeComparePcm({
    apiKey: params.apiKey,
    script: body,
    voiceId: params.voiceId,
    speechifyRate: params.speechifyRate,
    pauseBands: params.pauseBands,
    pauseScale: params.pauseScale,
    bucket: params.bucket,
    voiceFxDial: params.voiceFxDial,
    encodeAac: false,
    applyFx: true,
  });
  void job.catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("phase PCM TTS failed", params.phaseIndex, msg.slice(0, 300));
  });
  params.jobs.set(params.phaseIndex, job);
}

/** Await phase PCM jobs, stitch mixed PCM, one AAC encode (create stream assemble). */
export async function awaitPhasePcmJobsAndAssemble(params: {
  jobs: Map<number, Promise<ComparePcmJobResult>>;
}): Promise<{
  audio: Buffer;
  phaseCount: number;
  ttsMsSum: number;
  assembleMs: number;
}> {
  const entries = [...params.jobs.entries()].sort((a, b) => a[0] - b[0]);
  if (!entries.length) {
    throw new Error("awaitPhasePcmJobsAndAssemble: no phase TTS jobs");
  }
  const assembleStarted = Date.now();
  const results = await Promise.all(entries.map(([, p]) => p));
  const ttsMsSum = results.reduce((s, r) => s + r.ttsMs, 0);
  const mixedPcm = Buffer.concat(
    results.map((r) => r.mixedPcm ?? Buffer.alloc(0)),
  );
  if (mixedPcm.byteLength < 2) {
    throw new Error("awaitPhasePcmJobsAndAssemble: empty mixed PCM");
  }
  const audio = await pcm24kS16leToAac44100(mixedPcm);
  return {
    audio,
    phaseCount: results.length,
    ttsMsSum,
    assembleMs: Date.now() - assembleStarted,
  };
}
