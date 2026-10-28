"use client";

import { useEffect, useMemo, useState } from "react";
import { FocusSectionTabs } from "@/components/focus-section-chrome";
import {
  FOCUS_SESSION_HISTORY_CHANGED,
  focusSessionHasContent,
  formatFocusLength,
  liveFocusLengthSec,
  localDayKeyFromIso,
  readFocusOutsideTicks,
  readFocusSessionHistory,
  type FocusOutsideTick,
  type FocusSessionRecord,
} from "@/lib/focus-session-history";

type RangeId = "7d" | "30d" | "12m";

const RANGE_OPTIONS: { id: RangeId; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "12m", label: "12 months" },
];

export function FocusInsightsView() {
  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);
  const [outsideTicks, setOutsideTicks] = useState<FocusOutsideTick[]>([]);
  const [range, setRange] = useState<RangeId>("7d");
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setSessions(readFocusSessionHistory().filter((s) => focusSessionHasContent(s)));
      setOutsideTicks(readFocusOutsideTicks());
    };
    refresh();
    window.addEventListener(FOCUS_SESSION_HISTORY_CHANGED, refresh);
    return () => window.removeEventListener(FOCUS_SESSION_HISTORY_CHANGED, refresh);
  }, []);

  const now = useMemo(() => new Date(), [sessions, outsideTicks, range]);
  const stats = useMemo(
    () => buildStats(sessions, outsideTicks, range, now),
    [sessions, outsideTicks, range, now],
  );
  const dayBars = useMemo(() => buildDayBars(sessions, range, now), [sessions, range, now]);
  const weekGrid = useMemo(() => buildWeekGrid(sessions, now), [sessions, now]);
  const areaBars = useMemo(
    () => buildAreaBars(sessions, outsideTicks, range, now),
    [sessions, outsideTicks, range, now],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10">
      <FocusSectionTabs />

      <div
        className="inline-flex self-start rounded-full border border-border bg-card p-1"
        role="tablist"
        aria-label="Insights range"
      >
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={range === option.id}
            className={`h-8 rounded-full px-3.5 text-[13px] font-semibold ${
              range === option.id
                ? "bg-[#0F1B2D] text-[#F3EDE2]"
                : "text-muted"
            }`}
            onClick={() => setRange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <StatCard
          label="Sessions"
          value={String(stats.sessions)}
          note={
            stats.sessionDelta === 0
              ? "Same as last period"
              : stats.sessionDelta > 0
                ? `+${stats.sessionDelta} vs last period`
                : `${stats.sessionDelta} vs last period`
          }
        />
        <StatCard
          label="Focus time"
          value={formatFocusLength(stats.focusSec)}
          note={`Avg ${formatFocusLength(stats.dailyAvgSec)} / day`}
        />
        <StatCard
          label="Goals done"
          value={String(stats.goalsDone)}
          note={
            stats.manifestGoals > 0
              ? `${stats.manifestGoals} from Manifest`
              : "From this period"
          }
        />
      </div>

      <section className="rounded-[18px] border border-border bg-card p-4 md:p-5">
        <h2 className="font-display text-lg text-foreground">Focus time per day</h2>
        <DayBars bars={dayBars} tip={tip} setTip={setTip} />
        <table className="sr-only">
          <caption>Focus time per day</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Focus time</th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {dayBars.map((bar) => (
              <tr key={bar.key}>
                <td>{bar.label}</td>
                <td>{formatFocusLength(bar.sec)}</td>
                <td>{bar.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-[18px] border border-border bg-card p-4 md:p-5">
          <h2 className="font-display text-lg text-foreground">Last 12 weeks</h2>
          <WeekGrid grid={weekGrid} setTip={setTip} />
          <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
            Less
            <span className="inline-flex gap-1" aria-hidden>
              {[0, 1, 2, 3, 4].map((step) => (
                <i
                  key={step}
                  className="block size-2.5 rounded-[3px]"
                  style={{ background: heatColor(step / 4) }}
                />
              ))}
            </span>
            More
          </p>
          <table className="sr-only">
            <caption>Focus time over the last 12 weeks</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Focus time</th>
              </tr>
            </thead>
            <tbody>
              {weekGrid.cells
                .filter((cell) => !cell.future)
                .map((cell) => (
                  <tr key={cell.key}>
                    <td>{cell.key}</td>
                    <td>{formatFocusLength(cell.sec)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-[18px] border border-border bg-card p-4 md:p-5">
          <h2 className="font-display text-lg text-foreground">Goals done by life area</h2>
          <AreaBars bars={areaBars} />
          <table className="sr-only">
            <caption>Goals done by life area</caption>
            <thead>
              <tr>
                <th>Life area</th>
                <th>Goals done</th>
              </tr>
            </thead>
            <tbody>
              {areaBars.map((bar) => (
                <tr key={bar.label}>
                  <td>{bar.label}</td>
                  <td>{bar.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {tip ? (
        <p className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] text-foreground shadow-lg md:bottom-8">
          {tip}
        </p>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="rounded-[16px] border border-border bg-card px-3 py-3 md:px-4 md:py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-1 font-display text-[22px] leading-none text-foreground md:text-[28px]">
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-muted md:text-[13px]">{note}</p>
    </article>
  );
}

type DayBar = { key: string; label: string; sec: number; sessions: number; isToday: boolean };

function DayBars({
  bars,
  tip,
  setTip,
}: {
  bars: DayBar[];
  tip: string | null;
  setTip: (value: string | null) => void;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.sec));
  return (
    <div className="mt-4">
      <div className="relative flex h-40 items-end gap-1.5 border-b border-border pb-1">
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <div
            key={fraction}
            className="pointer-events-none absolute right-0 left-0 border-t border-border/60"
            style={{ bottom: `${fraction * 100}%` }}
            aria-hidden
          />
        ))}
        {bars.map((bar) => (
          <button
            key={bar.key}
            type="button"
            className="relative z-[1] flex min-w-0 flex-1 flex-col items-center justify-end"
            onMouseEnter={() =>
              setTip(
                `${bar.label}: ${formatFocusLength(bar.sec)} · ${bar.sessions} ${
                  bar.sessions === 1 ? "session" : "sessions"
                }`,
              )
            }
            onMouseLeave={() => setTip(null)}
            onFocus={() =>
              setTip(
                `${bar.label}: ${formatFocusLength(bar.sec)} · ${bar.sessions} ${
                  bar.sessions === 1 ? "session" : "sessions"
                }`,
              )
            }
            onBlur={() => setTip(null)}
          >
            <span
              className="w-full max-w-[28px] rounded-t-md bg-[#C8A46A]"
              style={{ height: `${Math.max(bar.sec > 0 ? 8 : 0, (bar.sec / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {bars.map((bar) => (
          <span
            key={bar.key}
            className={`min-w-0 flex-1 truncate text-center text-[11px] ${
              bar.isToday ? "font-semibold text-foreground" : "text-muted"
            }`}
          >
            {bar.isToday ? "Today" : bar.label}
          </span>
        ))}
      </div>
      {tip ? <span className="sr-only">{tip}</span> : null}
    </div>
  );
}

type WeekCell = {
  key: string;
  sec: number;
  level: number;
  future: boolean;
  today: boolean;
  weekIndex: number;
  weekday: number;
};

function WeekGrid({
  grid,
  setTip,
}: {
  grid: { months: { label: string; weekIndex: number }[]; cells: WeekCell[] };
  setTip: (value: string | null) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `28px repeat(${Math.max(1, grid.months.length ? 12 : 12)}, 12px)`,
        }}
      >
        <span />
        {Array.from({ length: 12 }, (_, week) => {
          const month = grid.months.find((item) => item.weekIndex === week);
          return (
            <span key={`m-${week}`} className="text-[10px] text-muted">
              {month?.label ?? ""}
            </span>
          );
        })}
        {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((label, weekday) => (
          <div key={`row-${weekday}`} className="contents">
            <span className="text-[10px] leading-[12px] text-muted">{label}</span>
            {Array.from({ length: 12 }, (_, week) => {
              const cell = grid.cells.find(
                (item) => item.weekIndex === week && item.weekday === weekday,
              );
              if (!cell) return <span key={`${week}-${weekday}`} className="size-3" />;
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={`size-3 rounded-[3px] ${
                    cell.today ? "ring-1 ring-[#0F1B2D] ring-offset-1" : ""
                  } ${cell.future ? "border border-dashed border-border bg-transparent" : ""}`}
                  style={
                    cell.future
                      ? undefined
                      : { background: heatColor(cell.level / 4) }
                  }
                  onMouseEnter={() =>
                    setTip(`${cell.key}: ${formatFocusLength(cell.sec)}`)
                  }
                  onMouseLeave={() => setTip(null)}
                  onFocus={() => setTip(`${cell.key}: ${formatFocusLength(cell.sec)}`)}
                  onBlur={() => setTip(null)}
                  aria-label={`${cell.key}, ${formatFocusLength(cell.sec)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function AreaBars({
  bars,
}: {
  bars: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  if (bars.length === 0) {
    return <p className="mt-4 text-sm text-muted">No goals done in this range yet.</p>;
  }
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {bars.map((bar) => (
        <li key={bar.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">{bar.label}</p>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-accent-soft/50">
              <div
                className="h-full rounded-full bg-[#C8A46A]"
                style={{ width: `${(bar.count / max) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-[13px] font-semibold text-foreground">{bar.count}</span>
        </li>
      ))}
    </ul>
  );
}

function heatColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped === 0) return "rgba(200,164,106,0.12)";
  const alpha = 0.22 + clamped * 0.78;
  return `rgba(168,120,48,${alpha})`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inRange(session: FocusSessionRecord, start: Date, end: Date): boolean {
  const t = new Date(session.startedAt).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function rangeWindow(range: RangeId, now: Date): { start: Date; end: Date; days: number } {
  const end = startOfLocalDay(now);
  end.setHours(23, 59, 59, 999);
  if (range === "7d") {
    const start = startOfLocalDay(addDays(now, -6));
    return { start, end, days: 7 };
  }
  if (range === "30d") {
    const start = startOfLocalDay(addDays(now, -29));
    return { start, end, days: 30 };
  }
  const start = startOfLocalDay(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  return { start, end, days: 365 };
}

function tickInRange(tick: FocusOutsideTick, start: Date, end: Date): boolean {
  const t = new Date(tick.tickedAt).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function buildStats(
  sessions: FocusSessionRecord[],
  outsideTicks: FocusOutsideTick[],
  range: RangeId,
  now: Date,
) {
  const { start, end, days } = rangeWindow(range, now);
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  const current = sessions.filter((session) => inRange(session, start, end));
  const previous = sessions.filter((session) => inRange(session, prevStart, prevEnd));
  const currentTicks = outsideTicks.filter((tick) => tickInRange(tick, start, end));
  const focusSec = current.reduce((sum, session) => sum + liveFocusLengthSec(session), 0);
  const goalsDone =
    current.reduce((sum, session) => sum + session.goalsDone.length, 0) +
    currentTicks.length;
  const manifestGoals =
    current.reduce(
      (sum, session) =>
        sum + session.goalsDone.filter((goal) => Boolean(goal.lifeAreaId)).length,
      0,
    ) + currentTicks.filter((tick) => Boolean(tick.goal.lifeAreaId)).length;
  return {
    sessions: current.length,
    sessionDelta: current.length - previous.length,
    focusSec,
    dailyAvgSec: Math.round(focusSec / Math.max(1, days)),
    goalsDone,
    manifestGoals,
  };
}

function buildDayBars(sessions: FocusSessionRecord[], range: RangeId, now: Date): DayBar[] {
  if (range === "12m") {
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthSessions = sessions.filter((session) =>
        localDayKeyFromIso(session.startedAt).startsWith(key),
      );
      return {
        key,
        label: date.toLocaleDateString(undefined, { month: "short" }),
        sec: monthSessions.reduce((sum, session) => sum + liveFocusLengthSec(session), 0),
        sessions: monthSessions.length,
        isToday: index === 11,
      };
    });
  }
  const count = range === "7d" ? 7 : 30;
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(startOfLocalDay(now), -(count - 1 - index));
    const key = dayKey(date);
    const daySessions = sessions.filter(
      (session) => localDayKeyFromIso(session.startedAt) === key,
    );
    return {
      key,
      label: date.toLocaleDateString(undefined, {
        weekday: range === "7d" ? "short" : undefined,
        day: "numeric",
        month: range === "30d" ? "short" : undefined,
      }),
      sec: daySessions.reduce((sum, session) => sum + liveFocusLengthSec(session), 0),
      sessions: daySessions.length,
      isToday: index === count - 1,
    };
  });
}

function buildWeekGrid(sessions: FocusSessionRecord[], now: Date) {
  const today = startOfLocalDay(now);
  const todayWeekday = (today.getDay() + 6) % 7; // Mon=0
  const end = addDays(today, 6 - todayWeekday);
  const start = addDays(end, -(12 * 7 - 1));
  const cells: WeekCell[] = [];
  const months: { label: string; weekIndex: number }[] = [];
  let lastMonth = -1;
  for (let week = 0; week < 12; week++) {
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = addDays(start, week * 7 + weekday);
      const key = dayKey(date);
      const sec = sessions
        .filter((session) => localDayKeyFromIso(session.startedAt) === key)
        .reduce((sum, session) => sum + liveFocusLengthSec(session), 0);
      cells.push({
        key,
        sec,
        level: 0,
        future: date.getTime() > today.getTime(),
        today: date.getTime() === today.getTime(),
        weekIndex: week,
        weekday,
      });
      if (weekday === 0 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth();
        months.push({
          label: date.toLocaleDateString(undefined, { month: "short" }),
          weekIndex: week,
        });
      }
    }
  }
  const max = Math.max(1, ...cells.map((cell) => cell.sec));
  for (const cell of cells) {
    if (cell.sec <= 0) cell.level = 0;
    else if (cell.sec / max <= 0.25) cell.level = 1;
    else if (cell.sec / max <= 0.5) cell.level = 2;
    else if (cell.sec / max <= 0.75) cell.level = 3;
    else cell.level = 4;
  }
  return { months, cells };
}

function buildAreaBars(
  sessions: FocusSessionRecord[],
  outsideTicks: FocusOutsideTick[],
  range: RangeId,
  now: Date,
) {
  const { start, end } = rangeWindow(range, now);
  const counts = new Map<string, number>();
  for (const session of sessions.filter((item) => inRange(item, start, end))) {
    for (const goal of session.goalsDone) {
      const label = goal.lifeAreaTitle?.trim() || "No life area";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  for (const tick of outsideTicks.filter((item) => tickInRange(item, start, end))) {
    const label = tick.goal.lifeAreaTitle?.trim() || "No life area";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
