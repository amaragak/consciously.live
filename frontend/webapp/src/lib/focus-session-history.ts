import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

export const FOCUS_SESSION_HISTORY_KEY = "mm_focus_session_history_v2";
export const FOCUS_SESSION_HISTORY_CHANGED = "mm-focus-session-history-changed";

/** Legacy v1 key — migrated once on read. */
const LEGACY_HISTORY_KEY = "mm_focus_session_history_v1";

export const FOCUS_PAUSE_AUTO_CLOSE_MS = 30 * 60 * 1000;
/** Persist once the sitting has at least this much focused time. */
export const FOCUS_SESSION_MIN_SAVE_SEC = 60;

export type FocusSessionGoal = {
  id: string;
  text: string;
  lifeAreaId?: string | null;
  lifeAreaTitle?: string | null;
};

export type FocusSessionStatus = "running" | "paused" | "ended";

export type FocusSessionRecord = {
  id: string;
  startedAt: string;
  /** Set when the sitting closes; null while open. */
  endedAt: string | null;
  status: FocusSessionStatus;
  /** Focused seconds with pauses excluded (committed; live segment added via helpers). */
  lengthSec: number;
  /** Planned focus-round length (for “24 of 25 min”). */
  plannedSec: number;
  /** Completed focus rounds (timer reached zero). */
  rounds: number;
  meditateFirst: boolean;
  goalsDone: FocusSessionGoal[];
  /** When status is paused — used for the 30-minute auto-close. */
  pausedAt: string | null;
  /**
   * Epoch ms when the current running segment started.
   * Null when paused/ended. Not meaningful across page reloads after a crash —
   * we commit on pause/visibilitychange.
   */
  runStartedAtMs: number | null;
  /** True when closed before a focus round finished. */
  endedEarly: boolean;
};

export type FocusOutsideTick = {
  id: string;
  tickedAt: string;
  goal: FocusSessionGoal;
};

type Store = {
  sessions: FocusSessionRecord[];
  outsideTicks: FocusOutsideTick[];
};

function emptyStore(): Store {
  return { sessions: [], outsideTicks: [] };
}

function parseGoal(raw: unknown): FocusSessionGoal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.text !== "string") return null;
  return {
    id: o.id,
    text: o.text,
    lifeAreaId: typeof o.lifeAreaId === "string" ? o.lifeAreaId : null,
    lifeAreaTitle: typeof o.lifeAreaTitle === "string" ? o.lifeAreaTitle : null,
  };
}

function parseSession(raw: unknown): FocusSessionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  if (typeof o.startedAt !== "string") return null;
  const lengthSec = Number(o.lengthSec);
  const rounds = Number(o.rounds);
  if (!Number.isFinite(lengthSec) || lengthSec < 0) return null;
  if (!Number.isFinite(rounds) || rounds < 0) return null;
  const goals = Array.isArray(o.goalsDone)
    ? o.goalsDone.map(parseGoal).filter((g): g is FocusSessionGoal => Boolean(g))
    : [];
  const statusRaw = o.status;
  const status: FocusSessionStatus =
    statusRaw === "running" || statusRaw === "paused" || statusRaw === "ended"
      ? statusRaw
      : "ended";
  const plannedSec = Number(o.plannedSec);
  const endedAt =
    typeof o.endedAt === "string"
      ? o.endedAt
      : status === "ended"
        ? typeof o.endedAt === "string"
          ? o.endedAt
          : o.startedAt
        : null;
  return {
    id: o.id,
    startedAt: o.startedAt,
    endedAt: status === "ended" ? endedAt || o.startedAt : null,
    status,
    lengthSec: Math.floor(lengthSec),
    plannedSec:
      Number.isFinite(plannedSec) && plannedSec > 0
        ? Math.floor(plannedSec)
        : 25 * 60,
    rounds: Math.floor(rounds),
    meditateFirst: o.meditateFirst === true,
    goalsDone: goals,
    pausedAt: typeof o.pausedAt === "string" ? o.pausedAt : null,
    runStartedAtMs:
      status === "running" && typeof o.runStartedAtMs === "number"
        ? o.runStartedAtMs
        : null,
    endedEarly: o.endedEarly === true,
  };
}

function parseOutsideTick(raw: unknown): FocusOutsideTick | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.tickedAt !== "string") return null;
  const goal = parseGoal(o.goal);
  if (!goal) return null;
  return { id: o.id, tickedAt: o.tickedAt, goal };
}

/** Migrate legacy completed-only records into the v2 shape. */
function migrateLegacySession(raw: unknown): FocusSessionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  if (typeof o.startedAt !== "string" || typeof o.endedAt !== "string") return null;
  const lengthSec = Number(o.lengthSec);
  const rounds = Number(o.rounds);
  if (!Number.isFinite(lengthSec) || lengthSec < 0) return null;
  if (!Number.isFinite(rounds) || rounds < 1) return null;
  const goals = Array.isArray(o.goalsDone)
    ? o.goalsDone.map(parseGoal).filter((g): g is FocusSessionGoal => Boolean(g))
    : [];
  return {
    id: o.id,
    startedAt: o.startedAt,
    endedAt: o.endedAt,
    status: "ended",
    lengthSec: Math.floor(lengthSec),
    plannedSec: 25 * 60,
    rounds: Math.floor(rounds),
    meditateFirst: o.meditateFirst === true,
    goalsDone: goals,
    pausedAt: null,
    runStartedAtMs: null,
    endedEarly: false,
  };
}

function readStore(): Store {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = readAccountLocalStorage(FOCUS_SESSION_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        sessions?: unknown;
        outsideTicks?: unknown;
      };
      const sessions = Array.isArray(parsed.sessions)
        ? parsed.sessions
            .map(parseSession)
            .filter((s): s is FocusSessionRecord => Boolean(s))
        : [];
      const outsideTicks = Array.isArray(parsed.outsideTicks)
        ? parsed.outsideTicks
            .map(parseOutsideTick)
            .filter((t): t is FocusOutsideTick => Boolean(t))
        : [];
      return { sessions, outsideTicks };
    }
    const legacy = readAccountLocalStorage(LEGACY_HISTORY_KEY);
    if (!legacy) return emptyStore();
    const parsed = JSON.parse(legacy) as { sessions?: unknown };
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions
          .map(migrateLegacySession)
          .filter((s): s is FocusSessionRecord => Boolean(s))
      : [];
    const migrated = { sessions, outsideTicks: [] as FocusOutsideTick[] };
    writeStore(migrated);
    return migrated;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(
      FOCUS_SESSION_HISTORY_KEY,
      JSON.stringify({
        sessions: store.sessions.slice(0, 500),
        outsideTicks: store.outsideTicks.slice(0, 500),
      }),
    );
    window.dispatchEvent(new Event(FOCUS_SESSION_HISTORY_CHANGED));
  } catch {
    /* */
  }
}

export function newFocusSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `focus_${crypto.randomUUID()}`;
  }
  return `focus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function liveFocusLengthSec(
  session: FocusSessionRecord,
  nowMs = Date.now(),
): number {
  let sec = session.lengthSec;
  if (session.status === "running" && session.runStartedAtMs != null) {
    sec += Math.max(0, Math.floor((nowMs - session.runStartedAtMs) / 1000));
  }
  return sec;
}

export function focusSessionHasContent(
  session: FocusSessionRecord,
  nowMs = Date.now(),
): boolean {
  if (session.goalsDone.length > 0) return true;
  if (session.rounds > 0) return true;
  return liveFocusLengthSec(session, nowMs) >= FOCUS_SESSION_MIN_SAVE_SEC;
}

function commitRunningSegment(
  session: FocusSessionRecord,
  nowMs = Date.now(),
): FocusSessionRecord {
  if (session.status !== "running" || session.runStartedAtMs == null) {
    return session;
  }
  const added = Math.max(0, Math.floor((nowMs - session.runStartedAtMs) / 1000));
  return {
    ...session,
    lengthSec: session.lengthSec + added,
    runStartedAtMs: null,
  };
}

/** In-memory draft for a sitting that has not yet met the save threshold. */
let memoryOpen: FocusSessionRecord | null = null;

function upsertSession(session: FocusSessionRecord): FocusSessionRecord {
  const store = readStore();
  const idx = store.sessions.findIndex((s) => s.id === session.id);
  const next =
    idx === -1
      ? [session, ...store.sessions]
      : store.sessions.map((s, i) => (i === idx ? session : s));
  writeStore({ ...store, sessions: next });
  if (session.status === "running" || session.status === "paused") {
    memoryOpen = session;
  } else if (memoryOpen?.id === session.id) {
    memoryOpen = null;
  }
  return session;
}

function persistIfContent(session: FocusSessionRecord): FocusSessionRecord {
  if (session.status === "running" || session.status === "paused") {
    memoryOpen = session;
  } else if (memoryOpen?.id === session.id) {
    memoryOpen = null;
  }
  if (!focusSessionHasContent(session)) {
    // Drop empty drafts that never qualified from durable storage only.
    const store = readStore();
    if (store.sessions.some((s) => s.id === session.id)) {
      writeStore({
        ...store,
        sessions: store.sessions.filter((s) => s.id !== session.id),
      });
    }
    return session;
  }
  return upsertSession(session);
}

export function readFocusSessionHistory(): FocusSessionRecord[] {
  const stored = readStore().sessions;
  const open = memoryOpen;
  const merged =
    open && !stored.some((s) => s.id === open.id) ? [open, ...stored] : stored;
  return merged
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function readFocusOutsideTicks(): FocusOutsideTick[] {
  return readStore()
    .outsideTicks.slice()
    .sort((a, b) => b.tickedAt.localeCompare(a.tickedAt));
}

export function getOpenFocusSession(): FocusSessionRecord | null {
  if (memoryOpen && (memoryOpen.status === "running" || memoryOpen.status === "paused")) {
    return memoryOpen;
  }
  const stored =
    readStore().sessions.find(
      (s) => s.status === "running" || s.status === "paused",
    ) ?? null;
  memoryOpen = stored;
  return stored;
}

/** @deprecated — use session lifecycle helpers. Kept for older call sites. */
export function upsertFocusSessionRecord(session: FocusSessionRecord): void {
  upsertSession(session);
}

export function startOrResumeFocusSession(opts: {
  plannedSec: number;
  meditateFirst?: boolean;
}): FocusSessionRecord {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const open = getOpenFocusSession();
  if (open) {
    // Auto-closed by pause timeout or midnight while away — start a fresh sitting.
    if (open.status === "paused" && open.pausedAt) {
      const pausedMs = new Date(open.pausedAt).getTime();
      if (
        Number.isFinite(pausedMs) &&
        now - pausedMs >= FOCUS_PAUSE_AUTO_CLOSE_MS
      ) {
        endFocusSession({ reason: "pause-timeout", atIso: open.pausedAt });
      } else if (localDayKeyFromIso(open.startedAt) !== localDayKeyFromIso(nowIso)) {
        endFocusSession({ reason: "midnight", atIso: endOfLocalDayIso(open.startedAt) });
      } else {
        const resumed: FocusSessionRecord = {
          ...open,
          status: "running",
          pausedAt: null,
          runStartedAtMs: now,
          plannedSec: opts.plannedSec > 0 ? opts.plannedSec : open.plannedSec,
          meditateFirst: open.meditateFirst || Boolean(opts.meditateFirst),
          endedAt: null,
          endedEarly: false,
        };
        return persistIfContent(resumed);
      }
    } else if (open.status === "running") {
      return open;
    } else if (open.status === "paused") {
      const resumed: FocusSessionRecord = {
        ...open,
        status: "running",
        pausedAt: null,
        runStartedAtMs: now,
        plannedSec: opts.plannedSec > 0 ? opts.plannedSec : open.plannedSec,
        meditateFirst: open.meditateFirst || Boolean(opts.meditateFirst),
        endedAt: null,
        endedEarly: false,
      };
      return persistIfContent(resumed);
    }
  }

  const session: FocusSessionRecord = {
    id: newFocusSessionId(),
    startedAt: nowIso,
    endedAt: null,
    status: "running",
    lengthSec: 0,
    plannedSec: Math.max(60, Math.floor(opts.plannedSec || 25 * 60)),
    rounds: 0,
    meditateFirst: Boolean(opts.meditateFirst),
    goalsDone: [],
    pausedAt: null,
    runStartedAtMs: now,
    endedEarly: false,
  };
  // Keep the draft in memory so pause / goals / heartbeat see it before save threshold.
  memoryOpen = session;
  return session;
}

/** Keep the in-memory open sitting in the store once it has content. */
export function touchFocusSession(session: FocusSessionRecord): FocusSessionRecord {
  return persistIfContent(session);
}

export function pauseFocusSession(): FocusSessionRecord | null {
  const open = getOpenFocusSession();
  if (!open || open.status !== "running") return open;
  const now = Date.now();
  const paused: FocusSessionRecord = {
    ...commitRunningSegment(open, now),
    status: "paused",
    pausedAt: new Date(now).toISOString(),
    runStartedAtMs: null,
  };
  return persistIfContent(paused);
}

export function endFocusSession(opts?: {
  reason?: "reset" | "stop" | "new-session" | "pause-timeout" | "midnight" | "unload";
  atIso?: string;
  /** Mid-round when ending — marks endedEarly. */
  midRound?: boolean;
}): FocusSessionRecord | null {
  const open = getOpenFocusSession();
  if (!open) return null;
  const now = Date.now();
  const atIso = opts?.atIso || new Date(now).toISOString();
  let ended = commitRunningSegment(open, now);
  const focused = liveFocusLengthSec(ended, now);
  const planned = Math.max(1, ended.plannedSec);
  // Prefer explicit midRound; otherwise treat as early when focused time is shy of a full plan
  // and they haven't banked a completed round covering it.
  const midRound =
    opts?.midRound === true ||
    (ended.rounds === 0 && focused > 0 && focused < planned);
  const endedEarly =
    Boolean(midRound) && focused > 0 && focused < planned;
  ended = {
    ...ended,
    status: "ended",
    endedAt: atIso,
    pausedAt: null,
    runStartedAtMs: null,
    endedEarly: ended.endedEarly || endedEarly,
  };
  return persistIfContent(ended);
}

/** Focus round timer reached zero. */
export function completeFocusRound(opts: {
  plannedSec: number;
  meditateFirst?: boolean;
}): FocusSessionRecord {
  const now = Date.now();
  let open = getOpenFocusSession();
  if (!open) {
    open = startOrResumeFocusSession({
      plannedSec: opts.plannedSec,
      meditateFirst: opts.meditateFirst,
    });
  }
  let next = commitRunningSegment(open, now);
  // A full round adds the planned length if we somehow under-counted, else keep live.
  const roundSec = Math.max(1, Math.floor(opts.plannedSec));
  // Prefer actual committed length for this sitting; ensure at least one round's worth
  // when the countdown finished cleanly from a fresh start.
  next = {
    ...next,
    rounds: next.rounds + 1,
    plannedSec: roundSec,
    meditateFirst: next.meditateFirst || Boolean(opts.meditateFirst),
    status: "paused",
    pausedAt: new Date(now).toISOString(),
    runStartedAtMs: null,
    endedAt: null,
    endedEarly: false,
  };
  // If length is still below rounds * something small, bump to at least this round.
  if (next.lengthSec < roundSec && next.rounds === 1) {
    next = { ...next, lengthSec: roundSec };
  }
  return persistIfContent(next);
}

export function addGoalToOpenFocusSession(
  goal: FocusSessionGoal,
): FocusSessionRecord | FocusOutsideTick {
  const open = getOpenFocusSession();
  if (!open) {
    return noteOutsideFocusTick(goal);
  }
  if (open.goalsDone.some((g) => g.id === goal.id)) return open;
  const next: FocusSessionRecord = {
    ...open,
    goalsDone: [...open.goalsDone, goal],
  };
  return persistIfContent(next);
}

export function noteOutsideFocusTick(goal: FocusSessionGoal): FocusOutsideTick {
  const store = readStore();
  // Avoid duplicate outside ticks for the same goal in the same local day.
  const day = localDayKeyFromIso(new Date().toISOString());
  const already = store.outsideTicks.find(
    (t) => t.goal.id === goal.id && localDayKeyFromIso(t.tickedAt) === day,
  );
  if (already) return already;
  const tick: FocusOutsideTick = {
    id: newFocusSessionId().replace(/^focus_/, "out_"),
    tickedAt: new Date().toISOString(),
    goal,
  };
  writeStore({ ...store, outsideTicks: [tick, ...store.outsideTicks] });
  return tick;
}

/**
 * Heartbeat while the timer page is open: commit live length, auto-close
 * long pauses, and close sittings that crossed midnight.
 */
export function syncOpenFocusSession(opts?: {
  running?: boolean;
  plannedSec?: number;
}): FocusSessionRecord | null {
  const open = getOpenFocusSession();
  if (!open) return null;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (localDayKeyFromIso(open.startedAt) !== localDayKeyFromIso(nowIso)) {
    return endFocusSession({
      reason: "midnight",
      atIso: endOfLocalDayIso(open.startedAt),
      midRound: true,
    });
  }

  if (open.status === "paused" && open.pausedAt) {
    const pausedMs = new Date(open.pausedAt).getTime();
    if (
      Number.isFinite(pausedMs) &&
      now - pausedMs >= FOCUS_PAUSE_AUTO_CLOSE_MS
    ) {
      return endFocusSession({
        reason: "pause-timeout",
        atIso: open.pausedAt,
        midRound: true,
      });
    }
  }

  if (opts?.running && open.status === "running") {
    // Soft persist live length without ending the run segment.
    const live = liveFocusLengthSec(open, now);
    if (live !== open.lengthSec && focusSessionHasContent({ ...open, lengthSec: live }, now)) {
      // Persist a snapshot with committed+live folded so History updates, then
      // keep runStartedAtMs so we don't double-count.
      const snapshot: FocusSessionRecord = {
        ...open,
        lengthSec: live,
        runStartedAtMs: now,
        plannedSec:
          opts.plannedSec && opts.plannedSec > 0 ? opts.plannedSec : open.plannedSec,
      };
      return upsertSession(snapshot);
    }
    return open;
  }

  // Timer UI is idle — don't keep accruing a "running" sitting after refresh / leave.
  if (opts?.running === false && open.status === "running") {
    return pauseFocusSession();
  }

  if (opts?.plannedSec && opts.plannedSec > 0 && open.plannedSec !== opts.plannedSec) {
    const next = { ...open, plannedSec: opts.plannedSec };
    return persistIfContent(next);
  }

  return open;
}

function endOfLocalDayIso(startedAt: string): string {
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function localDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatFocusLength(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins} min`;
  if (total > 0) return `${total}s`;
  return "0 min";
}

export function formatFocusClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatEndedEarlyLabel(session: FocusSessionRecord): string | null {
  if (session.status !== "ended" || !session.endedEarly) return null;
  const focusedMin = Math.max(1, Math.round(liveFocusLengthSec(session) / 60));
  const plannedMin = Math.max(1, Math.round(session.plannedSec / 60));
  if (focusedMin >= plannedMin) return null;
  return `Ended early · ${focusedMin} of ${plannedMin} min`;
}

export type FocusDayGroup = {
  dayKey: string;
  sessions: FocusSessionRecord[];
  outsideTicks: FocusOutsideTick[];
  totalSec: number;
  sessionCount: number;
  goalsDone: number;
};

export function groupFocusSessionsByDay(
  sessions: FocusSessionRecord[],
  outsideTicks: FocusOutsideTick[] = [],
): FocusDayGroup[] {
  const map = new Map<
    string,
    { sessions: FocusSessionRecord[]; outsideTicks: FocusOutsideTick[] }
  >();
  for (const session of sessions) {
    if (!focusSessionHasContent(session) && session.status === "ended") continue;
    const key = localDayKeyFromIso(session.startedAt);
    if (!key) continue;
    const row = map.get(key) ?? { sessions: [], outsideTicks: [] };
    row.sessions.push(session);
    map.set(key, row);
  }
  for (const tick of outsideTicks) {
    const key = localDayKeyFromIso(tick.tickedAt);
    if (!key) continue;
    const row = map.get(key) ?? { sessions: [], outsideTicks: [] };
    row.outsideTicks.push(tick);
    map.set(key, row);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, row]) => {
      const sessionsSorted = row.sessions
        .slice()
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      // Open sittings first within today.
      sessionsSorted.sort((a, b) => {
        const ao = a.status === "ended" ? 1 : 0;
        const bo = b.status === "ended" ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return b.startedAt.localeCompare(a.startedAt);
      });
      const outsideSorted = row.outsideTicks
        .slice()
        .sort((a, b) => b.tickedAt.localeCompare(a.tickedAt));
      const totalSec = sessionsSorted.reduce(
        (sum, s) => sum + liveFocusLengthSec(s),
        0,
      );
      const goalsDone =
        sessionsSorted.reduce((sum, s) => sum + s.goalsDone.length, 0) +
        outsideSorted.length;
      const sessionCount = sessionsSorted.filter((s) =>
        focusSessionHasContent(s),
      ).length;
      return {
        dayKey,
        sessions: sessionsSorted,
        outsideTicks: outsideSorted,
        totalSec,
        sessionCount,
        goalsDone,
      };
    });
}

export function formatFocusDayHeading(dayKey: string, now = new Date()): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const rest = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  const label = `${weekday} ${rest}`;
  if (date.getTime() === today.getTime()) return `Today · ${label}`;
  return label;
}
