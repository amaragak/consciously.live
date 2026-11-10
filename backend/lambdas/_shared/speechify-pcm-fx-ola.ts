/**
 * pcm_24000 (s16le mono) → per-segment ffmpeg IR FX → PCM overlap-add → AAC.
 * Speechify and Fish both feed this path with provider-specific TTS.
 */
import type { S3Client } from "@aws-sdk/client-s3";
import {
  parseScriptIntoSegments,
  type ScriptPauseBand,
  type ScriptSegment,
} from "./script-pause-bands";
import {
  applyLongPauseScale,
  fitLongPauseScale,
  lengthWithin,
  LONG_PAUSE_MIN_SECONDS,
  POST_AUDIO_SCALE_MAX,
  POST_AUDIO_SCALE_MIN,
} from "./meditation-length-fit";
import {
  MEDITATION_SPEECHIFY_EMOTION,
  SPEECHIFY_COMMA_BREAK_MS,
  SPEECHIFY_PERIOD_BREAK_MS,
  speechifyTtsPcm24k,
  type SpeechifyEmotionTag,
} from "./speechify-tts";
import { fishTtsPcm24k } from "./fish-tts";
import { loadCommittedVoiceFxContext } from "./voice-fx-apply";
import { voiceFxDialGains } from "./voice-fx-dial";
import {
  applyVoiceFxPcmSegment24k,
  atempoPcm24kS16le,
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
  /** Dial-baked wet delivery AAC @ 44.1 kHz. Empty when encodeAac is false. */
  deliveryAac: Buffer;
  /** Dial-baked wet PCM @ 24 kHz (for stitching sections before one AAC encode). */
  mixedPcm?: Buffer;
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

/*
 * Superseded by the length-fit layout below (speech first, then pauses).
 *
 * /**
 *  * Pipelined: TTS segment N+1 overlaps FX on segment N.
 *  * Pauses are zero samples on the dry/wet buses (tails decay into them).
 *  * /
 * export async function synthesizePcmFxOla(params: {
 *   s3: S3Client;
 *   bucket: string;
 *   script: string;
 *   pauseBands?: Record<ScriptPauseBand, number>;
 *   pauseScale?: number;
 *   /** When false, OLA dry only and encode (no FX). * /
 *   applyFx: boolean;
 *   voiceFxDial: number;
 *   /** Provider TTS → raw s16le mono @ 24 kHz. * /
 *   synthesizePcm24k: (text: string) => Promise<Buffer>;
 *   /** Label for empty-pipeline errors. * /
 *   providerLabel?: string;
 * }): Promise<SpeechifyPcmFxOlaResult> {
 *   const pipelineStarted = Date.now();
 *   const pauseScale =
 *     typeof params.pauseScale === "number" && Number.isFinite(params.pauseScale)
 *       ? params.pauseScale
 *       : 1;
 *   const segments = parseScriptIntoSegments(params.script, params.pauseBands);
 *   const sectionTimings: SpeechifyPcmFxOlaSectionTiming[] = [];
 *   let dryBus: Float32Array = new Float32Array(0);
 *   let wetBus: Float32Array = new Float32Array(0);
 *   let cursor = 0;
 *   /** Furthest sample written on wet (includes FX/reverb tails past dry cursor). * /
 *   let wetExtent = 0;
 *   let totalBytes = 0;
 *   let fxTotalMs = 0;
 *   const dryChunks: SpeechifyDryPcmChunk[] = [];
 *
 *   let fxLoadMs = 0;
 *   let fxCtx: Awaited<ReturnType<typeof loadCommittedVoiceFxContext>> | null =
 *     null;
 *   if (params.applyFx) {
 *     const fxLoadStarted = Date.now();
 *     fxCtx = await loadCommittedVoiceFxContext({
 *       s3: params.s3,
 *       bucket: params.bucket,
 *     });
 *     fxLoadMs = elapsedMs(fxLoadStarted);
 *   }
 *
 *   type Pending = {
 *     pcm: Buffer;
 *     startSample: number;
 *     sectionIndex: number;
 *   };
 *   let fxInFlight: Promise<void> | null = null;
 *
 *   const runFxOla = async (pending: Pending) => {
 *     dryChunks.push({
 *       i: pending.sectionIndex,
 *       startSample: pending.startSample,
 *       pcm: pending.pcm,
 *     });
 *     dryBus = olaAddS16leToFloatBus(dryBus, pending.pcm, pending.startSample);
 *     if (!fxCtx) {
 *       wetBus = olaAddS16leToFloatBus(wetBus, pending.pcm, pending.startSample);
 *       wetExtent = Math.max(
 *         wetExtent,
 *         pending.startSample + pending.pcm.byteLength / 2,
 *       );
 *       return;
 *     }
 *     const fx = await applyVoiceFxPcmSegment24k({
 *       dryPcm: pending.pcm,
 *       settings: fxCtx.settings,
 *       irWav: fxCtx.irWav,
 *     });
 *     fxTotalMs += fx.ms;
 *     const sec = sectionTimings[pending.sectionIndex];
 *     if (sec) sec.fxMs = fx.ms;
 *     wetBus = olaAddS16leToFloatBus(wetBus, fx.wetPcm, pending.startSample);
 *     wetExtent = Math.max(
 *       wetExtent,
 *       pending.startSample + fx.wetPcm.byteLength / 2,
 *     );
 *   };
 *
 *   const speechSegments =
 *     segments.length > 0
 *       ? segments
 *       : [{ text: params.script, pauseSeconds: 0 }];
 *
 *   const loopStarted = Date.now();
 *   for (let i = 0; i < speechSegments.length; i++) {
 *     const seg = speechSegments[i]!;
 *     const clean = sanitizeScriptForTts(seg.text);
 *
 *     if (clean) {
 *       const utf8Bytes = Buffer.byteLength(clean, "utf8");
 *       totalBytes += utf8Bytes;
 *       const ttsStarted = Date.now();
 *       const pcm = await params.synthesizePcm24k(clean);
 *       if (pcm.byteLength % 2 !== 0) {
 *         throw new Error(
 *           `${params.providerLabel ?? "TTS"} PCM length is not s16le-aligned`,
 *         );
 *       }
 *       const sectionIndex = sectionTimings.length;
 *       sectionTimings.push({
 *         i: sectionIndex,
 *         ttsMs: elapsedMs(ttsStarted),
 *         utf8Bytes,
 *         pauseSec:
 *           seg.pauseSeconds > 0 ? seg.pauseSeconds * pauseScale : undefined,
 *       });
 *
 *       if (fxInFlight) await fxInFlight;
 *       const startSample = cursor;
 *       cursor += pcm.byteLength / 2;
 *       fxInFlight = runFxOla({ pcm, startSample, sectionIndex });
 *     }
 *
 *     if (seg.pauseSeconds > 0) {
 *       const pauseSamples = Math.round(
 *         seg.pauseSeconds * pauseScale * VOICE_FX_PCM_SR,
 *       );
 *       cursor += Math.max(0, pauseSamples);
 *       if (!clean) {
 *         sectionTimings.push({
 *           i: sectionTimings.length,
 *           ttsMs: 0,
 *           utf8Bytes: 0,
 *           pauseSec: seg.pauseSeconds * pauseScale,
 *         });
 *       }
 *     }
 *   }
 *
 *   if (fxInFlight) await fxInFlight;
 *   const ttsFxLoopMs = elapsedMs(loopStarted);
 *
 *   if (cursor <= 0) {
 *     throw new Error(
 *       `${params.providerLabel ?? "TTS"} PCM pipeline produced no samples`,
 *     );
 *   }
 *
 *   const olaStarted = Date.now();
 *   // Delivery length = dry timeline (speech + pauses) OR wet extent with FX tails —
 *   // never truncate the final reverb/echo tail to the dry cursor.
 *   const totalSamples = Math.max(cursor, wetExtent);
 *   if (dryBus.length < totalSamples) {
 *     const next = new Float32Array(totalSamples);
 *     next.set(dryBus);
 *     dryBus = next;
 *   }
 *   if (wetBus.length < totalSamples) {
 *     const next = new Float32Array(totalSamples);
 *     next.set(wetBus);
 *     wetBus = next;
 *   }
 *   const dryPcm = floatBusToS16le(dryBus, totalSamples);
 *   const wetPcm = floatBusToS16le(wetBus, totalSamples);
 *   const { dry: dryGain, wet: wetGain } = voiceFxDialGains(params.voiceFxDial);
 *   const mixed =
 *     !params.applyFx || wetGain >= 1
 *       ? params.applyFx
 *         ? wetPcm
 *         : dryPcm
 *       : dryGain >= 1
 *         ? dryPcm
 *         : mixDialPcmS16le(dryPcm, wetPcm, dryGain, wetGain);
 *   const olaMs = elapsedMs(olaStarted);
 *
 *   const aacStarted = Date.now();
 *   const deliveryAac = await pcm24kS16leToAac44100(mixed);
 *   const aacEncodeMs = elapsedMs(aacStarted);
 *
 *   return {
 *     deliveryAac,
 *     dryChunks,
 *     voiceFxApplied: params.applyFx,
 *     utf8Bytes: totalBytes,
 *     timings: {
 *       sections: sectionTimings,
 *       phases: {
 *         ttsPipelineMs: elapsedMs(pipelineStarted),
 *         ...(fxLoadMs > 0 ? { fxLoadMs } : {}),
 *         ttsFxLoopMs,
 *         olaMs,
 *         aacEncodeMs,
 *         // Sum only — do not set fxBoardMs/fxInvokeMs (legacy bounce sub-keys).
 *         ...(params.applyFx && fxTotalMs > 0 ? { fxMs: fxTotalMs } : {}),
 *       },
 *     },
 *   };
 * }
 */

export type PcmLengthFitResult = {
  /** Spoken audio on the dry timeline, seconds. */
  speechSeconds: number;
  /** Silence the pipeline inserted, seconds. */
  pauseSeconds: number;
  /** Dry timeline length (speech + pauses), seconds. */
  stemSeconds: number;
  /** Long-pause scale used after the audio check (includes the pre-audio scale). */
  longPauseScale: number;
  /** True when the measured audio missed the tolerance and pauses were rescaled. */
  postScaled: boolean;
};

/**
 * TTS segment N+1 overlaps FX on segment N. Speech is placed on the timeline
 * only once every segment exists, so long pauses can be fitted to the real
 * speech length. Pauses are zero samples on the dry/wet buses (tails decay into them).
 */
export async function synthesizePcmFxOla(params: {
  s3: S3Client;
  bucket: string;
  script: string;
  pauseBands?: Record<ScriptPauseBand, number>;
  pauseScale?: number;
  /** When false, OLA dry only and encode (no FX). */
  applyFx: boolean;
  voiceFxDial: number;
  /** Provider TTS → raw s16le mono @ 24 kHz. */
  synthesizePcm24k: (text: string) => Promise<Buffer>;
  /** Label for empty-pipeline errors. */
  providerLabel?: string;
  /** ffmpeg atempo on each speech segment before FX (pace adjustment). 1 = none. */
  speechTempo?: number;
  /** Pre-audio scale for pauses of 3 s or more. */
  longPauseScale?: number;
  /** Rescale long pauses when the real audio misses the target by more than the tolerance. */
  lengthFit?: { targetSeconds: number; tolerancePct: number; fixedSegments: number; maxScale?: number };
  /** When false, skip the final AAC encode and return mixedPcm for stitching. */
  encodeAac?: boolean;
}): Promise<SpeechifyPcmFxOlaResult & { lengthFit: PcmLengthFitResult }> {
  const pipelineStarted = Date.now();
  const pauseScale =
    typeof params.pauseScale === "number" && Number.isFinite(params.pauseScale)
      ? params.pauseScale
      : 1;
  const speechTempo =
    typeof params.speechTempo === "number" && params.speechTempo > 0 ? params.speechTempo : 1;
  const fixedSegments = params.lengthFit?.fixedSegments ?? 0;
  const parsed = parseScriptIntoSegments(params.script, params.pauseBands);
  const segments: ScriptSegment[] =
    parsed.length > 0 ? parsed : [{ text: params.script, pauseSeconds: 0 }];
  const sectionTimings: SpeechifyPcmFxOlaSectionTiming[] = [];
  let totalBytes = 0;
  let fxTotalMs = 0;

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

  type Rendered = { sectionIndex: number; dry: Buffer; wet: Buffer };
  /** Keyed by segment index. */
  const rendered = new Map<number, Rendered>();
  /** Section timing row for each segment index. */
  const sectionForSegment = new Map<number, number>();
  let fxInFlight: Promise<void> | null = null;

  const runFx = async (segIndex: number, sectionIndex: number, pcm: Buffer) => {
    if (!fxCtx) {
      rendered.set(segIndex, { sectionIndex, dry: pcm, wet: pcm });
      return;
    }
    const fx = await applyVoiceFxPcmSegment24k({
      dryPcm: pcm,
      settings: fxCtx.settings,
      irWav: fxCtx.irWav,
    });
    fxTotalMs += fx.ms;
    const sec = sectionTimings[sectionIndex];
    if (sec) sec.fxMs = fx.ms;
    rendered.set(segIndex, { sectionIndex, dry: pcm, wet: fx.wetPcm });
  };

  const loopStarted = Date.now();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const clean = sanitizeScriptForTts(seg.text);
    if (clean) {
      const utf8Bytes = Buffer.byteLength(clean, "utf8");
      totalBytes += utf8Bytes;
      const ttsStarted = Date.now();
      let pcm = await params.synthesizePcm24k(clean);
      if (pcm.byteLength % 2 !== 0) {
        throw new Error(
          `${params.providerLabel ?? "TTS"} PCM length is not s16le-aligned`,
        );
      }
      pcm = await atempoPcm24kS16le(pcm, speechTempo);
      const sectionIndex = sectionTimings.length;
      sectionTimings.push({ i: sectionIndex, ttsMs: elapsedMs(ttsStarted), utf8Bytes });
      sectionForSegment.set(i, sectionIndex);
      if (fxInFlight) await fxInFlight;
      fxInFlight = runFx(i, sectionIndex, pcm);
    } else if (seg.pauseSeconds > 0) {
      const sectionIndex = sectionTimings.length;
      sectionTimings.push({ i: sectionIndex, ttsMs: 0, utf8Bytes: 0 });
      sectionForSegment.set(i, sectionIndex);
    }
  }
  if (fxInFlight) await fxInFlight;
  const ttsFxLoopMs = elapsedMs(loopStarted);

  let speechSamples = 0;
  for (const r of rendered.values()) speechSamples += r.dry.byteLength / 2;
  const speechSeconds = speechSamples / VOICE_FX_PCM_SR;

  const preScale =
    typeof params.longPauseScale === "number" && params.longPauseScale > 0
      ? params.longPauseScale
      : 1;
  let fixedPauseSeconds = 0;
  let longPauseSeconds = 0;
  segments.forEach((seg, i) => {
    const sec = seg.pauseSeconds * pauseScale;
    if (sec <= 0) return;
    if (i >= fixedSegments && sec >= LONG_PAUSE_MIN_SECONDS) longPauseSeconds += sec;
    else fixedPauseSeconds += sec;
  });
  let longPauseScale = preScale;
  let postScaled = false;
  if (params.lengthFit) {
    const stemAtPre = speechSeconds + fixedPauseSeconds + longPauseSeconds * preScale;
    if (
      !lengthWithin(stemAtPre, params.lengthFit.targetSeconds, params.lengthFit.tolerancePct)
    ) {
      longPauseScale = fitLongPauseScale({
        speechSeconds,
        fixedPauseSeconds,
        longPauseSeconds,
        targetSeconds: params.lengthFit.targetSeconds,
        min: POST_AUDIO_SCALE_MIN,
        max: Math.min(POST_AUDIO_SCALE_MAX, params.lengthFit.maxScale ?? POST_AUDIO_SCALE_MAX),
      });
      postScaled = Math.abs(longPauseScale - preScale) > 1e-3;
    }
  }
  const finalSegments = applyLongPauseScale(segments, {
    scale: longPauseScale,
    pauseScale,
    fixedSegments,
  });

  const olaStarted = Date.now();
  const dryChunks: SpeechifyDryPcmChunk[] = [];
  let cursor = 0;
  let wetExtent = 0;
  const placements: Array<{ start: number; r: Rendered }> = [];
  let pauseSamplesTotal = 0;
  finalSegments.forEach((seg, i) => {
    const r = rendered.get(i);
    if (r) {
      placements.push({ start: cursor, r });
      cursor += r.dry.byteLength / 2;
      wetExtent = Math.max(wetExtent, placements[placements.length - 1]!.start + r.wet.byteLength / 2);
    }
    if (seg.pauseSeconds > 0) {
      const pauseSamples = Math.max(0, Math.round(seg.pauseSeconds * pauseScale * VOICE_FX_PCM_SR));
      cursor += pauseSamples;
      pauseSamplesTotal += pauseSamples;
      const sectionIndex = sectionForSegment.get(i);
      const row = sectionIndex != null ? sectionTimings[sectionIndex] : undefined;
      if (row) row.pauseSec = seg.pauseSeconds * pauseScale;
    }
  });

  if (cursor <= 0) {
    throw new Error(
      `${params.providerLabel ?? "TTS"} PCM pipeline produced no samples`,
    );
  }

  // Delivery length = dry timeline (speech + pauses) OR wet extent with FX tails —
  // never truncate the final reverb/echo tail to the dry cursor.
  const totalSamples = Math.max(cursor, wetExtent);
  let dryBus: Float32Array = new Float32Array(totalSamples);
  let wetBus: Float32Array = new Float32Array(totalSamples);
  for (const { start, r } of placements) {
    dryChunks.push({ i: r.sectionIndex, startSample: start, pcm: r.dry });
    dryBus = olaAddS16leToFloatBus(dryBus, r.dry, start);
    wetBus = olaAddS16leToFloatBus(wetBus, r.wet, start);
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
  const wantAac = params.encodeAac !== false;
  const deliveryAac = wantAac ? await pcm24kS16leToAac44100(mixed) : Buffer.alloc(0);
  const aacEncodeMs = wantAac ? elapsedMs(aacStarted) : 0;

  return {
    deliveryAac,
    mixedPcm: mixed,
    dryChunks,
    voiceFxApplied: params.applyFx,
    utf8Bytes: totalBytes,
    lengthFit: {
      speechSeconds,
      pauseSeconds: pauseSamplesTotal / VOICE_FX_PCM_SR,
      stemSeconds: cursor / VOICE_FX_PCM_SR,
      longPauseScale,
      postScaled,
    },
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

type LengthFitOptions = {
  speechTempo?: number;
  longPauseScale?: number;
  lengthFit?: { targetSeconds: number; tolerancePct: number; fixedSegments: number; maxScale?: number };
  encodeAac?: boolean;
};

export type PcmFxOlaWithFit = SpeechifyPcmFxOlaResult & { lengthFit: PcmLengthFitResult };

/** Speechify pcm_24000 → FX OLA → AAC. */
export async function synthesizeSpeechifyPcmFxOla(params: {
  s3: S3Client;
  bucket: string;
  apiKey: string;
  script: string;
  voiceId: string;
  speechifyRate?: string;
  emotion?: SpeechifyEmotionTag | null;
  speechifyLoudnessNormalization?: boolean;
  /** Break after every `.`, `?` and `!`. */
  sentenceBreakMs?: number;
  pauseBands?: Record<ScriptPauseBand, number>;
  pauseScale?: number;
  applyFx: boolean;
  voiceFxDial: number;
} & LengthFitOptions): Promise<PcmFxOlaWithFit> {
  return synthesizePcmFxOla({
    s3: params.s3,
    bucket: params.bucket,
    script: params.script,
    pauseBands: params.pauseBands,
    pauseScale: params.pauseScale,
    applyFx: params.applyFx,
    voiceFxDial: params.voiceFxDial,
    speechTempo: params.speechTempo,
    longPauseScale: params.longPauseScale,
    lengthFit: params.lengthFit,
    encodeAac: params.encodeAac,
    providerLabel: "Speechify",
    synthesizePcm24k: (text) =>
      speechifyTtsPcm24k({
        apiKey: params.apiKey,
        text,
        voiceId: params.voiceId,
        rate: params.speechifyRate,
        emotion: params.emotion ?? MEDITATION_SPEECHIFY_EMOTION,
        loudnessNormalization: params.speechifyLoudnessNormalization,
        sentenceBreakMs: params.sentenceBreakMs ?? SPEECHIFY_PERIOD_BREAK_MS,
        breakAllSentenceEnds: true,
        commaBreakMs: SPEECHIFY_COMMA_BREAK_MS,
      }),
  });
}

/** Fish pcm @ 24 kHz → same FX OLA → AAC path as Speechify. */
export async function synthesizeFishPcmFxOla(params: {
  s3: S3Client;
  bucket: string;
  apiKey: string;
  script: string;
  voiceId: string;
  speed: number;
  fishTtsModel?: string;
  pauseBands?: Record<ScriptPauseBand, number>;
  pauseScale?: number;
  applyFx: boolean;
  voiceFxDial: number;
} & LengthFitOptions): Promise<PcmFxOlaWithFit> {
  return synthesizePcmFxOla({
    s3: params.s3,
    bucket: params.bucket,
    script: params.script,
    pauseBands: params.pauseBands,
    pauseScale: params.pauseScale,
    applyFx: params.applyFx,
    voiceFxDial: params.voiceFxDial,
    speechTempo: params.speechTempo,
    longPauseScale: params.longPauseScale,
    lengthFit: params.lengthFit,
    encodeAac: params.encodeAac,
    providerLabel: "Fish",
    synthesizePcm24k: (text) =>
      fishTtsPcm24k({
        apiKey: params.apiKey,
        text,
        referenceId: params.voiceId,
        speed: params.speed,
        model: params.fishTtsModel,
        feature: "meditation-tts",
      }),
  });
}
