/**
 * Insights update-2 pattern cards (after Mood, before the dark meditation CTA).
 */
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  type JournalWeeklyArc,
  type JournalWeeklyEmotionScore,
  type JournalWeeklyLetterSummary,
  type JournalWeeklyRecurringThought,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";
import { type JournalEntry } from "@/lib/journal-storage";
import {
  buildRecurringThoughtMeditationPrompt,
  insightsCreateMeditationHref,
  writeInsightsMeditationPrompt,
} from "@/lib/insights-meditation-handoff";
import { computeWhatLiftsYou } from "@/lib/what-lifts-you";
import {
  addDaysToDate,
  dayOfWeek,
  daysBetweenInclusive,
  formatRangeWords,
  periodUiCopy,
} from "@/lib/insight-period";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function isWroteOnLine(s: string): boolean {
  return /^wrote on \d+/i.test(s.trim());
}

function formatShortDate(isoDay: string): string {
  try {
    const d = new Date(`${isoDay}T12:00:00`);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return isoDay;
  }
}

function letterRangeLabel(letter: JournalWeeklyLetterSummary): string {
  const start =
    letter.startDate || letter.weekStart?.slice(0, 10) || letter.weekKey;
  const end = letter.endDate || letter.weekEnd?.slice(0, 10) || start;
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return formatRangeWords(start, end);
  }
  return formatShortDate(letter.weekKey);
}

function letterIdentity(letter: JournalWeeklyLetterSummary): string {
  return (
    letter.rangeKey ||
    (letter.startDate && letter.endDate
      ? `${letter.startDate}_${letter.endDate}`
      : letter.weekKey)
  );
}

function WeekMovedChart({
  arc,
  startDate,
  endDate,
}: {
  arc: JournalWeeklyArc;
  startDate?: string;
  endDate?: string;
}) {
  const width = 560;
  const height = 120;
  const padX = 16;
  const padY = 16;
  const byDate = new Map(arc.days.map((d) => [d.date, d.value]));

  const spanStart =
    startDate ||
    [...byDate.keys()].sort()[0] ||
    arc.days[0]!.date;
  const spanEnd =
    endDate ||
    [...byDate.keys()].sort().at(-1) ||
    arc.days[arc.days.length - 1]!.date;
  const dayCount = Math.max(1, daysBetweenInclusive(spanStart, spanEnd));
  const labelEveryDay = dayCount <= 14;

  const points: Array<{ x: number; y: number; value: number; date: string }> =
    [];
  for (let i = 0; i < dayCount; i += 1) {
    const key = addDaysToDate(spanStart, i);
    const value = byDate.get(key);
    if (value == null) continue;
    const x =
      dayCount === 1
        ? width / 2
        : padX + (i / (dayCount - 1)) * (width - padX * 2);
    const y = padY + ((5 - value) / 10) * (height - padY * 2);
    points.push({ x, y, value, date: key });
  }
  if (points.length < 3) return null;

  let lowestIdx = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]!.value < points[lowestIdx]!.value) lowestIdx = i;
  }

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const guides = [0.25, 0.5, 0.75].map((t) => padY + t * (height - padY * 2));

  const axisLabels: Array<{ x: number; label: string }> = [];
  if (labelEveryDay) {
    for (let i = 0; i < dayCount; i += 1) {
      const key = addDaysToDate(spanStart, i);
      const x =
        dayCount === 1
          ? width / 2
          : padX + (i / (dayCount - 1)) * (width - padX * 2);
      const dow = dayOfWeek(key);
      const monIndex = dow === 0 ? 6 : dow - 1;
      axisLabels.push({ x, label: DAY_LABELS[monIndex]! });
    }
  } else {
    // Label each week's Monday that falls inside the span.
    for (let i = 0; i < dayCount; i += 1) {
      const key = addDaysToDate(spanStart, i);
      if (dayOfWeek(key) !== 1 && i !== 0) continue;
      const x =
        dayCount === 1
          ? width / 2
          : padX + (i / (dayCount - 1)) * (width - padX * 2);
      axisLabels.push({ x, label: formatShortDate(key) });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={arc.summary}
      >
        {guides.map((gy) => (
          <line
            key={gy}
            x1={padX}
            x2={width - padX}
            y1={gy}
            y2={gy}
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke="var(--accent, #c4a484)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={p.x}
            cy={p.y}
            r={i === lowestIdx ? 5.5 : 4}
            fill={
              i === lowestIdx
                ? "var(--deep, #1e2530)"
                : "var(--accent, #c4a484)"
            }
          />
        ))}
      </svg>
      <div className="relative h-5 text-[12px] text-muted">
        {axisLabels.map((l) => (
          <span
            key={`${l.label}-${l.x}`}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${(l.x / width) * 100}%` }}
          >
            {l.label}
          </span>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-foreground/80">{arc.summary}</p>
    </div>
  );
}

function WinsCard({ wins }: { wins: string[] }) {
  const actionWins = wins.filter((w) => !isWroteOnLine(w));
  const wroteLine = wins.find(isWroteOnLine);
  if (actionWins.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-[22px]">
      <div className="text-sm font-semibold text-foreground">
        Wins you might have missed
      </div>
      <ul className="flex flex-col gap-2">
        {[...actionWins, ...(wroteLine ? [wroteLine] : [])].map((w) => (
          <li
            key={w}
            className="flex gap-2.5 text-[15px] leading-snug text-foreground"
          >
            <span className="mt-0.5 text-accent" aria-hidden>
              ✓
            </span>
            <span>{w}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted">
        Pulled from what you wrote. Small steps count.
      </p>
    </div>
  );
}

function PromisesCard({ promises }: { promises: string[] | undefined }) {
  const list = promises ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-[22px]">
      <div className="text-sm font-semibold text-foreground">
        Promises to yourself
      </div>
      {list.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-foreground/80">
          No promises this time, and that&apos;s okay.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <li
              key={p}
              className="flex gap-2.5 text-[15px] leading-snug text-foreground"
            >
              <span className="mt-0.5 text-muted" aria-hidden>
                ○
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-muted">
        The next insights you generate will ask how these went.
      </p>
    </div>
  );
}

function RecurringThoughtCard({
  thought,
  weekLabel,
  periodNoun,
}: {
  thought: JournalWeeklyRecurringThought;
  weekLabel: string;
  periodNoun: string;
}) {
  const navigate = useNavigate();
  const also =
    thought.alsoOn && thought.alsoOn.length > 0
      ? ` · also on ${thought.alsoOn.map(formatShortDate).join(", ")}`
      : "";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-accent/25 bg-accent-soft/40 px-6 py-[22px]">
      <div className="text-sm font-semibold text-foreground">
        The thought that keeps coming back
      </div>
      <p className="font-display text-[clamp(1.35rem,2.4vw,1.75rem)] font-normal italic leading-snug text-foreground">
        &ldquo;{thought.text}&rdquo;
      </p>
      <p className="text-sm text-muted">
        {thought.count} time{thought.count === 1 ? "" : "s"} {periodNoun}
        {also}
      </p>
      <button
        type="button"
        onClick={() => {
          writeInsightsMeditationPrompt(
            buildRecurringThoughtMeditationPrompt({
              thought: thought.text,
              weekLabel,
            }),
          );
          navigate(insightsCreateMeditationHref());
        }}
        className="inline-flex h-11 w-fit cursor-pointer items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40"
      >
        Make a meditation for this thought
      </button>
    </div>
  );
}

function WhatLiftsYouCard({
  letters,
  entries,
  minWindowDays,
}: {
  letters: JournalWeeklyLetterSummary[];
  entries: JournalEntry[];
  minWindowDays?: number;
}) {
  const model = useMemo(
    () =>
      computeWhatLiftsYou(
        entries.map((e) => ({
          id: e.id,
          at: e.updatedAt || e.createdAt,
          mood: e.mood,
        })),
        letters.map((l) => ({
          weekKey: l.weekKey,
          activities: l.activities,
        })),
        new Date(),
        minWindowDays,
      ),
    [letters, entries, minWindowDays],
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">What lifts you</div>
        <span className="text-[12px] text-muted">{model.windowLabel}</span>
      </div>

      {model.stage === "empty" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{model.emptyMessage}</p>
          <Link
            to="/journal/my"
            className="inline-flex h-10 w-fit cursor-pointer items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40"
          >
            Write an entry
          </Link>
        </div>
      ) : (
        <>
          {model.good.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wide text-accent-link">
                {model.goodLabel}
              </span>
              {model.stage === 1 ? (
                <div className="flex flex-wrap gap-2">
                  {model.good.map((item) => (
                    <span
                      key={`g-${item.label}`}
                      className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium text-foreground"
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {model.good.map((item) => (
                    <div
                      key={`g-${item.label}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="shrink-0 text-muted">
                        {item.count} of {item.of}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {model.low.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
                {model.lowLabel}
              </span>
              {model.stage === 1 ? (
                <div className="flex flex-wrap gap-2">
                  {model.low.map((item) => (
                    <span
                      key={`l-${item.label}`}
                      className="rounded-full bg-surface-2 px-3 py-1 text-[13px] font-medium text-foreground/80"
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {model.low.map((item) => (
                    <div
                      key={`l-${item.label}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-foreground/80">
                        {item.label}
                      </span>
                      <span className="shrink-0 text-muted">
                        {item.count} of {item.of}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {model.footer ? (
            <p className="text-[12px] leading-relaxed text-muted">{model.footer}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function monthSummary(
  weeks: Array<{ weekKey: string; emotions: JournalWeeklyEmotionScore[] }>,
  topNames: string[],
): string {
  if (topNames.length === 0 || weeks.length < 2) return "";
  const parts: string[] = [];
  for (const name of topNames.slice(0, 2)) {
    const first = weeks[weeks.length - 1]!;
    const last = weeks[0]!;
    const a =
      first.emotions.find((e) => e.name.toLowerCase() === name.toLowerCase())
        ?.score ?? null;
    const b =
      last.emotions.find((e) => e.name.toLowerCase() === name.toLowerCase())
        ?.score ?? null;
    if (a == null || b == null) continue;
    const delta = b - a;
    if (Math.abs(delta) <= 1) {
      parts.push(`${name} held steady`);
    } else if (delta > 0) {
      parts.push(`${name} has risen`);
    } else {
      parts.push(`${name} eases`);
    }
  }
  if (!parts.length) return "";
  if (parts.length === 1) return `${parts[0]} across recent insights.`;
  return `${parts[0]} while ${parts[1]}.`;
}

function OverTimeCard({
  letters,
  thisWeekEmotions,
}: {
  letters: JournalWeeklyLetterSummary[];
  thisWeekEmotions: JournalWeeklyEmotionScore[];
}) {
  const top2 = thisWeekEmotions.slice(0, 2);
  const weeks = letters
    .filter((l) => (l.emotions?.length ?? 0) > 0)
    .slice(0, 4);
  if (weeks.length < 2 || top2.length === 0) return null;

  const names = top2.map((e) => e.name);
  const summary = monthSummary(
    weeks.map((w) => ({ weekKey: w.weekKey, emotions: w.emotions ?? [] })),
    names,
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">Over time</div>
        <div className="flex items-center gap-3 text-[12px] text-muted">
          {names.map((name, i) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={`inline-block size-2.5 rounded-sm ${i === 0 ? "bg-accent" : "bg-deep"}`}
              />
              {name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-3 sm:gap-4">
        {[...weeks].reverse().map((w) => {
          const scores = names.map(
            (name) =>
              w.emotions?.find(
                (e) => e.name.toLowerCase() === name.toLowerCase(),
              )?.score ?? null,
          );
          return (
            <div
              key={letterIdentity(w)}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-24 w-full items-end justify-center gap-1">
                {scores.map((score, i) =>
                  score == null ? (
                    <div key={i} className="w-3 sm:w-4" />
                  ) : (
                    <div
                      key={i}
                      className={`w-3 rounded-t-sm sm:w-4 ${i === 0 ? "bg-accent" : "bg-deep"}`}
                      style={{ height: `${Math.max(8, (score / 10) * 100)}%` }}
                      title={`${names[i]} ${score}/10`}
                    />
                  ),
                )}
              </div>
              <span className="text-center text-[11px] leading-tight text-muted">
                {letterRangeLabel(w)}
              </span>
            </div>
          );
        })}
      </div>
      {summary ? (
        <p className="text-sm leading-relaxed text-foreground/80">{summary}</p>
      ) : null}
    </div>
  );
}

export function InsightsPatternCards({
  reflection,
  recentLetters,
  storeEntries,
  weekLabel,
  periodDays = 7,
  generatedParts,
  loadingParts,
}: {
  reflection: JournalWeeklyReflection | null;
  recentLetters: JournalWeeklyLetterSummary[];
  storeEntries: JournalEntry[];
  weekLabel: string;
  /** Inclusive day count of the selected insight period. */
  periodDays?: number;
  generatedParts?: {
    felt?: boolean;
    moved?: boolean;
    wins?: boolean;
    thought?: boolean;
  } | null;
  /** Skeleton placeholders for parts currently generating. */
  loadingParts?: {
    moved?: boolean;
    wins?: boolean;
    thought?: boolean;
  } | null;
}) {
  const arc = reflection?.arc;
  const uiCopy = periodUiCopy(periodDays);
  const showArc =
    Boolean(generatedParts?.moved) && Boolean(arc && arc.days.length >= 3);
  const wins = reflection?.wins ?? [];
  const showWins =
    Boolean(generatedParts?.wins) && wins.some((w) => !isWroteOnLine(w));
  const showPromises = Boolean(generatedParts?.wins);
  const thought =
    generatedParts?.thought ? reflection?.recurringThought : undefined;

  // Merge this period's activities into the letter list for lifts/over-time.
  const lettersForCharts = useMemo(() => {
    if (!reflection) return recentLetters;
    const selfId =
      reflection.rangeKey ||
      (reflection.startDate && reflection.endDate
        ? `${reflection.startDate}_${reflection.endDate}`
        : reflection.weekKey);
    const self: JournalWeeklyLetterSummary = {
      weekKey: reflection.weekKey,
      weekStart: reflection.weekStart,
      weekEnd: reflection.weekEnd,
      generatedAt: reflection.meta.generatedAt,
      ...(reflection.periodType ? { periodType: reflection.periodType } : {}),
      ...(reflection.startDate ? { startDate: reflection.startDate } : {}),
      ...(reflection.endDate ? { endDate: reflection.endDate } : {}),
      ...(reflection.rangeKey ? { rangeKey: reflection.rangeKey } : {}),
      ...(reflection.preview ? { preview: reflection.preview } : {}),
      ...(reflection.emotions ? { emotions: reflection.emotions } : {}),
      ...(reflection.activities ? { activities: reflection.activities } : {}),
      ...(reflection.promises ? { promises: reflection.promises } : {}),
      ...(reflection.recurringThought
        ? { recurringThought: reflection.recurringThought }
        : {}),
    };
    const rest = recentLetters.filter((l) => letterIdentity(l) !== selfId);
    return [self, ...rest].sort((a, b) => {
      const ae = a.endDate || a.weekEnd?.slice(0, 10) || a.weekKey;
      const be = b.endDate || b.weekEnd?.slice(0, 10) || b.weekKey;
      return ae < be ? 1 : ae > be ? -1 : 0;
    });
  }, [recentLetters, reflection]);

  const emotions = reflection?.emotions ?? [];

  return (
    <>
      {loadingParts?.moved ? (
        <div
          className="flex flex-col gap-3.5 rounded-xl border border-border bg-card px-6 py-[22px]"
          aria-busy
        >
          <div className="h-4 w-36 animate-pulse rounded bg-border-subtle" />
          <div className="h-28 animate-pulse rounded-xl bg-border-subtle/70" />
        </div>
      ) : showArc && arc ? (
        <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-card px-6 py-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">
              {uiCopy.movedTitle}
            </div>
            <span className="text-[13px] text-muted">
              {arc.start} → {arc.end}
            </span>
          </div>
          <WeekMovedChart
            arc={arc}
            startDate={reflection?.startDate}
            endDate={reflection?.endDate}
          />
        </div>
      ) : null}

      {loadingParts?.wins ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          aria-busy
        >
          <div className="h-36 animate-pulse rounded-xl border border-border bg-border-subtle/50" />
          <div className="h-36 animate-pulse rounded-xl border border-border bg-border-subtle/50" />
        </div>
      ) : showWins ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <WinsCard wins={wins} />
          <PromisesCard promises={reflection?.promises} />
        </div>
      ) : showPromises ? (
        <PromisesCard promises={reflection?.promises} />
      ) : null}

      {loadingParts?.thought ? (
        <div
          className="h-40 animate-pulse rounded-xl border border-accent/20 bg-accent-soft/30"
          aria-busy
        />
      ) : thought ? (
        <RecurringThoughtCard
          thought={thought}
          weekLabel={weekLabel}
          periodNoun={uiCopy.periodNoun}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WhatLiftsYouCard
          letters={lettersForCharts}
          entries={storeEntries}
          minWindowDays={periodDays}
        />
        <OverTimeCard
          letters={lettersForCharts}
          thisWeekEmotions={emotions}
        />
      </div>
    </>
  );
}
