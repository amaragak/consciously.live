/**
 * Create · skeleton prompt: one Sonnet call writes new words into the style's
 * scaled skeleton. Pacing comes from the skeleton, so there is no delivery
 * option, speech-share target or hand-written cue spacing here.
 */
import {
  creatorChoseSpecificMeditationTechnique,
  normalizeMeditationType,
  styleAdherenceBlockForPrompt,
} from "./meditation-types";
import {
  isSleepMeditationType,
  scriptLabClosingPhaseTagRulesForType,
} from "./script-lab-shared-prompt-rules";
import { rewriteGuidePauseMarkers, styleGuideMarkdownFor } from "./style-guide-for-prompt";
import type { TimeBasedPromptParts } from "./script-time-based-prompt";
import { PREPROMPT_DEFAULTS } from "./preprompts/preprompt-defaults-data";
import {
  fillPrepromptPlaceholders,
  normalizePrepromptText,
  PREPROMPT_ID,
} from "./preprompts/preprompt-registry";
import { formatSkeletonForPrompt, type SkeletonPlan } from "./script-skeleton-plan";

export type SkeletonPrepromptTexts = {
  systemPrefix: string;
  personalization: string;
  gender: string;
  pauseRules: string;
  skeletonTask: string;
};

export function defaultSkeletonPrepromptTexts(): SkeletonPrepromptTexts {
  const d = (id: string) => normalizePrepromptText(PREPROMPT_DEFAULTS[id] ?? "");
  return {
    systemPrefix: d(PREPROMPT_ID.systemPrefix),
    personalization: d(PREPROMPT_ID.personalization),
    gender: d(PREPROMPT_ID.gender),
    pauseRules: d(PREPROMPT_ID.pauseRules),
    skeletonTask: d(PREPROMPT_ID.skeletonTask),
  };
}

export function buildSkeletonScriptPrompt(params: {
  transcript: string;
  meditationStyle?: string;
  /** Guide style (creator's, or inferred when they didn't pick one). */
  styleGuideStyle?: string;
  /** App meditation type the skeleton came from (e.g. "Open awareness"). */
  skeletonMeditationType: string;
  plan: SkeletonPlan;
  journalMode?: boolean;
  preprompts?: Partial<SkeletonPrepromptTexts>;
  /** Live style guide text; omitted = embedded default for the guide style. */
  styleGuideMarkdown?: string | null;
  /** Compact delivery fingerprint (formatFingerprintForPrompt); null = none imported. */
  fingerprintBlock?: string | null;
}): TimeBasedPromptParts {
  const pre: SkeletonPrepromptTexts = {
    ...defaultSkeletonPrepromptTexts(),
    ...Object.fromEntries(
      Object.entries(params.preprompts ?? {}).filter(
        ([, v]) => typeof v === "string" && v.trim() !== "",
      ),
    ),
  };
  const styleForScript = (params.meditationStyle ?? "").trim();
  const sleepType = isSleepMeditationType(
    params.journalMode ? null : styleForScript,
  );
  const styleLocked = creatorChoseSpecificMeditationTechnique({
    journalMode: params.journalMode === true,
    meditationStyle: styleForScript,
  });
  const styleHint = styleForScript
    ? `Preferred meditation style from the creator: "${styleForScript}".`
    : "The creator has not locked a style label yet — infer an appropriate approach from the chat.";
  const lockBlock = styleLocked
    ? [
        "",
        styleAdherenceBlockForPrompt(styleForScript),
        "",
        "The script must spend a substantial part of the practice on the chosen technique above (not a brief nod while the rest is a generic unrelated meditation), while still reflecting the user’s situation from the conversation.",
      ].join("\n")
    : "";

  const guideStyle = (params.styleGuideStyle?.trim() || styleForScript).trim();
  const guideRaw =
    !params.journalMode && guideStyle
      ? params.styleGuideMarkdown?.trim() ||
        styleGuideMarkdownFor(normalizeMeditationType(guideStyle) ?? guideStyle)
      : null;
  // Was (silence-words Create): styleGuidePromptBlock with the open-sits pacing
  // line ("about N% of it is silence…") and Casual's Pauses-section strip.
  // The skeleton now sets pacing, so the guide is only for wording and tone.
  const guideBlock = guideRaw
    ? [
        "### Style writer's guide (wording and tone)",
        "Apply with judgement. Precedence: the user's brief, chat and attached context first; then the skeleton in the task (structure, word targets and pause lengths); then this guide. The skeleton already sets where the silences go and how long they are, so use the guide for how things are introduced and said, not for pause lengths.",
        "",
        rewriteGuidePauseMarkers(guideRaw).trim(),
      ].join("\n")
    : null;

  const systemParts = [
    pre.systemPrefix,
    pre.personalization,
    pre.gender,
    "You phrase lines for natural TTS: avoid isolated one-word sentences; use multi-word phrases where possible.",
    pre.pauseRules,
    "Never invent spoken second-counts or count-along breath recipes unless the creator explicitly asked.",
  ];
  const fingerprintBlock = params.fingerprintBlock?.trim() || null;
  const systemStable = [
    systemParts.join(" "),
    ...(guideBlock ? [guideBlock] : []),
    ...(fingerprintBlock ? [fingerprintBlock] : []),
  ].join("\n\n");

  const scriptMin = Math.round((params.plan.targetSeconds / 60) * 10) / 10;
  const meditationContext = [
    styleHint,
    lockBlock,
    "",
    "### Conversation between creator and guide (chronological)",
    params.transcript.trim() || "(No messages yet.)",
    "",
    `Script time ≈ **${scriptMin} minutes** (${Math.round(params.plan.targetSeconds)}s) after lead-in, title, and fade-out.`,
  ]
    .filter((s) => s !== "")
    .join("\n");

  const task = fillPrepromptPlaceholders(pre.skeletonTask, {
    skeleton: formatSkeletonForPrompt(params.plan),
    totalWords: params.plan.totalWords,
    passageCount: params.plan.passages.length,
    scriptMinLabel: `${scriptMin}`,
    styleLabel: params.skeletonMeditationType,
  });
  const taskContent = [
    "### Your task",
    task,
    ...(sleepType
      ? ["", scriptLabClosingPhaseTagRulesForType(styleForScript)]
      : []),
  ].join("\n");

  return { systemStable, meditationContext, taskContent, maxTokens: 16_000 };
}
