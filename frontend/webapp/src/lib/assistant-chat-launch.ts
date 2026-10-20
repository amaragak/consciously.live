/**
 * Open the header chat panel from elsewhere in the app (life-area ideate, etc.).
 * The panel is a right drawer from `md` up and a full-screen sheet on phones.
 */

import { mvpFlagsSnapshot } from "@/lib/mvp-flags";

export const ASSISTANT_CHAT_OPEN_EVENT = "mm-assistant-chat-open";
export const ASSISTANT_CHAT_TOGGLE_EVENT = "mm-assistant-chat-toggle";
export const ASSISTANT_CHAT_OPEN_CHANGED_EVENT = "mm-assistant-chat-open-changed";

export function toggleAssistantChatPanel(): void {
  if (typeof window === "undefined") return;
  if (!mvpFlagsSnapshot().chat) return;
  window.dispatchEvent(new Event(ASSISTANT_CHAT_TOGGLE_EVENT));
}

const PENDING_LAUNCH_KEY = "mm-assistant-chat-pending-launch";

export type AssistantChatOpenDetail =
  | { kind: "default" }
  | { kind: "life_area_ideate"; lifeAreaId: string; seed?: string };

export function stashAssistantChatPendingLaunch(
  detail: AssistantChatOpenDetail,
): void {
  try {
    sessionStorage.setItem(PENDING_LAUNCH_KEY, JSON.stringify(detail));
  } catch {
    /* private mode */
  }
}

export function consumeAssistantChatPendingLaunch(): AssistantChatOpenDetail | null {
  try {
    const raw = sessionStorage.getItem(PENDING_LAUNCH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_LAUNCH_KEY);
    const parsed = JSON.parse(raw) as AssistantChatOpenDetail;
    if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function openAssistantChatFab(detail: AssistantChatOpenDetail): void {
  if (typeof window === "undefined") return;
  if (!mvpFlagsSnapshot().chat) return;
  window.dispatchEvent(
    new CustomEvent(ASSISTANT_CHAT_OPEN_EVENT, { detail }),
  );
}
