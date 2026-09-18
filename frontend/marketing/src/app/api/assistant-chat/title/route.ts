import { NextResponse } from "next/server";
import {
  ASSISTANT_CHAT_TITLE_SYSTEM,
  sanitizeAssistantChatTitle,
} from "@/lib/assistant-chat-title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";

async function titleFromAnthropic(
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
      model: DEFAULT_MODEL,
      max_tokens: 40,
      temperature: 0.3,
      system: ASSISTANT_CHAT_TITLE_SYSTEM,
      messages: [
        {
          role: "user",
          content: message.slice(0, 2_000),
        },
      ],
    }),
    cache: "no-store",
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
  const title = sanitizeAssistantChatTitle(text);
  return title || null;
}

/**
 * Short thread title from the first user message (Haiku).
 * Proxies to the assistant-chat Lambda when configured; otherwise Anthropic directly.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message =
    typeof (body as { message?: unknown })?.message === "string"
      ? (body as { message: string }).message.trim()
      : "";
  if (!message) {
    return NextResponse.json(
      { error: "message string required" },
      { status: 400 },
    );
  }

  // Prefer Lambda (same path as streaming chat) so titles work wherever chat does.
  const upstreamUrl = process.env.NEXT_PUBLIC_ASSISTANT_CHAT_URL?.trim();
  if (upstreamUrl) {
    try {
      const res = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "title", message }),
        cache: "no-store",
      });
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const j = (await res.json()) as { title?: string; error?: string };
        if (res.ok) {
          const title = sanitizeAssistantChatTitle(j.title ?? "");
          if (title) return NextResponse.json({ title });
        }
        // Fall through to direct Anthropic when Lambda title fails.
      }
    } catch {
      /* fall through */
    }
  }

  const apiKey =
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY?.trim() ||
    "";

  if (apiKey) {
    try {
      const title = await titleFromAnthropic(apiKey, message);
      if (!title) {
        return NextResponse.json({ error: "Empty title" }, { status: 502 });
      }
      return NextResponse.json({ title });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Title generation failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json(
    {
      error:
        "Chat title is not configured. Set NEXT_PUBLIC_ASSISTANT_CHAT_URL or ANTHROPIC_API_KEY.",
    },
    { status: 503 },
  );
}
