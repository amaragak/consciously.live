/**
 * Silence-fit + Haiku mode settings: own copy of silence-fit bands/WPS plus
 * Haiku word-fix triggers. Stored on ScriptGenerationSettings.silenceHaiku.
 */
import {
  coerceSilenceFitModeSettings,
  defaultSilenceFitModeSettings,
  SILENCE_FIT_LENGTHS,
  SILENCE_FIT_OPTIONS,
  type SilenceFitLengthKey,
  type SilenceFitModeSettings,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";

export type SilenceHaikuModeSettings = SilenceFitModeSettings & {
  /**
   * Run Haiku only when total words are more than ±this fraction off the word
   * budget (0.1 = ±10%). Default 0.1.
   */
  scriptTriggerPct: number;
  /**
   * Within those scripts, fix only phases more than ±this fraction off their
   * own word target, in the same direction as the overall miss. Default 0.15.
   */
  phaseTriggerPct: number;
  /** Stream finished phases to TTS before the full script is done. Default on. */
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

function defaultAskSonnetMap(): SilenceHaikuModeSettings["askSonnetPctByOptionLength"] {
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

export function defaultSilenceHaikuModeSettings(): SilenceHaikuModeSettings {
  return {
    ...defaultSilenceFitModeSettings(),
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

/** Clamp Ask Sonnet adjustment to −25%…+30%. */
export function clampAskSonnetPct(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(0.3, Math.max(-0.25, v));
}

export function silenceHaikuAskSonnetPct(
  settings: SilenceHaikuModeSettings,
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

/** Prompt-only word budget: real budget × (1 + ask%), nearest 10. */
export function silenceAskSonnetPromptWordBudget(
  wordBudget: number,
  askSonnetPct: number,
): number {
  const pct = clampAskSonnetPct(askSonnetPct, 0);
  const raw = Math.max(1, wordBudget) * (1 + pct);
  return Math.max(10, Math.round(raw / 10) * 10);
}

export function coerceSilenceHaikuModeSettings(
  raw: unknown,
): SilenceHaikuModeSettings {
  const base = defaultSilenceHaikuModeSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const fit = coerceSilenceFitModeSettings(raw);
  const scriptTriggerPct = clampPct(
    Number(o.scriptTriggerPct),
    base.scriptTriggerPct,
  );
  const phaseTriggerPct = clampPct(
    Number(o.phaseTriggerPct),
    base.phaseTriggerPct,
  );
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
    ...fit,
    scriptTriggerPct,
    phaseTriggerPct,
    streamPhasesToTts:
      typeof o.streamPhasesToTts === "boolean"
        ? o.streamPhasesToTts
        : base.streamPhasesToTts,
    askSonnetPctByOptionLength,
  };
}
