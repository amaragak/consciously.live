/**
 * Manifesto Story LLM:
 * POST /manifest/story/raise  — find safe phrasing + suggestions
 * POST /manifest/story/compose — first person → third person by name
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  CLAUDE_HAIKU_45_MODEL_ID,
  withClaudeThinkingOff,
} from "./_shared/anthropic-pricing";
import { requireUserJson } from "./_shared/consciously-auth-http";

const secrets = new SecretsManagerClient({});
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_DRAFT = 14000;

let cachedClaudeKey: string | undefined;

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(payload),
  };
}

function options(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,Authorization,X-Medimade-Authorization",
      "Access-Control-Max-Age": "86400",
    },
    body: "",
  };
}

async function getClaudeApiKey(): Promise<string> {
  if (cachedClaudeKey) return cachedClaudeKey;
  const arn = process.env.CLAUDE_SECRET_ARN;
  if (!arn) throw new Error("CLAUDE_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Claude API key secret is empty");
  cachedClaudeKey = s;
  return cachedClaudeKey;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

async function haikuJson(system: string, user: string): Promise<unknown> {
  const apiKey = await getClaudeApiKey();
  // Haiku 5.5 defaults to adaptive thinking (slow + can exhaust max_tokens
  // before any text). Disable thinking for these short JSON transforms.
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(withClaudeThinkingOff({
      model: CLAUDE_HAIKU_45_MODEL_ID,
      max_tokens: 4096,
      temperature: 0.4,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    })),
  });
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Claude HTTP ${res.status}`);
  }
  const text = (data.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n");
  if (!text.trim()) {
    throw new Error("Claude returned no text (thinking-only response)");
  }
  return extractJsonObject(text);
}

function plainDraft(raw: string): string {
  return raw
    .replace(/\u00a7BREAK\u00a7/g, "\n\n")
    .replace(/§BREAK§/g, "\n\n")
    // Editor-only prompt labels — never send to the model.
    .replace(/§L§[^§\n]*§[01]§[^§\n]*§\n?/g, "")
    .trim()
    .slice(0, MAX_DRAFT);
}

/** Answers under [Prompt: …] so Raise stays true to each cue. */
function raiseModelDraft(raw: string, raiseContextRaw: unknown): string {
  if (typeof raiseContextRaw === "string" && raiseContextRaw.trim()) {
    return raiseContextRaw.trim().slice(0, MAX_DRAFT);
  }
  // Decode §L§ labels in place when the client sends the full editor draft.
  const lines = raw
    .replace(/\u00a7BREAK\u00a7/g, "\n\n")
    .replace(/§BREAK§/g, "\n\n")
    .split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const m = /^§L§([^§]*)§[01]§([^§]*)§$/.exec(line.trim());
    if (m) {
      let promptText = "";
      try {
        promptText = decodeURIComponent(m[2] ?? "");
      } catch {
        promptText = m[2] ?? "";
      }
      if (promptText.trim()) out.push(`[Prompt: ${promptText.trim()}]`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim().slice(0, MAX_DRAFT) || plainDraft(raw);
}

function resolveOffsets(
  draft: string,
  quote: string,
  deletion = false,
): { start: number; end: number } | null {
  // Prefer exact match so leading whitespace in deletion quotes is kept.
  if (quote && draft.includes(quote)) {
    const idx = draft.indexOf(quote);
    return { start: idx, end: idx + quote.length };
  }
  const q = quote.trim();
  if (!q) return null;
  const idx = draft.indexOf(q);
  if (idx < 0) return null;
  let start = idx;
  const end = idx + q.length;
  // Removals: eat the preceding space so "love me again" → "love me".
  if (deletion && start > 0 && /\s/.test(draft[start - 1]!)) {
    start -= 1;
  }
  return { start, end };
}

const FINDING_TYPES = new Set([
  "hedging",
  "future",
  "small",
  "settling",
  "doubt",
  "negative",
]);

function parseRaiseLocks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (typeof row !== "string") continue;
    const n = row.trim().toLowerCase().replace(/\s+/g, " ");
    if (n.length < 4 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 80) break;
  }
  return out;
}

function parseRaiseValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (typeof row !== "string") continue;
    const n = row.trim().replace(/\s+/g, " ");
    if (n.length < 1 || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n.slice(0, 80));
    if (out.length >= 20) break;
  }
  return out;
}

async function handleRaise(
  draftRaw: string,
  raiseLocksRaw: unknown,
  raiseContextRaw: unknown,
  raiseValuesRaw: unknown,
) {
  const draft = plainDraft(draftRaw);
  if (!draft) return json(400, { error: "draft is required" });
  let forModel = raiseModelDraft(draftRaw, raiseContextRaw) || draft;
  const raiseValues = parseRaiseValues(raiseValuesRaw);
  if (
    raiseValues.length > 0 &&
    !/Writer's values/i.test(forModel)
  ) {
    forModel =
      "Writer's values (soft influence — colour tone and larger rewrites; " +
      "do NOT centre every suggestion on these or force-mention them):\n" +
      raiseValues.map((v) => `- ${v}`).join("\n") +
      "\n\n" +
      forModel;
  }
  const raiseLocks = parseRaiseLocks(raiseLocksRaw);

  const system =
    "You raise the ambition of first-person life visions written as already true. Return ONLY valid JSON.";
  const user = [
    "Score ambition 0–1 (0 = sensible/safe, 1 = delightfully delusional). Short drafts can still be low ambition.",
    "Find where the writer played it safe: hedges (hopefully, try to, maybe, someday, I think, kind of, kinda, wanna),",
    "future tense (I will, I'm going to), small thinking (a few, local, small rooms, enough),",
    'settling ("which is enough for me"), lukewarm affection or desire',
    "(like → love, enjoy → adore, okay with → thrilled by, fine → wonderful),",
    "clumsy or unprofessional wording, past-doubt leftovers that imply prior struggle",
    '(again, finally, this time, still) — remove those with suggestion "",',
    "(include the leading space in quote when deleting a trailing word),",
    "and wholly negative / self-degrading / grotesque passages that are the opposite of a life vision.",
    "Steer away from past difficulty — the life is already true, with no comeback story.",
    "",
    "PROMPT AWARENESS (required):",
    "- Answers sit under [Prompt: …] lines. Honour that prompt’s subject and timeframe.",
    "- Bad: prompt about morning → suggestion with “every night” / evening.",
    "- Good: morning prompt → raise the morning (rituals, waking, breakfast, daylight).",
    "- When [Life area: …], Dream:, and What it looks like: appear above an answer, stay inside",
    "  that life area’s dream and vision — raise ambition within that domain, don’t drift elsewhere.",
    "- When “Writer's values” (or [Value: …]) appear: let them softly influence tone and larger rewrites.",
    "  Do not centre every suggestion on the values or force-mention them in small optimisations.",
    "- quote and suggestion must be answer text only — never copy meta lines",
    "  ([Prompt:…], [Life area:…], Dream:, What it looks like:, Writer's values, [Value:…]).",
    "",
    "SUGGESTION FIELD (required):",
    "- suggestion must be ONLY the rewritten first-person text that replaces quote — nothing else.",
    "- Do not preface, explain, refuse, or instruct. Bad: “Replace the whole passage with: I wake…”.",
    "  Good: “I wake each morning in a sun-filled loft…”.",
    "",
    "NEGATIVE (type negative) vs OPTIMISE:",
    "- Flag lines where the writer puts themselves down, judges themselves harshly, or describes others",
    "  thinking badly of them (e.g. “my friends would describe me as a massive prick”).",
    "- type = \"negative\". suggestion = the positive opposite, same subject and specifics, same person as the text",
    "  (first person if the quote is first person). Never invent a grammar lesson — only the positive rewrite.",
    "- If the quoted span is wholly negative/degrading misery without a clear “others think badly” shape:",
    "  still type negative; suggestion = a complete sincere rewrite of a vivid good life (total rewrite OK),",
    "  matching the prompt’s subject.",
    "- If the line is fair/sensible but just lacks delusional optimism: type hedging|future|small|settling|doubt;",
    "  keep the same theme and details; only raise the ceiling (same topic, bolder).",
    "- Never flag grammar. Grammar is for Prepare for narration, not Raise.",
    "",
    "AMBITION LEAP (required):",
    "- For each finding, jump straight to the delightfully delusional option — one bold leap,",
    "  not a timid half-step that will need raising again.",
    '- Bad: “local rooms”→“packed houses” (still small; invites a second pass).',
    '  Good: “play music in local rooms”→“play sold-out arenas across the country”.',
    "",
    "QUALITY (required):",
    "- Mentally apply every suggestion into the draft. Read the FULL sentence after the swap.",
    "  It must be natural, grammatical, professional present-tense English — correct prepositions,",
    "  articles, and verb forms. Fix punctuation/capitalisation so clauses do not smash together.",
    "- Prefer the smallest quote that still leaves a polished sentence after replacement.",
    "  If a tiny swap would leave awkward leftovers, expand the quote and rewrite the whole phrase.",
    "- Bad: “kinda wanna be”→“am” (yields “I am big in life”).",
    '  Good: “kinda wanna be big in life”→“live a big life” (or “I’m living a big life”).',
    '- Bad: “local rooms”→“packed houses” yielding “I play music packed houses…”.',
    '  Good: “play music in local rooms”→“play sold-out arenas across the country”.',
    "- Never drop a preposition the surrounding words still need (in, to, for, with, at, of).",
    "- Bad: leaving slangy residue (“ya know”, “big in life”, “its in gods hands”) beside a bold insert.",
    "- Keep names, places, and the writer’s voice when optimising. Never invent unrelated facts. At most 8 findings.",
    "- Preserve positive figures the writer names (Jesus, God, Mary, a partner, a guru, etc.). Do not swap",
    "  “Jesus” for “God” or generalise a beloved name — only rewrite degrading/negative parts around them.",
    "- Do not suggest optimise changes (hedging|future|small|settling|doubt) inside ALREADY CHECKED",
    "  sentences (or close rewrites of them).",
    "- ALWAYS still flag type=negative on overtly negative / self-degrading text even if that sentence",
    "  appears under ALREADY CHECKED — locks never suppress negative.",
    "",
    "NO DUPLICATE SPECIFICS (required):",
    "- Mentally apply ALL suggestions together. A distinctive invented flourish may appear at most once",
    "  in the whole draft — never paste the same specific image into two answers/sections.",
    "- Distinctive = brand/status names, signature luxury images, unique proper nouns you invent",
    '  (e.g. “Michelin-starred”, “gold plates”, a named penthouse view). Generic adjectives are fine to reuse.',
    "- If the draft already has such a flourish, do not invent the same one again elsewhere.",
    "- Bad: two findings both add “Michelin-starred feasts every night”.",
    "- Good: one dining raise uses Michelin; another raises abundance with a different vivid detail",
    "  (private chef, farm-to-table, a feast after the match) — or raise without repeating that image.",
    "",
    "Example: “I think my mates like me again” → “I think”→“I know”, “like”→“love”, “ again”→\"\"",
    'so the line becomes “I know my mates love me”.',
    'JSON shape: {"ambition":0-1,"findings":[{"quote":"exact substring","type":"hedging|future|small|settling|doubt|negative","suggestion":"..."}]}',
    "",
    ...(raiseLocks.length
      ? [
          "ALREADY CHECKED — skip optimise types (hedging|future|small|settling|doubt) in these sentences",
          "(user kept a positive-but-not-delusional line). ALWAYS still flag type=negative if the text",
          "is overtly negative / self-degrading — locks do not suppress negative:",
          ...raiseLocks.map((l) => `- ${l}`),
          "",
        ]
      : []),
    "DRAFT (prompt-tagged; quote must match answer text only):",
    forModel,
  ].join("\n");

  const parsed = (await haikuJson(system, user)) as Record<string, unknown>;
  const ambitionRaw = typeof parsed.ambition === "number" ? parsed.ambition : 0.4;
  const ambition = Math.min(1, Math.max(0, ambitionRaw));
  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: Array<Record<string, unknown>> = [];
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
    const type =
      typeof r.type === "string" && FINDING_TYPES.has(r.type)
        ? r.type
        : "hedging";
    const loc = resolveOffsets(draft, quote, deletion);
    if (!loc) continue;
    if (findings.some((f) => {
      const s = f.start as number;
      const e = f.end as number;
      return !(loc.end <= s || loc.start >= e);
    })) {
      continue;
    }
    findings.push({
      id: `f_${i++}_${loc.start}`,
      start: loc.start,
      end: loc.end,
      quote,
      type,
      suggestion,
    });
  }
  findings.sort((a, b) => (a.start as number) - (b.start as number));
  return json(200, { ambition, findings });
}

type ComposeSectionIn = {
  promptId: string | null;
  promptText: string;
  text: string;
  /** rewrite = produce new third-person text; context = flow only, do not rewrite. */
  role?: "rewrite" | "context";
};

function parseComposeSections(raw: unknown): ComposeSectionIn[] {
  if (!Array.isArray(raw)) return [];
  const out: ComposeSectionIn[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) continue;
    const role =
      o.role === "rewrite" || o.role === "context" ? o.role : undefined;
    out.push({
      promptId:
        o.promptId === null || o.promptId === undefined
          ? null
          : typeof o.promptId === "string"
            ? o.promptId
            : null,
      promptText: typeof o.promptText === "string" ? o.promptText : "",
      text: o.text.trim().slice(0, 8000),
      ...(role ? { role } : {}),
    });
    if (out.length >= 40) break;
  }
  return out;
}

type StoryPronouns = "she_her" | "he_him" | "they_them";

function parseStoryPronouns(raw: unknown): StoryPronouns {
  if (raw === "she_her" || raw === "he_him" || raw === "they_them") return raw;
  return "they_them";
}

function pronounComposeCue(name: string, pronouns: StoryPronouns): string {
  const map = {
    she_her: {
      label: "she/her",
      subject: "she",
      object: "her",
      possessive: "her",
      possessivePronoun: "hers",
      reflexive: "herself",
    },
    he_him: {
      label: "he/him",
      subject: "he",
      object: "him",
      possessive: "his",
      possessivePronoun: "his",
      reflexive: "himself",
    },
    they_them: {
      label: "they/them",
      subject: "they",
      object: "them",
      possessive: "their",
      possessivePronoun: "theirs",
      reflexive: "themselves",
    },
  } as const;
  const p = map[pronouns];
  return [
    `PRONOUNS (required): Refer to ${name} with ${p.label} only`,
    `(subject “${p.subject}”, object “${p.object}”, possessive “${p.possessive}” / “${p.possessivePronoun}”,`,
    `reflexive “${p.reflexive}”).`,
    `Example: “${name} wakes each morning… ${p.subject} feels… friends describe ${p.object} as…”.`,
    "Never guess gender from the name. Never switch to other gendered pronouns.",
  ].join(" ");
}

async function handleCompose(
  draftRaw: string,
  firstName: string,
  sectionsIn: ComposeSectionIn[],
  pronounsRaw: unknown,
) {
  const name = firstName.trim() || "They";
  const pronouns = parseStoryPronouns(pronounsRaw);
  const pronounCue = pronounComposeCue(name, pronouns);
  const sections =
    sectionsIn.length > 0
      ? sectionsIn
      : plainDraft(draftRaw)
        ? [
            {
              promptId: null as string | null,
              promptText: "",
              text: plainDraft(draftRaw),
            },
          ]
        : [];
  if (sections.length === 0) return json(400, { error: "draft is required" });

  const rewriteOnly = sections.some((s) => s.role === "rewrite");
  const targets = rewriteOnly
    ? sections.filter((s) => s.role === "rewrite")
    : sections;

  const listed = sections
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

  const quality = [
    "Fix grammar and smooth flow into complete present-tense sentences.",
    "Keep their ambition and specifics. Don't invent unrelated facts.",
    "If a section is overtly self-insulting, degrading, or full of slurs, rewrite it into a sincere",
    "positive life-vision equivalent on the same subject — never leave self-put-downs in the narration.",
    "Do not copy a distinctive detail from one section into another. If the same highly specific flourish",
    "(brand, signature luxury image) already appears twice in the source, keep it once where it fits best",
    "and vary or drop the echo in the other section.",
  ];

  const system =
    "You rewrite life visions into polished third person, preserving section structure. Return ONLY valid JSON.";
  const user = rewriteOnly
    ? [
        `Rewrite ONLY the sections marked [REWRITE] into the third person by first name ("${name} is…"), present tense.`,
        "Sections marked [CONTEXT] are for narrative flow only — do not rewrite them and do not include them in the reply.",
        pronounCue,
        ...quality,
        "For each rewritten section, invent a short print heading of 1–4 plain words (nouns/phrases), never the prompt question.",
        'Opening (id=opening) heading must be "Opening" when the section has no prompt.',
        "Return only the rewritten sections, with matching id values.",
        'JSON shape: {"sections":[{"id":"opening|promptId","heading":"…","text":"…"}]}',
        "",
        "SECTIONS:",
        listed,
      ].join("\n")
    : [
        `Rewrite each first-person section into the third person by first name ("${name} is…"), present tense.`,
        pronounCue,
        ...quality,
        "For each section, invent a short print heading of 1–4 plain words (nouns/phrases), never the prompt question.",
        'Opening (id=opening) heading must be "Opening" when the section has no prompt.',
        "Return the same number of sections, in the same order, with matching id values.",
        'JSON shape: {"sections":[{"id":"opening|promptId","heading":"…","text":"…"}]}',
        "",
        "SECTIONS:",
        listed,
      ].join("\n");

  const parsed = (await haikuJson(system, user)) as Record<string, unknown>;
  const rawOut = Array.isArray(parsed.sections) ? parsed.sections : [];
  const outSections: Array<{
    promptId: string | null;
    heading: string;
    text: string;
  }> = [];
  for (let i = 0; i < targets.length; i++) {
    const src = targets[i]!;
    const row =
      rawOut.find(
        (r) =>
          r &&
          typeof r === "object" &&
          (r as Record<string, unknown>).id === (src.promptId ?? "opening"),
      ) ?? (rewriteOnly ? undefined : rawOut[i]);
    const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const text =
      typeof o.text === "string" && o.text.trim()
        ? o.text.trim()
        : src.text;
    const heading =
      src.promptId === null
        ? "Opening"
        : typeof o.heading === "string" && o.heading.trim()
          ? o.heading.trim().slice(0, 48)
          : "Chapter";
    outSections.push({
      promptId: src.promptId,
      heading,
      text,
    });
  }
  const text = outSections.map((s) => s.text).join("\n\n");
  if (!text.trim()) return json(502, { error: "Empty compose result" });
  return json(200, { text, sections: outSections });
}

async function handleSummarize(
  firstName: string,
  sections: Array<{ id: string; heading: string; text: string }>,
  pronounsRaw: unknown,
) {
  const name = firstName.trim() || "They";
  const pronouns = parseStoryPronouns(pronounsRaw);
  const pronounCue = pronounComposeCue(name, pronouns);
  if (sections.length === 0) {
    return json(400, { error: "sections required" });
  }
  const listed = sections
    .map((s) => `### ${s.id} (${s.heading})\n${s.text}`)
    .join("\n\n");
  const system =
    "You summarise life visions for a printed manifesto. Return ONLY valid JSON.";
  const user = [
    `Write in the third person by first name ("${name}"), present tense, plain language.`,
    pronounCue,
    "Keep the most specific details and the ambition. Don't add facts.",
    "summary: 130–170 words covering the whole story.",
    "sectionSummaries: object keyed by section id, each value 1–3 sentences.",
    'JSON shape: {"summary":"…","sectionSummaries":{"opening":"…","promptId":"…"}}',
    "",
    "SECTIONS:",
    listed.slice(0, 12000),
  ].join("\n");
  const parsed = (await haikuJson(system, user)) as Record<string, unknown>;
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const sectionSummaries: Record<string, string> = {};
  if (
    parsed.sectionSummaries &&
    typeof parsed.sectionSummaries === "object"
  ) {
    for (const [k, v] of Object.entries(
      parsed.sectionSummaries as Record<string, unknown>,
    )) {
      if (typeof v === "string" && v.trim()) {
        sectionSummaries[k] = v.trim();
      }
    }
  }
  if (!summary) return json(502, { error: "Empty summary" });
  return json(200, { summary, sectionSummaries });
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return options();
  if (method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireUserJson(event);
  if ("statusCode" in auth) return auth;

  let bodyRaw = event.body ?? "";
  if (event.isBase64Encoded && bodyRaw) {
    bodyRaw = Buffer.from(bodyRaw, "base64").toString("utf-8");
  }
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(bodyRaw || "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const path = (event.rawPath || event.requestContext.http.path || "").replace(
    /\/+$/,
    "",
  );

  try {
    if (path.endsWith("/manifest/story/raise")) {
      const draft = typeof body.draft === "string" ? body.draft : "";
      return await handleRaise(
        draft,
        body.raiseLocks,
        body.raiseContext,
        body.raiseValues,
      );
    }
    if (path.endsWith("/manifest/story/compose")) {
      const draft = typeof body.draft === "string" ? body.draft : "";
      const firstName =
        typeof body.firstName === "string" ? body.firstName : "";
      return await handleCompose(
        draft,
        firstName,
        parseComposeSections(body.sections),
        body.pronouns,
      );
    }
    if (path.endsWith("/manifest/story/summarize")) {
      const firstName =
        typeof body.firstName === "string" ? body.firstName : "";
      const sections = Array.isArray(body.sections)
        ? body.sections
            .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
            .map((o) => ({
              id: typeof o.id === "string" ? o.id : "",
              heading: typeof o.heading === "string" ? o.heading : "",
              text: typeof o.text === "string" ? o.text : "",
            }))
            .filter((s) => s.id && s.text.trim())
        : [];
      return await handleSummarize(firstName, sections, body.pronouns);
    }
    return json(404, { error: "Unknown story route" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Story LLM failed";
    return json(500, { error: msg });
  }
}
