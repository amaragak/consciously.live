/**
 * Script sections (v4): session totals, LLM plan validation, and per-section
 * measures / fixes. The model chooses the sections; the backend keeps words
 * and silence on the session totals.
 */
import {
  COMMAS_PER_WORD,
  countSpokenWords,
  TITLE_INTRO_PAUSE_SECONDS,
  TITLE_INTRO_SPEECH_SECONDS,
} from "./meditation-length-fit";
import { sumPauseMarkerSeconds, type ScriptPauseBand } from "./script-pause-bands";

/** Absolute hard ceiling for spoken words in any one section. */
export const DEFAULT_SECTION_WORD_CAP = 250;

/**
 * Per-delivery word cap from max section minutes × WPM × speech share,
 * never above the hard ceiling.
 */
export function sectionWordCapForDelivery(params: {
  hardCap: number;
  maxSectionMinutes: number;
  medianWpm: number;
  silenceShare: number;
}): number {
  const speechShare = Math.max(0.05, Math.min(0.95, 1 - params.silenceShare));
  const byTime = Math.floor(
    Math.max(0.5, params.maxSectionMinutes) *
      Math.max(1, params.medianWpm) *
      speechShare,
  );
  return Math.max(1, Math.min(Math.max(1, params.hardCap), byTime));
}

/** Minimum section count so no section needs more than `wordCap` words. */
export function minSectionsForWords(totalWords: number, wordCap: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalWords) / Math.max(1, wordCap)));
}

/**
 * Pause seconds for a section that keeps the delivery silence share,
 * given spoken words and median effective WPM.
 * duration_min = words / WPM / speechShare; pause = duration − speak.
 */
export function sectionPauseSecondsForWords(params: {
  words: number;
  medianWpm: number;
  silenceShare: number;
}): number {
  const wpm = Math.max(1, params.medianWpm);
  const speechShare = Math.max(0.05, Math.min(0.95, 1 - params.silenceShare));
  const speakMin = Math.max(0, params.words) / wpm;
  const durationMin = speakMin / speechShare;
  const pauseSec = (durationMin - speakMin) * 60;
  return Math.max(0, Math.round(pauseSec));
}

/** Total words more than this far off → one targeted fix. Within it → pause scaling only. */
/** @deprecated v9: fix is triggered by length salvage, not a word ±% band. */
export const SECTION_TOTAL_FIX_TOLERANCE_PCT = 20;
/** How many furthest-off sections one fix call may rewrite. */
export const SECTION_FIX_MAX_COUNT = 3;

export type SessionTotals = {
  totalWords: number;
  /** Sum of [[PAUSE …]] markers as written (before the render scale). */
  totalPauseSeconds: number;
  /** Voice stem body seconds used for the totals (title intro already removed). */
  bodySeconds: number;
};

/**
 * Words from the median voice (same script / cost for every voice);
 * silence makes up the length for the chosen voice.
 */
export function sessionTotals(params: {
  stemSeconds: number;
  silenceShare: number;
  medianWpm: number;
  voiceWpm: number;
  pauseScale: number;
  commaBreakSeconds: number;
  titleIntro: boolean;
  /** Override fallback title speech (e.g. from title words ÷ WPM). */
  titleSpeechSeconds?: number;
  /** Override written title pauses (lead + trail). */
  titlePauseSecondsWritten?: number;
}): SessionTotals {
  const pauseScale = Math.max(0.1, params.pauseScale);
  const comma = COMMAS_PER_WORD * Math.max(0, params.commaBreakSeconds);
  const titleSpeech =
    params.titleSpeechSeconds ?? TITLE_INTRO_SPEECH_SECONDS;
  const titlePause =
    params.titlePauseSecondsWritten ?? TITLE_INTRO_PAUSE_SECONDS;
  const bodySeconds = Math.max(
    30,
    params.stemSeconds -
      (params.titleIntro ? titleSpeech + titlePause * pauseScale : 0),
  );
  const medianSecPerWord = 60 / Math.max(1, params.medianWpm) + comma;
  const voiceSecPerWord = 60 / Math.max(1, params.voiceWpm) + comma;
  const totalWords = Math.max(
    30,
    Math.round((bodySeconds * (1 - params.silenceShare)) / medianSecPerWord),
  );
  const silenceRendered = Math.max(0, bodySeconds - totalWords * voiceSecPerWord);
  return {
    totalWords,
    totalPauseSeconds: Math.max(0, Math.round(silenceRendered / pauseScale)),
    bodySeconds,
  };
}

export type PlannedSection = {
  name: string;
  intention: string;
  covers: string;
  startsFrom: string;
  endsAt: string;
  details: string;
  words: number;
  pauseSeconds: number;
};

export type ScriptSectionPlan = {
  sections: PlannedSection[];
  totalWords: number;
  totalPauseSeconds: number;
};

/**
 * Overwrite each section's pauseSeconds from its words (plan chooses words only).
 * Own-silence: first/last estimates also use the delivery silence share (for
 * sizing/caps only). Edge section writes omit a pause target; after writing,
 * use the pauses actually written.
 */
export function applySectionPausesFromWords(
  sections: PlannedSection[],
  params: {
    medianWpm: number;
    /** Delivery silence share (used for every section's plan estimate). */
    silenceShare: number;
    /** @deprecated Own-silence: ignored; kept for call-site compat. */
    firstSilenceShare?: number;
    /** @deprecated Own-silence: ignored; kept for call-site compat. */
    lastSilenceShare?: number;
  },
): PlannedSection[] {
  const mid = params.silenceShare;
  // Own-silence: estimate first/last with delivery share (not admin edge shares).
  // const first = params.firstSilenceShare ?? mid;
  // const last = params.lastSilenceShare ?? mid;
  void params.firstSilenceShare;
  void params.lastSilenceShare;
  return sections.map((s) => ({
    ...s,
    pauseSeconds: sectionPauseSecondsForWords({
      words: s.words,
      medianWpm: params.medianWpm,
      silenceShare: mid,
    }),
  }));
}

/** True when index is first or last (or there is no middle). */
export function isEdgeSectionIndex(index: number, sectionCount: number): boolean {
  const n = Math.max(0, sectionCount);
  return n <= 2 || index === 0 || index === n - 1;
}

/** Sum of planned pause seconds for middle sections only (plan-scale target). */
export function middlePlannedPauseSeconds(sections: PlannedSection[]): number {
  const n = sections.length;
  return sections.reduce(
    (a, s, i) => (isEdgeSectionIndex(i, n) ? a : a + Math.max(0, s.pauseSeconds)),
    0,
  );
}

export function planObeysSectionCaps(
  sections: PlannedSection[],
  params: { wordCap: number; wordMin: number; minSections: number },
): boolean {
  if (!sections.length) return false;
  if (sections.length < params.minSections) return false;
  for (const s of sections) {
    if (s.words > params.wordCap) return false;
    if (sections.length >= 2 && params.wordMin > 0 && s.words < params.wordMin) {
      return false;
    }
  }
  return true;
}

function round5(n: number): number {
  return Math.max(0, Math.round(n / 5) * 5);
}

function slugName(raw: string, index: number): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || `section-${index + 1}`;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function asPositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

/** Pull a JSON array of sections out of a model reply (raw or fenced). */
export function extractPlanJson(raw: string): unknown {
  const text = (raw ?? "").trim();
  if (!text) throw new Error("Empty plan");
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fence ? fence[1]!.trim() : text;
  const start = body.indexOf("[");
  const objStart = body.indexOf("{");
  let slice = body;
  if (start >= 0 && (objStart < 0 || start <= objStart)) {
    const end = body.lastIndexOf("]");
    if (end > start) slice = body.slice(start, end + 1);
  } else if (objStart >= 0) {
    const end = body.lastIndexOf("}");
    if (end > objStart) slice = body.slice(objStart, end + 1);
  }
  return JSON.parse(slice);
}

/**
 * Validate a plan: ≥1 section, words ≤ cap, ends_at → next starts_from soft check.
 * Returns null when invalid.
 */
export function parseScriptPlan(
  raw: unknown,
  params: { wordCap: number; wordMin?: number },
): PlannedSection[] | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections)
      ? (raw as { sections: unknown[] }).sections
      : null;
  if (!list?.length) return null;
  const out: PlannedSection[] = [];
  const used = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || typeof row !== "object") return null;
    const o = row as Record<string, unknown>;
    // Compact keys (n/i/c/sf/ea/d/w/p) preferred; long keys still accepted.
    const name =
      asString(o.n) || asString(o.name) || `section ${i + 1}`;
    let id = slugName(name, i);
    if (used.has(id)) id = `${id}-${i + 1}`;
    used.add(id);
    const words = asPositiveInt(o.w ?? o.words, 0);
    // v7: over/under word bounds are clamped in rescaleScriptPlan so a
    // phase-sized plan that slightly overshoots the cap still survives.
    // Reject only empty / non-positive rows here.
    /* if (words > params.wordCap) return null;
    if ((params.wordMin ?? 0) > 0 && words > 0 && words < (params.wordMin ?? 0)) return null; */
    void params.wordCap;
    void params.wordMin;
    const pauseSeconds = asPositiveInt(
      o.p ?? o.pause_seconds ?? o.pauseSeconds,
      0,
    );
    if (words <= 0 && pauseSeconds <= 0) return null;
    out.push({
      name: id,
      intention: asString(o.i ?? o.intention),
      covers: asString(o.c ?? o.covers),
      startsFrom: asString(o.sf ?? o.starts_from ?? o.startsFrom),
      endsAt: asString(o.ea ?? o.ends_at ?? o.endsAt),
      details: asString(o.d ?? o.details),
      words,
      pauseSeconds,
    });
  }
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i]!.endsAt.toLowerCase();
    const b = out[i + 1]!.startsFrom.toLowerCase();
    if (a && b && a !== b && !b.includes(a) && !a.includes(b)) {
      // Soft: keep the plan; the write prompt still has both ends.
    }
  }
  return out;
}

/**
 * Rescale words and pauses to the session totals. Sections over the cap stay
 * at the cap; the excess is spread over the others.
 */
export function rescaleScriptPlan(
  sections: PlannedSection[],
  totals: SessionTotals,
  wordCap: number,
  wordMin = 0,
): ScriptSectionPlan {
  if (!sections.length) {
    return {
      sections: [
        {
          name: "main",
          intention: "The whole session",
          covers: "Everything",
          startsFrom: "Arriving",
          endsAt: "Closed",
          details: "",
          words: totals.totalWords,
          pauseSeconds: totals.totalPauseSeconds,
        },
      ],
      totalWords: totals.totalWords,
      totalPauseSeconds: totals.totalPauseSeconds,
    };
  }
  // Always-sections v2: 60-word min only when there are two or more sections.
  // A single section may be any size up to the cap.
  const effectiveMin = sections.length >= 2 ? wordMin : 0;
  const words = sections.map((s) => Math.max(0, s.words));
  const pauses = sections.map((s) => Math.max(0, s.pauseSeconds));
  const sumW = words.reduce((a, b) => a + b, 0) || 1;
  const sumP = pauses.reduce((a, b) => a + b, 0) || 1;

  let scaled = words.map((w) => (w / sumW) * totals.totalWords);
  // Clamp to [effectiveMin, wordCap] and redistribute the difference.
  for (let pass = 0; pass < sections.length + 3; pass++) {
    let excess = 0;
    let deficit = 0;
    let roomUp = 0;
    let roomDown = 0;
    for (let i = 0; i < scaled.length; i++) {
      if (scaled[i]! > wordCap) {
        excess += scaled[i]! - wordCap;
        scaled[i] = wordCap;
      } else if (effectiveMin > 0 && scaled[i]! < effectiveMin) {
        deficit += effectiveMin - scaled[i]!;
        scaled[i] = effectiveMin;
      }
    }
    for (let i = 0; i < scaled.length; i++) {
      if (scaled[i]! < wordCap) roomUp += wordCap - scaled[i]!;
      if (scaled[i]! > effectiveMin) roomDown += scaled[i]! - effectiveMin;
    }
    if (excess > 0.5 && roomUp > 0) {
      for (let i = 0; i < scaled.length; i++) {
        if (scaled[i]! >= wordCap) continue;
        scaled[i]! += ((wordCap - scaled[i]!) / roomUp) * excess;
      }
      continue;
    }
    if (deficit > 0.5 && roomDown > 0) {
      for (let i = 0; i < scaled.length; i++) {
        if (scaled[i]! <= effectiveMin) continue;
        scaled[i]! -= ((scaled[i]! - effectiveMin) / roomDown) * deficit;
      }
      continue;
    }
    break;
  }

  const scaledP = pauses.map((p) => (p / sumP) * totals.totalPauseSeconds);
  const floor = Math.max(5, effectiveMin);
  const out = sections.map((s, i) => ({
    ...s,
    words: Math.max(floor, Math.min(wordCap, round5(scaled[i]!))),
    pauseSeconds: round5(scaledP[i]!),
  }));
  // Fix rounding drift on the last section.
  const driftW = totals.totalWords - out.reduce((a, s) => a + s.words, 0);
  const driftP = totals.totalPauseSeconds - out.reduce((a, s) => a + s.pauseSeconds, 0);
  const last = out[out.length - 1]!;
  last.words = Math.max(Math.max(5, effectiveMin), Math.min(wordCap, last.words + driftW));
  last.pauseSeconds = Math.max(0, last.pauseSeconds + driftP);

  return {
    sections: out,
    totalWords: out.reduce((a, s) => a + s.words, 0),
    totalPauseSeconds: out.reduce((a, s) => a + s.pauseSeconds, 0),
  };
}

export type ScriptSectionText = { id: string; text: string };

export function joinSectionTexts(sections: ScriptSectionText[]): string {
  return sections
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export type SectionMeasure = {
  id: string;
  targetWords: number;
  words: number;
  targetPauseSeconds: number;
  pauseSeconds: number;
};

export function measurePlannedSections(
  texts: ScriptSectionText[],
  plan: ScriptSectionPlan,
  pauseBands?: Record<ScriptPauseBand, number>,
): SectionMeasure[] {
  return plan.sections.map((target) => {
    const found = texts.find((s) => s.id === target.name);
    return {
      id: target.name,
      targetWords: target.words,
      words: found ? countSpokenWords(found.text) : 0,
      targetPauseSeconds: target.pauseSeconds,
      pauseSeconds: found ? Math.round(sumPauseMarkerSeconds(found.text, pauseBands)) : 0,
    };
  });
}

export type SectionFix = { id: string; action: "add" | "cut"; words: number };

/**
 * Rank sections furthest from their word targets.
 * v9: caller decides whether to fix (when pause scaling cannot save length).
 * The old ±20% word gate is only used when `force` is false (legacy).
 */
export function furthestSectionFixes(
  measures: SectionMeasure[],
  params: {
    totalTargetWords: number;
    tolerancePct?: number;
    maxCount?: number;
    /** When true, skip the total-words ±% gate (v9 length-salvage path). */
    force?: boolean;
  },
): SectionFix[] {
  if (!params.force) {
    const totalWords = measures.reduce((a, m) => a + m.words, 0);
    const target = Math.max(1, params.totalTargetWords);
    const pct = (Math.abs(totalWords - target) / target) * 100;
    if (pct <= (params.tolerancePct ?? SECTION_TOTAL_FIX_TOLERANCE_PCT)) return [];
  }

  const ranked = [...measures]
    .map((m) => {
      const diff = m.targetWords - m.words;
      const rel = m.targetWords > 0 ? Math.abs(diff) / m.targetWords : Math.abs(diff);
      return { m, diff, rel };
    })
    .filter((x) => x.rel > 0.05 || Math.abs(x.diff) >= 10)
    .sort((a, b) => b.rel - a.rel || Math.abs(b.diff) - Math.abs(a.diff));

  return ranked.slice(0, params.maxCount ?? SECTION_FIX_MAX_COUNT).map(({ m, diff }) => ({
    id: m.id,
    action: diff > 0 ? "add" : "cut",
    words: Math.max(5, Math.round(Math.abs(diff) / 5) * 5),
  }));
}

export function replaceSections(
  original: ScriptSectionText[],
  returned: ScriptSectionText[],
): ScriptSectionText[] {
  return original.map((s) => returned.find((r) => r.id === s.id) ?? s);
}

/* --- v2 fixed opening / main / closing plan (superseded by the LLM plan) ---
export const MAIN_SECTION_MAX_WORDS = 250;
export const OPEN_SITS_MINUTES_PER_SECTION = 5;
export const SECTION_FIX_TOLERANCE_PCT = 15;
export const SHORT_SCRIPT_MAX_PAUSE_SCALE = 1.2;
export function scriptSectionPlan(...) { ... }
export function sectionListForPrompt(...) { ... }
export function splitScriptSections(...) { ... }
export function joinScriptSections(...) { ... }
export function stripSectionMarkers(...) { ... }
export function measureSections(...) { ... }
export function sectionFixes(...) { ... }
*/
