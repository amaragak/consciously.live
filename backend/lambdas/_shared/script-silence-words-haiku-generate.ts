/**
 * Silence-fit · words + Haiku: one Sonnet write with word headers (mid-band
 * budget), Haiku word-fix on missed phases (header word targets, scaled to
 * budget), then the same app-side silence fit as Silence-fit · words.
 */
import {
  claudeUsdFromUsage,
  parseAnthropicMessageModel,
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
} from "./script-silence-words-settings";
import { silenceAskSonnetPromptWordBudget } from "./script-silence-haiku-settings";
import {
  silenceWordsHaikuAskSonnetPct,
  type SilenceWordsHaikuModeSettings,
} from "./script-silence-words-haiku-settings";
import type { SilenceWordsAccuracy } from "./script-silence-words-generate";
import {
  applySilenceHaikuWordFix,
  type HaikuPhaseFixResult,
  type SilenceHaikuWordFixResult,
} from "./script-silence-haiku-word-fix";
import { summarizeOrdinaryPauseMarkers } from "./script-pause-bands";
import { summarizeExtendablePauses } from "./script-time-based-pauses";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type SilenceWordsHaikuAccuracy = SilenceWordsAccuracy & {
  haikuRan: boolean;
  wordsBeforeHaiku: number;
  wordsAfterHaiku: number;
  phasesFixed: number;
  phasesRejected: number;
  phaseResults: HaikuPhaseFixResult[];
  haikuUsd: number;
  scriptAsWritten: string;
  scriptAfterHaiku: string;
  /** (wordsBeforeHaiku − wordBudget) / wordBudget */
  wordsVsBudgetSonnetPct: number;
  /** Speech share from Sonnet words alone (before Haiku). */
  speechShareSonnet: number;
};

export type SilenceWordsHaikuGenerateResult = {
  script: string;
  scriptAsWritten: string;
  scriptAfterHaiku: string;
  scriptWithHeaders: string;
  phases: TimeBasedPhaseStat[];
  accuracy: SilenceWordsHaikuAccuracy;
  fit: SilenceFitResult;
  haiku: SilenceHaikuWordFixResult;
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
  const responseModel =
    parseAnthropicMessageModel(responseText) || params.model;
  let usage: TimeBasedCallUsage | null = null;
  if (rawUsage) {
    const usd = claudeUsdFromUsage(responseModel, rawUsage);
    usage = {
      label: params.label,
      model: responseModel,
      requestedModel: params.model,
      input_tokens: rawUsage.input_tokens,
      output_tokens: rawUsage.output_tokens,
      cache_creation_input_tokens: rawUsage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: rawUsage.cache_read_input_tokens ?? 0,
      usd: Math.round(usd * 1e6) / 1e6,
    };
    console.log(JSON.stringify({ tag: "script-gen-usage", ...usage }));
    void recordClaudeUsage({
      model: responseModel,
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

export async function generateSilenceWordsHaikuScript(params: {
  apiKey: string;
  model: string;
  haikuModelId: string;
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  option: SilenceFitOptionId;
  minutes: number;
  profiles: DeliveryProfiles;
  silenceWordsHaiku: SilenceWordsHaikuModeSettings;
  scriptTimeSeconds: number;
  effectiveWpm: number;
  lengthTolerancePct: number;
  journalMode?: boolean;
  source?: AiUsageSource;
}): Promise<SilenceWordsHaikuGenerateResult> {
  const sw = params.silenceWordsHaiku;
  const fitSettings = silenceWordsAsFitSettings(sw);
  const cell = silenceFitCellFor(fitSettings, params.option, params.minutes);
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
  // Prompt-only ask: Sonnet sees a bumped word total; Haiku/accuracy use real budget.
  const askSonnetPct = silenceWordsHaikuAskSonnetPct(
    sw,
    params.option,
    params.minutes,
  );
  const promptWordBudget = silenceAskSonnetPromptWordBudget(
    wordBudget,
    askSonnetPct,
  );
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
    totalWordBudget: promptWordBudget,
    minLongPauses,
    longestSingleSilenceSeconds: cell.longestSingleSilenceSeconds,
    journalMode: params.journalMode,
  });

  const usages: TimeBasedCallUsage[] = [];
  const first = await anthropicTextCall({
    apiKey: params.apiKey,
    model: params.model,
    label: "silence-words-haiku-write",
    reason: "script-silence-words-haiku-write",
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

  const scriptAsWritten = normalizeScriptWithHeaders(first.text);

  const haiku = await applySilenceHaikuWordFix({
    apiKey: params.apiKey,
    haikuModelId: params.haikuModelId,
    scriptWithHeaders: scriptAsWritten,
    wordBudget,
    scriptTriggerPct: sw.scriptTriggerPct,
    phaseTriggerPct: sw.phaseTriggerPct,
    phaseTargetSource: "header_words",
    // Full-script path: streamingPartial only when streamPhasesToTts mid-write.
    streamingPartial: false,
    source: params.source,
  });
  for (const u of haiku.usages) usages.push(u);

  const scriptAfterHaiku = haiku.scriptWithHeaders;

  const fit = fitSilenceFitScript({
    scriptWithHeaders: scriptAfterHaiku,
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
    shortPauseAdjustLimit: sw.shortPauseAdjustLimit,
    extraClosingMusicSeconds: sw.extraClosingMusicSeconds,
  });

  const phasesAfter = measureTimeBasedPhases({
    scriptWithHeaders: fit.scriptWithHeadersAfter,
    effectiveWpm: params.effectiveWpm,
  });
  const phasesBefore = measureTimeBasedPhases({
    scriptWithHeaders: scriptAsWritten,
    effectiveWpm: params.effectiveWpm,
  });
  const headerWordTotal = phasesBefore.reduce(
    (s, p) => s + (p.headerWords || 0),
    0,
  );
  const wordsWritten =
    fit.words > 0
      ? fit.words
      : countSpokenWords(fit.scriptAsWritten || fit.script);
  const wordsVsBudgetPct =
    wordBudget > 0
      ? Math.round(
          ((haiku.wordsAfterHaiku - wordBudget) / wordBudget) * 1000,
        ) / 10
      : 0;
  const wordsVsBudgetSonnetPct =
    wordBudget > 0
      ? Math.round(
          ((haiku.wordsBeforeHaiku - wordBudget) / wordBudget) * 1000,
        ) / 10
      : 0;
  // Same formula for Sonnet / after-Haiku so they match when Haiku did not run.
  // (Do not use fit.speechShare here — silence-fit recounts words differently.)
  const speechShareFromWords = (words: number) =>
    params.scriptTimeSeconds > 0
      ? Math.round(
          (((words / Math.max(1, params.effectiveWpm)) * 60) /
            params.scriptTimeSeconds) *
            10000,
        ) / 10000
      : 0;
  const speechShareSonnet = speechShareFromWords(haiku.wordsBeforeHaiku);
  const speechShareAfterHaiku = speechShareFromWords(haiku.wordsAfterHaiku);

  const insideSpeakingBand =
    speechShareAfterHaiku >= bands.speakingBandMin - 0.001 &&
    speechShareAfterHaiku <= bands.speakingBandMax + 0.001;

  const ordinaryAsWritten = summarizeOrdinaryPauseMarkers(scriptAsWritten);
  const extendableAsWritten = summarizeExtendablePauses(scriptAsWritten);

  const accuracy: SilenceWordsHaikuAccuracy = {
    targetSeconds: Math.round(params.scriptTimeSeconds),
    speakingBandMin: bands.speakingBandMin,
    speakingBandMax: bands.speakingBandMax,
    speechSeconds: fit.speechSeconds,
    // Speech · after Haiku column (equals Sonnet when Haiku did not run).
    speechShare: speechShareAfterHaiku,
    speechShareSonnet,
    words: wordsWritten,
    wordBudget,
    headerWordTotal,
    wordsWritten,
    wordsVsBudgetPct,
    wordsVsBudgetSonnetPct,
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
    phases: phasesAfter.length ? phasesAfter : phasesBefore,
    scriptWithHeadersBefore: fit.scriptWithHeadersBefore,
    scriptWithHeadersAfter: fit.scriptWithHeadersAfter,
    haikuRan: haiku.haikuRan,
    wordsBeforeHaiku: haiku.wordsBeforeHaiku,
    wordsAfterHaiku: haiku.wordsAfterHaiku,
    phasesFixed: haiku.phasesFixed,
    phasesRejected: haiku.phasesRejected,
    phaseResults: haiku.phaseResults,
    haikuUsd: haiku.haikuUsd,
    scriptAsWritten,
    scriptAfterHaiku,
  };

  console.log(
    JSON.stringify({
      tag: "script-silence-words-haiku",
      option: params.option,
      minutes: params.minutes,
      wordBudget,
      haikuRan: haiku.haikuRan,
      phasesFixed: haiku.phasesFixed,
      wordsVsBudgetPct,
      callCount: usages.length,
    }),
  );

  return {
    script: fit.script,
    scriptAsWritten,
    scriptAfterHaiku,
    scriptWithHeaders: fit.scriptWithHeadersAfter,
    phases: accuracy.phases,
    accuracy,
    fit,
    haiku,
    usages,
    option: params.option,
    wordBudget,
    minLongPauses,
  };
}
