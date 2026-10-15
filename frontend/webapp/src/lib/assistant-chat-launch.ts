/**
 * Open the floating mini-chat from elsewhere in the app (life-area ideate, etc.).
 * Below `md`, Chat is a bottom tab — navigate to the full Chat page instead.
 */

export const ASSISTANT_CHAT_OPEN_EVENT = "mm-assistant-chat-open";

const PENDING_LAUNCH_KEY = "mm-assistant-chat-pending-launch";

export type AssistantChatOpenDetail =
  | { kind: "default" }
  | { kind: "life_area_ideate"; lifeAreaId: string };

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
  const phone = !window.matchMedia("(min-width: 768px)").matches;
  if (phone) {
    stashAssistantChatPendingLaunch(detail);
    window.history.pushState({}, "", "/chat/my");
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.dispatchEvent(
    new CustomEvent(ASSISTANT_CHAT_OPEN_EVENT, { detail }),
  );
}
