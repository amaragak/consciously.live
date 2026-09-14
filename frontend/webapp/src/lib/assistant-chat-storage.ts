/**
 * Assistant chat transcript is ephemeral — never persist bubbles to localStorage.
 * These helpers only clear legacy keys from earlier builds.
 */

const LEGACY_KEYS = ["mm_assistant_chat_v1", "mm_assistant_chat_v2"] as const;

export function clearAssistantChatSession(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* */
  }
}
