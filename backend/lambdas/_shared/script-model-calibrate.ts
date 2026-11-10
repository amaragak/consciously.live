/**
 * Admin › Delivery profiles · Run check cell.
 * Generates a script with length×delivery factors ON (no TTS audio);
 * predicts length via pause scale. Used after calibration.
 */
import { getClaudeApiKey } from "./anthropic-messages";
import { coerceClaudeModel, withClaudeThinkingOff } from "./anthropic-pricing";
import {
  defaultDeliveryProfiles,
  pauseRulesForPrompt,
  pauseRulesForSectionPrompt,
  silenceShareFor,
  type DeliveryId,
} from "./delivery-profiles";
import {
  countSpokenWords,
  fitLongPauseScaleWithPlan,
  fixedLeadSegments,
  lengthWithin,
  PRE_AUDIO_SCALE_MAX,
  PRE_AUDIO_SCALE_MIN,
  predictStemLength,
} from "./meditation-length-fit";
import { buildMeditationScriptGenerationPrompt } from "./meditation-script-generate-prompt";
import {
  applyCorrectionToPauseSeconds,
  applyCorrectionToWords,
  factorsFor,
} from "./script-target-correction";
import {
  correctionForModel,
  type ScriptGenerationSettings,
} from "./script-generation-settings";
import {
  fixFurthestSections,
  furthestSectionFixes,
  joinSectionTexts,
  measurePlannedSections,
  planScriptSections,
  sessionTotals,
  writeScriptSections,
} from "./script-section-generate";
import {
  sumPauseMarkerSeconds,
  withSpokenMeditationTitleIntro,
} from "./script-pause-bands";
import { CHECK_VOICES } from "./script-calibration-batch";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const CHECK_TRANSCRIPT =
  "User: I have a job interview on Thursday at a design studio in Leeds and I keep replaying the last one that went badly. I want to feel steady and remember I'm good at this.\nGuide: That makes sense. Would you like something calming before the day?\nUser: Yes, something to ground me, maybe some breathing.";

/** Same three voices used in length test batches (effective WPM at −20%). */
export const CALIBRATE_VOICES = CHECK_VOICES;

export const CALIBRATE_MINUTES = [5, 10, 20] as const;
export const CALIBRATE_DELIVERIES: DeliveryId[] = [
  "casual",
  "guided",
  "open_sits",
];

const MEDIAN_WPM = 138.7 * 0.8;
const LEAD = 20;
const TAIL = 20;

export type CalibrateCellResult = {
  delivery: DeliveryId;
  minutes: number;
  voice: string;
  path: "single" | "sections";
  sections: number;
  targetWords: number;
  firstWords: number;
  firstWordsPct: number;
  finalWords: number;
  finalWordsPct: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  pausesPct: number;
  fixed: string[];
  pauseScalePct: number;
  finalLengthPct: number;
  planMs: number;
  writeMs: number;
  fixMs: number;
};

async function claudeOnce(params: {
  apiKey: string;
  model: string;
  system: string;
  userContent: string;
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
          max_tokens: 8192,
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
  throw new Error("Claude empty during check cell");
}

function pct(a: number, b: number): number {
  if (!(b > 0)) return 0;
  return Math.round((a / b - 1) * 100);
}

/** Run check: factors ON, length prediction, optional salvage fix. */
export async function calibrateScriptModelCell(params: {
  settings: ScriptGenerationSettings;
  modelId: string;
  delivery: DeliveryId;
  minutes: number;
  voiceName: string;
  voiceWpm: number;
}): Promise<{
  result: CalibrateCellResult;
  settings: ScriptGenerationSettings;
}> {
  const model = coerceClaudeModel(params.modelId);
  const profiles = defaultDeliveryProfiles();
  const seeded = correctionForModel(
    params.settings,
    model,
    params.settings.scriptModelId,
  );
  const settings = seeded.settings;
  const correction = seeded.correction;
  const cellF = factorsFor(correction, params.delivery, params.minutes);
  const silenceShare = silenceShareFor(profiles, params.delivery);
  const stem = params.minutes * 60 - LEAD - TAIL;
  const totals = sessionTotals({
    stemSeconds: stem,
    silenceShare,
    medianWpm: MEDIAN_WPM,
    voiceWpm: params.voiceWpm,
    pauseScale: 1.12,
    commaBreakSeconds: 0.55,
    titleIntro: true,
  });
  const useSections = totals.totalWords >= profiles.shared.planMinWords;
  const apiKey = await getClaudeApiKey();
  let script = "";
  let firstWords = 0;
  let finalWords = 0;
  let writtenPauseSeconds = 0;
  let sectionCount = 1;
  let planMs = 0;
  let writeMs = 0;
  let fixMs = 0;
  let fixed: string[] = [];
  let plannedPauseForScale = totals.totalPauseSeconds;

  if (!useSections) {
    const prompt = buildMeditationScriptGenerationPrompt({
      transcript: CHECK_TRANSCRIPT,
      meditationStyle: "Breathing",
      journalMode: false,
      targetMinutes: params.minutes,
      speechSpeed: 1,
      includeSegmentPlaceholders: false,
      deliveryStyle: params.delivery,
      pacing: { wpm: params.voiceWpm, speechShare: 1 - silenceShare },
      pauseRules: pauseRulesForPrompt(profiles, params.delivery),
      lengthFit: {
        effectiveWpm: params.voiceWpm,
        silenceSharePct: silenceShare * 100,
        words: applyCorrectionToWords(totals.totalWords, cellF.words),
        pauseSecondsWritten: applyCorrectionToPauseSeconds(
          totals.totalPauseSeconds,
          cellF.pauses,
        ),
      },
    });
    const t0 = Date.now();
    const out = await claudeOnce({
      apiKey,
      model,
      system: prompt.system,
      userContent: prompt.userContent,
    });
    writeMs = Date.now() - t0;
    script = out.text;
    firstWords = countSpokenWords(script);
    finalWords = firstWords;
    writtenPauseSeconds = Math.round(sumPauseMarkerSeconds(script));
  } else {
    const shared = {
      transcript: CHECK_TRANSCRIPT,
      meditationStyle: "Breathing",
      journalMode: false,
      targetMinutes: params.minutes,
      speechSpeed: 1,
      deliveryStyle: params.delivery,
      pacing: { wpm: params.voiceWpm, speechShare: 1 - silenceShare },
      pauseRules: pauseRulesForSectionPrompt(params.delivery),
      lengthFit: {
        effectiveWpm: params.voiceWpm,
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
    planMs = planned.ms;
    sectionCount = planned.plan.sections.length;
    plannedPauseForScale = planned.plan.totalPauseSeconds;
    const written = await writeScriptSections({
      apiKey,
      model,
      shared,
      plan: planned.plan,
      inOrder: false,
      correction,
      delivery: params.delivery,
      minutes: params.minutes,
    });
    writeMs = written.ms;
    const first = measurePlannedSections(written.sections, planned.plan);
    firstWords = first.reduce((a, m) => a + m.words, 0);
    writtenPauseSeconds = first.reduce((a, m) => a + m.pauseSeconds, 0);
    let sections = written.sections;
    script = joinSectionTexts(sections);
    const tts0 = withSpokenMeditationTitleIntro(script, "Steady");
    const pred0 = predictStemLength({
      ttsScript: tts0,
      effectiveWpm: params.voiceWpm,
      pauseScale: 1.12,
      fixedSegments: fixedLeadSegments(tts0, script),
      commaBreakSeconds: 0.55,
    });
    const salvage = fitLongPauseScaleWithPlan({
      speechSeconds: pred0.speechSeconds,
      fixedPauseSeconds: pred0.fixedPauseSeconds,
      longPauseSeconds: pred0.longPauseSeconds,
      plannedLongPauseSeconds: planned.plan.totalPauseSeconds * 1.12,
      targetSeconds: stem,
      bandMin: PRE_AUDIO_SCALE_MIN,
      bandMax: PRE_AUDIO_SCALE_MAX,
    });
    const at =
      pred0.speechSeconds +
      pred0.fixedPauseSeconds +
      pred0.longPauseSeconds * salvage.scale;
    if (!lengthWithin(at, stem, 10)) {
      const fixes = furthestSectionFixes(first, {
        totalTargetWords: planned.plan.totalWords,
        force: true,
      });
      if (fixes.length) {
        const t1 = Date.now();
        const fixedRes = await fixFurthestSections({
          apiKey,
          model,
          sections,
          fixes,
        });
        fixMs = Date.now() - t1;
        sections = fixedRes.sections;
        fixed = fixes.map((f) => f.id);
        script = joinSectionTexts(sections);
        const after = measurePlannedSections(sections, planned.plan);
        writtenPauseSeconds = after.reduce((a, m) => a + m.pauseSeconds, 0);
      }
    }
    finalWords = countSpokenWords(script);
  }

  const tts = withSpokenMeditationTitleIntro(script, "Steady");
  const pred = predictStemLength({
    ttsScript: tts,
    effectiveWpm: params.voiceWpm,
    pauseScale: 1.12,
    fixedSegments: fixedLeadSegments(tts, script),
    commaBreakSeconds: 0.55,
  });
  const fitted = fitLongPauseScaleWithPlan({
    speechSeconds: pred.speechSeconds,
    fixedPauseSeconds: pred.fixedPauseSeconds,
    longPauseSeconds: pred.longPauseSeconds,
    plannedLongPauseSeconds: plannedPauseForScale * 1.12,
    targetSeconds: stem,
  });
  const fin =
    pred.speechSeconds +
    pred.fixedPauseSeconds +
    pred.longPauseSeconds * fitted.scale +
    LEAD +
    TAIL;

  return {
    settings,
    result: {
      delivery: params.delivery,
      minutes: params.minutes,
      voice: params.voiceName,
      path: useSections ? "sections" : "single",
      sections: sectionCount,
      targetWords: totals.totalWords,
      firstWords,
      firstWordsPct: pct(firstWords, totals.totalWords),
      finalWords,
      finalWordsPct: pct(finalWords, totals.totalWords),
      plannedPauseSeconds: totals.totalPauseSeconds,
      writtenPauseSeconds,
      pausesPct: pct(writtenPauseSeconds, totals.totalPauseSeconds),
      fixed,
      pauseScalePct: Math.round(fitted.scale * 100),
      finalLengthPct: pct(fin, params.minutes * 60),
      planMs,
      writeMs,
      fixMs,
    },
  };
}
