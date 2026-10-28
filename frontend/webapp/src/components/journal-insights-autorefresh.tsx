import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  fetchJournalInsightsRemote,
  getMedimadeApiBase,
  runJournalInsightsRemote,
} from "@/lib/medimade-api";
import { setCachedJournalInsights } from "@/lib/journal-remote-cache";
import { loadJournalStoreRaw } from "@/lib/journal-storage";
import { mvpFlagsSnapshot } from "@/lib/mvp-flags";

function maxUpdatedAtIso(): string | null {
  try {
    const store = loadJournalStoreRaw();
    if (!store.entries.length) return null;
    let max = 0;
    for (const e of store.entries) {
      const t = new Date(e.updatedAt).getTime();
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max ? new Date(max).toISOString() : null;
  } catch {
    return null;
  }
}

function isJournalEditorPath(p: string): boolean {
  if (p === "/journal/insights" || p.startsWith("/journal/insights/")) {
    return false;
  }
  return p === "/journal/entries" || p.startsWith("/journal/entries/");
}

const inFlightRef = { current: false };
const lastTriggeredForUpdatedAtRef = { current: null as string | null };

/**
 * Run after the user leaves the journal editor context (navigate away from
 * Journal / Gratitudes, including to Insights).
 */
export function scheduleJournalInsightsRefreshAfterLeavingEditor(): void {
  if (!mvpFlagsSnapshot().journalInsights) return;
  const base = getMedimadeApiBase();
  if (!base) return;

  const localMax = maxUpdatedAtIso();
  if (!localMax) return;
  if (lastTriggeredForUpdatedAtRef.current === localMax) return;
  if (inFlightRef.current) return;
  inFlightRef.current = true;

  void (async () => {
    try {
      const existing = await fetchJournalInsightsRemote();
      setCachedJournalInsights(existing);
      const lastProcessed = existing?.meta.lastProcessedMaxUpdatedAt ?? null;
      const localMs = new Date(localMax).getTime();
      const processedMs = lastProcessed ? new Date(lastProcessed).getTime() : 0;
      if (!Number.isFinite(localMs)) return;
      if (localMs <= processedMs) return;
      lastTriggeredForUpdatedAtRef.current = localMax;
      const got = await runJournalInsightsRemote();
      setCachedJournalInsights(got);
    } catch {
      /* ignore: navigation-triggered background refresh */
    } finally {
      inFlightRef.current = false;
    }
  })();
}

export function JournalInsightsAutoRefresh() {
  const pathname = useLocation().pathname || "/";
  const prevPathRef = useRef<string>(pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    if (prev === pathname) return;
    prevPathRef.current = pathname;

    if (!isJournalEditorPath(prev) || isJournalEditorPath(pathname)) return;
    scheduleJournalInsightsRefreshAfterLeavingEditor();
  }, [pathname]);

  return null;
}
