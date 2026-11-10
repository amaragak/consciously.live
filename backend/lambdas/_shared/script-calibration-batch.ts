/**
 * Admin › Delivery profiles · Run calibration.
 * 9 length×delivery cells × 3 briefs = 27 scripts, no TTS.
 * Factors OFF while measuring; results → word/pause factors; scripts stored
 * per model so a model change can re-run the same briefs easily.
 */
import { getClaudeApiKey } from "./anthropic-messages";
import {
  CLAUDE_HAIKU_55_MODEL_ID,
  coerceClaudeModel,
  withClaudeThinkingOff,
} from "./anthropic-pricing";
import {
  defaultDeliveryProfiles,
  pauseRulesForPrompt,
  pauseRulesForSectionPrompt,
  silenceShareFor,
  type DeliveryId,
} from "./delivery-profiles";
import { countSpokenWords } from "./meditation-length-fit";
import { buildMeditationScriptGenerationPrompt } from "./meditation-script-generate-prompt";
import {
  computeLengthDeliveryFactors,
  defaultScriptTargetCorrection,
  lengthKeyForMinutes,
  type ScriptTargetCorrection,
} from "./script-target-correction";
import {
  CALIBRATION_BRIEF_COUNT,
  DEFAULT_CALIBRATION_BRIEFS,
  markModelCalibrated,
  type ScriptGenerationSettings,
} from "./script-generation-settings";
import {
  joinSectionTexts,
  measurePlannedSections,
  planScriptSections,
  sessionTotals,
  writeScriptSections,
} from "./script-section-generate";
import { sumPauseMarkerSeconds } from "./script-pause-bands";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Median fleet effective WPM (measured at rate 0 × production −20% slowing). */
export const CALIBRATION_MEDIAN_WPM = 138.7 * 0.8;

export const CALIBRATE_MINUTES = [5, 10, 20] as const;
export const CALIBRATE_DELIVERIES: DeliveryId[] = [
  "casual",
  "guided",
  "open_sits",
];

/** Same three voices for Run check (effective WPM at −20% rate). */
export const CHECK_VOICES = [
  { name: "Beatrice", wpm: 136.6 * 0.8 },
  { name: "Elijah", wpm: 127.8 * 0.8 * 1.03 },
  { name: "Oliver", wpm: 151.5 * 0.8 * 0.96 },
] as const;

const LEAD = 20;
const TAIL = 20;

export type CalibrationSectionMeasure = {
  name: string;
  /** Plan intention (sections path) — fidelity check uses this. */
  intention?: string;
  targetWords: number;
  writtenWords: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  /** Spoken text for this section (sections path). */
  text?: string;
};

/**
 * LLM brief-fidelity verdict. Designed for parallel section writes: each
 * section is generated without seeing the others, so weak transitions,
 * mild cross-section repetition, or a loose narrative thread are NOT
 * treated as diversion. Diversion = ignored / contradicted the user brief
 * or missed explicit prescribed technique / phrases.
 */
export type BriefFidelityResult = {
  diverted: boolean;
  notes: string;
  /** Section names that clearly ignore or contradict the brief. */
  divertedSections: string[];
  checkMs: number;
  /** Judge model (Haiku). */
  model: string;
};

export type CalibrationCellResult = {
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  path: "single" | "sections";
  sections: CalibrationSectionMeasure[];
  targetWords: number;
  writtenWords: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  /** Full script text as written (for re-inspect / archive). */
  scriptText: string;
  planMs: number;
  writeMs: number;
  /** Final LLM check: did the script divert from the user brief? */
  briefFidelity?: BriefFidelityResult;
  error?: string;
};

export type StoredCalibrationBatch = {
  modelId: string;
  ranAt: string;
  briefs: string[];
  medianWpm: number;
  cells: CalibrationCellResult[];
  /** Factors computed from this batch (also saved on scriptGeneration). */
  factors: ScriptTargetCorrection;
  failures: Array<{ delivery: DeliveryId; minutes: number; briefIndex: number; error: string }>;
  /** Scripts the fidelity judge flagged as diverted from the brief. */
  diversions?: Array<{
    delivery: DeliveryId;
    minutes: number;
    briefIndex: number;
    brief: string;
    notes: string;
    divertedSections: string[];
  }>;
};

export function diversionsFromCells(
  cells: CalibrationCellResult[],
): NonNullable<StoredCalibrationBatch["diversions"]> {
  return cells
    .filter((c) => c.briefFidelity?.diverted)
    .map((c) => ({
      delivery: c.delivery,
      minutes: c.minutes,
      briefIndex: c.briefIndex,
      brief: c.brief,
      notes: c.briefFidelity?.notes || "",
      divertedSections: c.briefFidelity?.divertedSections || [],
    }));
}

function transcriptFromBrief(brief: string): string {
  const b = brief.trim();
  return `User: ${b}\nGuide: That makes sense. Would you like a short practice for that?\nUser: Yes, please.`;
}

function coerceBriefs(raw: string[] | undefined): string[] {
  const cleaned = (raw ?? [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  if (cleaned.length >= CALIBRATION_BRIEF_COUNT) {
    return cleaned.slice(0, CALIBRATION_BRIEF_COUNT);
  }
  return [
    ...cleaned,
    ...DEFAULT_CALIBRATION_BRIEFS.slice(cleaned.length),
  ].slice(0, CALIBRATION_BRIEF_COUNT);
}

async function claudeOnce(params: {
  apiKey: string;
  model: string;
  system: string;
  userContent: string;
  maxTokens?: number;
}): Promise<{ text: string; ms: number }> {
  const t0 = Date.now();
  for (let a = 0; a < 3; a++) {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(
        withClaudeThinkingOff({
          model: params.model,
          max_tokens: params.maxTokens ?? 8192,
          system: params.system,
          messages: [{ role: "user", content: params.userContent }],
        }),
      ),
    });
    const j = (await r.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const t = j.content?.find((c) => c?.type === "text")?.text?.trim();
    if (t) return { text: t, ms: Date.now() - t0 };
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("Claude empty during calibration cell");
}

const FIDELITY_SYSTEM = `You judge whether a meditation script stayed with the user's brief.

Production context (important):
- Long scripts are planned as sections, then each section is written in parallel.
- A section writer does NOT see other sections' wording — only the plan (name, intention, covers).
- So mild repetition across sections, soft or abrupt joins, or a loose narrative thread between neighbours are NORMAL. Do NOT flag those as diversion.

Flag diverted=true only when:
- The practice as a whole ignores or replaces the user's situation / request, OR
- The brief prescribed a specific technique, structure, counts, mantra, visualisation detail, or phrases and those are clearly missing or contradicted, OR
- One or more sections actively contradict the brief (different problem, wrong technique, inventing a different ask).

Do NOT flag diverted for:
- Cross-section continuity gaps, repeated setup lines, or thin bridges between sections
- Softening or generalising the brief while still serving it
- Delivery style (casual / guided / open sits) shaping how much is said

Reply with ONLY JSON:
{"diverted":boolean,"notes":"one short sentence","divertedSections":["section-name",...]}
divertedSections: names of sections that clearly ignore/contradict the brief (empty if none or single-call).`;

/**
 * Final fidelity check after a cell is written. Uses Haiku.
 * Passes sections separately so the judge can respect parallel-gen limits.
 */
export async function checkBriefFidelity(params: {
  apiKey: string;
  brief: string;
  delivery: DeliveryId;
  minutes: number;
  path: "single" | "sections";
  scriptText: string;
  sections: CalibrationSectionMeasure[];
}): Promise<BriefFidelityResult> {
  const model = CLAUDE_HAIKU_55_MODEL_ID;
  const sectionBlock =
    params.path === "sections" && params.sections.length > 0
      ? params.sections
          .map((s, i) => {
            const body = (s.text || "").trim() || "(empty)";
            const intention = s.intention?.trim() || "";
            return [
              `### Section ${i + 1}: ${s.name}`,
              intention ? `Plan intention: ${intention}` : null,
              `Text:\n${body.slice(0, 2500)}`,
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n")
      : `### Full script (single call)\n${params.scriptText.slice(0, 8000)}`;

  const userContent = [
    `Delivery: ${params.delivery} · ${params.minutes} min · path: ${params.path}`,
    "",
    "## User brief",
    params.brief.trim(),
    "",
    "## Script to judge",
    sectionBlock,
    "",
    "Did this divert from the user brief? JSON only.",
  ].join("\n");

  try {
    const out = await claudeOnce({
      apiKey: params.apiKey,
      model,
      system: FIDELITY_SYSTEM,
      userContent,
      maxTokens: 400,
    });
    const jsonMatch = out.text.match(/\{[\s\S]*\}/);
    let diverted = false;
    let notes = "";
    let divertedSections: string[] = [];
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          diverted?: unknown;
          notes?: unknown;
          divertedSections?: unknown;
        };
        diverted = parsed.diverted === true;
        notes =
          typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 400) : "";
        if (Array.isArray(parsed.divertedSections)) {
          divertedSections = parsed.divertedSections
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim())
            .slice(0, 12);
        }
      } catch {
        notes = "Fidelity JSON parse failed";
      }
    } else {
      notes = "Fidelity judge returned no JSON";
    }
    return {
      diverted,
      notes,
      divertedSections,
      checkMs: out.ms,
      model,
    };
  } catch (e) {
    return {
      diverted: false,
      notes: `Fidelity check failed: ${e instanceof Error ? e.message : String(e)}`.slice(
        0,
        240,
      ),
      divertedSections: [],
      checkMs: 0,
      model,
    };
  }
}

/**
 * One of 27: generate script with factors OFF, measure words/pauses.
 * Retries up to twice on failure (caller may also retry).
 */
export async function runCalibrationCell(params: {
  modelId: string;
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  medianWpm?: number;
}): Promise<CalibrationCellResult> {
  const model = coerceClaudeModel(params.modelId);
  const profiles = defaultDeliveryProfiles();
  const silenceShare = silenceShareFor(profiles, params.delivery);
  const medianWpm = params.medianWpm ?? CALIBRATION_MEDIAN_WPM;
  const voiceWpm = medianWpm;
  const stem = params.minutes * 60 - LEAD - TAIL;
  const totals = sessionTotals({
    stemSeconds: stem,
    silenceShare,
    medianWpm,
    voiceWpm,
    pauseScale: 1.12,
    commaBreakSeconds: 0.55,
    titleIntro: true,
  });
  const transcript = transcriptFromBrief(params.brief);
  const apiKey = await getClaudeApiKey();
  const useSections = totals.totalWords >= profiles.shared.planMinWords;
  const base: Omit<CalibrationCellResult, "path" | "sections" | "writtenWords" | "writtenPauseSeconds" | "scriptText" | "planMs" | "writeMs"> = {
    delivery: params.delivery,
    minutes: params.minutes,
    briefIndex: params.briefIndex,
    brief: params.brief,
    targetWords: totals.totalWords,
    plannedPauseSeconds: totals.totalPauseSeconds,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!useSections) {
        const prompt = buildMeditationScriptGenerationPrompt({
          transcript,
          meditationStyle: "Breathing",
          journalMode: false,
          targetMinutes: params.minutes,
          speechSpeed: 1,
          includeSegmentPlaceholders: false,
          deliveryStyle: params.delivery,
          pacing: { wpm: voiceWpm, speechShare: 1 - silenceShare },
          pauseRules: pauseRulesForPrompt(profiles, params.delivery),
          lengthFit: {
            effectiveWpm: voiceWpm,
            silenceSharePct: silenceShare * 100,
            words: totals.totalWords,
            pauseSecondsWritten: totals.totalPauseSeconds,
          },
        });
        const t0 = Date.now();
        const out = await claudeOnce({
          apiKey,
          model,
          system: prompt.system,
          userContent: prompt.userContent,
        });
        const writtenWords = countSpokenWords(out.text);
        const writtenPauseSeconds = Math.round(sumPauseMarkerSeconds(out.text));
        const sections: CalibrationSectionMeasure[] = [
          {
            name: "single",
            targetWords: totals.totalWords,
            writtenWords,
            plannedPauseSeconds: totals.totalPauseSeconds,
            writtenPauseSeconds,
            text: out.text,
          },
        ];
        const briefFidelity = await checkBriefFidelity({
          apiKey,
          brief: params.brief,
          delivery: params.delivery,
          minutes: params.minutes,
          path: "single",
          scriptText: out.text,
          sections,
        });
        return {
          ...base,
          path: "single",
          sections,
          writtenWords,
          writtenPauseSeconds,
          scriptText: out.text,
          planMs: 0,
          writeMs: Date.now() - t0,
          briefFidelity,
        };
      }

      const shared = {
        transcript,
        meditationStyle: "Breathing",
        journalMode: false,
        targetMinutes: params.minutes,
        speechSpeed: 1,
        deliveryStyle: params.delivery,
        pacing: { wpm: voiceWpm, speechShare: 1 - silenceShare },
        pauseRules: pauseRulesForSectionPrompt(params.delivery),
        lengthFit: {
          effectiveWpm: voiceWpm,
          silenceSharePct: silenceShare * 100,
          words: totals.totalWords,
          pauseSecondsWritten: totals.totalPauseSeconds,
        },
      };
      const planned = await planScriptSections({
        apiKey,
        model,
        shared,
        totals,
        wordCap: profiles.shared.sectionWordCap,
        wordMin: profiles.shared.sectionWordMin,
      });
      // Factors OFF — raw behaviour.
      const written = await writeScriptSections({
        apiKey,
        model,
        shared,
        plan: planned.plan,
        inOrder: false,
      });
      const measured = measurePlannedSections(written.sections, planned.plan);
      const scriptText = joinSectionTexts(written.sections);
      const sections: CalibrationSectionMeasure[] = planned.plan.sections.map(
        (s, i) => ({
          name: s.name || `section-${i + 1}`,
          intention: s.intention,
          targetWords: s.words,
          writtenWords: measured[i]?.words ?? 0,
          plannedPauseSeconds: s.pauseSeconds,
          writtenPauseSeconds: measured[i]?.pauseSeconds ?? 0,
          text: written.sections[i]?.text ?? "",
        }),
      );
      const briefFidelity = await checkBriefFidelity({
        apiKey,
        brief: params.brief,
        delivery: params.delivery,
        minutes: params.minutes,
        path: "sections",
        scriptText,
        sections,
      });
      return {
        ...base,
        path: "sections",
        sections,
        writtenWords: sections.reduce((a, s) => a + s.writtenWords, 0),
        writtenPauseSeconds: sections.reduce(
          (a, s) => a + s.writtenPauseSeconds,
          0,
        ),
        scriptText,
        planMs: planned.ms,
        writeMs: written.ms,
        briefFidelity,
      };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    ...base,
    path: useSections ? "sections" : "single",
    sections: [],
    writtenWords: 0,
    writtenPauseSeconds: 0,
    scriptText: "",
    planMs: 0,
    writeMs: 0,
    error: msg.slice(0, 240),
  };
}

/** Build the 27 work items from briefs. */
export function calibrationWorkItems(briefs?: string[]): Array<{
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
}> {
  const b = coerceBriefs(briefs);
  const out: Array<{
    delivery: DeliveryId;
    minutes: number;
    briefIndex: number;
    brief: string;
  }> = [];
  for (const delivery of CALIBRATE_DELIVERIES) {
    for (const minutes of CALIBRATE_MINUTES) {
      for (let briefIndex = 0; briefIndex < b.length; briefIndex++) {
        out.push({
          delivery,
          minutes,
          briefIndex,
          brief: b[briefIndex]!,
        });
      }
    }
  }
  return out;
}

/**
 * From 27 cell results → 9 factor pairs (target÷written, clamp 0.5–1.5).
 */
export function factorsFromCalibrationCells(
  cells: CalibrationCellResult[],
  setAt = new Date().toISOString(),
): ScriptTargetCorrection {
  const next = defaultScriptTargetCorrection();
  for (const delivery of CALIBRATE_DELIVERIES) {
    for (const minutes of CALIBRATE_MINUTES) {
      const key = lengthKeyForMinutes(minutes);
      const group = cells.filter(
        (c) =>
          c.delivery === delivery &&
          c.minutes === minutes &&
          !c.error &&
          c.writtenWords > 0,
      );
      if (!group.length) continue;
      const targetWords = group.reduce((a, c) => a + c.targetWords, 0);
      const writtenWords = group.reduce((a, c) => a + c.writtenWords, 0);
      const plannedPauseSeconds = group.reduce(
        (a, c) => a + c.plannedPauseSeconds,
        0,
      );
      const writtenPauseSeconds = group.reduce(
        (a, c) => a + c.writtenPauseSeconds,
        0,
      );
      next[delivery][key] = computeLengthDeliveryFactors({
        targetWords,
        writtenWords,
        plannedPauseSeconds,
        writtenPauseSeconds,
        sampleCount: group.length,
        setAt,
      });
    }
  }
  return next;
}

export function applyFactorsToSettings(
  settings: ScriptGenerationSettings,
  modelId: string,
  factors: ScriptTargetCorrection,
): ScriptGenerationSettings {
  const id = coerceClaudeModel(modelId);
  return markModelCalibrated(
    {
      ...settings,
      targetCorrectionByModel: {
        ...settings.targetCorrectionByModel,
        [id]: factors,
      },
    },
    id,
  );
}

/** Summary row for admin results table (one length×delivery). */
export function summarizeCalibrationCellGroup(
  cells: CalibrationCellResult[],
  delivery: DeliveryId,
  minutes: number,
  factors: ScriptTargetCorrection,
): {
  delivery: DeliveryId;
  minutes: number;
  scripts: number;
  wordsPct: number | null;
  pausesPct: number | null;
  wordFactor: number;
  pauseFactor: number;
  sampleCount: number;
} {
  const key = lengthKeyForMinutes(minutes);
  const group = cells.filter(
    (c) =>
      c.delivery === delivery &&
      c.minutes === minutes &&
      !c.error &&
      c.writtenWords > 0,
  );
  const f = factors[delivery][key];
  let wordsPct: number | null = null;
  let pausesPct: number | null = null;
  if (group.length) {
    const tw = group.reduce((a, c) => a + c.targetWords, 0);
    const ww = group.reduce((a, c) => a + c.writtenWords, 0);
    const tp = group.reduce((a, c) => a + c.plannedPauseSeconds, 0);
    const wp = group.reduce((a, c) => a + c.writtenPauseSeconds, 0);
    wordsPct = tw > 0 ? Math.round((ww / tw - 1) * 100) : null;
    pausesPct = tp > 0 ? Math.round((wp / tp - 1) * 100) : null;
  }
  return {
    delivery,
    minutes,
    scripts: group.length,
    wordsPct,
    pausesPct,
    wordFactor: f.words,
    pauseFactor: f.pauses,
    sampleCount: f.sampleCount,
  };
}
