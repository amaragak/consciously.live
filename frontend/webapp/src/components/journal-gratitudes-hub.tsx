"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/spa-nav";
import { JournalEntryMeta } from "@/components/journal-entry-meta";
import { JournalGratitudeDayRow } from "@/components/journal-gratitude-day-row";
import { JournalGratitudeEditor } from "@/components/journal-gratitude-editor";
import { JournalLockGate } from "@/components/journal-lock-gate";
import { JournalMobileSectionTabs } from "@/components/journal-mobile-section-tabs";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import {
  GRATITUDES_ALL_HREF,
  ensureTodayGratitudeEntry,
  formatGratitudeCompactHeading,
  listEarlierGratitudeDays,
  persistTodayGratitudes,
} from "@/lib/journal-gratitudes";
import {
  JOURNAL_STORE_CHANGED,
  emptyGratitudeLines,
  journalEntryDateIso,
  normalizeGratitudeLines,
  readJournalStoreSnapshot,
  type JournalEntry,
  type JournalGratitudeLines,
} from "@/lib/journal-storage";

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function loadToday(): JournalEntry {
  return ensureTodayGratitudeEntry("journal-gratitudes-hub");
}

/**
 * Gratitudes hub: today's fields at the top, up to four earlier days, then All.
 */
export function JournalGratitudesHub() {
  const [today, setToday] = useState<JournalEntry>(() => loadToday());
  const [lines, setLines] = useState<JournalGratitudeLines>(() =>
    normalizeGratitudeLines(loadToday().gratitude ?? emptyGratitudeLines()),
  );
  const [earlier, setEarlier] = useState(() =>
    listEarlierGratitudeDays(
      readJournalStoreSnapshot({ signedIn: isMedimadeSessionActive() }).entries,
      4,
    ),
  );

  useEffect(() => {
    const refresh = () => {
      const store = readJournalStoreSnapshot({
        signedIn: isMedimadeSessionActive(),
      });
      const entry = ensureTodayGratitudeEntry("journal-gratitudes-hub");
      setToday(entry);
      setLines(
        normalizeGratitudeLines(entry.gratitude ?? emptyGratitudeLines()),
      );
      setEarlier(listEarlierGratitudeDays(store.entries, 4));
    };
    const onStore = (ev: Event) => {
      const src = (ev as CustomEvent<{ source?: string }>).detail?.source;
      if (src === "journal-gratitudes-hub") {
        setEarlier(
          listEarlierGratitudeDays(
            readJournalStoreSnapshot({
              signedIn: isMedimadeSessionActive(),
            }).entries,
            4,
          ),
        );
        return;
      }
      refresh();
    };
    window.addEventListener(JOURNAL_STORE_CHANGED, onStore);
    return () => window.removeEventListener(JOURNAL_STORE_CHANGED, onStore);
  }, []);

  const heading = useMemo(
    () => formatGratitudeCompactHeading(journalEntryDateIso(today)),
    [today],
  );

  const onChange = useCallback((next: JournalGratitudeLines) => {
    const normalized = normalizeGratitudeLines(next);
    setLines(normalized);
    const entry = persistTodayGratitudes(
      normalized,
      undefined,
      "journal-gratitudes-hub",
    );
    setToday(entry);
  }, []);

  const onMoodChange = useCallback(
    (mood: JournalEntry["mood"]) => {
      const entry = persistTodayGratitudes(
        lines,
        { mood },
        "journal-gratitudes-hub",
      );
      setToday(entry);
    },
    [lines],
  );

  const onTagsChange = useCallback(
    (tags: string[]) => {
      const entry = persistTodayGratitudes(
        lines,
        { tags },
        "journal-gratitudes-hub",
      );
      setToday(entry);
    },
    [lines],
  );

  return (
    <JournalLockGate>
      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-transparent">
        <div className="journal-mobile-paisley-bg relative z-[1] flex h-full min-h-0 w-full min-w-0 max-w-6xl flex-col overflow-hidden border-r-[0.5px] border-border">
          <JournalMobileSectionTabs
            value="gratitude"
            className="md:hidden"
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <JournalGratitudeEditor
              createdAt={journalEntryDateIso(today)}
              lines={lines}
              onChange={onChange}
              headingVariant="compact"
              compactHeading={heading}
            >
              <JournalEntryMeta
                mood={today.mood}
                tags={today.tags}
                onMoodChange={onMoodChange}
                onTagsChange={onTagsChange}
              />
            </JournalGratitudeEditor>

            {earlier.length > 0 ? (
              <div className="mx-4 mb-6 mt-3.5 rounded-[18px] border border-border bg-[color:var(--journal-warm-bg)] px-4 pb-1.5 pt-3 sm:mx-6">
                <div className="pb-1">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[1.4px] text-[color:#8A6424]">
                    Earlier
                  </span>
                </div>
                <div>
                  {earlier.map((day, i) => (
                    <JournalGratitudeDayRow
                      key={day.entry.id}
                      day={day}
                      bordered={i > 0}
                    />
                  ))}
                </div>
                <div className="flex justify-center border-t border-border py-3">
                  <Link
                    href={GRATITUDES_ALL_HREF}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-card px-4 text-[14px] font-semibold text-foreground"
                  >
                    All gratitudes
                    <ChevronRight className="opacity-80" />
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </JournalLockGate>
  );
}
