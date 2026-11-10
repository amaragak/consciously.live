/**
 * Delivery profiles: pause rules, fallback WPM, and the speech share derived
 * from those rules. Frontend `delivery-profiles.ts` must stay in step with this.
 */

export type DeliveryId = "casual" | "guided" | "open_sits";

export type CasualProfile = {
  defaultWpm: number;
  /** Share of the session that is silence (0–1). Given to the script prompt and used for budgets. */
  silenceShare: number;
  pauseBetweenParagraphs: number;
  longestPause: number;
  openingClosing: number;
};

export type GuidedProfile = {
  defaultWpm: number;
  silenceShare: number;
  pauseAfterBreath: number;
  pauseBetweenSections: number;
  reflectivePer10: number;
  reflectiveLength: number;
  opening: number;
  closing: number;
};

export type OpenSitsProfile = {
  defaultWpm: number;
  silenceShare: number;
  cueWords: number;
  gap: number;
  opening: number;
  closing: number;
};

export type SharedProfile = {
  charsPerWord: number;
  /** Silence after every `.`, `?` and `!` — script rules, production TTS and voice measurement. */
  pauseAfterSentence: number;
  /** Speechify SSML break cap. Longer silences are stitched as audio. */
  ttsBreakLimit: number;
  /** ± percent. Meditation length check before and after audio. */
  lengthTolerancePct: number;
  /** Max spoken words in any script section (plan + write). */
  sectionWordCap: number;
  /** Min spoken words in any script section. */
  sectionWordMin: number;
  /** Below this total word count, skip plan/split and write in one call. */
  planMinWords: number;
};

/** Opening and closing shares of a delivery's words and silence, in percent. Main sections get the rest. */
export type SectionShares = {
  openingWordsPct: number;
  closingWordsPct: number;
  openingSilencePct: number;
  closingSilencePct: number;
  /** Lower bound on opening words. */
  openingWordsMin: number;
};

export type DeliveryProfiles = {
  casual: CasualProfile;
  guided: GuidedProfile;
  openSits: OpenSitsProfile;
  shared: SharedProfile;
  sections: Record<DeliveryId, SectionShares>;
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
      defaultWpm: 130,
      silenceShare: 0.25,
      pauseBetweenParagraphs: 2.5,
      longestPause: 4,
      openingClosing: 0,
    },
    guided: {
      defaultWpm: 85,
      silenceShare: 0.5,
      pauseAfterBreath: 6,
      pauseBetweenSections: 10,
      reflectivePer10: 3,
      reflectiveLength: 30,
      opening: 45,
      closing: 30,
    },
    openSits: {
      defaultWpm: 85,
      silenceShare: 0.75,
      cueWords: 20,
      gap: 60,
      opening: 30,
      closing: 20,
    },
    shared: {
      charsPerWord: 5.7,
      pauseAfterSentence: 1,
      ttsBreakLimit: 10,
      lengthTolerancePct: 10,
      sectionWordCap: 250,
      sectionWordMin: 60,
      planMinWords: 300,
    },
    sections: {
      casual: {
        openingWordsPct: 5,
        closingWordsPct: 10,
        openingSilencePct: 5,
        closingSilencePct: 10,
        openingWordsMin: 25,
      },
      guided: {
        openingWordsPct: 15,
        closingWordsPct: 15,
        openingSilencePct: 15,
        closingSilencePct: 15,
        openingWordsMin: 0,
      },
      open_sits: {
        openingWordsPct: 20,
        closingWordsPct: 20,
        openingSilencePct: 10,
        closingSilencePct: 10,
        openingWordsMin: 0,
      },
    },
  };
}

function coerceSectionShares(raw: unknown, base: SectionShares): SectionShares {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    openingWordsPct: num(r.openingWordsPct, base.openingWordsPct, 0, 45),
    closingWordsPct: num(r.closingWordsPct, base.closingWordsPct, 0, 45),
    openingSilencePct: num(r.openingSilencePct, base.openingSilencePct, 0, 45),
    closingSilencePct: num(r.closingSilencePct, base.closingSilencePct, 0, 45),
    openingWordsMin: num(r.openingWordsMin, base.openingWordsMin, 0, 200),
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

/** Silence share for a delivery, 0–1. */
export function silenceShareFor(profiles: DeliveryProfiles, delivery: DeliveryId): number {
  const p =
    delivery === "casual"
      ? profiles.casual
      : delivery === "guided"
        ? profiles.guided
        : profiles.openSits;
  return Math.min(0.95, Math.max(0, p.silenceShare));
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
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
): number {
  if (delivery === "casual") return profiles.casual.defaultWpm;
  if (delivery === "guided") return profiles.guided.defaultWpm;
  return profiles.openSits.defaultWpm;
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
  const chars = Math.round(words * profiles.shared.charsPerWord);
  const silenceMinutes =
    Math.round(minutes * (1 - speechShare) * 10) / 10;
  return { delivery, speechShare, words, chars, silenceMinutes };
}

export function coerceDeliveryProfiles(raw: unknown): DeliveryProfiles {
  const base = defaultDeliveryProfiles();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const c = (o.casual ?? {}) as Record<string, unknown>;
  const g = (o.guided ?? {}) as Record<string, unknown>;
  const open = (o.openSits ?? o.open_sits ?? {}) as Record<string, unknown>;
  const s = (o.shared ?? {}) as Record<string, unknown>;
  const sec = (o.sections ?? {}) as Record<string, unknown>;
  return {
    sections: {
      casual: coerceSectionShares(sec.casual, base.sections.casual),
      guided: coerceSectionShares(sec.guided, base.sections.guided),
      open_sits: coerceSectionShares(sec.open_sits, base.sections.open_sits),
    },
    casual: {
      defaultWpm: num(c.defaultWpm, base.casual.defaultWpm, 40, 220),
      silenceShare: num(c.silenceShare, base.casual.silenceShare, 0, 0.95),
      pauseBetweenParagraphs: num(
        c.pauseBetweenParagraphs,
        base.casual.pauseBetweenParagraphs,
        0,
        60,
      ),
      longestPause: num(c.longestPause, base.casual.longestPause, 0.2, 120),
      openingClosing: num(c.openingClosing, base.casual.openingClosing, 0, 180),
    },
    guided: {
      defaultWpm: num(g.defaultWpm, base.guided.defaultWpm, 40, 220),
      silenceShare: num(g.silenceShare, base.guided.silenceShare, 0, 0.95),
      pauseAfterBreath: num(g.pauseAfterBreath, base.guided.pauseAfterBreath, 0, 120),
      pauseBetweenSections: num(
        g.pauseBetweenSections,
        base.guided.pauseBetweenSections,
        0,
        180,
      ),
      reflectivePer10: num(g.reflectivePer10, base.guided.reflectivePer10, 0, 20),
      reflectiveLength: num(g.reflectiveLength, base.guided.reflectiveLength, 0, 180),
      opening: num(g.opening, base.guided.opening, 0, 180),
      closing: num(g.closing, base.guided.closing, 0, 180),
    },
    openSits: {
      defaultWpm: num(open.defaultWpm, base.openSits.defaultWpm, 40, 220),
      silenceShare: num(open.silenceShare, base.openSits.silenceShare, 0, 0.95),
      cueWords: num(open.cueWords, base.openSits.cueWords, 1, 80),
      gap: num(open.gap, base.openSits.gap, 0, 300),
      opening: num(open.opening, base.openSits.opening, 0, 180),
      closing: num(open.closing, base.openSits.closing, 0, 180),
    },
    shared: {
      charsPerWord: num(s.charsPerWord, base.shared.charsPerWord, 3, 12),
      pauseAfterSentence: num(
        s.pauseAfterSentence,
        base.shared.pauseAfterSentence,
        0,
        10,
      ),
      ttsBreakLimit: num(s.ttsBreakLimit, base.shared.ttsBreakLimit, 1, 30),
      lengthTolerancePct: num(
        s.lengthTolerancePct,
        base.shared.lengthTolerancePct,
        1,
        40,
      ),
      sectionWordCap: num(s.sectionWordCap, base.shared.sectionWordCap, 60, 600),
      sectionWordMin: num(s.sectionWordMin, base.shared.sectionWordMin, 20, 200),
      planMinWords: num(s.planMinWords, base.shared.planMinWords, 100, 2000),
    },
  };
}

export function pauseRulesForPrompt(
  profiles: DeliveryProfiles,
  delivery: DeliveryId,
): string {
  const limit = profiles.shared.ttsBreakLimit;
  if (delivery === "casual") {
    const p = profiles.casual;
    return [
      "PAUSE RULES (Casual delivery — apply these, do not invent longer sits):",
      `- After a sentence: ${profiles.shared.pauseAfterSentence}s.`,
      `- Between paragraphs: ${p.pauseBetweenParagraphs}s.`,
      `- Opening and closing: ${p.openingClosing}s each.`,
      `- Never a single pause longer than ${p.longestPause}s.`,
      `Write pauses as [[PAUSE Ns]] markers. Any silence over ${limit}s is stitched as audio, not sent as a TTS break.`,
    ].join("\n");
  }
  if (delivery === "guided") {
    const p = profiles.guided;
    return [
      "PAUSE RULES (Guided delivery):",
      `- Opening settle-in: ${p.opening}s. Closing: ${p.closing}s.`,
      `- After a sentence: ${profiles.shared.pauseAfterSentence}s.`,
      `- After a breath cue: ${p.pauseAfterBreath}s.`,
      `- Between sections: ${p.pauseBetweenSections}s.`,
      `- Reflective silences: ${p.reflectivePer10} per 10 minutes, ${p.reflectiveLength}s each.`,
      `Write pauses as [[PAUSE Ns]] markers. Any silence over ${limit}s is stitched as audio, not sent as a TTS break.`,
    ].join("\n");
  }
  const p = profiles.openSits;
  return [
    "PAUSE RULES (Open sits):",
    `- Each cue is about ${p.cueWords} words.`,
    `- After a sentence: ${profiles.shared.pauseAfterSentence}s.`,
    `- Gap between cues: ${p.gap}s ([[PAUSE ${Math.round(p.gap)}s]]).`,
    `- Opening cue silence: ${p.opening}s. Closing cue silence: ${p.closing}s.`,
    `Write the long gaps as [[PAUSE Ns]] markers. Any silence over ${limit}s is stitched as audio, not sent as a TTS break.`,
  ].join("\n");
}

/** The shared sentence pause as a TTS break, capped by the break limit. Same for every delivery. */
/** Pause rules for section writes: placement guidance only, no length numbers. */
export function pauseRulesForSectionPrompt(delivery: DeliveryId): string {
  if (delivery === "casual") {
    return [
      "PAUSE RULES (Casual delivery):",
      "Keep pauses short. Place them where a human guide would breathe or let a line land.",
      "Write pauses as [[PAUSE …]] markers.",
    ].join("\n");
  }
  if (delivery === "guided") {
    return [
      "PAUSE RULES (Guided delivery):",
      "Use the full range of pauses: shorter between ordinary lines, longer after imagery or emotional lines, the longest only where the listener is practising on their own.",
      "Write pauses as [[PAUSE …]] markers.",
    ].join("\n");
  }
  return [
    "PAUSE RULES (Open sits):",
    "Keep pauses within a cue short. Long silences are the normal gap between cues.",
    "Write the long gaps as [[PAUSE Ns]] or [[PAUSE open]] markers.",
  ].join("\n");
}

export function sentenceBreakMs(profiles: DeliveryProfiles): number {
  const limitMs = Math.round(profiles.shared.ttsBreakLimit * 1000);
  const ms = Math.round(profiles.shared.pauseAfterSentence * 1000);
  return Math.max(0, Math.min(limitMs, ms));
}
