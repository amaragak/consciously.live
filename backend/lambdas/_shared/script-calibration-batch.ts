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
  mergeAnthropicMessageUsage,
  parseAnthropicMessageUsage,
  withClaudeThinkingOff,
  type AnthropicMessageUsage,
} from "./anthropic-pricing";
import {
  defaultDeliveryProfiles,
  pauseRulesForPrompt,
  pauseRulesForSectionPrompt,
  sessionAroundFromProfiles,
  sectionSilenceSharesFor,
  silenceShareFor,
  type DeliveryId,
} from "./delivery-profiles";
import { recordClaudeUsage } from "./ai-usage";
import { resolveStyleGuideAttachment } from "./infer-meditation-style";
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
  type ScriptGenCallUsage,
} from "./script-section-generate";
import { sectionWordCapForDelivery } from "./script-sections";
import { sumPauseMarkerSeconds } from "./script-pause-bands";
import type { TimeLengthAccuracy } from "./script-time-based-generate";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Median fleet effective WPM (measured × production slowing × pace adjust).
 * 138.7 measured × 0.8 Speechify −20%; pace adjust averages ~1 across the fleet.
 */
export const CALIBRATION_MEDIAN_WPM = 138.7 * 0.8;

export const CALIBRATE_MINUTES = [5, 10, 20] as const;
export const CALIBRATE_DELIVERIES: DeliveryId[] = [
  "casual",
  "guided",
  "open_sits",
];

/** Same three voices for Run check (effective WPM = measured × slowing × pace). */
export const CHECK_VOICES = [
  { name: "Beatrice", wpm: 136.6 * 0.8 },
  { name: "Elijah", wpm: 127.8 * 0.8 * 1.03 },
  { name: "Oliver", wpm: 151.5 * 0.8 * 0.96 },
] as const;

/** @deprecated Prefer sessionAroundFromProfiles(profiles). */
const LEAD = 20;
/** @deprecated Prefer sessionAroundFromProfiles(profiles). */
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
  path:
    | "single"
    | "sections"
    | "time"
    | "silence"
    | "silence_haiku"
    | "silence_words"
    | "silence_words_haiku";
  /** Silence-fit family option. */
  silenceFitOption?: import("./script-silence-fit-settings").SilenceFitOptionId;
  sections: CalibrationSectionMeasure[];
  targetWords: number;
  writtenWords: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  /** Full script text as written (for re-inspect / archive). */
  scriptText: string;
  /** Silence-fit: script before pause fitting. */
  scriptTextAsWritten?: string;
  /** Time-based mode: outline kept for admin preview / logs (deprecated — headers). */
  outline?: string;
  /** Time-based mode: per-phase header vs actual (sentences / time). */
  timePhases?: Array<{
    name: string;
    headerMinutes: number;
    headerSentences: number;
    actualSentences: number;
    words: number;
    speechSeconds: number;
    pauseSeconds: number;
    totalSeconds: number;
    deltaSeconds: number;
  }>;
  /** Time-based one-call: extendable-pause fit missed length tolerance. */
  timeOutsideTolerance?: boolean;
  timeOutsideReason?: "too_short" | "too_long" | null;
  /** Time-based length accuracy snapshot (Accuracy tab). */
  timeLengthAccuracy?: TimeLengthAccuracy;
  /** Silence-fit accuracy snapshot (Accuracy tab). */
  silenceFitAccuracy?: import("./script-silence-fit-generate").SilenceFitAccuracy;
  /** Silence-fit + Haiku accuracy snapshot (Accuracy tab). */
  silenceHaikuAccuracy?: import("./script-silence-haiku-generate").SilenceHaikuAccuracy;
  /** Silence-fit + Haiku: script after Haiku, before silence fit. */
  scriptTextAfterHaiku?: string;
  /** Silence-fit · words accuracy snapshot (Accuracy tab). */
  silenceWordsAccuracy?: import("./script-silence-words-generate").SilenceWordsAccuracy;
  silenceWordsHaikuAccuracy?: import("./script-silence-words-haiku-generate").SilenceWordsHaikuAccuracy;
  planMs: number;
  writeMs: number;
  /** Claude usage for this cell (plan + section/single writes; excludes fidelity). */
  usage?: AnthropicMessageUsage | null;
  /** Per Messages-call breakdown (plan / each section / fix). */
  calls?: ScriptGenCallUsage[];
  /** True when a writer's style guide was included in the system prompt. */
  guideAttached?: boolean;
  /** Canonical style whose guide was attached (if any). */
  guideStyle?: string | null;
  /** How the guide was chosen — mirrors production create. */
  guideSource?: "creator" | "inferred" | "none";
  /** Final LLM check: did the script divert from the user brief? */
  briefFidelity?: BriefFidelityResult;
  error?: string;
};

export type StoredCalibrationBatch = {
  modelId: string;
  ranAt: string;
  briefs: string[];
  /** Briefs used this run (n). Tables/factors use only this run’s cells. */
  briefCount?: number;
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

function scriptTextForFidelity(cell: CalibrationCellResult): string {
  const full = (cell.scriptText || "").trim();
  if (full) return full;
  return (cell.sections || [])
    .map((s) => (s.text || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * Re-run Haiku fidelity on already-stored calibration scripts (no regen).
 * Updates each cell's briefFidelity and returns fresh diversions.
 */
export async function rejudgeCalibrationFidelity(params: {
  cells: CalibrationCellResult[];
  concurrency?: number;
}): Promise<{
  cells: CalibrationCellResult[];
  diversions: NonNullable<StoredCalibrationBatch["diversions"]>;
  judged: number;
  skipped: number;
}> {
  const apiKey = await getClaudeApiKey();
  const concurrency = Math.max(1, Math.min(params.concurrency ?? 6, 12));
  const out: CalibrationCellResult[] = params.cells.map((c) => ({ ...c }));
  let judged = 0;
  let skipped = 0;
  let cursor = 0;

  async function one(i: number): Promise<void> {
    const cell = out[i]!;
    const scriptText = scriptTextForFidelity(cell);
    if (!scriptText || cell.error) {
      skipped += 1;
      return;
    }
    const path = cell.path === "single" ? "single" : "sections";
    const briefFidelity = await checkBriefFidelity({
      apiKey,
      brief: cell.brief || "",
      delivery: cell.delivery,
      minutes: cell.minutes,
      path,
      scriptText,
      sections: cell.sections || [],
    });
    out[i] = { ...cell, briefFidelity };
    judged += 1;
  }

  async function worker(): Promise<void> {
    while (cursor < out.length) {
      const i = cursor;
      cursor += 1;
      await one(i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, out.length) }, () => worker()),
  );

  return {
    cells: out,
    diversions: diversionsFromCells(out),
    judged,
    skipped,
  };
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
  reason?: string;
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
    const responseText = await r.text();
    let j: {
      content?: Array<{ type?: string; text?: string }>;
    } = {};
    try {
      j = JSON.parse(responseText) as typeof j;
    } catch {
      j = {};
    }
    const t = j.content?.find((c) => c?.type === "text")?.text?.trim();
    if (t) {
      const usage = parseAnthropicMessageUsage(responseText);
      if (usage) {
        void recordClaudeUsage({
          model: params.model,
          feature: "meditation-script",
          source: "admin",
          reason: params.reason ?? "script-calibration",
          usage,
        });
      }
      return { text: t, ms: Date.now() - t0 };
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("Claude empty during calibration cell");
}

const FIDELITY_SYSTEM = `You judge whether a meditation script is good enough for the user.

You check two things:
1) Brief fidelity — did the script stay with the user's request?
2) Section flow — when the script is written in sections, do neighbouring sections join naturally (not awkward, abrupt, or restarting as if a new piece)?

Production context:
- Long scripts are planned as sections, then each section may be written in parallel (a writer may not see other sections' wording).
- That makes continuity failures more likely — still flag them. Mild shared vocabulary is fine; awkward joins are not.

Flag diverted=true when ANY of these are true:
- The practice as a whole ignores or replaces the user's situation / request
- The brief prescribed a specific technique, structure, counts, mantra, visualisation detail, or phrases and those are clearly missing or contradicted
- One or more sections actively contradict the brief (different problem, wrong technique, inventing a different ask)
- Neighbouring sections feel discontinuous: abrupt topic jump, restarting the settle/intro, repeating the same setup as if the listener heard nothing, or a join that would sound awkward spoken aloud

Do NOT flag diverted for:
- Softening or generalising the brief while still serving it
- Delivery style (casual / guided / open sits) shaping how much is said
- Small shared phrases across sections that still read as one continuous guide

Reply with ONLY JSON:
{"diverted":boolean,"notes":"one short sentence","divertedSections":["section-name",...]}
divertedSections: names of sections that ignore/contradict the brief OR join awkwardly with their neighbour (empty if none or single-call with no brief issue).`

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
      reason: "script-calibration-fidelity",
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
  /** Admin setting; defaults to Haiku inside infer. */
  styleInferModelId?: string;
}): Promise<CalibrationCellResult> {
  const model = coerceClaudeModel(params.modelId);
  const profiles = defaultDeliveryProfiles();
  const silenceShare = silenceShareFor(profiles, params.delivery);
  const medianWpm = params.medianWpm ?? CALIBRATION_MEDIAN_WPM;
  const voiceWpm = medianWpm;
  const around = sessionAroundFromProfiles(profiles);
  const lead = around.leadInSeconds || LEAD;
  const tail = around.fadeOutSeconds || TAIL;
  const stem = params.minutes * 60 - lead - tail;
  const titlePauseWritten =
    around.titleLeadPauseSeconds + around.titleTrailPauseSeconds;
  const totals = sessionTotals({
    stemSeconds: stem,
    silenceShare,
    medianWpm,
    voiceWpm,
    pauseScale: 1.12,
    commaBreakSeconds: 0.55,
    titleIntro: true,
    titlePauseSecondsWritten: titlePauseWritten,
  });
  const transcript = transcriptFromBrief(params.brief);
  const apiKey = await getClaudeApiKey();
  // Same as production create: no creator style → Haiku-infer; attach guide only
  // on high-confidence known style. (Was hardcoding "Breathing", which never
  // matched a guide.)
  const guide = await resolveStyleGuideAttachment({
    apiKey,
    styleInferModelId: params.styleInferModelId,
    transcript,
    meditationStyle: "",
    journalMode: false,
    usageSource: "admin",
  });
  // Always-sections v2: sectioned calibration always plans (no short-session
  // single-call shortcut). planMinWords no longer gates this path.
  // const useSections = totals.totalWords >= profiles.shared.planMinWords;
  const useSections = true;
  void profiles.shared.planMinWords;
  const base: Omit<CalibrationCellResult, "path" | "sections" | "writtenWords" | "writtenPauseSeconds" | "scriptText" | "planMs" | "writeMs"> = {
    delivery: params.delivery,
    minutes: params.minutes,
    briefIndex: params.briefIndex,
    brief: params.brief,
    targetWords: totals.totalWords,
    plannedPauseSeconds: totals.totalPauseSeconds,
    guideAttached: guide.guideAttached,
    guideStyle: guide.guideStyle,
    guideSource: guide.source,
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!useSections) {
        // Kept for reference — short-session single-call shortcut removed.
        const prompt = buildMeditationScriptGenerationPrompt({
          transcript,
          meditationStyle: "",
          journalMode: false,
          targetMinutes: params.minutes,
          speechSpeed: 1,
          includeSegmentPlaceholders: false,
          deliveryStyle: params.delivery,
          pacing: { wpm: voiceWpm, speechShare: 1 - silenceShare },
          pauseRules: pauseRulesForPrompt(profiles, params.delivery),
          styleGuideContext: {
            silenceShare,
            longestPauseSeconds: profiles.casual.longestPause,
          },
          styleGuideStyle: guide.styleGuideStyle ?? undefined,
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
        meditationStyle: "",
        journalMode: false,
        targetMinutes: params.minutes,
        speechSpeed: 1,
        deliveryStyle: params.delivery,
        pacing: { wpm: voiceWpm, speechShare: 1 - silenceShare },
        pauseRules: pauseRulesForSectionPrompt(params.delivery),
        styleGuideContext: {
          silenceShare,
          longestPauseSeconds: profiles.casual.longestPause,
        },
        styleGuideStyle: guide.styleGuideStyle ?? undefined,
        usageSource: "admin" as const,
        usageReasonPrefix: "script-calibration",
        lengthFit: {
          effectiveWpm: voiceWpm,
          silenceSharePct: silenceShare * 100,
          words: totals.totalWords,
          pauseSecondsWritten: totals.totalPauseSeconds,
        },
      };
      const deliveryWordCap = sectionWordCapForDelivery({
        hardCap: profiles.shared.sectionWordCap,
        maxSectionMinutes: profiles.shared.maxSectionMinutes,
        medianWpm: medianWpm,
        silenceShare,
      });
      const edgeSilence = sectionSilenceSharesFor(profiles, params.delivery);
      const planned = await planScriptSections({
        apiKey,
        model,
        shared,
        totals,
        wordCap: deliveryWordCap,
        wordMin: profiles.shared.sectionWordMin,
        medianWpm: medianWpm,
        silenceShare: edgeSilence.middle,
        firstSilenceShare: edgeSilence.first,
        lastSilenceShare: edgeSilence.last,
        maxSectionMinutes: profiles.shared.maxSectionMinutes,
      });
      // Factors OFF — raw behaviour. Sections start only after plan (writes cache).
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
        usage: mergeAnthropicMessageUsage([planned.usage, written.usage]),
        calls: [...(planned.calls ?? []), ...(written.calls ?? [])],
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

/**
 * Build work items from briefs.
 * Pass already-sliced active briefs (honours calibrationBriefCount).
 */
export function calibrationWorkItems(briefs?: string[]): Array<{
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
}> {
  // When caller passes an explicit short list (n < 10), use it as-is.
  // coerceBriefs pads to 10 — only use that when briefs omitted.
  const b =
    Array.isArray(briefs) && briefs.length > 0
      ? briefs
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : coerceBriefs(briefs);
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

/** Keep only cells from the active brief window (this run’s n). */
export function cellsForActiveBriefs<
  T extends { briefIndex: number },
>(cells: T[], briefCount: number): T[] {
  const n = Math.max(1, Math.round(briefCount) || 1);
  return cells.filter((c) => c.briefIndex >= 0 && c.briefIndex < n);
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

export type CalibrationScriptFactorRow = {
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  path:
    | "single"
    | "sections"
    | "time"
    | "silence"
    | "silence_haiku"
    | "silence_words"
    | "silence_words_haiku";
  targetWords: number;
  writtenWords: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  /** Raw target÷written for this script (unclamped). */
  wordFactor: number | null;
  pauseFactor: number | null;
};

export type CalibrationFactorSpreadRow = {
  delivery: DeliveryId;
  minutes: number;
  scripts: number;
  /** Saved / pooled factor for this cell (Σtarget÷Σwritten, clamped). */
  pooledWordFactor: number;
  pooledPauseFactor: number;
  wordMin: number | null;
  wordMedian: number | null;
  wordMax: number | null;
  pauseMin: number | null;
  pauseMedian: number | null;
  pauseMax: number | null;
};

function medianOf(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Per-script implied factors from stored calibration cells. */
export function perScriptFactorRows(
  cells: CalibrationCellResult[],
): CalibrationScriptFactorRow[] {
  return cells
    .filter((c) => !c.error && c.writtenWords > 0)
    .map((c) => ({
      delivery: c.delivery,
      minutes: c.minutes,
      briefIndex: c.briefIndex,
      brief: c.brief || "",
      path: c.path,
      targetWords: c.targetWords,
      writtenWords: c.writtenWords,
      plannedPauseSeconds: c.plannedPauseSeconds,
      writtenPauseSeconds: c.writtenPauseSeconds,
      wordFactor:
        c.writtenWords > 0 ? c.targetWords / c.writtenWords : null,
      pauseFactor:
        c.writtenPauseSeconds > 0
          ? c.plannedPauseSeconds / c.writtenPauseSeconds
          : null,
    }))
    .sort((a, b) => {
      const ka = `${a.delivery}|${String(a.minutes).padStart(2, "0")}|${a.briefIndex}`;
      const kb = `${b.delivery}|${String(b.minutes).padStart(2, "0")}|${b.briefIndex}`;
      return ka.localeCompare(kb);
    });
}

export type CalibrationScriptSectionBreakdown = {
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  path:
    | "single"
    | "sections"
    | "time"
    | "silence"
    | "silence_haiku"
    | "silence_words"
    | "silence_words_haiku";
  sectionCount: number;
  sections: Array<{
    name: string;
    /** Plan intention / topic for this section. */
    topic: string;
    targetWords: number;
    writtenWords: number;
    plannedPauseSeconds: number;
    writtenPauseSeconds: number;
  }>;
};

/** Per-script section plan/write breakdown from stored calibration cells. */
export function perScriptSectionBreakdown(
  cells: CalibrationCellResult[],
): CalibrationScriptSectionBreakdown[] {
  return cells
    .filter((c) => !c.error && (c.sections?.length > 0 || c.writtenWords > 0))
    .map((c) => {
      const sections = (c.sections || []).map((s, i) => ({
        name: s.name || `section-${i + 1}`,
        topic: (s.intention || s.name || "").trim(),
        targetWords: s.targetWords ?? 0,
        writtenWords: s.writtenWords ?? 0,
        plannedPauseSeconds: s.plannedPauseSeconds ?? 0,
        writtenPauseSeconds: s.writtenPauseSeconds ?? 0,
      }));
      return {
        delivery: c.delivery,
        minutes: c.minutes,
        briefIndex: c.briefIndex,
        brief: c.brief || "",
        path: c.path,
        sectionCount: sections.length || (c.path === "sections" ? 0 : 1),
        sections:
          sections.length > 0
            ? sections
            : [
                {
                  name: "single",
                  topic: "",
                  targetWords: c.targetWords,
                  writtenWords: c.writtenWords,
                  plannedPauseSeconds: c.plannedPauseSeconds,
                  writtenPauseSeconds: c.writtenPauseSeconds,
                },
              ],
      };
    })
    .sort((a, b) => {
      const ka = `${a.delivery}|${String(a.minutes).padStart(2, "0")}|${a.briefIndex}`;
      const kb = `${b.delivery}|${String(b.minutes).padStart(2, "0")}|${b.briefIndex}`;
      return ka.localeCompare(kb);
    });
}

/** Min / median / max of per-script factors vs pooled saved factor. */
export function factorSpreadRows(
  cells: CalibrationCellResult[],
  factors: ScriptTargetCorrection,
): CalibrationFactorSpreadRow[] {
  const scripts = perScriptFactorRows(cells);
  const rows: CalibrationFactorSpreadRow[] = [];
  for (const delivery of CALIBRATE_DELIVERIES) {
    for (const minutes of CALIBRATE_MINUTES) {
      const key = lengthKeyForMinutes(minutes);
      const group = scripts.filter(
        (c) => c.delivery === delivery && c.minutes === minutes,
      );
      const wordVals = group
        .map((c) => c.wordFactor)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .sort((a, b) => a - b);
      const pauseVals = group
        .map((c) => c.pauseFactor)
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .sort((a, b) => a - b);
      const f = factors[delivery][key];
      rows.push({
        delivery,
        minutes,
        scripts: group.length,
        pooledWordFactor: f.words,
        pooledPauseFactor: f.pauses,
        wordMin: wordVals[0] ?? null,
        wordMedian: medianOf(wordVals),
        wordMax: wordVals[wordVals.length - 1] ?? null,
        pauseMin: pauseVals[0] ?? null,
        pauseMedian: medianOf(pauseVals),
        pauseMax: pauseVals[pauseVals.length - 1] ?? null,
      });
    }
  }
  return rows;
}
