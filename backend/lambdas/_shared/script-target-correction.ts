/**
 * Correction factors per length × delivery (word + pause).
 * Set only by the Admin calibration batch — not learned live.
 *
 * v9 buckets (first/last/middle/single, EMA learn) superseded; kept commented
 * at the bottom for reference.
 */
import type { DeliveryId } from "./delivery-profiles";
import {
  coerceMeditationTargetMinutes,
  type MeditationTargetMinutes,
} from "./meditation-target-minutes";

export type ScriptLengthMinutes = MeditationTargetMinutes; // 5 | 10 | 20

export type LengthDeliveryFactors = {
  /** Multiply every section / single-call word target. */
  words: number;
  /** Multiply every section / single-call pause-seconds target. */
  pauses: number;
  /** ISO time when the calibration batch last set these. */
  setAt: string | null;
  /** How many scripts the batch used for this cell (usually 3). */
  sampleCount: number;
};

export type DeliveryLengthCorrection = Record<
  "5" | "10" | "20",
  LengthDeliveryFactors
>;

export type ScriptTargetCorrection = Record<DeliveryId, DeliveryLengthCorrection>;

export const CORRECTION_MIN = 0.5;
export const CORRECTION_MAX = 1.5;

export const SCRIPT_LENGTH_KEYS = ["5", "10", "20"] as const;

export function defaultLengthDeliveryFactors(): LengthDeliveryFactors {
  return {
    words: 1,
    pauses: 1,
    setAt: null,
    sampleCount: 0,
  };
}

export function defaultDeliveryLengthCorrection(): DeliveryLengthCorrection {
  return {
    "5": defaultLengthDeliveryFactors(),
    "10": defaultLengthDeliveryFactors(),
    "20": defaultLengthDeliveryFactors(),
  };
}

export function defaultScriptTargetCorrection(): ScriptTargetCorrection {
  return {
    casual: defaultDeliveryLengthCorrection(),
    guided: defaultDeliveryLengthCorrection(),
    open_sits: defaultDeliveryLengthCorrection(),
  };
}

function clampFactor(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(CORRECTION_MAX, Math.max(CORRECTION_MIN, n));
}

function asFactor(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return clampFactor(Number.isFinite(n) ? n : fallback);
}

function coerceCell(raw: unknown): LengthDeliveryFactors {
  const d = defaultLengthDeliveryFactors();
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Record<string, unknown>;
  // Legacy v9 shape { first, last, middle, single } → identity defaults.
  if ("first" in o || "middle" in o || "single" in o) return { ...d };
  return {
    words: asFactor(o.words, d.words),
    pauses: asFactor(o.pauses, d.pauses),
    setAt: typeof o.setAt === "string" && o.setAt.trim() ? o.setAt.trim() : null,
    sampleCount:
      typeof o.sampleCount === "number" && Number.isFinite(o.sampleCount)
        ? Math.max(0, Math.round(o.sampleCount))
        : 0,
  };
}

export function lengthKeyForMinutes(minutes: number): "5" | "10" | "20" {
  const m = coerceMeditationTargetMinutes(minutes);
  return String(m) as "5" | "10" | "20";
}

export function coerceScriptTargetCorrection(raw: unknown): ScriptTargetCorrection {
  const base = defaultScriptTargetCorrection();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const out = { ...base };
  for (const id of ["casual", "guided", "open_sits"] as const) {
    const row = o[id];
    if (!row || typeof row !== "object") {
      out[id] = defaultDeliveryLengthCorrection();
      continue;
    }
    const r = row as Record<string, unknown>;
    // Legacy v9: delivery → { first, last, middle, single }
    if ("first" in r || "middle" in r || "single" in r) {
      out[id] = defaultDeliveryLengthCorrection();
      continue;
    }
    out[id] = {
      "5": coerceCell(r["5"] ?? r[5 as unknown as string]),
      "10": coerceCell(r["10"] ?? r[10 as unknown as string]),
      "20": coerceCell(r["20"] ?? r[20 as unknown as string]),
    };
  }
  return out;
}

export function factorsFor(
  correction: ScriptTargetCorrection,
  delivery: DeliveryId,
  minutes: number,
): LengthDeliveryFactors {
  const key = lengthKeyForMinutes(minutes);
  return (
    correction[delivery]?.[key] ?? defaultLengthDeliveryFactors()
  );
}

/** Multiply a target by the factor; words round to nearest 5 (min 5). */
export function applyCorrectionToWords(words: number, factor: number): number {
  const n = Math.round((Math.max(0, words) * clampFactor(factor)) / 5) * 5;
  return Math.max(5, n);
}

export function applyCorrectionToPauseSeconds(
  pauseSeconds: number,
  factor: number,
): number {
  return Math.max(0, Math.round(Math.max(0, pauseSeconds) * clampFactor(factor)));
}

/**
 * Word factor = Σ target words ÷ Σ written words.
 * Pause factor = Σ planned pause ÷ Σ written pause.
 * Clamp 0.5–1.5.
 */
export function computeLengthDeliveryFactors(params: {
  targetWords: number;
  writtenWords: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  sampleCount: number;
  setAt?: string;
}): LengthDeliveryFactors {
  const words =
    params.writtenWords > 0 ? params.targetWords / params.writtenWords : 1;
  const pauses =
    params.writtenPauseSeconds > 0
      ? params.plannedPauseSeconds / params.writtenPauseSeconds
      : 1;
  return {
    words: clampFactor(words),
    pauses: clampFactor(pauses),
    setAt: params.setAt ?? new Date().toISOString(),
    sampleCount: Math.max(0, params.sampleCount),
  };
}

export function correctionHasCalibratedSamples(
  correction: ScriptTargetCorrection,
): boolean {
  for (const d of ["casual", "guided", "open_sits"] as const) {
    for (const k of SCRIPT_LENGTH_KEYS) {
      if ((correction[d]?.[k]?.sampleCount ?? 0) > 0) return true;
    }
  }
  return false;
}

/* ─── v9 superseded ─────────────────────────────────────────────────────────
export type CorrectionBucket = "first" | "last" | "middle" | "single";
export type DeliveryCorrectionFactors = Record<CorrectionBucket, number>;
export const CORRECTION_LEARN_WEIGHT = 0.05;
export function defaultDeliveryCorrectionFactors(): DeliveryCorrectionFactors {
  return { first: 0.78, last: 0.78, middle: 0.88, single: 1.0 };
}
export function correctionBucketForSection(index: number, sectionCount: number): CorrectionBucket {
  if (sectionCount <= 1) return "single";
  if (index === 0) return "first";
  if (index === sectionCount - 1) return "last";
  return "middle";
}
export function factorFor(correction, delivery, bucket) { ... }
export function learnCorrectionFactor(...) { ... }
export function learnFromSectionMeasures(...) { ... }
export function learnFromSingleScript(...) { ... }
─────────────────────────────────────────────────────────────────────────── */
