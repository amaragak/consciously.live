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
  "I've been running on empty all week and can't switch off. I want a quiet practice that helps me rest without trying to fix anything.",
  "I'm building a small creative studio and I want to feel the version of me who already ships work with calm confidence — not grinding, just clear and proud.",
  "Tomorrow I pitch my first big client. I want a practice that helps me walk in as someone who belongs there, warm and sharp, not performing calm.",
  "I've been training for a half-marathon and I want to rehearse finishing strong: body light, breath easy, mind kind when it gets hard.",
  "I want to feel genuinely grateful for the life I'm growing into — a home that feels soft, work that fits, people I love nearby — as if it's already arriving.",
  "Guide me through box breathing only: in for 4, hold 4, out for 4, hold 4, for several rounds. Say the counts out loud. No other techniques. End by telling me to notice one thing I can hear.",
  "Do a slow body scan from the crown of the head down to the feet, naming each area once. After the feet, have me silently repeat: I am here, and that is enough. Then a short close.",
  "Open with me seated, feet on the floor, hands on thighs. Then a visualisation of walking into a sunlit room where a future version of me is already waiting — describe the room in concrete detail, have me notice three specific things, then return to the breath and close.",
] as const;

export type ScriptGenerationSettings = {
  scriptModelId: string;
  scriptModelOptions: string[];
  targetCorrectionByModel: Record<string, ScriptTargetCorrection>;
  calibratedModelIds: string[];
  calibrationBriefs: string[];
};

export function defaultScriptGenerationSettings(): ScriptGenerationSettings {
  return {
    scriptModelId: DEFAULT_SCRIPT_MODEL_ID,
    scriptModelOptions: [...DEFAULT_SCRIPT_MODEL_OPTIONS],
    targetCorrectionByModel: {
      [DEFAULT_SCRIPT_MODEL_ID]: defaultScriptTargetCorrection(),
    },
    calibratedModelIds: [],
    calibrationBriefs: [...DEFAULT_CALIBRATION_BRIEFS],
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
  const byModel: Record<string, ScriptTargetCorrection> = {};
  const rawBy = o.targetCorrectionByModel;
  if (rawBy && typeof rawBy === "object") {
    for (const [k, v] of Object.entries(rawBy as Record<string, unknown>)) {
      byModel[k] = coerceScriptTargetCorrection(v);
    }
  }
  if (!byModel[scriptModelId]) {
    byModel[scriptModelId] = defaultScriptTargetCorrection();
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
  const calibrationBriefs =
    briefsRaw.length >= CALIBRATION_BRIEF_COUNT
      ? briefsRaw.slice(0, CALIBRATION_BRIEF_COUNT)
      : [
          ...briefsRaw,
          ...DEFAULT_CALIBRATION_BRIEFS.slice(briefsRaw.length),
        ].slice(0, CALIBRATION_BRIEF_COUNT);
  return {
    scriptModelId,
    scriptModelOptions: opts,
    targetCorrectionByModel: byModel,
    calibratedModelIds,
    calibrationBriefs,
  };
}

export function modelHasFactors(
  settings: ScriptGenerationSettings,
  modelId: string,
): boolean {
  if (settings.calibratedModelIds.includes(modelId)) return true;
  const c = settings.targetCorrectionByModel[modelId];
  return c ? correctionHasCalibratedSamples(c) : false;
}

export { claudeModelLabel };
