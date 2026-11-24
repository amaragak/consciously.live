import {
  CLAUDE_HAIKU_55_MODEL_ID,
  CLAUDE_SONNET_55_MODEL_ID,
  claudeModelLabel,
} from "@/lib/claude-pricing";
import {
  coerceScriptTargetCorrection,
  correctionHasCalibratedSamples,
  defaultScriptTargetCorrection,
  type ScriptTargetCorrection,
} from "@/lib/script-target-correction";
import type { DeliveryId } from "@/lib/delivery-profiles";

export const DEFAULT_SCRIPT_MODEL_ID = CLAUDE_SONNET_55_MODEL_ID;

export const DEFAULT_SCRIPT_MODEL_OPTIONS = [
  CLAUDE_SONNET_55_MODEL_ID,
  CLAUDE_HAIKU_55_MODEL_ID,
  "claude-sonnet-4-6",
] as const;

export const CALIBRATION_BRIEF_COUNT = 10;

export const DEFAULT_CALIBRATION_BRIEFS = [
  "I have a job interview on Thursday at a design studio in Leeds and I keep replaying the last one that went badly. I want to feel steady and remember I'm good at this.",
  "My partner and I had another sharp argument last night and I keep going over what I should have said. I want to soften and come back to myself before we talk again.",
  "Create me a sleep meditation. I've been running on empty all week and can't switch off; I want to drift off without trying to fix anything.",
  "Create me a manifestation meditation. I'm building a small creative studio and I want to feel the version of me who already ships work with calm confidence — not grinding, just clear and proud.",
  "Create me an anxiety-relief meditation for tomorrow's pitch to my first big client. Help me walk in warm and sharp, not performing calm.",
  "Create me a loving-kindness practice. I've been hard on myself after training for a half-marathon — I want to finish strong: body light, breath easy, mind kind when it gets hard.",
  "Create me a short affirmation-loop meditation. I want to feel genuinely grateful for the life I'm growing into — a home that feels soft, work that fits, people I love nearby — as if it's already arriving.",
  "Create me a breath-led meditation. Guide me through box breathing only: in for 4, hold 4, out for 4, hold 4, for several rounds. Say the counts out loud. No other techniques. End by telling me to notice one thing I can hear.",
  "Create me a body scan from the crown of the head down to the feet, naming each area once. After the feet, have me silently repeat: I am here, and that is enough. Then a short close.",
  "Create me a visualization meditation. Open with me seated, feet on the floor, hands on thighs. Then walk me into a sunlit room where a future version of me is already waiting — describe the room in concrete detail, have me notice three specific things, then return to the breath and close.",
] as const;

export const COMPARISON_BRIEF_COUNT = 3;

export const DEFAULT_COMPARISON_BRIEFS = [
  "I just got offered a promotion that means moving cities. I want to sit with the excitement and the fear without deciding anything tonight.",
  "Write a practice where I silently count breaths to ten, then start again, for most of the session. Only short cues between rounds. Close by resting one hand on my chest.",
  "I want to rehearse accepting a compliment without shrinking — feel my feet, hear the words land, and stay open for a few breaths after.",
] as const;

export type ScriptWriteMode =
  | "sections"
  | "single"
  | "time"
  | "silence"
  | "silence_haiku"
  | "silence_words"
  | "silence_words_haiku";

export type SilenceWordsModeSettings = {
  byOptionLength: SilenceFitModeSettings["byOptionLength"];
  shortestLongPauseSeconds: number;
  shortestLongPauseByOption: SilenceFitModeSettings["shortestLongPauseByOption"];
  shortPauseAdjustLimit: number;
  extraClosingMusicSeconds: number;
};

export function defaultSilenceWordsModeSettings(): SilenceWordsModeSettings {
  const fit = defaultSilenceFitModeSettings();
  return {
    byOptionLength: fit.byOptionLength,
    shortestLongPauseSeconds: fit.shortestLongPauseSeconds,
    shortestLongPauseByOption: { ...fit.shortestLongPauseByOption },
    shortPauseAdjustLimit: fit.shortPauseAdjustLimit,
    extraClosingMusicSeconds: fit.extraClosingMusicSeconds,
  };
}

export function coerceSilenceWordsModeSettings(
  raw: unknown,
): SilenceWordsModeSettings {
  const fit = coerceSilenceFitModeSettings(raw);
  return {
    byOptionLength: fit.byOptionLength,
    shortestLongPauseSeconds: fit.shortestLongPauseSeconds,
    shortestLongPauseByOption: { ...fit.shortestLongPauseByOption },
    shortPauseAdjustLimit: fit.shortPauseAdjustLimit,
    extraClosingMusicSeconds: fit.extraClosingMusicSeconds,
  };
}

export type AskSonnetPctByOptionLength = Record<
  SilenceFitOptionId,
  Record<SilenceFitLengthKey, number>
>;

function defaultAskSonnetPctMap(): AskSonnetPctByOptionLength {
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

/** Clamp Ask Sonnet adjustment to −25%…+30% (as fraction). */
export function clampAskSonnetPct(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(0.3, Math.max(-0.25, v));
}

function coerceAskSonnetPctMap(raw: unknown): AskSonnetPctByOptionLength {
  const base = defaultAskSonnetPctMap();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const opt of ["guided_casual", "guided", "open_sits"] as const) {
    const rowRaw =
      o[opt] && typeof o[opt] === "object"
        ? (o[opt] as Record<string, unknown>)
        : {};
    for (const len of ["5", "10", "20"] as const) {
      base[opt][len] = clampAskSonnetPct(rowRaw[len], 0);
    }
  }
  return base;
}

export type SilenceHaikuModeSettings = SilenceFitModeSettings & {
  /** Run Haiku when total words more than ±this off budget (0.1 = ±10%). */
  scriptTriggerPct: number;
  /** Fix phases more than ±this off their word target (0.15 = ±15%). */
  phaseTriggerPct: number;
  /**
   * When true, stream finished phases to TTS before the full script is done.
   * Default on. Whole-script Haiku trigger is skipped while streaming.
   */
  streamPhasesToTts: boolean;
  /** Prompt-only Sonnet word ask (−0.25…+0.30) per option × length. */
  askSonnetPctByOptionLength: AskSonnetPctByOptionLength;
};

export function defaultSilenceHaikuModeSettings(): SilenceHaikuModeSettings {
  return {
    ...defaultSilenceFitModeSettings(),
    scriptTriggerPct: 0.1,
    phaseTriggerPct: 0.15,
    streamPhasesToTts: true,
    askSonnetPctByOptionLength: defaultAskSonnetPctMap(),
  };
}

export function coerceSilenceHaikuModeSettings(
  raw: unknown,
): SilenceHaikuModeSettings {
  const fit = coerceSilenceFitModeSettings(raw);
  const base = defaultSilenceHaikuModeSettings();
  if (!raw || typeof raw !== "object") {
    return {
      ...fit,
      scriptTriggerPct: base.scriptTriggerPct,
      phaseTriggerPct: base.phaseTriggerPct,
      streamPhasesToTts: base.streamPhasesToTts,
      askSonnetPctByOptionLength: defaultAskSonnetPctMap(),
    };
  }
  const o = raw as Record<string, unknown>;
  let scriptTriggerPct = Number(o.scriptTriggerPct);
  let phaseTriggerPct = Number(o.phaseTriggerPct);
  if (!Number.isFinite(scriptTriggerPct) || scriptTriggerPct < 0) {
    scriptTriggerPct = base.scriptTriggerPct;
  }
  if (!Number.isFinite(phaseTriggerPct) || phaseTriggerPct < 0) {
    phaseTriggerPct = base.phaseTriggerPct;
  }
  return {
    ...fit,
    scriptTriggerPct: Math.min(0.5, scriptTriggerPct),
    phaseTriggerPct: Math.min(0.5, phaseTriggerPct),
    streamPhasesToTts:
      typeof o.streamPhasesToTts === "boolean"
        ? o.streamPhasesToTts
        : base.streamPhasesToTts,
    askSonnetPctByOptionLength: coerceAskSonnetPctMap(
      o.askSonnetPctByOptionLength,
    ),
  };
}

export type SilenceWordsHaikuModeSettings = SilenceWordsModeSettings & {
  /** Run Haiku when total words more than ±this off budget (0.1 = ±10%). */
  scriptTriggerPct: number;
  /** Fix phases more than ±this off their (scaled) header word target. */
  phaseTriggerPct: number;
  /** Stream finished phases to TTS before the full script is done. */
  streamPhasesToTts: boolean;
  /** Prompt-only Sonnet word ask (−0.25…+0.30) per option × length. */
  askSonnetPctByOptionLength: AskSonnetPctByOptionLength;
};

export function defaultSilenceWordsHaikuModeSettings(): SilenceWordsHaikuModeSettings {
  return {
    ...defaultSilenceWordsModeSettings(),
    scriptTriggerPct: 0.1,
    phaseTriggerPct: 0.15,
    streamPhasesToTts: true,
    askSonnetPctByOptionLength: defaultAskSonnetPctMap(),
  };
}

function clampWordsHaikuPct(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(0.5, n);
}

export function coerceSilenceWordsHaikuModeSettings(
  raw: unknown,
): SilenceWordsHaikuModeSettings {
  const base = defaultSilenceWordsHaikuModeSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const words = coerceSilenceWordsModeSettings(raw);
  return {
    ...words,
    scriptTriggerPct: clampWordsHaikuPct(
      Number(o.scriptTriggerPct),
      base.scriptTriggerPct,
    ),
    phaseTriggerPct: clampWordsHaikuPct(
      Number(o.phaseTriggerPct),
      base.phaseTriggerPct,
    ),
    streamPhasesToTts:
      typeof o.streamPhasesToTts === "boolean"
        ? o.streamPhasesToTts
        : base.streamPhasesToTts,
    askSonnetPctByOptionLength: coerceAskSonnetPctMap(
      o.askSonnetPctByOptionLength,
    ),
  };
}

/** Canonical mode list for admin registry table. */
export const SCRIPT_GENERATION_MODES: readonly {
  id: ScriptWriteMode;
  name: string;
  description: string;
  calls: string;
  added: string;
}[] = [
  {
    id: "sections",
    name: "Sectioned",
    description: "Plan then write sections with word/pause factors.",
    calls: "Plan + N section writes (Sonnet)",
    added: "2025-01-01",
  },
  {
    id: "single",
    name: "Single call (legacy)",
    description: "One-shot script with word/pause targets and factors.",
    calls: "1 Sonnet",
    added: "2025-01-01",
  },
  {
    id: "time",
    name: "Time-based",
    description: "One Claude write; length via flexible silences.",
    calls: "1 Sonnet",
    added: "2026-10-01",
  },
  {
    id: "silence",
    name: "Silence-fit",
    description: "One Claude write; app fits silence to target length.",
    calls: "1 Sonnet",
    added: "2026-11-11",
  },
  {
    id: "silence_haiku",
    name: "Silence-fit + Haiku",
    description:
      "Silence-fit plus a Haiku word fix on phases that miss their budget.",
    calls: "1 Sonnet + Haiku per missed phase",
    added: "2026-11-13",
  },
  {
    id: "silence_words",
    name: "Silence-fit · words",
    description:
      "Silence-fit with word targets per phase instead of sentences",
    calls: "1 Sonnet",
    added: "2026-11-13",
  },
  {
    id: "silence_words_haiku",
    name: "Silence-fit · words + Haiku",
    description:
      "Silence-fit · words with a Haiku word fix on phases that miss",
    calls: "1 Sonnet + Haiku per missed phase",
    added: "2026-11-13",
  },
] as const;

export type SilenceFitOptionId = "guided" | "guided_casual" | "open_sits";
export type SilenceFitLengthKey = "5" | "10" | "20";

export type SilenceFitCellSettings = {
  speakingBandMin: number;
  speakingBandMax: number;
  longestSingleSilenceSeconds: number;
};

export type SilenceFitModeSettings = {
  byOptionLength: Record<
    SilenceFitOptionId,
    Record<SilenceFitLengthKey, SilenceFitCellSettings>
  >;
  shortestLongPauseSeconds: number;
  shortestLongPauseByOption: Record<SilenceFitOptionId, number>;
  shortPauseAdjustLimit: number;
  extraClosingMusicSeconds: number;
  wordsPerSentenceByOption: Record<
    SilenceFitOptionId,
    { wordsPerSentence: number; scriptCount: number }
  >;
};

function cell(
  minPct: number,
  maxPct: number,
  longest: number,
): SilenceFitCellSettings {
  return {
    speakingBandMin: minPct / 100,
    speakingBandMax: maxPct / 100,
    longestSingleSilenceSeconds: longest,
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
    shortestLongPauseSeconds: 8,
    shortestLongPauseByOption: {
      guided_casual: 4,
      guided: 8,
      open_sits: 8,
    },
    // Was: shortPauseAdjustLimit: 0.2
    shortPauseAdjustLimit: 0.5,
    extraClosingMusicSeconds: 30,
    wordsPerSentenceByOption: {
      guided: { wordsPerSentence: 12, scriptCount: 0 },
      guided_casual: { wordsPerSentence: 12, scriptCount: 0 },
      open_sits: { wordsPerSentence: 12, scriptCount: 0 },
    },
  };
}

function coerceSilenceFitModeSettings(raw: unknown): SilenceFitModeSettings {
  const base = defaultSilenceFitModeSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const by =
    o.byOptionLength && typeof o.byOptionLength === "object"
      ? (o.byOptionLength as Record<string, unknown>)
      : {};
  for (const opt of ["guided", "guided_casual", "open_sits"] as const) {
    const row =
      by[opt] && typeof by[opt] === "object"
        ? (by[opt] as Record<string, unknown>)
        : {};
    for (const len of ["5", "10", "20"] as const) {
      const c = row[len];
      if (!c || typeof c !== "object") continue;
      const r = c as Record<string, unknown>;
      let min = Number(r.speakingBandMin);
      let max = Number(r.speakingBandMax);
      if (!Number.isFinite(min)) min = base.byOptionLength[opt][len].speakingBandMin;
      if (!Number.isFinite(max)) max = base.byOptionLength[opt][len].speakingBandMax;
      min = Math.min(0.95, Math.max(0.05, min));
      max = Math.min(0.95, Math.max(0.05, max));
      if (max < min) {
        const t = min;
        min = max;
        max = t;
      }
      const longest = Number(r.longestSingleSilenceSeconds);
      base.byOptionLength[opt][len] = {
        speakingBandMin: min,
        speakingBandMax: max,
        longestSingleSilenceSeconds:
          Number.isFinite(longest) && longest > 0
            ? longest
            : base.byOptionLength[opt][len].longestSingleSilenceSeconds,
      };
    }
  }
  const shortest = Number(o.shortestLongPauseSeconds);
  if (Number.isFinite(shortest) && shortest > 0) {
    base.shortestLongPauseSeconds = shortest;
    base.shortestLongPauseByOption.guided = shortest;
    base.shortestLongPauseByOption.open_sits = shortest;
  }
  const byShort =
    o.shortestLongPauseByOption && typeof o.shortestLongPauseByOption === "object"
      ? (o.shortestLongPauseByOption as Record<string, unknown>)
      : {};
  for (const opt of ["guided", "guided_casual", "open_sits"] as const) {
    const v = Number(byShort[opt]);
    if (Number.isFinite(v) && v > 0) {
      base.shortestLongPauseByOption[opt] = Math.round(v * 10) / 10;
    }
  }
  const adj = Number(o.shortPauseAdjustLimit);
  if (Number.isFinite(adj) && adj >= 0) {
    // Was: Math.min(0.5, adj)
    base.shortPauseAdjustLimit = Math.min(1, adj);
  }
  const extra = Number(o.extraClosingMusicSeconds);
  if (Number.isFinite(extra) && extra >= 0) {
    base.extraClosingMusicSeconds = extra;
  }
  const wps =
    o.wordsPerSentenceByOption && typeof o.wordsPerSentenceByOption === "object"
      ? (o.wordsPerSentenceByOption as Record<string, unknown>)
      : {};
  for (const opt of ["guided", "guided_casual", "open_sits"] as const) {
    const row = wps[opt];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const wordsPerSentence = Number(r.wordsPerSentence);
    const scriptCount = Number(r.scriptCount);
    base.wordsPerSentenceByOption[opt] = {
      wordsPerSentence:
        Number.isFinite(wordsPerSentence) && wordsPerSentence > 0
          ? wordsPerSentence
          : 12,
      scriptCount:
        Number.isFinite(scriptCount) && scriptCount > 0
          ? Math.round(scriptCount)
          : 0,
    };
  }
  return base;
}

export type ScriptGenerationSettings = {
  scriptModelId: string;
  scriptModelOptions: string[];
  targetCorrectionByModel: Record<string, ScriptTargetCorrection>;
  singleCallCorrectionByModel: Record<string, ScriptTargetCorrection>;
  calibratedModelIds: string[];
  singleCallCalibratedModelIds: string[];
  calibrationBriefs: string[];
  comparisonBriefs: string[];
  scriptWriteMode: ScriptWriteMode;
  /** Haiku brief-fidelity on user scripts (calibration always checks). Default off. */
  userScriptFidelityCheck: boolean;
  /** Model for inferring a style when none is chosen (default Haiku). */
  styleInferModelId: string;
  /**
   * How many calibration briefs to use per run (1…briefs.length).
   * Lower while tweaking to cut cost; results are per-run.
   */
  calibrationBriefCount: number;
  /**
   * Time-based: measured words/sentence per pacing (from cost cells).
   * Falls back to 12 when scriptCount is 0.
   */
  timeWordsPerSentenceByDelivery: Record<
    DeliveryId,
    { wordsPerSentence: number; scriptCount: number }
  >;
  silenceFit: SilenceFitModeSettings;
  silenceHaiku: SilenceHaikuModeSettings;
  silenceWords: SilenceWordsModeSettings;
  silenceWordsHaiku: SilenceWordsHaikuModeSettings;
};

const FALLBACK_TIME_WORDS_PER_SENTENCE = 12;

export function defaultTimeWordsPerSentenceByDelivery(): Record<
  DeliveryId,
  { wordsPerSentence: number; scriptCount: number }
> {
  return {
    casual: {
      wordsPerSentence: FALLBACK_TIME_WORDS_PER_SENTENCE,
      scriptCount: 0,
    },
    guided: {
      wordsPerSentence: FALLBACK_TIME_WORDS_PER_SENTENCE,
      scriptCount: 0,
    },
    open_sits: {
      wordsPerSentence: FALLBACK_TIME_WORDS_PER_SENTENCE,
      scriptCount: 0,
    },
  };
}

function coerceTimeWordsPerSentenceByDelivery(
  raw: unknown,
): ScriptGenerationSettings["timeWordsPerSentenceByDelivery"] {
  const base = defaultTimeWordsPerSentenceByDelivery();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const id of ["casual", "guided", "open_sits"] as const) {
    const row = o[id];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const wps = Number(r.wordsPerSentence);
    const n = Number(r.scriptCount);
    base[id] = {
      wordsPerSentence:
        Number.isFinite(wps) && wps > 0
          ? Math.round(wps * 10) / 10
          : FALLBACK_TIME_WORDS_PER_SENTENCE,
      scriptCount: Number.isFinite(n) && n > 0 ? Math.round(n) : 0,
    };
  }
  return base;
}

export function coerceCalibrationBriefCount(
  raw: unknown,
  maxBriefs = CALIBRATION_BRIEF_COUNT,
): number {
  const max = Math.max(1, Math.min(CALIBRATION_BRIEF_COUNT, maxBriefs));
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return max;
  return Math.max(1, Math.min(max, Math.round(n)));
}

export function activeCalibrationBriefs(
  settings: ScriptGenerationSettings,
): string[] {
  const briefs = settings.calibrationBriefs?.length
    ? settings.calibrationBriefs
    : [...DEFAULT_CALIBRATION_BRIEFS];
  const n = coerceCalibrationBriefCount(
    settings.calibrationBriefCount,
    briefs.length,
  );
  return briefs.slice(0, n);
}

function coerceByModel(raw: unknown): Record<string, ScriptTargetCorrection> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, ScriptTargetCorrection> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = k.trim();
    if (!id) continue;
    out[id] = coerceScriptTargetCorrection(v);
  }
  return out;
}

function coerceMode(raw: unknown): ScriptWriteMode {
  if (raw === "single") return "single";
  if (raw === "time" || raw === "time_based" || raw === "time-based") {
    return "time";
  }
  if (
    raw === "silence_haiku" ||
    raw === "silence-haiku" ||
    raw === "silenceHaiku" ||
    raw === "silence_fit_haiku" ||
    raw === "silence-fit-haiku"
  ) {
    return "silence_haiku";
  }
  if (
    raw === "silence_words_haiku" ||
    raw === "silence-words-haiku" ||
    raw === "silenceWordsHaiku" ||
    raw === "silence_fit_words_haiku" ||
    raw === "silence-fit-words-haiku"
  ) {
    return "silence_words_haiku";
  }
  if (
    raw === "silence_words" ||
    raw === "silence-words" ||
    raw === "silenceWords" ||
    raw === "silence_fit_words" ||
    raw === "silence-fit-words"
  ) {
    return "silence_words";
  }
  if (
    raw === "silence" ||
    raw === "silence_fit" ||
    raw === "silence-fit" ||
    raw === "silenceFit"
  ) {
    return "silence";
  }
  return "sections";
}

function scriptWriteModeFromLegacyGrid(raw: unknown): ScriptWriteMode {
  if (!raw || typeof raw !== "object") return "sections";
  const o = raw as Record<string, unknown>;
  const modes: ScriptWriteMode[] = [];
  for (const id of ["casual", "guided", "open_sits"] as const) {
    const row = o[id];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    for (const k of ["5", "10", "20"] as const) {
      modes.push(coerceMode(r[k]));
    }
  }
  if (!modes.length) return "sections";
  return modes.every((m) => m === "single") ? "single" : "sections";
}

export function defaultScriptGenerationSettings(): ScriptGenerationSettings {
  return {
    scriptModelId: DEFAULT_SCRIPT_MODEL_ID,
    scriptModelOptions: [...DEFAULT_SCRIPT_MODEL_OPTIONS],
    targetCorrectionByModel: {
      [DEFAULT_SCRIPT_MODEL_ID]: defaultScriptTargetCorrection(),
    },
    singleCallCorrectionByModel: {
      [DEFAULT_SCRIPT_MODEL_ID]: defaultScriptTargetCorrection(),
    },
    calibratedModelIds: [],
    singleCallCalibratedModelIds: [],
    calibrationBriefs: [...DEFAULT_CALIBRATION_BRIEFS],
    comparisonBriefs: [...DEFAULT_COMPARISON_BRIEFS],
    scriptWriteMode: "silence_words_haiku",
    userScriptFidelityCheck: false,
    styleInferModelId: CLAUDE_HAIKU_55_MODEL_ID,
    calibrationBriefCount: CALIBRATION_BRIEF_COUNT,
    timeWordsPerSentenceByDelivery: defaultTimeWordsPerSentenceByDelivery(),
    silenceFit: defaultSilenceFitModeSettings(),
    silenceHaiku: defaultSilenceHaikuModeSettings(),
    silenceWords: defaultSilenceWordsModeSettings(),
    silenceWordsHaiku: defaultSilenceWordsHaikuModeSettings(),
  };
}

export function coerceScriptGenerationSettings(
  raw: unknown,
): ScriptGenerationSettings {
  const base = defaultScriptGenerationSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const scriptModelId =
    typeof o.scriptModelId === "string" && o.scriptModelId.trim()
      ? o.scriptModelId.trim()
      : base.scriptModelId;
  const opts = Array.isArray(o.scriptModelOptions)
    ? o.scriptModelOptions.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [...base.scriptModelOptions];
  if (!opts.includes(scriptModelId)) opts.unshift(scriptModelId);
  const byModel = coerceByModel(o.targetCorrectionByModel);
  if (!byModel[scriptModelId]) {
    byModel[scriptModelId] = defaultScriptTargetCorrection();
  }
  const singleByModel = coerceByModel(o.singleCallCorrectionByModel);
  if (!singleByModel[scriptModelId]) {
    singleByModel[scriptModelId] = defaultScriptTargetCorrection();
  }
  const calibratedModelIds = Array.isArray(o.calibratedModelIds)
    ? o.calibratedModelIds.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [...base.calibratedModelIds];
  const singleCallCalibratedModelIds = Array.isArray(
    o.singleCallCalibratedModelIds,
  )
    ? o.singleCallCalibratedModelIds.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [];
  const briefsRaw = Array.isArray(o.calibrationBriefs)
    ? o.calibrationBriefs
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const calibrationBriefs =
    briefsRaw.length >= CALIBRATION_BRIEF_COUNT
      ? briefsRaw.slice(0, CALIBRATION_BRIEF_COUNT)
      : [
          ...briefsRaw,
          ...DEFAULT_CALIBRATION_BRIEFS.slice(briefsRaw.length),
        ].slice(0, CALIBRATION_BRIEF_COUNT);
  const cmpRaw = Array.isArray(o.comparisonBriefs)
    ? o.comparisonBriefs
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const comparisonBriefs =
    cmpRaw.length >= COMPARISON_BRIEF_COUNT
      ? cmpRaw.slice(0, COMPARISON_BRIEF_COUNT)
      : [
          ...cmpRaw,
          ...DEFAULT_COMPARISON_BRIEFS.slice(cmpRaw.length),
        ].slice(0, COMPARISON_BRIEF_COUNT);
  const scriptWriteMode =
    o.scriptWriteMode != null
      ? coerceMode(o.scriptWriteMode)
      : scriptWriteModeFromLegacyGrid(o.scriptModeByLengthDelivery);
  const styleInferModelId =
    typeof o.styleInferModelId === "string" && o.styleInferModelId.trim()
      ? o.styleInferModelId.trim()
      : base.styleInferModelId;
  const calibrationBriefCount = coerceCalibrationBriefCount(
    o.calibrationBriefCount,
    calibrationBriefs.length,
  );
  const timeWordsPerSentenceByDelivery = coerceTimeWordsPerSentenceByDelivery(
    o.timeWordsPerSentenceByDelivery,
  );
  const silenceFit = coerceSilenceFitModeSettings(o.silenceFit);
  const silenceHaiku =
    o.silenceHaiku != null
      ? coerceSilenceHaikuModeSettings(o.silenceHaiku)
      : coerceSilenceHaikuModeSettings({
          ...silenceFit,
          scriptTriggerPct: 0.1,
          phaseTriggerPct: 0.15,
          streamPhasesToTts: false,
        });
  const silenceWords =
    o.silenceWords != null
      ? coerceSilenceWordsModeSettings(o.silenceWords)
      : coerceSilenceWordsModeSettings(silenceFit);
  const silenceWordsHaiku =
    o.silenceWordsHaiku != null
      ? coerceSilenceWordsHaikuModeSettings(o.silenceWordsHaiku)
      : coerceSilenceWordsHaikuModeSettings({
          ...silenceWords,
          scriptTriggerPct: 0.1,
          phaseTriggerPct: 0.15,
          streamPhasesToTts: false,
        });
  return {
    scriptModelId,
    scriptModelOptions: opts,
    targetCorrectionByModel: byModel,
    singleCallCorrectionByModel: singleByModel,
    calibratedModelIds,
    singleCallCalibratedModelIds,
    calibrationBriefs,
    comparisonBriefs,
    scriptWriteMode,
    userScriptFidelityCheck: o.userScriptFidelityCheck === true,
    styleInferModelId,
    calibrationBriefCount,
    timeWordsPerSentenceByDelivery,
    silenceFit,
    silenceHaiku,
    silenceWords,
    silenceWordsHaiku,
  };
}

export function modelHasFactors(
  settings: ScriptGenerationSettings,
  modelId: string,
): boolean {
  if (settings.calibratedModelIds?.includes(modelId)) return true;
  const c = settings.targetCorrectionByModel?.[modelId];
  return c ? correctionHasCalibratedSamples(c) : false;
}

export function modelHasSingleCallFactors(
  settings: ScriptGenerationSettings,
  modelId: string,
): boolean {
  if (settings.singleCallCalibratedModelIds?.includes(modelId)) return true;
  const c = settings.singleCallCorrectionByModel?.[modelId];
  return c ? correctionHasCalibratedSamples(c) : false;
}

export function scriptWriteModeFor(
  settings: ScriptGenerationSettings,
  _delivery?: DeliveryId,
  _minutes?: number,
): ScriptWriteMode {
  return coerceMode(settings.scriptWriteMode);
}

export function scriptWriteModeLabel(mode: ScriptWriteMode): string {
  if (mode === "single") return "Single call (legacy)";
  if (mode === "time") return "Time-based";
  if (mode === "silence") return "Silence-fit";
  if (mode === "silence_haiku") return "Silence-fit + Haiku";
  if (mode === "silence_words") return "Silence-fit · words";
  if (mode === "silence_words_haiku") return "Silence-fit · words + Haiku";
  return "Sectioned";
}

export { claudeModelLabel };
