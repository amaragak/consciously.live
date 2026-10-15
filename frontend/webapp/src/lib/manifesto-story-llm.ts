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

export type StoryFindingType =
  | "hedging"
  | "future"
  | "small"
  | "settling"
  | "doubt";

export type StoryFinding = {
  id: string;
  start: number;
  end: number;
  quote: string;
  type: StoryFindingType;
  suggestion: string;
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
]);

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
  path: "/manifest/story/raise" | "/manifest/story/compose",
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

function parseRaisePayload(
  o: Record<string, unknown>,
  text: string,
): StoryRaiseResult {
  const ambition = clamp01(typeof o.ambition === "number" ? o.ambition : 0.4);
  const rawFindings = Array.isArray(o.findings) ? o.findings : [];
  const findings: StoryFinding[] = [];
  let i = 0;
  for (const row of rawFindings) {
    if (findings.length >= 8) break;
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const quoteRaw = typeof r.quote === "string" ? r.quote : "";
    if (!quoteRaw.trim()) continue;
    if (typeof r.suggestion !== "string") continue;
    const deletion = r.suggestion.trim() === "";
    const quote = deletion ? quoteRaw : quoteRaw.trim();
    const suggestion = deletion ? "" : r.suggestion.trim();
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
    });
  }
  findings.sort((a, b) => a.start - b.start);
  return { ambition, findings };
}

export async function raiseStoryCeiling(
  draft: string,
): Promise<StoryRaiseResult> {
  const text = draftPlainText(draft);
  if (!text.trim()) {
    return { ambition: 0, findings: [] };
  }

  const local = heuristicRaise(text);
  const remote = await postStoryJson("/manifest/story/raise", { draft });
  if (remote) {
    const parsed = parseRaisePayload(remote, text);
    if (
      parsed.findings.length > 0 ||
      local.findings.length > 0 ||
      countApproxWords(text) >= 40
    ) {
      return mergeRaiseFindings(parsed, local);
    }
    return parsed;
  }

  // Don't fall through to the chat stream — that path can hang the UI.
  // Prefer the local hedge pass, then a bounded ask via the raise endpoint.
  if (local.findings.length > 0) return local;

  const prompt =
    `You raise the ambition of a first-person life vision written as if already true.\n` +
    `Score ambition 0–1 (0 = sensible/safe, 1 = delightfully delusional). Short drafts can still be low ambition.\n` +
    `Find where the writer played it safe: hedges (hopefully, try to, maybe, someday, I think, kind of, kinda, wanna), ` +
    `future tense (I will, I'm going to), small thinking (a few, local, small rooms, enough), ` +
    `settling ("which is enough for me"), lukewarm affection or desire ` +
    `(like → love, enjoy → adore, okay with → thrilled by), clumsy/unprofessional wording, and past-doubt leftovers ` +
    `(again, finally, this time, still) — remove those with suggestion "".\n` +
    `Steer away from past difficulty — the life is already true, with no comeback story.\n` +
    `QUALITY: Mentally apply every suggestion. The draft must read as natural, grammatical, professional ` +
    `present-tense prose. Include punctuation/capitalisation in suggestions when neighbouring clauses would smash together.\n` +
    `Prefer the smallest quote that still leaves a polished sentence. If a tiny swap leaves awkward leftovers ` +
    `(e.g. “kinda wanna be”→“am” leaving “I am big in life”), expand the quote to the whole weak phrase and rewrite it boldly.\n` +
    `Bad: “kinda wanna be”→“am”. Good: “kinda wanna be big in life”→“live a big life” (or “I’m living a big life”).\n` +
    `Also rewrite slangy residue (“ya know”, “big in life”, “its in gods hands”) into clear, confident wording.\n` +
    `Example: “I think my mates like me again” → “I think”→“I know”, “like”→“love”, “ again”→"" ` +
    `so the line becomes “I know my mates love me”.\n` +
    `Keep names, places, and voice. Never invent unrelated facts. At most 8 findings.\n` +
    `Reply with ONLY JSON: {"ambition":0-1,"findings":[{"quote":"exact substring","type":"hedging|future|small|settling|doubt","suggestion":"..."}]}\n\n` +
    `DRAFT:\n${text.slice(0, 12000)}`;

  try {
    const parsed = await Promise.race([
      askJson(prompt),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("raise chat timeout")), 20_000),
      ),
    ]);
    return mergeRaiseFindings(
      parseRaisePayload(parsed as Record<string, unknown>, text),
      local,
    );
  } catch {
    return local;
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
  const suggestion = f.suggestion;
  // Deletions stay as-is (often " again" → "").
  if (!quote || quote === suggestion) return f;
  if (suggestion === "") return f;
  // Single-token swaps keep the whole word visible in the card + editor.
  if (!/\s/.test(quote) && !/\s/.test(suggestion)) return f;

  // Wholesale multi-word rewrites (hedge phrase → bold phrase) must stay whole
  // so we never surface a stub like “kinda wanna be”→“am”.
  const qWords = quote.trim().split(/\s+/).filter(Boolean).length;
  const sWords = suggestion.trim().split(/\s+/).filter(Boolean).length;
  if (qWords >= 3 && sWords <= 2 && sWords < qWords - 1) return f;

  let pre = 0;
  while (
    pre < quote.length &&
    pre < suggestion.length &&
    quote[pre] === suggestion[pre]
  ) {
    pre += 1;
  }
  let suf = 0;
  while (
    suf < quote.length - pre &&
    suf < suggestion.length - pre &&
    quote[quote.length - 1 - suf] === suggestion[suggestion.length - 1 - suf]
  ) {
    suf += 1;
  }
  let midStart = pre;
  let midEnd = quote.length - suf;
  if (midStart >= midEnd) return f;

  // Grow to word boundaries so we show “think”→“know”, not “hink”→“now”.
  while (midStart > 0 && WORD_CHAR.test(quote[midStart - 1]!)) midStart -= 1;
  while (midEnd < quote.length && WORD_CHAR.test(quote[midEnd]!)) midEnd += 1;

  const qFull = quote.slice(midStart, midEnd);
  const sFull =
    quote.slice(midStart, pre) +
    suggestion.slice(pre, suggestion.length - suf) +
    quote.slice(quote.length - suf, midEnd);
  if (!qFull.trim() || qFull === sFull) return f;

  const start = f.start + midStart;
  const end = start + qFull.length;
  if (end > f.end) return f;
  return {
    ...f,
    start,
    end,
    quote: qFull,
    suggestion: sFull,
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
  const patterns: Array<{
    re: RegExp;
    type: StoryFindingType;
    suggestion: string;
  }> = [
    { re: /\bI think\b/i, type: "hedging", suggestion: "I know" },
    { re: /\bI hope\b/i, type: "hedging", suggestion: "I have" },
    { re: /\bmaybe\b/i, type: "hedging", suggestion: "definitely" },
    { re: /\btry to\b/i, type: "hedging", suggestion: "do" },
    { re: /\bsomeday\b/i, type: "future", suggestion: "now" },
    { re: /\bI will\b/i, type: "future", suggestion: "I" },
    { re: /\bI'm going to\b/i, type: "future", suggestion: "I" },
    // Lukewarm affection — keep quotes small so they sit beside hedge findings.
    { re: /\blike me\b/i, type: "small", suggestion: "love me" },
    { re: /\blikes me\b/i, type: "small", suggestion: "loves me" },
    { re: /\blike them\b/i, type: "small", suggestion: "love them" },
    { re: /\blike him\b/i, type: "small", suggestion: "love him" },
    { re: /\blike her\b/i, type: "small", suggestion: "love her" },
    { re: /\bI like\b/i, type: "small", suggestion: "I love" },
    // Past-doubt leftovers — delete (quote keeps leading space).
    { re: /\s+again\b/i, type: "doubt", suggestion: "" },
    { re: /\s+finally\b/i, type: "doubt", suggestion: "" },
    { re: /\s+this time\b/i, type: "doubt", suggestion: "" },
  ];

  const findings: StoryFinding[] = [];
  for (const p of patterns) {
    if (findings.length >= 6) break;
    const m = p.re.exec(text);
    if (!m || m.index == null) continue;
    const quote = m[0]!;
    const start = m.index;
    const end = start + quote.length;
    if (findings.some((f) => !(end <= f.start || start >= f.end))) continue;
    findings.push({
      id: `h_${start}`,
      start,
      end,
      quote,
      type: p.type,
      suggestion: p.suggestion,
    });
  }

  const ambition =
    findings.length === 0
      ? countApproxWords(text) < 12
        ? 0.15
        : 0.45
      : Math.max(0.08, 0.28 - findings.length * 0.04);
  return { ambition, findings };
}

export async function regenerateStorySuggestion(opts: {
  draft: string;
  quote: string;
  type: StoryFindingType;
}): Promise<string> {
  const prompt =
    `Rewrite this cautious phrase from a first-person life vision into one bolder present-tense replacement. ` +
    `The suggestion must slot into the surrounding sentence so the whole line reads as natural, grammatical, ` +
    `professional prose — not a tiny word swap that leaves awkward leftovers (never “kinda wanna be”→“am” ` +
    `if that would yield “I am big in life”; rewrite the whole weak phrase instead). ` +
    `Include punctuation/capitalisation if needed for flow with what comes before/after. ` +
    `Keep specifics and voice. Type of issue: ${opts.type}. Quote: "${opts.quote}". ` +
    `If the quote only signals past doubt/struggle (e.g. "again", "finally", "this time"), reply with suggestion "". ` +
    `Nearby context:\n${draftPlainText(opts.draft).slice(0, 2000)}\n\n` +
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

export async function composeStoryThirdPerson(opts: {
  draft: string;
  firstName: string;
}): Promise<string> {
  const name = opts.firstName.trim() || "They";
  const text = draftPlainText(opts.draft);
  const remote = await postStoryJson("/manifest/story/compose", {
    draft: opts.draft,
    firstName: name,
  });
  if (remote && typeof remote.text === "string" && remote.text.trim()) {
    return remote.text.trim();
  }
  const prompt =
    `Rewrite the following first-person life vision into the third person by first name ("${name} is…"), present tense. ` +
    `Fix grammar and smooth flow. Keep their words, details and ambition. Don't add facts or tone it down. ` +
    `Keep section breaks as a blank line between sections.\n` +
    `Reply with ONLY JSON: {"text":"..."}\n\n` +
    `DRAFT:\n${text.slice(0, 14000)}`;

  const parsed = (await askJson(prompt)) as Record<string, unknown>;
  if (typeof parsed.text === "string" && parsed.text.trim()) {
    return parsed.text.trim();
  }
  throw new Error("Could not compose your story");
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

function countApproxWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function ambitionLabel(ambition: number): string {
  if (ambition < 0.25) return "Sensible";
  if (ambition < 0.45) return "Mostly sensible";
  if (ambition < 0.7) return "Bold";
  return "Delusional";
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
    default:
      return "Hedging";
  }
}

/** UI copy for a raise suggestion; empty string means delete the quote. */
export function raiseSuggestionLabel(suggestion: string): string {
  return suggestion === "" ? "remove" : suggestion;
}
