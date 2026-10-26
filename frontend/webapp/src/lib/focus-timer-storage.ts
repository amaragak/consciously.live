import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

/** Local persistence for the logged-in Focus timer page. */

export const FOCUS_TASK_STORAGE_KEY = "mm_focus_task_v1";
export const FOCUS_TASKS_LIST_STORAGE_KEY = "mm_focus_tasks_list_v1";
export const FOCUS_SESSIONS_TODAY_KEY = "mm_focus_sessions_today_v1";

export type FocusIdeateKind = "subtask" | "todo" | "tracker";

export type FocusTaskItem = {
  id: string;
  text: string;
  done: boolean;
  /** Life area title badge when imported from Ideate. */
  lifeAreaId?: string | null;
  lifeAreaTitle?: string | null;
  /** Ideate entity linked for shared check state with Focus. */
  ideateKind?: FocusIdeateKind | null;
  ideateId?: string | null;
  /** Open goal the timer is working on now. Done goals are never in the session. */
  inSession?: boolean;
};

type SessionsToday = {
  date: string; // YYYY-MM-DD local
  count: number;
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function readFocusTask(): string {
  if (typeof window === "undefined") return "";
  try {
    return readAccountLocalStorage(FOCUS_TASK_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeFocusTask(value: string): void {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(FOCUS_TASK_STORAGE_KEY, value);
  } catch {
    /* quota / private */
  }
}

function parseFocusTaskItem(raw: unknown): FocusTaskItem | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.text !== "string") return null;
  if (typeof t.done !== "boolean") return null;
  const ideateKind =
    t.ideateKind === "subtask" || t.ideateKind === "todo" || t.ideateKind === "tracker"
      ? t.ideateKind
      : null;
  return {
    id: t.id,
    text: t.text,
    done: t.done,
    lifeAreaId: typeof t.lifeAreaId === "string" ? t.lifeAreaId : null,
    lifeAreaTitle: typeof t.lifeAreaTitle === "string" ? t.lifeAreaTitle : null,
    ideateKind,
    ideateId: typeof t.ideateId === "string" ? t.ideateId : null,
    inSession: t.inSession === true,
  };
}

export function readFocusTasksList(): FocusTaskItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readAccountLocalStorage(FOCUS_TASKS_LIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const explicit = parsed.some(
      (row) => row && typeof row === "object" && "inSession" in row,
    );
    const items = parsed
      .map(parseFocusTaskItem)
      .filter((t): t is FocusTaskItem => Boolean(t));
    if (explicit) return items;
    let placed = false;
    return items.map((task) => {
      if (!task.done && !placed) {
        placed = true;
        return { ...task, inSession: true };
      }
      return { ...task, inSession: false };
    });
  } catch {
    return [];
  }
}

export function writeFocusTasksList(tasks: FocusTaskItem[]): void {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(
      FOCUS_TASKS_LIST_STORAGE_KEY,
      JSON.stringify(tasks),
    );
  } catch {
    /* */
  }
}

export function readSessionsCompletedToday(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = readAccountLocalStorage(FOCUS_SESSIONS_TODAY_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as SessionsToday;
    if (!parsed || parsed.date !== todayKey()) return 0;
    return Math.max(0, Math.min(12, Number(parsed.count) || 0));
  } catch {
    return 0;
  }
}

export type FocusDisplayId = "ring" | "bar" | "sun" | "digits";

export type FocusSessionPrefs = {
  display: FocusDisplayId;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: boolean;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  meditateFirst: boolean;
};

const FOCUS_SESSION_PREFS_KEY = "mm_focus_session_prefs_v1";

export function readFocusSessionPrefs(): FocusSessionPrefs {
  const fallback: FocusSessionPrefs = {
    display: "ring",
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    longBreakEvery: true,
    autoStartBreak: true,
    autoStartFocus: false,
    meditateFirst: false,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = readAccountLocalStorage(FOCUS_SESSION_PREFS_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Partial<FocusSessionPrefs>;
    const display: FocusDisplayId =
      o.display === "bar" || o.display === "sun" || o.display === "digits"
        ? o.display
        : "ring";
    const mins = (value: unknown, fallbackMins: number, max: number) =>
      typeof value === "number" && value >= 1
        ? Math.min(max, Math.floor(value))
        : fallbackMins;
    return {
      display,
      focusMinutes: mins(o.focusMinutes, 25, 180),
      breakMinutes: mins(o.breakMinutes, 5, 60),
      longBreakMinutes: mins(o.longBreakMinutes, 15, 60),
      longBreakEvery: o.longBreakEvery !== false,
      autoStartBreak: o.autoStartBreak !== false,
      autoStartFocus: o.autoStartFocus === true,
      meditateFirst: o.meditateFirst === true,
    };
  } catch {
    return fallback;
  }
}

export function writeFocusSessionPrefs(prefs: FocusSessionPrefs): void {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(FOCUS_SESSION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* */
  }
}

export function writeSessionsCompletedToday(count: number): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SessionsToday = {
      date: todayKey(),
      count: Math.max(0, Math.min(12, count)),
    };
    writeAccountLocalStorage(
      FOCUS_SESSIONS_TODAY_KEY,
      JSON.stringify(payload),
    );
  } catch {
    /* */
  }
}
