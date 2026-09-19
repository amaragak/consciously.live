/**
 * Daily habit tracker — local play events, manual checks, and status helpers.
 * Server truth lives at GET /dashboard/daily-status; this mirrors for offline/guest.
 *
 * Local play/manual stores are scoped by session email so one Chrome profile
 * cannot mark another account’s dailies done.
 */

import {
  isGratitudeEntry,
  localDateKey,
  localDateKeyFromIso,
} from "@/lib/journal-storage";
import type { JournalEntry } from "@/lib/journal-storage";
import type { IdeateStoreV2 } from "@/lib/plan-ideate-store";
import type { PlanDream } from "@/lib/plan-dreams";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { getMedimadeSessionEmail } from "@/lib/auth-session";

export { localDateKey };

export type DailyHabitPillar = "gratitude" | "meditation" | "lifeArea";

export type DailyStatus = {
  gratitude: boolean;
  meditation: boolean;
  lifeArea: boolean;
  /** Full streak — all three dailies. Alias of fullStreak for older callers. */
  streak: number;
  fullStreak: number;
  partialStreak: number;
  fullStreakRecord: number;
  partialStreakRecord: number;
};

export type DailyManualChecks = Partial<Record<DailyHabitPillar, boolean>>;

type PlayDayRecord = {
  playStartedAt?: string;
  playProgress60At?: string;
  meditationId?: string;
};

type PlayEventsStore = Record<string, PlayDayRecord>;
type ManualStore = Record<string, DailyManualChecks>;

/** Unscoped legacy (pre-account) — only used as fallback for signed-out / anon. */
const PLAY_LS_KEY_LEGACY = "mm_daily_play_events_v1";
const MANUAL_LS_KEY_LEGACY = "mm_daily_manual_v1";

export const DAILY_HABITS_CHANGED_EVENT = "medimade-daily-habits-changed";

function accountScopeKey(): string {
  const email = getMedimadeSessionEmail()?.trim().toLowerCase();
  return email || "_anon";
}

function playLsKey(scope = accountScopeKey()): string {
  return `mm_daily_play_events_v2:${scope}`;
}

function manualLsKey(scope = accountScopeKey()): string {
  return `mm_daily_manual_v2:${scope}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function readPlayStore(): PlayEventsStore {
  const scoped = readJson<PlayEventsStore>(playLsKey(), {});
  // Never inherit another account’s play history. Legacy flat store only for anon.
  if (accountScopeKey() !== "_anon") return scoped;
  if (Object.keys(scoped).length) return scoped;
  return readJson<PlayEventsStore>(PLAY_LS_KEY_LEGACY, {});
}

function writePlayStore(store: PlayEventsStore): void {
  writeJson(playLsKey(), store);
}

function readManualStore(): ManualStore {
  const scoped = readJson<ManualStore>(manualLsKey(), {});
  if (accountScopeKey() !== "_anon") return scoped;
  if (Object.keys(scoped).length) return scoped;
  return readJson<ManualStore>(MANUAL_LS_KEY_LEGACY, {});
}

function writeManualStore(store: ManualStore): void {
  writeJson(manualLsKey(), store);
}

function notifyHabitsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DAILY_HABITS_CHANGED_EVENT));
}

export function loadLocalPlayDay(dateKey = localDateKey()): PlayDayRecord {
  return readPlayStore()[dateKey] ?? {};
}

export function hasLocalMeditationProgress(dateKey = localDateKey()): boolean {
  return Boolean(loadLocalPlayDay(dateKey).playProgress60At);
}

export function recordLocalPlayStarted(opts: {
  meditationId: string;
  at?: string;
  dateKey?: string;
}): void {
  const dateKey = opts.dateKey ?? localDateKey();
  const store = readPlayStore();
  const prev = store[dateKey] ?? {};
  if (prev.playStartedAt) {
    store[dateKey] = {
      ...prev,
      meditationId: opts.meditationId || prev.meditationId,
    };
  } else {
    store[dateKey] = {
      ...prev,
      playStartedAt: opts.at ?? new Date().toISOString(),
      meditationId: opts.meditationId,
    };
  }
  writePlayStore(store);
  notifyHabitsChanged();
}

export function recordLocalPlayProgress60(opts: {
  meditationId: string;
  at?: string;
  dateKey?: string;
}): void {
  const dateKey = opts.dateKey ?? localDateKey();
  const store = readPlayStore();
  const prev = store[dateKey] ?? {};
  if (prev.playProgress60At) return;
  store[dateKey] = {
    ...prev,
    playStartedAt: prev.playStartedAt ?? opts.at ?? new Date().toISOString(),
    playProgress60At: opts.at ?? new Date().toISOString(),
    meditationId: opts.meditationId || prev.meditationId,
  };
  writePlayStore(store);
  notifyHabitsChanged();
}

export function loadLocalManualChecks(dateKey = localDateKey()): DailyManualChecks {
  return readManualStore()[dateKey] ?? {};
}

export function setLocalManualCheck(
  pillar: DailyHabitPillar,
  checked: boolean,
  dateKey = localDateKey(),
): void {
  const store = readManualStore();
  const day = { ...(store[dateKey] ?? {}) };
  if (checked) day[pillar] = true;
  else delete day[pillar];
  store[dateKey] = day;
  writeManualStore(store);
  notifyHabitsChanged();
}

export function gratitudeDoneForDate(
  entries: JournalEntry[],
  dateKey: string,
): boolean {
  return entries.some(
    (e) => isGratitudeEntry(e) && localDateKeyFromIso(e.createdAt) === dateKey,
  );
}

function dreamThoughtsToday(dream: PlanDream, dateKey: string): boolean {
  const lists = [dream.dreamEntries, dream.obstacleEntries, dream.visionEntries];
  for (const list of lists) {
    for (const entry of list ?? []) {
      if (entry?.createdAt && localDateKeyFromIso(entry.createdAt) === dateKey) {
        return true;
      }
    }
  }
  return false;
}

export function lifeAreaDoneForDate(
  store: IdeateStoreV2,
  dateKey: string,
): boolean {
  const demoDreamIds = new Set(
    (store.dreams ?? []).filter(isDemoIdeateDream).map((d) => d.id),
  );
  for (const todo of store.todos ?? []) {
    if (todo.isChecked && todo.checkedAt && localDateKeyFromIso(todo.checkedAt) === dateKey) {
      return true;
    }
  }
  for (const sub of store.subtasks ?? []) {
    if (demoDreamIds.has(sub.projectId)) continue;
    if (sub.completedAt && localDateKeyFromIso(sub.completedAt) === dateKey) {
      return true;
    }
  }
  for (const dream of store.dreams ?? []) {
    if (isDemoIdeateDream(dream)) continue;
    if (dreamThoughtsToday(dream, dateKey)) return true;
  }
  return false;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return localDateKey(dt);
}

function dayFlagsForDate(
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  dateKey: string,
  playStore: PlayEventsStore,
  manualStore: ManualStore,
): { gratitude: boolean; meditation: boolean; lifeArea: boolean } {
  const manual = manualStore[dateKey] ?? {};
  return {
    gratitude:
      Boolean(manual.gratitude) || gratitudeDoneForDate(entries, dateKey),
    meditation:
      Boolean(manual.meditation) ||
      Boolean(playStore[dateKey]?.playProgress60At),
    lifeArea:
      Boolean(manual.lifeArea) || lifeAreaDoneForDate(ideate, dateKey),
  };
}

function dayComplete(
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  dateKey: string,
  playStore: PlayEventsStore,
  manualStore: ManualStore,
): boolean {
  const f = dayFlagsForDate(entries, ideate, dateKey, playStore, manualStore);
  return f.gratitude && f.meditation && f.lifeArea;
}

function dayPartial(
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  dateKey: string,
  playStore: PlayEventsStore,
  manualStore: ManualStore,
): boolean {
  const f = dayFlagsForDate(entries, ideate, dateKey, playStore, manualStore);
  return f.gratitude || f.meditation || f.lifeArea;
}

type LocalDayPredicate = (
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  dateKey: string,
  playStore: PlayEventsStore,
  manualStore: ManualStore,
) => boolean;

function computeLocalStreakWith(
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  todayKey: string,
  playStore: PlayEventsStore,
  manualStore: ManualStore,
  predicate: LocalDayPredicate,
): number {
  let cursor = todayKey;
  if (!predicate(entries, ideate, cursor, playStore, manualStore)) {
    cursor = shiftDateKey(todayKey, -1);
  }
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (!predicate(entries, ideate, cursor, playStore, manualStore)) break;
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

function computeLocalRecordWith(
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  todayKey: string,
  playStore: PlayEventsStore,
  manualStore: ManualStore,
  predicate: LocalDayPredicate,
  windowDays = 730,
): number {
  let best = 0;
  let run = 0;
  const start = shiftDateKey(todayKey, -(windowDays - 1));
  for (let i = 0; i < windowDays; i++) {
    const key = shiftDateKey(start, i);
    if (predicate(entries, ideate, key, playStore, manualStore)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** Consecutive complete (all three) days ending yesterday if today incomplete, else including today. */
export function computeLocalStreak(
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  todayKey = localDateKey(),
): number {
  const playStore = readPlayStore();
  const manualStore = readManualStore();
  return computeLocalStreakWith(
    entries,
    ideate,
    todayKey,
    playStore,
    manualStore,
    dayComplete,
  );
}

export function computeLocalDailyStatus(
  entries: JournalEntry[],
  ideate: IdeateStoreV2,
  dateKey = localDateKey(),
): DailyStatus {
  const playStore = readPlayStore();
  const manualStore = readManualStore();
  const manual = loadLocalManualChecks(dateKey);
  const fullStreak = computeLocalStreakWith(
    entries,
    ideate,
    dateKey,
    playStore,
    manualStore,
    dayComplete,
  );
  const partialStreak = computeLocalStreakWith(
    entries,
    ideate,
    dateKey,
    playStore,
    manualStore,
    dayPartial,
  );
  return {
    gratitude: Boolean(manual.gratitude) || gratitudeDoneForDate(entries, dateKey),
    meditation:
      Boolean(manual.meditation) || hasLocalMeditationProgress(dateKey),
    lifeArea: Boolean(manual.lifeArea) || lifeAreaDoneForDate(ideate, dateKey),
    streak: fullStreak,
    fullStreak,
    partialStreak,
    fullStreakRecord: computeLocalRecordWith(
      entries,
      ideate,
      dateKey,
      playStore,
      manualStore,
      dayComplete,
    ),
    partialStreakRecord: computeLocalRecordWith(
      entries,
      ideate,
      dateKey,
      playStore,
      manualStore,
      dayPartial,
    ),
  };
}

export function formatHabitDateLabel(d = new Date()): string {
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `${weekday} ${day} ${month}`;
}
