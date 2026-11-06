/**
 * Account preference: Entries list sort (entry date vs last edited).
 * Synced via user settings `journal.entriesSort` (default entryDate).
 */

import { patchUserSettings } from "@/lib/settings-api";
import {
  defaultUserSettings,
  type UserSettingsV1,
} from "@/lib/user-settings";

export type JournalEntriesSort = "entryDate" | "lastEdited";

export const JOURNAL_ENTRIES_SORT_CHANGED = "mm-journal-entries-sort-changed";

let memorySort: JournalEntriesSort | null = null;

export function readJournalEntriesSort(
  settings?: UserSettingsV1 | null,
): JournalEntriesSort {
  if (memorySort) return memorySort;
  const fromSettings = settings?.journal?.entriesSort;
  if (fromSettings === "entryDate" || fromSettings === "lastEdited") {
    return fromSettings;
  }
  return defaultUserSettings().journal.entriesSort;
}

export function setJournalEntriesSort(
  sort: JournalEntriesSort,
  opts?: { persist?: boolean },
): void {
  memorySort = sort;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(JOURNAL_ENTRIES_SORT_CHANGED, { detail: { sort } }),
    );
  }
  if (opts?.persist === false) return;
  void patchUserSettings({ journal: { entriesSort: sort } }).catch(() => {
    /* offline — memory still applies */
  });
}

export function syncJournalEntriesSortFromSettings(
  settings: UserSettingsV1,
): void {
  const sort =
    settings.journal?.entriesSort === "lastEdited"
      ? "lastEdited"
      : "entryDate";
  memorySort = sort;
}
