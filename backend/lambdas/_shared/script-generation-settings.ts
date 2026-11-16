/**
 * Admin script-generation model + per-model target correction factors.
 * Stored on the delivery-profiles Dynamo row.
 */
import {
  CLAUDE_HAIKU_55_MODEL_ID,
  CLAUDE_SONNET_46_MODEL_ID,
  CLAUDE_SONNET_55_MODEL_ID,
  coerceClaudeModel,
  isSupportedClaudeModel,
} from "./anthropic-pricing";
import type { DeliveryId } from "./delivery-profiles";
import {
  coerceScriptTargetCorrection,
  defaultScriptTargetCorrection,
  SCRIPT_LENGTH_KEYS,
  type ScriptTargetCorrection,
} from "./script-target-correction";
import {
  coerceSilenceFitModeSettings,
  defaultSilenceFitModeSettings,
  type SilenceFitModeSettings,
} from "./script-silence-fit-settings";
import {
  coerceSilenceHaikuModeSettings,
  defaultSilenceHaikuModeSettings,
  type SilenceHaikuModeSettings,
} from "./script-silence-haiku-settings";
import {
  coerceSilenceWordsModeSettings,
  defaultSilenceWordsModeSettings,
  type SilenceWordsModeSettings,
} from "./script-silence-words-settings";
import {
  coerceSilenceWordsHaikuModeSettings,
  defaultSilenceWordsHaikuModeSettings,
  type SilenceWordsHaikuModeSettings,
} from "./script-silence-words-haiku-settings";

/** Production create uses Sonnet 5.5 today (`claude-sonnet-5-5`). */
export const DEFAULT_SCRIPT_MODEL_ID = CLAUDE_SONNET_55_MODEL_ID;

/** Short editable list shown in the admin dropdown. */
export const DEFAULT_SCRIPT_MODEL_OPTIONS: readonly string[] = [
  CLAUDE_SONNET_55_MODEL_ID,
  CLAUDE_HAIKU_55_MODEL_ID,
  CLAUDE_SONNET_46_MODEL_ID,
];

/** How many briefs the calibration batch uses (9 length×delivery × this = scripts). */
export const CALIBRATION_BRIEF_COUNT = 10;

/**
 * Default calibration briefs — mix of destress, aspirational, and
 * prescriptive (specific what to say / do). Editable in admin.
 */
export const DEFAULT_CALIBRATION_BRIEFS: readonly string[] = [
  // Destress / settle (no named style — infer should often return none)
  "I have a job interview on Thursday at a design studio in Leeds and I keep replaying the last one that went badly. I want to feel steady and remember I'm good at this.",
  "My partner and I had another sharp argument last night and I keep going over what I should have said. I want to soften and come back to myself before we talk again.",
  // Named styles — infer should attach the matching writer's guide
  "Create me a sleep meditation. I've been running on empty all week and can't switch off; I want to drift off without trying to fix anything.",
  "Create me a manifestation meditation. I'm building a small creative studio and I want to feel the version of me who already ships work with calm confidence — not grinding, just clear and proud.",
  "Create me an anxiety-relief meditation for tomorrow's pitch to my first big client. Help me walk in warm and sharp, not performing calm.",
  "Create me a loving-kindness practice. I've been hard on myself after training for a half-marathon — I want to finish strong: body light, breath easy, mind kind when it gets hard.",
  "Create me a short affirmation-loop meditation. I want to feel genuinely grateful for the life I'm growing into — a home that feels soft, work that fits, people I love nearby — as if it's already arriving.",
  "Create me a breath-led meditation. Guide me through box breathing only: in for 4, hold 4, out for 4, hold 4, for several rounds. Say the counts out loud. No other techniques. End by telling me to notice one thing I can hear.",
  "Create me a body scan from the crown of the head down to the feet, naming each area once. After the feet, have me silently repeat: I am here, and that is enough. Then a short close.",
  "Create me a visualization meditation. Open with me seated, feet on the floor, hands on thighs. Then walk me into a sunlit room where a future version of me is already waiting — describe the room in concrete detail, have me notice three specific things, then return to the breath and close.",
];

/**
 * Production script write path (global).
 * - sections: plan + section writes
 * - single: legacy one-shot with word/pause targets + factors
 * - time: one-shot outline+script; fit length via flexible silences
 * - silence: one Sonnet write; app fits silence to target length
 * - silence_haiku: silence-fit plus Haiku word-fix on missed phases
 * - silence_words: silence-fit with word targets per phase (not sentences)
 * - silence_words_haiku: silence-fit · words plus Haiku word-fix on missed phases
 */
export type ScriptWriteMode =
  | "sections"
  | "single"
  | "time"
  | "silence"
  | "silence_haiku"
  | "silence_words"
  | "silence_words_haiku";

/** @deprecated Kept for migrating old per-cell mode grids. */
export type ScriptModeByLengthDelivery = Record<
  DeliveryId,
  Record<"5" | "10" | "20", ScriptWriteMode>
>;

/** Briefs used only for head-to-head comparison (legacy; calibration briefs win). */
export const COMPARISON_BRIEF_COUNT = 3;

export const DEFAULT_COMPARISON_BRIEFS: readonly string[] = [
  "I just got offered a promotion that means moving cities. I want to sit with the excitement and the fear without deciding anything tonight.",
  "Write a practice where I silently count breaths to ten, then start again, for most of the session. Only short cues between rounds. Close by resting one hand on my chest.",
  "I want to rehearse accepting a compliment without shrinking — feel my feet, hear the words land, and stay open for a few breaths after.",
];

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

/** Migrate a saved per-cell grid → one global mode (unanimous single, else sections). */
export function scriptWriteModeFromLegacyGrid(raw: unknown): ScriptWriteMode {
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

export type ScriptGenerationSettings = {
  scriptModelId: string;
  scriptModelOptions: string[];
  /** Sectioned-mode correction factors keyed by Claude model id. */
  targetCorrectionByModel: Record<string, ScriptTargetCorrection>;
  /** Single-call mode factors (separate from sectioned), per model. */
  singleCallCorrectionByModel: Record<string, ScriptTargetCorrection>;
  /** Models that have finished at least one sectioned calibration batch. */
  calibratedModelIds: string[];
  /** Models that have finished single-call calibration. */
  singleCallCalibratedModelIds: string[];
  /** Briefs used by Run calibration (editable; default 10). */
  calibrationBriefs: string[];
  /** Legacy comparison briefs (unused; calibration briefs are used). */
  comparisonBriefs: string[];
  /** Global production write mode. */
  scriptWriteMode: ScriptWriteMode;
  /**
   * When true, run the Haiku brief-fidelity check on user-created scripts.
   * Calibration always runs fidelity regardless. Default off.
   */
  userScriptFidelityCheck: boolean;
  /**
   * Haiku (or other) model used to infer a style when the creator didn't pick
   * one, so a writer's guide can still be attached. Default: current Haiku.
   */
  styleInferModelId: string;
  /**
   * How many calibration briefs to use per run (1…briefs.length).
   * Lower n while tweaking to cut cost; tables are per-run, not cumulative.
   */
  calibrationBriefCount: number;
  /**
   * Time-based: measured words per spoken sentence per pacing
   * (from stored cost cells). Falls back to 12 when scriptCount is 0.
   */
  timeWordsPerSentenceByDelivery: Record<
    DeliveryId,
    { wordsPerSentence: number; scriptCount: number }
  >;
  /** Silence-fit mode settings (bands, longest silence, measured WPS). */
  silenceFit: SilenceFitModeSettings;
  /**
   * Silence-fit + Haiku: own copy of silence-fit settings plus Haiku triggers.
   * Seeded from silenceFit when missing.
   */
  silenceHaiku: SilenceHaikuModeSettings;
  /**
   * Silence-fit · words: own copy of silence-fit bands/pauses (no WPS).
   * Seeded from silenceFit when missing.
   */
  silenceWords: SilenceWordsModeSettings;
  /**
   * Silence-fit · words + Haiku: own copy of silence-words plus Haiku triggers.
   * Seeded from silenceWords when missing.
   */
  silenceWordsHaiku: SilenceWordsHaikuModeSettings;
};

/** Fallback when a pacing has no measured time-based scripts yet. Was hard-coded 12 in SPM. */
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

export function wordsPerSentenceForDelivery(
  settings: ScriptGenerationSettings,
  delivery: DeliveryId,
): number {
  const row = settings.timeWordsPerSentenceByDelivery?.[delivery];
  if (
    row &&
    row.scriptCount > 0 &&
    typeof row.wordsPerSentence === "number" &&
    Number.isFinite(row.wordsPerSentence) &&
    row.wordsPerSentence > 0
  ) {
    return row.wordsPerSentence;
  }
  return FALLBACK_TIME_WORDS_PER_SENTENCE;
}

function coerceTimeWordsPerSentenceByDelivery(
  raw: unknown,
): Record<DeliveryId, { wordsPerSentence: number; scriptCount: number }> {
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

/** Clamp n to 1…maxBriefs (defaults to full list length). */
export function coerceCalibrationBriefCount(
  raw: unknown,
  maxBriefs = CALIBRATION_BRIEF_COUNT,
): number {
  const max = Math.max(1, Math.min(CALIBRATION_BRIEF_COUNT, maxBriefs));
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return max;
  return Math.max(1, Math.min(max, Math.round(n)));
}

/** First `calibrationBriefCount` briefs — what a calibration / measure run uses. */
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
    // Length×delivery factors start at 1 until Run calibration.
    calibratedModelIds: [],
    singleCallCalibratedModelIds: [],
    calibrationBriefs: [...DEFAULT_CALIBRATION_BRIEFS],
    comparisonBriefs: [...DEFAULT_COMPARISON_BRIEFS],
    scriptWriteMode: "sections",
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

function coerceOptions(raw: unknown, current: string): string[] {
  const fromArr = Array.isArray(raw)
    ? raw
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
    : [];
  const opts = fromArr.length ? fromArr : [...DEFAULT_SCRIPT_MODEL_OPTIONS];
  if (!opts.includes(current)) opts.unshift(current);
  // Dedupe, keep order
  const seen = new Set<string>();
  return opts.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
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

/**
 * Coerce settings. Migrates legacy flat `targetCorrection` onto the
 * current/default model when by-model is empty.
 */
export function coerceScriptGenerationSettings(
  raw: unknown,
  legacyFlatCorrection?: unknown,
): ScriptGenerationSettings {
  const base = defaultScriptGenerationSettings();
  const o =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scriptModelId = coerceClaudeModel(
    typeof o.scriptModelId === "string" ? o.scriptModelId : base.scriptModelId,
  );
  const scriptModelOptions = coerceOptions(o.scriptModelOptions, scriptModelId);
  let targetCorrectionByModel = coerceByModel(o.targetCorrectionByModel);
  if (!Object.keys(targetCorrectionByModel).length && legacyFlatCorrection != null) {
    targetCorrectionByModel = {
      [scriptModelId]: coerceScriptTargetCorrection(legacyFlatCorrection),
    };
  }
  if (!targetCorrectionByModel[scriptModelId]) {
    targetCorrectionByModel[scriptModelId] = defaultScriptTargetCorrection();
  }
  const calibratedModelIds = Array.isArray(o.calibratedModelIds)
    ? o.calibratedModelIds.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [...base.calibratedModelIds];
  const briefsRaw = Array.isArray(o.calibrationBriefs)
    ? o.calibrationBriefs
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  // Prefer saved briefs; pad up to CALIBRATION_BRIEF_COUNT from defaults when short
  // (e.g. older rows that only had 3). Cap at CALIBRATION_BRIEF_COUNT.
  const calibrationBriefs =
    briefsRaw.length >= CALIBRATION_BRIEF_COUNT
      ? briefsRaw.slice(0, CALIBRATION_BRIEF_COUNT)
      : [
          ...briefsRaw,
          ...DEFAULT_CALIBRATION_BRIEFS.slice(briefsRaw.length),
        ].slice(0, CALIBRATION_BRIEF_COUNT);
  let singleCallCorrectionByModel = coerceByModel(o.singleCallCorrectionByModel);
  if (!singleCallCorrectionByModel[scriptModelId]) {
    singleCallCorrectionByModel[scriptModelId] = defaultScriptTargetCorrection();
  }
  const singleCallCalibratedModelIds = Array.isArray(o.singleCallCalibratedModelIds)
    ? o.singleCallCalibratedModelIds.filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [];
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
  const userScriptFidelityCheck = o.userScriptFidelityCheck === true;
  const styleInferModelId = coerceClaudeModel(
    typeof o.styleInferModelId === "string" && o.styleInferModelId.trim()
      ? o.styleInferModelId.trim()
      : base.styleInferModelId,
  ) || base.styleInferModelId;
  const calibrationBriefCount = coerceCalibrationBriefCount(
    o.calibrationBriefCount,
    calibrationBriefs.length,
  );
  const timeWordsPerSentenceByDelivery = coerceTimeWordsPerSentenceByDelivery(
    o.timeWordsPerSentenceByDelivery,
  );
  const silenceFit = coerceSilenceFitModeSettings(o.silenceFit);
  // Seed new modes from current Silence-fit values when never saved.
  const silenceHaiku =
    o.silenceHaiku != null
      ? coerceSilenceHaikuModeSettings(o.silenceHaiku)
      : coerceSilenceHaikuModeSettings({
          ...silenceFit,
          scriptTriggerPct: 0.1,
          phaseTriggerPct: 0.15,
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
    scriptModelOptions,
    targetCorrectionByModel,
    singleCallCorrectionByModel,
    calibratedModelIds,
    singleCallCalibratedModelIds,
    calibrationBriefs,
    comparisonBriefs,
    scriptWriteMode,
    userScriptFidelityCheck,
    styleInferModelId,
    calibrationBriefCount,
    timeWordsPerSentenceByDelivery,
    silenceFit,
    silenceHaiku,
    silenceWords,
    silenceWordsHaiku,
  };
}

/** Production write mode (global; delivery/minutes ignored). */
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

/** Same active briefs as sectioned Run calibration (honours brief count n). */
export function singleCallCalibrationBriefs(
  settings: ScriptGenerationSettings,
): string[] {
  return activeCalibrationBriefs(settings);
}

export function markModelCalibrated(
  settings: ScriptGenerationSettings,
  modelId: string,
): ScriptGenerationSettings {
  const id = coerceClaudeModel(modelId);
  if (settings.calibratedModelIds.includes(id)) return settings;
  return {
    ...settings,
    calibratedModelIds: [...settings.calibratedModelIds, id],
  };
}

/**
 * Factors for a model. Missing model clones from `fallbackModelId` (previous
 * selection) or the defaults.
 */
export function correctionForModel(
  settings: ScriptGenerationSettings,
  modelId: string,
  fallbackModelId?: string | null,
): {
  correction: ScriptTargetCorrection;
  isNew: boolean;
  settings: ScriptGenerationSettings;
} {
  const id = coerceClaudeModel(modelId);
  const existing = settings.targetCorrectionByModel[id];
  if (existing) {
    return { correction: existing, isNew: false, settings };
  }
  const from =
    (fallbackModelId && settings.targetCorrectionByModel[fallbackModelId]) ||
    settings.targetCorrectionByModel[settings.scriptModelId] ||
    defaultScriptTargetCorrection();
  const correction = coerceScriptTargetCorrection(from);
  const settingsNext: ScriptGenerationSettings = {
    ...settings,
    targetCorrectionByModel: {
      ...settings.targetCorrectionByModel,
      [id]: correction,
    },
  };
  return { correction, isNew: true, settings: settingsNext };
}

export function setCorrectionForModel(
  settings: ScriptGenerationSettings,
  modelId: string,
  correction: ScriptTargetCorrection,
): ScriptGenerationSettings {
  const id = coerceClaudeModel(modelId);
  return {
    ...settings,
    targetCorrectionByModel: {
      ...settings.targetCorrectionByModel,
      [id]: coerceScriptTargetCorrection(correction),
    },
  };
}

export function setSingleCallCorrectionForModel(
  settings: ScriptGenerationSettings,
  modelId: string,
  correction: ScriptTargetCorrection,
): ScriptGenerationSettings {
  const id = coerceClaudeModel(modelId);
  const ids = settings.singleCallCalibratedModelIds.includes(id)
    ? settings.singleCallCalibratedModelIds
    : [...settings.singleCallCalibratedModelIds, id];
  return {
    ...settings,
    singleCallCorrectionByModel: {
      ...settings.singleCallCorrectionByModel,
      [id]: coerceScriptTargetCorrection(correction),
    },
    singleCallCalibratedModelIds: ids,
  };
}

export function singleCallCorrectionForModel(
  settings: ScriptGenerationSettings,
  modelId: string,
): ScriptTargetCorrection {
  const id = coerceClaudeModel(modelId);
  return (
    settings.singleCallCorrectionByModel[id] ??
    defaultScriptTargetCorrection()
  );
}

export function resetCorrectionForModel(
  settings: ScriptGenerationSettings,
  modelId: string,
): ScriptGenerationSettings {
  const id = coerceClaudeModel(modelId);
  const next = { ...settings.targetCorrectionByModel };
  delete next[id];
  const singleNext = { ...settings.singleCallCorrectionByModel };
  delete singleNext[id];
  return {
    ...settings,
    targetCorrectionByModel: next,
    singleCallCorrectionByModel: singleNext,
    calibratedModelIds: settings.calibratedModelIds.filter((x) => x !== id),
    singleCallCalibratedModelIds: settings.singleCallCalibratedModelIds.filter(
      (x) => x !== id,
    ),
  };
}

/** Ensure every length key exists (for UI grids). */
export function allLengthDeliveryCombos(): Array<{
  delivery: DeliveryId;
  minutes: 5 | 10 | 20;
  key: "5" | "10" | "20";
}> {
  const out: Array<{
    delivery: DeliveryId;
    minutes: 5 | 10 | 20;
    key: "5" | "10" | "20";
  }> = [];
  for (const delivery of ["casual", "guided", "open_sits"] as const) {
    for (const key of SCRIPT_LENGTH_KEYS) {
      out.push({
        delivery,
        minutes: Number(key) as 5 | 10 | 20,
        key,
      });
    }
  }
  return out;
}

export function resolveScriptModelId(params: {
  settings: ScriptGenerationSettings;
  /** Dev / job override from the create body (only when preferBody). */
  bodyModel?: unknown;
  /** When true, an explicit body model wins (create-flow A/B). */
  preferBody?: boolean;
}): string {
  if (
    params.preferBody &&
    typeof params.bodyModel === "string" &&
    params.bodyModel.trim()
  ) {
    const raw = params.bodyModel.trim();
    if (isSupportedClaudeModel(raw)) return raw;
    return coerceClaudeModel(raw);
  }
  return coerceClaudeModel(params.settings.scriptModelId);
}
