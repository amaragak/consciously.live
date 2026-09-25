import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreHorizontal, Play } from "lucide-react";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  fetchJournalWeeklyReflectionRemote,
  getMedimadeApiBase,
  runJournalWeeklyReflectionRemote,
  type JournalWeeklyEmotionScore,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";
import {
  getCachedWeeklyReflection,
  invalidateCachedWeeklyReflection,
  setCachedWeeklyReflection,
} from "@/lib/journal-remote-cache";
import {
  isJournalMoodId,
  journalMoodLabel,
  JOURNAL_MOOD_PILL,
  type JournalMoodId,
} from "@/lib/journal-moods";
import { loadJournalStore, type JournalEntry } from "@/lib/journal-storage";
import { JOURNAL_STORE_CHANGED } from "@/lib/journal-storage";
import {
  buildInsightsMeditationPrompt,
  insightsCreateMeditationHref,
  writeInsightsMeditationPrompt,
} from "@/lib/insights-meditation-handoff";

function formatWeekRange(weekStart: string, weekEnd: string): string {
  try {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const sy = s.getFullYear();
    const ey = e.getFullYear();
    if (sy === ey) {
      return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
    }
    return `${s.toLocaleDateString(undefined, { ...opts, year: "numeric" })} – ${e.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
  } catch {
    return `${weekStart.slice(0, 10)} – ${weekEnd.slice(0, 10)}`;
  }
}

function formatWeekRangeShort(weekStart: string, weekEnd: string): string {
  try {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  } catch {
    return formatWeekRange(weekStart, weekEnd);
  }
}

function plainFromMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countEntriesInWeek(
  entries: JournalEntry[],
  weekStart: string,
  weekEnd: string,
): number {
  if (!weekStart || !weekEnd) return 0;
  const start = new Date(weekStart).getTime();
  const end = new Date(weekEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  let n = 0;
  for (const e of entries) {
    if (e.kind === "gratitude") continue;
    const t = new Date(e.updatedAt || e.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= start && t <= end) n += 1;
  }
  return n;
}

type MoodDay = {
  key: string;
  dayLabel: string;
  mood: JournalMoodId | null;
  isToday: boolean;
  emptyLabel: string;
};

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 local → Sunday 23:59:59.999 local for a weekKey (YYYY-MM-DD Monday). */
function weekBoundsFromKey(weekKey: string): { weekStart: string; weekEnd: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const monday = new Date(y, mo, d, 0, 0, 0, 0);
  if (Number.isNaN(monday.getTime())) return null;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { weekStart: monday.toISOString(), weekEnd: sunday.toISOString() };
}

function startOfWeekMonday(d = new Date()): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = local.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + mondayOffset);
  local.setHours(0, 0, 0, 0);
  return local;
}

function moodDaysForWeek(
  entries: JournalEntry[],
  weekStart: string,
  weekEnd: string,
): MoodDay[] {
  let monday = weekStart ? new Date(weekStart) : new Date(NaN);
  if (Number.isNaN(monday.getTime())) {
    monday = startOfWeekMonday();
  } else {
    // Normalize to local calendar Monday of that instant.
    monday = startOfWeekMonday(monday);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byDay = new Map<string, { mood: JournalMoodId; at: number }>();
  const start = weekStart ? new Date(weekStart).getTime() : monday.getTime();
  const endBound = weekEnd
    ? new Date(weekEnd).getTime()
    : (() => {
        const s = new Date(monday);
        s.setDate(monday.getDate() + 6);
        s.setHours(23, 59, 59, 999);
        return s.getTime();
      })();
  for (const e of entries) {
    if (e.kind === "gratitude") continue;
    if (!isJournalMoodId(e.mood)) continue;
    const at = new Date(e.updatedAt || e.createdAt).getTime();
    if (!Number.isFinite(at) || at < start || at > endBound) continue;
    const d = new Date(at);
    d.setHours(0, 0, 0, 0);
    const key = localDateKey(d);
    const prev = byDay.get(key);
    if (!prev || at >= prev.at) byDay.set(key, { mood: e.mood, at });
  }
  return dayNames.map((dayLabel, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const key = localDateKey(d);
    const isToday = d.getTime() === today.getTime();
    const mood = byDay.get(key)?.mood ?? null;
    return {
      key,
      dayLabel,
      mood,
      isToday,
      emptyLabel: isToday ? "Today" : "–",
    };
  });
}

function normalizeEmotions(
  raw: JournalWeeklyEmotionScore[] | undefined,
): JournalWeeklyEmotionScore[] {
  if (!raw?.length) return [];
  const out: JournalWeeklyEmotionScore[] = [];
  for (const row of raw) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const score = typeof row.score === "number" ? row.score : Number(row.score);
    if (!name || !Number.isFinite(score)) continue;
    const examples = Array.isArray(row.examples)
      ? row.examples
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().replace(/\s+/g, " "))
          .filter((x) => x.length >= 8)
          .slice(0, 3)
      : undefined;
    out.push({
      name,
      score: Math.max(0, Math.min(10, Math.round(score))),
      ...(examples?.length ? { examples } : {}),
    });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, 5);
}

function EmotionBars({ emotions }: { emotions: JournalWeeklyEmotionScore[] }) {
  return (
    <div className="flex flex-col gap-3">
      {emotions.map((e, i) => {
        const pct = Math.max(0, Math.min(100, (e.score / 10) * 100));
        const barColor = i === 0 ? "bg-accent" : "bg-deep";
        const examples = e.examples?.length ? e.examples : null;
        return (
          <div
            key={`${e.name}-${i}`}
            className="group relative flex flex-col gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            tabIndex={examples ? 0 : undefined}
            aria-describedby={
              examples ? `emotion-evidence-${i}` : undefined
            }
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{e.name}</span>
              <span className="text-muted">{e.score}/10</span>
            </div>
            <div
              className="h-[10px] overflow-hidden rounded-full bg-border-subtle"
              role="img"
              aria-label={`${e.name}, ${e.score} out of 10`}
            >
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {examples ? (
              <div
                id={`emotion-evidence-${i}`}
                role="tooltip"
                className="pointer-events-none absolute left-0 right-0 top-full z-30 mt-2 hidden rounded-xl border border-border bg-background px-3.5 py-3 shadow-md group-hover:block group-focus-within:block"
              >
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  From your writing
                </p>
                <ul className="flex flex-col gap-1.5">
                  {examples.map((quote, qi) => (
                    <li
                      key={qi}
                      className="text-[13px] leading-snug text-foreground/90"
                    >
                      <span className="text-muted">&ldquo;</span>
                      {quote}
                      <span className="text-muted">&rdquo;</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MoodWeekStrip({
  days,
  summary,
}: {
  days: MoodDay[];
  summary?: string;
}) {
  if (!days.length) return null;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const label = d.mood ? journalMoodLabel(d.mood) : d.emptyLabel;
          const palette = d.mood ? JOURNAL_MOOD_PILL[d.mood] : null;
          return (
            <div
              key={d.key}
              className="flex flex-col items-center gap-2 text-[13px] text-muted"
            >
              <div
                className={`flex h-11 w-full items-end justify-center rounded-xl pb-2 text-[12px] font-semibold ${
                  d.mood
                    ? ""
                    : "border-[1.5px] border-dashed border-border font-medium text-muted"
                }`}
                style={
                  palette
                    ? { backgroundColor: palette.background, color: palette.color }
                    : undefined
                }
              >
                {label}
              </div>
              <span>{d.dayLabel}</span>
            </div>
          );
        })}
      </div>
      {summary?.trim() ? (
        <p className="text-sm leading-relaxed text-foreground/80">{summary.trim()}</p>
      ) : null}
    </div>
  );
}

export function JournalWeeklyReflectionCard({
  weekKey: weekKeyProp,
  onLetterChanged,
}: {
  weekKey?: string | null;
  onLetterChanged?: () => void;
}) {
  const navigate = useNavigate();
  const weekKey = weekKeyProp?.trim() || undefined;
  const cacheKey = weekKey || "__current__";
  const cached = getCachedWeeklyReflection(cacheKey);
  const [reflection, setReflection] = useState<JournalWeeklyReflection | null>(
    () => cached?.reflection ?? null,
  );
  const [weekStart, setWeekStart] = useState(() => cached?.weekStart ?? "");
  const [weekEnd, setWeekEnd] = useState(() => cached?.weekEnd ?? "");
  const [loading, setLoading] = useState(() => !cached);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const apiEnabled = Boolean(getMedimadeApiBase());

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!apiEnabled) return;
      if (!opts?.force) {
        const hit = getCachedWeeklyReflection(cacheKey);
        if (hit) {
          setReflection(hit.reflection);
          setWeekStart(hit.weekStart);
          setWeekEnd(hit.weekEnd);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const got = await fetchJournalWeeklyReflectionRemote(
          weekKey ? { week: weekKey } : undefined,
        );
        setCachedWeeklyReflection(cacheKey, got);
        setReflection(got.reflection);
        setWeekStart(got.weekStart);
        setWeekEnd(got.weekEnd);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load weekly reflection",
        );
      } finally {
        setLoading(false);
      }
    },
    [apiEnabled, cacheKey, weekKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const on = () => void load({ force: true });
    window.addEventListener("medimade-session-changed", on);
    return () => window.removeEventListener("medimade-session-changed", on);
  }, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      if (!menuRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const generate = useCallback(
    async (regenerate: boolean) => {
      if (!apiEnabled) return;
      setGenerating(true);
      setError(null);
      setMenuOpen(false);
      try {
        const got = await runJournalWeeklyReflectionRemote({
          regenerate,
          ...(weekKey ? { week: weekKey } : {}),
        });
        invalidateCachedWeeklyReflection(weekKey);
        setCachedWeeklyReflection(cacheKey, got);
        setReflection(got.reflection);
        setWeekStart(got.weekStart);
        setWeekEnd(got.weekEnd);
        onLetterChanged?.();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to generate weekly reflection",
        );
      } finally {
        setGenerating(false);
      }
    },
    [apiEnabled, cacheKey, onLetterChanged, weekKey],
  );

  const weekLabel =
    weekStart && weekEnd ? formatWeekRangeShort(weekStart, weekEnd) : "This week";
  const weekLabelLong =
    weekStart && weekEnd ? formatWeekRange(weekStart, weekEnd) : "This week";

  const [storeTick, setStoreTick] = useState(0);
  useEffect(() => {
    const bump = () => setStoreTick((n) => n + 1);
    window.addEventListener(JOURNAL_STORE_CHANGED, bump);
    return () => {
      window.removeEventListener(JOURNAL_STORE_CHANGED, bump);
    };
  }, []);

  const resolvedWeek = useMemo(() => {
    if (weekStart && weekEnd) return { weekStart, weekEnd };
    if (weekKey) {
      const fromKey = weekBoundsFromKey(weekKey);
      if (fromKey) return fromKey;
    }
    const monday = startOfWeekMonday();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { weekStart: monday.toISOString(), weekEnd: sunday.toISOString() };
  }, [weekStart, weekEnd, weekKey]);

  const storeEntries = useMemo(() => {
    void storeTick;
    return loadJournalStore().entries;
  }, [storeTick, reflection, resolvedWeek.weekStart, resolvedWeek.weekEnd, loading]);

  const weekEntryCount = useMemo(() => {
    if (reflection?.meta.journalEntryCount != null && reflection.letterMarkdown) {
      return reflection.meta.journalEntryCount;
    }
    return countEntriesInWeek(
      storeEntries,
      resolvedWeek.weekStart,
      resolvedWeek.weekEnd,
    );
  }, [reflection, storeEntries, resolvedWeek]);

  const moodDays = useMemo(
    () =>
      moodDaysForWeek(
        storeEntries,
        resolvedWeek.weekStart,
        resolvedWeek.weekEnd,
      ),
    [storeEntries, resolvedWeek],
  );
  const hasAnyMood = moodDays.some((d) => d.mood);

  const hasLetter = Boolean(reflection?.letterMarkdown?.trim());
  const emotions = normalizeEmotions(reflection?.emotions);
  const showEmotionChart = emotions.length >= 1;
  const meditationCount = reflection?.meta.meditationChatCount ?? 0;

  const writtenFromLine = useMemo(() => {
    if (!hasLetter) return null;
    const j = reflection?.meta.journalEntryCount ?? weekEntryCount;
    const parts: string[] = [];
    parts.push(
      `Written from your ${j} journal ${j === 1 ? "entry" : "entries"}`,
    );
    if (meditationCount > 0) {
      parts[0] += ` and ${meditationCount} meditation${meditationCount === 1 ? "" : "s"}`;
    }
    parts[0] += " this week";
    return parts[0];
  }, [hasLetter, reflection, weekEntryCount, meditationCount]);

  const createMeditation = useCallback(() => {
    if (!reflection?.letterMarkdown) return;
    const plain = plainFromMarkdown(reflection.letterMarkdown);
    const prompt = buildInsightsMeditationPrompt({
      letterPlain: plain,
      emotions: reflection.emotions,
      weekLabel: weekLabelLong,
    });
    writeInsightsMeditationPrompt(prompt);
    navigate(insightsCreateMeditationHref());
  }, [navigate, reflection, weekLabelLong]);

  const meditationSubline = useMemo(() => {
    const top = (emotions ?? []).slice(0, 2).map((e) => e.name.toLowerCase());
    if (top.length >= 2) {
      return `Written from your letter: easing ${top[0]}, and trusting the ${top[1]}.`;
    }
    if (top.length === 1) {
      return `Written from your letter: easing into ${top[0]}.`;
    }
    return "Written from your letter: a practice shaped by this week.";
  }, [emotions]);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.09em] text-accent-link">
            Weekly reflection
          </p>
          <h1 className="font-display text-[clamp(1.75rem,3vw,2.25rem)] font-normal tracking-tight text-foreground">
            A gentle letter for {weekLabel}
          </h1>
          {writtenFromLine ? (
            <p className="text-sm text-muted">{writtenFromLine}</p>
          ) : !hasLetter && !loading ? (
            <p className="text-sm text-muted">
              Your letter is written from this week&apos;s journal entries.
            </p>
          ) : null}
        </div>
        {hasLetter ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-label="Letter options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted transition-colors hover:text-foreground"
            >
              <MoreHorizontal className="size-[18px]" strokeWidth={2} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-xl border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  disabled={!apiEnabled || generating}
                  onClick={() => void generate(true)}
                  className="flex w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
                >
                  {generating ? "Writing…" : "Rewrite letter"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {!apiEnabled ? (
        <p className="text-sm italic text-muted">
          Set{" "}
          <code className="rounded bg-background px-1 py-0.5 not-italic">
            VITE_MEDIMADE_API_URL
          </code>{" "}
          to enable weekly reflections.
        </p>
      ) : loading ? (
        <p className="text-sm italic text-muted">Loading…</p>
      ) : hasLetter && reflection ? (
        <article className="rounded-[22px] border border-border bg-[color:var(--journal-warm-bg)] px-7 py-11 sm:px-14 sm:pb-9 sm:pt-11">
          <div className="font-display text-[19px] font-normal leading-[1.7] text-foreground [&_em]:italic [&_p]:mb-[18px] [&_p:last-child]:mb-0">
            <ChatMarkdown text={reflection.letterMarkdown} />
          </div>
        </article>
      ) : (
        <section
          aria-label="Before the letter is written"
          className="flex flex-col gap-5 rounded-[20px] border-[1.5px] border-dashed border-border px-6 py-5 sm:flex-row sm:items-center sm:gap-6"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
              Before the letter is written
            </span>
            <span className="font-display text-xl font-normal text-foreground">
              Your letter is written from this week&apos;s entries.
            </span>
            <span className="text-sm text-foreground/80">
              {weekEntryCount === 0
                ? "Write your first entry this week to get a letter."
                : weekEntryCount === 1
                  ? "You've written 1 so far. A couple more make it richer."
                  : `You've written ${weekEntryCount} so far. A couple more make it richer.`}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              to="/journal/my"
              className="inline-flex h-12 cursor-pointer items-center rounded-full border border-border bg-card px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-accent/40"
            >
              Write an entry
            </Link>
            <button
              type="button"
              disabled={!apiEnabled || generating || weekEntryCount === 0}
              title={
                weekEntryCount === 0
                  ? "Write at least one journal entry this week first"
                  : undefined
              }
              onClick={() => void generate(false)}
              className="inline-flex h-12 cursor-pointer items-center rounded-full accent-fill-gradient px-5 text-[15px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? "Writing…" : "Write my letter"}
            </button>
          </div>
        </section>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {hasLetter || hasAnyMood ? (
        <section aria-label="Patterns this week" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-normal tracking-tight text-foreground">
              Patterns this week
            </h2>
            <span className="text-[13px] text-muted">
              From what you wrote this week
            </span>
          </div>

          {hasLetter ? (
            <div className="relative z-[1] flex flex-col gap-3 overflow-visible rounded-[20px] border border-border bg-card px-6 py-[22px]">
              <div className="text-sm font-semibold text-foreground">
                How this week felt
              </div>
              {showEmotionChart ? (
                <>
                  <EmotionBars emotions={emotions} />
                  <p className="pt-0.5 text-xs leading-relaxed text-muted">
                    Hover a feeling to see what you wrote. Read from your
                    entries by AI — a reflection, not a measurement.
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-relaxed text-muted">
                    Rewrite your letter so we can score the emotions that came
                    through in this week&apos;s writing.
                  </p>
                  <button
                    type="button"
                    disabled={!apiEnabled || generating}
                    onClick={() => void generate(true)}
                    className="shrink-0 cursor-pointer self-start rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 disabled:opacity-50"
                  >
                    {generating ? "Writing…" : "Rewrite letter"}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {hasLetter || hasAnyMood ? (
            <div className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-card px-6 py-[22px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">Mood</div>
                <span className="text-[12px] text-muted">From your mood tags</span>
              </div>
              <MoodWeekStrip
                days={moodDays}
                summary={hasLetter ? reflection?.moodSummary : undefined}
              />
            </div>
          ) : null}

          {hasLetter ? (
            <div className="flex flex-col gap-4 rounded-[20px] bg-deep px-[26px] py-[22px] text-on-accent sm:flex-row sm:items-center sm:gap-5">
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-deep"
              >
                <Play className="size-4 fill-current" strokeWidth={0} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-display text-xl font-normal">
                  Turn this week into a meditation
                </span>
                <span className="text-sm text-on-accent/70">
                  {meditationSubline}
                </span>
              </div>
              <button
                type="button"
                onClick={createMeditation}
                className="inline-flex h-12 shrink-0 cursor-pointer items-center rounded-full bg-accent px-[22px] text-[15px] font-semibold text-deep transition-opacity hover:opacity-90"
              >
                Create meditation
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
