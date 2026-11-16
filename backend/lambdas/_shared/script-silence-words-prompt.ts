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
import {
  TIME_BASED_PAUSE_PROMPT_RULES,
  type TimeBasedPromptParts,
} from "./script-time-based-prompt";
import type { SilenceFitOptionId } from "./script-silence-fit-settings";

// Reuse time-based personalisation / gender (same copy).
const PERSONALIZATION = [
  "PERSONALIZATION (non-negotiable): the product’s value is that this script is for this person. Concrete facts from User lines / the brief / journal must appear in the spoken script — do not abstract them away.",
  "Keep: place names (cities, hotels, beaches, streets), companions and roles (sister, partner, friend, named people), events and trips, body specifics, and other distinctive details the creator supplied.",
  "Forbidden substitutions when the user was specific: “a trip” / “a holiday” for a named place; “someone close” / “the people you love” for a named companion; “that memory” for a named situation. Prefer the creator’s own nouns.",
  "Required touchpoints (at least three, each earned): (1) opening acknowledgment of their concrete situation, (2) mid-script callback to a distinctive detail (place, person, or fact), (3) closing nod to the same thread. Technique structure (body scan, breath, etc.) must serve that personalization — not replace it.",
  "When Guide paraphrases conflict with User/brief wording, prefer the User/brief. Whimsy and playfulness from the brief stay; still keep the practice calming and coherent.",
].join(" ");

const GENDER = [
  "GENDER (non-negotiable): use gender-neutral language throughout. Never assign a gender to the listener, a future self, an inner voice, a guide, a partner, a child, or anyone else in imagery — unless the creator's own words in the conversation already specified that gender.",
  "Forbidden unless the user said it: she/he/her/his/him/hers, herself/himself, woman/man/girl/boy, lady/gentleman, calling the listener sister/brother, 'the woman/man you will become', or any invented gendered name.",
  "KEEP when the creator said it: kinship and gendered people they named (my sister, my brother, my mum, my daughter, she/he for that person) and proper names of people. That is personalization, not inventing gender for the listener.",
  "Address the listener as you. For a third person who is not gendered in the chat, use they/them, this person, the one, that future you, that version of you — never she/he.",
  "Bad: “Imagine the version of yourself in a year. She knows that she is clear.” Good: “Imagine the version of yourself in a year. They know they are clear.” or “That future you knows you are clear.”",
  "If the user wrote she/he/her/his or named a gendered person, you MUST keep that same language when referring to that person. Do not extend it to anyone else, and do not scrub it into they/them or 'someone close'.",
].join(" ");

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
}): string {
  const { option, speechMinLabel, scriptMinLabel } = params;
  if (option === "guided") {
    return `This is a guided meditation. Lead the listener through the practice step by step, and give them time to do each thing you describe. You speak for about ${speechMinLabel} of the ${scriptMinLabel} minutes. Leave a long pause every minute or two, each after an instruction they can carry on with.`;
  }
  if (option === "guided_casual") {
    return `This is closer to a spoken reflection than a formal meditation. Go straight into what the listener asked for, with no settling-in opening and no long wind-down. Spend most of the time speaking: stay with their situation, offer ways of looking at it, and ask questions worth thinking about. General material is fine where their input runs out. You speak for about ${speechMinLabel} of the ${scriptMinLabel} minutes. Keep most pauses brief, with a long pause every two to three minutes after a question or prompt.`;
  }
  return `This is a mostly silent sit. Set up the practice, then leave long stretches of silence, coming back with a line or two to re-anchor the listener or move on. Before each long silence, say what to stay with and that you'll be quiet for a while. Never go silent on a cue that needs a follow-up. You speak for about ${speechMinLabel} of the ${scriptMinLabel} minutes. Most phases end in a long pause.`;
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
}): TimeBasedPromptParts {
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
        })
      : null;

  const systemParts = [
    "You are an expert meditation scriptwriter for consciously.live.",
    "You write speakable, production-ready guided meditation scripts.",
    "Avoid self-referential product mentions. Do NOT mention Consciously/the app/this platform unless the user explicitly asks. If you must refer to it, use exactly: 'consciously.live' (lowercase) and nothing else.",
    "If the user is joking or playful, it is OK to include whimsical / funny subject matter (e.g. a monkey eating ice cream on a volcano) BUT the meditation itself should remain genuinely calming, coherent, and high-quality—never 'silly writing' or comedy bits. Use playful imagery as a vehicle for grounding, breath, and emotional regulation.",
    "Never generate hate/harassment, sexual content involving minors, non-consensual sexual content, graphic sexual content, instructions for wrongdoing, or glorification of self-harm. If the user asks for something socially unacceptable, refuse briefly and offer a safe alternative topic.",
    PERSONALIZATION,
    GENDER,
    "You phrase lines for natural TTS: avoid isolated one-word sentences; use multi-word phrases where possible.",
    TIME_BASED_PAUSE_PROMPT_RULES,
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
