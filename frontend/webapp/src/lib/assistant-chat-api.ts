import { deriveAssistantChatTitleProvisional } from "@/lib/assistant-chat-title";

export type AssistantChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export function getAssistantChatUrl(): string {
  return "/api/assistant-chat";
}

export function getAssistantChatTitleUrl(): string {
  return "/api/assistant-chat/title";
}

/**
 * Ask Haiku for a short thread title from the first user message.
 * Returns null on failure — caller keeps the provisional title.
 */
export async function generateAssistantChatTitle(
  firstUserMessage: string,
): Promise<string | null> {
  const message = firstUserMessage.trim();
  if (!message) return null;
  try {
    const res = await fetch(getAssistantChatTitleUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 2_000) }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string };
    const title = typeof j.title === "string" ? j.title.trim() : "";
    return title || null;
  } catch {
    return null;
  }
}

/** True when the stored title is still just a clip of the first user message. */
export function isProvisionalAssistantChatTitle(
  title: string,
  firstUserMessage: string,
): boolean {
  const t = title.trim();
  const msg = firstUserMessage.trim().replace(/\s+/g, " ");
  if (!t || !msg || t === "New chat") return true;
  const provisional = deriveAssistantChatTitleProvisional(msg);
  if (t === provisional) return true;
  if (t === msg) return true;
  // Provisional often adds an ellipsis when clipped.
  if (provisional.endsWith("…") && t === provisional.slice(0, -1)) return true;
  // Near-verbatim: title is a prefix of the message (common failed-Haiku leftover).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const nt = norm(t);
  const nm = norm(msg);
  if (nt.length >= 12 && (nm.startsWith(nt) || nt.startsWith(nm.slice(0, nt.length)))) {
    return true;
  }
  return false;
}

/**
 * Streams assistant-chat SSE (`{d}` / `{done}` / `{error}`), same shape as coach chat.
 */
export async function streamAssistantChat(
  params: {
    messages: AssistantChatTurn[];
    /** Appended after the cached base system prompt (not cached). */
    systemSupplement?: string;
  },
  onDelta: (chunk: string) => void,
): Promise<string> {
  const url = getAssistantChatUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages,
      ...(params.systemSupplement?.trim()
        ? { systemSupplement: params.systemSupplement.trim() }
        : {}),
    }),
  });

  const ct = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    let msg = res.statusText;
    try {
      if (ct.includes("application/json")) {
        const j = (await res.json()) as { error?: string; detail?: string };
        msg = j.detail ?? j.error ?? msg;
      } else {
        msg = (await res.text()).slice(0, 500) || msg;
      }
    } catch {
      /* keep msg */
    }
    throw new Error(msg);
  }

  if (!ct.includes("text/event-stream")) {
    const t = await res.text();
    throw new Error(
      t.slice(0, 200) || "Expected text/event-stream from assistant chat",
    );
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const dec = new TextDecoder();
  let carry = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = carry.indexOf("\n\n")) !== -1) {
      const block = carry.slice(0, sep);
      carry = carry.slice(sep + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.replace(/^data:\s*/, "").trim();
        if (!raw) continue;
        let data: { d?: string; done?: boolean; error?: string };
        try {
          data = JSON.parse(raw) as {
            d?: string;
            done?: boolean;
            error?: string;
          };
        } catch {
          continue;
        }
        if (data.error) throw new Error(data.error);
        if (typeof data.d === "string" && data.d.length > 0) {
          full += data.d;
          onDelta(data.d);
        }
      }
    }
  }

  if (!full.trim()) throw new Error("Empty reply from assistant");
  return full;
}
