/**
 * Gratitudes hub / All list helpers — day rows, labels, and grouping.
 */

import {
  emptyGratitudeLines,
  entriesForCloudPut,
  findGratitudeEntryForLocalDate,
  formatMonthHeading,
  gratitudeLinesToHtml,
  gratitudeTitleForDate,
  groupJournalEntriesByWeek,
  isGratitudeEntry,
  journalEntryDateIso,
  journalEntryHasMeaningfulContent,
  journalEntryHref,
  loadJournalStore,
  localDateKey,
  localDateKeyFromIso,
  monthKeyFromIso,
  newGratitudeJournalEntry,
  normalizeGratitudeLines,
  saveJournalStore,
  type JournalEntry,
  type JournalGratitudeLines,
  type JournalSidebarGroup,
} from "@/lib/journal-storage";
import { getMedimadeSessionJwt } from "@/lib/auth-session";
import { putJournalStoreRemote } from "@/lib/medimade-api";

export const GRATITUDES_HUB_HREF = "/journal/gratitudes";
export const GRATITUDES_ALL_HREF = "/journal/gratitudes/all";

/** Path segment reserved for the All list (not an entry slug). */
export function isGratitudesAllPath(pathname: string): boolean {
  return (
    pathname === "/journal/gratitudes/all" ||
    pathname === "/journal/gratitude/all" ||
    pathname === "/journal/gratitudes/all/" ||
    pathname === "/journal/gratitude/all/"
  );
}

export type GratitudeDayRow = {
  entry: JournalEntry;
  dateKey: string;
  dateLabel: string;
  firstLine: string;
  count: number;
  href: string;
};

/** Short list label: "Wed 4 Nov". */
export function formatGratitudeRowDate(isoOrKey: string): string {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(isoOrKey.trim())
    ? isoOrKey.trim()
    : localDateKeyFromIso(isoOrKey);
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return "—";
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  return `${weekday} ${day} ${month}`;
}

/** Compact page heading: "TODAY · THU 5 NOV" or "WED 4 NOV". */
export function formatGratitudeCompactHeading(
  isoOrKey: string,
  opts?: { todayPrefix?: boolean },
): string {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(isoOrKey.trim())
    ? isoOrKey.trim()
    : localDateKeyFromIso(isoOrKey);
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return "—";
  const date = new Date(y, m - 1, d);
  const weekday = date
    .toLocaleDateString("en-GB", { weekday: "short" })
    .toUpperCase();
  const day = date.getDate();
  const month = date
    .toLocaleDateString("en-GB", { month: "short" })
    .toUpperCase();
  const body = `${weekday} ${day} ${month}`;
  const isToday = key === localDateKey();
  if (opts?.todayPrefix !== false && isToday) return `TODAY · ${body}`;
  return body;
}

function filledGratitudeCount(entry: JournalEntry): number {
  const lines = entry.gratitude ?? [];
  const fromLines = lines.filter((s) => s.trim().length > 0).length;
  if (fromLines > 0) return Math.min(3, fromLines) || fromLines;
  return 0;
}

function firstGratitudeLine(entry: JournalEntry): string {
  for (const line of entry.gratitude ?? []) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

/** Days with at least one filled gratitude line, newest first. Excludes empty today stubs. */
export function listFilledGratitudeDays(
  entries: JournalEntry[],
): GratitudeDayRow[] {
  const byDay = new Map<string, JournalEntry>();
  for (const e of entries) {
    if (!isGratitudeEntry(e)) continue;
    if (!journalEntryHasMeaningfulContent(e)) continue;
    const key = localDateKeyFromIso(journalEntryDateIso(e));
    const prev = byDay.get(key);
    if (!prev) {
      byDay.set(key, e);
      continue;
    }
    // Prefer the most recently updated when duplicates share a day.
    if (
      Date.parse(e.updatedAt || e.createdAt) >=
      Date.parse(prev.updatedAt || prev.createdAt)
    ) {
      byDay.set(key, e);
    }
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, entry]) => ({
      entry,
      dateKey,
      dateLabel: formatGratitudeRowDate(dateKey),
      firstLine: firstGratitudeLine(entry),
      count: filledGratitudeCount(entry),
      href: journalEntryHref(entry),
    }));
}

export function countGratitudeDays(entries: JournalEntry[]): number {
  return listFilledGratitudeDays(entries).length;
}

/** Past days only (never today), newest first, capped. */
export function listEarlierGratitudeDays(
  entries: JournalEntry[],
  limit = 4,
): GratitudeDayRow[] {
  const today = localDateKey();
  return listFilledGratitudeDays(entries)
    .filter((d) => d.dateKey !== today)
    .slice(0, limit);
}

export function groupGratitudeDays(
  days: GratitudeDayRow[],
): JournalSidebarGroup[] {
  const entries = days.map((d) => d.entry);
  return groupJournalEntriesByWeek(entries);
}

/** Upsert today's gratitude lines (+ optional mood/tags). */
export function persistTodayGratitudes(
  lines: JournalGratitudeLines,
  extras?: { mood?: JournalEntry["mood"]; tags?: string[] },
  source = "journal-gratitudes",
): JournalEntry {
  const normalized = normalizeGratitudeLines(lines);
  let store = loadJournalStore();
  const today = localDateKey();
  const existing = findGratitudeEntryForLocalDate(store.entries, today);
  const now = new Date();
  const entry: JournalEntry = existing
    ? {
        ...existing,
        gratitude: normalized,
        contentHtml: gratitudeLinesToHtml(normalized),
        title: gratitudeTitleForDate(
          Number.isNaN(new Date(existing.createdAt).getTime())
            ? now
            : new Date(existing.createdAt),
        ),
        updatedAt: now.toISOString(),
        ...(extras?.mood !== undefined ? { mood: extras.mood } : {}),
        ...(extras?.tags !== undefined ? { tags: extras.tags } : {}),
      }
    : {
        ...newGratitudeJournalEntry(now),
        gratitude: normalized,
        contentHtml: gratitudeLinesToHtml(normalized),
        ...(extras?.mood !== undefined ? { mood: extras.mood } : {}),
        ...(extras?.tags !== undefined ? { tags: extras.tags } : {}),
      };
  const idx = store.entries.findIndex((e) => e.id === entry.id);
  const nextEntries =
    idx === -1
      ? [entry, ...store.entries]
      : store.entries.map((e, i) => (i === idx ? entry : e));
  store = { ...store, entries: nextEntries, activeEntryId: entry.id };
  saveJournalStore(store, { source });
  if (getMedimadeSessionJwt()) {
    const cloudEntries = entriesForCloudPut(store.entries);
    if (cloudEntries.length > 0) {
      void putJournalStoreRemote({
        ...store,
        entries: cloudEntries,
        activeEntryId: entry.id,
      }).catch(() => {});
    }
  }
  return entry;
}

export function ensureTodayGratitudeEntry(
  source = "journal-gratitudes",
): JournalEntry {
  const store = loadJournalStore();
  const existing = findGratitudeEntryForLocalDate(
    store.entries,
    localDateKey(),
  );
  if (existing) return existing;
  return persistTodayGratitudes(emptyGratitudeLines(), undefined, source);
}

// Re-export for callers that already import month helpers via this module.
export { formatMonthHeading, monthKeyFromIso };
