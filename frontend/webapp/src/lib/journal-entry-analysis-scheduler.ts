/**
 * Debounced per-entry analysis for history Insights.
 * Runs once per content hash after the user stops editing; Insights never
 * re-analyses on open (it only reads the local analysis store).
 */

import {
  analyzeJournalEntryRemote,
  getMedimadeApiBase,
} from "@/lib/medimade-api";
import {
  contentHashForEntry,
  getEntryAnalysis,
  htmlToPlain,
  listEntryAnalyses,
  upsertEntryAnalysis,
} from "@/lib/journal-history-insights";
import {
  isGratitudeEntry,
  journalEntryDateIso,
  loadJournalStore,
  type JournalEntry,
} from "@/lib/journal-storage";
import { fetchUserSettings } from "@/lib/settings-api";

const DEBOUNCE_MS = 2500;
const MIN_PLAIN_CHARS = 40;
const SETTINGS_TTL_MS = 60_000;
export const JOURNAL_ENTRY_ANALYSIS_CHANGED = "mm-journal-entry-analysis-changed";

type Pending = {
  timer: ReturnType<typeof setTimeout>;
  entry: JournalEntry;
};

const pending = new Map<string, Pending>();
const inflight = new Set<string>();

let optInCache: { value: boolean; at: number } | null = null;

/** Call after the opt-in setting changes so the next check re-reads it. */
export function invalidateJournalInsightsOptInCache(next?: boolean): void {
  optInCache = typeof next === "boolean" ? { value: next, at: Date.now() } : null;
}

export async function isJournalInsightsOptedIn(): Promise<boolean> {
  if (optInCache && Date.now() - optInCache.at < SETTINGS_TTL_MS) {
    return optInCache.value;
  }
  if (!getMedimadeApiBase()) return false;
  try {
    const { settings } = await fetchUserSettings();
    optInCache = { value: settings.ai.insightsFromJournal, at: Date.now() };
    return optInCache.value;
  } catch {
    return optInCache?.value ?? false;
  }
}

function entryEligible(entry: JournalEntry): boolean {
  if (isGratitudeEntry(entry)) return false;
  return htmlToPlain(entry.contentHtml || "").length >= MIN_PLAIN_CHARS;
}

function analysisFresh(entry: JournalEntry): boolean {
  const existing = getEntryAnalysis(entry.id);
  return Boolean(existing && existing.contentHash === contentHashForEntry(entry));
}

function knownThemeNames(): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const a of listEntryAnalyses()) {
    for (const t of a.themes ?? []) {
      const name = t.theme?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = counts.get(key);
      if (cur) cur.n += 1;
      else counts.set(key, { name, n: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 60)
    .map((x) => x.name);
}

async function runAnalysis(entry: JournalEntry): Promise<boolean> {
  if (!entryEligible(entry) || analysisFresh(entry)) return false;
  if (inflight.has(entry.id)) return false;
  inflight.add(entry.id);
  try {
    const contentHash = contentHashForEntry(entry);
    const result = await analyzeJournalEntryRemote({
      entryId: entry.id,
      contentHash,
      title: entry.title || "",
      contentHtml: entry.contentHtml || "",
      mood: entry.mood,
      entryDate: journalEntryDateIso(entry),
      knownThemes: knownThemeNames(),
    });
    upsertEntryAnalysis({ ...result, entryId: entry.id, contentHash });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(JOURNAL_ENTRY_ANALYSIS_CHANGED));
    }
    return true;
  } catch (e) {
    console.warn("[journal-insights] analyze failed", e);
    return false;
  } finally {
    inflight.delete(entry.id);
  }
}

/** Debounced (~2.5s per entry id). Safe to call on every save. */
export function scheduleJournalEntryAnalysis(entry: JournalEntry): void {
  if (typeof window === "undefined") return;
  if (!entryEligible(entry)) return;
  const prev = pending.get(entry.id);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pending.delete(entry.id);
    void fire(entry);
  }, DEBOUNCE_MS);
  pending.set(entry.id, { timer, entry });
}

async function fire(entry: JournalEntry): Promise<void> {
  if (analysisFresh(entry)) return;
  if (!(await isJournalInsightsOptedIn())) return;
  await runAnalysis(entry);
}

/** Run any debounced analyses now (e.g. when leaving the editor). */
export async function flushPendingJournalEntryAnalyses(): Promise<void> {
  const items = [...pending.values()];
  pending.clear();
  for (const p of items) clearTimeout(p.timer);
  if (!items.length) return;
  if (!(await isJournalInsightsOptedIn())) return;
  for (const p of items) {
    await runAnalysis(p.entry);
  }
}

/**
 * Analyse entries that have never been analysed (e.g. written before the
 * opt-in). Newest first, capped per run; stale hashes are left to the save path.
 */
export async function backfillJournalEntryAnalyses(opts?: {
  max?: number;
  onProgress?: (remaining: number) => void;
}): Promise<number> {
  if (!(await isJournalInsightsOptedIn())) return 0;
  const max = opts?.max ?? 40;
  const todo = loadJournalStore()
    .entries.filter(
      (e) => entryEligible(e) && !getEntryAnalysis(e.id) && !pending.has(e.id),
    )
    .sort(
      (a, b) =>
        Date.parse(journalEntryDateIso(b)) - Date.parse(journalEntryDateIso(a)),
    )
    .slice(0, max);
  let done = 0;
  for (const entry of todo) {
    opts?.onProgress?.(todo.length - done);
    if (await runAnalysis(entry)) done += 1;
  }
  opts?.onProgress?.(0);
  return done;
}
