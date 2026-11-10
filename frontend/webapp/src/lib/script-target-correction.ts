/** Mirror of backend script-target-correction.ts for Admin › Delivery profiles. */

export type LengthDeliveryFactors = {
  words: number;
  pauses: number;
  setAt: string | null;
  sampleCount: number;
};

export type DeliveryLengthCorrection = Record<
  "5" | "10" | "20",
  LengthDeliveryFactors
>;

export type ScriptTargetCorrection = Record<
  "casual" | "guided" | "open_sits",
  DeliveryLengthCorrection
>;

const MIN = 0.5;
const MAX = 1.5;

export function defaultLengthDeliveryFactors(): LengthDeliveryFactors {
  return { words: 1, pauses: 1, setAt: null, sampleCount: 0 };
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

function clamp(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(MAX, Math.max(MIN, n));
}

function cell(raw: unknown): LengthDeliveryFactors {
  const d = defaultLengthDeliveryFactors();
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Record<string, unknown>;
  if ("first" in o || "middle" in o || "single" in o) return { ...d };
  const num = (v: unknown, fb: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? clamp(n) : fb;
  };
  return {
    words: num(o.words, d.words),
    pauses: num(o.pauses, d.pauses),
    setAt: typeof o.setAt === "string" && o.setAt.trim() ? o.setAt.trim() : null,
    sampleCount:
      typeof o.sampleCount === "number" && Number.isFinite(o.sampleCount)
        ? Math.max(0, Math.round(o.sampleCount))
        : 0,
  };
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
    if ("first" in r || "middle" in r || "single" in r) {
      out[id] = defaultDeliveryLengthCorrection();
      continue;
    }
    out[id] = {
      "5": cell(r["5"]),
      "10": cell(r["10"]),
      "20": cell(r["20"]),
    };
  }
  return out;
}

export function correctionHasCalibratedSamples(
  correction: ScriptTargetCorrection,
): boolean {
  for (const d of ["casual", "guided", "open_sits"] as const) {
    for (const k of ["5", "10", "20"] as const) {
      if ((correction[d]?.[k]?.sampleCount ?? 0) > 0) return true;
    }
  }
  return false;
}

/** @deprecated v9 */
export type CorrectionBucket = "first" | "last" | "middle" | "single";
