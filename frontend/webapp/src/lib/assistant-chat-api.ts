export type AssistantChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export function getAssistantChatUrl(): string {
  return "/api/assistant-chat";
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
