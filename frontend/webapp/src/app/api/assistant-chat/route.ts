import { NextResponse } from "next/server";
import { buildCachedMessagesRequestBody } from "@/lib/anthropic-prompt-cache";
import { buildAssistantChatSystemPrompt } from "@/lib/assistant-chat-system-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Turn = { role: "user" | "assistant"; content: string };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function pipeAnthropicToClientSse(
  upstream: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      const dec = new TextDecoder();
      let buf = "";
      try {
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
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ d: delta.text })}\n\n`,
                    ),
                  );
                }
              }
              if (data.type === "error") {
                const err = data.error as Record<string, unknown> | undefined;
                const msg =
                  typeof err?.message === "string"
                    ? err.message
                    : "Anthropic stream error";
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
                );
              }
            }
          }
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Stream failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * App-control assistant chat — separate from `/api/medimade-chat`.
 * Requires `NEXT_PUBLIC_ASSISTANT_CHAT_URL` (Lambda) or `ANTHROPIC_API_KEY` /
 * `CLAUDE_API_KEY`. No canned stub replies.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body as { messages?: Turn[]; claudeModel?: string })
    ?.messages;
  const claudeModel =
    typeof (body as { claudeModel?: string })?.claudeModel === "string"
      ? (body as { claudeModel: string }).claudeModel.trim()
      : "";

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages array required" },
      { status: 400 },
    );
  }

  const turns: Turn[] = [];
  for (const m of messages) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      !m.content.trim()
    ) {
      return NextResponse.json(
        { error: "Each message must be { role, content }" },
        { status: 400 },
      );
    }
    turns.push({ role: m.role, content: m.content.trim() });
  }

  if (turns[turns.length - 1]?.role !== "user") {
    return NextResponse.json(
      { error: "Last message must be from the user" },
      { status: 400 },
    );
  }

  const upstreamUrl = process.env.NEXT_PUBLIC_ASSISTANT_CHAT_URL?.trim();
  if (upstreamUrl) {
    let res: Response;
    try {
      res = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: turns,
          ...(claudeModel ? { claudeModel } : {}),
        }),
        cache: "no-store",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upstream unreachable";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "text/event-stream";
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const apiKey =
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Chat is not configured. Set NEXT_PUBLIC_ASSISTANT_CHAT_URL or ANTHROPIC_API_KEY.",
      },
      { status: 503 },
    );
  }

  const requestBody = buildCachedMessagesRequestBody({
    model: claudeModel || DEFAULT_MODEL,
    system: buildAssistantChatSystemPrompt(),
    messages: turns,
    maxTokens: 512,
    stream: true,
  });

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Anthropic unreachable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    return NextResponse.json(
      {
        error: "Anthropic request failed",
        detail: detail.slice(0, 2000),
      },
      { status: upstream.status },
    );
  }

  if (!upstream.body) {
    return NextResponse.json(
      { error: "Empty body from Anthropic" },
      { status: 502 },
    );
  }

  return sseResponse(await pipeAnthropicToClientSse(upstream.body));
}
