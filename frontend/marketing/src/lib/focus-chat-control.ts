/** Cross-page Focus timer control from assistant chat ACTIONs. */

import {
  readFocusTask,
  readSessionsCompletedToday,
} from "@/lib/focus-timer-storage";

export const FOCUS_CHAT_CONTROL_EVENT = "mm-focus-chat-control";

export type FocusChatControlDetail = {
  cmd: "start" | "pause" | "stop";
  minutes?: number;
};

export function dispatchFocusChatControl(detail: FocusChatControlDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FOCUS_CHAT_CONTROL_EVENT, { detail }),
  );
}

export function readFocusChatRunningHint(): {
  sessionsToday: number;
  task: string;
} {
  if (typeof window === "undefined") {
    return { sessionsToday: 0, task: "" };
  }
  return {
    sessionsToday: readSessionsCompletedToday(),
    task: readFocusTask().trim(),
  };
}
