"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/spa-nav";
import { JournalGratitudeDayRow } from "@/components/journal-gratitude-day-row";
import { JournalLockGate } from "@/components/journal-lock-gate";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import {
  GRATITUDES_HUB_HREF,
  formatGratitudeRowDate,
  groupGratitudeDays,
  listFilledGratitudeDays,
  type GratitudeDayRow,
} from "@/lib/journal-gratitudes";
import {
  JOURNAL_STORE_CHANGED,
  journalEntryDateIso,
  journalEntryHref,
  localDateKeyFromIso,
  readJournalStoreSnapshot,
} from "@/lib/journal-storage";

function BackChevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

/**
 * Full searchable gratitudes list, grouped like Entries.
 */
export function JournalGratitudesAll() {
  const [days, setDays] = useState<GratitudeDayRow[]>(() =>
    listFilledGratitudeDays(
      readJournalStoreSnapshot({ signedIn: isMedimadeSessionActive() }).entries,
    ),
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    const refresh = () => {
      setDays(
        listFilledGratitudeDays(
          readJournalStoreSnapshot({
            signedIn: isMedimadeSessionActive(),
          }).entries,
        ),
      );
    };
    window.addEventListener(JOURNAL_STORE_CHANGED, refresh);
    return () => window.removeEventListener(JOURNAL_STORE_CHANGED, refresh);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return days;
    return days.filter((d) => {
      const hay = (d.entry.gratitude ?? []).join("\n").toLowerCase();
      return hay.includes(q) || d.firstLine.toLowerCase().includes(q);
    });
  }, [days, query]);

  const groups = useMemo(() => groupGratitudeDays(filtered), [filtered]);

  const rowById = useMemo(() => {
    const m = new Map<string, GratitudeDayRow>();
    for (const d of filtered) m.set(d.entry.id, d);
    return m;
  }, [filtered]);

  return (
    <JournalLockGate>
      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-transparent">
        <div className="journal-mobile-paisley-bg relative z-[1] flex h-full min-h-0 w-full min-w-0 max-w-6xl flex-col overflow-hidden border-r-[0.5px] border-border">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
            <div className="px-5 pt-3 sm:px-6">
              <Link
                href={GRATITUDES_HUB_HREF}
                className="inline-flex items-center gap-0.5 text-[14.5px] font-semibold text-muted hover:text-foreground"
              >
                <BackChevron />
                Gratitudes
              </Link>
            </div>

            <div className="mx-4 mt-3.5 flex h-11 items-center gap-2 rounded-xl border border-border bg-[color-mix(in_srgb,var(--journal-warm-bg)_70%,white)] px-3.5 text-muted sm:mx-6">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search gratitudes…"
                aria-label="Search gratitudes"
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
              />
            </div>

            {groups.length === 0 ? (
              <p className="px-6 pt-8 text-sm text-muted">
                {query.trim()
                  ? "No days match that search."
                  : "No gratitudes yet."}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.id} className="mt-4">
                  <div className="px-5 pb-1.5 text-[11.5px] font-semibold uppercase tracking-[1.3px] text-muted sm:px-6">
                    {group.label}
                  </div>
                  <div className="mx-4 rounded-[18px] border border-border bg-[color:var(--journal-warm-bg)] px-4 sm:mx-6">
                    {group.entries.map((entry, i) => {
                      const prepared = rowById.get(entry.id);
                      const day: GratitudeDayRow = prepared ?? {
                        entry,
                        dateKey: localDateKeyFromIso(
                          journalEntryDateIso(entry),
                        ),
                        dateLabel: formatGratitudeRowDate(
                          journalEntryDateIso(entry),
                        ),
                        firstLine: "",
                        count: 0,
                        href: journalEntryHref(entry),
                      };
                      return (
                        <JournalGratitudeDayRow
                          key={entry.id}
                          day={day}
                          bordered={i > 0}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </JournalLockGate>
  );
}
