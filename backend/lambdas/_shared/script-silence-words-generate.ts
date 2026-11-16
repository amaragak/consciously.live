/**
 * Silence-fit · words: one Claude call with word budgets/headers, then the
 * same app-side silence fitting as Silence-fit.
 */
import {
  claudeUsdFromUsage,
  parseAnthropicMessageUsage,
} from "./anthropic-pricing";
import { buildScriptGenerationCachedBody } from "./anthropic-prompt-cache";
import { recordClaudeUsage, type AiUsageSource } from "./ai-usage";
import type { DeliveryProfiles } from "./delivery-profiles";
import { countSpokenWords } from "./meditation-length-fit";
import {
  measureTimeBasedPhases,
  type TimeBasedCallUsage,
  type TimeBasedPhaseStat,
} from "./script-time-based-generate";
import { buildSilenceWordsScriptPrompt } from "./script-silence-words-prompt";
import {
  fitSilenceFitScript,
  type SilenceFitResult,
  type SilenceFitStep,
  type SilenceFitWhy,
} from "./script-silence-fit-fit";
import {
  silenceFitAutoSpeakingBands,
  silenceFitCellFor,
  silenceFitMinLongPauses,
  silenceFitEstimatedTotalAudioSeconds,
  silenceFitShortestLongPause,
  silenceFitSpeakingShare,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import {
  silenceWordsAsFitSettings,
  silenceWordsWordBudget,
  type SilenceWordsModeSettings,
} from "./script-silence-words-settings";
import { summarizeOrdinaryPauseMarkers } from "./script-pause-bands";
import { summarizeExtendablePauses } from "./script-time-based-pauses";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type SilenceWordsAccuracy = {
  targetSeconds: number;
  speakingBandMin: number;
  speakingBandMax: number;
  speechSeconds: number;
  speechShare: number;
  words: number;
  wordBudget: number;
  headerWordTotal: number;
  wordsWritten: number;
  /** (wordsWritten − wordBudget) / wordBudget × 100 */
  wordsVsBudgetPct: number;
  // Was (Silence-fit): wordsPerSentence / sentenceBudget / headerSentenceTotal / writtenSentenceTotal
  // wordsPerSentence: number;
  // sentenceBudget: number;
  // headerSentenceTotal: number;
  // writtenSentenceTotal: number;
  effectiveWpm: number;
  predictedSecondsBefore: number;
  predictedSecondsAfter: number;
  estimatedTotalAudioSeconds: number;
  shortPauseSecondsBefore: number;
  shortPauseSecondsAfter: number;
  longPauseCount: number;
  longPauseSecondsBefore: number;
  longPauseSecondsAfter: number;
  longestLongPauseAfter: number;
  ordinaryPauseCount: number;
  ordinaryPauseAverageSeconds: number | null;
  ordinaryPauseLongestSeconds: number;
  extendablePauseCount: number;
  extendablePauseTotalSeconds: number;
  namedMarkersUsed: number;
  extraClosingMusicSeconds: number;
  fitStep: SilenceFitStep;
  outsideTolerance: boolean;
  why: SilenceFitWhy;
  insideSpeakingBand: boolean;
  lengthTolerancePct: number;
  phases: TimeBasedPhaseStat[];
  scriptWithHeadersBefore: string;
  scriptWithHeadersAfter: string;
};

export type SilenceWordsGenerateResult = {
  script: string;
  scriptAsWritten: string;
  scriptWithHeaders: string;
  phases: TimeBasedPhaseStat[];
  accuracy: SilenceWordsAccuracy;
  fit: SilenceFitResult;
  usages: TimeBasedCallUsage[];
  option: SilenceFitOptionId;
  wordBudget: number;
  minLongPauses: number;
};

async function anthropicTextCall(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  label: string;
  source?: AiUsageSource;
  reason: string;
}): Promise<{ text: string; usage: TimeBasedCallUsage | null }> {
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(params.body),
  });
  const responseText = await upstream.text();
  if (!upstream.ok) {
    throw new Error(
      `Anthropic ${params.label} failed: ${responseText.slice(0, 2000)}`,
    );
  }
  let parsed: { content?: Array<{ type?: string; text?: string }> };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid Anthropic response (${params.label})`);
  }
  const text =
    parsed.content?.find((c) => c?.type === "text")?.text?.trim() ?? "";
  if (!text) throw new Error(`Empty Anthropic response (${params.label})`);

  const rawUsage = parseAnthropicMessageUsage(responseText);
  let usage: TimeBasedCallUsage | null = null;
  if (rawUsage) {
    const usd = claudeUsdFromUsage(params.model, rawUsage);
    usage = {
      label: params.label,
      model: params.model,
      input_tokens: rawUsage.input_tokens,
      output_tokens: rawUsage.output_tokens,
      cache_creation_input_tokens: rawUsage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: rawUsage.cache_read_input_tokens ?? 0,
      usd: Math.round(usd * 1e6) / 1e6,
    };
    console.log(JSON.stringify({ tag: "script-gen-usage", ...usage }));
    void recordClaudeUsage({
      model: params.model,
      feature: "meditation-script",
      source: params.source ?? "user",
      reason: params.reason,
      usage: rawUsage,
    });
  }
  return { text, usage };
}

function normalizeScriptWithHeaders(raw: string): string {
  return (raw ?? "").replace(/^\uFEFF/, "").trim();
}

export async function generateSilenceWordsScript(params: {
  apiKey: string;
  model: string;
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  option: SilenceFitOptionId;
  minutes: number;
  profiles: DeliveryProfiles;
  silenceWords: SilenceWordsModeSettings;
  scriptTimeSeconds: number;
  effectiveWpm: number;
  lengthTolerancePct: number;
  journalMode?: boolean;
  source?: AiUsageSource;
}): Promise<SilenceWordsGenerateResult> {
  const fitSettings = silenceWordsAsFitSettings(params.silenceWords);
  const cell = silenceFitCellFor(
    fitSettings,
    params.option,
    params.minutes,
  );
  // Was: bottom of band / middle of band from stored speakingBandMin/Max.
  // const speakingShareForBudget = cell.speakingBandMin;
  // const speakingShareForBudget =
  //   (cell.speakingBandMin + cell.speakingBandMax) / 2;
  const speakingShare = silenceFitSpeakingShare(
    params.profiles,
    params.option,
  );
  const bands = silenceFitAutoSpeakingBands(speakingShare);
  const wordBudget = silenceWordsWordBudget({
    scriptTimeSeconds: params.scriptTimeSeconds,
    speakingBandMin: speakingShare,
    effectiveWpm: params.effectiveWpm,
  });
  const minLongPauses = silenceFitMinLongPauses({
    scriptTimeSeconds: params.scriptTimeSeconds,
    speakingBandMin: speakingShare,
    longestSingleSilenceSeconds: cell.longestSingleSilenceSeconds,
  });

  const prompt = buildSilenceWordsScriptPrompt({
    transcript: params.transcript,
    meditationStyle: params.meditationStyle,
    styleGuideStyle: params.styleGuideStyle,
    option: params.option,
    profiles: params.profiles,
    scriptTimeSeconds: params.scriptTimeSeconds,
    speakingShare,
    speakingBandMin: bands.speakingBandMin,
    speakingBandMax: bands.speakingBandMax,
    totalWordBudget: wordBudget,
    minLongPauses,
    longestSingleSilenceSeconds: cell.longestSingleSilenceSeconds,
    journalMode: params.journalMode,
  });

  const usages: TimeBasedCallUsage[] = [];
  const first = await anthropicTextCall({
    apiKey: params.apiKey,
    model: params.model,
    label: "silence-words-write",
    reason: "script-silence-words-write",
    source: params.source,
    body: buildScriptGenerationCachedBody({
      model: params.model,
      maxTokens: prompt.maxTokens,
      systemStable: prompt.systemStable,
      meditationContext: prompt.meditationContext,
      taskContent: prompt.taskContent,
      noCache: true,
      effort: "medium",
    }),
  });
  if (first.usage) usages.push(first.usage);

  const scriptWithHeaders = normalizeScriptWithHeaders(first.text);
  const phases = measureTimeBasedPhases({
    scriptWithHeaders,
    effectiveWpm: params.effectiveWpm,
  });
  const headerWordTotal = phases.reduce(
    (s, p) => s + (p.headerWords || 0),
    0,
  );

  const fit = fitSilenceFitScript({
    scriptWithHeaders,
    effectiveWpm: params.effectiveWpm,
    targetSeconds: params.scriptTimeSeconds,
    lengthTolerancePct: params.lengthTolerancePct,
    speakingBandMin: bands.speakingBandMin,
    speakingBandMax: bands.speakingBandMax,
    shortestLongPauseSeconds: silenceFitShortestLongPause(
      fitSettings,
      params.option,
    ),
    longestSingleSilenceSeconds: cell.longestSingleSilenceSeconds,
    shortPauseAdjustLimit: params.silenceWords.shortPauseAdjustLimit,
    extraClosingMusicSeconds: params.silenceWords.extraClosingMusicSeconds,
  });

  const phasesAfter = measureTimeBasedPhases({
    scriptWithHeaders: fit.scriptWithHeadersAfter,
    effectiveWpm: params.effectiveWpm,
  });
  const wordsWritten =
    fit.words > 0
      ? fit.words
      : countSpokenWords(fit.scriptAsWritten || fit.script);
  const wordsVsBudgetPct =
    wordBudget > 0
      ? Math.round(((wordsWritten - wordBudget) / wordBudget) * 1000) / 10
      : 0;

  const insideSpeakingBand =
    fit.speechShare >= bands.speakingBandMin - 0.001 &&
    fit.speechShare <= bands.speakingBandMax + 0.001;

  const ordinaryAsWritten = summarizeOrdinaryPauseMarkers(scriptWithHeaders);
  const extendableAsWritten = summarizeExtendablePauses(scriptWithHeaders);

  const accuracy: SilenceWordsAccuracy = {
    targetSeconds: Math.round(params.scriptTimeSeconds),
    speakingBandMin: bands.speakingBandMin,
    speakingBandMax: bands.speakingBandMax,
    speechSeconds: fit.speechSeconds,
    speechShare: fit.speechShare,
    words: wordsWritten,
    wordBudget,
    headerWordTotal,
    wordsWritten,
    wordsVsBudgetPct,
    effectiveWpm: Math.round(params.effectiveWpm * 10) / 10,
    predictedSecondsBefore: fit.predictedSecondsBefore,
    predictedSecondsAfter: fit.predictedSecondsAfter,
    estimatedTotalAudioSeconds: Math.round(
      silenceFitEstimatedTotalAudioSeconds(fit.predictedSecondsAfter),
    ),
    shortPauseSecondsBefore: fit.shortPauseSecondsBefore,
    shortPauseSecondsAfter: fit.shortPauseSecondsAfter,
    longPauseCount: fit.longPauseCount,
    longPauseSecondsBefore: fit.longPauseSecondsBefore,
    longPauseSecondsAfter: fit.longPauseSecondsAfter,
    longestLongPauseAfter: fit.longestLongPauseAfter,
    ordinaryPauseCount: ordinaryAsWritten.count,
    ordinaryPauseAverageSeconds: ordinaryAsWritten.averageSeconds,
    ordinaryPauseLongestSeconds: ordinaryAsWritten.longestSeconds,
    extendablePauseCount: extendableAsWritten.count,
    extendablePauseTotalSeconds:
      Math.round(extendableAsWritten.totalSeconds * 10) / 10,
    namedMarkersUsed: ordinaryAsWritten.namedMarkersUsed,
    extraClosingMusicSeconds: fit.extraClosingMusicSeconds,
    fitStep: fit.fitStep,
    outsideTolerance: fit.outsideTolerance,
    why: fit.why,
    insideSpeakingBand,
    lengthTolerancePct: params.lengthTolerancePct,
    phases: phasesAfter.length ? phasesAfter : phases,
    scriptWithHeadersBefore: fit.scriptWithHeadersBefore,
    scriptWithHeadersAfter: fit.scriptWithHeadersAfter,
  };

  console.log(
    JSON.stringify({
      tag: "script-silence-words",
      option: params.option,
      minutes: params.minutes,
      wordBudget,
      wordsWritten,
      wordsVsBudgetPct,
      callCount: usages.length,
    }),
  );

  return {
    script: fit.script,
    scriptAsWritten: fit.scriptAsWritten,
    scriptWithHeaders: fit.scriptWithHeadersAfter,
    phases: accuracy.phases,
    accuracy,
    fit,
    usages,
    option: params.option,
    wordBudget,
    minLongPauses,
  };
}
