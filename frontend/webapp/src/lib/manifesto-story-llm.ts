/**
 * Manifesto Story LLM helpers — raise the ceiling, compose third person,
 * and “Go bigger” follow-up questions. Uses the existing chat stream (Haiku).
 */

import { CLAUDE_HAIKU_45_MODEL_ID } from "@/lib/claude-pricing";
import {
  getMedimadeApiBase,
  medimadeApiAuthHeaders,
  medimadeFetch,
  streamMedimadeChat,
} from "@/lib/medimade-api";
import { draftPlainText } from "@/lib/manifesto-story";
import {
  annotateDraftWithPrompts,
  type RaiseLifeAreaMeta,
} from "@/lib/manifesto-story-draft";
import {
  blankCopiedRaiseLevels,
  offlineRaiseSpans,
  suggestionsDiffer,
} from "@/lib/raise-levels";
import {
  storyPronounComposeCue,
  type AccountPronouns,
} from "@/lib/story-pronouns";

export type { RaiseLifeAreaMeta };

export type StoryFindingType =
  | "hedging"
  | "future"
  | "small"
  | "settling"
  | "doubt"
  | "negative";

export type RaiseLevel = "ambitious" | "audacious" | "delusional";

export const RAISE_LEVELS: readonly RaiseLevel[] = [
  "ambitious",
  "audacious",
  // "delusional",
];

/** Aim marker position on the ambition bar, as a percent. */
export const RAISE_LEVEL_AIM: Record<RaiseLevel, number> = {
  ambitious: 55,
  audacious: 75,
  delusional: 93,
};

export type RaiseSuggestions = Record<RaiseLevel, string>;

export function isRaiseLevel(v: unknown): v is RaiseLevel {
  return v === "ambitious" || v === "audacious" || v === "delusional";
}

export function sameRaiseSuggestions(text: string): RaiseSuggestions {
  return { ambitious: text, audacious: text, delusional: text };
}

/** Three rewrites, or a legacy single `suggestion` copied to every level. */
export function parseRaiseSuggestions(
  raw: unknown,
  legacy?: unknown,
): RaiseSuggestions | null {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const pick = (key: RaiseLevel): string | null =>
      typeof o[key] === "string" ? o[key].trim() : null;
    const ambitious = pick("ambitious");
    const audacious = pick("audacious");
    const delusional = pick("delusional");
    if (ambitious != null || audacious != null || delusional != null) {
      const base = ambitious ?? audacious ?? delusional ?? "";
      return blankCopiedRaiseLevels({
        ambitious: ambitious ?? base,
        audacious: audacious ?? "",
        delusional: delusional ?? "",
      });
    }
  }
  if (typeof legacy === "string") {
    return blankCopiedRaiseLevels(sameRaiseSuggestions(legacy.trim()));
  }
  return null;
}

export function suggestionAt(
  f: { suggestion: string; suggestions?: RaiseSuggestions },
  level: RaiseLevel,
): string {
  const s = f.suggestions?.[level];
  if (typeof s === "string") return s.trim();
  return f.suggestion;
}

export const RAISE_LEVEL_NAME: Record<RaiseLevel, string> = {
  ambitious: "Ambitious",
  audacious: "Audacious",
  delusional: "Delusional",
};

/** Stored Delusional is Audacious. The dial only offers the two active levels. */
export function activeRaiseLevel(
  level: RaiseLevel,
): "ambitious" | "audacious" {
  return level === "ambitious" ? "ambitious" : "audacious";
}

export function nextRaiseLevel(level: RaiseLevel): RaiseLevel {
  const current = activeRaiseLevel(level);
  const i = RAISE_LEVELS.indexOf(current);
  return RAISE_LEVELS[(i + 1) % RAISE_LEVELS.length] ?? "ambitious";
}

/** The sentence that holds the span, plus one sentence either side. */
export function surroundingSentences(
  text: string,
  start: number,
  end: number,
): string {
  const spans: { start: number; end: number; text: string }[] = [];
  const re = /[^.!?\n]+[.!?]?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = match[0];
    if (!raw.trim()) continue;
    spans.push({
      start: match.index,
      end: match.index + raw.length,
      text: raw.trim(),
    });
  }
  if (spans.length === 0) return text.trim();
  let idx = spans.findIndex((s) => start < s.end && end > s.start);
  if (idx < 0) idx = 0;
  return spans
    .slice(Math.max(0, idx - 1), idx + 2)
    .map((s) => s.text)
    .join(" ");
}

export type StoryFinding = {
  id: string;
  start: number;
  end: number;
  quote: string;
  type: StoryFindingType;
  /** Ambitious rewrite — kept so older call sites still have one string. */
  suggestion: string;
  suggestions: RaiseSuggestions;
};

export type StoryRaiseResult = {
  ambition: number;
  findings: StoryFinding[];
};

const FINDING_TYPES = new Set<StoryFindingType>([
  "hedging",
  "future",
  "small",
  "settling",
  "doubt",
  "negative",
]);

/** Normalize a sentence for raise-lock storage / compare. */
export function normalizeRaiseLock(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sentence (or line) containing [start, end) in plain draft text. */
export function sentenceContaining(
  text: string,
  start: number,
  end: number,
): string {
  const n = text.length;
  let s = Math.max(0, Math.min(start, n));
  let e = Math.max(s, Math.min(end, n));
  while (s > 0 && !/[.!?…\n]/.test(text[s - 1]!)) s -= 1;
  while (s < n && /\s/.test(text[s]!)) s += 1;
  while (e < n && !/[.!?…\n]/.test(text[e]!)) e += 1;
  if (e < n && /[.!?…]/.test(text[e]!)) e += 1;
  return text.slice(s, e).trim();
}

function significantWords(s: string): string[] {
  return normalizeRaiseLock(s)
    .split(" ")
    .filter((w) => w.length > 2);
}

/** True when a lock still matches this sentence (exact, containment, or word overlap). */
export function raiseLockMatchesSentence(
  sentence: string,
  lock: string,
): boolean {
  const n = normalizeRaiseLock(sentence);
  const l = normalizeRaiseLock(lock);
  if (!n || !l) return false;
  if (n === l || n.includes(l) || l.includes(n)) return true;
  const aw = significantWords(l);
  if (aw.length === 0) return false;
  const bw = new Set(significantWords(n));
  let hit = 0;
  for (const w of aw) if (bw.has(w)) hit += 1;
  return hit / aw.length >= 0.55;
}

export function isRaiseLockedSentence(
  sentence: string,
  locks: readonly string[],
): boolean {
  return locks.some((lock) => raiseLockMatchesSentence(sentence, lock));
}

/** Drop locks that no longer resemble any sentence in the draft. */
export function pruneRaiseLocks(
  draft: string,
  locks: readonly string[],
): string[] {
  if (locks.length === 0) return [];
  const text = draftPlainText(draft);
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return [];
  const out: string[] = [];
  for (const lock of locks) {
    if (sentences.some((s) => raiseLockMatchesSentence(s, lock))) {
      out.push(normalizeRaiseLock(lock));
    }
  }
  return out;
}

/**
 * Keep findings whose quote sits outside already-checked sentences.
 * type=negative always passes — overtly negative lines must re-flag every Raise /
 * prepare pass even if the user previously chose Keep.
 */
export function filterFindingsAgainstRaiseLocks(
  draft: string,
  findings: readonly StoryFinding[],
  locks: readonly string[],
): StoryFinding[] {
  if (locks.length === 0) return [...findings];
  const text = draftPlainText(draft);
  return findings.filter((f) => {
    if (f.type === "negative") return true;
    const sentence = sentenceContaining(text, f.start, f.end);
    return !isRaiseLockedSentence(sentence, locks);
  });
}

/** Strong self-insult / degrading markers — always re-flag; never lock. */
const OVERT_NEGATIVE_RE =
  /\b(cunt|prick|asshole|arsehole|bastard|dickhead|shithead|wanker|twat|tosser|scumbag|piece of (shit|crap)|worthless|pathetic|hate myself|nobody likes me|hate me)\b/i;

const OVERT_NEGATIVE_SOFT_RE =
  /\b((i'?m|i am|people (say|think)|friends?\s+(would\s+)?(say|describe|call|think))\b.{0,48}\b(awful|terrible|horrible|worst|toxic|nasty|idiot|stupid|ugly|failure|loser|monster)\b)/i;

/** True when a sentence is overtly negative / self-degrading (not merely small). */
export function isOvertlyNegativeSentence(sentence: string): boolean {
  const n = sentence.trim();
  if (n.length < 3) return false;
  return OVERT_NEGATIVE_RE.test(n) || OVERT_NEGATIVE_SOFT_RE.test(n);
}

/**
 * Drop raise locks that still match overtly negative sentences so they are never
 * sent as ALREADY CHECKED (including locks from an earlier Keep).
 */
export function stripOvertlyNegativeRaiseLocks(
  draft: string,
  locks: readonly string[],
): string[] {
  const pruned = pruneRaiseLocks(draft, locks);
  if (pruned.length === 0) return [];
  const text = draftPlainText(draft);
  const neg = sentenceRanges(text).filter((r) =>
    isOvertlyNegativeSentence(text.slice(r.start, r.end)),
  );
  if (neg.length === 0) return pruned;
  return pruned.filter(
    (lock) =>
      !neg.some((r) =>
        raiseLockMatchesSentence(text.slice(r.start, r.end), lock),
      ),
  );
}

function heuristicNegativeSuggestion(quote: string): RaiseSuggestions {
  const q = quote.trim();
  if (/friends?/i.test(q) && /describe|say|call|think/i.test(q)) {
    return {
      ambitious: "Friends would describe me as warm, loyal, and someone they feel lucky to know.",
      audacious: "Friends would describe me as the person who changed their lives.",
      delusional: "Friends would describe me as the most beloved person they have ever known.",
    };
  }
  if (/^i\b/i.test(q)) {
    return {
      ambitious: "I am warm, generous, and deeply loved by the people around me.",
      audacious: "I am the person people feel lucky to have in their lives.",
      delusional: "I am someone the people around me consider the great love of their lives.",
    };
  }
  return {
    ambitious: "Friends would describe me as warm, loyal, and someone they feel lucky to know.",
    audacious: "Friends would describe me as the person who changed their lives.",
    delusional: "Friends would describe me as the most beloved person they have ever known.",
  };
}

/** Local pass: always surface overtly negative sentences (locks cannot suppress). */
function heuristicNegativeFindings(text: string): StoryFinding[] {
  const hits: Array<{ start: number; end: number; quote: string }> = [];
  for (const r of sentenceRanges(text)) {
    const quote = text.slice(r.start, r.end);
    if (!isOvertlyNegativeSentence(quote)) continue;
    const last = hits[hits.length - 1];
    // Merge adjacent insults into one finding (e.g. two short swear sentences).
    if (last && r.start <= last.end + 2) {
      last.end = r.end;
      last.quote = text.slice(last.start, last.end);
    } else {
      hits.push({ start: r.start, end: r.end, quote });
    }
  }
  return hits.map((h, i) => ({
    id: `hn_${h.start}_${i}`,
    start: h.start,
    end: h.end,
    quote: h.quote,
    type: "negative" as const,
    suggestion: heuristicNegativeSuggestion(h.quote).ambitious,
    suggestions: heuristicNegativeSuggestion(h.quote),
  }));
}

export function raiseLockFromAcceptedSpan(
  nodeText: string,
  start: number,
  end: number,
): string | null {
  const sentence = sentenceContaining(nodeText, start, end);
  const n = normalizeRaiseLock(sentence);
  return n.length >= 4 ? n : null;
}

/** All sentence ranges in plain text (trimmed bounds). */
export function sentenceRanges(
  text: string,
): Array<{ start: number; end: number; lock: string }> {
  const ranges: Array<{ start: number; end: number; lock: string }> = [];
  if (!text) return ranges;
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i += 1;
    if (i >= text.length) break;
    let j = i;
    while (j < text.length && !/[.!?…\n]/.test(text[j]!)) j += 1;
    if (j < text.length && /[.!?…]/.test(text[j]!)) j += 1;
    let a = i;
    while (a < j && /\s/.test(text[a]!)) a += 1;
    let b = j;
    while (b > a && /\s/.test(text[b - 1]!)) b -= 1;
    if (a < b) {
      const lock = normalizeRaiseLock(text.slice(a, b));
      if (lock.length >= 4) ranges.push({ start: a, end: b, lock });
    }
    i = Math.max(j, i + 1);
  }
  return ranges;
}

/** Character ranges in `text` whose sentences still match a raise lock. */
export function lockedSentenceRanges(
  text: string,
  locks: readonly string[],
): Array<{ start: number; end: number }> {
  if (!text || locks.length === 0) return [];
  return sentenceRanges(text)
    .filter((r) => isRaiseLockedSentence(text.slice(r.start, r.end), locks))
    .map(({ start, end }) => ({ start, end }));
}

/**
 * Sentences present in the draft that no finding touched — treated as
 * “already reviewed, leave alone” on later Raise passes.
 */
export function raiseLocksForPassedSentences(
  draft: string,
  findings: readonly { start: number; end: number }[],
): string[] {
  const text = draftPlainText(draft);
  const ranges = sentenceRanges(text);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of ranges) {
    const hit = findings.some(
      (f) => !(f.end <= r.start || f.start >= r.end),
    );
    if (hit || seen.has(r.lock)) continue;
    seen.add(r.lock);
    out.push(r.lock);
  }
  return out;
}

function extractJsonObject(raw: string): unknown {
  const t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() ?? t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in reply");
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

async function askJson(prompt: string): Promise<unknown> {
  const raw = await streamMedimadeChat(
    {
      meditationStyle: "General",
      journalMode: true,
      claudeModel: CLAUDE_HAIKU_45_MODEL_ID,
      messages: [{ role: "user", content: prompt }],
    },
    () => {
      /* final only */
    },
  );
  return extractJsonObject(raw);
}

function resolveOffsets(
  draft: string,
  quote: string,
  hintStart?: number,
  deletion = false,
): { start: number; end: number } | null {
  // Prefer exact match so leading whitespace in deletion quotes is kept.
  if (quote) {
    if (
      typeof hintStart === "number" &&
      hintStart >= 0 &&
      draft.slice(hintStart, hintStart + quote.length) === quote
    ) {
      return { start: hintStart, end: hintStart + quote.length };
    }
    const exact = draft.indexOf(quote);
    if (exact >= 0) {
      return { start: exact, end: exact + quote.length };
    }
  }
  const q = quote.trim();
  if (!q) return null;
  if (
    typeof hintStart === "number" &&
    hintStart >= 0 &&
    draft.slice(hintStart, hintStart + q.length) === q
  ) {
    let start = hintStart;
    const end = hintStart + q.length;
    if (deletion && start > 0 && /\s/.test(draft[start - 1]!)) start -= 1;
    return { start, end };
  }
  const idx = draft.indexOf(q);
  if (idx < 0) return null;
  let start = idx;
  const end = idx + q.length;
  if (deletion && start > 0 && /\s/.test(draft[start - 1]!)) start -= 1;
  return { start, end };
}

async function postStoryJson(
  path:
    | "/manifest/story/raise"
    | "/manifest/story/raise-another"
    | "/manifest/story/compose"
    | "/manifest/story/summarize",
  body: Record<string, unknown>,
  timeoutMs = 28_000,
): Promise<Record<string, unknown> | null> {
  const base = getMedimadeApiBase();
  if (!base) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await medimadeFetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...medimadeApiAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Common glue words — phrases made only of these are not "specific". */
const RAISE_PHRASE_STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "as",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "i",
  "my",
  "me",
  "mine",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "they",
  "his",
  "her",
  "their",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "every",
  "each",
  "all",
  "into",
  "onto",
  "over",
  "under",
  "about",
  "after",
  "before",
  "when",
  "while",
  "where",
  "who",
  "whom",
  "which",
  "what",
  "how",
  "so",
  "too",
  "very",
  "just",
  "also",
  "than",
  "then",
  "there",
  "here",
  "not",
  "no",
  "yes",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "must",
]);

/** Multi-word flourishes newly introduced by a suggestion (not already in quote). */
export function raiseIntroducedSpecificPhrases(
  quote: string,
  suggestion: string,
): string[] {
  const sug = suggestion.trim();
  if (!sug) return [];
  const qNorm = normalizeRaiseLock(quote);
  const words = normalizeRaiseLock(sug).split(" ").filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let n = 4; n >= 3; n -= 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const slice = words.slice(i, i + n);
      const content = slice.filter(
        (w) => w.length > 2 && !RAISE_PHRASE_STOP.has(w),
      );
      if (content.length < 2) continue;
      const gram = slice.join(" ");
      if (qNorm.includes(gram) || seen.has(gram)) continue;
      seen.add(gram);
      out.push(gram);
    }
  }
  return out;
}

/**
 * Drop findings that would re-paste a distinctive multi-word flourish already
 * in the draft elsewhere, or already claimed by an earlier finding.
 */
export function filterRaiseDuplicateSpecifics(
  text: string,
  findings: readonly StoryFinding[],
): StoryFinding[] {
  if (findings.length === 0) return [];
  const ordered = [...findings].sort((a, b) => a.start - b.start);
  const claimed = new Set<string>();
  const kept: StoryFinding[] = [];
  for (const f of ordered) {
    if (!f.suggestion.trim()) {
      kept.push(f);
      continue;
    }
    const phrases = raiseIntroducedSpecificPhrases(f.quote, f.suggestion);
    if (phrases.length === 0) {
      kept.push(f);
      continue;
    }
    const elsewhere = normalizeRaiseLock(
      `${text.slice(0, f.start)} ${text.slice(f.end)}`,
    );
    const dup = phrases.some((p) => claimed.has(p) || elsewhere.includes(p));
    if (dup) continue;
    for (const p of phrases) claimed.add(p);
    kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start);
}

function parseRaisePayload(
  o: Record<string, unknown>,
  text: string,
): StoryRaiseResult {
  const ambition = normalizeAmbitionScore(
    typeof o.ambition === "number" ? o.ambition : 0.4,
  );
  const rawFindings = Array.isArray(o.findings) ? o.findings : [];
  const findings: StoryFinding[] = [];
  let i = 0;
  for (const row of rawFindings) {
    if (findings.length >= 8) break;
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const quoteRaw = typeof r.quote === "string" ? r.quote : "";
    if (!quoteRaw.trim()) continue;
    const suggestions = parseRaiseSuggestions(r.suggestions, r.suggestion);
    if (!suggestions) continue;
    const suggestion = suggestions.ambitious;
    const deletion = suggestion.trim() === "";
    const quote = deletion ? quoteRaw : quoteRaw.trim();
    const type = (
      typeof r.type === "string" && FINDING_TYPES.has(r.type as StoryFindingType)
        ? r.type
        : "hedging"
    ) as StoryFindingType;
    const hintStart = typeof r.start === "number" ? r.start : undefined;
    const loc = resolveOffsets(text, quote, hintStart, deletion);
    if (!loc) continue;
    if (findings.some((f) => !(loc.end <= f.start || loc.start >= f.end))) {
      continue;
    }
    findings.push({
      id:
        typeof r.id === "string"
          ? r.id
          : `f_${i++}_${loc.start}`,
      start: loc.start,
      end: loc.end,
      quote,
      type,
      suggestion,
      suggestions,
    });
  }
  findings.sort((a, b) => a.start - b.start);
  return {
    ambition,
    findings: filterRaiseDuplicateSpecifics(text, findings),
  };
}

function applyRaiseLocks(
  draft: string,
  result: StoryRaiseResult,
  locks: readonly string[],
): StoryRaiseResult {
  const plain = draftPlainText(draft);
  const unlocked =
    locks.length === 0
      ? result.findings
      : filterFindingsAgainstRaiseLocks(draft, result.findings, locks);
  return {
    ...result,
    findings: filterRaiseDuplicateSpecifics(plain, unlocked),
  };
}

/** One call for every finding whose levels were copied or left blank. */
async function completeDistinctLevels(
  draft: string,
  result: StoryRaiseResult,
): Promise<StoryRaiseResult> {
  const pending = result.findings.filter(
    (f) => f.suggestions.ambitious.trim() && !suggestionsDiffer(f.suggestions),
  );
  if (pending.length === 0) return result;
  const lines = pending
    .map(
      (f) =>
        `- quote: ${JSON.stringify(f.quote)}\n  ambitious: ${JSON.stringify(f.suggestions.ambitious)}`,
    )
    .join("\n");
  const prompt =
    `These life-vision rewrites used the same sentence for more than one level. ` +
    `For each quote, return two different present-tense replacements of that quote. ` +
    `ambitious is a clear step up that is still recognisably the user's own life and path. Tone: playing live every month, including their own headline shows, or selling out their own launch show. Not global fame or record-breaking. ` +
    `audacious is a big but real version of the user's path, the top of what's plausible for someone like them. Not fantasy, global fame, or invented achievements. ` +
    // `delusional is the only world-class tier: the biggest stages, worldwide fame, or history-making. ` +
    // `Audacious must be obviously smaller than delusional. Do not repeat a sentence across levels. ` +
    `Do not repeat a sentence across levels. ` +
    `Keep the subject, person, and specifics. ` +
    `Reply with ONLY JSON: {"findings":[{"quote":"...","suggestions":{"ambitious":"...","audacious":"..."}}]}\n\n` +
    // `Reply with ONLY JSON: {"findings":[{"quote":"...","suggestions":{"ambitious":"...","audacious":"...","delusional":"..."}}]}\n\n` +
    `${lines}\n\nNearby:\n${draft.slice(0, 2000)}`;
  try {
    const parsed = (await askJson(prompt)) as Record<string, unknown>;
    const rows = Array.isArray(parsed.findings) ? parsed.findings : [];
    const byQuote = new Map<string, RaiseSuggestions>();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const quote = typeof r.quote === "string" ? r.quote : "";
      const suggestions = parseRaiseSuggestions(r.suggestions, r.suggestion);
      if (!quote || !suggestions || !suggestionsDiffer(suggestions)) continue;
      byQuote.set(quote, suggestions);
    }
    if (byQuote.size === 0) return result;
    return {
      ...result,
      findings: result.findings.map((f) => {
        const suggestions = byQuote.get(f.quote);
        if (!suggestions) return f;
        return { ...f, suggestions, suggestion: suggestions.ambitious };
      }),
    };
  } catch {
    return result;
  }
}

export async function raiseStoryCeiling(
  draft: string,
  raiseLocks: readonly string[] = [],
  opts?: {
    lifeAreas?: readonly RaiseLifeAreaMeta[];
    values?: readonly string[];
    valuesById?: ReadonlyMap<string, string> | Record<string, string>;
    /** When these match, the server refuses the raise. */
    raisedFrom?: string;
    textHash?: string;
  },
): Promise<StoryRaiseResult> {
  const text = draftPlainText(draft);
  if (!text.trim()) {
    return { ambition: 0, findings: [] };
  }
  if (
    opts?.raisedFrom &&
    opts.textHash &&
    opts.raisedFrom === opts.textHash
  ) {
    return { ambition: 0, findings: [] };
  }
  const forModel =
    annotateDraftWithPrompts(draft, {
      lifeAreas: opts?.lifeAreas,
      values: opts?.values,
      valuesById: opts?.valuesById,
    }) || text;
  // Never treat overtly negative lines as ALREADY CHECKED (old Keep locks too).
  const locks = stripOvertlyNegativeRaiseLocks(draft, raiseLocks);

  const local = applyRaiseLocks(draft, heuristicRaise(text), locks);
  const remote = await postStoryJson("/manifest/story/raise", {
    draft,
    raiseContext: forModel,
    raiseLocks: locks,
    raiseValues: (opts?.values ?? []).filter((v) => v.trim()).slice(0, 20),
    ...(opts?.raisedFrom ? { raisedFrom: opts.raisedFrom } : {}),
    ...(opts?.textHash ? { textHash: opts.textHash } : {}),
  });
  if (remote) {
    const parsed = applyRaiseLocks(
      draft,
      parseRaisePayload(remote, text),
      locks,
    );
    // Always merge local so heuristic negatives survive an empty/soft remote.
    return completeDistinctLevels(
      text,
      applyRaiseLocks(draft, mergeRaiseFindings(parsed, local), locks),
    );
  }

  // Don't fall through to the chat stream — that path can hang the UI.
  // Prefer the local hedge pass, then a bounded ask via the raise endpoint.
  if (local.findings.length > 0) return completeDistinctLevels(text, local);

  const lockBlock =
    locks.length > 0
      ? `ALREADY CHECKED — skip optimise types (hedging|future|small|settling|doubt) inside these sentences ` +
        `(or close rewrites). ALWAYS still flag type=negative if the text is overtly negative / ` +
        `self-degrading — locks do not suppress negative:\n` +
        locks.map((l) => `- ${l}`).join("\n") +
        `\n\n`
      : "";

  const prompt =
    `You raise the ambition of a first-person life vision written as if already true.\n` +
    `Score ambition 0–100 against an ordinary life in that field, not against how bold the wording sounds. ` +
    `0–24 Sensible: an average or below-average experience. Typical pay, a typical home, a local or ordinary version of the activity, “good enough”, or hedged with effort or hope. Nothing unremarkable is Ambitious. ` +
    `25–44 Modest: a decent, ordinary good outcome that plenty of people already have. ` +
    `45–64 Ambitious: a really great result a dedicated person can still reasonably reach. About a top-10% life in that field. Strong among the people around them. Not a public career and not fame. This tier starts only there. ` +
    `65–100 Audacious: a big but real version of their path, the top of what's plausible for someone like them. Not fantasy, global fame, or invented achievements. ` +
    // `85–100 Delusional: the only world-class tier. The best or most famous in the world at it, or history-making. ` +
    `If a line describes an average or below-average experience, score it Sensible. Never score that line Ambitious or higher. ` +
    `Hedges (hopefully, one day, if I work hard, I'd like to) keep a line in Sensible. ` +
    `Flag a line only when its claim is under Ambitious. Never flag a line already at Ambitious or higher, ` +
    `except type=negative, which you still flag.\n` +
    `Find where the writer played it safe: hedges (hopefully, try to, maybe, someday, I think, kind of, kinda, wanna), ` +
    `future tense (I will, I'm going to), small thinking (a few, local, small rooms, enough), ` +
    `settling ("which is enough for me"), lukewarm affection or desire ` +
    `(like → love, enjoy → adore, okay with → thrilled by), clumsy/unprofessional wording, past-doubt leftovers ` +
    `(again, finally, this time, still) — remove those with suggestion "", ` +
    `and wholly negative / self-degrading passages that are the opposite of a life vision.\n` +
    `Steer away from past difficulty — the life is already true, with no comeback story.\n` +
    `PROMPT AWARENESS: Answers sit under [Prompt: …] lines. Honour that prompt’s subject and timeframe. ` +
    `Bad: morning prompt → “every night”. Good: morning prompt → raised morning rituals. ` +
    `When [Life area: …], Dream:, and What it looks like: appear, stay inside that life area’s dream/vision — ` +
    `don’t drift into unrelated domains. ` +
    `When “Writer's values” appear, let them softly colour tone and larger rewrites — do not centre every ` +
    `suggestion on them or force-mention them. quote/suggestion are answer text only — never meta lines.\n` +
    `SUGGESTION FIELD: suggestion must be ONLY the rewritten first-person text that replaces quote — nothing else. ` +
    `Bad: “Replace the whole passage with: I wake…”. Good: “I wake each morning in a sun-filled loft…”.\n` +
    `NEGATIVE (type negative): flag self-put-downs, harsh self-judgement, or others thinking badly of them ` +
    `(e.g. “my friends would describe me as a massive prick”). suggestion = the positive opposite, same subject ` +
    `and specifics, same person as the text. Never flag grammar. Fair/sensible but small → other types; keep theme, raise the ceiling.\n` +
    `CALIBRATION (required): judge each rewrite by how society sees that outcome, not as a multiple of the user's number. ` +
    `Each level is a different step on the user's own path. Keep the user's subject, specifics, units, currency, and person. ` +
    `Present tense, already true, and concrete: a number, a place, a name, or a scene. ` +
    `Never just multiply their figure. Pick a figure that fits the tier. ` +
    `Do not invent achievements, fame, or a life that is no longer recognisably theirs. ` +
    `ambitious is a clear step up that is still recognisably the user's own life and path. Tone: playing live every month, including their own headline shows, or selling out their own launch show. Not global fame or record-breaking. ` +
    `audacious is a big but real version of the user's path, the top of what's plausible for someone like them. Not fantasy, global fame, or invented achievements. ` +
    // `Only delusional is world-class. ` +
    // `Audacious must be obviously smaller than delusional, not the same scene with “worldwide” or “biggest” added. ` +
    // `delusional is world-class only: the biggest stages, worldwide fame, being the best or most famous. ` +
    // `World-class imagery is delusional and must not appear on ambitious or audacious: stadiums, arenas as the headline rooms, worldwide or global charts, platinum as the identity, being known in every country, a best-selling record of the world, defining a generation. Playing stadiums is world-class. It belongs on delusional only. ` +
    `Write original wording for this person's life. Do not recycle phrases from these instructions. ` +
    `Which lines you flag does not depend on level — always return both texts.\n` +
    // `Which lines you flag does not depend on level — always return all three texts.\n` +
    `QUALITY: Mentally apply every suggestion and read the FULL sentence. It must be natural, grammatical, ` +
    `professional present-tense English — correct prepositions, articles, and verb forms. Include punctuation ` +
    `when neighbouring clauses would smash together.\n` +
    `Prefer the smallest quote that still leaves a polished sentence. If a tiny swap leaves awkward leftovers, ` +
    `expand the quote and rewrite the whole phrase.\n` +
    `Bad: “kinda wanna be”→“am” (→“I am big in life”). Good: “kinda wanna be big in life”→“live a big life”.\n` +
    `Bad: “local rooms”→“packed houses” yielding “I play music packed houses…”. ` +
    `Good: “play music in local rooms”→“play well-attended rooms in my city”.\n` +
    `Never drop a preposition the surrounding words still need (in, to, for, with, at, of).\n` +
    `Also rewrite slangy residue (“ya know”, “big in life”, “its in gods hands”) into clear, confident wording.\n` +
    `Example: “I think my mates like me again” → “I think”→“I know”, “like”→“love”, “ again”→"" ` +
    `so the line becomes “I know my mates love me”.\n` +
    `Keep names, places, and voice when optimising. Preserve positive figures the writer names ` +
    `(Jesus, God, Mary, a partner, a guru) — never swap “Jesus” for “God” or generalise a beloved name; ` +
    `only rewrite degrading/negative parts around them. Never invent unrelated facts. At most 8 findings.\n` +
    `NO DUPLICATE SPECIFICS: Mentally apply ALL suggestions together. A distinctive invented flourish ` +
    `(brand/status name, signature luxury image) may appear at most once in the whole draft — never paste ` +
    `the same specific image into two answers. Bad: two findings both add “Michelin-starred feasts every night”. ` +
    `Good: one dining raise uses Michelin; another uses a different vivid detail. If the draft already has ` +
    `such a flourish, do not invent the same one again elsewhere.\n` +
    `Reply with ONLY JSON: {"ambition":0-100,"findings":[{"quote":"exact substring","type":"hedging|future|small|settling|doubt|negative","suggestions":{"ambitious":"...","audacious":"..."}}]}\n\n` +
    // `Reply with ONLY JSON: {"ambition":0-100,"findings":[{"quote":"exact substring","type":"hedging|future|small|settling|doubt|negative","suggestions":{"ambitious":"...","audacious":"...","delusional":"..."}}]}\n\n` +
    lockBlock +
    `DRAFT (prompt-tagged; quote must match answer text only):\n${forModel.slice(0, 12000)}`;

  try {
    const parsed = await Promise.race([
      askJson(prompt),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("raise chat timeout")), 20_000),
      ),
    ]);
    return completeDistinctLevels(
      text,
      applyRaiseLocks(
        draft,
        mergeRaiseFindings(
          parseRaisePayload(parsed as Record<string, unknown>, text),
          local,
        ),
        locks,
      ),
    );
  } catch {
    return completeDistinctLevels(text, local);
  }
}

const WORD_CHAR = /[\p{L}\p{N}']/u;

/**
 * When the model quotes a whole sentence but only changed a hedge
 * (“I think … like me” → “I know … like me”), shrink the quote to the
 * changed word so lukewarm words can still get their own finding.
 * Never shrink a single-word respell to mid-letters (like→love, not ik→ov).
 */
function shrinkFindingToChangedSpan(f: StoryFinding): StoryFinding {
  const quote = f.quote;
  const suggestions = f.suggestions ?? sameRaiseSuggestions(f.suggestion);
  const levels: RaiseLevel[] = [
    "ambitious",
    "audacious",
    // "delusional",
  ];
  const texts = levels.map((level) => suggestions[level]);
  if (!quote || texts.some((s) => !s || s === quote)) return { ...f, suggestions };
  if (texts.some((s) => !/\s/.test(quote) && !/\s/.test(s))) return { ...f, suggestions };

  const qWords = quote.trim().split(/\s+/).filter(Boolean).length;
  if (
    texts.some((s) => {
      const sWords = s.trim().split(/\s+/).filter(Boolean).length;
      return qWords >= 3 && sWords <= 2 && sWords < qWords - 1;
    })
  ) {
    return { ...f, suggestions };
  }

  let pre = quote.length;
  let suf = quote.length;
  for (const suggestion of texts) {
    let p = 0;
    while (
      p < quote.length &&
      p < suggestion.length &&
      quote[p] === suggestion[p]
    ) {
      p += 1;
    }
    let u = 0;
    while (
      u < quote.length - p &&
      u < suggestion.length - p &&
      quote[quote.length - 1 - u] === suggestion[suggestion.length - 1 - u]
    ) {
      u += 1;
    }
    pre = Math.min(pre, p);
    suf = Math.min(suf, u);
  }
  let midStart = pre;
  let midEnd = quote.length - suf;
  if (midStart >= midEnd) return { ...f, suggestions };

  while (midStart > 0 && WORD_CHAR.test(quote[midStart - 1]!)) midStart -= 1;
  while (midEnd < quote.length && WORD_CHAR.test(quote[midEnd]!)) midEnd += 1;

  const qFull = quote.slice(midStart, midEnd);
  if (!qFull.trim()) return { ...f, suggestions };
  const next: RaiseSuggestions = { ambitious: "", audacious: "", delusional: "" };
  for (const level of levels) {
    const suggestion = suggestions[level];
    next[level] =
      quote.slice(midStart, pre) +
      suggestion.slice(pre, suggestion.length - suf) +
      quote.slice(quote.length - suf, midEnd);
  }
  if (levels.some((level) => !next[level].trim() || qFull === next[level])) {
    return { ...f, suggestions };
  }
  const start = f.start + midStart;
  const end = start + qFull.length;
  if (end > f.end) return { ...f, suggestions };
  return {
    ...f,
    start,
    end,
    quote: qFull,
    suggestion: next.ambitious,
    suggestions: next,
  };
}

/** Fill gaps the model missed with obvious local hedges / lukewarm words. */
function mergeRaiseFindings(
  primary: StoryRaiseResult,
  extra: StoryRaiseResult,
): StoryRaiseResult {
  const findings = primary.findings.map(shrinkFindingToChangedSpan);
  for (const f of extra.findings) {
    if (findings.length >= 8) break;
    if (findings.some((e) => !(f.end <= e.start || f.start >= e.end))) continue;
    findings.push(f);
  }
  findings.sort((a, b) => a.start - b.start);
  const ambition =
    findings.length === 0
      ? primary.ambition
      : Math.min(primary.ambition, extra.ambition);
  return { ambition, findings };
}

/** Offline / short-draft fallback when the model misses obvious hedges. */
function heuristicRaise(text: string): StoryRaiseResult {
  const findings: StoryFinding[] = [...heuristicNegativeFindings(text)];

  for (const hit of offlineRaiseSpans(text)) {
    if (findings.length >= 8) break;
    if (findings.some((f) => !(hit.end <= f.start || hit.start >= f.end))) continue;
    findings.push({
      id: `h_${hit.start}`,
      start: hit.start,
      end: hit.end,
      quote: hit.quote,
      type: hit.type,
      suggestion: hit.suggestions.ambitious,
      suggestions: hit.suggestions,
    });
  }

  const ambition =
    findings.some((f) => f.type === "negative")
      ? Math.min(
          0.12,
          Math.max(0.05, 0.2 - findings.length * 0.02),
        )
      : findings.length === 0
        ? countApproxWords(text) < 12
          ? 0.15
          : 0.45
        : Math.max(0.08, 0.28 - findings.length * 0.04);
  return { ambition, findings };
}

/** One finding, one level. Does not send the rest of the draft. */
export async function regenerateFindingLine(opts: {
  quote: string;
  level: RaiseLevel;
  prompt?: string;
  surrounding: string;
  pastSuggestions: readonly string[];
  person: "first" | "third";
}): Promise<string | null> {
  const data = await postStoryJson("/manifest/story/raise-another", {
    quote: opts.quote,
    level: opts.level,
    prompt: opts.prompt ?? "",
    surrounding: opts.surrounding,
    pastSuggestions: opts.pastSuggestions.slice(0, 12),
    person: opts.person,
  });
  if (!data || typeof data.suggestion !== "string") return null;
  return data.suggestion.trim();
}

export async function regenerateStorySuggestion(opts: {
  draft: string;
  quote: string;
  type: StoryFindingType;
  /** Which dial step to rewrite. Only this level’s text is replaced. */
  level?: RaiseLevel;
  /** Owning story prompt, e.g. “What does your morning look like?” */
  promptText?: string;
  lifeAreas?: readonly RaiseLifeAreaMeta[];
  /** When set, focus regenerate on this life area’s dream/vision. */
  lifeArea?: RaiseLifeAreaMeta | null;
  values?: readonly string[];
  valuesById?: ReadonlyMap<string, string> | Record<string, string>;
}): Promise<string> {
  const promptCue = opts.promptText?.trim()
    ? `This answer is under the prompt “${opts.promptText.trim()}”. ` +
      `Keep the suggestion true to that prompt’s subject and timeframe ` +
      `(e.g. morning stays morning — never “every night”). `
    : "";
  const area = opts.lifeArea;
  const areaCue = area
    ? `Life area “${area.title.trim() || "Untitled"}”. ` +
      (area.dream.trim()
        ? `Dream: ${area.dream.trim().slice(0, 360)}. `
        : "") +
      (area.vision.trim()
        ? `What it looks like: ${area.vision.trim().slice(0, 360)}. `
        : "") +
      `Stay inside this life area — don’t invent a different domain. `
    : "";
  const valuesList = (opts.values ?? [])
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 12);
  const valuesCue = valuesList.length
    ? `Writer's values (soft influence only — colour tone/larger rewrites; do not force-mention): ${valuesList.join("; ")}. `
    : "";
  const level = activeRaiseLevel(opts.level ?? "ambitious");
  const levelCue =
    level === "ambitious"
      ? "LEVEL ambitious: a clear step up that is still recognisably the user's own life and path. Tone: playing live every month, including their own headline shows, or selling out their own launch show. Not global fame, record-breaking, or invented achievements. Same subject, units and currency. Do not multiply their number. "
      : "LEVEL audacious: a big but real version of the user's path, the top of what's plausible for someone like them. Not fantasy, global fame, or invented achievements. Same subject, units and currency. ";
  // : "LEVEL delusional: the only world-class tier. The best or most famous in the world, the biggest stages including stadiums, or history-making. Same subject. Not a multiple of their number. ";
  const prompt =
    `Rewrite this phrase from a first-person life vision into one bolder present-tense replacement. ` +
    levelCue +
    promptCue +
    areaCue +
    valuesCue +
    `The JSON "suggestion" value must be ONLY that rewritten text — nothing else. ` +
    `Bad: “Replace the whole passage with: I wake…”. Good: “I wake each morning in a sun-filled loft…”. ` +
    `If type is negative (self-put-down / others thinking badly): suggestion = the positive opposite, same subject and person. ` +
    `If the quote is wholly negative/degrading/absurd misery: suggestion = a complete sincere rewrite. ` +
    `If it is fair/sensible but small: keep the same theme and details; only raise the ceiling. ` +
    `Never rewrite for grammar alone. ` +
    `Stay at the requested level — do not jump past it. ` +
    `After substituting into the surrounding sentence, the FULL line must be natural, grammatical English ` +
    `(correct prepositions/articles — never “music packed houses”; use “music in packed houses” or expand ` +
    `the quote). Not a tiny swap that leaves awkward leftovers (never “kinda wanna be”→“am”). ` +
    `Include punctuation/capitalisation if needed for flow with what comes before/after. ` +
    `Keep specifics and voice when optimising. Preserve positive figures the writer names ` +
    `(e.g. Jesus — never replace with “God” if they said Jesus). Type of issue: ${opts.type}. Quote: "${opts.quote}". ` +
    `If the quote only signals past doubt/struggle (e.g. "again", "finally", "this time"), reply with suggestion "". ` +
    `Nearby context:\n${annotateDraftWithPrompts(opts.draft, {
      lifeAreas: opts.lifeAreas,
      values: opts.values,
      valuesById: opts.valuesById,
    }).slice(0, 2000)}\n\n` +
    `Reply with ONLY JSON: {"suggestion":"..."}`;
  try {
    const parsed = (await askJson(prompt)) as Record<string, unknown>;
    if (typeof parsed.suggestion === "string") {
      if (parsed.suggestion.trim() === "") return "";
      if (parsed.suggestion.trim()) return parsed.suggestion.trim();
    }
  } catch {
    /* */
  }
  return opts.quote;
}

export type ComposeStoryResult = {
  text: string;
  sections: Array<{
    promptId: string | null;
    heading: string;
    text: string;
  }>;
};

function parseComposeSectionsOut(
  raw: unknown,
  fallbackText: string,
): ComposeStoryResult["sections"] {
  if (!Array.isArray(raw)) {
    const t = fallbackText.trim();
    return t ? [{ promptId: null, heading: "Opening", text: t }] : [];
  }
  const out: ComposeStoryResult["sections"] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) continue;
    out.push({
      promptId:
        o.promptId === null || o.promptId === undefined
          ? null
          : typeof o.promptId === "string"
            ? o.promptId
            : null,
      heading:
        typeof o.heading === "string" && o.heading.trim()
          ? o.heading.trim()
          : "Opening",
      text: o.text.trim(),
    });
  }
  if (out.length === 0 && fallbackText.trim()) {
    return [{ promptId: null, heading: "Opening", text: fallbackText.trim() }];
  }
  return out;
}

export async function composeStoryThirdPerson(opts: {
  draft: string;
  firstName: string;
  /** Account pronouns — never guess from the name. */
  pronouns?: AccountPronouns | null;
  sections: Array<{
    promptId: string | null;
    promptText: string;
    text: string;
    role?: "rewrite" | "context";
  }>;
  /**
   * When true (or any section has role=rewrite), only rewrite those sections;
   * context sections are for flow. Returned `sections` are the rewritten ones
   * only — merge via addUpdatedStoryVersion.
   */
  rewriteOnly?: boolean;
}): Promise<ComposeStoryResult> {
  const name = opts.firstName.trim() || "They";
  const pronounCue = storyPronounComposeCue(name, opts.pronouns);
  const text = draftPlainText(opts.draft);
  const rewriteOnly =
    opts.rewriteOnly === true ||
    opts.sections.some((s) => s.role === "rewrite");
  const remote = await postStoryJson("/manifest/story/compose", {
    draft: opts.draft,
    firstName: name,
    pronouns: opts.pronouns ?? "they_them",
    sections: opts.sections,
  });
  if (remote && typeof remote.text === "string" && remote.text.trim()) {
    return {
      text: remote.text.trim(),
      sections: parseComposeSectionsOut(remote.sections, remote.text),
    };
  }
  const listed = opts.sections
    .map((s, i) => {
      const id = s.promptId ?? "opening";
      const cue = s.promptText.trim()
        ? ` (prompt was: ${s.promptText.trim().slice(0, 120)})`
        : "";
      const roleTag =
        s.role === "rewrite"
          ? " [REWRITE]"
          : s.role === "context"
            ? " [CONTEXT — do not rewrite]"
            : "";
      return `### section ${i + 1} [id=${id}]${roleTag}${cue}\n${s.text}`;
    })
    .join("\n\n");
  const quality =
    `Fix grammar and smooth flow into complete present-tense sentences. ` +
    `Keep their ambition and specifics. Don't invent unrelated facts. ` +
    `If a section is overtly self-insulting, degrading, or full of slurs, rewrite it into a sincere ` +
    `positive life-vision equivalent on the same subject — never leave self-put-downs in the narration. ` +
    `Do not copy a distinctive detail from one section into another. If the same highly specific flourish ` +
    `(brand, signature luxury image) already appears twice in the source, keep it once where it fits best ` +
    `and vary or drop the echo in the other section. `;
  const prompt = rewriteOnly
    ? `Rewrite ONLY the sections marked [REWRITE] into the third person by first name ("${name} is…"), present tense. ` +
      `Sections marked [CONTEXT] are for narrative flow only — do not rewrite them and do not include them in the reply. ` +
      `${pronounCue} ` +
      quality +
      `For each rewritten section, invent a short print heading of 1–4 plain words (never the prompt question). ` +
      `Opening (id=opening) heading must be "Opening". Return only the rewritten ids.\n` +
      `Reply with ONLY JSON: {"sections":[{"id":"opening|promptId","heading":"…","text":"…"}]}\n\n` +
      `SECTIONS:\n${(listed || text).slice(0, 14000)}`
    : `Rewrite each first-person section into the third person by first name ("${name} is…"), present tense. ` +
      `${pronounCue} ` +
      quality +
      `For each section, invent a short print heading of 1–4 plain words (never the prompt question). ` +
      `Opening (id=opening) heading must be "Opening". Return the same ids in order.\n` +
      `Reply with ONLY JSON: {"sections":[{"id":"opening|promptId","heading":"…","text":"…"}]}\n\n` +
      `SECTIONS:\n${(listed || text).slice(0, 14000)}`;

  const parsed = (await askJson(prompt)) as Record<string, unknown>;
  const sections = parseComposeSectionsOut(
    Array.isArray(parsed.sections)
      ? (parsed.sections as unknown[]).map((row) => {
          if (!row || typeof row !== "object") return row;
          const o = row as Record<string, unknown>;
          const id = typeof o.id === "string" ? o.id : null;
          return {
            promptId: id === "opening" || !id ? null : id,
            heading: o.heading,
            text: o.text,
          };
        })
      : parsed.sections,
    typeof parsed.text === "string" ? parsed.text : text,
  );
  const joined = sections.map((s) => s.text).join("\n\n").trim();
  if (!joined) throw new Error("Could not compose your story");
  return { text: joined, sections };
}

export async function summarizeStoryForPrint(opts: {
  firstName: string;
  pronouns?: AccountPronouns | null;
  sections: Array<{ id: string; heading: string; text: string }>;
}): Promise<{ summary: string; sectionSummaries: Record<string, string> }> {
  const name = opts.firstName.trim() || "They";
  const pronounCue = storyPronounComposeCue(name, opts.pronouns);
  const remote = await postStoryJson("/manifest/story/summarize", {
    firstName: name,
    pronouns: opts.pronouns ?? "they_them",
    sections: opts.sections,
  });
  if (remote && typeof remote.summary === "string" && remote.summary.trim()) {
    const sectionSummaries: Record<string, string> = {};
    if (
      remote.sectionSummaries &&
      typeof remote.sectionSummaries === "object"
    ) {
      for (const [k, v] of Object.entries(
        remote.sectionSummaries as Record<string, unknown>,
      )) {
        if (typeof v === "string" && v.trim()) sectionSummaries[k] = v.trim();
      }
    }
    return { summary: remote.summary.trim(), sectionSummaries };
  }
  const listed = opts.sections
    .map((s) => `### ${s.id} (${s.heading})\n${s.text}`)
    .join("\n\n");
  const prompt =
    `Write in the third person by first name ("${name}"), present tense, plain language. ` +
    `${pronounCue} ` +
    `Keep the most specific details and the ambition. Don't add facts. ` +
    `summary: 130–170 words. sectionSummaries: 1–3 sentences per section id.\n` +
    `Reply with ONLY JSON: {"summary":"…","sectionSummaries":{"opening":"…"}}\n\n` +
    `SECTIONS:\n${listed.slice(0, 12000)}`;
  const parsed = (await askJson(prompt)) as Record<string, unknown>;
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) throw new Error("Could not summarise your story");
  const sectionSummaries: Record<string, string> = {};
  if (
    parsed.sectionSummaries &&
    typeof parsed.sectionSummaries === "object"
  ) {
    for (const [k, v] of Object.entries(
      parsed.sectionSummaries as Record<string, unknown>,
    )) {
      if (typeof v === "string" && v.trim()) sectionSummaries[k] = v.trim();
    }
  }
  return { summary, sectionSummaries };
}

export async function goBiggerQuestion(recentText: string): Promise<string> {
  const slice = recentText.trim().slice(-1200);
  if (countApproxWords(slice) < 20) {
    return "What’s the version of this you’re almost embarrassed to want?";
  }
  const prompt =
    `The writer paused on a life vision written as already true. From their last words, ask ONE short question ` +
    `that pushes them to think bigger — e.g. past the sensible version. Never rewrite their text. ` +
    `Reply with ONLY JSON: {"question":"..."}\n\nLAST WORDS:\n${slice}`;
  try {
    const parsed = (await askJson(prompt)) as Record<string, unknown>;
    if (typeof parsed.question === "string" && parsed.question.trim()) {
      return parsed.question.trim();
    }
  } catch {
    /* */
  }
  return "Good. What happens when it’s bigger than you ever pictured?";
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Model may return 0–1 or 0–100. Store 0–1. */
export function normalizeAmbitionScore(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0.4;
  const unit = n > 1 ? n / 100 : n;
  return clamp01(unit);
}

function countApproxWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function ambitionLabel(ambition: number): string {
  const score = ambition > 1 ? ambition : ambition * 100;
  if (score < 25) return "Sensible";
  if (score < 45) return "Modest";
  if (score < 65) return "Ambitious";
  // return "Delusional";
  return "Audacious";
}

/** A flagged draft is not ambitious. Raise only opens on lines below that tier. */
export function ambitionShownForRaise(
  ambition: number,
  findingCount: number,
): number {
  if (findingCount <= 0) return ambition;
  return Math.min(ambition, 0.12);
}

export function findingTypeLabel(type: StoryFindingType): string {
  switch (type) {
    case "hedging":
      return "Hedging";
    case "future":
      return "Future tense";
    case "small":
      return "Small thinking";
    case "settling":
      return "Settling";
    case "doubt":
      return "Past doubt";
    case "negative":
      return "Negative";
    default:
      return "Hedging";
  }
}

/** UI copy for a raise suggestion; empty string means delete the quote. */
export function raiseSuggestionLabel(suggestion: string): string {
  return suggestion === "" ? "remove" : suggestion;
}
