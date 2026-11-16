/**
 * Single-call calibration (own factors) and head-to-head vs sectioned mode.
 * Scripts only — no TTS. Predicted length = words/WPM + written pauses
 * (before pause scaling / fix).
 */
import { getClaudeApiKey } from "./anthropic-messages";
import { buildScriptGenerationCachedBody } from "./anthropic-prompt-cache";
import {
  coerceClaudeModel,
  mergeAnthropicMessageUsage,
  parseAnthropicMessageUsage,
  type AnthropicMessageUsage,
} from "./anthropic-pricing";
import { recordClaudeUsage } from "./ai-usage";
import {
  defaultDeliveryProfiles,
  pauseRulesForPrompt,
  pauseRulesForSectionPrompt,
  sessionAroundFromProfiles,
  sectionSilenceSharesFor,
  silenceShareFor,
  type DeliveryId,
} from "./delivery-profiles";
import { resolveStyleGuideAttachment } from "./infer-meditation-style";
import {
  aroundScriptSeconds,
  countSpokenWords,
  lengthPctVsRequested,
  predictTotalSessionSeconds,
  TITLE_INTRO_SPEECH_SECONDS,
  titleIntroPauseSecondsWritten,
} from "./meditation-length-fit";
import { buildMeditationScriptGenerationPrompt } from "./meditation-script-generate-prompt";
import {
  applyCorrectionToPauseSeconds,
  applyCorrectionToWords,
  computeLengthDeliveryFactors,
  defaultScriptTargetCorrection,
  factorsFor,
  lengthKeyForMinutes,
  type ScriptTargetCorrection,
} from "./script-target-correction";
import {
  CALIBRATE_DELIVERIES,
  CALIBRATE_MINUTES,
  CALIBRATION_MEDIAN_WPM,
  type CalibrationCellResult,
  type CalibrationSectionMeasure,
} from "./script-calibration-batch";
import {
  joinSectionTexts,
  measurePlannedSections,
  planScriptSections,
  sessionTotals,
  writeScriptSections,
} from "./script-section-generate";
import { sectionWordCapForDelivery } from "./script-sections";
import { sumPauseMarkerSeconds } from "./script-pause-bands";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
/** @deprecated Prefer sessionAroundFromProfiles. */
const LEAD = 20;
/** @deprecated Prefer sessionAroundFromProfiles. */
const TAIL = 20;
const PAUSE_RENDER_SCALE = 1.12;

function transcriptFromBrief(brief: string): string {
  const b = brief.trim();
  return `User: ${b}\nGuide: That makes sense. Would you like a short practice for that?\nUser: Yes, please.`;
}

async function claudeOnce(params: {
  apiKey: string;
  model: string;
  systemStable: string;
  meditationContext: string;
  meditationContextExtra?: string;
  taskContent: string;
  reason?: string;
}): Promise<{ text: string; usage: AnthropicMessageUsage | null; ms: number }> {
  const t0 = Date.now();
  const body = buildScriptGenerationCachedBody({
    model: params.model,
    maxTokens: 8192,
    systemStable: params.systemStable,
    meditationContext: params.meditationContext,
    meditationContextExtra: params.meditationContextExtra,
    taskContent: params.taskContent,
    // Single-call keeps default effort (not section write `effort: low`).
  });
  for (let a = 0; a < 3; a++) {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const responseText = await r.text();
    if (!r.ok) {
      await new Promise((res) => setTimeout(res, 3000));
      continue;
    }
    const j = JSON.parse(responseText) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const t = j.content?.find((c) => c?.type === "text")?.text?.trim();
    if (!t) {
      await new Promise((res) => setTimeout(res, 3000));
      continue;
    }
    const usage = parseAnthropicMessageUsage(responseText);
    if (usage) {
      void recordClaudeUsage({
        model: params.model,
        feature: "meditation-script",
        source: "admin",
        reason: params.reason ?? "single-call-calibration",
        usage,
      });
    }
    return { text: t, usage, ms: Date.now() - t0 };
  }
  throw new Error("Claude empty during single-call cell");
}

function pct(a: number, b: number): number {
  if (!(b > 0)) return 0;
  return Math.round((a / b - 1) * 100);
}

/**
 * Predicted script-body length (speech + rendered pauses at production
 * pause scale), before long-pause fit.
 */
export function predictScriptPartSeconds(params: {
  writtenWords: number;
  writtenPauseSeconds: number;
  effectiveWpm: number;
  pauseScale?: number;
}): number {
  const speech =
    params.writtenWords > 0 && params.effectiveWpm > 0
      ? (params.writtenWords / params.effectiveWpm) * 60
      : 0;
  const scale = params.pauseScale ?? PAUSE_RENDER_SCALE;
  return speech + Math.max(0, params.writtenPauseSeconds) * scale;
}

/**
 * Predicted whole-session length: script body + parts around it
 * (lead-in, title, gap, fade-out).
 */
export function predictRawLengthSeconds(params: {
  writtenWords: number;
  writtenPauseSeconds: number;
  effectiveWpm: number;
  leadInSeconds?: number;
  fadeOutSeconds?: number;
  titleSpeechSeconds?: number;
  titleLeadPauseSeconds?: number;
  titleTrailPauseSeconds?: number;
  pauseScale?: number;
}): number {
  const scale = params.pauseScale ?? PAUSE_RENDER_SCALE;
  const scriptPart = predictScriptPartSeconds({
    writtenWords: params.writtenWords,
    writtenPauseSeconds: params.writtenPauseSeconds,
    effectiveWpm: params.effectiveWpm,
    pauseScale: scale,
  });
  const aroundTotal = aroundScriptSeconds({
    around: {
      leadInSeconds: params.leadInSeconds ?? LEAD,
      fadeOutSeconds: params.fadeOutSeconds ?? TAIL,
      titleLeadPauseSeconds: params.titleLeadPauseSeconds ?? 1,
      titleTrailPauseSeconds: params.titleTrailPauseSeconds ?? 3,
    },
    titleSpeechSeconds: params.titleSpeechSeconds ?? TITLE_INTRO_SPEECH_SECONDS,
    pauseScale: scale,
  });
  return predictTotalSessionSeconds({
    scriptPartSeconds: scriptPart,
    aroundTotalSeconds: aroundTotal,
  });
}

/**
 * One single-call script (factors optionally on). Used for calibration
 * (factors off) and comparison (factors on).
 */
export async function runSingleCallScriptCell(params: {
  modelId: string;
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  /** When set, multiply word/pause targets. Omit / identity for calibration. */
  correction?: ScriptTargetCorrection | null;
  medianWpm?: number;
}): Promise<CalibrationCellResult> {
  const model = coerceClaudeModel(params.modelId);
  const profiles = defaultDeliveryProfiles();
  const silenceShare = silenceShareFor(profiles, params.delivery);
  const medianWpm = params.medianWpm ?? CALIBRATION_MEDIAN_WPM;
  const around = sessionAroundFromProfiles(profiles);
  const stem =
    params.minutes * 60 -
    (around.leadInSeconds || LEAD) -
    (around.fadeOutSeconds || TAIL);
  const totals = sessionTotals({
    stemSeconds: stem,
    silenceShare,
    medianWpm,
    voiceWpm: medianWpm,
    pauseScale: PAUSE_RENDER_SCALE,
    commaBreakSeconds: 0.55,
    titleIntro: true,
    titlePauseSecondsWritten: titleIntroPauseSecondsWritten(around),
  });
  const f = params.correction
    ? factorsFor(params.correction, params.delivery, params.minutes)
    : { words: 1, pauses: 1, setAt: null, sampleCount: 0 };
  const promptWords = applyCorrectionToWords(totals.totalWords, f.words);
  const promptPauses = applyCorrectionToPauseSeconds(
    totals.totalPauseSeconds,
    f.pauses,
  );
  const apiKey = await getClaudeApiKey();
  const transcript = transcriptFromBrief(params.brief);
  const guide = await resolveStyleGuideAttachment({
    apiKey,
    transcript,
    meditationStyle: "",
    journalMode: false,
    usageSource: "admin",
  });
  const base = {
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
      const prompt = buildMeditationScriptGenerationPrompt({
        transcript,
        meditationStyle: "",
        journalMode: false,
        targetMinutes: params.minutes,
        speechSpeed: 1,
        includeSegmentPlaceholders: false,
        deliveryStyle: params.delivery,
        pacing: { wpm: medianWpm, speechShare: 1 - silenceShare },
        pauseRules: pauseRulesForPrompt(profiles, params.delivery),
        styleGuideContext: {
          silenceShare,
          longestPauseSeconds: profiles.casual.longestPause,
        },
        styleGuideStyle: guide.styleGuideStyle ?? undefined,
        lengthFit: {
          effectiveWpm: medianWpm,
          silenceSharePct: silenceShare * 100,
          words: promptWords,
          pauseSecondsWritten: promptPauses,
        },
      });
      const t0 = Date.now();
      const out = await claudeOnce({
        apiKey,
        model,
        systemStable: prompt.systemStable,
        meditationContext: prompt.meditationContext,
        meditationContextExtra: prompt.meditationContextExtra,
        taskContent: prompt.taskContent,
        reason: `single-call-calibration:${params.delivery}:${params.minutes}m:b${params.briefIndex}`,
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
      return {
        ...base,
        path: "single",
        sections,
        writtenWords,
        writtenPauseSeconds,
        scriptText: out.text,
        planMs: 0,
        writeMs: Date.now() - t0,
        usage: out.usage,
      };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    ...base,
    path: "single",
    sections: [],
    writtenWords: 0,
    writtenPauseSeconds: 0,
    scriptText: "",
    planMs: 0,
    writeMs: 0,
    error: msg.slice(0, 240),
  };
}

/** Sectioned script with factors on (for comparison). No salvage fix. */
export async function runSectionedScriptCell(params: {
  modelId: string;
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  correction: ScriptTargetCorrection;
  medianWpm?: number;
}): Promise<CalibrationCellResult> {
  const model = coerceClaudeModel(params.modelId);
  const profiles = defaultDeliveryProfiles();
  const silenceShare = silenceShareFor(profiles, params.delivery);
  const medianWpm = params.medianWpm ?? CALIBRATION_MEDIAN_WPM;
  const around = sessionAroundFromProfiles(profiles);
  const stem =
    params.minutes * 60 -
    (around.leadInSeconds || LEAD) -
    (around.fadeOutSeconds || TAIL);
  const totals = sessionTotals({
    stemSeconds: stem,
    silenceShare,
    medianWpm,
    voiceWpm: medianWpm,
    pauseScale: PAUSE_RENDER_SCALE,
    commaBreakSeconds: 0.55,
    titleIntro: true,
    titlePauseSecondsWritten: titleIntroPauseSecondsWritten(around),
  });
  const apiKey = await getClaudeApiKey();
  const transcript = transcriptFromBrief(params.brief);
  const guide = await resolveStyleGuideAttachment({
    apiKey,
    transcript,
    meditationStyle: "",
    journalMode: false,
    usageSource: "admin",
  });
  const base = {
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
  // Always-sections v2: sectioned path always plans (incl. short sessions).
  // const useSections = totals.totalWords >= profiles.shared.planMinWords;
  const useSections = true;
  void profiles.shared.planMinWords;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!useSections) {
        // Kept for reference — short-session single-call shortcut removed.
        return runSingleCallScriptCell({
          ...params,
          correction: params.correction,
        });
      }
      const shared = {
        transcript,
        meditationStyle: "",
        journalMode: false,
        targetMinutes: params.minutes,
        speechSpeed: 1,
        deliveryStyle: params.delivery,
        pacing: { wpm: medianWpm, speechShare: 1 - silenceShare },
        pauseRules: pauseRulesForSectionPrompt(params.delivery),
        styleGuideContext: {
          silenceShare,
          longestPauseSeconds: profiles.casual.longestPause,
        },
        styleGuideStyle: guide.styleGuideStyle ?? undefined,
        usageSource: "admin" as const,
        usageReasonPrefix: "script-compare",
        lengthFit: {
          effectiveWpm: medianWpm,
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
      const written = await writeScriptSections({
        apiKey,
        model,
        shared,
        plan: planned.plan,
        inOrder: false,
        correction: params.correction,
        delivery: params.delivery,
        minutes: params.minutes,
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
      };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    ...base,
    path: "sections",
    sections: [],
    writtenWords: 0,
    writtenPauseSeconds: 0,
    scriptText: "",
    planMs: 0,
    writeMs: 0,
    error: msg.slice(0, 240),
  };
}

export function singleCallWorkItems(briefs: string[]): Array<{
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
}> {
  const b = briefs.filter((x) => typeof x === "string" && x.trim());
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

export function factorsFromSingleCallCells(
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
      next[delivery][key] = computeLengthDeliveryFactors({
        targetWords: group.reduce((a, c) => a + c.targetWords, 0),
        writtenWords: group.reduce((a, c) => a + c.writtenWords, 0),
        plannedPauseSeconds: group.reduce(
          (a, c) => a + c.plannedPauseSeconds,
          0,
        ),
        writtenPauseSeconds: group.reduce(
          (a, c) => a + c.writtenPauseSeconds,
          0,
        ),
        sampleCount: group.length,
        setAt,
      });
    }
  }
  return next;
}

export type ComparisonPairResult = {
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  single: ComparisonScriptMetrics;
  sectioned: ComparisonScriptMetrics;
};

export type ComparisonScriptMetrics = {
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
  wordsPct: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  pausesPct: number;
  /** Predicted total session (script + parts around). */
  predictedLengthSeconds: number;
  requestedLengthSeconds: number;
  /** Predicted total vs requested. */
  lengthPct: number;
  /** Script-body target vs predicted script part (for tables). */
  scriptPartPct: number;
  /** e.g. "+3% (−2% to +8%)" across measured check voices. */
  predictedTotalLabel: string;
  within10Length: boolean;
  scriptText: string;
  error?: string;
};

export function metricsFromCell(
  cell: CalibrationCellResult,
  effectiveWpm: number,
  voiceWpms?: number[],
): ComparisonScriptMetrics {
  const profiles = defaultDeliveryProfiles();
  const around = sessionAroundFromProfiles(profiles);
  const requestedLengthSeconds = cell.minutes * 60;
  const predictFor = (wpm: number) =>
    predictRawLengthSeconds({
      writtenWords: cell.writtenWords,
      writtenPauseSeconds: cell.writtenPauseSeconds,
      effectiveWpm: wpm,
      leadInSeconds: around.leadInSeconds,
      fadeOutSeconds: around.fadeOutSeconds,
      titleLeadPauseSeconds: around.titleLeadPauseSeconds,
      titleTrailPauseSeconds: around.titleTrailPauseSeconds,
    });
  const predictedLengthSeconds = predictFor(effectiveWpm);
  const lengthPct = lengthPctVsRequested(
    predictedLengthSeconds,
    cell.minutes,
  );
  const scriptPart = predictScriptPartSeconds({
    writtenWords: cell.writtenWords,
    writtenPauseSeconds: cell.writtenPauseSeconds,
    effectiveWpm,
  });
  const aroundTotal = aroundScriptSeconds({
    around,
    titleSpeechSeconds: TITLE_INTRO_SPEECH_SECONDS,
    pauseScale: PAUSE_RENDER_SCALE,
  });
  const scriptTarget = Math.max(
    30,
    requestedLengthSeconds - aroundTotal,
  );
  const scriptPartPct = pct(scriptPart, scriptTarget);
  const voicePcts = (voiceWpms?.length ? voiceWpms : [effectiveWpm]).map((w) =>
    lengthPctVsRequested(predictFor(w), cell.minutes),
  );
  const lo = Math.min(...voicePcts);
  const hi = Math.max(...voicePcts);
  const fmt = (n: number) =>
    n > 0 ? `+${n}%` : n < 0 ? `−${Math.abs(n)}%` : "0%";
  const predictedTotalLabel =
    lo === hi ? fmt(lengthPct) : `${fmt(lengthPct)} (${fmt(lo)} to ${fmt(hi)})`;
  return {
    path: cell.path,
    targetWords: cell.targetWords,
    writtenWords: cell.writtenWords,
    wordsPct: pct(cell.writtenWords, cell.targetWords),
    plannedPauseSeconds: cell.plannedPauseSeconds,
    writtenPauseSeconds: cell.writtenPauseSeconds,
    pausesPct: pct(cell.writtenPauseSeconds, cell.plannedPauseSeconds),
    predictedLengthSeconds,
    requestedLengthSeconds,
    lengthPct,
    scriptPartPct,
    predictedTotalLabel,
    within10Length: Math.abs(lengthPct) <= 10,
    scriptText: cell.scriptText,
    error: cell.error,
  };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, n) => a + n, 0) / nums.length);
}

function range(nums: number[]): string {
  if (!nums.length) return "—";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const fmt = (n: number) => (n > 0 ? `+${n}%` : n < 0 ? `−${Math.abs(n)}%` : "0%");
  if (lo === hi) return fmt(lo);
  return `${fmt(lo)} to ${fmt(hi)}`;
}

function fmtSigned(n: number): string {
  if (n > 0) return `+${n}%`;
  if (n < 0) return `−${Math.abs(n)}%`;
  return "0%";
}

export type ComparisonTableRow = {
  delivery: DeliveryId;
  minutes: number;
  singleWordsAvg: string;
  singleWordsRange: string;
  sectionedWordsAvg: string;
  sectionedWordsRange: string;
  singlePausesAvg: string;
  sectionedPausesAvg: string;
  singlePredictedTotal: string;
  sectionedPredictedTotal: string;
  singleWithin10: number;
  sectionedWithin10: number;
  of: number;
};

export function buildComparisonTable(
  pairs: ComparisonPairResult[],
): {
  rows: ComparisonTableRow[];
  singleWithin10Share: number;
  sectionedWithin10Share: number;
  singleAvgAbsLength: number;
  sectionedAvgAbsLength: number;
} {
  const rows: ComparisonTableRow[] = [];
  let singleOk = 0;
  let sectionedOk = 0;
  let singleAbs: number[] = [];
  let sectionedAbs: number[] = [];
  let total = 0;
  for (const delivery of CALIBRATE_DELIVERIES) {
    for (const minutes of CALIBRATE_MINUTES) {
      const group = pairs.filter(
        (p) => p.delivery === delivery && p.minutes === minutes,
      );
      const sWords = group.map((p) => p.single.wordsPct);
      const cWords = group.map((p) => p.sectioned.wordsPct);
      const sPauses = group.map((p) => p.single.pausesPct);
      const cPauses = group.map((p) => p.sectioned.pausesPct);
      const sWithin = group.filter((p) => p.single.within10Length).length;
      const cWithin = group.filter((p) => p.sectioned.within10Length).length;
      singleOk += sWithin;
      sectionedOk += cWithin;
      total += group.length;
      for (const p of group) {
        singleAbs.push(Math.abs(p.single.lengthPct));
        sectionedAbs.push(Math.abs(p.sectioned.lengthPct));
      }
      const sPred = group.map((p) => p.single.lengthPct);
      const cPred = group.map((p) => p.sectioned.lengthPct);
      const sLabel =
        group[0]?.single.predictedTotalLabel ??
        `${fmtSigned(avg(sPred))} (${range(sPred)})`;
      const cLabel =
        group[0]?.sectioned.predictedTotalLabel ??
        `${fmtSigned(avg(cPred))} (${range(cPred)})`;
      rows.push({
        delivery,
        minutes,
        singleWordsAvg: fmtSigned(avg(sWords)),
        singleWordsRange: range(sWords),
        sectionedWordsAvg: fmtSigned(avg(cWords)),
        sectionedWordsRange: range(cWords),
        singlePausesAvg: fmtSigned(avg(sPauses)),
        sectionedPausesAvg: fmtSigned(avg(cPauses)),
        singlePredictedTotal: `${fmtSigned(avg(sPred))} (${range(sPred)})`,
        sectionedPredictedTotal: `${fmtSigned(avg(cPred))} (${range(cPred)})`,
        singleWithin10: sWithin,
        sectionedWithin10: cWithin,
        of: group.length || 1,
      });
      void sLabel;
      void cLabel;
    }
  }
  return {
    rows,
    singleWithin10Share: total ? Math.round((singleOk / total) * 100) : 0,
    sectionedWithin10Share: total ? Math.round((sectionedOk / total) * 100) : 0,
    singleAvgAbsLength: avg(singleAbs),
    sectionedAvgAbsLength: avg(sectionedAbs),
  };
}
