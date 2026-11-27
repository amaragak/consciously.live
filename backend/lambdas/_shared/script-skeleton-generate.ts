/**
 * Create: mirror a real meditation of the chosen style.
 *   1. Load live pre-prompts, style guide and harvester datasets (latest versions).
 *   2. Pick + scale a skeleton (script-skeleton-plan.ts).
 *   3. One Sonnet call writes new words per passage, with the style's compact
 *      delivery fingerprint (streamed so phases can go to TTS as they close; no
 *      Haiku or other fix-up pass). A code-only conformance score is recorded.
 *   4. Silence fit: resize the extendable pauses to the script time, keeping the
 *      skeleton's proportions and giving most of the change to self-practice
 *      silences.
 */
import type { AiUsageSource } from "./ai-usage";
import { countSpokenWords } from "./meditation-length-fit";
import { normalizeMeditationType } from "./meditation-types";
import {
  harvesterSlugForMeditationType,
  meditationTypeForHarvesterKey,
  PREPROMPT_ID,
  DATASET_ID,
  styleGuideEntryIdForType,
} from "./preprompts/preprompt-registry";
import { loadLivePrepromptTexts } from "./preprompts/preprompt-store";
import { loadLiveHarvesterDatasets } from "./preprompts/harvester-datasets";
import { fitSilenceFitScript, type SilenceFitResult } from "./script-silence-fit-fit";
import {
  splitTimeBasedPhases,
  stripPhaseHeaders,
  type TimeBasedCallUsage,
} from "./script-time-based-generate";
import { summarizeExtendablePauses } from "./script-time-based-pauses";
import {
  streamSilenceWordsSonnetWithProgressiveHaiku,
  type SilenceWordsHaikuPhaseReady,
  type SilenceWordsHaikuStreamTiming,
} from "./script-silence-words-haiku-stream";
import {
  planSkeletonForCreate,
  SKELETON_EXTENDABLE_MIN_SECONDS,
  SKELETON_SELF_PRACTICE_SECONDS,
  type SkeletonPlan,
} from "./script-skeleton-plan";
import { buildSkeletonScriptPrompt } from "./script-skeleton-prompt";
import { formatFingerprintForPrompt } from "./script-fingerprint-prompt";
import {
  scoreScriptConformance,
  type ConformanceRecord,
} from "./script-conformance";

export const DEFAULT_SKELETON_STYLE = "Open awareness";

/** Recorded on the library item (createOpenSitsVerification.skeleton). */
export type SkeletonRecord = {
  style: string;
  meditationType: string;
  sourceKind: SkeletonPlan["source"]["kind"];
  sourceId: string | null;
  sourceTitle?: string;
  sourceFit?: string;
  sourceRuntimeS?: number;
  scale: number;
  passages: number;
  blocks: number;
  merged: number;
  split: number;
  plannedSpeechShare: number;
  sourceSpeechShare: number;
  profileSpeechShare: number | null;
  openingShare: number;
  closingShare: number;
  plannedExtendablePauses: number;
  writtenExtendablePauses: number;
  candidates: SkeletonPlan["candidates"];
};

export type SkeletonGenerateResult = {
  script: string;
  scriptAsWritten: string;
  scriptWithHeaders: string;
  fit: SilenceFitResult;
  plan: SkeletonPlan;
  skeleton: SkeletonRecord;
  usages: TimeBasedCallUsage[];
  /** Target words = sum of passage word targets. */
  wordBudget: number;
  wordsWritten: number;
  prepromptVersions: Record<string, number>;
  /** Dataset version used (0 = not imported; fallback profile). */
  datasetVersions: Record<string, number>;
  /** Code-only score against the style's fingerprint and skeleton (not acted on). */
  conformance: ConformanceRecord;
  timing: SilenceWordsHaikuStreamTiming;
};

export async function generateSkeletonScript(params: {
  apiKey: string;
  model: string;
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  journalMode?: boolean;
  targetMinutes: number;
  scriptTimeSeconds: number;
  effectiveWpm: number;
  lengthTolerancePct: number;
  shortPauseAdjustLimit: number;
  source?: AiUsageSource;
  onPhaseReady?: (phase: SilenceWordsHaikuPhaseReady) => void | Promise<void>;
  rng?: () => number;
}): Promise<SkeletonGenerateResult> {
  // Skeleton style: the creator's style, else Open awareness.
  const chosenType = params.journalMode
    ? null
    : normalizeMeditationType((params.meditationStyle ?? "").trim());
  const skeletonType = chosenType ?? DEFAULT_SKELETON_STYLE;
  const slug =
    harvesterSlugForMeditationType(skeletonType) ??
    harvesterSlugForMeditationType(DEFAULT_SKELETON_STYLE)!;

  const guideStyle = (
    params.styleGuideStyle?.trim() ||
    (params.meditationStyle ?? "").trim() ||
    ""
  ).trim();
  const guideEntryId =
    !params.journalMode && guideStyle
      ? styleGuideEntryIdForType(normalizeMeditationType(guideStyle))
      : null;
  const liveIds = [
    PREPROMPT_ID.systemPrefix,
    PREPROMPT_ID.personalization,
    PREPROMPT_ID.gender,
    PREPROMPT_ID.pauseRules,
    PREPROMPT_ID.skeletonTask,
    ...(guideEntryId ? [guideEntryId] : []),
  ];
  const [live, datasets] = await Promise.all([
    loadLivePrepromptTexts(liveIds),
    loadLiveHarvesterDatasets(),
  ]);
  const prepromptVersions: Record<string, number> = {};
  for (const id of liveIds) prepromptVersions[id] = live[id]?.version ?? 0;
  const datasetVersions: Record<string, number> = {
    [DATASET_ID.skeletonLibrary]: datasets.skeletons?.version ?? 0,
    [DATASET_ID.pacingProfiles]: datasets.pacing?.version ?? 0,
    [DATASET_ID.deliveryFingerprints]: datasets.fingerprints?.version ?? 0,
  };

  const profile = datasets.pacing?.data[slug] ?? null;
  // Same style as the skeleton; none in journal mode (no style guide there either).
  const fingerprint = params.journalMode
    ? null
    : (datasets.fingerprints?.data[slug] ?? null);
  const plan = planSkeletonForCreate({
    style: slug,
    skeletons: datasets.skeletons?.data[slug] ?? null,
    profile,
    targetSessionSeconds: params.targetMinutes * 60,
    scriptTimeSeconds: params.scriptTimeSeconds,
    wpm: params.effectiveWpm,
    rng: params.rng,
  });

  const prompt = buildSkeletonScriptPrompt({
    transcript: params.transcript,
    meditationStyle: params.meditationStyle,
    styleGuideStyle: params.styleGuideStyle,
    skeletonMeditationType: meditationTypeForHarvesterKey(slug) ?? skeletonType,
    plan,
    journalMode: params.journalMode,
    preprompts: {
      systemPrefix: live[PREPROMPT_ID.systemPrefix]?.text,
      personalization: live[PREPROMPT_ID.personalization]?.text,
      gender: live[PREPROMPT_ID.gender]?.text,
      pauseRules: live[PREPROMPT_ID.pauseRules]?.text,
      skeletonTask: live[PREPROMPT_ID.skeletonTask]?.text,
    },
    styleGuideMarkdown: guideEntryId ? live[guideEntryId]?.text : null,
    fingerprintBlock: formatFingerprintForPrompt(
      fingerprint,
      meditationTypeForHarvesterKey(slug) ?? skeletonType,
    ),
  });

  console.log(
    JSON.stringify({
      tag: "create-skeleton-plan",
      style: slug,
      source: plan.source,
      scale: plan.scale,
      passages: plan.passages.length,
      blocks: plan.blocks.length,
      totalWords: plan.totalWords,
      speechShare: plan.speechShare,
      merged: plan.merged,
      split: plan.split,
      datasetVersions,
    }),
  );

  // One Sonnet call, streamed; skipHaiku = no fix-up pass.
  const streamed = await streamSilenceWordsSonnetWithProgressiveHaiku({
    apiKey: params.apiKey,
    model: params.model,
    haikuModelId: "",
    systemStable: prompt.systemStable,
    meditationContext: prompt.meditationContext,
    taskContent: prompt.taskContent,
    maxTokens: prompt.maxTokens,
    wordBudget: plan.totalWords,
    scriptTriggerPct: 1,
    phaseTriggerPct: 1,
    skipHaiku: true,
    source: params.source,
    onPhaseReady: params.onPhaseReady,
  });
  const scriptAsWritten = streamed.scriptAsWritten.replace(/^\uFEFF/, "").trim();

  const maxPlannedPause = Math.max(
    0,
    ...plan.passages.map((p) => p.pauseAfter),
  );
  const fit = fitSilenceFitScript({
    scriptWithHeaders: scriptAsWritten,
    effectiveWpm: params.effectiveWpm,
    targetSeconds: params.scriptTimeSeconds,
    lengthTolerancePct: params.lengthTolerancePct,
    speakingBandMin: Math.max(0, plan.speechShare - 0.1),
    speakingBandMax: Math.min(1, plan.speechShare + 0.1),
    shortestLongPauseSeconds: 3,
    longestSingleSilenceSeconds: Math.max(180, maxPlannedPause * 2),
    shortPauseAdjustLimit: params.shortPauseAdjustLimit,
    extraClosingMusicSeconds: 0,
    // Self-practice silences take most of any change; others keep proportion.
    longPauseWeight: (s) => (s >= SKELETON_SELF_PRACTICE_SECONDS ? s * 4 : s),
  });

  const wordsWritten = countSpokenWords(stripPhaseHeaders(fit.scriptAsWritten));
  const written = summarizeExtendablePauses(scriptAsWritten);
  const skeleton: SkeletonRecord = {
    style: slug,
    meditationType: meditationTypeForHarvesterKey(slug) ?? skeletonType,
    sourceKind: plan.source.kind,
    sourceId: plan.source.kind === "skeleton" ? plan.source.id : null,
    ...(plan.source.kind === "skeleton"
      ? {
          ...(plan.source.title ? { sourceTitle: plan.source.title } : {}),
          sourceFit: plan.source.fit,
          sourceRuntimeS: plan.source.runtimeS,
        }
      : {}),
    scale: plan.scale,
    passages: plan.passages.length,
    blocks: plan.blocks.length,
    merged: plan.merged,
    split: plan.split,
    plannedSpeechShare: plan.speechShare,
    sourceSpeechShare: plan.sourceSpeechShare,
    profileSpeechShare: profile?.speech_share?.overall?.median ?? null,
    openingShare: plan.openingShare,
    closingShare: plan.closingShare,
    plannedExtendablePauses: plan.passages.filter(
      (p) => p.pauseAfter >= SKELETON_EXTENDABLE_MIN_SECONDS,
    ).length,
    writtenExtendablePauses: written.count,
    candidates: plan.candidates,
  };

  const conformance = scoreScriptConformance({
    scriptWithHeaders: scriptAsWritten,
    plan,
    style: slug,
    fingerprint,
    fingerprintVersion: fingerprint ? (datasets.fingerprints?.version ?? 0) : 0,
  });

  console.log(
    JSON.stringify({
      tag: "create-skeleton-script",
      conformanceScore: conformance.score,
      foreignFamilies: conformance.foreign.families,
      style: slug,
      sourceId: skeleton.sourceId,
      wordBudget: plan.totalWords,
      wordsWritten,
      blocksWritten: splitTimeBasedPhases(scriptAsWritten).length,
      plannedExtendablePauses: skeleton.plannedExtendablePauses,
      writtenExtendablePauses: written.count,
      fitStep: fit.fitStep,
      outsideTolerance: fit.outsideTolerance,
      predictedSecondsAfter: fit.predictedSecondsAfter,
      timing: streamed.timing,
    }),
  );

  return {
    script: fit.script,
    scriptAsWritten,
    scriptWithHeaders: fit.scriptWithHeadersAfter,
    fit,
    plan,
    skeleton,
    usages: streamed.usages,
    wordBudget: plan.totalWords,
    wordsWritten,
    prepromptVersions,
    datasetVersions,
    conformance,
    timing: streamed.timing,
  };
}
