/**
 * Silence-fit · words: own copy of silence-fit bands/pause limits (no WPS).
 * Stored on ScriptGenerationSettings.silenceWords.
 */
import {
  coerceSilenceFitModeSettings,
  defaultSilenceFitModeSettings,
  type SilenceFitCellSettings,
  type SilenceFitLengthKey,
  type SilenceFitModeSettings,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";

export type SilenceWordsModeSettings = {
  byOptionLength: Record<
    SilenceFitOptionId,
    Record<SilenceFitLengthKey, SilenceFitCellSettings>
  >;
  shortestLongPauseSeconds: number;
  shortestLongPauseByOption: Record<SilenceFitOptionId, number>;
  shortPauseAdjustLimit: number;
  extraClosingMusicSeconds: number;
};

export function defaultSilenceWordsModeSettings(): SilenceWordsModeSettings {
  const base = defaultSilenceFitModeSettings();
  return {
    byOptionLength: base.byOptionLength,
    shortestLongPauseSeconds: base.shortestLongPauseSeconds,
    shortestLongPauseByOption: { ...base.shortestLongPauseByOption },
    shortPauseAdjustLimit: base.shortPauseAdjustLimit,
    extraClosingMusicSeconds: base.extraClosingMusicSeconds,
  };
}

export function coerceSilenceWordsModeSettings(
  raw: unknown,
): SilenceWordsModeSettings {
  // Reuse silence-fit coerce for bands/limits; drop WPS.
  const fit = coerceSilenceFitModeSettings(raw);
  return {
    byOptionLength: fit.byOptionLength,
    shortestLongPauseSeconds: fit.shortestLongPauseSeconds,
    shortestLongPauseByOption: { ...fit.shortestLongPauseByOption },
    shortPauseAdjustLimit: fit.shortPauseAdjustLimit,
    extraClosingMusicSeconds: fit.extraClosingMusicSeconds,
  };
}

/** As SilenceFitModeSettings for helpers that only read byOptionLength / pauses. */
export function silenceWordsAsFitSettings(
  settings: SilenceWordsModeSettings,
): SilenceFitModeSettings {
  return {
    ...settings,
    shortestLongPauseByOption: { ...settings.shortestLongPauseByOption },
    wordsPerSentenceByOption: defaultSilenceFitModeSettings()
      .wordsPerSentenceByOption,
  };
}

/**
 * Word budget = speaking minutes × effective WPM, rounded to nearest 10.
 * Callers pass the speaking share to aim at (Silence-fit · words uses the
 * middle of the band; older callers may still pass band min).
 */
export function silenceWordsWordBudget(params: {
  scriptTimeSeconds: number;
  /** Speaking share of script time (0–1). Param name kept for call sites. */
  speakingBandMin: number;
  effectiveWpm: number;
}): number {
  // Was: speaking minutes = script time × speaking-band min.
  const speakingMinutes =
    (params.scriptTimeSeconds * params.speakingBandMin) / 60;
  const raw = speakingMinutes * Math.max(1, params.effectiveWpm);
  return Math.max(10, Math.round(raw / 10) * 10);
}
