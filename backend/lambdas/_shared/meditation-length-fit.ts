/**
 * Meditation length fit: voice pace, predicted stem length, and the pause
 * scaling used before and after audio so the voice stem lands within the
 * delivery-profile tolerance of the requested length.
 */
import {
  parseScriptIntoSegments,
  stripPauseMarkers,
  type ScriptPauseBand,
  type ScriptSegment,
} from "./script-pause-bands";
import { listVoiceSpeakers } from "./voice-admin";
import { loadAllCalibrations } from "./voice-calibration-store";

/** Voices further than this from the median get a pace adjustment, capped at the same amount. */
export const PACE_BAND = 0.05;
/** Only rendered pauses this long or longer are stretched or shortened. */
export const LONG_PAUSE_MIN_SECONDS = 3;
/** Pre-audio scaling keeps each long pause between 60% and 160% of its length. */
export const PRE_AUDIO_SCALE_MIN = 0.6;
export const PRE_AUDIO_SCALE_MAX = 1.6;
/** Post-audio scaling is the last step that brings the stem inside the tolerance. */
export const POST_AUDIO_SCALE_MIN = 0.4;
export const POST_AUDIO_SCALE_MAX = 3;

export type PaceBrand = "fish" | "speechify";

export function median(values: number[]): number | null {
  const sorted = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Factor that moves an outlier to the edge of ±5% of the median, never more
 * than a 5% change. Voices within the band get 1.
 */
export function paceAdjustment(wpm: number | null, medianWpm: number | null): number {
  if (!(wpm != null && wpm > 0) || !(medianWpm != null && medianWpm > 0)) return 1;
  const high = medianWpm * (1 + PACE_BAND);
  const low = medianWpm * (1 - PACE_BAND);
  if (wpm > high) return Math.max(1 - PACE_BAND, high / wpm);
  if (wpm < low) return Math.min(1 + PACE_BAND, low / wpm);
  return 1;
}

export function paceAdjustmentPct(factor: number): number | null {
  const pct = Math.round((factor - 1) * 100);
  return pct === 0 ? null : pct;
}

/** Production slowing before any pace adjustment: Speechify SSML rate, or Fish speed. */
export function productionSlowing(params: {
  brand: PaceBrand;
  speechifyRatePct?: number | null;
  fishSpeed?: number | null;
}): number {
  if (params.brand === "speechify") {
    const r = params.speechifyRatePct;
    return typeof r === "number" && Number.isFinite(r) ? Math.max(0.5, 1 + r / 100) : 1;
  }
  const s = params.fishSpeed;
  return typeof s === "number" && Number.isFinite(s) && s > 0 ? s : 1;
}

export type PaceRow = { modelId: string; brand: PaceBrand; wpm: number | null };

export type PaceEntry = {
  measuredWpm: number | null;
  medianWpm: number | null;
  paceAdjust: number;
};

/** Median and pace adjustment per voice. The median is taken per provider. */
export function voicePaceTable(rows: PaceRow[]): Map<string, PaceEntry> {
  const medians = new Map<PaceBrand, number | null>();
  for (const brand of ["fish", "speechify"] as const) {
    medians.set(
      brand,
      median(rows.filter((r) => r.brand === brand && r.wpm != null).map((r) => r.wpm!)),
    );
  }
  const out = new Map<string, PaceEntry>();
  for (const row of rows) {
    const med = medians.get(row.brand) ?? null;
    const measured = row.wpm != null && row.wpm > 0 ? row.wpm : null;
    out.set(row.modelId, {
      measuredWpm: measured,
      medianWpm: med,
      paceAdjust: paceAdjustment(measured, med),
    });
  }
  return out;
}

export type VoicePace = PaceEntry & {
  slowing: number;
  /** measured (or median) × slowing × pace adjustment. */
  effectiveWpm: number;
  /** True when the voice has its own measurement. */
  measured: boolean;
};

export function resolveVoicePace(params: {
  entry: PaceEntry | undefined;
  slowing: number;
  /** Used only when no voice of this provider has been measured. */
  fallbackWpm: number;
}): VoicePace {
  const entry = params.entry ?? { measuredWpm: null, medianWpm: null, paceAdjust: 1 };
  const base = entry.measuredWpm ?? entry.medianWpm;
  const effectiveWpm =
    base != null ? base * params.slowing * entry.paceAdjust : params.fallbackWpm;
  return {
    ...entry,
    slowing: params.slowing,
    effectiveWpm: Math.max(20, effectiveWpm),
    measured: entry.measuredWpm != null,
  };
}

export function countSpokenWords(script: string): number {
  const plain = stripPauseMarkers(script);
  return plain ? plain.split(/\s+/).filter(Boolean).length : 0;
}

function countCommas(script: string): number {
  return (stripPauseMarkers(script).match(/,(?=\s)/g) ?? []).length;
}

/** Rendered seconds of each segment's pause, split into fixed (short or title) and long. */
function splitPauses(
  segments: ScriptSegment[],
  pauseScale: number,
  fixedSegments: number,
): { fixedSec: number; longSec: number } {
  let fixedSec = 0;
  let longSec = 0;
  segments.forEach((seg, i) => {
    const rendered = seg.pauseSeconds * pauseScale;
    if (rendered <= 0) return;
    if (i >= fixedSegments && rendered >= LONG_PAUSE_MIN_SECONDS) longSec += rendered;
    else fixedSec += rendered;
  });
  return { fixedSec, longSec };
}

export type LengthPrediction = {
  words: number;
  speechSeconds: number;
  /** Pauses under 3 s, plus the title intro. */
  fixedPauseSeconds: number;
  /** Pauses of 3 s or more, at scale 1. */
  longPauseSeconds: number;
  predictedSeconds: number;
};

/** Same conversion production uses: band seconds × render scale, plus Speechify comma breaks. */
export function predictStemLength(params: {
  ttsScript: string;
  effectiveWpm: number;
  pauseBands?: Record<ScriptPauseBand, number>;
  pauseScale: number;
  longPauseScale?: number;
  fixedSegments: number;
  commaBreakSeconds: number;
}): LengthPrediction {
  const segments = parseScriptIntoSegments(params.ttsScript, params.pauseBands);
  const words = countSpokenWords(params.ttsScript);
  const speechSeconds =
    (words / Math.max(1, params.effectiveWpm)) * 60 +
    countCommas(params.ttsScript) * Math.max(0, params.commaBreakSeconds);
  const { fixedSec, longSec } = splitPauses(segments, params.pauseScale, params.fixedSegments);
  return {
    words,
    speechSeconds,
    fixedPauseSeconds: fixedSec,
    longPauseSeconds: longSec,
    predictedSeconds: speechSeconds + fixedSec + longSec * (params.longPauseScale ?? 1),
  };
}

/** Average commas per spoken word in production scripts (Speechify adds a break at each). */
export const COMMAS_PER_WORD = 0.08;
/** Title intro: `[[PAUSE 1s]] title [[PAUSE 3s]]`, as written, plus a short spoken title. */
export const TITLE_INTRO_PAUSE_SECONDS = 4;
export const TITLE_INTRO_SPEECH_SECONDS = 2;

export type LengthPlan = {
  /** Spoken words the script body should contain. */
  words: number;
  /** Sum of the body's [[PAUSE …]] markers, as written (before the render scale). */
  pauseSecondsWritten: number;
  /** Rendered speech target for the whole stem, title included. */
  speechSeconds: number;
  /** Rendered silence target for the whole stem, title intro included. */
  silenceSeconds: number;
};

/**
 * Words and written pause seconds for a target length and silence share,
 * net of the render scale, Speechify comma breaks and the spoken title intro.
 */
export function lengthPlan(params: {
  targetSeconds: number;
  silenceShare: number;
  effectiveWpm: number;
  pauseScale: number;
  commaBreakSeconds: number;
  titleIntro: boolean;
}): LengthPlan {
  const speechSeconds = params.targetSeconds * (1 - params.silenceShare);
  const silenceSeconds = params.targetSeconds * params.silenceShare;
  const bodySpeech = speechSeconds - (params.titleIntro ? TITLE_INTRO_SPEECH_SECONDS : 0);
  const bodySilence =
    silenceSeconds - (params.titleIntro ? TITLE_INTRO_PAUSE_SECONDS * params.pauseScale : 0);
  const secondsPerWord =
    60 / Math.max(1, params.effectiveWpm) + COMMAS_PER_WORD * Math.max(0, params.commaBreakSeconds);
  return {
    words: Math.max(30, Math.round(bodySpeech / secondsPerWord)),
    pauseSecondsWritten: Math.max(0, Math.round(bodySilence / Math.max(0.1, params.pauseScale))),
    speechSeconds,
    silenceSeconds,
  };
}

/**
 * Revision targets: words scale with how far speech is from the delivery's
 * speech share; a pause total is added when the silences are also off.
 */
export function lengthRevisionTargets(params: {
  pred: LengthPrediction;
  plan: LengthPlan;
  pauseScale: number;
  tolerancePct: number;
}): { targetWords: number; pauses: { seconds: number; targetSeconds: number } | null } {
  const { pred, plan } = params;
  const targetWords =
    pred.words > 0 && pred.speechSeconds > 0
      ? Math.round((pred.words * plan.speechSeconds) / pred.speechSeconds)
      : plan.words;
  const pauseRendered = pred.fixedPauseSeconds + pred.longPauseSeconds;
  const pausesOff = !lengthWithin(pauseRendered, plan.silenceSeconds, params.tolerancePct * 2);
  const scale = Math.max(0.1, params.pauseScale);
  return {
    targetWords: Math.max(30, targetWords),
    pauses: pausesOff
      ? {
          seconds: Math.round(pauseRendered / scale),
          targetSeconds: Math.round(plan.silenceSeconds / scale),
        }
      : null,
  };
}

export function lengthWithin(actualSec: number, targetSec: number, tolerancePct: number): boolean {
  if (!(targetSec > 0)) return true;
  return Math.abs(actualSec - targetSec) / targetSec <= Math.max(0, tolerancePct) / 100;
}

/** Long-pause scale that lands the stem on target, clamped. */
export function fitLongPauseScale(params: {
  speechSeconds: number;
  fixedPauseSeconds: number;
  longPauseSeconds: number;
  targetSeconds: number;
  min: number;
  max: number;
}): number {
  if (!(params.longPauseSeconds > 0)) return 1;
  const want =
    (params.targetSeconds - params.speechSeconds - params.fixedPauseSeconds) /
    params.longPauseSeconds;
  return Math.min(params.max, Math.max(params.min, want));
}

/**
 * v9: pause scale band.
 * - Free movement between 1 and planned/written (restore the plan, no 60% floor).
 * - Beyond the plan, word-miss coverage stays within 60–160% of written.
 */
export function pauseScaleLimitsForPlan(params: {
  writtenLongPauseSeconds: number;
  plannedLongPauseSeconds: number;
  bandMin?: number;
  bandMax?: number;
}): { min: number; max: number; planRatio: number } {
  const bandMin = params.bandMin ?? PRE_AUDIO_SCALE_MIN;
  const bandMax = params.bandMax ?? PRE_AUDIO_SCALE_MAX;
  const written = Math.max(0, params.writtenLongPauseSeconds);
  const planned = Math.max(0, params.plannedLongPauseSeconds);
  const planRatio = written > 0 ? planned / written : 1;
  return {
    planRatio,
    min: Math.min(bandMin, Math.min(1, planRatio)),
    max: Math.max(bandMax, Math.max(1, planRatio)),
  };
}

/** Scale that hits target if possible within the v9 plan-aware limits. */
export function fitLongPauseScaleWithPlan(params: {
  speechSeconds: number;
  fixedPauseSeconds: number;
  longPauseSeconds: number;
  plannedLongPauseSeconds: number;
  targetSeconds: number;
  bandMin?: number;
  bandMax?: number;
}): { scale: number; min: number; max: number; canHit: boolean } {
  const { min, max } = pauseScaleLimitsForPlan({
    writtenLongPauseSeconds: params.longPauseSeconds,
    plannedLongPauseSeconds: params.plannedLongPauseSeconds,
    bandMin: params.bandMin,
    bandMax: params.bandMax,
  });
  const scale = fitLongPauseScale({
    speechSeconds: params.speechSeconds,
    fixedPauseSeconds: params.fixedPauseSeconds,
    longPauseSeconds: params.longPauseSeconds,
    targetSeconds: params.targetSeconds,
    min,
    max,
  });
  const at =
    params.speechSeconds +
    params.fixedPauseSeconds +
    params.longPauseSeconds * scale;
  // Exact hit when want was inside [min,max]; otherwise closest edge.
  const want =
    params.longPauseSeconds > 0
      ? (params.targetSeconds -
          params.speechSeconds -
          params.fixedPauseSeconds) /
        params.longPauseSeconds
      : 1;
  const canHit = params.longPauseSeconds > 0 && want >= min && want <= max;
  void at;
  return { scale, min, max, canHit };
}

/** Copy of segments with every long pause (outside the fixed lead) scaled. Seconds stay pre-render. */
export function applyLongPauseScale(
  segments: ScriptSegment[],
  params: { scale: number; pauseScale: number; fixedSegments: number },
): ScriptSegment[] {
  if (Math.abs(params.scale - 1) < 1e-6) return segments;
  return segments.map((seg, i) => {
    const rendered = seg.pauseSeconds * params.pauseScale;
    if (i < params.fixedSegments || rendered < LONG_PAUSE_MIN_SECONDS) return seg;
    return { ...seg, pauseSeconds: seg.pauseSeconds * params.scale };
  });
}

/** Segments the spoken title intro adds ahead of the body (lead silence and title line). */
export function fixedLeadSegments(
  ttsScript: string,
  bodyScript: string,
  pauseBands?: Record<ScriptPauseBand, number>,
): number {
  return Math.max(
    0,
    parseScriptIntoSegments(ttsScript, pauseBands).length -
      parseScriptIntoSegments(bodyScript, pauseBands).length,
  );
}

/** Measured with-pause WPM per catalogue voice, with the provider median and pace adjustment. */
export async function loadVoicePaceTable(): Promise<Map<string, PaceEntry>> {
  const [speakers, docs] = await Promise.all([listVoiceSpeakers(), loadAllCalibrations()]);
  const wpmById = new Map(docs.map((d) => [d.modelId, d.wpm]));
  return voicePaceTable(
    speakers.map((s) => ({
      modelId: s.modelId,
      brand: s.brand === "speechify" ? "speechify" : "fish",
      wpm: wpmById.get(s.modelId) ?? null,
    })),
  );
}
