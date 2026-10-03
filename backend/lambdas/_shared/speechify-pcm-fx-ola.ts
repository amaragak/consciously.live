/**
 * Speechify pcm_24000 → per-segment ffmpeg IR FX → PCM overlap-add → AAC.
 */
import type { S3Client } from "@aws-sdk/client-s3";
import {
  parseScriptIntoSegments,
  type ScriptPauseBand,
} from "./script-pause-bands";
import { speechifyTtsPcm24k, type SpeechifyEmotionTag } from "./speechify-tts";
import { loadCommittedVoiceFxContext } from "./voice-fx-apply";
import { voiceFxDialGains } from "./voice-fx-dial";
import {
  applyVoiceFxPcmSegment24k,
  floatBusToS16le,
  mixDialPcmS16le,
  olaAddS16leToFloatBus,
  pcm24kS16leToAac44100,
  VOICE_FX_PCM_SR,
} from "./voice-fx-ffmpeg-chain";

export type SpeechifyPcmFxOlaSectionTiming = {
  i: number;
  ttsMs: number;
  fxMs?: number;
  utf8Bytes?: number;
  pauseSec?: number;
};

export type SpeechifyDryPcmChunk = {
  /** Speech segment index (0-based among spoken chunks). */
  i: number;
  /** Sample offset on the dry timeline @ 24 kHz. */
  startSample: number;
  /** Raw s16le mono @ 24 kHz. */
  pcm: Buffer;
};

export type SpeechifyPcmFxOlaResult = {
  /** Dial-baked wet delivery AAC @ 44.1 kHz. */
  deliveryAac: Buffer;
  /** Per-segment dry PCM for async archive (not served). */
  dryChunks: SpeechifyDryPcmChunk[];
  voiceFxApplied: boolean;
  utf8Bytes: number;
  timings: {
    sections: SpeechifyPcmFxOlaSectionTiming[];
    phases: {
      /** Wall for entire PCM path (FX load → TTS∥FX → OLA → AAC). */
      ttsPipelineMs?: number;
      /** loadCommittedVoiceFxContext (IR + settings). */
      fxLoadMs?: number;
      /** Wall: first TTS → last per-seg FX done (TTS∥FX). */
      ttsFxLoopMs?: number;
      /** Sum of per-seg ffmpeg FX (overlaps TTS in the loop). */
      fxMs?: number;
      /** Float bus finalize + dial mix (cheap). */
      olaMs?: number;
      /** Final 24 kHz PCM → AAC @ 44.1. */
      aacEncodeMs?: number;
    };
  };
};

function sanitizeScriptForTts(markdown: string): string {
  let t = markdown ?? "";
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/^\s*#{1,6}\s+/gm, "");
  t = t.replace(/\*\*([^\n*]+)\*\*/g, "$1");
  t = t.replace(/\*([^\n*]+)\*/g, "$1");
  t = t.replace(/[*#]/g, "");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function elapsedMs(started: number): number {
  return Math.max(0, Date.now() - started);
}

/**
 * Pipelined: TTS segment N+1 overlaps FX on segment N.
 * Pauses are zero samples on the dry/wet buses (tails decay into them).
 */
export async function synthesizeSpeechifyPcmFxOla(params: {
  s3: S3Client;
  bucket: string;
  apiKey: string;
  script: string;
  voiceId: string;
  speechifyRate?: string;
  emotion?: SpeechifyEmotionTag | null;
  speechifyLoudnessNormalization?: boolean;
  pauseBands?: Record<ScriptPauseBand, number>;
  pauseScale?: number;
  /** When false, OLA dry only and encode (no FX). */
  applyFx: boolean;
  voiceFxDial: number;
}): Promise<SpeechifyPcmFxOlaResult> {
  const pipelineStarted = Date.now();
  const pauseScale =
    typeof params.pauseScale === "number" && Number.isFinite(params.pauseScale)
      ? params.pauseScale
      : 1;
  const segments = parseScriptIntoSegments(params.script, params.pauseBands);
  const sectionTimings: SpeechifyPcmFxOlaSectionTiming[] = [];
  let dryBus: Float32Array = new Float32Array(0);
  let wetBus: Float32Array = new Float32Array(0);
  let cursor = 0;
  /** Furthest sample written on wet (includes FX/reverb tails past dry cursor). */
  let wetExtent = 0;
  let totalBytes = 0;
  let fxTotalMs = 0;
  const dryChunks: SpeechifyDryPcmChunk[] = [];

  let fxLoadMs = 0;
  let fxCtx: Awaited<ReturnType<typeof loadCommittedVoiceFxContext>> | null =
    null;
  if (params.applyFx) {
    const fxLoadStarted = Date.now();
    fxCtx = await loadCommittedVoiceFxContext({
      s3: params.s3,
      bucket: params.bucket,
    });
    fxLoadMs = elapsedMs(fxLoadStarted);
  }

  type Pending = {
    pcm: Buffer;
    startSample: number;
    sectionIndex: number;
  };
  let fxInFlight: Promise<void> | null = null;

  const runFxOla = async (pending: Pending) => {
    dryChunks.push({
      i: pending.sectionIndex,
      startSample: pending.startSample,
      pcm: pending.pcm,
    });
    dryBus = olaAddS16leToFloatBus(dryBus, pending.pcm, pending.startSample);
    if (!fxCtx) {
      wetBus = olaAddS16leToFloatBus(wetBus, pending.pcm, pending.startSample);
      wetExtent = Math.max(
        wetExtent,
        pending.startSample + pending.pcm.byteLength / 2,
      );
      return;
    }
    const fx = await applyVoiceFxPcmSegment24k({
      dryPcm: pending.pcm,
      settings: fxCtx.settings,
      irWav: fxCtx.irWav,
    });
    fxTotalMs += fx.ms;
    const sec = sectionTimings[pending.sectionIndex];
    if (sec) sec.fxMs = fx.ms;
    wetBus = olaAddS16leToFloatBus(wetBus, fx.wetPcm, pending.startSample);
    wetExtent = Math.max(
      wetExtent,
      pending.startSample + fx.wetPcm.byteLength / 2,
    );
  };

  const speechSegments =
    segments.length > 0
      ? segments
      : [{ text: params.script, pauseSeconds: 0 }];

  const loopStarted = Date.now();
  for (let i = 0; i < speechSegments.length; i++) {
    const seg = speechSegments[i]!;
    const clean = sanitizeScriptForTts(seg.text);

    if (clean) {
      const utf8Bytes = Buffer.byteLength(clean, "utf8");
      totalBytes += utf8Bytes;
      const ttsStarted = Date.now();
      const pcm = await speechifyTtsPcm24k({
        apiKey: params.apiKey,
        text: clean,
        voiceId: params.voiceId,
        rate: params.speechifyRate,
        emotion: params.emotion,
        loudnessNormalization: params.speechifyLoudnessNormalization,
        sentenceBreakMs: 777,
      });
      if (pcm.byteLength % 2 !== 0) {
        throw new Error("Speechify PCM length is not s16le-aligned");
      }
      const sectionIndex = sectionTimings.length;
      sectionTimings.push({
        i: sectionIndex,
        ttsMs: elapsedMs(ttsStarted),
        utf8Bytes,
        pauseSec:
          seg.pauseSeconds > 0 ? seg.pauseSeconds * pauseScale : undefined,
      });

      if (fxInFlight) await fxInFlight;
      const startSample = cursor;
      cursor += pcm.byteLength / 2;
      fxInFlight = runFxOla({ pcm, startSample, sectionIndex });
    }

    if (seg.pauseSeconds > 0) {
      const pauseSamples = Math.round(
        seg.pauseSeconds * pauseScale * VOICE_FX_PCM_SR,
      );
      cursor += Math.max(0, pauseSamples);
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

  if (fxInFlight) await fxInFlight;
  const ttsFxLoopMs = elapsedMs(loopStarted);

  if (cursor <= 0) {
    throw new Error("Speechify PCM pipeline produced no samples");
  }

  const olaStarted = Date.now();
  // Delivery length = dry timeline (speech + pauses) OR wet extent with FX tails —
  // never truncate the final reverb/echo tail to the dry cursor.
  const totalSamples = Math.max(cursor, wetExtent);
  if (dryBus.length < totalSamples) {
    const next = new Float32Array(totalSamples);
    next.set(dryBus);
    dryBus = next;
  }
  if (wetBus.length < totalSamples) {
    const next = new Float32Array(totalSamples);
    next.set(wetBus);
    wetBus = next;
  }
  const dryPcm = floatBusToS16le(dryBus, totalSamples);
  const wetPcm = floatBusToS16le(wetBus, totalSamples);
  const { dry: dryGain, wet: wetGain } = voiceFxDialGains(params.voiceFxDial);
  const mixed =
    !params.applyFx || wetGain >= 1
      ? params.applyFx
        ? wetPcm
        : dryPcm
      : dryGain >= 1
        ? dryPcm
        : mixDialPcmS16le(dryPcm, wetPcm, dryGain, wetGain);
  const olaMs = elapsedMs(olaStarted);

  const aacStarted = Date.now();
  const deliveryAac = await pcm24kS16leToAac44100(mixed);
  const aacEncodeMs = elapsedMs(aacStarted);

  return {
    deliveryAac,
    dryChunks,
    voiceFxApplied: params.applyFx,
    utf8Bytes: totalBytes,
    timings: {
      sections: sectionTimings,
      phases: {
        ttsPipelineMs: elapsedMs(pipelineStarted),
        ...(fxLoadMs > 0 ? { fxLoadMs } : {}),
        ttsFxLoopMs,
        olaMs,
        aacEncodeMs,
        // Sum only — do not set fxBoardMs/fxInvokeMs (legacy bounce sub-keys).
        ...(params.applyFx && fxTotalMs > 0 ? { fxMs: fxTotalMs } : {}),
      },
    },
  };
}
