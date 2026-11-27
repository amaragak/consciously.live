/**
 * Silence-fit · words prompt: same as Silence-fit, with word budgets/headers
 * instead of sentences. One Claude call; app fits silence afterwards.
 */
import {
  creatorChoseSpecificMeditationTechnique,
  styleAdherenceBlockForPrompt,
} from "./meditation-types";
import {
  pauseRulesForPrompt,
  type DeliveryId,
  type DeliveryProfiles,
} from "./delivery-profiles";
import {
  isSleepMeditationType,
  scriptLabClosingPhaseTagRulesForType,
} from "./script-lab-shared-prompt-rules";
import { styleGuidePromptBlock } from "./style-guide-for-prompt";
import type { TimeBasedPromptParts } from "./script-time-based-prompt";
import { PREPROMPT_DEFAULTS } from "./preprompts/preprompt-defaults-data";
import {
  fillPrepromptPlaceholders,
  normalizePrepromptText,
  PREPROMPT_ID,
} from "./preprompts/preprompt-registry";
import type { SilenceFitOptionId } from "./script-silence-fit-settings";

// Was: PERSONALIZATION / GENDER / TIME_BASED_PAUSE_PROMPT_RULES / open_sits
// optionDescription / system opener lines inline in this file (and in
// script-time-based-prompt.ts for the pause rules).
// Now: versioned Pre-prompts (Admin › Pre-prompts). Defaults live in
// ./preprompts/defaults/*.txt and are embedded in preprompt-defaults-data.ts;
// Create loads the live (latest) versions and passes them in via `preprompts`.
// const PERSONALIZATION = [ "PERSONALIZATION (non-negotiable): …" ].join(" ");
// const GENDER = [ "GENDER (non-negotiable): …" ].join(" ");

/** Live (or default) text for each pre-prompt the silence-words prompt reads. */
export type SilenceWordsPrepromptTexts = {
  systemPrefix: string;
  personalization: string;
  gender: string;
  pauseRules: string;
  openSitsOptionDescription: string;
};

export function defaultSilenceWordsPrepromptTexts(): SilenceWordsPrepromptTexts {
  const d = (id: string) => normalizePrepromptText(PREPROMPT_DEFAULTS[id] ?? "");
  return {
    systemPrefix: d(PREPROMPT_ID.systemPrefix),
    personalization: d(PREPROMPT_ID.personalization),
    gender: d(PREPROMPT_ID.gender),
    pauseRules: d(PREPROMPT_ID.pauseRules),
    openSitsOptionDescription: d(PREPROMPT_ID.openSitsOptionDescription),
  };
}

function fmtClockMin(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r === 0) return `${m}:00`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function optionDescription(params: {
  option: SilenceFitOptionId;
  speechMinLabel: string;
  scriptMinLabel: string;
  openSitsText: string;
}): string {
  const { option, speechMinLabel, scriptMinLabel, openSitsText } = params;
  if (option === "guided") {
    return `This is a guided meditation. Lead the listener through the practice step by step, and give them time to do each thing you describe. You speak for about ${speechMinLabel} of the ${scriptMinLabel} minutes. Leave a long pause every minute or two, each after an instruction they can carry on with.`;
  }
  if (option === "guided_casual") {
    return `This is closer to a spoken reflection than a formal meditation. Go straight into what the listener asked for, with no settling-in opening and no long wind-down. Spend most of the time speaking: stay with their situation, offer ways of looking at it, and ask questions worth thinking about. General material is fine where their input runs out. You speak for about ${speechMinLabel} of the ${scriptMinLabel} minutes. Keep most pauses brief, with a long pause every two to three minutes after a question or prompt.`;
  }
  // open_sits — Create default (consciously-open-sits-default-v2).
  // Was: inline array of lines (now preprompts/defaults/open-sits-option-description.txt).
  return fillPrepromptPlaceholders(openSitsText, {
    speechMinLabel,
    scriptMinLabel,
  });
}

/** Delivery id used for pauseRulesForPrompt / style guide strip. */
function deliveryForOption(option: SilenceFitOptionId): DeliveryId {
  if (option === "open_sits") return "open_sits";
  if (option === "guided_casual") return "casual";
  return "guided";
}

export function buildSilenceWordsScriptPrompt(params: {
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  option: SilenceFitOptionId;
  profiles: DeliveryProfiles;
  scriptTimeSeconds: number;
  /** Target speaking share from Delivery profiles (1 − silence share). */
  speakingShare: number;
  /** Accuracy band only (speaking share ±10 pts). */
  speakingBandMin: number;
  speakingBandMax: number;
  /** Total spoken-word budget (nearest 10). */
  totalWordBudget: number;
  // Was: totalSentenceBudget — sentence-based Silence-fit only.
  // totalSentenceBudget: number;
  minLongPauses: number;
  longestSingleSilenceSeconds: number;
  journalMode?: boolean;
  /**
   * Live pre-prompt texts (Admin › Pre-prompts). Omitted keys use the embedded
   * repo defaults, so sync callers (Admin script lab, tests) keep working.
   */
  preprompts?: Partial<SilenceWordsPrepromptTexts>;
  /**
   * Live style guide markdown for `styleGuideStyle || meditationStyle`.
   * Omitted = embedded STYLE_GUIDE_BY_TYPE.
   */
  styleGuideMarkdown?: string | null;
}): TimeBasedPromptParts {
  const pre: SilenceWordsPrepromptTexts = {
    ...defaultSilenceWordsPrepromptTexts(),
    ...Object.fromEntries(
      Object.entries(params.preprompts ?? {}).filter(
        ([, v]) => typeof v === "string" && v.trim() !== "",
      ),
    ),
  };
  const delivery = deliveryForOption(params.option);
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

  // Style guide: silence = 1 − speaking share (Delivery profiles).
  // Was: midpoint of speaking band.
  // const midSpeech =
  //   (params.speakingBandMin + params.speakingBandMax) / 2;
  // const silenceShare = Math.max(0.05, Math.min(0.95, 1 - midSpeech));
  const silenceShare = Math.max(
    0.05,
    Math.min(0.95, 1 - params.speakingShare),
  );
  void params.speakingBandMin;
  void params.speakingBandMax;
  const guideStyle = (
    params.styleGuideStyle?.trim() ||
    styleForScript ||
    ""
  ).trim();
  const guideBlock =
    !params.journalMode && guideStyle
      ? styleGuidePromptBlock({
          meditationStyle: guideStyle,
          delivery,
          silenceShare,
          longestPauseSeconds: params.longestSingleSilenceSeconds,
          stripPauses: delivery === "casual",
          omitSectionSilenceTarget: true,
          ...(params.styleGuideMarkdown?.trim()
            ? { guideMarkdownOverride: params.styleGuideMarkdown }
            : {}),
        })
      : null;

  // Was: seven inline lines (scriptwriter role … safety), then PERSONALIZATION, GENDER,
  // TTS line, TIME_BASED_PAUSE_PROMPT_RULES — now Pre-prompts (see top of file).
  const systemParts = [
    pre.systemPrefix,
    pre.personalization,
    pre.gender,
    "You phrase lines for natural TTS: avoid isolated one-word sentences; use multi-word phrases where possible.",
    pre.pauseRules,
    pauseRulesForPrompt(params.profiles, delivery),
    "Never invent spoken second-counts or count-along breath recipes unless the creator explicitly asked; still choose pause bands thoughtfully for natural flow. When they do ask for counted timing, sync pauses to real seconds.",
  ];

  const systemStable =
    guideBlock != null
      ? `${systemParts.join(" ")}\n\n${guideBlock}`
      : systemParts.join(" ");

  const scriptMin = Math.round((params.scriptTimeSeconds / 60) * 10) / 10;
  // Was: bottom of band / middle of band.
  // const speechSeconds = params.scriptTimeSeconds * params.speakingBandMin;
  // const speechShareForBudget =
  //   (params.speakingBandMin + params.speakingBandMax) / 2;
  const speechShareForBudget = params.speakingShare;
  const speechSeconds = params.scriptTimeSeconds * speechShareForBudget;
  const speechMinLabel = fmtClockMin(speechSeconds);
  const scriptMinLabel = `${scriptMin}`;
  const totalWords = Math.max(10, Math.round(params.totalWordBudget));
  // Was (Silence-fit): const totalSentences = Math.max(1, Math.round(params.totalSentenceBudget));
  const k = Math.max(2, Math.round(params.minLongPauses));
  const longest = Math.round(params.longestSingleSilenceSeconds);

  // Was (time-based): Range of space / Rough amount of speech lines.
  const meditationContext = [
    styleHint,
    lockBlock,
    "",
    "### Conversation between creator and guide (chronological)",
    params.transcript.trim() || "(No messages yet.)",
    "",
    `Script time ≈ **${scriptMin} minutes** (${Math.round(params.scriptTimeSeconds)}s) after lead-in, title, and fade-out.`,
  ]
    .filter((s) => s !== "")
    .join("\n");

  const taskContent = [
    "### Your task",
    "Write the complete guided meditation script that a human guide would read aloud for recording, phase by phase.",
    // Was: Casual / "Use clear phases" delivery line.
    optionDescription({
      option: params.option,
      speechMinLabel,
      scriptMinLabel,
      openSitsText: pre.openSitsOptionDescription,
    }),
    "Match the emotional tone, intentions, and imagery from the conversation — and keep concrete personal facts (see PERSONALIZATION rules), not only vague impressions.",
    "Use second person or gentle imperatives; warm, inclusive, non-clinical language.",
    "Phrase for natural text-to-speech: avoid single-word sentences or standalone one-word lines (they often get wrong stress or intonation). Prefer multi-word phrases and full sentences—for example, instead of ending with “Sleep.” alone, close with something like “When you’re ready, let yourself drift into sleep.”",
    ...(sleepType
      ? ["", scriptLabClosingPhaseTagRulesForType(styleForScript)]
      : []),
    // Was (Silence-fit sentence budget):
    // `Total budget: about **${totalSentences}** sentences…`
    // "`## arriving · ~2 min · ~9 sentences`"
    `Total budget: about **${totalWords}** spoken words for the whole script. Split them across your phases. Each header's word count is that phase's share, and the header counts must add up to ${totalWords}. Phase minutes should add up to about ${scriptMin} minutes. Write each phase to about its header's word count.`,
    // Was: Include at least K long pauses marked `<x N>` … No single silence longer than …
    `For the long, open silences where the listener carries on with something on their own, use \`<x N>\` with your suggested seconds. The app resizes these to fit the length. Include at least **${k}** of them, always after a cue the listener can keep doing. When fitting, no single silence will be longer than ${longest} seconds.`,
    // Speaking-share v2: comment out the under-write bias for every Silence-fit mode.
    // "If in doubt, write less. Silence can be added; words can't be taken out.",
    "You choose the phases, their names, and their minutes (adding up to about the script time).",
    "Start **every** phase with a header line exactly like:",
    "`## arriving · ~2 min · ~120 words`",
    "(name · ~minutes · ~spoken words). Then the spoken lines for that phase. No separate outline.",
    "Important formatting constraints:",
    "1) Do NOT output any title, preamble, or commentary outside the phase headers and spoken script.",
    "2) The script starts at the first `## …` phase header; the first spoken content follows that header immediately.",
    "3) Do NOT start a phase with a pause marker; only include pauses after speaking has begun.",
    "4) Do NOT use `[[phase: …]]` markers or a separate outline block.",
    "5) Pause markers are not words — do not count them toward the word budget.",
    "Output format: phase headers interleaved with spoken script only. No sentence counts. No per-phase silence targets.",
  ].join("\n");

  return {
    systemStable,
    meditationContext,
    taskContent,
    maxTokens: 16_000,
  };
}
