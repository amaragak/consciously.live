/**
 * POST /affirmations/generate — eleven daily lines (Haiku). With `plan`, one line
 * per slot of the app's balanced mix; with `context` (older builds), free-form.
 * POST /affirmations/speak — read those lines in a Speechify voice.
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
import { getSpeechifyApiKey, speechifyTtsMp3 } from "./_shared/speechify-tts";

const secrets = new SecretsManagerClient({});
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const INSTRUCTIONS = `You write eleven short daily affirmations for one person.

Below is what they've written in the app. Use it only to understand who they are, what they want and what they're working through. It is context, not a checklist: you don't need to cover any particular part of it, and the lines don't need to map to it.

CONTEXT (JSON):
- dreams: life areas with their dream, "the moment", and current goal
- values: their values
- manifesto: their manifesto line
- working_through: Heal items (bad-day and good-day lines) and recurring doubts or worries from their writing (left out if they've turned this off)
- recent: affirmations from the last 14 days, kept lines, and lines they marked "not for me"

RULES FOR EVERY LINE:
- First person, present tense, one sentence, max 16 words.
- Believable today. A stretch, not a fantasy. If they wouldn't nod while reading it, rewrite it.
- Never invent achievements, numbers, fame, money or outcomes they haven't written about.
- Prefer process and identity ("I make time for…", "I'm becoming someone who…", "I can…") over finished results.
- Where something is hard for them, acknowledge it and turn towards what's true and possible; never deny it outright.
- Reuse their own words and phrases where it helps.
- Plain language: no "universe", "abundance", "vibration", "manifesting", no exclamation marks, no emoji, no clichés ("I am enough", "everything happens for a reason").
- Don't repeat or closely paraphrase anything in recent, and steer away from the themes of "not for me" lines.
- The eleven lines should feel different from each other; don't write several variations of the same idea.

OUTPUT (JSON only):
{"affirmations":[
 {"text":"…","drew_on":"Music"},
 …11 items
]}
"drew_on" is the short name of the life area, value or Heal item the line most clearly comes from, or null if it isn't clearly from one.`;

/** Balanced daily mix: the app picks the eleven slots, the model writes one line per slot. */
const MIX_INSTRUCTIONS = `You write a person's daily affirmations, one line per slot.

INPUT (JSON):
- slots: eleven slots in order. Each has a "kind":
  - "general": nothing personal. A universal affirmation of worth, gratitude, love, calm, trust, the body or the present moment. Examples of the register: "I am grateful for my life." "I am loved." "I am enough as I am." "I trust myself." Usually under 8 words.
  - "value": one of their values ("value"). Write a line about living that value. Don't just name it; show it in what they do or how they are.
  - "area": one of their life areas ("area": name, dream, the moment, current goal). Write about who they are and what they do in that area, not the goal restated. If two slots share an area, the "angle" says which to write: "identity" (who they are becoming) or "practice" (what they do, day to day). Never two versions of the same idea.
  - "block": something in their way ("block": an obstacle from a life area, or a Heal item with its hard-day and good-day lines). Write the positive stance they're growing into. Don't name the problem, and never describe it harshly.
- manifesto: their manifesto line, for tone only.
- recent: lines from the last 14 days, kept lines, and lines they marked "not for me".

RULES FOR EVERY LINE:
- First person, present tense, one sentence, under 15 words.
- Plain, concrete and believable today. No hype, nothing that promises outcomes, no invented achievements, numbers, fame or money.
- No "universe", "abundance", "vibration", "manifesting", no exclamation marks, no emoji.
- Don't repeat or closely paraphrase anything in recent; steer away from the themes of "not for me" lines.
- No two lines (including alternatives) open with the same three words. Vary the openings; don't start every line with "I am".
- Reuse their own words where it helps, for personal slots only.

For each slot also write "alt": a second, different line for the same slot, following the same rules.

OUTPUT (JSON only):
{"affirmations":[{"slot":1,"text":"…","alt":"…"}, …one per slot]}`;

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

async function haikuJson(
  user: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {},
): Promise<unknown> {
  const apiKey = await getClaudeApiKey();
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(
      withClaudeThinkingOff({
        model: CLAUDE_HAIKU_45_MODEL_ID,
        max_tokens: opts.maxTokens ?? 1400,
        temperature: opts.temperature ?? 0.4,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system: opts.system ?? INSTRUCTIONS,
        messages: [{ role: "user", content: user }],
      }),
    ),
  });
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message || `Claude request failed (${res.status})`);
  }
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
  return extractJsonObject(text);
}

function parseAffirmations(raw: unknown): { text: string; drew_on: string | null }[] {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(root.affirmations) ? root.affirmations : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const o = row as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) return [];
    const drew = typeof o.drew_on === "string" ? o.drew_on.trim() : "";
    return [{ text, drew_on: drew || null }];
  });
}

function parseMixLines(raw: unknown): { slot: number; text: string; alt: string | null }[] {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(root.affirmations) ? root.affirmations : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const o = row as Record<string, unknown>;
    const slot = typeof o.slot === "number" ? Math.round(o.slot) : Number(o.slot);
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!Number.isFinite(slot) || !text) return [];
    const alt = typeof o.alt === "string" && o.alt.trim() ? o.alt.trim() : null;
    return [{ slot, text, alt }];
  });
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
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyRaw || "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const path = event.rawPath || "";
  try {
    if (path.endsWith("/speak")) {
      const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
      const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
      if (!text || !voiceId) return json(400, { error: "text and voiceId are required" });
      const apiKey = await getSpeechifyApiKey();
      const audio = await speechifyTtsMp3({
        apiKey,
        text,
        voiceId,
        rate: "0%",
        emotion: "calm",
        sentenceBreakMs: 420,
      });
      return json(200, {
        audioBase64: audio.toString("base64"),
        contentType: "audio/aac",
      });
    }

    if (body.plan && typeof body.plan === "object") {
      const parsed = await haikuJson(`INPUT:\n${JSON.stringify(body.plan).slice(0, 24000)}`, {
        system: MIX_INSTRUCTIONS,
        maxTokens: 2000,
        temperature: 0.7,
      });
      const affirmations = parseMixLines(parsed).slice(0, 11);
      if (!affirmations.length) return json(502, { error: "No affirmations in the reply" });
      return json(200, { affirmations });
    }

    // Older app builds send the whole context and get eleven free-form lines.
    const context = body.context && typeof body.context === "object" ? body.context : {};
    const parsed = await haikuJson(`CONTEXT:\n${JSON.stringify(context).slice(0, 24000)}`);
    const affirmations = parseAffirmations(parsed).slice(0, 11);
    if (!affirmations.length) return json(502, { error: "No affirmations in the reply" });
    return json(200, { affirmations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Affirmations failed";
    console.error("affirmations", msg);
    return json(502, { error: msg });
  }
}
