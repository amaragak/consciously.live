/**
 * Time-based mode's own copy of the original (pre-sectioned) script-generation
 * pre-prompt. Word-for-word from the Nov 2026 single-call prompt, except:
 * - no Target length / pause-budget / Voice stem blocks
 * - script time + range of space + rough speech + phase headers (minutes · sentences)
 * - pause frequency wording tweaked for time-based
 * - short pause marker syntax (what time-based parses)
 *
 * Sectioned and legacy single-call keep meditation-script-generate-prompt.ts.
 */
import {
  creatorChoseSpecificMeditationTechnique,
  styleAdherenceBlockForPrompt,
} from "./meditation-types";
import {
  pauseRulesForPrompt,
  type DeliveryId,
  type DeliveryProfiles,
  type SpaceRange,
} from "./delivery-profiles";
import {
  isSleepMeditationType,
  scriptLabClosingPhaseTagRulesForType,
} from "./script-lab-shared-prompt-rules";
import { styleGuidePromptBlock } from "./style-guide-for-prompt";

/** Snapshot of original PERSONALIZATION (pre sectioned / length work). */
const TIME_PERSONALIZATION_KEEP_RULES = [
  "PERSONALIZATION (non-negotiable): the product’s value is that this script is for this person. Concrete facts from User lines / the brief / journal must appear in the spoken script — do not abstract them away.",
  "Keep: place names (cities, hotels, beaches, streets), companions and roles (sister, partner, friend, named people), events and trips, body specifics, and other distinctive details the creator supplied.",
  "Forbidden substitutions when the user was specific: “a trip” / “a holiday” for a named place; “someone close” / “the people you love” for a named companion; “that memory” for a named situation. Prefer the creator’s own nouns.",
  "Required touchpoints (at least three, each earned): (1) opening acknowledgment of their concrete situation, (2) mid-script callback to a distinctive detail (place, person, or fact), (3) closing nod to the same thread. Technique structure (body scan, breath, etc.) must serve that personalization — not replace it.",
  "When Guide paraphrases conflict with User/brief wording, prefer the User/brief. Whimsy and playfulness from the brief stay; still keep the practice calming and coherent.",
].join(" ");

/** Snapshot of original GENDER block. */
const TIME_GENDER_NEUTRAL_SCRIPT_RULES = [
  "GENDER (non-negotiable): use gender-neutral language throughout. Never assign a gender to the listener, a future self, an inner voice, a guide, a partner, a child, or anyone else in imagery — unless the creator's own words in the conversation already specified that gender.",
  "Forbidden unless the user said it: she/he/her/his/him/hers, herself/himself, woman/man/girl/boy, lady/gentleman, calling the listener sister/brother, 'the woman/man you will become', or any invented gendered name.",
  "KEEP when the creator said it: kinship and gendered people they named (my sister, my brother, my mum, my daughter, she/he for that person) and proper names of people. That is personalization, not inventing gender for the listener.",
  "Address the listener as you. For a third person who is not gendered in the chat, use they/them, this person, the one, that future you, that version of you — never she/he.",
  "Bad: “Imagine the version of yourself in a year. She knows that she is clear.” Good: “Imagine the version of yourself in a year. They know they are clear.” or “That future you knows you are clear.”",
  "If the user wrote she/he/her/his or named a gendered person, you MUST keep that same language when referring to that person. Do not extend it to anyone else, and do not scrub it into they/them or 'someone close'.",
].join(" ");

/**
 * Original pause guidance, short-marker syntax, with time-based frequency tweaks.
 * Extendable-marker instruction intentionally omitted until that zip is available.
 */
/*
export const TIME_BASED_PAUSE_PROMPT_RULES_NAMED = [
  "Use **liberal** natural pauses with short markers: `<s>`, `<m>`, … Prefer **named bands** …",
].join("\n");
*/
export const TIME_BASED_PAUSE_PROMPT_RULES = [
  "Mark every pause with its length in seconds: `<N>`, for example `<2>` or `<5.5>`. Choose each length for the moment: short where the flow should carry on, longer after something the listener needs time to take in. Place pauses between ideas or small groups of sentences, not after every sentence.",
  // Was: "Include them **often**—after most sentences or sense-units..."
  "Include them between ideas or small groups of sentences, not after every sentence, at **every** meaningful transition (arrival → practice, shifts in technique or imagery, closing), and wherever a human guide would breathe or let a phrase land—not only at rare dramatic beats.",
  "Place **every** pause **intelligently**: think carefully how long each silence should be so the meditation flows naturally and the meditator has real space at reflection points. Each gap must fit the moment—what was just said, the emotional or somatic weight, the transition, and what comes next. Pauses are not filler; avoid random, uniform, or excessive markers that would break rhythm or feel mechanical.",
  "**Guided breath cycles (important):** when you sequence step-by-step breath cues the guide delivers in order—e.g. breathe in … then breathe out; inhale … exhale; hold … release—the pause **between those paired steps** must be short only (about `<1>`–`<2>`). That gap is just long enough to finish that one phase before the next line; it is **not** self-paced practice. Never use a long open silence after “breathe in” (or similar) if the next section is “breathe out” (or the matching exhale/release). Use longer pauses only when the listener has real open time before the guide speaks again.",
  "When the listener truly follows in their own time—with no next instruction arriving soon—prefer a longer pause (sometimes several in a row when one sustained silence fits); never rush the next line while they are meant to be practising alone, and never stack long silence where the script does not call for it.",
  "Place pause markers on their own or immediately after a sentence, never splitting words. Never invent other spellings; do not write `[[PAUSE …]]`.",
  "",
  "### Extendable pauses",
  // Was: Ordinary pauses (`<s>`, `<m>`, …) stay fixed.
  "Ordinary pauses (`<N>`) are short beats between lines — the time to take one breath or notice one thing. They stay fixed.",
  "For the long, open silences where the listener carries on with something on their own, use `<x N>` with your suggested seconds. The app resizes these to fit the length.",
  "Use the extendable marker only where a longer silence would still feel natural, and always after a cue the listener can keep doing for that long.",
  "",
  "### Explicit spoken timings (hard constraint)",
  "**Only** invent clocked or count-based practice when the creator **explicitly steers** that in the conversation. Default / unprompted scripts must **never** do this.",
  "Forbidden unless the user asked for it: spoken second recipes (“hold for five seconds”, “breathe in for four, hold for four, out for six”), count-along cues (“inhale for 4 — one, two, three, four”), metronomic box/ratio breathing with numbers, or any similar numeric timing recipe in the spoken words or as prescribed pause lengths the listener is meant to match.",
  "This does **not** mean you should skimp on pause craft. On the contrary: always choose pause lengths with care so silence lands where reflection needs space. What is gated is **announcing or prescribing** specific timings — not using silence markers for natural flow.",
  "When the user **does** explicitly request count-based or second-precise timing (e.g. inhale for 4 with spoken 1, 2, 3, 4): size every gap to **real seconds**, not much more or less. Prefer timed markers such as `<1>` between spoken counts so the listener is not left waiting ages for the next number, and not rushed through the phase. Spoken counts + silences in a phase should sum to roughly the named duration of that phase.",
].join("\n");

export type TimeBasedPromptParts = {
  systemStable: string;
  meditationContext: string;
  taskContent: string;
  maxTokens: number;
};

/**
 * Build the time-based prompt from the original pre-prompt copy.
 */
/** Fallback words/sentence when a pacing has no measured time-based scripts yet. */
export const DEFAULT_TIME_WORDS_PER_SENTENCE = 12;

/** Sentences-per-minute guidance for phase headers (one decimal). */
export function timeBasedSentencesPerMinute(params: {
  effectiveWpm: number;
  midSilenceShare: number;
  /** Measured average; falls back to 12. */
  wordsPerSentence?: number;
}): number {
  const speechShare = Math.max(0.05, 1 - params.midSilenceShare);
  // Was: const spm = (params.effectiveWpm * speechShare) / 12;
  const wps =
    typeof params.wordsPerSentence === "number" &&
    Number.isFinite(params.wordsPerSentence) &&
    params.wordsPerSentence > 0
      ? params.wordsPerSentence
      : DEFAULT_TIME_WORDS_PER_SENTENCE;
  const spm = (params.effectiveWpm * speechShare) / wps;
  return Math.round(spm * 10) / 10;
}

export function buildTimeBasedScriptPrompt(params: {
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  delivery: DeliveryId;
  profiles: DeliveryProfiles;
  scriptTimeSeconds: number;
  roughSpeechWords: number;
  spaceRange: SpaceRange;
  /** Sentences per minute of phase time (from WPM × speech share ÷ words/sentence). */
  sentencesPerMinute: number;
  /** Total sentence budget for the whole script (minutes × SPM, rounded). */
  totalSentenceBudget: number;
  journalMode?: boolean;
}): TimeBasedPromptParts {
  const delivery = params.delivery;
  const casual = delivery === "casual";
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

  const midSilence =
    (params.spaceRange.min + params.spaceRange.max) / 2;
  const longest =
    delivery === "casual" ? params.profiles.casual.longestPause : 4;
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
          silenceShare: midSilence,
          longestPauseSeconds: longest,
          stripPauses: casual,
          omitSectionSilenceTarget: true,
        })
      : null;

  // Original system (no length-scaling / word-range lines).
  const systemParts = [
    "You are an expert meditation scriptwriter for consciously.live.",
    "You write speakable, production-ready guided meditation scripts.",
    "Avoid self-referential product mentions. Do NOT mention Consciously/the app/this platform unless the user explicitly asks. If you must refer to it, use exactly: 'consciously.live' (lowercase) and nothing else.",
    "If the user is joking or playful, it is OK to include whimsical / funny subject matter (e.g. a monkey eating ice cream on a volcano) BUT the meditation itself should remain genuinely calming, coherent, and high-quality—never 'silly writing' or comedy bits. Use playful imagery as a vehicle for grounding, breath, and emotional regulation.",
    "Never generate hate/harassment, sexual content involving minors, non-consensual sexual content, graphic sexual content, instructions for wrongdoing, or glorification of self-harm. If the user asks for something socially unacceptable, refuse briefly and offer a safe alternative topic.",
    TIME_PERSONALIZATION_KEEP_RULES,
    TIME_GENDER_NEUTRAL_SCRIPT_RULES,
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
  const lo = Math.round(params.spaceRange.min * 100);
  const hi = Math.round(params.spaceRange.max * 100);

  // Meditation context: style + transcript + time-based length (replaces Target length /
  // pause-budget / Voice stem).
  const meditationContext = [
    styleHint,
    lockBlock,
    "",
    "### Conversation between creator and guide (chronological)",
    params.transcript.trim() || "(No messages yet.)",
    "",
    `Script time ≈ **${scriptMin} minutes** (${Math.round(params.scriptTimeSeconds)}s) after lead-in, title, and fade-out.`,
    `Range of space (silence share of the script stem): **${lo}–${hi}%**. Place and size pauses by feel so the piece sits in that range — do not chase a word target.`,
    `Rough amount of speech: about **${params.roughSpeechWords}** spoken words (guidance only, not a quota).`,
  ]
    .filter((s) => s !== "")
    .join("\n");

  const totalSentences = Math.max(1, Math.round(params.totalSentenceBudget));
  // Phase headers replace separate outline + [[phase: …]] markers.
  const taskContent = [
    "### Your task",
    // Was: outline first, then script with [[phase: …]] markers.
    // "First write a short OUTLINE (one line per phase: name and rough minutes…). Then write the complete guided meditation script…"
    "Write the complete guided meditation script that a human guide would read aloud for recording, phase by phase.",
    casual
      ? "Use a **Casual** delivery: go straight into what they asked for. Skip settling-in openings (no “settle into your breath”, body scan framing, or eyes-closed arrival) and skip a long reflective wind-down. Keep pauses short — never invent a single reflective silence longer than about **4 seconds**."
      : "Use clear phases (e.g. opening/arrival, main practice, gentle closing).",
    "Match the emotional tone, intentions, and imagery from the conversation — and keep concrete personal facts (see PERSONALIZATION rules), not only vague impressions.",
    "Use second person or gentle imperatives; warm, inclusive, non-clinical language.",
    // In systemStable already — was sent twice.
    // TIME_PERSONALIZATION_KEEP_RULES,
    // TIME_GENDER_NEUTRAL_SCRIPT_RULES,
    "Phrase for natural text-to-speech: avoid single-word sentences or standalone one-word lines (they often get wrong stress or intonation). Prefer multi-word phrases and full sentences—for example, instead of ending with “Sleep.” alone, close with something like “When you’re ready, let yourself drift into sleep.”",
    // In systemStable already — was sent twice.
    // TIME_BASED_PAUSE_PROMPT_RULES,
    ...(sleepType
      ? ["", scriptLabClosingPhaseTagRulesForType(styleForScript)]
      : []),
    // Was: `At this pacing, aim for about **${spm}** sentences per minute of phase time. Put each phase's minutes and its sentence count (minutes × ${spm}, rounded) in its header, then write that phase.`,
    `Total budget: about **${totalSentences}** sentences for the whole script. Split them across your phases. Each header's sentence count is that phase's share, and the header counts must add up to ${totalSentences}. Phase minutes should add up to about ${scriptMin} minutes.`,
    "You choose the phases, their names, and their minutes (adding up to about the script time).",
    "Start **every** phase with a header line exactly like:",
    "`## arriving · ~2 min · ~9 sentences`",
    "(name · ~minutes · ~sentence count). Then the spoken lines for that phase. No separate outline.",
    "Important formatting constraints:",
    "1) Do NOT output any title, preamble, or commentary outside the phase headers and spoken script.",
    "2) The script starts at the first `## …` phase header; the first spoken content follows that header immediately.",
    "3) Do NOT start a phase with a pause marker; only include pauses after speaking has begun.",
    "4) Do NOT use `[[phase: …]]` markers or a separate outline block.",
    "Output format: phase headers interleaved with spoken script only. No word ranges. No per-phase silence targets.",
  ].join("\n");

  return {
    systemStable,
    meditationContext,
    taskContent,
    maxTokens: 8192,
  };
}
