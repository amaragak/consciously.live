/**
 * Silence-fit mode settings: speaking bands + longest silence per option × length.
 * Stored on ScriptGenerationSettings.silenceFit.
 *
 * Speaking share for budgets comes from Delivery profiles silence share
 * (speaking = 1 − silence). Stored speakingBandMin/Max are legacy; accuracy
 * bands are derived as speaking share ±10 points.
 */
import {
  speechShareFor,
  type DeliveryId,
  type DeliveryProfiles,
} from "./delivery-profiles";

export type SilenceFitOptionId = "guided" | "guided_casual" | "open_sits";
export type SilenceFitLengthKey = "5" | "10" | "20";

/** Display / batch order: Casual → Guided → Open sits. */
export const SILENCE_FIT_OPTIONS: readonly SilenceFitOptionId[] = [
  "guided_casual",
  "guided",
  "open_sits",
] as const;

export const SILENCE_FIT_LENGTHS: readonly SilenceFitLengthKey[] = [
  "5",
  "10",
  "20",
] as const;

export type SilenceFitCellSettings = {
  /** Min share of script time that is speech (0–1). */
  speakingBandMin: number;
  /** Max share of script time that is speech (0–1). */
  speakingBandMax: number;
  /** Longest single silence (seconds). */
  longestSingleSilenceSeconds: number;
};

export type SilenceFitModeSettings = {
  byOptionLength: Record<
    SilenceFitOptionId,
    Record<SilenceFitLengthKey, SilenceFitCellSettings>
  >;
  /** Shortest long pause (seconds) — fallback / Guided+Open default. */
  shortestLongPauseSeconds: number;
  /**
   * Per-option shortest long pause. Casual defaults to 4s; Guided / Open sits
   * to 8s (own-pauses mid-band pack).
   */
  shortestLongPauseByOption: Record<SilenceFitOptionId, number>;
  /** Short-pause adjustment limit as fraction (0.5 = ±50%). */
  shortPauseAdjustLimit: number;
  /** Extra closing music allowed (seconds). */
  extraClosingMusicSeconds: number;
  /**
   * Measured words/sentence per option (from silence-fit cells).
   * Falls back to time-based nearest pacing, then 12.
   */
  wordsPerSentenceByOption: Record<
    SilenceFitOptionId,
    { wordsPerSentence: number; scriptCount: number }
  >;
};

export const SILENCE_FIT_OPTION_LABEL: Record<SilenceFitOptionId, string> = {
  guided_casual: "Casual",
  guided: "Guided",
  open_sits: "Open sits",
};

/** Map create-flow delivery → silence-fit option (no create UI change). */
export function silenceFitOptionFromDelivery(
  delivery: DeliveryId,
): SilenceFitOptionId {
  if (delivery === "casual") return "guided_casual";
  if (delivery === "open_sits") return "open_sits";
  return "guided";
}

/** Silence-fit option → Delivery profiles delivery (for silence / speaking share). */
export function deliveryIdForSilenceFitOption(
  option: SilenceFitOptionId,
): DeliveryId {
  if (option === "guided_casual") return "casual";
  if (option === "open_sits") return "open_sits";
  return "guided";
}

/**
 * Speaking share for budgets / targets: 1 − that delivery's silence share.
 * Same at every length. Single source: Delivery profiles.
 */
export function silenceFitSpeakingShare(
  profiles: DeliveryProfiles,
  option: SilenceFitOptionId,
): number {
  return speechShareFor(profiles, deliveryIdForSilenceFitOption(option));
}

/**
 * Accuracy speaking band = speaking share ± 10 percentage points.
 * (Stored cell bands are no longer the source of truth.)
 */
export function silenceFitAutoSpeakingBands(speakingShare: number): {
  speakingBandMin: number;
  speakingBandMax: number;
} {
  const share = clamp01(speakingShare);
  let min = clamp01(share - 0.1);
  let max = clamp01(share + 0.1);
  if (max < min) {
    const t = min;
    min = max;
    max = t;
  }
  return { speakingBandMin: min, speakingBandMax: max };
}

/** Nearest time-based pacing for WPS fallback. */
export function timePacingForSilenceOption(
  option: SilenceFitOptionId,
): DeliveryId {
  if (option === "open_sits") return "open_sits";
  // guided + guided_casual use guided time-based scripts
  return "guided";
}

function cell(
  speakingBandMinPct: number,
  speakingBandMaxPct: number,
  longestSingleSilenceSeconds: number,
): SilenceFitCellSettings {
  return {
    speakingBandMin: speakingBandMinPct / 100,
    speakingBandMax: speakingBandMaxPct / 100,
    longestSingleSilenceSeconds,
  };
}

export function defaultSilenceFitModeSettings(): SilenceFitModeSettings {
  return {
    byOptionLength: {
      guided: {
        "5": cell(55, 70, 30),
        "10": cell(45, 60, 45),
        "20": cell(45, 60, 60),
      },
      guided_casual: {
        "5": cell(65, 80, 15),
        "10": cell(55, 70, 20),
        "20": cell(55, 70, 20),
      },
      open_sits: {
        "5": cell(35, 50, 60),
        "10": cell(20, 35, 120),
        "20": cell(20, 35, 180),
      },
    },
    // Was: shortestLongPauseSeconds: 8 for all options.
    shortestLongPauseSeconds: 8,
    shortestLongPauseByOption: {
      guided_casual: 4,
      guided: 8,
      open_sits: 8,
    },
    // Was: shortPauseAdjustLimit: 0.2 (±20%).
    shortPauseAdjustLimit: 0.5,
    extraClosingMusicSeconds: 30,
    wordsPerSentenceByOption: {
      guided: { wordsPerSentence: 12, scriptCount: 0 },
      guided_casual: { wordsPerSentence: 12, scriptCount: 0 },
      open_sits: { wordsPerSentence: 12, scriptCount: 0 },
    },
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(0.95, Math.max(0.05, n));
}

function coerceCell(
  raw: unknown,
  fallback: SilenceFitCellSettings,
): SilenceFitCellSettings {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const o = raw as Record<string, unknown>;
  let min = Number(o.speakingBandMin);
  let max = Number(o.speakingBandMax);
  if (!Number.isFinite(min)) min = fallback.speakingBandMin;
  if (!Number.isFinite(max)) max = fallback.speakingBandMax;
  min = clamp01(min);
  max = clamp01(max);
  if (max < min) {
    const t = min;
    min = max;
    max = t;
  }
  const longest = Number(o.longestSingleSilenceSeconds);
  return {
    speakingBandMin: min,
    speakingBandMax: max,
    longestSingleSilenceSeconds:
      Number.isFinite(longest) && longest > 0
        ? Math.round(longest * 10) / 10
        : fallback.longestSingleSilenceSeconds,
  };
}

export function coerceSilenceFitModeSettings(
  raw: unknown,
): SilenceFitModeSettings {
  const base = defaultSilenceFitModeSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const byRaw =
    o.byOptionLength && typeof o.byOptionLength === "object"
      ? (o.byOptionLength as Record<string, unknown>)
      : {};
  for (const opt of SILENCE_FIT_OPTIONS) {
    const rowRaw =
      byRaw[opt] && typeof byRaw[opt] === "object"
        ? (byRaw[opt] as Record<string, unknown>)
        : {};
    for (const len of SILENCE_FIT_LENGTHS) {
      base.byOptionLength[opt][len] = coerceCell(
        rowRaw[len],
        base.byOptionLength[opt][len],
      );
    }
  }
  const shortest = Number(o.shortestLongPauseSeconds);
  if (Number.isFinite(shortest) && shortest > 0) {
    base.shortestLongPauseSeconds = Math.round(shortest * 10) / 10;
    // Legacy single value: apply to Guided / Open sits; keep Casual at 4.
    base.shortestLongPauseByOption.guided = base.shortestLongPauseSeconds;
    base.shortestLongPauseByOption.open_sits = base.shortestLongPauseSeconds;
  }
  const byShort =
    o.shortestLongPauseByOption && typeof o.shortestLongPauseByOption === "object"
      ? (o.shortestLongPauseByOption as Record<string, unknown>)
      : {};
  for (const opt of SILENCE_FIT_OPTIONS) {
    const v = Number(byShort[opt]);
    if (Number.isFinite(v) && v > 0) {
      base.shortestLongPauseByOption[opt] = Math.round(v * 10) / 10;
    }
  }
  const adj = Number(o.shortPauseAdjustLimit);
  if (Number.isFinite(adj) && adj >= 0) {
    // Was: Math.min(0.5, …) — allow edit above the ±50% default.
    base.shortPauseAdjustLimit = Math.min(1, Math.max(0, adj));
  }
  const extra = Number(o.extraClosingMusicSeconds);
  if (Number.isFinite(extra) && extra >= 0) {
    base.extraClosingMusicSeconds = Math.round(extra * 10) / 10;
  }
  const wpsRaw =
    o.wordsPerSentenceByOption && typeof o.wordsPerSentenceByOption === "object"
      ? (o.wordsPerSentenceByOption as Record<string, unknown>)
      : {};
  for (const opt of SILENCE_FIT_OPTIONS) {
    const row = wpsRaw[opt];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const wps = Number(r.wordsPerSentence);
    const n = Number(r.scriptCount);
    base.wordsPerSentenceByOption[opt] = {
      wordsPerSentence:
        Number.isFinite(wps) && wps > 0 ? Math.round(wps * 10) / 10 : 12,
      scriptCount: Number.isFinite(n) && n > 0 ? Math.round(n) : 0,
    };
  }
  return base;
}

export function silenceFitShortestLongPause(
  settings: SilenceFitModeSettings,
  option: SilenceFitOptionId,
): number {
  const by = settings.shortestLongPauseByOption?.[option];
  if (typeof by === "number" && Number.isFinite(by) && by > 0) return by;
  if (option === "guided_casual") return 4;
  return settings.shortestLongPauseSeconds > 0
    ? settings.shortestLongPauseSeconds
    : 8;
}

export function silenceFitCellFor(
  settings: SilenceFitModeSettings,
  option: SilenceFitOptionId,
  minutes: number,
): SilenceFitCellSettings {
  const key = (
    minutes <= 5 ? "5" : minutes <= 10 ? "10" : "20"
  ) as SilenceFitLengthKey;
  return settings.byOptionLength[option][key];
}

/**
 * Minimum long pauses K: enough that needed silence (at band min speech)
 * can be reached with no long pause above ~70% of longest single silence.
 * At least 2.
 */
export function silenceFitMinLongPauses(params: {
  scriptTimeSeconds: number;
  speakingBandMin: number;
  longestSingleSilenceSeconds: number;
  /** Assumed short-pause total as fraction of silence needed; conservative. */
  shortPauseShareOfSilence?: number;
}): number {
  const speech = params.scriptTimeSeconds * params.speakingBandMin;
  const silenceNeeded = Math.max(0, params.scriptTimeSeconds - speech);
  const shortShare = params.shortPauseShareOfSilence ?? 0.25;
  const longNeeded = silenceNeeded * (1 - shortShare);
  const cap = Math.max(
    1,
    params.longestSingleSilenceSeconds * 0.7,
  );
  const k = Math.ceil(longNeeded / cap);
  return Math.max(2, k);
}

export function silenceFitSentenceBudget(params: {
  scriptTimeSeconds: number;
  speakingBandMin: number;
  effectiveWpm: number;
  wordsPerSentence: number;
}): number {
  const speakingMinutes =
    (params.scriptTimeSeconds * params.speakingBandMin) / 60;
  const wps = Math.max(1, params.wordsPerSentence);
  return Math.max(
    1,
    Math.round((speakingMinutes * params.effectiveWpm) / wps),
  );
}

/** Rough title / lead-in before the script body starts. */
export const SILENCE_FIT_PRE_SCRIPT_SECONDS = 10;
/** Closing music after the script body. */
export const SILENCE_FIT_POST_MUSIC_SECONDS = 20;

/**
 * Estimated final session audio: pause-fixed script body (words ÷ median
 * Speechify WPM at −20% + pauses) plus ~10s pre + 20s post music.
 */
export function silenceFitEstimatedTotalAudioSeconds(
  predictedScriptSeconds: number,
): number {
  return (
    Math.max(0, predictedScriptSeconds) +
    SILENCE_FIT_PRE_SCRIPT_SECONDS +
    SILENCE_FIT_POST_MUSIC_SECONDS
  );
}
