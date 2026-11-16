/**
 * Silence-fit: exactly one Claude call, then app-side silence fitting.
 */
import {
  claudeUsdFromUsage,
  parseAnthropicMessageUsage,
} from "./anthropic-pricing";
import { buildScriptGenerationCachedBody } from "./anthropic-prompt-cache";
import { recordClaudeUsage, type AiUsageSource } from "./ai-usage";
import type { DeliveryProfiles } from "./delivery-profiles";
import {
  measureTimeBasedPhases,
  countSpokenSentences,
  type TimeBasedCallUsage,
  type TimeBasedPhaseStat,
} from "./script-time-based-generate";
import { buildSilenceFitScriptPrompt } from "./script-silence-fit-prompt";
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
  silenceFitSentenceBudget,
  silenceFitEstimatedTotalAudioSeconds,
  silenceFitShortestLongPause,
  silenceFitSpeakingShare,
  type SilenceFitModeSettings,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import { summarizeOrdinaryPauseMarkers } from "./script-pause-bands";
import { summarizeExtendablePauses } from "./script-time-based-pauses";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type SilenceFitAccuracy = {
  targetSeconds: number;
  speakingBandMin: number;
  speakingBandMax: number;
  speechSeconds: number;
  speechShare: number;
  words: number;
  wordsPerSentence: number;
  sentenceBudget: number;
  headerSentenceTotal: number;
  writtenSentenceTotal: number;
  /** Effective WPM used for speech_seconds (median Speechify × −20% in batch). */
  effectiveWpm: number;
  predictedSecondsBefore: number;
  predictedSecondsAfter: number;
  /** Script body after fit + ~10s pre + 20s post music. */
  estimatedTotalAudioSeconds: number;
  shortPauseSecondsBefore: number;
  shortPauseSecondsAfter: number;
  longPauseCount: number;
  longPauseSecondsBefore: number;
  longPauseSecondsAfter: number;
  longestLongPauseAfter: number;
  /** Ordinary `<N>` / legacy named pauses (as written, before fit). */
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

export type SilenceFitGenerateResult = {
  script: string;
  scriptAsWritten: string;
  scriptWithHeaders: string;
  phases: TimeBasedPhaseStat[];
  accuracy: SilenceFitAccuracy;
  fit: SilenceFitResult;
  usages: TimeBasedCallUsage[];
  option: SilenceFitOptionId;
  sentenceBudget: number;
  minLongPauses: number;
  wordsPerSentence: number;
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

export async function generateSilenceFitScript(params: {
  apiKey: string;
  model: string;
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  option: SilenceFitOptionId;
  minutes: number;
  profiles: DeliveryProfiles;
  silenceFit: SilenceFitModeSettings;
  scriptTimeSeconds: number;
  effectiveWpm: number;
  lengthTolerancePct: number;
  wordsPerSentence: number;
  journalMode?: boolean;
  source?: AiUsageSource;
}): Promise<SilenceFitGenerateResult> {
  const cell = silenceFitCellFor(
    params.silenceFit,
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
  const wps = Math.max(1, params.wordsPerSentence);
  const sentenceBudget = silenceFitSentenceBudget({
    scriptTimeSeconds: params.scriptTimeSeconds,
    speakingBandMin: speakingShare,
    effectiveWpm: params.effectiveWpm,
    wordsPerSentence: wps,
  });
  const minLongPauses = silenceFitMinLongPauses({
    scriptTimeSeconds: params.scriptTimeSeconds,
    speakingBandMin: speakingShare,
    longestSingleSilenceSeconds: cell.longestSingleSilenceSeconds,
  });

  const prompt = buildSilenceFitScriptPrompt({
    transcript: params.transcript,
    meditationStyle: params.meditationStyle,
    styleGuideStyle: params.styleGuideStyle,
    option: params.option,
    profiles: params.profiles,
    scriptTimeSeconds: params.scriptTimeSeconds,
    speakingShare,
    speakingBandMin: bands.speakingBandMin,
    speakingBandMax: bands.speakingBandMax,
    totalSentenceBudget: sentenceBudget,
    minLongPauses,
    longestSingleSilenceSeconds: cell.longestSingleSilenceSeconds,
    journalMode: params.journalMode,
  });

  const usages: TimeBasedCallUsage[] = [];
  const first = await anthropicTextCall({
    apiKey: params.apiKey,
    model: params.model,
    label: "silence-write",
    reason: "script-silence-write",
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
  const headerSentenceTotal = phases.reduce(
    (s, p) => s + (p.headerSentences || 0),
    0,
  );
  const writtenSentenceTotal = phases.reduce(
    (s, p) => s + (p.actualSentences || 0),
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
      params.silenceFit,
      params.option,
    ),
    longestSingleSilenceSeconds: cell.longestSingleSilenceSeconds,
    shortPauseAdjustLimit: params.silenceFit.shortPauseAdjustLimit,
    extraClosingMusicSeconds: params.silenceFit.extraClosingMusicSeconds,
  });

  const phasesAfter = measureTimeBasedPhases({
    scriptWithHeaders: fit.scriptWithHeadersAfter,
    effectiveWpm: params.effectiveWpm,
  });

  const insideSpeakingBand =
    fit.speechShare >= bands.speakingBandMin - 0.001 &&
    fit.speechShare <= bands.speakingBandMax + 0.001;

  const ordinaryAsWritten = summarizeOrdinaryPauseMarkers(
    fit.scriptWithHeadersBefore || scriptWithHeaders,
  );
  const extendableAsWritten = summarizeExtendablePauses(
    fit.scriptWithHeadersBefore || scriptWithHeaders,
  );
  const accuracy: SilenceFitAccuracy = {
    targetSeconds: Math.round(params.scriptTimeSeconds),
    speakingBandMin: bands.speakingBandMin,
    speakingBandMax: bands.speakingBandMax,
    speechSeconds: fit.speechSeconds,
    speechShare: fit.speechShare,
    words: fit.words,
    wordsPerSentence: wps,
    sentenceBudget,
    headerSentenceTotal,
    writtenSentenceTotal:
      writtenSentenceTotal || countSpokenSentences(fit.scriptAsWritten),
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
      tag: "script-silence-fit",
      option: params.option,
      minutes: params.minutes,
      accuracy,
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
    sentenceBudget,
    minLongPauses,
    wordsPerSentence: wps,
  };
}
