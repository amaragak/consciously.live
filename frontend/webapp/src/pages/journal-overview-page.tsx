import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { Link } from "@/lib/spa-nav";
import { JournalListChips } from "@/components/journal-view";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import {
  OverviewOutlineLink,
  OverviewSection,
} from "@/components/overview-hero";
import { OverviewSubpagesPanel } from "@/components/overview-subpages-panel";
import { useGuides } from "@/content/guides";
import { JournalEntryListTitle } from "@/components/journal-prompt-question";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { formatRangeWords } from "@/lib/insight-period";
import {
  JOURNAL_MOOD_WEEK_CELL,
  isJournalMoodId,
  journalMoodLabel,
  type JournalMoodId,
} from "@/lib/journal-moods";
import {
  JOURNAL_STORE_CHANGED,
  emptyGratitudeLines,
  entriesForCloudPut,
  findGratitudeEntryForLocalDate,
  gratitudeLinesToHtml,
  gratitudeTitleForDate,
  isGratitudeEntry,
  loadJournalStore,
  localDateKey,
  localDateKeyFromIso,
  newGratitudeJournalEntry,
  normalizeGratitudeLines,
  readJournalStoreSnapshot,
  saveJournalStore,
  stripHtmlToText,
  withoutDemoJournalEntries,
  type JournalEntry,
  type JournalGratitudeLines,
} from "@/lib/journal-storage";
import {
  putJournalStoreRemote,
  type JournalWeeklyLetterSummary,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";

function entryExcerpt(e: JournalEntry): string {
  const t = stripHtmlToText(e.contentHtml).trim();
  if (!t) return "Empty entry";
  return t.length > 280 ? `${t.slice(0, 277)}…` : t;
}

function formatOverviewEntryDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function EntryOverviewCard({
  entry,
  divider,
}: {
  entry: JournalEntry;
  divider?: boolean;
}) {
  const date = formatOverviewEntryDate(entry.entryDate || entry.createdAt);
  return (
    <Link
      href={`/journal/entries/${encodeURIComponent(entry.id)}`}
      className={`flex min-w-0 flex-col gap-1 rounded-[14px] border border-border bg-card px-4 py-3.5 max-md:rounded-none max-md:border-0 max-md:border-border max-md:bg-transparent max-md:px-0 max-md:py-2.5 ${
        divider ? "max-md:border-t" : ""
      }`}
    >
      <JournalEntryListTitle
        entry={entry}
        className="truncate text-[15px] font-semibold text-foreground"
      />
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground/90">
        <JournalListChips entry={entry} inline />
        <span className="min-w-0 flex-1 truncate">
          {date ? <span className="text-muted">{date} · </span> : null}
          {entryExcerpt(entry)}
        </span>
      </span>
    </Link>
  );
}

function persistTodayGratitudes(lines: JournalGratitudeLines) {
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
      }
    : {
        ...newGratitudeJournalEntry(now),
        gratitude: normalized,
        contentHtml: gratitudeLinesToHtml(normalized),
      };
  const idx = store.entries.findIndex((e) => e.id === entry.id);
  const entries =
    idx === -1
      ? [entry, ...store.entries]
      : store.entries.map((e, i) => (i === idx ? entry : e));
  store = { ...store, entries, activeEntryId: entry.id };
  saveJournalStore(store, { source: "journal-overview" });
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
}

function useTodayGratitudes() {
  const [lines, setLines] = useState<JournalGratitudeLines>(() => {
    const store = readJournalStoreSnapshot({
      signedIn: isMedimadeSessionActive(),
    });
    const existing = findGratitudeEntryForLocalDate(
      store.entries,
      localDateKey(),
    );
    return normalizeGratitudeLines(existing?.gratitude ?? emptyGratitudeLines());
  });

  useEffect(() => {
    const refresh = () => {
      const store = readJournalStoreSnapshot({
        signedIn: isMedimadeSessionActive(),
      });
      const existing = findGratitudeEntryForLocalDate(
        store.entries,
        localDateKey(),
      );
      setLines(
        normalizeGratitudeLines(existing?.gratitude ?? emptyGratitudeLines()),
      );
    };
    const onStore = (ev: Event) => {
      const src = (ev as CustomEvent<{ source?: string }>).detail?.source;
      if (src === "journal-overview") return;
      refresh();
    };
    window.addEventListener(JOURNAL_STORE_CHANGED, onStore);
    return () => window.removeEventListener(JOURNAL_STORE_CHANGED, onStore);
  }, []);

  const filled = lines.filter((l) => l.trim()).length;

  const commitLine = useCallback(
    (index: number, value: string) => {
      const next = [...lines];
      next[index] = value;
      const normalized = normalizeGratitudeLines(next);
      setLines(normalized);
      persistTodayGratitudes(normalized);
    },
    [lines],
  );

  return { lines, setLines, filled, commitLine };
}

function todayDateTitle(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const day = now.getDate();
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${weekday} ${day} ${month}`;
}

function entryFirstLine(entry: JournalEntry): string {
  const text = stripHtmlToText(entry.contentHtml).trim().replace(/\s+/g, " ");
  return text;
}

function HeroGratitudesFields() {
  const { lines, setLines, filled, commitLine } = useTodayGratitudes();
  return (
    <div className="flex flex-col gap-0.5">
      <div className="mb-0.5 flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[1.4px] text-[#D9B87C]">
          Today&apos;s gratitudes
        </span>
        <span className="text-[12.5px] text-[rgb(243_237_226_/_0.55)]">
          {filled} of 3
        </span>
      </div>
      <div className="flex flex-col">
        {([0, 1, 2] as const).map((i) => {
          const value = lines[i] ?? "";
          return (
            <label
              key={i}
              className="flex h-11 min-w-0 items-center gap-2.5 border-b border-[rgb(243_237_226_/_0.18)]"
            >
              <span
                className="w-3.5 shrink-0 font-display text-[18px] leading-none text-[#D9B87C]"
                aria-hidden
              >
                {i + 1}
              </span>
              <input
                type="text"
                value={value}
                placeholder="I'm grateful for…"
                aria-label={
                  i === 0
                    ? "First thing you're grateful for"
                    : i === 1
                      ? "Second thing you're grateful for"
                      : "Third thing you're grateful for"
                }
                onChange={(e) => {
                  const next = [...lines];
                  next[i] = e.target.value;
                  setLines(normalizeGratitudeLines(next));
                }}
                onBlur={(e) => commitLine(i, e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[16.5px] text-[#F3EDE2] outline-none placeholder:text-[rgb(243_237_226_/_0.45)]"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function JournalTodayHero({
  todayEntry,
}: {
  todayEntry: JournalEntry | null;
}) {
  const started = Boolean(todayEntry);
  const entryTitle = started
    ? todayEntry!.title?.trim() || "Untitled"
    : null;
  const firstLine = started ? entryFirstLine(todayEntry!) : "";
  const href = started
    ? `/journal/entries/${encodeURIComponent(todayEntry!.id)}`
    : "/journal/entries?new=1";
  const cta = started ? "Continue writing" : "New entry";

  const mistCta = (
    <Link
      href={href}
      className="inline-flex h-9 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#AFC2DC] bg-accent-button px-4 text-[13.5px] font-semibold text-on-accent"
    >
      {started ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 20h4L19 9l-4-4L4 16z" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
      {cta}
    </Link>
  );

  const leftColumn = (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-[11.5px] font-semibold uppercase tracking-[1.4px] text-[#D9B87C]">
        Today
      </p>
      <h1 className="font-display text-[24px] leading-[1.1] text-[#F3EDE2] md:text-[28px]">
        {todayDateTitle()}
      </h1>
      {started ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-[14px] font-semibold text-[#F3EDE2]">
            {entryTitle}
          </p>
          {firstLine ? (
            <p className="truncate text-[13.5px] text-[rgb(243_237_226_/_0.65)]">
              {firstLine}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[13.5px] text-[rgb(243_237_226_/_0.65)]">
          Nothing written yet today.
        </p>
      )}
      <div className="pt-0.5">{mistCta}</div>
    </div>
  );

  return (
    <section
      className="relative overflow-hidden rounded-[22px] px-5 pb-5 pt-4 shadow-[0_12px_34px_rgba(15,27,45,0.18)] md:px-5 md:pb-5 md:pt-4"
      style={{ backgroundColor: "#0F1B2D" }}
    >
      <div className="navy-paisley-plate" aria-hidden />
      {/* Mobile: stacked. Desktop: two columns + vertical hairline. */}
      <div className="relative flex flex-col gap-3.5 md:flex-row md:items-start md:gap-8">
        <div className="min-w-0 md:flex-1">{leftColumn}</div>
        <div
          className="hidden w-px shrink-0 self-stretch bg-[rgb(243_237_226_/_0.14)] md:block"
          aria-hidden
        />
        <div className="min-w-0 md:w-[46%] md:shrink-0">
          <HeroGratitudesFields />
        </div>
      </div>
    </section>
  );
}

/* Separate Today's gratitudes panel — replaced by in-hero fields.
function TodaysGratitudesCard() { ... }
*/

function moodDaysForLetter(
  entries: JournalEntry[],
  startDate: string,
  endDate: string,
): { key: string; label: string; mood: JournalMoodId | null }[] {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  // Show at most the last 7 days of the period.
  const windowStart = new Date(end);
  windowStart.setDate(windowStart.getDate() - 6);
  if (windowStart < start) windowStart.setTime(start.getTime());

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDay = new Map<string, JournalMoodId | null>();
  for (const e of entries) {
    if (isGratitudeEntry(e)) continue;
    const key = localDateKeyFromIso(e.updatedAt || e.createdAt);
    if (key < localDateKey(windowStart) || key > endDate) continue;
    if (!byDay.has(key) && isJournalMoodId(e.mood)) byDay.set(key, e.mood);
    else if (!byDay.has(key)) byDay.set(key, null);
  }

  const out: { key: string; label: string; mood: JournalMoodId | null }[] = [];
  const cursor = new Date(windowStart);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    out.push({
      key,
      label: dayNames[cursor.getDay()]!,
      mood: byDay.get(key) ?? null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function letterIdentity(letter: JournalWeeklyLetterSummary): string {
  return (
    letter.rangeKey ||
    (letter.startDate && letter.endDate
      ? `${letter.startDate}_${letter.endDate}`
      : letter.weekKey)
  );
}

function InsightsCard({
  letter,
  reflection,
  entries,
}: {
  letter: JournalWeeklyLetterSummary;
  reflection: JournalWeeklyReflection | null;
  entries: JournalEntry[];
}) {
  const start =
    letter.startDate || letter.weekStart?.slice(0, 10) || letter.weekKey;
  const end = letter.endDate || letter.weekEnd?.slice(0, 10) || start;
  const openingRaw =
    reflection?.preview?.trim() ||
    letter.preview?.trim() ||
    reflection?.letterMarkdown?.trim().split("\n").find((l) => l.trim()) ||
    "";
  const opening = openingRaw
    ? openingRaw.replace(/\s+/g, " ").slice(0, 180).replace(/\s+\S*$/, "") +
      "…"
    : "Your latest insights letter is ready.";
  const entryCount =
    reflection?.meta.journalEntryCount ??
    entries.filter((e) => {
      if (isGratitudeEntry(e)) return false;
      const key = localDateKeyFromIso(e.createdAt);
      return key >= start && key <= end;
    }).length;
  const meditationCount = reflection?.meta.meditationChatCount ?? 0;
  const summary =
    reflection?.moodSummary?.trim() ||
    (letter.emotions?.[0]
      ? `${letter.emotions[0].name} showed up most this stretch.`
      : "");
  const days = moodDaysForLetter(entries, start, end);
  const href = `/journal/insights/${encodeURIComponent(letterIdentity(letter))}`;

  return (
    <OverviewSection
      title="Insights"
      action={<OverviewOutlineLink href="/journal/insights">All insights</OverviewOutlineLink>}
    >
      <div className="md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link">
            Latest insights · {formatRangeWords(start, end)}
          </p>
          <p className="font-display text-[19px] italic leading-[1.45] text-foreground max-md:text-base">
            {opening}
          </p>
          <p className="text-[13px] text-muted max-md:hidden">
            From {entryCount} {entryCount === 1 ? "entry" : "entries"}
            {meditationCount > 0
              ? ` and ${meditationCount} meditation${meditationCount === 1 ? "" : "s"}`
              : ""}
          </p>
          <div className="mt-1">
            <OverviewOutlineLink href={href}>Read your letter</OverviewOutlineLink>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2.5 border-border max-md:mt-3 md:mt-0 md:border-l md:pl-6">
          <p className="hidden text-[13px] font-semibold text-foreground md:block">
            How the week felt
          </p>
          <div className="flex justify-between gap-2 md:justify-start md:gap-2">
            {days.map((d) => (
              <div key={d.key} className="flex flex-col items-center gap-1">
                <span
                  className={`block h-7 w-9 rounded-lg max-md:w-9 md:w-10 ${
                    d.mood
                      ? ""
                      : "border border-dashed border-accent/45 bg-transparent"
                  }`}
                  style={
                    d.mood
                      ? { backgroundColor: JOURNAL_MOOD_WEEK_CELL[d.mood] }
                      : undefined
                  }
                  title={
                    d.mood ? journalMoodLabel(d.mood) ?? undefined : undefined
                  }
                />
                <span className="text-[11px] text-muted">{d.label}</span>
              </div>
            ))}
          </div>
          {summary ? (
            <p className="hidden text-[13px] text-foreground/90 md:block">
              {summary}
            </p>
          ) : null}
        </div>
      </div>
    </OverviewSection>
  );
}

export function JournalOverviewPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ready, setReady] = useState(false);
  const { guides: journalGuides, loading: guidesLoading } = useGuides("journal");
  const guides = journalGuides.slice(0, 4);

  const [gratitudeCount, setGratitudeCount] = useState(0);

  useEffect(() => {
    const applyLocal = () => {
      const store = readJournalStoreSnapshot({
        signedIn: isMedimadeSessionActive(),
      });
      const cleaned = withoutDemoJournalEntries(store);
      const freeform = cleaned.entries
        .filter((e) => !isGratitudeEntry(e))
        .sort((a, b) =>
          (b.updatedAt || b.createdAt).localeCompare(
            a.updatedAt || a.createdAt,
          ),
        );
      setEntries(freeform);
      setGratitudeCount(cleaned.entries.filter((e) => isGratitudeEntry(e)).length);
      setReady(true);
    };
    applyLocal();
    const onStore = () => applyLocal();
    window.addEventListener(JOURNAL_STORE_CHANGED, onStore);
    return () => window.removeEventListener(JOURNAL_STORE_CHANGED, onStore);
  }, []);

  /* Insights letter fetch — panel commented out; Insights is a sub-page tile.
  const journalInsights = useMvpFlags().journalInsights;
  ...
  */

  const todayKey = localDateKey();
  const todayEntry = useMemo(
    () =>
      entries.find(
        (e) => localDateKeyFromIso(e.createdAt) === todayKey,
      ) ?? null,
    [entries, todayKey],
  );
  const recent = entries.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4">
      <div className="flex flex-col gap-5">
        {/*
        Previous OverviewHero (input + prompts + sub-page links) — replaced by today hero.
        */}
        <JournalTodayHero todayEntry={todayEntry} />

        <OverviewSubpagesPanel
          loading={!ready}
          groups={[
            {
              tiles: [
                {
                  href: "/journal/entries",
                  label: "Entries",
                  count: ready ? entries.length : null,
                  // Create Start “Journal entry” cover (also under public/overview-thumbs).
                  imageSrc: "/overview-thumbs/entries.jpg",
                },
                {
                  href: "/journal/gratitudes",
                  label: "Gratitudes",
                  count: ready ? gratitudeCount : null,
                  imageSrc: "/overview-thumbs/gratitudes.jpg",
                },
                {
                  href: "/journal/insights",
                  label: "Insights",
                  imageSrc: "/overview-thumbs/insights.jpg",
                },
              ],
            },
          ]}
        />

        <OverviewSection
          title="Recent entries"
          action={
            <OverviewOutlineLink href="/journal/entries">
              All entries
            </OverviewOutlineLink>
          }
        >
          {!ready ? (
            <div className="grid grid-cols-1 md:grid-cols-3 md:gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="mm-skeleton h-[72px] rounded-[14px] max-md:h-14 max-md:rounded-none"
                />
              ))}
            </div>
          ) : recent.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 md:gap-3">
              {recent.map((entry, index) => (
                <EntryOverviewCard
                  key={entry.id}
                  entry={entry}
                  divider={index > 0}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">Your entries will appear here.</p>
          )}
        </OverviewSection>

        {/* <TodaysGratitudesCard /> — moved into hero */}
        {/* Insights letter panel — Insights is a sub-page tile now.
        {journalInsights && letter ? (
          <InsightsCard letter={letter} reflection={reflection} entries={entries} />
        ) : null}
        */}

        {guidesLoading || guides.length > 0 ? (
          <OverviewSection
            title="Guides"
            action={
              <OverviewOutlineLink href="/journal/guides">
                All guides
              </OverviewOutlineLink>
            }
          >
            {guidesLoading && guides.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="mm-skeleton h-[160px] rounded-[14px]" />
                ))}
              </div>
            ) : (
              <MeditateGuidesGrid guides={guides} area="journal" />
            )}
          </OverviewSection>
        ) : null}
      </div>
    </div>
  );
}
