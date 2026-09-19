import {
  readAccountSessionStorage,
  removeAccountSessionStorage,
  writeAccountSessionStorage,
} from "@/lib/account-scoped-storage";
/** SessionStorage handoff: Ideate life-area task → Focus timer. */

export const FOCUS_SESSION_HANDOFF_KEY = "mm_focus_session_handoff_v1";
export const RETURN_TO_FOCUS_AFTER_CREATE_KEY =
  "mm_return_to_focus_after_create_v1";

export type FocusSessionHandoffV1 = {
  v: 1;
  /** IdeateSubtask id (UI “task”) whose todos seed the Focus session. */
  subtaskId: string;
};

export function writeFocusSessionHandoff(payload: FocusSessionHandoffV1): void {
  if (typeof window === "undefined") return;
  try {
    writeAccountSessionStorage(
      FOCUS_SESSION_HANDOFF_KEY,
      JSON.stringify(payload),
    );
  } catch {
    /* ignore */
  }
}

export function readFocusSessionHandoff(): FocusSessionHandoffV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readAccountSessionStorage(FOCUS_SESSION_HANDOFF_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v !== 1 || typeof o.subtaskId !== "string" || !o.subtaskId.trim()) {
      return null;
    }
    return { v: 1, subtaskId: o.subtaskId.trim() };
  } catch {
    return null;
  }
}

export function clearFocusSessionHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    removeAccountSessionStorage(FOCUS_SESSION_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/** After a pre-focus manifestation generate, send the user to Focus (handoff still set). */
export function writeReturnToFocusAfterCreate(): void {
  if (typeof window === "undefined") return;
  try {
    writeAccountSessionStorage(RETURN_TO_FOCUS_AFTER_CREATE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeReturnToFocusAfterCreate(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = readAccountSessionStorage(RETURN_TO_FOCUS_AFTER_CREATE_KEY);
    removeAccountSessionStorage(RETURN_TO_FOCUS_AFTER_CREATE_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

export function focusMyHrefFromIdeate(): string {
  return `/focus/my?fromIdeate=${Date.now()}`;
}
