/**
 * Open the floating mini-chat from elsewhere in the app (life-area ideate, etc.).
 */

export const ASSISTANT_CHAT_OPEN_EVENT = "mm-assistant-chat-open";

export type AssistantChatOpenDetail =
  | { kind: "default" }
  | { kind: "life_area_ideate"; lifeAreaId: string };

export function openAssistantChatFab(detail: AssistantChatOpenDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ASSISTANT_CHAT_OPEN_EVENT, { detail }),
  );
}
