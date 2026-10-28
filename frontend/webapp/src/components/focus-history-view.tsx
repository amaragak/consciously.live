"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FocusSectionTabs } from "@/components/focus-section-chrome";
import {
  FOCUS_SESSION_HISTORY_CHANGED,
  formatEndedEarlyLabel,
  formatFocusClock,
  formatFocusDayHeading,
  formatFocusLength,
  groupFocusSessionsByDay,
  liveFocusLengthSec,
  readFocusOutsideTicks,
  readFocusSessionHistory,
  type FocusOutsideTick,
  type FocusSessionRecord,
} from "@/lib/focus-session-history";
import { loadPlanDreamsStore } from "@/lib/plan-dreams";

const PAGE_SIZE = 12;

export function FocusHistoryView() {
  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);
  const [outsideTicks, setOutsideTicks] = useState<FocusOutsideTick[]>([]);
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setSessions(readFocusSessionHistory());
      setOutsideTicks(readFocusOutsideTicks());
    };
    refresh();
    window.addEventListener(FOCUS_SESSION_HISTORY_CHANGED, refresh);
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => {
      window.removeEventListener(FOCUS_SESSION_HISTORY_CHANGED, refresh);
      window.clearInterval(id);
    };
  }, []);

  const lifeAreas = useMemo(() => {
    const store = loadPlanDreamsStore();
    return store.dreams
      .filter((dream) => dream.id && dream.title?.trim())
      .map((dream) => ({ id: dream.id, title: dream.title.trim() }));
  }, [sessions, outsideTicks]);

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (areaFilter === "none") {
        if (session.goalsDone.some((goal) => goal.lifeAreaId)) return false;
      } else if (areaFilter !== "all") {
        if (!session.goalsDone.some((goal) => goal.lifeAreaId === areaFilter)) {
          return false;
        }
      }
      if (!q) return true;
      return session.goalsDone.some((goal) =>
        goal.text.toLowerCase().includes(q),
      );
    });
  }, [sessions, areaFilter, query]);

  const filteredOutside = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outsideTicks.filter((tick) => {
      if (areaFilter === "none") {
        if (tick.goal.lifeAreaId) return false;
      } else if (areaFilter !== "all") {
        if (tick.goal.lifeAreaId !== areaFilter) return false;
      }
      if (!q) return true;
      return tick.goal.text.toLowerCase().includes(q);
    });
  }, [outsideTicks, areaFilter, query]);

  const groups = useMemo(
    () => groupFocusSessionsByDay(filteredSessions, filteredOutside),
    [filteredSessions, filteredOutside],
  );
  const visible = groups.slice(0, limit);
  const hasMore = groups.length > limit;
  const empty = visible.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10">
      <FocusSectionTabs />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
          <FilterChip
            label="All"
            active={areaFilter === "all"}
            onClick={() => setAreaFilter("all")}
          />
          {lifeAreas.map((area) => (
            <FilterChip
              key={area.id}
              label={area.title}
              active={areaFilter === area.id}
              onClick={() => setAreaFilter(area.id)}
            />
          ))}
          <FilterChip
            label="No life area"
            active={areaFilter === "none"}
            onClick={() => setAreaFilter("none")}
          />
        </div>
        <label className="relative block w-full md:max-w-[220px]">
          <span className="sr-only">Search goals</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search goals"
            className="h-10 w-full rounded-full border border-border bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted"
          />
        </label>
      </div>

      {empty ? (
        <div className="flex flex-col items-start gap-4 rounded-[18px] border border-border bg-card px-5 py-8 md:px-6">
          <p className="text-sm text-muted">
            Your focus sessions and the goals you tick off will show up here.
          </p>
          <Link
            to="/focus"
            className="inline-flex h-10 items-center rounded-full border border-[#AFC2DC] bg-accent-button px-4 text-[13.5px] font-semibold text-on-accent"
          >
            Start a session
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {visible.map((group) => (
            <section key={group.dayKey} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-link">
                  {formatFocusDayHeading(group.dayKey)}
                </h2>
                <p className="text-[13px] text-muted">
                  {formatFocusLength(group.totalSec)} · {group.sessionCount}{" "}
                  {group.sessionCount === 1 ? "session" : "sessions"} ·{" "}
                  {group.goalsDone}{" "}
                  {group.goalsDone === 1 ? "goal" : "goals"} done
                </p>
              </div>
              <ul className="overflow-hidden rounded-[18px] border border-border bg-card">
                {group.sessions.map((session, index) => (
                  <li
                    key={session.id}
                    className={`px-4 py-3.5 md:px-5 ${
                      index > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <SessionRow session={session} />
                  </li>
                ))}
                {group.outsideTicks.length > 0 ? (
                  <li
                    className={`px-4 py-3.5 md:px-5 ${
                      group.sessions.length > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <OutsideTicksRow ticks={group.outsideTicks} />
                  </li>
                ) : null}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          className="mx-auto inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground"
          onClick={() => setLimit((value) => value + PAGE_SIZE)}
        >
          Show earlier sessions
        </button>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold ${
        active
          ? "bg-[#0F1B2D] text-[#F3EDE2]"
          : "border border-border bg-card text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function SessionRow({ session }: { session: FocusSessionRecord }) {
  const lengthSec = liveFocusLengthSec(session);
  const early = formatEndedEarlyLabel(session);
  const statusLabel =
    session.status === "running"
      ? "In progress"
      : session.status === "paused"
        ? "Paused"
        : early;

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,180px)_1fr] md:gap-6">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-foreground">
          <span className="md:hidden">
            {formatFocusClock(session.startedAt)} · {formatFocusLength(lengthSec)}
            {session.rounds > 0
              ? ` · ${session.rounds} ${session.rounds === 1 ? "round" : "rounds"}`
              : ""}
          </span>
          <span className="hidden md:inline">
            {formatFocusClock(session.startedAt)}
          </span>
        </p>
        <p className="mt-0.5 hidden text-[13px] text-muted md:block">
          {formatFocusLength(lengthSec)}
          {session.rounds > 0 ? (
            <>
              <span className="mx-1.5 text-border">·</span>
              {session.rounds} {session.rounds === 1 ? "round" : "rounds"}
            </>
          ) : null}
        </p>
        {statusLabel ? (
          <p className="mt-1 text-[12.5px] text-muted">{statusLabel}</p>
        ) : null}
        {session.meditateFirst ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-accent-link">
            <MeditationMark />
            2-minute meditation
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        {session.goalsDone.length === 0 ? (
          <p className="text-[13px] text-muted">No goals ticked off</p>
        ) : (
          <GoalList goals={session.goalsDone} />
        )}
      </div>
    </div>
  );
}

function OutsideTicksRow({ ticks }: { ticks: FocusOutsideTick[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,180px)_1fr] md:gap-6">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-foreground">
          Ticked off outside a session
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {ticks.length} {ticks.length === 1 ? "goal" : "goals"}
        </p>
      </div>
      <div className="min-w-0">
        <GoalList goals={ticks.map((tick) => tick.goal)} />
      </div>
    </div>
  );
}

function GoalList({
  goals,
}: {
  goals: FocusSessionRecord["goalsDone"];
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {goals.map((goal) => (
        <li
          key={goal.id}
          className="flex min-w-0 items-center gap-2 text-[14px] text-foreground"
        >
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-link"
            aria-hidden
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
          <span className="min-w-0 truncate">{goal.text}</span>
          {goal.lifeAreaTitle ? (
            <span className="shrink-0 rounded-full bg-[#F6EEDD] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#8A6424]">
              {goal.lifeAreaTitle}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MeditationMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="6" r="2" />
      <path d="M6 20c1-4 3-6 6-6s5 2 6 6M4 14l4-2M20 14l-4-2" />
    </svg>
  );
}
