import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import type { IdeateQuote } from "@/lib/ideate-quotes";

/**
 * One quote per local day. Pinned quotes lead each cycle; the rest are
 * shuffled and shown once before the cycle starts again. "Another" peeks
 * ahead without moving today's saved pick.
 */

const LS_KEY = "mm_quote_cycle_v1";

type CycleState = {
  day: string;
  shown: string[];
  remaining: string[];
  todayId: string;
};

function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function readCycle(): CycleState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readAccountLocalStorage(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CycleState>;
    if (
      typeof parsed.day !== "string" ||
      typeof parsed.todayId !== "string" ||
      !Array.isArray(parsed.shown) ||
      !Array.isArray(parsed.remaining)
    ) {
      return null;
    }
    return {
      day: parsed.day,
      todayId: parsed.todayId,
      shown: parsed.shown.filter((id): id is string => typeof id === "string"),
      remaining: parsed.remaining.filter(
        (id): id is string => typeof id === "string",
      ),
    };
  } catch {
    return null;
  }
}

function writeCycle(state: CycleState) {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(LS_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

function pinnedThenShuffled(quotes: readonly IdeateQuote[], seedKey: string): string[] {
  const pinned = quotes.filter((q) => q.pinned);
  const rest = quotes.filter((q) => !q.pinned);
  return [
    ...pinned.map((q) => q.id),
    ...seededShuffle(rest, hashString(seedKey)).map((q) => q.id),
  ];
}

function clusterRemaining(
  remaining: readonly string[],
  quotes: readonly IdeateQuote[],
): string[] {
  const pinned = new Set(quotes.filter((q) => q.pinned).map((q) => q.id));
  return [
    ...remaining.filter((id) => pinned.has(id)),
    ...remaining.filter((id) => !pinned.has(id)),
  ];
}

function freshCycle(quotes: readonly IdeateQuote[], day: string): CycleState {
  const order = pinnedThenShuffled(quotes, day);
  const todayId = order[0] ?? "";
  return {
    day,
    todayId,
    shown: todayId ? [todayId] : [],
    remaining: order.slice(1),
  };
}

function syncCycle(quotes: readonly IdeateQuote[]): CycleState | null {
  if (quotes.length === 0) return null;
  const today = localDay();
  const live = new Set(quotes.map((q) => q.id));
  let state = readCycle();
  if (!state) {
    state = freshCycle(quotes, today);
    writeCycle(state);
    return state;
  }

  state.shown = state.shown.filter((id) => live.has(id));
  state.remaining = state.remaining.filter((id) => live.has(id));
  const known = new Set([...state.shown, ...state.remaining]);
  for (const q of quotes) {
    if (!known.has(q.id)) state.remaining.push(q.id);
  }
  state.remaining = clusterRemaining(state.remaining, quotes);

  if (state.day !== today) {
    if (state.remaining.length === 0) {
      state = freshCycle(quotes, today);
    } else {
      const next = state.remaining.shift() ?? "";
      if (next) state.shown.push(next);
      state.todayId = next;
      state.day = today;
    }
  } else if (!live.has(state.todayId)) {
    const next = state.remaining.shift() ?? state.shown[0] ?? "";
    state.todayId = next;
    if (next && !state.shown.includes(next)) state.shown.push(next);
  }

  writeCycle(state);
  return state;
}

export type QuoteOfDay = {
  today: IdeateQuote;
  /** Full cycle, today first, then the quotes "Another" walks through. */
  sequence: IdeateQuote[];
};

/** Today's quote plus the peek sequence. Does not advance the saved day. */
export function quoteOfDay(quotes: readonly IdeateQuote[]): QuoteOfDay | null {
  const state = syncCycle(quotes);
  if (!state?.todayId) return null;
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const today = byId.get(state.todayId);
  if (!today) return null;
  const orderIds = [
    state.todayId,
    ...state.remaining,
    ...state.shown.filter((id) => id !== state.todayId),
  ];
  const sequence = orderIds
    .map((id) => byId.get(id))
    .filter((q): q is IdeateQuote => Boolean(q));
  return { today, sequence };
}
