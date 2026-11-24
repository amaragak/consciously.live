/**
 * Silence-fit · words + Haiku: own copy of silence-words bands/limits plus
 * Haiku word-fix triggers (+ optional stream-phases flag).
 * Stored on ScriptGenerationSettings.silenceWordsHaiku.
 */
import {
  SILENCE_FIT_LENGTHS,
  SILENCE_FIT_OPTIONS,
  type SilenceFitLengthKey,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import {
  clampAskSonnetPct,
} from "./script-silence-haiku-settings";
import {
  coerceSilenceWordsModeSettings,
  defaultSilenceWordsModeSettings,
  type SilenceWordsModeSettings,
} from "./script-silence-words-settings";

export type SilenceWordsHaikuModeSettings = SilenceWordsModeSettings & {
  /** Run Haiku when total words more than ±this off budget (0.1 = ±10%). */
  scriptTriggerPct: number;
  /** Fix phases more than ±this off their (scaled) header word target. */
  phaseTriggerPct: number;
  /**
   * When true, stream finished phases to TTS before the full script is done.
   * Default on. Whole-script Haiku trigger is skipped while streaming.
   */
  streamPhasesToTts: boolean;
  /**
   * Ask Sonnet for this fraction more/less words in the prompt only
   * (−0.25…+0.30). Haiku targets and accuracy still use the real budget.
   */
  askSonnetPctByOptionLength: Record<
    SilenceFitOptionId,
    Record<SilenceFitLengthKey, number>
  >;
};

function defaultAskSonnetMap(): SilenceWordsHaikuModeSettings["askSonnetPctByOptionLength"] {
  const row = (): Record<SilenceFitLengthKey, number> => ({
    "5": 0,
    "10": 0,
    "20": 0,
  });
  return {
    guided_casual: row(),
    guided: row(),
    open_sits: row(),
  };
}

export function defaultSilenceWordsHaikuModeSettings(): SilenceWordsHaikuModeSettings {
  return {
    ...defaultSilenceWordsModeSettings(),
    scriptTriggerPct: 0.1,
    phaseTriggerPct: 0.15,
    streamPhasesToTts: true,
    askSonnetPctByOptionLength: defaultAskSonnetMap(),
  };
}

function clampPct(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(0.5, n);
}

export function silenceWordsHaikuAskSonnetPct(
  settings: SilenceWordsHaikuModeSettings,
  option: SilenceFitOptionId,
  minutes: number,
): number {
  const key = (
    minutes <= 5 ? "5" : minutes <= 10 ? "10" : "20"
  ) as SilenceFitLengthKey;
  return clampAskSonnetPct(
    settings.askSonnetPctByOptionLength?.[option]?.[key],
    0,
  );
}

export function coerceSilenceWordsHaikuModeSettings(
  raw: unknown,
): SilenceWordsHaikuModeSettings {
  const base = defaultSilenceWordsHaikuModeSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const words = coerceSilenceWordsModeSettings(raw);
  const askRaw =
    o.askSonnetPctByOptionLength &&
    typeof o.askSonnetPctByOptionLength === "object"
      ? (o.askSonnetPctByOptionLength as Record<string, unknown>)
      : {};
  const askSonnetPctByOptionLength = defaultAskSonnetMap();
  for (const opt of SILENCE_FIT_OPTIONS) {
    const rowRaw =
      askRaw[opt] && typeof askRaw[opt] === "object"
        ? (askRaw[opt] as Record<string, unknown>)
        : {};
    for (const len of SILENCE_FIT_LENGTHS) {
      askSonnetPctByOptionLength[opt][len] = clampAskSonnetPct(
        rowRaw[len],
        0,
      );
    }
  }
  return {
    ...words,
    scriptTriggerPct: clampPct(Number(o.scriptTriggerPct), base.scriptTriggerPct),
    phaseTriggerPct: clampPct(Number(o.phaseTriggerPct), base.phaseTriggerPct),
    streamPhasesToTts:
      typeof o.streamPhasesToTts === "boolean"
        ? o.streamPhasesToTts
        : base.streamPhasesToTts,
    askSonnetPctByOptionLength,
  };
}
