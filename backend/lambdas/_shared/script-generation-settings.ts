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
import {
  coerceScriptTargetCorrection,
  defaultScriptTargetCorrection,
  type ScriptTargetCorrection,
} from "./script-target-correction";

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
  // Destress / settle
  "I have a job interview on Thursday at a design studio in Leeds and I keep replaying the last one that went badly. I want to feel steady and remember I'm good at this.",
  "My partner and I had another sharp argument last night and I keep going over what I should have said. I want to soften and come back to myself before we talk again.",
  "I've been running on empty all week and can't switch off. I want a quiet practice that helps me rest without trying to fix anything.",
  // Aspirational
  "I'm building a small creative studio and I want to feel the version of me who already ships work with calm confidence — not grinding, just clear and proud.",
  "Tomorrow I pitch my first big client. I want a practice that helps me walk in as someone who belongs there, warm and sharp, not performing calm.",
  "I've been training for a half-marathon and I want to rehearse finishing strong: body light, breath easy, mind kind when it gets hard.",
  "I want to feel genuinely grateful for the life I'm growing into — a home that feels soft, work that fits, people I love nearby — as if it's already arriving.",
  // Prescriptive / specific guidance
  "Guide me through box breathing only: in for 4, hold 4, out for 4, hold 4, for several rounds. Say the counts out loud. No other techniques. End by telling me to notice one thing I can hear.",
  "Do a slow body scan from the crown of the head down to the feet, naming each area once. After the feet, have me silently repeat: I am here, and that is enough. Then a short close.",
  "Open with me seated, feet on the floor, hands on thighs. Then a visualisation of walking into a sunlit room where a future version of me is already waiting — describe the room in concrete detail, have me notice three specific things, then return to the breath and close.",
];

export type ScriptGenerationSettings = {
  scriptModelId: string;
  scriptModelOptions: string[];
  /** Correction factors keyed by Claude model id (length × delivery). */
  targetCorrectionByModel: Record<string, ScriptTargetCorrection>;
  /** Models that have finished at least one calibration batch. */
  calibratedModelIds: string[];
  /** Briefs used by Run calibration (editable; default 10). */
  calibrationBriefs: string[];
};

export function defaultScriptGenerationSettings(): ScriptGenerationSettings {
  return {
    scriptModelId: DEFAULT_SCRIPT_MODEL_ID,
    scriptModelOptions: [...DEFAULT_SCRIPT_MODEL_OPTIONS],
    targetCorrectionByModel: {
      [DEFAULT_SCRIPT_MODEL_ID]: defaultScriptTargetCorrection(),
    },
    // Length×delivery factors start at 1 until Run calibration.
    calibratedModelIds: [],
    calibrationBriefs: [...DEFAULT_CALIBRATION_BRIEFS],
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
  return {
    scriptModelId,
    scriptModelOptions,
    targetCorrectionByModel,
    calibratedModelIds,
    calibrationBriefs,
  };
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

export function resetCorrectionForModel(
  settings: ScriptGenerationSettings,
  modelId: string,
): ScriptGenerationSettings {
  const id = coerceClaudeModel(modelId);
  const next = { ...settings.targetCorrectionByModel };
  delete next[id];
  return {
    ...settings,
    targetCorrectionByModel: next,
    calibratedModelIds: settings.calibratedModelIds.filter((x) => x !== id),
  };
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
