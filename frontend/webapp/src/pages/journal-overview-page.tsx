import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronRight } from "lucide-react";
import { IconHeart, IconSparkles, IconSun } from "@tabler/icons-react";
import { Link, useRouter } from "@/lib/spa-nav";
import { useMvpFlags } from "@/lib/mvp-flags";
import { JournalListChips } from "@/components/journal-view";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import {
  OverviewHero,
  OverviewOutlineLink,
  OverviewSection,
} from "@/components/overview-hero";
import { useGuides } from "@/content/guides";
import {
  JOURNAL_OVERVIEW_PROMPTS,
  promptsForDay,
} from "@/content/overview-prompts";
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
  fetchJournalWeeklyReflectionRemote,
  listJournalWeeklyLettersRemote,
  putJournalStoreRemote,
  type JournalWeeklyLetterSummary,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";

const GRATITUDE_ICONS = [IconSun, IconHeart, IconSparkles] as const;

function SectionHeading({
  title,
  href,
  linkLabel,
  linkLabelMobile,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  linkLabelMobile?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 max-md:mb-2.5">
      <h2 className="font-display text-[22px] text-foreground max-md:text-xl">
        {title}
      </h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent-link transition-opacity hover:opacity-80"
        >
          <span className="md:hidden">{linkLabelMobile ?? linkLabel}</span>
          <span className="hidden md:inline">{linkLabel}</span>
          <ChevronRight
            aria-hidden
            className="size-[18px] shrink-0"
            strokeWidth={2}
          />
        </Link>
      ) : null}
    </div>
  );
}

function entryTitle(e: JournalEntry): string {
  return e.title.trim() || "Untitled entry";
}

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

function EntryOverviewCard({ entry }: { entry: JournalEntry }) {
  const date = formatOverviewEntryDate(entry.createdAt);
  return (
    <Link
      href={`/journal/my/${encodeURIComponent(entry.id)}`}
      className="flex min-h-[140px] min-w-0 flex-col gap-1.5 rounded-[14px] border border-border bg-card px-4 py-3.5"
    >
      <span className="line-clamp-2 text-[15px] font-semibold text-foreground">
        {entryTitle(entry)}
      </span>
      <span className="truncate text-[13px] text-foreground/90">
        {date ? <span className="text-muted">{date} · </span> : null}
        {entryExcerpt(entry)}
      </span>
      <JournalListChips entry={entry} className="mt-auto" />
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

function TodaysGratitudesCard() {
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

  return (
    <OverviewSection
      title="Today's gratitudes"
      subtitle={`${filled} of 3 today`}
      action={<OverviewOutlineLink href="/journal/my/gratitudes">Gratitudes</OverviewOutlineLink>}
    >
      <div className="flex flex-col gap-3 md:flex-row">
        {([0, 1, 2] as const).map((i) => {
          const Icon = GRATITUDE_ICONS[i]!;
          const value = lines[i] ?? "";
          return (
            <label
              key={i}
              className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-3.5"
            >
              <Icon size={16} stroke={1.75} className="shrink-0 text-accent" aria-hidden />
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
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
            </label>
          );
        })}
      </div>
    </OverviewSection>
  );
}

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
  const href = `/journal/my/insights/${encodeURIComponent(letterIdentity(letter))}`;

  return (
    <OverviewSection
      title="Insights"
      action={<OverviewOutlineLink href="/journal/my/insights">All insights</OverviewOutlineLink>}
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
  const router = useRouter();
  const journalInsights = useMvpFlags().journalInsights;
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [letter, setLetter] = useState<JournalWeeklyLetterSummary | null>(null);
  const [reflection, setReflection] =
    useState<JournalWeeklyReflection | null>(null);
  const [ready, setReady] = useState(false);
  const guides = useGuides("journal").guides.slice(0, 4);

  useEffect(() => {
    const applyLocal = () => {
      const store = readJournalStoreSnapshot({
        signedIn: isMedimadeSessionActive(),
      });
      const freeform = withoutDemoJournalEntries(store)
        .entries.filter((e) => !isGratitudeEntry(e))
        .sort((a, b) =>
          (b.updatedAt || b.createdAt).localeCompare(
            a.updatedAt || a.createdAt,
          ),
        );
      setEntries(freeform);
    };
    applyLocal();
    const onStore = () => applyLocal();
    window.addEventListener(JOURNAL_STORE_CHANGED, onStore);
    return () => window.removeEventListener(JOURNAL_STORE_CHANGED, onStore);
  }, []);

  useEffect(() => {
    if (!journalInsights) {
      setLetter(null);
      setReflection(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!getMedimadeSessionJwt()) {
          if (!cancelled) setReady(true);
          return;
        }
        const { letters } = await listJournalWeeklyLettersRemote();
        if (cancelled) return;
        const latest = letters[0] ?? null;
        setLetter(latest);
        if (latest) {
          const got = await fetchJournalWeeklyReflectionRemote({
            week: latest.weekKey,
            startDate: latest.startDate,
            endDate: latest.endDate,
            periodType: latest.periodType,
          });
          if (!cancelled) setReflection(got.reflection);
        }
      } catch {
        if (!cancelled) {
          setLetter(null);
          setReflection(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [journalInsights]);

  const recent = entries.slice(0, 4);
  const showInsights = journalInsights && Boolean(letter);
  const prompts = promptsForDay(JOURNAL_OVERVIEW_PROMPTS);

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4">
      <div className="flex flex-col gap-5">
        <OverviewHero
          question="What's on your mind?"
          actionHref="/journal/my?new=1"
          actionLabel="New entry"
          actionIcon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          }
          placeholder="Write or speak, and it becomes today's entry…"
          promptLabel="Or try a prompt"
          prompts={prompts}
          onPrompt={(prompt) =>
            router.push(`/journal/my?new=1&title=${encodeURIComponent(prompt)}`)
          }
          onSubmit={(text) =>
            router.push(`/journal/my?new=1&body=${encodeURIComponent(text)}`)
          }
        />

        <OverviewSection
          title="Recent entries"
          action={
            <OverviewOutlineLink href="/journal/my">
              All entries · {entries.length}
            </OverviewOutlineLink>
          }
        >
          {recent.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {recent.map((entry) => (
                <EntryOverviewCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : ready ? (
            <p className="text-[13px] text-muted">Your entries will appear here.</p>
          ) : null}
        </OverviewSection>

        <TodaysGratitudesCard />

        {showInsights && letter ? (
          <InsightsCard
            letter={letter}
            reflection={reflection}
            entries={entries}
          />
        ) : null}

        {guides.length > 0 ? (
          <section>
            <SectionHeading
              title="Guides"
              href="/journal/guides"
              linkLabel="All guides"
              linkLabelMobile="All"
            />
            <MeditateGuidesGrid guides={guides} area="journal" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
