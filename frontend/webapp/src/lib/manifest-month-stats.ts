/**
 * "This month" strip on the Manifesto page — pace, steps done and sentiment,
 * derived from the Ideate store. Any stat without data comes back `null`.
 */

import type { PlanDream, ThoughtSentiment } from "@/lib/plan-dreams";
import type { IdeateStoreV2 } from "@/lib/plan-ideate-store";

export type MonthStat = { value: string; note: string | null };

export type ManifestMonthStats = {
  pace: MonthStat | null;
  done: MonthStat | null;
  sentiment: MonthStat | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfMonth(d: Date, offset = 0): Date {
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

function inRange(iso: string | null | undefined, from: Date, to: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= from.getTime() && t < to.getTime();
}

function round1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

const SENTIMENT_SCORE: Record<ThoughtSentiment, number> = {
  bad: 0,
  okay: 1,
  good: 2,
  great: 3,
};

function sentimentHeadline(avg: number): string {
  if (avg >= 2.5) return "Mostly great";
  if (avg >= 1.75) return "Mostly hopeful";
  if (avg >= 1) return "Up and down";
  return "A heavy stretch";
}

function areaSentimentAverages(
  dreams: PlanDream[],
  from: Date,
  to: Date,
): { title: string; avg: number }[] {
  const out: { title: string; avg: number }[] = [];
  for (const d of dreams) {
    const scores: number[] = [];
    for (const list of [d.dreamEntries, d.obstacleEntries, d.visionEntries]) {
      for (const e of list ?? []) {
        if (!e.sentiment || !inRange(e.createdAt, from, to)) continue;
        scores.push(SENTIMENT_SCORE[e.sentiment]);
      }
    }
    if (scores.length === 0) continue;
    out.push({
      title: d.title.trim() || "Untitled",
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    });
  }
  return out;
}

export function manifestMonthStats(
  store: IdeateStoreV2,
  now: Date = new Date(),
): ManifestMonthStats {
  const thisStart = startOfMonth(now);
  const nextStart = startOfMonth(now, 1);
  const lastStart = startOfMonth(now, -1);

  const projectOf = new Map(store.subtasks.map((s) => [s.id, s.projectId]));
  const done = (from: Date, to: Date) => {
    const areas = new Set<string>();
    let n = 0;
    for (const t of store.todos) {
      if (!t.isChecked || !inRange(t.checkedAt, from, to)) continue;
      n += 1;
      const p = projectOf.get(t.subtaskId);
      if (p) areas.add(p);
    }
    return { n, areas: areas.size };
  };

  const cur = done(thisStart, nextStart);
  const prev = done(lastStart, thisStart);

  // Pace: steps per week so far this month vs. the whole of last month.
  const daysSoFar = Math.max(
    1,
    Math.ceil((now.getTime() - thisStart.getTime()) / DAY_MS),
  );
  const lastDays = Math.round((thisStart.getTime() - lastStart.getTime()) / DAY_MS);
  const paceNow = (cur.n / daysSoFar) * 7;
  const pacePrev = (prev.n / lastDays) * 7;

  let pace: MonthStat | null = null;
  if (cur.n > 0) {
    let note: string | null = null;
    if (prev.n > 0) {
      const arrow = paceNow > pacePrev ? "↑" : paceNow < pacePrev ? "↓" : "→";
      note = `${arrow} from ${round1(pacePrev)} last month`;
    }
    pace = { value: `${round1(paceNow)} steps / week`, note };
  }

  const doneStat: MonthStat | null =
    cur.n > 0
      ? {
          value: `${cur.n} ${cur.n === 1 ? "step" : "steps"}`,
          note: `across ${cur.areas} life ${cur.areas === 1 ? "area" : "areas"}`,
        }
      : null;

  const perArea = areaSentimentAverages(store.dreams, thisStart, nextStart);
  let sentiment: MonthStat | null = null;
  if (perArea.length > 0) {
    const avg = perArea.reduce((a, b) => a + b.avg, 0) / perArea.length;
    const lowest = [...perArea].sort((a, b) => a.avg - b.avg)[0]!;
    const note =
      perArea.length > 1 && lowest.avg < 1.5
        ? `${lowest.title} · feeling low`
        : perArea.length === 1
          ? perArea[0]!.title
          : null;
    sentiment = { value: sentimentHeadline(avg), note };
  }

  return { pace, done: doneStat, sentiment };
}

export function hasMonthStats(s: ManifestMonthStats): boolean {
  return Boolean(s.pace || s.done || s.sentiment);
}
