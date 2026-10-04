import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { buildClaudeCoachSystemPrompt } from "./_shared/claude-coach-system-prompt";
import { buildMeditationScriptGenerationPrompt } from "./_shared/meditation-script-generate-prompt";
import { coerceClaudeModel } from "./_shared/anthropic-pricing";
import { recordClaudeUsage } from "./_shared/ai-usage";
import { coerceMeditationTargetMinutes } from "./_shared/meditation-target-minutes";
import { buildCachedMessagesRequestBody } from "./_shared/anthropic-prompt-cache";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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

async function pipeAnthropicSseToClient(
  upstream: ReadableStream<Uint8Array>,
  out: awslambda.HttpResponseStream,
  meter?: { model: string; feature: string },
): Promise<void> {
  const reader = upstream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let inputTokens = 0;
  let outputTokens = 0;
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
        if (data.type === "message_start") {
          const msg = data.message as Record<string, unknown> | undefined;
          const usage = msg?.usage as Record<string, unknown> | undefined;
          if (typeof usage?.input_tokens === "number") {
            inputTokens = usage.input_tokens;
          }
        }
        if (data.type === "message_delta") {
          const usage = data.usage as Record<string, unknown> | undefined;
          if (typeof usage?.output_tokens === "number") {
            outputTokens = usage.output_tokens;
          }
        }
        if (data.type === "content_block_delta") {
          const delta = data.delta as Record<string, unknown> | undefined;
          if (
            delta?.type === "text_delta" &&
            typeof delta.text === "string" &&
            delta.text.length > 0
          ) {
            out.write(
              `data: ${JSON.stringify({ d: delta.text })}\n\n`,
            );
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
  if (meter && (inputTokens > 0 || outputTokens > 0)) {
    void recordClaudeUsage({
      model: meter.model,
      inputTokens,
      outputTokens,
      feature: meter.feature,
    });
  }
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
    mode?: string;
    meditationStyle?: string;
    messages?: ChatTurn[];
    transcript?: string;
    /** Web create flow: guided length target in minutes. */
    meditationTargetMinutes?: number;
    /** Fish playback speed (1 = default); used with fleet word targets. */
    speechSpeed?: number;
    /** Web journal flow uses placeholder style; do not lock technique to that label. */
    journalMode?: boolean;
    journalGuidance?: string;
    /** Create › By Program — gather per-session customization intake in order. */
    fromProgram?: boolean;
    /** Dev-only A/B from the create flow; unknown values fall back to Haiku. */
    claudeModel?: string;
  };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    writeJsonError(responseStream, 400, { error: "Invalid JSON body" });
    return;
  }

  const meditationTargetMinutes = coerceMeditationTargetMinutes(
    body.meditationTargetMinutes,
  );

  const mode =
    body.mode === "generate_script" ? "generate_script" : "chat";
  const model = coerceClaudeModel(body.claudeModel);

  let system: string;
  let messages: ChatTurn[];
  let maxTokens: number;

  if (mode === "generate_script") {
    const transcript =
      typeof body.transcript === "string" ? body.transcript.trim() : "";
    const styleForScript =
      typeof body.meditationStyle === "string"
        ? body.meditationStyle.trim()
        : "";
    const journalMode = body.journalMode === true;
    const speechSpeed =
      typeof body.speechSpeed === "number" && Number.isFinite(body.speechSpeed)
        ? body.speechSpeed
        : 1;

    const prompt = buildMeditationScriptGenerationPrompt({
      transcript,
      meditationStyle: styleForScript,
      journalMode,
      targetMinutes: meditationTargetMinutes,
      speechSpeed,
      includeSegmentPlaceholders: false,
    });
    system = prompt.system;
    messages = [{ role: "user", content: prompt.userContent }];
    maxTokens = prompt.maxTokens;
  } else {
    const meditationStyle =
      typeof body.meditationStyle === "string"
        ? body.meditationStyle.trim()
        : "";
    if (!meditationStyle) {
      writeJsonError(responseStream, 400, {
        error: "Field `meditationStyle` (string) is required",
      });
      return;
    }

    const journalMode = body.journalMode === true;
    const fromProgram = body.fromProgram === true;
    const journalGuidance =
      typeof body.journalGuidance === "string" ? body.journalGuidance.trim() : "";
    const systemCachedExtra =
      typeof body.systemCachedExtra === "string"
        ? body.systemCachedExtra.trim()
        : "";
    const systemSupplement =
      typeof body.systemSupplement === "string"
        ? body.systemSupplement.trim()
        : "";

    const raw = body.messages;
    if (!Array.isArray(raw) || raw.length === 0) {
      writeJsonError(responseStream, 400, {
        error: "Field `messages` (non-empty array) is required",
      });
      return;
    }

    messages = [];
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

    system = buildClaudeCoachSystemPrompt({
      meditationStyle,
      journalMode,
      targetMinutes: meditationTargetMinutes,
      fromProgram,
    });
    if (journalGuidance && !systemCachedExtra && !systemSupplement) {
      // Legacy path: fold guidance into system when caller isn't using cache blocks.
      system += `\n\nThe creator asked you to interpret the journal entry with this guidance (this is not a meditation-style override):\n${journalGuidance}`;
    }

    maxTokens = fromProgram ? 512 : 256;

    const cachedExtra = [
      systemCachedExtra,
      journalGuidance && (systemCachedExtra || systemSupplement)
        ? `Journal guidance:\n${journalGuidance}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const upstreamChat = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(
        buildCachedMessagesRequestBody({
          model,
          system,
          ...(cachedExtra ? { systemCachedExtra: cachedExtra } : {}),
          ...(systemSupplement ? { systemSupplement } : {}),
          messages,
          maxTokens,
          stream: true,
        }),
      ),
    });

    if (!upstreamChat.ok) {
      const detail = await upstreamChat.text();
      writeJsonError(responseStream, upstreamChat.status, {
        error: "Anthropic request failed",
        detail: detail.slice(0, 2000),
      });
      return;
    }

    if (!upstreamChat.body) {
      writeJsonError(responseStream, 502, { error: "Empty body from Anthropic" });
      return;
    }

    const outChat = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
    await pipeAnthropicSseToClient(upstreamChat.body, outChat, {
      model,
      feature: "claude-chat",
    });
    return;
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      stream: true,
    }),
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
    await pipeAnthropicSseToClient(upstream.body, out, {
      model,
      feature: "claude-coach",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stream failed";
    out.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    out.end();
  }
}

export const handler = awslambda.streamifyResponse(streamHandler);
