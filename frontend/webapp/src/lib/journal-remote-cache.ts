/**
 * In-memory session cache for journal remote reads.
 * Avoids re-hitting the API when Insights remounts or the user returns
 * to /journal within the same tab session.
 */

import type {
  JournalInsights,
  JournalWeeklyLetterSummary,
  JournalWeeklyReflection,
} from "@/lib/medimade-api";

type CacheBox<T> = { value: T; at: number };

const TTL_MS = 5 * 60 * 1000;

let insightsBox: CacheBox<JournalInsights | null> | null = null;
let lettersBox: CacheBox<{
  letters: JournalWeeklyLetterSummary[];
  currentWeekKey: string;
}> | null = null;
const weeklyBox = new Map<
  string,
  CacheBox<{
    reflection: JournalWeeklyReflection | null;
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    empty?: boolean;
  }>
>();

/**
 * Last successful journal store pull (ms). Used to debounce Strict Mode double
 * mounts — NOT to skip pulls for the rest of the session (that broke web↔native
 * sync while the app stayed open).
 */
let journalStoreLastPullAt = 0;
const JOURNAL_STORE_PULL_DEBOUNCE_MS = 1500;

function fresh<T>(box: CacheBox<T> | null | undefined): T | undefined {
  if (!box) return undefined;
  if (Date.now() - box.at > TTL_MS) return undefined;
  return box.value;
}

export function getCachedJournalInsights(): JournalInsights | null | undefined {
  return fresh(insightsBox);
}

export function setCachedJournalInsights(value: JournalInsights | null): void {
  insightsBox = { value, at: Date.now() };
}

export function invalidateCachedJournalInsights(): void {
  insightsBox = null;
}

export function getCachedWeeklyLetters():
  | { letters: JournalWeeklyLetterSummary[]; currentWeekKey: string }
  | undefined {
  return fresh(lettersBox);
}

export function setCachedWeeklyLetters(value: {
  letters: JournalWeeklyLetterSummary[];
  currentWeekKey: string;
}): void {
  lettersBox = { value, at: Date.now() };
}

export function invalidateCachedWeeklyLetters(): void {
  lettersBox = null;
}

export function getCachedWeeklyReflection(weekKey: string):
  | {
      reflection: JournalWeeklyReflection | null;
      weekKey: string;
      weekStart: string;
      weekEnd: string;
      empty?: boolean;
    }
  | undefined {
  return fresh(weeklyBox.get(weekKey || "__current__"));
}

export function setCachedWeeklyReflection(
  weekKey: string,
  value: {
    reflection: JournalWeeklyReflection | null;
    weekKey: string;
    weekStart: string;
    weekEnd: string;
    empty?: boolean;
  },
): void {
  weeklyBox.set(weekKey || "__current__", { value, at: Date.now() });
}

export function invalidateCachedWeeklyReflection(weekKey?: string): void {
  if (weekKey) {
    weeklyBox.delete(weekKey);
    weeklyBox.delete("__current__");
    return;
  }
  weeklyBox.clear();
}

/** True when a pull finished very recently (avoid Strict Mode double GET). */
export function wasJournalStorePulledThisSession(): boolean {
  return (
    journalStoreLastPullAt > 0 &&
    Date.now() - journalStoreLastPullAt < JOURNAL_STORE_PULL_DEBOUNCE_MS
  );
}

export function markJournalStorePulledThisSession(): void {
  journalStoreLastPullAt = Date.now();
}

/** Force the next Journal open / foreground to hit GET /journal/store. */
export function clearJournalStorePulledThisSession(): void {
  journalStoreLastPullAt = 0;
}

export function clearJournalRemoteSessionCache(): void {
  insightsBox = null;
  lettersBox = null;
  weeklyBox.clear();
  journalStoreLastPullAt = 0;
}
