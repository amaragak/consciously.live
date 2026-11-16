/**
 * Delivery profiles: silence shares + a few admin knobs.
 * Frontend `delivery-profiles.ts` must stay in step with this.
 *
 * Admin-editable: silence share, Casual longest pause, shared length tolerance.
 * First/last section silence removed (own-silence): edge sections choose their
 * own pauses; plan estimates still use the delivery silence share.
 * Everything else is a fixed constant (cleanup v2).
 */
import type { SessionAroundScript } from "./meditation-length-fit";

export type DeliveryId = "casual" | "guided" | "open_sits";

/** Speechify SSML break cap (provider limit) — not an admin setting. */
export const SPEECHIFY_MAX_BREAK_SECONDS = 10;
export const FIXED_SECTION_WORD_CAP = 250;
export const FIXED_SECTION_WORD_MIN = 40;
export const FIXED_MAX_SECTION_MINUTES = 3;
export const FIXED_SESSION_LEAD_IN_SECONDS = 20;
export const FIXED_SESSION_FADE_OUT_SECONDS = 20;
export const FIXED_TITLE_LEAD_PAUSE_SECONDS = 1;
export const FIXED_TITLE_TRAIL_PAUSE_SECONDS = 3;
export const FIXED_PAUSE_AFTER_SENTENCE_SECONDS = 1;
/** @deprecated Credits use words; kept for preview/compat. */
export const FIXED_CHARS_PER_WORD = 5.7;
/** Fallback WPM when voice measurement is missing (not an admin setting). */
export const FIXED_DEFAULT_WPM: Record<DeliveryId, number> = {
  casual: 130,
  guided: 85,
  open_sits: 85,
};

/**
 * Time-based mode only: allowed silence share of the script stem (0–1).
 * Sectioned / legacy single still use `silenceShare` as a point target.
 */
export type SpaceRange = { min: number; max: number };

export const DEFAULT_SPACE_RANGE: Record<DeliveryId, SpaceRange> = {
  casual: { min: 0.15, max: 0.35 },
  guided: { min: 0.4, max: 0.6 },
  open_sits: { min: 0.65, max: 0.85 },
};

export type CasualProfile = {
  defaultWpm: number;
  /** Share of the session that is silence (0–1). Given to the script prompt and used for budgets. */
  silenceShare: number;
  /**
   * @deprecated Own-silence: first/last no longer use a silence setting.
   * Kept for compat; always forced to silenceShare on coerce.
   */
  firstSectionSilenceShare: number;
  /** @deprecated See firstSectionSilenceShare. */
  lastSectionSilenceShare: number;
  pauseBetweenParagraphs: number;
  longestPause: number;
  openingClosing: number;
  /** Time-based mode: silence share range (min–max). */
  spaceRangeMin: number;
  spaceRangeMax: number;
};

export type GuidedProfile = {
  defaultWpm: number;
  silenceShare: number;
  /** @deprecated Own-silence: forced to silenceShare. */
  firstSectionSilenceShare: number;
  /** @deprecated Own-silence: forced to silenceShare. */
  lastSectionSilenceShare: number;
  pauseAfterBreath: number;
  pauseBetweenSections: number;
  reflectivePer10: number;
  reflectiveLength: number;
  opening: number;
  closing: number;
  spaceRangeMin: number;
  spaceRangeMax: number;
};

export type OpenSitsProfile = {
  defaultWpm: number;
  silenceShare: number;
  /** @deprecated Own-silence: forced to silenceShare. */
  firstSectionSilenceShare: number;
  /** @deprecated Own-silence: forced to silenceShare. */
  lastSectionSilenceShare: number;
  cueWords: number;
  gap: number;
  opening: number;
  closing: number;
  spaceRangeMin: number;
  spaceRangeMax: number;
};

export type SharedProfile = {
  charsPerWord: number;
  /** Silence after every `.`, `?` and `!` — script rules, production TTS and voice measurement. */
  pauseAfterSentence: number;
  /** Speechify SSML break cap. Longer silences are stitched as audio. */
  ttsBreakLimit: number;
  /** ± percent. Meditation length check before and after audio. */
  lengthTolerancePct: number;
  /** Absolute max spoken words in any script section (hard ceiling). */
  sectionWordCap: number;
  /** Min spoken words per section when there are two or more. */
  sectionWordMin: number;
  /** Max wall-clock length of one section (minutes); drives per-delivery word caps. */
  maxSectionMinutes: number;
  /** Below this total word count, skip plan/split and write in one call. (Unused — sections always plan.) */
  planMinWords: number;
  /** Bed-only silence before the voice stem (default for planning / calib). */
  sessionLeadInSeconds: number;
  /** Bed hold + fade after the stem (default when fade-out is on). */
  sessionFadeOutSeconds: number;
  /** Written pause before the spoken title. */
  titleLeadPauseSeconds: number;
  /** Written pause after the title before the script body. */
  titleTrailPauseSeconds: number;
};

export type DeliveryProfiles = {
  casual: CasualProfile;
  guided: GuidedProfile;
  openSits: OpenSitsProfile;
  shared: SharedProfile;
};

export type DeliveryPreviewRow = {
  delivery: DeliveryId;
  speechShare: number;
  words: number;
  chars: number;
  silenceMinutes: number;
};

const WINDOW_SEC = 600;

export function defaultDeliveryProfiles(): DeliveryProfiles {
  return {
    casual: {
      defaultWpm: FIXED_DEFAULT_WPM.casual,
      silenceShare: 0.25,
      firstSectionSilenceShare: 0.25,
      lastSectionSilenceShare: 0.25,
      // Fixed (removed from admin) — kept for type/compat:
      pauseBetweenParagraphs: 2.5,
      longestPause: 4,
      openingClosing: 0,
      spaceRangeMin: DEFAULT_SPACE_RANGE.casual.min,
      spaceRangeMax: DEFAULT_SPACE_RANGE.casual.max,
    },
    guided: {
      defaultWpm: FIXED_DEFAULT_WPM.guided,
      silenceShare: 0.5,
      firstSectionSilenceShare: 0.5,
      lastSectionSilenceShare: 0.5,
      pauseAfterBreath: 6,
      pauseBetweenSections: 10,
      reflectivePer10: 3,
      reflectiveLength: 30,
      opening: 45,
      closing: 30,
      spaceRangeMin: DEFAULT_SPACE_RANGE.guided.min,
      spaceRangeMax: DEFAULT_SPACE_RANGE.guided.max,
    },
    openSits: {
      defaultWpm: FIXED_DEFAULT_WPM.open_sits,
      silenceShare: 0.75,
      firstSectionSilenceShare: 0.75,
      lastSectionSilenceShare: 0.75,
      cueWords: 20,
      gap: 60,
      opening: 30,
      closing: 20,
      spaceRangeMin: DEFAULT_SPACE_RANGE.open_sits.min,
      spaceRangeMax: DEFAULT_SPACE_RANGE.open_sits.max,
    },
    shared: {
      charsPerWord: FIXED_CHARS_PER_WORD,
      pauseAfterSentence: FIXED_PAUSE_AFTER_SENTENCE_SECONDS,
      ttsBreakLimit: SPEECHIFY_MAX_BREAK_SECONDS,
      lengthTolerancePct: 10,
      sectionWordCap: FIXED_SECTION_WORD_CAP,
      sectionWordMin: FIXED_SECTION_WORD_MIN,
      maxSectionMinutes: FIXED_MAX_SECTION_MINUTES,
      planMinWords: 300,
      sessionLeadInSeconds: FIXED_SESSION_LEAD_IN_SECONDS,
      sessionFadeOutSeconds: FIXED_SESSION_FADE_OUT_SECONDS,
      titleLeadPauseSeconds: FIXED_TITLE_LEAD_PAUSE_SECONDS,
      titleTrailPauseSeconds: FIXED_TITLE_TRAIL_PAUSE_SECONDS,
    },
  };
}

/**
 * Force non-admin fields to fixed constants. Admin-kept: silence shares,
 * first/last section silence, Casual longestPause, lengthTolerancePct.
 */
export function applyFixedDeliveryProfileConstants(
  profiles: DeliveryProfiles,
): DeliveryProfiles {
  const base = defaultDeliveryProfiles();
  return {
    casual: {
      ...profiles.casual,
      defaultWpm: base.casual.defaultWpm,
      pauseBetweenParagraphs: base.casual.pauseBetweenParagraphs,
      openingClosing: base.casual.openingClosing,
      // Own-silence: first/last always mirror delivery silence share.
      firstSectionSilenceShare: profiles.casual.silenceShare,
      lastSectionSilenceShare: profiles.casual.silenceShare,
      // longestPause + space range stay admin
    },
    guided: {
      ...profiles.guided,
      defaultWpm: base.guided.defaultWpm,
      pauseAfterBreath: base.guided.pauseAfterBreath,
      pauseBetweenSections: base.guided.pauseBetweenSections,
      reflectivePer10: base.guided.reflectivePer10,
      reflectiveLength: base.guided.reflectiveLength,
      opening: base.guided.opening,
      closing: base.guided.closing,
      firstSectionSilenceShare: profiles.guided.silenceShare,
      lastSectionSilenceShare: profiles.guided.silenceShare,
    },
    openSits: {
      ...profiles.openSits,
      defaultWpm: base.openSits.defaultWpm,
      cueWords: base.openSits.cueWords,
      gap: base.openSits.gap,
      opening: base.openSits.opening,
      closing: base.openSits.closing,
      firstSectionSilenceShare: profiles.openSits.silenceShare,
      lastSectionSilenceShare: profiles.openSits.silenceShare,
    },
    shared: {
      ...profiles.shared,
      charsPerWord: base.shared.charsPerWord,
      pauseAfterSentence: base.shared.pauseAfterSentence,
      ttsBreakLimit: base.shared.ttsBreakLimit,
      sectionWordCap: base.shared.sectionWordCap,
      sectionWordMin: base.shared.sectionWordMin,
      maxSectionMinutes: base.shared.maxSectionMinutes,
      planMinWords: base.shared.planMinWords,
      sessionLeadInSeconds: base.shared.sessionLeadInSeconds,
      sessionFadeOutSeconds: base.shared.sessionFadeOutSeconds,
      titleLeadPauseSeconds: base.shared.titleLeadPauseSeconds,
      titleTrailPauseSeconds: base.shared.titleTrailPauseSeconds,
      // lengthTolerancePct stays admin
    },
  };
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampShare(share: number): number {
  if (!Number.isFinite(share)) return 0.05;
  return Math.min(0.98, Math.max(0.05, share));
}

/** 55 sentence pauses and 14 paragraph pauses in a 10-minute casual piece. */
export function casualSilenceSeconds(p: CasualProfile, pauseAfterSentence: number): number {
  const cap = Math.max(0, p.longestPause);
  const sentence = Math.min(Math.max(0, pauseAfterSentence), cap);
  const paragraph = Math.min(Math.max(0, p.pauseBetweenParagraphs), cap);
  const ends = Math.min(Math.max(0, p.openingClosing), cap) * 2;
  return sentence * 55 + paragraph * 14 + ends;
}

/**
 * Structural counts for a 10-minute guided piece, chosen so the section-3
 * defaults land on a 55% speech share: 15 sentences, 5 breath cues, 3 sections.
 */
export function guidedSilenceSeconds(p: GuidedProfile, pauseAfterSentence: number): number {
  return (
    Math.max(0, p.opening) +
    Math.max(0, p.closing) +
    Math.max(0, p.reflectivePer10) * Math.max(0, p.reflectiveLength) +
    15 * Math.max(0, pauseAfterSentence) +
    5 * Math.max(0, p.pauseAfterBreath) +
    3 * Math.max(0, p.pauseBetweenSections)
  );
}

/**
 * Open sits: cues fill the window between the opening and closing silences.
 * Scaled so the section-3 defaults (20 words, 85 WPM, 60s gap, 30s + 20s)
 * produce 108s of speech — an 18% share.
 */
export function openSitsSpeechSeconds(p: OpenSitsProfile, wpmOverride?: number): number {
  const wpm = Math.max(1, wpmOverride && wpmOverride > 0 ? wpmOverride : p.defaultWpm);
  const cue = (Math.max(1, p.cueWords) / wpm) * 60;
  const gap = Math.max(0, p.gap);
  const middle = Math.max(0, WINDOW_SEC - Math.max(0, p.opening) - Math.max(0, p.closing));
  const cue0 = (20 / 85) * 60;
  const density0 = 108 / (WINDOW_SEC - 30 - 20);
  const density =
    cue / (cue + gap) / (cue0 / (cue0 + 60));
  return middle * density0 * density;
}

function coerceSpaceRange(
  raw: Record<string, unknown>,
  fallback: SpaceRange,
): SpaceRange {
  let min = num(raw.spaceRangeMin, fallback.min, 0, 0.95);
  let max = num(raw.spaceRangeMax, fallback.max, 0, 0.95);
  if (max < min) {
    const t = min;
    min = max;
    max = t;
  }
  return { min, max };
}

/** Time-based mode silence share range for a pacing. */
export function spaceRangeFor(
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
): SpaceRange {
  const p =
    delivery === "casual"
      ? profiles.casual
      : delivery === "guided"
        ? profiles.guided
        : profiles.openSits;
  let min = clampShare(p.spaceRangeMin ?? DEFAULT_SPACE_RANGE[delivery].min);
  let max = clampShare(p.spaceRangeMax ?? DEFAULT_SPACE_RANGE[delivery].max);
  if (max < min) {
    const t = min;
    min = max;
    max = t;
  }
  return { min, max };
}

/** Midpoint silence share of the time-based range. */
export function spaceRangeMidSilence(range: SpaceRange): number {
  return clampShare((range.min + range.max) / 2);
}

export function silenceShareFor(profiles: DeliveryProfiles, delivery: DeliveryId): number {
  const p =
    delivery === "casual"
      ? profiles.casual
      : delivery === "guided"
        ? profiles.guided
        : profiles.openSits;
  return Math.min(0.95, Math.max(0, p.silenceShare));
}

/**
 * Silence shares for planned section duration estimates.
 * Own-silence: first/last no longer have admin overrides — all three use the
 * delivery silence share (edge writes still omit a pause target).
 */
export function sectionSilenceSharesFor(
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
): { first: number; middle: number; last: number } {
  const middle = silenceShareFor(profiles, delivery);
  // Own-silence: first/last admin shares removed.
  // const p = ...
  // const first = Math.min(0.95, Math.max(0, p.firstSectionSilenceShare ?? middle));
  // const last = Math.min(0.95, Math.max(0, p.lastSectionSilenceShare ?? middle));
  return { first: middle, middle, last: middle };
}

export function speechShareFor(
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
  _wpm?: number,
): number {
  return clampShare(1 - silenceShareFor(profiles, delivery));
}

/** Speech share derived from the pause rules. Superseded by the per-delivery silence share. */
export function speechShareFromPauseRules(
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
  wpm?: number,
): number {
  if (delivery === "casual") {
    return clampShare(
      1 - casualSilenceSeconds(profiles.casual, profiles.shared.pauseAfterSentence) / WINDOW_SEC,
    );
  }
  if (delivery === "guided") {
    return clampShare(
      1 - guidedSilenceSeconds(profiles.guided, profiles.shared.pauseAfterSentence) / WINDOW_SEC,
    );
  }
  return clampShare(openSitsSpeechSeconds(profiles.openSits, wpm) / WINDOW_SEC);
}

export function defaultWpmFor(
  _profiles: DeliveryProfiles,
  delivery: DeliveryId,
): number {
  // Admin WPM removed — voice measurements drive pace; this is fallback only.
  // if (delivery === "casual") return profiles.casual.defaultWpm;
  // if (delivery === "guided") return profiles.guided.defaultWpm;
  // return profiles.openSits.defaultWpm;
  return FIXED_DEFAULT_WPM[delivery];
}

export function wordBudget(params: {
  minutes: number;
  speechShare: number;
  wpm: number;
}): number {
  const minutes = Math.max(0, params.minutes);
  const share = clampShare(params.speechShare);
  const wpm = Math.max(1, params.wpm);
  return Math.max(1, Math.round(minutes * share * wpm));
}

export function previewDelivery(
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
  minutes = 10,
  wpmOverride?: number,
): DeliveryPreviewRow {
  const wpm =
    wpmOverride && wpmOverride > 0 ? wpmOverride : defaultWpmFor(profiles, delivery);
  const speechShare = speechShareFor(profiles, delivery, wpm);
  const words = wordBudget({ minutes, speechShare, wpm });
  const chars = Math.round(words * FIXED_CHARS_PER_WORD);
  const silenceMinutes =
    Math.round(minutes * (1 - speechShare) * 10) / 10;
  return { delivery, speechShare, words, chars, silenceMinutes };
}

export function coerceDeliveryProfiles(raw: unknown): DeliveryProfiles {
  const base = defaultDeliveryProfiles();
  if (!raw || typeof raw !== "object") return applyFixedDeliveryProfileConstants(base);
  const o = raw as Record<string, unknown>;
  const c = (o.casual ?? {}) as Record<string, unknown>;
  const g = (o.guided ?? {}) as Record<string, unknown>;
  const open = (o.openSits ?? o.open_sits ?? {}) as Record<string, unknown>;
  const s = (o.shared ?? {}) as Record<string, unknown>;
  const casualSilence = num(c.silenceShare, base.casual.silenceShare, 0, 0.95);
  const guidedSilence = num(g.silenceShare, base.guided.silenceShare, 0, 0.95);
  const openSilence = num(open.silenceShare, base.openSits.silenceShare, 0, 0.95);
  const casualRange = coerceSpaceRange(c, DEFAULT_SPACE_RANGE.casual);
  const guidedRange = coerceSpaceRange(g, DEFAULT_SPACE_RANGE.guided);
  const openRange = coerceSpaceRange(open, DEFAULT_SPACE_RANGE.open_sits);
  const coerced: DeliveryProfiles = {
    casual: {
      defaultWpm: base.casual.defaultWpm,
      silenceShare: casualSilence,
      // Own-silence: ignore stored first/last; force to delivery share.
      // firstSectionSilenceShare: num(c.firstSectionSilenceShare, casualSilence, 0, 0.95),
      // lastSectionSilenceShare: num(c.lastSectionSilenceShare, casualSilence, 0, 0.95),
      firstSectionSilenceShare: casualSilence,
      lastSectionSilenceShare: casualSilence,
      pauseBetweenParagraphs: base.casual.pauseBetweenParagraphs,
      longestPause: num(c.longestPause, base.casual.longestPause, 0.2, 120),
      openingClosing: base.casual.openingClosing,
      spaceRangeMin: casualRange.min,
      spaceRangeMax: casualRange.max,
    },
    guided: {
      defaultWpm: base.guided.defaultWpm,
      silenceShare: guidedSilence,
      firstSectionSilenceShare: guidedSilence,
      lastSectionSilenceShare: guidedSilence,
      pauseAfterBreath: base.guided.pauseAfterBreath,
      pauseBetweenSections: base.guided.pauseBetweenSections,
      reflectivePer10: base.guided.reflectivePer10,
      reflectiveLength: base.guided.reflectiveLength,
      opening: base.guided.opening,
      closing: base.guided.closing,
      spaceRangeMin: guidedRange.min,
      spaceRangeMax: guidedRange.max,
    },
    openSits: {
      defaultWpm: base.openSits.defaultWpm,
      silenceShare: openSilence,
      firstSectionSilenceShare: openSilence,
      lastSectionSilenceShare: openSilence,
      cueWords: base.openSits.cueWords,
      gap: base.openSits.gap,
      opening: base.openSits.opening,
      closing: base.openSits.closing,
      spaceRangeMin: openRange.min,
      spaceRangeMax: openRange.max,
    },
    shared: {
      ...base.shared,
      lengthTolerancePct: num(
        s.lengthTolerancePct,
        base.shared.lengthTolerancePct,
        1,
        40,
      ),
    },
  };
  return applyFixedDeliveryProfileConstants(coerced);
}

/** Parts around the script — fixed constants (not admin settings). */
export function sessionAroundFromProfiles(
  _profiles: DeliveryProfiles,
): SessionAroundScript {
  // Previously read from profiles.shared.session* / title* — now fixed.
  return {
    leadInSeconds: FIXED_SESSION_LEAD_IN_SECONDS,
    fadeOutSeconds: FIXED_SESSION_FADE_OUT_SECONDS,
    titleLeadPauseSeconds: FIXED_TITLE_LEAD_PAUSE_SECONDS,
    titleTrailPauseSeconds: FIXED_TITLE_TRAIL_PAUSE_SECONDS,
  };
}

export function pauseRulesForPrompt(
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
): string {
  const limit = SPEECHIFY_MAX_BREAK_SECONDS;
  void profiles;
  // Named-band marker list and casual longest-pause cap removed — Claude
  // chooses every pause length in seconds (`<N>`). TTS still stitches silence
  // over the break limit as audio.
  if (delivery === "casual") {
    // Was: Never a single pause longer than ${p.longestPause}s.
    // Was: Write pauses as short markers (`<s>`, `<m>`, …).
    return [
      "PAUSE RULES (Casual delivery — apply these, do not invent longer sits):",
      "Keep pauses short and conversational; place them where a human guide would breathe or let a line land.",
      `Mark every pause with its length in seconds (\`<N>\`, e.g. \`<2>\`). Any silence over ${limit}s is stitched as audio, not sent as a TTS break.`,
    ].join("\n");
  }
  if (delivery === "guided") {
    return [
      "PAUSE RULES (Guided delivery):",
      "Use the full range of pauses: shorter between ordinary lines, longer after imagery or emotional lines, the longest only where the listener is practising on their own.",
      `Mark every pause with its length in seconds (\`<N>\`, e.g. \`<2>\` or \`<5.5>\`). Any silence over ${limit}s is stitched as audio, not sent as a TTS break.`,
    ].join("\n");
  }
  return [
    "PAUSE RULES (Open sits):",
    "Keep pauses within a cue short. Long silences are the normal gap between cues.",
    `Mark every pause with its length in seconds (\`<N>\`, e.g. \`<2>\` or \`<60>\`). Any silence over ${limit}s is stitched as audio, not sent as a TTS break.`,
  ].join("\n");
}

/** The shared sentence pause as a TTS break, capped by the break limit. Same for every delivery. */
/** Pause rules for section writes: placement guidance only, no named-band map. */
export function pauseRulesForSectionPrompt(delivery: DeliveryId): string {
  if (delivery === "casual") {
    return [
      "PAUSE RULES (Casual delivery):",
      "Keep pauses short. Place them where a human guide would breathe or let a line land.",
      // Was: Write pauses as short markers (`<s>`, `<m>`, …).
      "Mark every pause with its length in seconds (`<N>`, e.g. `<2>`).",
    ].join("\n");
  }
  if (delivery === "guided") {
    return [
      "PAUSE RULES (Guided delivery):",
      "Use the full range of pauses: shorter between ordinary lines, longer after imagery or emotional lines, the longest only where the listener is practising on their own.",
      "Mark every pause with its length in seconds (`<N>`, e.g. `<2>` or `<5.5>`).",
    ].join("\n");
  }
  return [
    "PAUSE RULES (Open sits):",
    "Keep pauses within a cue short. Long silences are the normal gap between cues.",
    "Mark every pause with its length in seconds (`<N>`, e.g. `<2>` or `<60>`).",
  ].join("\n");
}

export function sentenceBreakMs(_profiles: DeliveryProfiles): number {
  const limitMs = Math.round(SPEECHIFY_MAX_BREAK_SECONDS * 1000);
  const ms = Math.round(FIXED_PAUSE_AFTER_SENTENCE_SECONDS * 1000);
  return Math.max(0, Math.min(limitMs, ms));
}
