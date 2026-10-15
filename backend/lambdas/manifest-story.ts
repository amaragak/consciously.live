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
import { CLAUDE_HAIKU_45_MODEL_ID } from "./_shared/anthropic-pricing";
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
    body: JSON.stringify({
      model: CLAUDE_HAIKU_45_MODEL_ID,
      max_tokens: 4096,
      temperature: 0.4,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    }),
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

function resolveOffsets(
  draft: string,
  quote: string,
): { start: number; end: number } | null {
  const q = quote.trim();
  if (!q) return null;
  const idx = draft.indexOf(q);
  if (idx < 0) return null;
  return { start: idx, end: idx + q.length };
}

const FINDING_TYPES = new Set([
  "hedging",
  "future",
  "small",
  "settling",
  "doubt",
]);

async function handleRaise(draftRaw: string) {
  const draft = plainDraft(draftRaw);
  if (!draft) return json(400, { error: "draft is required" });

  const system =
    "You review first-person life visions written as already true. Return ONLY valid JSON.";
  const user = [
    "Score ambition 0–1 (0 = sensible/safe, 1 = delightfully delusional). Short drafts can still be low ambition.",
    "Find where the writer played it safe: hedges (hopefully, try to, maybe, someday, I think, kind of),",
    "future tense (I will, I'm going to), small thinking (a few, local, small rooms, enough),",
    'settling ("which is enough for me"), and doubt.',
    "Even a single cautious sentence should produce findings when it hedges or plays small.",
    "quote MUST be an exact substring of the draft.",
    "For each, suggest a bolder present-tense first-person replacement.",
    "Keep names, places, and voice. Never invent unrelated facts. At most 8 findings.",
    'JSON shape: {"ambition":0-1,"findings":[{"quote":"exact substring","type":"hedging|future|small|settling|doubt","suggestion":"..."}]}',
    "",
    "DRAFT:",
    draft,
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
    const quote = typeof r.quote === "string" ? r.quote.trim() : "";
    const suggestion =
      typeof r.suggestion === "string" ? r.suggestion.trim() : "";
    const type =
      typeof r.type === "string" && FINDING_TYPES.has(r.type)
        ? r.type
        : "hedging";
    if (!quote || !suggestion) continue;
    const loc = resolveOffsets(draft, quote);
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

async function handleCompose(draftRaw: string, firstName: string) {
  const draft = plainDraft(draftRaw);
  if (!draft) return json(400, { error: "draft is required" });
  const name = firstName.trim() || "They";

  const system =
    "You rewrite life visions into polished third person. Return ONLY valid JSON.";
  const user = [
    `Rewrite the following first-person life vision into the third person by first name ("${name} is…"), present tense.`,
    "Fix grammar and smooth flow. Keep their words, details and ambition. Don't add facts or tone it down.",
    "Keep section breaks as a blank line between sections.",
    'JSON shape: {"text":"..."}',
    "",
    "DRAFT:",
    draft,
  ].join("\n");

  const parsed = (await haikuJson(system, user)) as Record<string, unknown>;
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!text) return json(502, { error: "Empty compose result" });
  return json(200, { text });
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
      return await handleRaise(draft);
    }
    if (path.endsWith("/manifest/story/compose")) {
      const draft = typeof body.draft === "string" ? body.draft : "";
      const firstName =
        typeof body.firstName === "string" ? body.firstName : "";
      return await handleCompose(draft, firstName);
    }
    return json(404, { error: "Unknown story route" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Story LLM failed";
    return json(500, { error: msg });
  }
}
