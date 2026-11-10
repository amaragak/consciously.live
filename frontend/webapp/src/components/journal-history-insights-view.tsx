import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  buildMoodMovers,
  buildStandoutLines,
  buildThemeRows,
  buildWeeklyMoodSeries,
  entryHrefWithHighlight,
  INSIGHTS_PERIODS,
  longerPeriodWithInsights,
  moodDaysInPeriod,
  moodSeriesIsChartable,
  listEntryAnalyses,
  toneDotClass,
  type InsightsPeriodId,
  type StandoutLine,
  type ThemeRow,
  type WeekMoodPoint,
} from "@/lib/journal-history-insights";
import {
  loadJournalStore,
  type JournalEntry,
} from "@/lib/journal-storage";
import { fetchUserSettings, patchUserSettings } from "@/lib/settings-api";
import { summarizeJournalThemeRemote } from "@/lib/medimade-api";
import {
  insightsCreateMeditationHref,
  writeInsightsMeditationPrompt,
} from "@/lib/insights-meditation-handoff";
import {
  backfillJournalEntryAnalyses,
  invalidateJournalInsightsOptInCache,
} from "@/lib/journal-entry-analysis-scheduler";

const INSIGHTS_HREF = "/journal/insights";

function themePath(slug: string) {
  return `${INSIGHTS_HREF}/theme/${encodeURIComponent(slug)}`;
}

function parseThemeSlug(pathname: string): string | null {
  const m = /^\/journal\/insights\/theme\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function isAllThemesPath(pathname: string): boolean {
  return /^\/journal\/insights\/themes\/?$/.test(pathname);
}

function Card({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PeriodChips({
  value,
  onChange,
}: {
  value: InsightsPeriodId;
  onChange: (id: InsightsPeriodId) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="tablist"
      aria-label="Insights period"
    >
      {INSIGHTS_PERIODS.map((p) => {
        const on = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(p.id)}
            className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${
              on
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function MoodChart({
  points,
  selected,
  onSelect,
}: {
  points: WeekMoodPoint[];
  selected: WeekMoodPoint | null;
  onSelect: (p: WeekMoodPoint) => void;
}) {
  if (points.length < 3) return null;
  const w = 320;
  const h = 120;
  const padX = 12;
  const padY = 16;
  const min = Math.min(...points.map((p) => p.tone), -1);
  const max = Math.max(...points.map((p) => p.tone), 1);
  const span = Math.max(0.2, max - min);
  const xy = (i: number, tone: number) => {
    const x =
      padX + (i / Math.max(1, points.length - 1)) * (w - padX * 2);
    const y = padY + (1 - (tone - min) / span) * (h - padY * 2);
    return { x, y };
  };
  const d = points
    .map((p, i) => {
      const { x, y } = xy(i, p.tone);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  let lo = 0;
  let hi = 0;
  points.forEach((p, i) => {
    if (p.tone < points[lo]!.tone) lo = i;
    if (p.tone > points[hi]!.tone) hi = i;
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full max-w-full"
      role="img"
      aria-label="Mood over time"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--accent, #c8a46a)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => {
        const { x, y } = xy(i, p.tone);
        const isSel = selected?.weekStart === p.weekStart;
        const mark = i === lo || i === hi;
        return (
          <g key={p.weekStart}>
            <circle
              cx={x}
              cy={y}
              r={mark || isSel ? 5.5 : 3.5}
              fill={
                isSel
                  ? "var(--foreground)"
                  : mark
                    ? "var(--accent, #c8a46a)"
                    : "var(--card)"
              }
              stroke="var(--accent, #c8a46a)"
              strokeWidth="1.5"
              className="cursor-pointer"
              onClick={() => onSelect(p)}
            >
              <title>{p.label}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function ThemeRowView({
  row,
  onOpen,
}: {
  row: ThemeRow;
  onOpen: () => void;
}) {
  const sparkW = 56;
  const sparkH = 18;
  const max = Math.max(1, ...row.sparkline);
  const path = row.sparkline
    .map((v, i) => {
      const x = (i / Math.max(1, row.sparkline.length - 1)) * sparkW;
      const y = sparkH - (v / max) * (sparkH - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-accent-soft/40"
    >
      <span
        className={`size-2.5 shrink-0 rounded-full ${toneDotClass(row.avgTone)}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-foreground">
          {row.name}
        </span>
        <span className="block text-[12px] text-muted">
          {row.entryCount} {row.entryCount === 1 ? "entry" : "entries"} ·{" "}
          {row.trend}
        </span>
      </span>
      <svg
        width={sparkW}
        height={sparkH}
        className="shrink-0 opacity-70"
        aria-hidden
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          className="text-muted"
        />
      </svg>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
    </button>
  );
}

function QuoteCard({ line }: { line: StandoutLine }) {
  const href = entryHrefWithHighlight(line.entryId, line.quote, {
    theme: line.theme || undefined,
  });
  const phrase = line.highlightPhrase?.trim();
  let body: React.ReactNode = line.quote;
  if (phrase) {
    const idx = line.quote.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx >= 0) {
      body = (
        <>
          {line.quote.slice(0, idx)}
          <mark className="rounded-sm bg-[color-mix(in_srgb,var(--accent,#c8a46a)_28%,transparent)] px-0.5 text-inherit">
            {line.quote.slice(idx, idx + phrase.length)}
          </mark>
          {line.quote.slice(idx + phrase.length)}
        </>
      );
    }
  }
  const dateLabel = (() => {
    try {
      return new Date(line.dateIso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
    } catch {
      return "";
    }
  })();
  return (
    <Link
      to={href}
      className="block rounded-xl border border-border/70 bg-[color:var(--surface,#f7f2ea)] px-3.5 py-3 transition-colors hover:border-accent/40"
    >
      <p className="font-sans text-[15px] leading-relaxed text-foreground">
        “{body}”
      </p>
      <p className="mt-2 text-[12px] text-muted">
        {[dateLabel, line.theme, line.moodLabel].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}

function OptInCard({ onEnable }: { onEnable: () => void }) {
  return (
    <Card title="Insights from your history">
      <p className="font-sans text-sm leading-relaxed text-foreground">
        When this is on, Consciously quietly notes the mood and themes in each
        entry you save — then Insights shows how you’ve felt, what keeps coming
        up, and lines that stood out. Nothing is analysed until you turn it on.
      </p>
      <button
        type="button"
        onClick={onEnable}
        className="mt-4 inline-flex h-10 items-center rounded-full border border-[#AFC2DC] px-4 text-[13px] font-semibold text-on-accent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, color-mix(in srgb, var(--header-gold, #d9b87c) 78%, white), var(--header-gold, #d9b87c) 85%)",
        }}
      >
        Turn on Insights
      </button>
    </Card>
  );
}

function MainInsights({
  entries,
  period,
  setPeriod,
}: {
  entries: JournalEntry[];
  period: InsightsPeriodId;
  setPeriod: (p: InsightsPeriodId) => void;
}) {
  const navigate = useNavigate();
  const analyses = useMemo(() => {
    const map = new Map(
      listEntryAnalyses().map((a) => [a.entryId, a] as const),
    );
    return map;
  }, [entries, period]);

  const weeks = useMemo(
    () => buildWeeklyMoodSeries(entries, analyses, period),
    [entries, analyses, period],
  );
  const moodDays = useMemo(
    () => moodDaysInPeriod(entries, period),
    [entries, period],
  );
  const showMood = moodSeriesIsChartable(weeks, moodDays);
  const themes = useMemo(
    () => buildThemeRows(entries, analyses, period),
    [entries, analyses, period],
  );
  const movers = useMemo(() => buildMoodMovers(themes), [themes]);
  const showMovers = movers.lifts.length > 0 || movers.weighs.length > 0;
  const quotes = useMemo(
    () => buildStandoutLines(entries, analyses, period, 3),
    [entries, analyses, period],
  );
  const longer = useMemo(
    () =>
      quotes.length === 0 && !showMood && themes.length === 0
        ? longerPeriodWithInsights(entries, analyses, period)
        : null,
    [quotes.length, showMood, themes.length, entries, analyses, period],
  );
  const [selectedWeek, setSelectedWeek] = useState<WeekMoodPoint | null>(null);
  useEffect(() => {
    setSelectedWeek(null);
  }, [period]);

  const topThemes = themes.slice(0, 6);
  const mobileThemes = themes.slice(0, 4);
  const nothing =
    quotes.length === 0 && !showMood && themes.length === 0 && !showMovers;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-28 pt-3 sm:px-6 lg:pb-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        <PeriodChips value={period} onChange={setPeriod} />
      </div>

      {nothing ? (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <p className="text-[15px] leading-relaxed text-foreground">
            Not enough yet. Insights appear once you've written a few entries
            with some detail.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/journal/entries?new=1"
              className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background"
            >
              Write an entry
            </Link>
            {longer ? (
              <button
                type="button"
                onClick={() => setPeriod(longer)}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-foreground"
              >
                Try a longer range
              </button>
            ) : null}
          </div>
        </section>
      ) : (
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {showMood ? (
          <Card title="How you've felt">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <MoodChart
                    points={weeks}
                    selected={selectedWeek}
                    onSelect={setSelectedWeek}
                  />
                </div>
                {selectedWeek ? (
                  <div className="w-full shrink-0 rounded-xl border border-border/70 bg-[color:var(--surface,#f7f2ea)] p-3 lg:w-56">
                    <p className="text-[13px] font-semibold text-foreground">
                      {selectedWeek.tone <=
                      Math.min(...weeks.map((w) => w.tone))
                        ? "Low week"
                        : selectedWeek.tone >=
                            Math.max(...weeks.map((w) => w.tone))
                          ? "High week"
                          : "Week"}{" "}
                      · {selectedWeek.label}
                    </p>
                    {selectedWeek.tellingLine && selectedWeek.tellingEntryId ? (
                      <Link
                        to={entryHrefWithHighlight(
                          selectedWeek.tellingEntryId,
                          selectedWeek.tellingLine,
                        )}
                        className="mt-2 block font-sans text-[13px] italic leading-snug text-foreground underline-offset-2 hover:underline"
                      >
                        “{selectedWeek.tellingLine}”
                      </Link>
                    ) : null}
                    <p className="mt-2 text-[12px] text-muted">
                      {selectedWeek.entryCount}{" "}
                      {selectedWeek.entryCount === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                ) : null}
              </div>
          </Card>
          ) : null}

          {quotes.length > 0 ? (
          <Card
            title="Lines that stood out"
            className="max-lg:order-4"
          >
              <div className="space-y-2.5">
                {quotes.map((q) => (
                    <QuoteCard key={`${q.entryId}-${q.quote.slice(0, 24)}`} line={q} />
                  ))}
              </div>
          </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {themes.length > 0 ? (
          <Card
            title="Themes"
            action={
                <Link
                  to={`${INSIGHTS_HREF}/themes`}
                  className="text-[13px] font-medium text-accent-link"
                >
                  All
                </Link>
            }
          >
              <>
                <div className="divide-y divide-border/60 lg:hidden">
                  {mobileThemes.map((row) => (
                    <ThemeRowView
                      key={row.slug}
                      row={row}
                      onOpen={() => navigate(themePath(row.slug))}
                    />
                  ))}
                </div>
                <div className="hidden divide-y divide-border/60 lg:block">
                  {topThemes.map((row) => (
                    <ThemeRowView
                      key={row.slug}
                      row={row}
                      onOpen={() => navigate(themePath(row.slug))}
                    />
                  ))}
                </div>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[color:#7AC4A0]" />
                    Lifts you
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-[color:#B09070]" />
                    Weighs on you
                  </span>
                </p>
              </>
          </Card>
          ) : null}

          {showMovers ? (
          <Card title="What moves your mood">
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                      Lifts you
                    </p>
                    <ul className="space-y-1.5">
                      {movers.lifts.map((t) => (
                        <li key={t.slug}>
                          <Link
                            to={themePath(t.slug)}
                            className="text-[14px] text-foreground hover:underline"
                          >
                            {t.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                      Weighs on you
                    </p>
                    <ul className="space-y-1.5">
                      {movers.weighs.map((t) => (
                        <li key={t.slug}>
                          <Link
                            to={themePath(t.slug)}
                            className="text-[14px] text-foreground hover:underline"
                          >
                            {t.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-muted">
                  From the mood of the entries each comes up in.
                </p>
              </>
          </Card>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}

function ThemeDetail({
  slug,
  entries,
}: {
  slug: string;
  entries: JournalEntry[];
}) {
  const navigate = useNavigate();
  const analyses = useMemo(
    () => new Map(listEntryAnalyses().map((a) => [a.entryId, a] as const)),
    [entries],
  );
  const themes = useMemo(
    () => buildThemeRows(entries, analyses, "all"),
    [entries, analyses],
  );
  const row = themes.find((t) => t.slug === slug) ?? null;

  const mentions = useMemo(() => {
    if (!row) return [];
    const out: Array<{
      date: string;
      sentence: string;
      mood?: string;
      tone: number;
      entryId: string;
    }> = [];
    for (const e of entries) {
      const a = analyses.get(e.id);
      if (!a) continue;
      for (const th of a.themes) {
        if (th.theme.toLowerCase() !== row.name.toLowerCase()) continue;
        for (const s of th.sentences) {
          out.push({
            date: (e.entryDate || e.createdAt || "").slice(0, 10),
            sentence: s,
            mood: e.mood,
            tone: th.tone,
            entryId: e.id,
          });
        }
      }
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }, [row, entries, analyses]);

  const [summary, setSummary] = useState<string | null>(null);
  const [lifeArea, setLifeArea] = useState<string | null>(row?.lifeAreaHint ?? null);

  useEffect(() => {
    if (!row || mentions.length === 0) return;
    let cancelled = false;
    void summarizeJournalThemeRemote({
      theme: row.name,
      mentions: mentions.map((m) => ({
        date: m.date,
        sentence: m.sentence,
        mood: m.mood,
        tone: m.tone,
      })),
    })
      .then((r) => {
        if (cancelled) return;
        setSummary(r.summary);
        if (r.lifeAreaHint) setLifeArea(r.lifeAreaHint);
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(
            `${row.entryCount} entries. ${row.trend.charAt(0).toUpperCase()}${row.trend.slice(1)}.`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row?.name, mentions.length]);

  if (!row) {
    return (
      <div className="px-4 py-8 text-sm text-muted">
        Theme not found.{" "}
        <button
          type="button"
          className="text-accent-link underline"
          onClick={() => navigate(INSIGHTS_HREF)}
        >
          Back to Insights
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-28 pt-3 sm:px-6 lg:pb-10">
      <button
        type="button"
        onClick={() => navigate(INSIGHTS_HREF)}
        className="text-[13px] font-medium text-muted hover:text-foreground"
      >
        ← Insights
      </button>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Theme">
            <p className="font-display text-2xl font-medium tracking-tight text-foreground">
              {row.name}
            </p>
            <p className="mt-2 font-sans text-[15px] leading-relaxed text-foreground">
              {summary || "…"}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {lifeArea ? (
                <span className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[12px] text-foreground">
                  Linked: {lifeArea}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  writeInsightsMeditationPrompt(
                    [
                      `A gentle guided meditation about ${row.name}.`,
                      summary ? `\n\n${summary}` : "",
                      mentions.length
                        ? `\n\nLines from my journal:\n${mentions
                            .slice(0, 4)
                            .map((m) => `“${m.sentence}”`)
                            .join("\n")}`
                        : "",
                    ].join(""),
                  );
                  navigate(insightsCreateMeditationHref());
                }}
                className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-[12px] font-semibold text-foreground"
              >
                Create meditation
              </button>
            </div>
          </Card>

          <Card title="Mentions over time">
            {mentions.length === 0 ? (
              <p className="text-sm text-muted">No mentions yet.</p>
            ) : (
              <div className="relative flex h-10 items-center">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <div className="relative z-[1] flex w-full justify-between px-1">
                  {mentions
                    .slice()
                    .reverse()
                    .slice(0, 24)
                    .map((m, i) => (
                      <span
                        key={`${m.entryId}-${i}`}
                        title={m.date}
                        className={`size-2.5 rounded-full ${toneDotClass(m.tone)}`}
                      />
                    ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card title="Where it comes up" className="lg:col-span-1">
          <ul className="space-y-3">
            {mentions.map((m, i) => (
              <li key={`${m.entryId}-${i}`}>
                <Link
                  to={entryHrefWithHighlight(m.entryId, m.sentence, {
                    theme: row.name,
                  })}
                  className="block rounded-lg px-1 py-1 transition-colors hover:bg-accent-soft/40"
                >
                  <p className="text-[12px] text-muted">
                    {m.date
                      ? new Date(m.date + "T12:00:00").toLocaleDateString(
                          undefined,
                          { day: "numeric", month: "short" },
                        )
                      : ""}
                    {m.mood
                      ? ` · ${m.mood.charAt(0).toUpperCase()}${m.mood.slice(1)}`
                      : ""}
                  </p>
                  <p className="font-sans text-[14px] leading-snug text-foreground">
                    “{m.sentence}”
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AllThemes({ entries }: { entries: JournalEntry[] }) {
  const navigate = useNavigate();
  const analyses = useMemo(
    () => new Map(listEntryAnalyses().map((a) => [a.entryId, a] as const)),
    [entries],
  );
  const themes = useMemo(
    () => buildThemeRows(entries, analyses, "all"),
    [entries, analyses],
  );
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-28 pt-3 sm:px-6">
      <button
        type="button"
        onClick={() => navigate(INSIGHTS_HREF)}
        className="text-[13px] font-medium text-muted hover:text-foreground"
      >
        ← Insights
      </button>
      <Card title="All themes">
        <div className="divide-y divide-border/60">
          {themes.map((row) => (
            <ThemeRowView
              key={row.slug}
              row={row}
              onOpen={() => navigate(themePath(row.slug))}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * Journal › Insights — history page (mood, themes, lines).
 * Replaces the weekly letter UI (still available in commented code in
 * journal-insights-view.tsx).
 */
export function JournalHistoryInsightsView() {
  const location = useLocation();
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<InsightsPeriodId>("3m");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchUserSettings()
      .then(({ settings }) => {
        if (!cancelled) setOptIn(settings.ai?.insightsFromJournal === true);
      })
      .catch(() => {
        if (!cancelled) setOptIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setEntries(loadJournalStore().entries.filter((e) => e.kind !== "gratitude"));
  }, [location.pathname, tick]);

  // Backfill a few missing analyses when Insights opens (cheap if already done).
  useEffect(() => {
    if (!optIn) return;
    let cancelled = false;
    void backfillJournalEntryAnalyses({ max: 12 }).then(() => {
      if (!cancelled) setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [optIn]);

  const enable = useCallback(async () => {
    await patchUserSettings({ ai: { insightsFromJournal: true } });
    invalidateJournalInsightsOptInCache(true);
    setOptIn(true);
  }, []);

  if (optIn === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        {/* Loading… */}
        <span className="mm-placeholder block h-4 w-40 rounded-md" aria-hidden />
      </div>
    );
  }

  if (!optIn) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-8">
        <OptInCard onEnable={() => void enable()} />
      </div>
    );
  }

  const themeSlug = parseThemeSlug(location.pathname);
  if (themeSlug) {
    return <ThemeDetail slug={themeSlug} entries={entries} />;
  }
  if (isAllThemesPath(location.pathname)) {
    return <AllThemes entries={entries} />;
  }

  return (
    <MainInsights entries={entries} period={period} setPeriod={setPeriod} />
  );
}
