import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { buildAssistantChatSystemPrompt } from "../lib/assistant-chat-system-prompt";
import { buildCachedMessagesRequestBody } from "../lib/anthropic-prompt-cache";
import { coerceClaudeModel } from "../lib/anthropic-pricing";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TITLE_MODEL = "claude-haiku-4-5";
const TITLE_SYSTEM = [
  "You name chat conversation threads.",
  "Given the user's first message, reply with ONLY a short title.",
  "Rules:",
  "- 3 to 7 words",
  "- Capture the topic or intent; do not copy the message verbatim",
  "- Never echo typos or the full user sentence — paraphrase (e.g. user “list my graitudes” → “Recent gratitudes”)",
  "- No quotation marks, no emoji, no trailing punctuation",
  "- Prefer a concise noun phrase (e.g. \"Morning anxiety before meeting\")",
  "- Output the title alone — nothing else",
].join("\n");

const secrets = new SecretsManagerClient({});
let cachedKey: string | undefined;

async function getClaudeApiKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const arn = process.env.CLAUDE_SECRET_ARN;
  if (!arn) throw new Error("CLAUDE_SECRET_ARN is not set");
  const out = await secrets.send(
    new GetSecretValueCommand({ SecretId: arn }),
  );
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Claude API key secret is empty");
  cachedKey = s;
  return cachedKey;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

function sanitizeTitle(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  t = (t.split(/\r?\n/)[0] ?? "").trim();
  t = t.replace(/\s+/g, " ");
  t = t.replace(/[.!?…]+$/g, "").trim();
  if (!t) return "";
  if (t.length <= 60) return t;
  const clipped = t.slice(0, 59);
  const atWord = clipped.replace(/\s+\S*$/, "").trimEnd();
  return (atWord || clipped).trimEnd();
}

function writeJsonError(
  responseStream: awslambda.HttpResponseStream,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: { "content-type": "application/json" },
  });
  stream.write(JSON.stringify(payload));
  stream.end();
}

function writeJsonOk(
  responseStream: awslambda.HttpResponseStream,
  payload: Record<string, unknown>,
): void {
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: { "content-type": "application/json" },
  });
  stream.write(JSON.stringify(payload));
  stream.end();
}

async function generateTitle(
  apiKey: string,
  message: string,
): Promise<string | null> {
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TITLE_MODEL,
      max_tokens: 40,
      temperature: 0.3,
      system: TITLE_SYSTEM,
      messages: [{ role: "user", content: message.slice(0, 2_000) }],
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(detail.slice(0, 400) || `Anthropic ${upstream.status}`);
  }
  const data = (await upstream.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("")
    .trim();
  return sanitizeTitle(text) || null;
}

async function pipeAnthropicSseToClient(
  upstream: ReadableStream<Uint8Array>,
  out: awslambda.HttpResponseStream,
): Promise<void> {
  const reader = upstream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const json = line.replace(/^data:\s*/, "").trim();
        if (!json || json === "[DONE]") continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(json) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (data.type === "content_block_delta") {
          const delta = data.delta as Record<string, unknown> | undefined;
          if (
            delta?.type === "text_delta" &&
            typeof delta.text === "string" &&
            delta.text.length > 0
          ) {
            out.write(`data: ${JSON.stringify({ d: delta.text })}\n\n`);
          }
        }
        if (data.type === "error") {
          const err = data.error as Record<string, unknown> | undefined;
          const msg =
            typeof err?.message === "string"
              ? err.message
              : "Anthropic stream error";
          out.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        }
      }
    }
  }
  out.write(`data: ${JSON.stringify({ done: true })}\n\n`);
}

async function streamHandler(
  event: APIGatewayProxyEventV2,
  responseStream: awslambda.HttpResponseStream,
  _context: Context,
): Promise<void> {
  const method = event.requestContext?.http?.method ?? "";
  if (method !== "POST") {
    if (method === "OPTIONS") {
      const s = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 204,
        headers: {},
      });
      s.end();
      return;
    }
    writeJsonError(responseStream, 405, { error: "Method not allowed" });
    return;
  }

  let apiKey: string;
  try {
    apiKey = await getClaudeApiKey();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Secret lookup failed";
    writeJsonError(responseStream, 500, { error: msg });
    return;
  }

  let body: {
    messages?: ChatTurn[];
    claudeModel?: string;
    systemSupplement?: string;
    mode?: string;
    message?: string;
  };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    writeJsonError(responseStream, 400, { error: "Invalid JSON body" });
    return;
  }

  if (body.mode === "title") {
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      writeJsonError(responseStream, 400, {
        error: "message string required for title mode",
      });
      return;
    }
    try {
      const title = await generateTitle(apiKey, message);
      if (!title) {
        writeJsonError(responseStream, 502, { error: "Empty title" });
        return;
      }
      writeJsonOk(responseStream, { title });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Title generation failed";
      writeJsonError(responseStream, 502, { error: msg });
    }
    return;
  }

  const raw = body.messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    writeJsonError(responseStream, 400, {
      error: "Field `messages` (non-empty array) is required",
    });
    return;
  }

  const messages: ChatTurn[] = [];
  for (const m of raw) {
    if (
      !m ||
      typeof m !== "object" ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      !m.content.trim()
    ) {
      writeJsonError(responseStream, 400, {
        error:
          "Each message must be { role: 'user' | 'assistant', content: string }",
      });
      return;
    }
    messages.push({ role: m.role, content: m.content.trim() });
  }

  if (messages[messages.length - 1].role !== "user") {
    writeJsonError(responseStream, 400, {
      error: "Last message must be from the user",
    });
    return;
  }

  const model = coerceClaudeModel(body.claudeModel);
  const systemSupplement =
    typeof body.systemSupplement === "string"
      ? body.systemSupplement.trim().slice(0, 48_000)
      : "";
  const system = buildAssistantChatSystemPrompt();
  const requestBody = buildCachedMessagesRequestBody({
    model,
    system,
    ...(systemSupplement ? { systemSupplement } : {}),
    messages,
    maxTokens: systemSupplement ? 1024 : 512,
    stream: true,
  });

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    writeJsonError(responseStream, upstream.status, {
      error: "Anthropic request failed",
      detail: detail.slice(0, 2000),
    });
    return;
  }

  if (!upstream.body) {
    writeJsonError(responseStream, 502, { error: "Empty body from Anthropic" });
    return;
  }

  const out = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });

  try {
    await pipeAnthropicSseToClient(upstream.body, out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stream failed";
    out.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    out.end();
  }
}

export const handler = awslambda.streamifyResponse(streamHandler);
