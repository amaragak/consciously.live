/**
 * Ephemeral-ish local session for the app-control Chat (separate from create coach).
 */

import type { AssistantAction } from "@/lib/assistant-chat-protocol";

export const ASSISTANT_CHAT_STORAGE_KEY = "mm_assistant_chat_v1";

export type AssistantChatMessage = {
  role: "user" | "assistant";
  text: string;
  /** Actions already applied (or offered) for this assistant turn. */
  actions?: AssistantAction[];
  /** Short status lines / deep-links after client execution. */
  actionResults?: Array<{ label: string; href?: string; ok: boolean }>;
};

export type AssistantChatSessionV1 = {
  v: 1;
  messages: AssistantChatMessage[];
  /** API thread (raw assistant text may still include markers). */
  thread: Array<{ role: "user" | "assistant"; content: string }>;
  updatedAt: string;
};

export function emptyAssistantChatSession(): AssistantChatSessionV1 {
  return {
    v: 1,
    messages: [],
    thread: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadAssistantChatSession(): AssistantChatSessionV1 {
  if (typeof window === "undefined") return emptyAssistantChatSession();
  try {
    const raw = window.localStorage.getItem(ASSISTANT_CHAT_STORAGE_KEY);
    if (!raw) return emptyAssistantChatSession();
    const parsed = JSON.parse(raw) as Partial<AssistantChatSessionV1>;
    if (parsed?.v !== 1 || !Array.isArray(parsed.messages)) {
      return emptyAssistantChatSession();
    }
    return {
      v: 1,
      messages: parsed.messages.filter(
        (m): m is AssistantChatMessage =>
          !!m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.text === "string",
      ),
      thread: Array.isArray(parsed.thread)
        ? parsed.thread.filter(
            (t): t is { role: "user" | "assistant"; content: string } =>
              !!t &&
              (t.role === "user" || t.role === "assistant") &&
              typeof t.content === "string",
          )
        : [],
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return emptyAssistantChatSession();
  }
}

export function saveAssistantChatSession(session: AssistantChatSessionV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ASSISTANT_CHAT_STORAGE_KEY,
      JSON.stringify({
        ...session,
        updatedAt: new Date().toISOString(),
      } satisfies AssistantChatSessionV1),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearAssistantChatSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ASSISTANT_CHAT_STORAGE_KEY);
  } catch {
    /* */
  }
}
