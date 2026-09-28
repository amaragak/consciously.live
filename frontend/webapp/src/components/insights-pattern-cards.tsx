/**
 * Insights update-2 pattern cards (after Mood, before the dark meditation CTA).
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  type JournalWeeklyArc,
  type JournalWeeklyEmotionScore,
  type JournalWeeklyLetterSummary,
  type JournalWeeklyRecurringThought,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";
import {
  isJournalMoodId,
  type JournalMoodId,
} from "@/lib/journal-moods";
import { type JournalEntry } from "@/lib/journal-storage";
import {
  buildRecurringThoughtMeditationPrompt,
  insightsCreateMeditationHref,
  writeInsightsMeditationPrompt,
} from "@/lib/insights-meditation-handoff";

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

function WeekMovedChart({ arc }: { arc: JournalWeeklyArc }) {
  const width = 560;
  const height = 120;
  const padX = 16;
  const padY = 16;
  const byDate = new Map(arc.days.map((d) => [d.date, d.value]));
  // Place points across Mon–Sun of the week containing the first day.
  const first = arc.days[0]!.date;
  const monday = new Date(`${first}T12:00:00`);
  const dow = monday.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  monday.setDate(monday.getDate() + mondayOffset);

  const points: Array<{ x: number; y: number; value: number; label: string }> =
    [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const value = byDate.get(key);
    if (value == null) continue;
    const x = padX + (i / 6) * (width - padX * 2);
    const y =
      padY + ((5 - value) / 10) * (height - padY * 2);
    points.push({ x, y, value, label: DAY_LABELS[i]! });
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
            key={`${p.label}-${i}`}
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
      <div className="grid grid-cols-7 gap-1 text-center text-[12px] text-muted">
        {DAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
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
          No promises this week, and that&apos;s okay.
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
        Next week&apos;s letter will ask how these went.
      </p>
    </div>
  );
}

function RecurringThoughtCard({
  thought,
  weekLabel,
}: {
  thought: JournalWeeklyRecurringThought;
  weekLabel: string;
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
        {thought.count} time{thought.count === 1 ? "" : "s"} this week
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

function mondayKeyFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = local.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + mondayOffset);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeLiftsAndDrains(
  letters: JournalWeeklyLetterSummary[],
  entries: JournalEntry[],
): { lifts: string[]; drains: string[]; locked: boolean } {
  const moodById = new Map<string, JournalMoodId>();
  const weekKeys = new Set<string>();
  let tagged = 0;
  for (const e of entries) {
    if (e.mood && isJournalMoodId(e.mood)) {
      moodById.set(e.id, e.mood);
      tagged += 1;
    }
    const iso = e.updatedAt || e.createdAt;
    const wk = iso ? mondayKeyFromIso(iso) : null;
    if (wk) weekKeys.add(wk);
  }
  const locked = weekKeys.size < 3 || tagged < 8;

  const good = new Map<string, number>();
  const low = new Map<string, number>();
  for (const letter of letters.slice(0, 4)) {
    for (const row of letter.activities ?? []) {
      const mood = moodById.get(row.entryId);
      if (!mood) continue;
      const bucket =
        mood === "good" || mood === "calm"
          ? good
          : mood === "low" || mood === "heavy"
            ? low
            : null;
      if (!bucket) continue;
      for (const item of row.items) {
        bucket.set(item, (bucket.get(item) ?? 0) + 1);
      }
    }
  }

  const lifts = [...good.entries()]
    .filter(([k, n]) => n >= 2 && n > (low.get(k) ?? 0))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k);
  const drains = [...low.entries()]
    .filter(([k, n]) => n >= 2 && n > (good.get(k) ?? 0))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return { lifts, drains, locked };
}

function WhatLiftsYouCard({
  letters,
  entries,
}: {
  letters: JournalWeeklyLetterSummary[];
  entries: JournalEntry[];
}) {
  const { lifts, drains, locked } = useMemo(
    () => computeLiftsAndDrains(letters, entries),
    [letters, entries],
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">What lifts you</div>
        <span className="text-[12px] text-muted">Last 4 weeks</span>
      </div>
      {locked ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Unlocks after 3 weeks of entries</p>
          <div className="h-16 rounded-xl bg-border-subtle/60" aria-hidden />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
              Days you felt good or calm
            </span>
            <div className="flex flex-wrap gap-2">
              {lifts.length === 0 ? (
                <span className="text-sm text-muted">Not enough tagged days yet.</span>
              ) : (
                lifts.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-medium text-foreground"
                  >
                    {item}
                  </span>
                ))
              )}
            </div>
          </div>
          {drains.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
                Days you felt low
              </span>
              <div className="flex flex-wrap gap-2">
                {drains.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-surface-2 px-3 py-1 text-[13px] font-medium text-foreground/80"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
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
  if (parts.length === 1) return `${parts[0]} across recent weeks.`;
  return `${parts[0]} while ${parts[1]}.`;
}

function MonthSoFarCard({
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
        <div className="text-sm font-semibold text-foreground">
          Your month so far
        </div>
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
              key={w.weekKey}
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
              <span className="text-[11px] text-muted">
                {formatShortDate(w.weekKey)}
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
  generatedParts,
  loadingParts,
}: {
  reflection: JournalWeeklyReflection | null;
  recentLetters: JournalWeeklyLetterSummary[];
  storeEntries: JournalEntry[];
  weekLabel: string;
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
  const showArc =
    Boolean(generatedParts?.moved) && Boolean(arc && arc.days.length >= 3);
  const wins = reflection?.wins ?? [];
  const showWins =
    Boolean(generatedParts?.wins) && wins.some((w) => !isWroteOnLine(w));
  const showPromises = Boolean(generatedParts?.wins);
  const thought =
    generatedParts?.thought ? reflection?.recurringThought : undefined;

  // Merge this week's activities into the letter list for lifts/month.
  const lettersForCharts = useMemo(() => {
    if (!reflection) return recentLetters;
    const self: JournalWeeklyLetterSummary = {
      weekKey: reflection.weekKey,
      weekStart: reflection.weekStart,
      weekEnd: reflection.weekEnd,
      generatedAt: reflection.meta.generatedAt,
      ...(reflection.preview ? { preview: reflection.preview } : {}),
      ...(reflection.emotions ? { emotions: reflection.emotions } : {}),
      ...(reflection.activities ? { activities: reflection.activities } : {}),
      ...(reflection.promises ? { promises: reflection.promises } : {}),
      ...(reflection.recurringThought
        ? { recurringThought: reflection.recurringThought }
        : {}),
    };
    const rest = recentLetters.filter((l) => l.weekKey !== reflection.weekKey);
    return [self, ...rest].sort((a, b) =>
      a.weekKey < b.weekKey ? 1 : a.weekKey > b.weekKey ? -1 : 0,
    );
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
              How the week moved
            </div>
            <span className="text-[13px] text-muted">
              {arc.start} → {arc.end}
            </span>
          </div>
          <WeekMovedChart arc={arc} />
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
        <RecurringThoughtCard thought={thought} weekLabel={weekLabel} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WhatLiftsYouCard
          letters={lettersForCharts}
          entries={storeEntries}
        />
        <MonthSoFarCard
          letters={lettersForCharts}
          thisWeekEmotions={emotions}
        />
      </div>
    </>
  );
}
