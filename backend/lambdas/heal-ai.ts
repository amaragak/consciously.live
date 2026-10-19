/**
 * Heal text helpers (cheap Haiku) and a separate risk classifier.
 * POST /heal/ai     — perspective, retry-lens, suggest, friend-swap
 * POST /heal/screen — explicit suicidal intent or self-harm only
 *
 * Model replies stay inside Heal. No crisis copy in suggestions.
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

const RULES = [
  "Aim: acceptance and self-forgiveness, not positivity and not fixing. Help separate \"I did this\" from \"I am this\". No silver linings for a death.",
  "Use only the user's facts. Never invent events, memories, or feelings.",
  "Questions and lenses are about the user's own experience. Never ask about another person's motives or feelings. No advice about another person.",
  "Questions: no advice and no leading questions. Each question is 25 words or fewer, in plain words.",
  "Tone: plain, warm, short. No clinical terms, no diagnoses, no stages of grief.",
  "No relationship advice. Never advise on contact, reconciling, or confronting anyone. Forgiveness means letting go for the user's own sake, not excusing what happened.",
  "Write in the same person the user used (I / we).",
  "Never include crisis numbers, helplines, or support language.",
].join(" ");

function canDoRule(canDo: string): string {
  if (canDo === "yes") {
    return " About half the questions are on acceptance or forgiveness, and the rest are a first small step or what is in their control.";
  }
  if (canDo === "no") {
    return " Questions are acceptance and self-forgiveness only. Never ask what they will do differently or how they will fix it.";
  }
  return " Include exactly one question that helps them decide what is still in their control, for example: What part of this is still in your control, and what isn't?";
}

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

async function haikuJson(system: string, user: string, maxTokens = 1200): Promise<unknown> {
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
        max_tokens: maxTokens,
        temperature: 0.4,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system,
        messages: [{ role: "user", content: user }],
      }),
    ),
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
    .map((c) => c.text)
    .join("\n");
  return extractJsonObject(text);
}

function str(v: unknown, max = 8000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Pattern is handled like regret: flag self-blame, same four lenses, and it is not a loss. */
function typeGuidance(type: string): string {
  if (type === "pattern" || type === "recurring_thought" || type === "belief") {
    return " Treat this like a pattern: flag self-blame and absolutes, and offer the same four lenses (kind, forgive, accept, gave). Be kind, but do not spin it positive. A truer view is more accurate and kinder, not upbeat. This is not about loss.";
  }
  if (type === "regret") {
    return " This is a regret: flag self-blame, and offer the same four lenses (kind, forgive, accept, gave).";
  }
  return "";
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
    if (path.endsWith("/heal/screen")) {
      const text = str(body.text, 6000);
      if (!text) return json(200, { flagged: false });
      const parsed = (await haikuJson(
        [
          "You classify a private piece of writing.",
          "Return JSON {\"flagged\": true} ONLY when the writer states suicidal thoughts or intent, or self-harm.",
          "Normal grief does not qualify, including bleak or hopeless lines such as \"I don't see the point without you\".",
          "Return {\"flagged\": false} for sadness, missing someone, regret, anger, or hopelessness that is not an explicit statement of suicidal intent or self-harm.",
          "No other fields.",
        ].join(" "),
        text,
        120,
      )) as { flagged?: unknown };
      return json(200, { flagged: parsed.flagged === true });
    }

    const action = str(body.action, 40);
    const title = str(body.title, 120) || "this";
    const type = str(body.type, 40) || "other";
    const system = `${RULES} This writing is only about ${title} (${type}).${typeGuidance(type)}`;

    if (action === "perspective") {
      const text = str(body.text, 8000);
      if (!text) return json(200, { flags: [] });
      const parsed = (await haikuJson(
        [
          system,
          "Find only lines that are self-blame, lasting resentment, absolutes, or rumination.",
          "Plain sadness is never flagged.",
          "quote must be an exact substring of the writing.",
          "For each flag return all four lenses at once: kind, forgive, accept, gave.",
          "Each lens is one or two sentences in the user's voice, keeping their facts.",
          'JSON: {"flags":[{"quote":"","kind":"self_blame|resentment|absolute|rumination","lenses":{"kind":"","forgive":"","accept":"","gave":""}}]}',
          "If nothing qualifies, return {\"flags\":[]}.",
        ].join(" "),
        text,
      )) as { flags?: unknown };
      return json(200, {
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      });
    }

    if (action === "retry-lens") {
      const quote = str(body.quote, 500);
      const lens = str(body.lens, 20);
      const text = str(body.text, 8000);
      const parsed = (await haikuJson(
        system +
          " Rewrite only the requested lens. One or two sentences. JSON {\"text\":\"\"}.",
        `Writing:\n${text}\n\nLine:\n${quote}\n\nLens: ${lens}`,
        400,
      )) as { text?: unknown };
      return json(200, { text: str(parsed.text, 600) });
    }

    if (action === "suggest") {
      const writing = str(body.writing, 8000);
      const ask = str(body.ask, 400);
      const parsed = (await haikuJson(
        system +
          " Suggest one short answer built only from the writing. Do not add facts. JSON {\"text\":\"\"}.",
        `Writing about ${title}:\n${writing}\n\nThe user is answering: ${ask}`,
        400,
      )) as { text?: unknown };
      return json(200, { text: str(parsed.text, 800) });
    }

    if (action === "angle") {
      const seeing = str(body.seeingText, 2000);
      const reframe = str(body.reframe, 2000);
      const writing = str(body.writing, 8000);
      const asked = Array.isArray(body.asked)
        ? body.asked.filter((row): row is string => typeof row === "string").slice(-10)
        : [];
      const parsed = (await haikuJson(
        [
          system,
          "Ask one question, 30 words or fewer, that points at something in the user's own writing.",
          "Never offer a reframe, an answer, or advice.",
          "Never repeat a question already asked.",
          'JSON {"question":""}.',
        ].join(" "),
        `How they've been seeing it:\n${seeing || "(empty)"}\n\nHow they see it now:\n${reframe || "(not yet)"}\n\nRecent writing:\n${writing || "(none)"}\n\nAlready asked:\n${asked.join("\n") || "(none)"}`,
        300,
      )) as { question?: unknown };
      return json(200, { question: str(parsed.question, 400) });
    }

    if (action === "setup") {
      const name = title;
      const update = str(body.update, 8000);
      const parsed = (await haikuJson(
        [
          system,
          "Read the name and the first update. Return JSON only.",
          "type is one of grief, heartbreak, regret, resentment, pattern, recurring_thought, belief, fear, shame, other.",
          "badDayText is one or two sentences copied verbatim from the update: the strongest self-judgement or belief. goodDayText is a sentence copied verbatim that is kinder or more hopeful, or null.",
          "canDo is yes, no, or not_sure.",
          "exercises is 10 ranked questions. At least one quotes or refers to something specific they wrote.",
          canDoRule("not_sure"),
          '{"type":"other","badDayText":"","goodDayText":null,"canDo":"not_sure","exercises":[""]}',
        ].join(" "),
        `Name: ${name}\n\nWhat happened:\n${update}`,
        1400,
      )) as { badDayText?: unknown; goodDayText?: unknown; exercises?: unknown };
      const bad = str(parsed.badDayText, 500);
      const good = str(parsed.goodDayText, 500);
      const ok = (value: string) => !value || update.includes(value);
      return json(200, {
        ...parsed,
        badDayText: ok(bad) ? bad : "",
        goodDayText: good && ok(good) ? good : null,
        exercises: Array.isArray(parsed.exercises) ? parsed.exercises : [],
      });
    }

    if (action === "suggest-more") {
      const canDo = str(body.canDo, 20) || "not_sure";
      const parsed = (await haikuJson(
        [
          system,
          canDoRule(canDo),
          "Return 3 new questions. None may repeat a question already asked.",
          '{"questions":["","",""]}',
        ].join(" "),
        str(body.context, 8000),
        500,
      )) as { questions?: unknown };
      return json(200, { questions: Array.isArray(parsed.questions) ? parsed.questions : [] });
    }

    if (action === "after-update") {
      const canDo = str(body.canDo, 20) || "not_sure";
      const parsed = (await haikuJson(
        [
          system,
          canDoRule(canDo),
          "Compare the new update with the previous one and the unanswered exercises.",
          "retire is the ids of unanswered exercises that rely on facts the update changed, or that no longer fit canDo.",
          "add is up to 3 new questions.",
          "goodDayConflict is true only when the good-day view states something the update contradicts.",
          "topic is 2 to 4 words naming that contradiction, or an empty string.",
          '{"retire":[],"add":[],"goodDayConflict":false,"topic":""}',
        ].join(" "),
        str(body.context, 8000),
        700,
      )) as { retire?: unknown; add?: unknown };
      return json(200, {
        retire: Array.isArray(parsed.retire) ? parsed.retire : [],
        add: Array.isArray(parsed.add) ? parsed.add : [],
        goodDayConflict: (parsed as { goodDayConflict?: unknown }).goodDayConflict === true,
        topic: str((parsed as { topic?: unknown }).topic, 40),
      });
    }

    if (action === "lenses") {
      const lens = str(body.lens, 20);
      const parsed = (await haikuJson(
        [
          system,
          "Write in the user's voice, as I. Each lens is 2 or 3 sentences.",
          "Be kind to myself: what they would say to someone they care about.",
          "Forgive: separate what they did from who they are.",
          "Accept: what was and was not in their control.",
          "The long view: how this might look in a few years. No silver linings for a death.",
          lens
            ? `Rewrite only the ${lens} lens. JSON {"text":""}.`
            : 'JSON {"kind":"","forgive":"","accept":"","long":""}.',
        ].join(" "),
        str(body.context, 8000),
        900,
      )) as Record<string, unknown>;
      return json(200, parsed);
    }

    if (action === "friend-swap") {
      const text = str(body.text, 4000);
      const parsed = (await haikuJson(
        system +
          ` Rewrite the note so it is addressed to the user, swapping third-person references to the friend's situation for ${title}. Keep the kindness. JSON {"text":""}.`,
        text,
        500,
      )) as { text?: unknown };
      return json(200, { text: str(parsed.text, 2000) || text });
    }

    return json(400, { error: "Unknown action" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Heal AI failed";
    return json(502, { error: message });
  }
}
