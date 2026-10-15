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
): { start: number; end: number } | null {
  const q = quote.trim();
  if (!q) return null;
  if (
    typeof hintStart === "number" &&
    hintStart >= 0 &&
    draft.slice(hintStart, hintStart + q.length) === q
  ) {
    return { start: hintStart, end: hintStart + q.length };
  }
  const idx = draft.indexOf(q);
  if (idx < 0) return null;
  return { start: idx, end: idx + q.length };
}

async function postStoryJson(
  path: "/manifest/story/raise" | "/manifest/story/compose",
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const base = getMedimadeApiBase();
  if (!base) return null;
  try {
    const res = await medimadeFetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...medimadeApiAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
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
    const quote = typeof r.quote === "string" ? r.quote.trim() : "";
    const suggestion =
      typeof r.suggestion === "string" ? r.suggestion.trim() : "";
    const type = (
      typeof r.type === "string" && FINDING_TYPES.has(r.type as StoryFindingType)
        ? r.type
        : "hedging"
    ) as StoryFindingType;
    if (!quote || !suggestion) continue;
    const hintStart = typeof r.start === "number" ? r.start : undefined;
    const loc = resolveOffsets(text, quote, hintStart);
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

  const remote = await postStoryJson("/manifest/story/raise", { draft });
  if (remote) return parseRaisePayload(remote, text);

  const prompt =
    `You review a first-person life vision written as if already true.\n` +
    `Score ambition 0–1 (0 = sensible/safe, 1 = delightfully delusional). Short drafts can still be low ambition.\n` +
    `Find where the writer played it safe: hedges (hopefully, try to, maybe, someday, I think, kind of), ` +
    `future tense (I will, I'm going to), small thinking (a few, local, small rooms, enough), ` +
    `settling ("which is enough for me"), and doubt.\n` +
    `Even a single cautious sentence should produce findings when it hedges or plays small.\n` +
    `quote MUST be an exact substring of the draft. For each, suggest a bolder present-tense first-person replacement. ` +
    `Keep names, places, and voice. Never invent unrelated facts. At most 8 findings.\n` +
    `Reply with ONLY JSON: {"ambition":0-1,"findings":[{"quote":"exact substring","type":"hedging|future|small|settling|doubt","suggestion":"..."}]}\n\n` +
    `DRAFT:\n${text.slice(0, 12000)}`;

  let parsed: unknown;
  try {
    parsed = await askJson(prompt);
  } catch {
    return heuristicRaise(text);
  }

  const result = parseRaisePayload(parsed as Record<string, unknown>, text);
  if (result.findings.length === 0 && countApproxWords(text) < 40) {
    const local = heuristicRaise(text);
    if (local.findings.length > 0) return local;
  }
  return result;
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
  ];

  const findings: StoryFinding[] = [];
  for (const p of patterns) {
    if (findings.length >= 4) break;
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
    `Rewrite this cautious phrase from a first-person life vision into one bolder present-tense first-person line. ` +
    `Keep specifics and voice. Type of issue: ${opts.type}. Quote: "${opts.quote}". ` +
    `Nearby context:\n${draftPlainText(opts.draft).slice(0, 2000)}\n\n` +
    `Reply with ONLY JSON: {"suggestion":"..."}`;
  try {
    const parsed = (await askJson(prompt)) as Record<string, unknown>;
    if (typeof parsed.suggestion === "string" && parsed.suggestion.trim()) {
      return parsed.suggestion.trim();
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
      return "Doubt";
    default:
      return "Hedging";
  }
}
