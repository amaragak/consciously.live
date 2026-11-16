import {
  creatorChoseSpecificMeditationTechnique,
  styleAdherenceBlockForPrompt,
} from "./meditation-types";
import { styleGuidePromptBlock } from "./style-guide-for-prompt";
import type { DeliveryId } from "./delivery-profiles";
import {
  getFleetScriptWordTargets,
  scriptDurationPlanningAppendix,
} from "./script-duration-planning-prompt";
import {
  SCRIPT_PAUSE_BAND_SECONDS,
  SCRIPT_PAUSE_PROMPT_RULES,
  type ScriptPauseBand,
  scriptLongerBreaksOpenPracticeRules,
  scriptOpenSitsMarkerRules,
} from "./script-pause-bands";
import type {
  PlannedSection,
  ScriptSectionPlan,
  SectionFix,
  SessionTotals,
} from "./script-sections";
import {
  scriptLabBreathReturnDisambiguationGeneration,
  scriptLabClosingPhaseTagRulesForType,
  scriptLabConnectiveTagSpacingRules,
  scriptLabSingularAdjacentCustomRules,
  scriptPauseBudgetGuidanceAppendix,
  scriptStoryPauseBandCapRules,
  isStoryMeditationType,
  isSleepMeditationType,
} from "./script-lab-shared-prompt-rules";
import {
  scriptSegmentLibraryPromptBlock,
} from "./script-segment-tags";
import {
  scriptLabSegmentDurationBudgetAppendix,
  type SegmentTagForPrompt,
} from "./script-segment-tag-metrics";

export type { SegmentTagForPrompt, SegmentTagTierAverage } from "./script-segment-tag-metrics";

/**
 * Hard rule for spoken scripts and coach chat. Gendered language is allowed
 * only when the creator themselves used it (e.g. “my daughter”, “she”, “I am a man”).
 */
export const GENDER_NEUTRAL_SCRIPT_RULES = [
  "GENDER (non-negotiable): use gender-neutral language throughout. Never assign a gender to the listener, a future self, an inner voice, a guide, a partner, a child, or anyone else in imagery — unless the creator's own words in the conversation already specified that gender.",
  "Forbidden unless the user said it: she/he/her/his/him/hers, herself/himself, woman/man/girl/boy, lady/gentleman, calling the listener sister/brother, 'the woman/man you will become', or any invented gendered name.",
  "KEEP when the creator said it: kinship and gendered people they named (my sister, my brother, my mum, my daughter, she/he for that person) and proper names of people. That is personalization, not inventing gender for the listener.",
  "Address the listener as you. For a third person who is not gendered in the chat, use they/them, this person, the one, that future you, that version of you — never she/he.",
  "Bad: “Imagine the version of yourself in a year. She knows that she is clear.” Good: “Imagine the version of yourself in a year. They know they are clear.” or “That future you knows you are clear.”",
  "If the user wrote she/he/her/his or named a gendered person, you MUST keep that same language when referring to that person. Do not extend it to anyone else, and do not scrub it into they/them or 'someone close'.",
].join(" ");

/**
 * Production create + Script Lab: concrete brief/chat facts must survive into
 * the spoken script. Soft “match implied imagery” alone was dropping place
 * names and companions (e.g. Benidorm, sister) into generic “a trip”.
 */
export const PERSONALIZATION_KEEP_RULES = [
  "PERSONALIZATION (non-negotiable): the product’s value is that this script is for this person. Concrete facts from User lines / the brief / journal must appear in the spoken script — do not abstract them away.",
  "Keep: place names (cities, hotels, beaches, streets), companions and roles (sister, partner, friend, named people), events and trips, body specifics, and other distinctive details the creator supplied.",
  "Forbidden substitutions when the user was specific: “a trip” / “a holiday” for a named place; “someone close” / “the people you love” for a named companion; “that memory” for a named situation. Prefer the creator’s own nouns.",
  // When the brief asks for named sensory detail, don’t leave categories empty.
  "When the user asks for concrete imagery (a room described in detail, three specific things to notice, named colours, objects, sounds), actually name them in the spoken script — do not shy away into vague buckets like “the light” or “what the room holds”. Invent fitting specifics if they did not supply the nouns themselves.",
  "Required touchpoints (at least three, each earned): (1) opening acknowledgment of their concrete situation, (2) mid-script callback to a distinctive detail (place, person, or fact), (3) closing nod to the same thread. Technique structure (body scan, breath, etc.) must serve that personalization — not replace it.",
  "When Guide paraphrases conflict with User/brief wording, prefer the User/brief. Whimsy and playfulness from the brief stay; still keep the practice calming and coherent.",
].join(" ");

/** Section writes: keep their nouns, no whole-script touchpoint quota. */
export const PERSONALIZATION_SECTION_RULES = [
  "PERSONALIZATION (non-negotiable): the product’s value is that this script is for this person. Concrete facts from User lines / the brief / journal must appear when this section uses them — do not abstract them away.",
  "Keep: place names (cities, hotels, beaches, streets), companions and roles (sister, partner, friend, named people), events and trips, body specifics, and other distinctive details the creator supplied.",
  "Forbidden substitutions when the user was specific: “a trip” / “a holiday” for a named place; “someone close” / “the people you love” for a named companion; “that memory” for a named situation. Prefer the creator’s own nouns.",
  "Use the personal details the plan assigns to this section, in the user's own words.",
  // Parallel section writes still must land concrete imagery when the brief asks for it.
  "If this section’s details call for concrete imagery the user requested (named objects, a described room, specific things to notice), speak those specifics — don’t leave them vague. Invent fitting nouns when the brief asked for them but didn’t list them.",
  "When Guide paraphrases conflict with User/brief wording, prefer the User/brief. Whimsy and playfulness from the brief stay; still keep the practice calming and coherent.",
].join(" ");

export type ScriptDelivery = "casual" | "guided" | "open_sits";

/** One block per delivery; the prompt carries only the chosen one. */
export const DELIVERY_PROMPT_BLOCKS: Record<ScriptDelivery, string> = {
  casual:
    "**Delivery: Casual.** This is reflection more than meditation, for people who may not meditate regularly. The user's request and their own material lead and stay central throughout. As the session gets longer, expand with reflection, other ways of seeing the situation and related ideas; some general calming content is fine, especially in longer sessions, but it supports the topic rather than becoming the point. If a style was chosen, do it in this lighter, talked-through way. Get to the topic quickly and keep the closing brief. Keep pauses short, never longer than 4 seconds.",
  guided:
    "**Delivery: Guided.** The voice leads a meditation throughout. Weave the user's situation through the chosen technique and give the technique real time. Open with a short settling in, then the main practice, then a short closing. Use the full range of pauses: longer ones after imagery or emotional lines, the longest only where the listener is genuinely practising on their own with no next cue coming soon.",
  open_sits:
    "**Delivery: Open sits.** Mostly silent practice with occasional cues. Write an opening cue that sets the intention from the user's request, then spaced cues that each set something up and leave space, then a closing cue. Long silences are the normal gap between cues; keep pauses within a cue short. Never step through breath sequences. Every long silence must follow a cue that gives the listener something to keep doing for that whole time (an ongoing practice, not a single action like \"take a breath in\"). Now and then, in varied ways, let the listener know a longer quiet is coming or that you'll come back to them; don't announce every silence. After a long silence, gently pick the listener up again before moving on.",
};

/** Delivery blocks for section writes: same intent, no numeric length rules. */
export const DELIVERY_PROMPT_BLOCKS_SECTION: Record<ScriptDelivery, string> = {
  casual:
    "**Delivery: Casual.** This is reflection more than meditation, for people who may not meditate regularly. The user's request and their own material lead and stay central. Expand with reflection and related ideas when there is room; calming content supports the topic rather than becoming the point. If a style was chosen, do it in this lighter, talked-through way. Get to the topic quickly and keep the closing brief. Keep pauses short.",
  guided:
    "**Delivery: Guided.** The voice leads a meditation throughout. Weave the user's situation through the chosen technique and give the technique real time. Use the full range of pauses: longer ones after imagery or emotional lines, the longest only where the listener is genuinely practising on their own with no next cue coming soon.",
  open_sits:
    "**Delivery: Open sits.** Mostly silent practice with occasional cues. Each cue sets something up and leaves space. Long silences are the normal gap between cues; keep pauses within a cue short. Never step through breath sequences. Every long silence must follow a cue that gives the listener something to keep doing for that whole time (an ongoing practice, not a single action like \"take a breath in\"). Now and then, in varied ways, let the listener know a longer quiet is coming or that you'll come back to them; don't announce every silence. After a long silence, gently pick the listener up again before moving on.",
};

export const PAUSE_FITS_ACTION_RULE =
  "A pause must fit what the listener was just asked to do: a single action (one breath, noticing one thing) gets a pause about as long as that action takes; a longer silence only follows an instruction they can carry on with for that long.";

/** Total-length instruction: the model plans speech and silence against the voice's real pace. */
export function scriptLengthInstruction(params: {
  targetMinutes: number;
  effectiveWpm: number;
  silenceSharePct: number;
  /** Computed from the above, net of render scale, comma breaks and the title intro. */
  words?: number;
  pauseSecondsWritten?: number;
  pauseBands?: Record<ScriptPauseBand, number>;
}): string {
  const n = params.targetMinutes;
  const base = `Length: this session should last about ${n} minutes in total, spoken words plus pauses. The voice speaks at about ${Math.round(params.effectiveWpm)} words per minute (not counting pauses). For this delivery, about ${Math.round(params.silenceSharePct)}% of the session should be silence. Plan the amount of speech and the pauses so the whole session comes out close to ${n} minutes.`;
  if (params.words == null || params.pauseSecondsWritten == null) return base;
  // Was: inject named-band seconds map from admin pause lengths.
  // const b = params.pauseBands ?? SCRIPT_PAUSE_BAND_SECONDS;
  // const bands = `extra short ${b["extra-short"]} s, …`;
  void params.pauseBands;
  void SCRIPT_PAUSE_BAND_SECONDS;
  return `${base} That works out at about **${params.words} spoken words** and about **${params.pauseSecondsWritten} seconds of pauses** in total, counting every timed pause marker (\`<N>\` = N seconds). Keep a running tally of both as you write.`;
}

/** Ask for a section plan instead of a script. */
export function scriptPlanTaskInstruction(params: {
  totalWords: number;
  totalPauseSeconds: number;
  wordCap: number;
  wordMin: number;
  /** Minimum sections from time-based word cap (ceil(total/cap)). */
  minSections?: number;
  /** Max wall-clock minutes per section (for the plan text). */
  maxSectionMinutes?: number;
}): string {
  const minSections = Math.max(
    1,
    params.minSections ??
      Math.ceil(params.totalWords / Math.max(1, params.wordCap)),
  );
  const maxMin = Math.max(0.5, params.maxSectionMinutes ?? 3);
  // Kept for callers / caps checks — no longer stated as a target count in the prompt.
  void minSections;
  // Previous wording (removed — pushed artificial section counts / sizes):
  // `Because of the word cap, this session needs at least ${minSections} sections…`
  // `Prefer fuller phases near ~${typicalWords} words each…`
  // Also dropped "p" (pause placeholder) — backend derives pauses from words.
  return [
    `Instead of writing the script, plan it. The session has about ${params.totalWords} spoken words and ${params.totalPauseSeconds} seconds of pauses in total. Divide it into sections, in order, following the user's request and the delivery.`,
    "",
    `A section is a phase of the session: one coherent stretch with a single purpose. It is not a single line, cue or instruction. No section may have more than ${params.wordCap} words or last more than ${maxMin} minutes; split a section when it would go over either. Also split wherever the topic or phase changes, so each section is about one thing. When there are two or more sections, each must have at least ${params.wordMin} words. A short session may be a single section if its words fit under ${params.wordCap}. You choose only the spoken words per section — pause length is derived later from the delivery silence share.`,
    "Do not repeat the brief or explain — sections already see the brief and chat.",
    "HARD word caps (count words; cut before emitting if over): n≤4, i≤15, c≤20, sf≤10, ea≤10; d = 2–6 key terms only (array or comma list), no sentences.",
    "Return a JSON array only (no fences, no prose). Each object uses short keys:",
    '- "n": name ≤ 4 words (e.g. "opening", "breath", "body feet", "closing")',
    '- "i": intention ≤ 15 words',
    '- "c": covers ≤ 20 words',
    '- "sf": starts_from ≤ 10 words',
    '- "ea": ends_at ≤ 10 words',
    '- "d": details — user key terms only for this section',
    '- "w": spoken words (integer)',
    // '- "p": pause_seconds — removed; backend sets pauses from words',
    `The "w" values must add up to about ${params.totalWords}. Aim for a short plan (roughly a few hundred tokens total).`,
  ].join("\n");
}

function clipWords(text: string, maxWords: number): string {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function clipDetails(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  // Prefer comma / semicolon lists; otherwise take first ~6 tokens.
  const parts = t
    .split(/[,;|/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 6).join(", ");
  return clipWords(t, 6);
}

export function formatPlanForPrompt(plan: ScriptSectionPlan): string {
  // Compact, no "p" — plan JSON is cached once (checkpoint 2) across section calls.
  // Clip fields so a verbose model reply cannot bloat every section's checkpoint 2.
  return JSON.stringify(
    plan.sections.map((s) => ({
      n: clipWords(s.name, 4),
      i: clipWords(s.intention, 15),
      c: clipWords(s.covers, 20),
      sf: clipWords(s.startsFrom, 10),
      ea: clipWords(s.endsAt, 10),
      d: clipDetails(s.details),
      w: s.words,
    })),
  );
}

/**
 * Shared section-writing rules (byte-identical for every section of a meditation).
 * Cached with the plan JSON as Messages checkpoint 2.
 */
export function scriptSectionSharedRules(): string {
  return [
    "### Section writing rules",
    "Write only the section named in the task below. Follow that section's intention (\"i\") and cover only its ground (\"c\"). Begin from its \"sf\" and end at its \"ea\". Use the personal details the plan assigns to this section, in the user's own words.",
    // Was: short pause markers (`<s>`, `<m>`, …).
    "Output only the spoken text and timed pause markers (`<N>`, e.g. `<2>` or `<5.5>`). Do not write `[[PAUSE …]]`.",
    "Important formatting constraints:",
    "1) Do NOT output any title, heading, or preamble of any kind.",
    "2) The very first spoken content must start immediately (first non-whitespace characters must be the guide's words).",
    "3) Do NOT start the script with a pause marker; only include pauses after speaking has begun.",
  ].join("\n");
}

/**
 * Uncached per-section task only — name, word range, pause budget, open/close role.
 * Details / sf / ea / PERSONALIZATION live in the cached plan + shared rules.
 */
export function scriptSectionTaskOnly(params: {
  section: PlannedSection;
  isFirst: boolean;
  isLast: boolean;
  priorText?: string;
}): string {
  const role = params.isFirst
    ? "This is the first section: open the session."
    : params.isLast
      ? "This is the last section: close the session."
      : "Don't open or close the session; continue from the previous section and lead into the next.";
  const lo = Math.max(5, Math.round((params.section.words * 0.9) / 5) * 5);
  const hi = Math.max(lo, Math.round((params.section.words * 1.1) / 5) * 5);
  const pauseAsk =
    params.isFirst || params.isLast
      ? "Pauses: your choice."
      : `Pauses: about ${params.section.pauseSeconds} s.`;
  // Previous long task (kept for reference) inlined details/sf/ea + PERSONALIZATION:
  // `Write only the "${name}" section… Follow its intention… use these specifics: … Begin from "…" …`
  const lines = [
    `Section: "${params.section.name}". ${lo}–${hi} spoken words. ${pauseAsk}`,
    role,
    "Output only the spoken text and pause markers.",
  ];
  if (params.priorText?.trim()) {
    lines.push("", "### Script so far", params.priorText.trim());
  }
  return lines.join("\n");
}

/** @deprecated Prefer scriptSectionTaskOnly + scriptSectionSharedRules. */
export function scriptSectionWriteInstruction(params: {
  section: PlannedSection;
  plan: ScriptSectionPlan;
  isFirst: boolean;
  isLast: boolean;
  priorText?: string;
  /** When false, omit the plan block (caller puts it in a separate cacheable chunk). */
  includePlan?: boolean;
}): string {
  const lines = [scriptSectionTaskOnly(params)];
  if (params.includePlan !== false) {
    lines.unshift(
      "### Plan for the whole session",
      formatPlanForPrompt(params.plan),
      "",
      scriptSectionSharedRules(),
      "",
    );
  }
  return lines.join("\n");
}

/** One targeted call that extends or trims named sections only. */
export function buildSectionFixPrompt(params: {
  sections: Array<{ id: string; text: string }>;
  fixes: SectionFix[];
}): { system: string; userContent: string } {
  const system = [
    "You are an expert meditation scriptwriter for consciously.live. You adjust the length of named sections of a finished spoken script.",
    PERSONALIZATION_KEEP_RULES,
    GENDER_NEUTRAL_SCRIPT_RULES,
    // Was: Use short pause markers only: `<s>`, `<m>`, …
    "Use timed pause markers only: `<N>`, for example `<2>` or `<5.5>`. Do not write `[[PAUSE …]]`.",
  ].join(" ");
  const asks = params.fixes.map((f) =>
    f.action === "add"
      ? `- Add about ${f.words} words in the "${f.id}" section only, keeping its pauses in proportion.`
      : `- Cut about ${f.words} words from the "${f.id}" section only, keeping its pauses in proportion.`,
  );
  const body = params.sections
    .map((s) => `### Section: ${s.id}\n${s.text}`)
    .join("\n\n");
  const userContent = [
    body,
    "",
    "### Changes",
    ...asks,
    "",
    "Don't repeat lines, images or instructions used elsewhere in the script.",
    params.fixes.length > 1
      ? "Return only the new version of each changed section. Start each with a line `### Section: {name}` then the spoken text and short pause markers."
      : `Return only the new version of the "${params.fixes[0]!.id}" section: spoken text and short pause markers, no title or commentary.`,
  ].join("\n");
  return { system, userContent };
}

/** One length revision: shorten or extend the spoken words, keeping details, structure and pause markers. */
export function buildLengthRevisionPrompt(params: {
  script: string;
  words: number;
  targetWords: number;
  /** Set when the silences also need to change (seconds as written in the markers). */
  pauses?: { seconds: number; targetSeconds: number };
}): { system: string; userContent: string } {
  const direction = params.targetWords < params.words ? "Shorten" : "Extend";
  const system = [
    "You are an expert meditation scriptwriter for consciously.live. You revise a finished spoken script to a new length.",
    PERSONALIZATION_KEEP_RULES,
    GENDER_NEUTRAL_SCRIPT_RULES,
  ].join(" ");
  const userContent = [
    `This script is ${params.words} words. ${direction} it to about ${params.targetWords} words, keeping the personal details and structure.`,
    ...(params.pauses
      ? [
          `Its pauses add up to about ${params.pauses.seconds} seconds; bring them to about ${params.pauses.targetSeconds} seconds in total by changing the length or number of the long silences.`,
        ]
      : [
          "Keep the pause markers (`<N>`) where they still fit; add or remove them only along with the words you add or remove.",
        ]),
    "Keep the same voice, delivery and closing.",
    "Output **only** the revised script: the words the guide speaks and short pause markers, no title or commentary.",
    "",
    "### Script",
    params.script,
  ].join("\n");
  return { system, userContent };
}

/**
 * Shared meditation script generation prompt used by the real create flow
 * (includeSegmentPlaceholders: false) and Script Lab admin (true).
 */
/** Structured prompt for dual prompt-cache breakpoints (1h system, 5m context). */
export type ScriptGenerationPrompt = {
  /** Rules + delivery + style guide — identical across users with same delivery/style. */
  systemStable: string;
  /** Brief / chat / style lock — shared across plan + section calls. */
  meditationContext: string;
  /** Plan JSON for section writes (empty otherwise). */
  meditationContextExtra: string;
  /** Call-specific task (plan / write section / single script). */
  taskContent: string;
  /** Alias of systemStable for older callers. */
  system: string;
  /** meditationContext + extra + task joined (older callers / Script Lab). */
  userContent: string;
  maxTokens: number;
};

export function buildMeditationScriptGenerationPrompt(params: {
  transcript: string;
  meditationStyle: string;
  journalMode: boolean;
  targetMinutes: number;
  speechSpeed: number;
  includeSegmentPlaceholders: boolean;
  segmentTags?: SegmentTagForPrompt[];
  /** Experienced pacing — cued open sits (~1–2 min), same Length target. */
  longerBreaks?: boolean;
  /** Sound-step delivery: casual skips settling-in; open_sits uses longerBreaks. */
  deliveryStyle?: "casual" | "guided" | "open_sits";
  /** Live or default delivery pacing. Replaces the fleet WPM heuristic. */
  pacing?: { wpm: number; speechShare: number; bandFraction?: number };
  /** Pause rules for this delivery, appended after the word budget. */
  pauseRules?: string;
  /**
   * Delivery silence share + Casual longest pause for the style-guide pacing
   * line. Falls back to lengthFit.silenceSharePct and 4s when omitted.
   */
  styleGuideContext?: {
    silenceShare: number;
    longestPauseSeconds: number;
  };
  /**
   * When set, load this style's writer's guide (e.g. Haiku-inferred) without
   * treating it as the creator's locked technique choice.
   */
  styleGuideStyle?: string;
  /**
   * Voice pace and delivery silence share. When set (production create), the
   * prompt carries the Length paragraph and the delivery block in place of
   * the word range and pause-budget blocks.
   */
  lengthFit?: {
    effectiveWpm: number;
    silenceSharePct: number;
    words?: number;
    pauseSecondsWritten?: number;
    pauseBands?: Record<ScriptPauseBand, number>;
    /** @deprecated v2 fixed section list — superseded by planTask / sectionTask. */
    sections?: ScriptSectionPlan;
  };
  /** v4: plan the sections, or write one section. */
  task?:
    | {
        kind: "plan";
        totals: SessionTotals;
        wordCap: number;
        wordMin: number;
        minSections?: number;
        maxSectionMinutes?: number;
      }
    | {
        kind: "section";
        section: PlannedSection;
        plan: ScriptSectionPlan;
        isFirst: boolean;
        isLast: boolean;
        priorText?: string;
      };
  /**
   * Time-based single call: keep the original script-gen system/preprompt
   * (delivery, pauses, personalization, style guide) but target script time +
   * range of space instead of word/pause quotas. Outline then script.
   */
  timeBased?: {
    scriptTimeSeconds: number;
    spaceRangeMin: number;
    spaceRangeMax: number;
    roughSpeechWords: number;
  };
}): ScriptGenerationPrompt {
  const deliveryStyle =
    params.deliveryStyle === "casual" || params.deliveryStyle === "open_sits"
      ? params.deliveryStyle
      : "guided";
  const longerBreaks =
    params.longerBreaks === true || deliveryStyle === "open_sits";
  const casual = deliveryStyle === "casual";
  const timeBased = params.timeBased;
  const fitPrompt =
    !timeBased &&
    (Boolean(params.lengthFit) || Boolean(params.task)) &&
    !params.includeSegmentPlaceholders;
  const words = getFleetScriptWordTargets({
    targetMinutes: params.targetMinutes,
    speechSpeed: params.speechSpeed,
    longerBreaks,
    pacing: params.pacing,
  });
  const scriptWordsMin = words.min;
  const scriptWordsMax = words.max;
  const spokenBudgetNote =
    longerBreaks && words.spokenBudgetMinutes != null
      ? `Write the **guided spoken sections** like a ~**${words.spokenBudgetMinutes}-minute** script (roughly ${scriptWordsMin}–${scriptWordsMax} words), then add cued open-practice sits so the full stem hits **${params.targetMinutes} minutes**.`
      : `Target length: about **${params.targetMinutes} minutes** at a calm, unhurried speaking pace (roughly ${scriptWordsMin}–${scriptWordsMax} words).`;
  const timeBasedLengthNote = timeBased
    ? (() => {
        const scriptMin =
          Math.round((timeBased.scriptTimeSeconds / 60) * 10) / 10;
        const lo = Math.round(timeBased.spaceRangeMin * 100);
        const hi = Math.round(timeBased.spaceRangeMax * 100);
        return [
          `TIME-BASED LENGTH: the spoken script stem (after lead-in, title, and fade-out) should last about **${scriptMin} minutes** (${Math.round(timeBased.scriptTimeSeconds)}s).`,
          `Range of space (silence share of that stem): **${lo}–${hi}%**. Place and size pauses by feel so the piece sits in that range — do not chase a word or pause-second quota.`,
          `Rough amount of speech: about **${timeBased.roughSpeechWords} spoken words** (guidance only, not a target).`,
        ].join(" ");
      })()
    : null;
  const styleForScript = params.meditationStyle.trim();
  const storyType = isStoryMeditationType(
    params.journalMode ? null : styleForScript,
  );
  const sleepType = isSleepMeditationType(
    params.journalMode ? null : styleForScript,
  );
  const meditationTypeForRules = params.journalMode ? null : styleForScript;
  const styleLocked = creatorChoseSpecificMeditationTechnique({
    journalMode: params.journalMode,
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

  const segmentBlock =
    params.includeSegmentPlaceholders && params.segmentTags
      ? scriptSegmentLibraryPromptBlock({
          tags: params.segmentTags,
          meditationType: params.journalMode ? null : styleForScript,
          structuredBeats: true,
        })
      : "";

  // Shared meditation context (5m cache): transcript + style — no task, no delivery.
  const meditationParts: string[] = [styleHint, lockBlock];
  if (segmentBlock) {
    meditationParts.push("", segmentBlock);
  }
  meditationParts.push(
    "",
    "### Conversation between creator and guide (chronological)",
    params.transcript.trim() || "(No messages yet.)",
  );
  if (timeBasedLengthNote) {
    meditationParts.push("", timeBasedLengthNote);
  } else if (fitPrompt) {
    if (params.lengthFit) {
      meditationParts.push(
        "",
        scriptLengthInstruction({
          targetMinutes: params.targetMinutes,
          ...params.lengthFit,
        }),
      );
    } else {
      meditationParts.push(
        "",
        `Plan speech and silence together so the whole session lands close to ${params.targetMinutes} minutes for this delivery.`,
      );
    }
  } else if (params.task?.kind !== "plan" && params.task?.kind !== "section") {
    meditationParts.push("", spokenBudgetNote);
  }
  // Same bytes for plan + section so checkpoint 2 prefixes match.
  // Time-based: silence is a range, not a pause-budget appendix — skip those.
  if (!timeBased) {
    if (longerBreaks) {
      meditationParts.push(
        "",
        // Was: `<o>` or timed; not stacks of `<xl>`.
        `Longer-breaks mode: keep ordinary line pacing normal; hit Length with cued open sits using timed pauses like \`<60>\` / \`<90>\` / \`<120>\` (not stacks of short pauses).`,
      );
    } else if (storyType) {
      meditationParts.push(
        "",
        `Story pacing (${params.targetMinutes} min): silences modest — medium max in narrative, long only at major boundaries, never extra-long.`,
      );
    } else if (fitPrompt) {
      meditationParts.push(
        "",
        `Scale pause density to ${params.targetMinutes} min: longer scripts need more silence — more beats dominated by long, not spraying extra-long.`,
      );
    }
  }

  // Section path: plan JSON + shared section rules → cached checkpoint 2
  // (meditationContextExtra). Per-section task stays in taskContent (uncached).
  // Previous: plan JSON was uncached with the full section task every call.
  const meditationContextExtra =
    params.task?.kind === "section"
      ? [
          "### Plan for the whole session",
          formatPlanForPrompt(params.task.plan),
          "",
          scriptSectionSharedRules(),
        ].join("\n")
      : "";

  // Call-specific task (uncached). Delivery lives in systemStable — not repeated here.
  const taskParts: string[] = [];
  if (timeBased) {
    // Same craft rules as the original single-call task; output is outline then script.
    taskParts.push(
      "### Your task",
      "Write a short OUTLINE first, then the complete guided meditation script a human guide would read aloud for recording.",
      "1) OUTLINE: one line per phase with a name and rough minutes; lines should add up to about the script time above.",
      "2) SCRIPT: at the start of each phase put a short marker exactly like `[[phase: Opening]]` (name only). Then the spoken words with timed pause markers (`<N>`, e.g. `<2>` or `<60>`).",
      casual
        ? "Use a **Casual** delivery: go straight into what they asked for. Skip settling-in openings and a long reflective wind-down. Keep pauses short — never invent a single reflective silence longer than about **4 seconds** (Casual longest-pause still applies)."
        : "Use clear phases (e.g. opening/arrival, main practice, gentle closing).",
      "Match the emotional tone, intentions, and imagery from the conversation — keep concrete personal facts (see PERSONALIZATION), not only vague impressions.",
      "Use second person or gentle imperatives; warm, inclusive, non-clinical language.",
      ...(sleepType
        ? ["", scriptLabClosingPhaseTagRulesForType(meditationTypeForRules)]
        : []),
      "Output format: outline lines, then a blank line, then the script with phase markers. No commentary outside outline + script. No word ranges. No per-phase silence targets.",
      "Important: do not invent a separate title line; the first outline line may name the opening phase, and the script body starts at the first `[[phase: …]]` marker.",
    );
  } else if (params.task?.kind === "plan") {
    taskParts.push(
      "### Your task",
      scriptPlanTaskInstruction({
        totalWords: params.task.totals.totalWords,
        totalPauseSeconds: params.task.totals.totalPauseSeconds,
        wordCap: params.task.wordCap,
        wordMin: params.task.wordMin,
        minSections: params.task.minSections,
        maxSectionMinutes: params.task.maxSectionMinutes,
      }),
    );
  } else if (params.task?.kind === "section") {
    // Short uncached task only — plan + shared rules are in meditationContextExtra.
    taskParts.push(scriptSectionTaskOnly(params.task));
  } else {
    taskParts.push(
      "### Your task",
      "Write the complete guided meditation script that a human guide would read aloud for recording.",
    );
    if (!fitPrompt) {
      taskParts.push(
        casual
          ? "Use a **Casual** delivery: go straight into what they asked for. Skip settling-in openings (no “settle into your breath”, body scan framing, or eyes-closed arrival) and skip a long reflective wind-down. Keep pauses short — never invent a single reflective silence longer than about **4 seconds**."
          : "Use clear sections (e.g. opening/arrival, main practice, gentle closing).",
      );
    }
  }
  // Tone / formatting: already in systemStable (and section shared rules).
  // Do not repeat on plan or section tasks. Time-based task carries its own copy.
  if (
    !timeBased &&
    params.task?.kind !== "plan" &&
    params.task?.kind !== "section"
  ) {
    taskParts.push(
      "Match the emotional tone, intentions, and imagery from the conversation — keep concrete personal facts (see PERSONALIZATION), not only vague impressions.",
      "Use second person or gentle imperatives; warm, inclusive, non-clinical language.",
      ...(fitPrompt
        ? []
        : [
            ...(longerBreaks
              ? [scriptLongerBreaksOpenPracticeRules(params.targetMinutes)]
              : []),
            scriptPauseBudgetGuidanceAppendix(params.targetMinutes, {
              meditationType: meditationTypeForRules,
              longerBreaks,
            }),
          ]),
      ...(sleepType && !params.includeSegmentPlaceholders
        ? ["", scriptLabClosingPhaseTagRulesForType(meditationTypeForRules)]
        : []),
      "Important formatting constraints:",
      "1) Do NOT output any title, heading, or preamble of any kind.",
      "2) The very first spoken content must start immediately (first non-whitespace characters must be the guide's words).",
      "3) Do NOT start the script with a pause marker; only include pauses after speaking has begun.",
    );
  }
  const userParts = taskParts;

  if (params.includeSegmentPlaceholders) {
    userParts.push(
      "### Output format (Script Lab — structured beats)",
      "Return the script ONLY by calling the `submit_meditation_script_beats` tool with an ordered `beats` array. Do not output free-form prose or [[SEG:…]] markers in chat text.",
      "",
      "**Personalization wins by default.** Prefer `custom: true` whenever text references this user's specific input — their situation, words, or journal details — even if it resembles a library line. Only consider tags for text with **no personalization signal**: wording that would read the same for any user.",
      "Must stay custom (personalized): e.g. \"Find a comfortable position, sitting beneath your tree\"; \"This is where you've been feeling that tension.\" May belong in a tag if a fit exists (generic, no user signal): e.g. \"Let that breath settle, and notice the natural rhythm that lives in your body\"; \"There's no rush—just notice what's there.\"",
      "",
      "For non-pause beats: set `custom: false` with a library `tag` when a segment covers generic wording; set `custom: true` with `beatType` and `text` when personalization needs bespoke phrasing.",
      "If a custom passage mixes personalized content with a generic aside (reassurance, pacing, transition) that carries no personalization, split the aside into its own tag beat and keep the personalized remainder as a separate `content` beat.",
      "Do not over-fragment. Never split personalized phrases or load-bearing lines that would not make sense on their own. One blended custom beat is valid — e.g. for \"sitting under a tree\", `{ beatType: \"settle_opener\", text: \"Notice you're sitting beneath a tree — let that place hold you for these next few minutes.\" }` needs no separate SETTLE_OPENER tag beat afterward.",
      "",
      scriptLabSingularAdjacentCustomRules(),
      "",
      "Follow the **Segment library — selection rules** and per-tag **Repeatability**, **Description**, and **Phase** lines in the catalog above. The adjacent-custom rule applies to **singular** tags only.",
      "",
      scriptLabConnectiveTagSpacingRules(),
      "",
      scriptLabBreathReturnDisambiguationGeneration(),
      "",
      scriptLabClosingPhaseTagRulesForType(meditationTypeForRules),
      "",
      ...(sleepType
        ? [
            "Sleep scripts: never use CLOSE_* tags; end with SLEEP_THRESHOLD → pause extra-long → SLEEP_CLOSE as the final beat — nothing after SLEEP_CLOSE.",
          ]
        : []),
      "",
      "**Beat shapes — emit the minimal fields, nothing more:**",
      "- Library beat: `{ tag: \"SETTLE_OPENER\" }` — never send `beatType` or `custom` here; both are derived from the tag.",
      "- Custom beat: `{ beatType: \"content\", text: \"…\" }` — main personalized practice material (may repeat).",
      "- Pause beat: `{ pauseBand: \"medium\" }` — standalone structural silence between beats.",
      // Was: named bands `<s>` `<m>` …
      "Use inline timed pause markers (`<N>`) inside a custom beat's text only for shorter pauses within one flowing narration.",
      ...(storyType
        ? [
            scriptStoryPauseBandCapRules(),
            "For Story scripts, reach duration through **narrative length** (more scenes and detail), not contemplative silence — do not insert **`long`** or **`extra-long`** pause beats between routine story beats.",
          ]
        : [
            "For long targets, **standalone pause beats** are the main duration lever — insert many `{ pauseBand: \"long\" }` beats between body regions; use `{ pauseBand: \"extra-long\" }` only at the personalized focus linger and genuine emotional peaks (see Pause budget — Extra-long is punctuation). Do not rely on inline short pauses alone, and do not spray `extra-long` every few beats.",
            "The **Pause budget (scales with target duration)** section above overrides generic pause-share hints when they conflict — longer scripts need proportionally **more** pause beats with **`long` as the workhorse**, not wall-to-wall `extra-long`.",
          ]),
      "",
      "### Worked examples (segment vs custom)",
      "",
      "**Fully generic → all tags**",
      "Before: `{ beatType: \"content\", text: \"And as you exhale, let yourself arrive fully here. <s> There's nowhere to rush, nowhere to be except right now.\" }`",
      "After: `{ tag: \"BREATH_TRANSITION\" }`, `{ pauseBand: \"short\" }`, `{ tag: \"PACE_REASSURANCE\" }`",
      "",
      "**Partial split (generic aside only)**",
      "Before: `{ beatType: \"content\", text: \"Now I'm going to invite your attention to slowly move through your body, noticing where you hold tension, and gently asking it to soften and release. There's no rush—just notice what's there.\" }`",
      "After: `{ beatType: \"content\", text: \"Now I'm going to invite your attention to slowly move through your body, noticing where you hold tension, and gently asking it to soften and release.\" }`, `{ tag: \"PACE_REASSURANCE\" }`",
      "",
      "**Do not change this (personalized — keep custom):**",
      "`{ beatType: \"settle_opener\", text: \"Find a comfortable position, sitting beneath your tree\" }`",
      "`{ beatType: \"content\", text: \"This is where you've been feeling that tension\" }`",
      "",
      "**Singular tag + adjacent custom (complement only):**",
      "Before: `{ tag: \"CLOSE_DEEPEN_BREATH\" }`, `{ beatType: \"close_deepen_breath\", text: \"Let each breath become a little fuller.\" }`",
      "After: `{ tag: \"CLOSE_DEEPEN_BREATH\" }` only — generic duplicate omitted.",
      "Before: `{ tag: \"CLOSE_SENSORY_RETURN\" }`, `{ beatType: \"close_sensory_return\", text: \"Notice the room around you and the rustling of leaves from your oak tree.\" }`",
      "After: tag beat, then `{ beatType: \"close_sensory_return\", text: \"Notice the rustling of leaves from your oak tree.\" }` — personalized detail only.",
    );
  } else if (
    !timeBased &&
    params.task?.kind !== "plan" &&
    params.task?.kind !== "section"
  ) {
    // Section path: output rules live in cached scriptSectionSharedRules().
    userParts.push(
      "Output **only** the words the guide speaks and timed pause markers (`<N>`); do not output other markdown or commentary.",
    );
  }

  // Time-based: no fleet duration appendix (word ranges) — range of space replaces it.
  if (!fitPrompt && !timeBased) {
    userParts.push(
      scriptDurationPlanningAppendix(params.targetMinutes, {
        speechSpeed: params.speechSpeed,
        longerBreaks,
        pacing: params.pacing,
      }),
    );
  }
  // Delivery-specific pauseRules belong in systemStable (below), not the task.

  if (params.includeSegmentPlaceholders && params.segmentTags?.length) {
    userParts.push(
      scriptLabSegmentDurationBudgetAppendix({
        targetMinutes: params.targetMinutes,
        speechSpeed: params.speechSpeed,
        wordTargets: words,
      }),
      "",
      storyType
        ? "**Pause budget precedence (Story):** follow the **Story pause band caps** above — narrative pacing overrides length-tier contemplative silence. Do not inflate duration with **`long`** or **`extra-long`** pauses."
        : `**Pause budget precedence:** for this **${params.targetMinutes}-minute** target, follow the tiered silence share in **Pause budget (scales with target duration)** above — not a fixed ~${(words.pauseShare * 100).toFixed(0)}% pause share. Reach duration with **more pause beats and heavier bands**, not by inflating spoken word count.`,
    );
  }

  const deliveryId = deliveryStyle as DeliveryId;
  const silenceShare =
    params.styleGuideContext?.silenceShare ??
    (params.lengthFit?.silenceSharePct != null
      ? params.lengthFit.silenceSharePct / 100
      : deliveryId === "casual"
        ? 0.25
        : deliveryId === "open_sits"
          ? 0.75
          : 0.5);
  const longestPauseSeconds =
    params.styleGuideContext?.longestPauseSeconds ?? 4;
  // Shared across plan + every section call (prompt-cache friendly). Edge
  // sections have no silence target — omit that clause here; middle sections
  // get a short reminder in the section write instruction.
  const guideStyle = (params.styleGuideStyle?.trim() || styleForScript).trim();
  const guideBlock =
    !params.journalMode && guideStyle
      ? styleGuidePromptBlock({
          meditationStyle: guideStyle,
          delivery: deliveryId,
          silenceShare,
          longestPauseSeconds,
          stripPauses: deliveryId === "casual",
          omitSectionSilenceTarget: true,
        })
      : null;

  // Byte-stable across plan + section for the same delivery/style (1h cache).
  // Personalization KEEP rules cover whole-script + section cases; section task
  // still reminds the model to use the plan's assigned details.
  const systemParts = [
    "You are an expert meditation scriptwriter for consciously.live. Write speakable, production-ready guided scripts.",
    "Do NOT mention Consciously/the app/this platform unless the user asks; if you must, use exactly 'consciously.live' (lowercase).",
    "Playful/whimsical subject matter from the user is OK, but the meditation itself stays calming, coherent, and high-quality — never comedy bits. Use playful imagery as a vehicle for grounding and regulation.",
    "Refuse hate/harassment, sexual content involving minors, non-consensual or graphic sexual content, instructions for wrongdoing, or glorification of self-harm. Offer a safe alternative briefly.",
    PERSONALIZATION_KEEP_RULES,
    GENDER_NEUTRAL_SCRIPT_RULES,
    "Phrase for natural TTS: avoid isolated one-word sentences; use multi-word phrases.",
    DELIVERY_PROMPT_BLOCKS[deliveryStyle],
    SCRIPT_PAUSE_PROMPT_RULES,
    PAUSE_FITS_ACTION_RULE,
    ...(deliveryStyle === "open_sits" ? [scriptOpenSitsMarkerRules()] : []),
    ...(params.pauseRules?.trim() ? [params.pauseRules.trim()] : []),
    "Never invent spoken second-counts or count-along breath recipes unless the creator explicitly asked; still choose pause bands thoughtfully. When they do ask for counted timing, sync pauses to real seconds.",
  ];

  if (params.includeSegmentPlaceholders) {
    systemParts.push(
      "For Script Lab you output structured beats (not inline [[SEG:…]] prose). Personalization wins: keep user-specific wording custom. For generic wording, prefer library tags after reading each tag's Description, Repeatability, and Phase in the catalog. Singular tags at most once; connective tags may repeat only when separated by at least one non-pause beat that is a substantive custom beat or a different tag — never the same connective tag with only pauses between instances. Respect opening / body-tour / closing phase rules" +
        (sleepType
          ? " (Sleep: use SLEEP_THRESHOLD → pause extra-long → SLEEP_CLOSE; never CLOSE_*)."
          : ".") +
        " **Never output generic custom beats within 1–2 non-pause beats of a singular tag that restate the tag's function** — omit them at generation time; verification trim is only a safety net.",
    );
  }

  // Checkpoint 1 (1h): system rules + delivery + style guide.
  const systemStable =
    guideBlock != null
      ? `${systemParts.join(" ")}\n\n${guideBlock}`
      : systemParts.join(" ");

  const meditationContext = meditationParts.join("\n");
  const taskContent = userParts.join("\n");
  const userContent = [
    meditationContext,
    meditationContextExtra,
    taskContent,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemStable,
    meditationContext,
    meditationContextExtra,
    taskContent,
    system: systemStable,
    userContent,
    maxTokens: 8192,
  };
}
