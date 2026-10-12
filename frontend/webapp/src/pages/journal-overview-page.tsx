import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";
import { BookOpen, ChevronRight, Heart, Mic, Plus, Sparkles } from "lucide-react";
import { IconHeart, IconSparkles, IconSun } from "@tabler/icons-react";
import { Link } from "@/lib/spa-nav";
import {
  ExploreMiniCard,
  ExploreMiniGrid,
} from "@/components/explore-mini-card";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import { OverviewGreeting } from "@/components/overview-greeting";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { useGuides } from "@/content/guides";
import {
  JOURNAL_OVERVIEW_EMPTY_GREETING,
  JOURNAL_OVERVIEW_GREETINGS,
} from "@/content/overview-greetings";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { formatRangeWords } from "@/lib/insight-period";
import {
  JOURNAL_MOOD_PILL,
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
  formatJournalEntryDate,
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
import { journalEntriesLinkedToLifeArea } from "@/lib/plan-life-area-links";
import { loadIdeateStore, type PlanDream } from "@/lib/plan-ideate-store";

const GRATITUDE_ICONS = [IconSun, IconHeart, IconSparkles] as const;

const EMPTY_PROMPTS = [
  "What's taking up space in your head?",
  "One thing that went well today",
  "What would make tomorrow easier?",
] as const;

const EMPTY_HERO = "/patterns/hero/adobestock-2156039259.webp";

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

function lifeAreaForEntry(
  entry: JournalEntry,
  dreams: PlanDream[],
): PlanDream | null {
  for (const dream of dreams) {
    if (journalEntriesLinkedToLifeArea(dream, [entry]).length > 0) {
      return dream;
    }
  }
  const tags = (entry.tags ?? []).map((t) => t.trim().toLowerCase());
  if (!tags.length) return null;
  for (const dream of dreams) {
    const title = dream.title.trim().toLowerCase();
    if (title && tags.includes(title)) return dream;
  }
  return null;
}

function MoodTag({ mood }: { mood: JournalMoodId }) {
  const pill = JOURNAL_MOOD_PILL[mood];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: pill.background, color: pill.color }}
    >
      {journalMoodLabel(mood)}
    </span>
  );
}

function LifeAreaTag({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-accent-soft/50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-accent-link">
      {label}
    </span>
  );
}

function NewEntryTileDesktop() {
  return (
    <Link
      href="/journal/my?new=1"
      className="flex min-h-[150px] flex-col items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-accent/45 bg-accent-soft/40 px-4 py-4 text-center transition-opacity hover:opacity-90"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full accent-fill-gradient text-on-accent"
        style={PRIMARY_ACCENT_FILL_STYLE}
        aria-hidden
      >
        <Plus className="size-5" strokeWidth={2.25} />
      </span>
      <span className="font-display text-lg text-foreground">New entry</span>
      <span className="text-xs text-muted">Write or speak</span>
    </Link>
  );
}

function NewEntryRowMobile() {
  return (
    <Link
      href="/journal/my?new=1"
      className="flex items-center gap-3 bg-accent-soft/40 px-3.5 py-3 transition-opacity hover:opacity-90"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full accent-fill-gradient text-on-accent"
        style={PRIMARY_ACCENT_FILL_STYLE}
        aria-hidden
      >
        <Plus className="size-4" strokeWidth={2.25} />
      </span>
      <span className="font-display text-base text-foreground">New entry</span>
      <span className="ml-auto text-xs text-muted">Write or speak</span>
    </Link>
  );
}

function EntryCardDesktop({
  entry,
  lifeArea,
}: {
  entry: JournalEntry;
  lifeArea: PlanDream | null;
}) {
  const mood = isJournalMoodId(entry.mood) ? entry.mood : null;
  return (
    <Link
      href={`/journal/my/${encodeURIComponent(entry.id)}`}
      className="flex min-h-[150px] min-w-0 flex-col gap-2 rounded-[14px] border border-border bg-card px-4 py-3.5 transition-opacity hover:opacity-95"
    >
      <span className="text-[15px] font-semibold text-foreground">
        {entryTitle(entry)}
      </span>
      <span className="line-clamp-3 text-[13px] leading-normal text-foreground/90">
        {entryExcerpt(entry)}
      </span>
      <span className="mt-auto flex items-center gap-2 border-t border-border pt-2 text-xs text-muted">
        <time dateTime={entry.createdAt}>
          {formatJournalEntryDate(entry.createdAt)}
        </time>
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {lifeArea ? <LifeAreaTag label={lifeArea.title} /> : null}
          {mood ? <MoodTag mood={mood} /> : null}
        </span>
      </span>
    </Link>
  );
}

function EntryRowMobile({
  entry,
}: {
  entry: JournalEntry;
}) {
  const mood = isJournalMoodId(entry.mood) ? entry.mood : null;
  return (
    <Link
      href={`/journal/my/${encodeURIComponent(entry.id)}`}
      className="flex flex-col gap-1.5 border-t border-border px-3.5 py-3 transition-opacity hover:opacity-95"
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {entryTitle(entry)}
        </span>
        {mood ? <MoodTag mood={mood} /> : null}
      </span>
      <span className="line-clamp-2 text-xs leading-normal text-foreground/90">
        {entryExcerpt(entry)}
      </span>
      <time dateTime={entry.createdAt} className="text-[11px] text-muted">
        {formatJournalEntryDate(entry.createdAt)}
      </time>
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
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-[18px] py-4 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] max-md:px-3.5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-display text-[19px] text-foreground">
          Today&apos;s gratitudes
        </h2>
        <span className="text-[13px] text-muted">{filled} of 3</span>
        <Link
          href="/journal/my/gratitudes"
          className="ml-auto inline-flex items-center gap-0.5 text-sm font-semibold text-accent-link transition-opacity hover:opacity-80"
        >
          <span className="md:hidden">Open</span>
          <span className="hidden md:inline">Gratitudes</span>
          <ChevronRight
            aria-hidden
            className="size-[18px] shrink-0"
            strokeWidth={2}
          />
        </Link>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:gap-2.5">
        {([0, 1, 2] as const).map((i) => {
          const Icon = GRATITUDE_ICONS[i]!;
          const value = lines[i] ?? "";
          const filledSlot = value.trim().length > 0;
          return (
            <label
              key={i}
              className={`flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-3 py-2.5 ${
                filledSlot
                  ? "border border-border bg-card"
                  : "border border-dashed border-accent/45 bg-background"
              }`}
            >
              <span
                className="mt-0.5 flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--gold)_70%,white)] text-on-accent"
                aria-hidden
              >
                <Icon size={15} stroke={1.75} />
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
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
            </label>
          );
        })}
      </div>
    </section>
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
    <section>
      <SectionHeading
        title="Insights"
        href="/journal/my/insights"
        linkLabel="All insights"
        linkLabelMobile="All"
      />
      <div className="rounded-2xl border border-border bg-card px-5 py-[18px] shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] max-md:px-3.5 max-md:py-3.5 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-6">
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
          <div className="mt-1 flex flex-wrap gap-2 max-md:mt-2">
            <Link
              href={href}
              className="inline-flex h-[38px] items-center justify-center rounded-full px-4 text-sm font-semibold text-on-accent accent-fill-gradient max-md:h-10 max-md:w-full"
              style={PRIMARY_ACCENT_FILL_STYLE}
            >
              Read your letter
            </Link>
            <Link
              href="/journal/my/insights"
              className="hidden h-[38px] items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 md:inline-flex"
            >
              All insights
            </Link>
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
    </section>
  );
}

function EmptyWelcomeCard() {
  const newHref = "/journal/my?new=1";
  const talkHref = "/journal/my?new=1&voice=1";
  const promptHref = (prompt: string) =>
    `/journal/my?new=1&title=${encodeURIComponent(prompt)}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] md:grid md:min-h-[300px] md:grid-cols-[minmax(0,1fr)_360px]">
      <div className="order-2 flex flex-col justify-center gap-3.5 px-4 py-[18px] max-md:px-4 md:order-1 md:px-9 md:py-8">
        <p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link max-md:hidden">
          Your journal
        </p>
        <h2 className="font-display text-[34px] leading-[1.15] text-foreground max-md:text-[26px]">
          Start where you are.
        </h2>
        <p className="max-w-[520px] text-base leading-[1.55] text-foreground/90 max-md:hidden">
          A few honest lines is plenty. Write it down, or just talk it out, and
          it&apos;ll start shaping your insights and meditations.
        </p>
        <p className="text-sm leading-relaxed text-foreground/90 md:hidden">
          A few honest lines is plenty. Write it down, or just talk it out.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={newHref}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full px-5 text-sm font-semibold text-on-accent accent-fill-gradient md:flex-none"
            style={PRIMARY_ACCENT_FILL_STYLE}
          >
            Start writing
          </Link>
          <Link
            href={talkHref}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:border-accent/40"
          >
            <Mic className="size-4" strokeWidth={2} aria-hidden />
            <span className="md:hidden">Talk</span>
            <span className="hidden md:inline">Talk it out</span>
          </Link>
        </div>
        <div className="mt-1">
          <p className="mb-2 text-xs text-muted">Or begin with a prompt</p>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
            {EMPTY_PROMPTS.map((p) => (
              <Link
                key={p}
                href={promptHref(p)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] text-foreground transition-colors hover:border-accent/40 max-md:w-full"
              >
                <span className="text-accent-link" aria-hidden>
                  ✦
                </span>
                {p}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="order-1 h-[150px] overflow-hidden bg-accent-soft/40 md:order-2 md:h-auto">
        <img src={EMPTY_HERO} alt="" className="h-full w-full object-cover" />
      </div>
    </section>
  );
}

export function JournalOverviewPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dreams, setDreams] = useState<PlanDream[]>([]);
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
      try {
        setDreams(loadIdeateStore().dreams ?? []);
      } catch {
        setDreams([]);
      }
    };
    applyLocal();
    const onStore = () => applyLocal();
    window.addEventListener(JOURNAL_STORE_CHANGED, onStore);
    return () => window.removeEventListener(JOURNAL_STORE_CHANGED, onStore);
  }, []);

  useEffect(() => {
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
  }, []);

  const recent = entries.slice(0, 3);
  const showEmptyWelcome = ready && entries.length === 0 && !letter;
  const showInsights = Boolean(letter);

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4">
      <div className="flex flex-col gap-7 max-md:gap-[22px]">
        <OverviewGreeting
          pool={JOURNAL_OVERVIEW_GREETINGS}
          fixed={showEmptyWelcome ? JOURNAL_OVERVIEW_EMPTY_GREETING : null}
        />

        {showEmptyWelcome ? (
          <EmptyWelcomeCard />
        ) : (
          <section>
            <SectionHeading
              title="Recent entries"
              href="/journal/my"
              linkLabel="All entries"
            />
            <div className="hidden grid-cols-4 gap-3.5 md:grid">
              <NewEntryTileDesktop />
              {recent.map((e) => (
                <EntryCardDesktop
                  key={e.id}
                  entry={e}
                  lifeArea={lifeAreaForEntry(e, dreams)}
                />
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card md:hidden">
              <NewEntryRowMobile />
              {recent.map((e) => (
                <EntryRowMobile key={e.id} entry={e} />
              ))}
            </div>
          </section>
        )}

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

        <section>
          <SectionHeading title="Explore" />
          <ExploreMiniGrid>
            <ExploreMiniCard
              href="/journal/my"
              title="Entries"
              description="Write freely or talk it out. Tag how it felt and what it's about."
              count={entries.length}
              imageSrc={EMPTY_HERO}
              icon={<BookOpen className="size-5" strokeWidth={1.75} />}
            />
            <ExploreMiniCard
              href="/journal/my/gratitudes"
              title="Gratitudes"
              description="Three small good things a day. It adds up."
              imageSrc="/patterns/hero/adobestock-2156039259.webp"
              icon={<Heart className="size-5" strokeWidth={1.75} />}
            />
            <ExploreMiniCard
              href="/journal/my/insights"
              title="Insights"
              description="A weekly letter on how things moved, written from your entries."
              imageSrc="/patterns/hero/adobestock-2089052451.webp"
              icon={<Sparkles className="size-5" strokeWidth={1.75} />}
            />
          </ExploreMiniGrid>
        </section>
      </div>
    </div>
  );
}
