/**
 * Read-only summaries of a life area for the Manifesto cards and the guide
 * practice picker: current goal, progress, next step, last activity.
 * Everything derives from the Ideate store — nothing is persisted here.
 */

import { lifeAreaHrefById } from "@/lib/entity-href";
import type { PlanDream } from "@/lib/plan-dreams";
import {
  subtasksForProject,
  todosForSubtask,
  type IdeateStoreV2,
  type IdeateSubtask,
  type IdeateTodo,
} from "@/lib/plan-ideate-store";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type LifeAreaGoalSummary = {
  subtask: IdeateSubtask;
  done: number;
  total: number;
  /** First unchecked step, if the goal has steps. */
  nextStep: IdeateTodo | null;
};

function ts(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The goal a life area is working on now: the most recently touched goal in
 * progress, else the oldest goal not yet started. `null` when every goal is
 * done (or there are none).
 */
export function currentGoalForLifeArea(
  store: IdeateStoreV2,
  lifeAreaId: string,
): IdeateSubtask | null {
  const open = subtasksForProject(store, lifeAreaId).filter(
    (s) => s.status !== "done",
  );
  if (open.length === 0) return null;
  const inProgress = open
    .filter((s) => s.status === "in_progress")
    .sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt));
  if (inProgress[0]) return inProgress[0];
  return [...open].sort((a, b) => ts(a.createdAt) - ts(b.createdAt))[0] ?? null;
}

export function goalSummaryForLifeArea(
  store: IdeateStoreV2,
  lifeAreaId: string,
): LifeAreaGoalSummary | null {
  const subtask = currentGoalForLifeArea(store, lifeAreaId);
  if (!subtask) return null;
  const todos = todosForSubtask(store, subtask.id);
  const done = todos.filter((t) => t.isChecked).length;
  return {
    subtask,
    done,
    total: todos.length,
    nextStep: todos.find((t) => !t.isChecked) ?? null,
  };
}

/** Latest sign of life in a life area, as a timestamp (0 when unknown). */
export function lastActivityMs(
  store: IdeateStoreV2,
  dream: PlanDream,
): number {
  let latest = Math.max(ts(dream.updatedAt), ts(dream.createdAt));
  for (const sub of subtasksForProject(store, dream.id)) {
    latest = Math.max(latest, ts(sub.updatedAt), ts(sub.completedAt));
    for (const todo of todosForSubtask(store, sub.id)) {
      latest = Math.max(latest, ts(todo.checkedAt));
    }
  }
  for (const list of [
    dream.dreamEntries,
    dream.obstacleEntries,
    dream.visionEntries,
  ]) {
    for (const e of list ?? []) latest = Math.max(latest, ts(e.createdAt));
  }
  for (const c of dream.checkIns ?? []) {
    latest = Math.max(latest, ts(c.createdAt));
  }
  return latest;
}

export type LifeAreaActivityMeta = {
  text: string;
  /** True once the area has been quiet for three weeks or more. */
  quiet: boolean;
};

/** "9 Sept" (year only when it isn't this year), or "{n} wks quiet" after 3+ weeks. */
export function lifeAreaActivityMeta(
  lastMs: number,
  now: Date = new Date(),
): LifeAreaActivityMeta | null {
  if (!lastMs) return null;
  const weeks = Math.floor((now.getTime() - lastMs) / WEEK_MS);
  if (weeks >= 3) return { text: `${weeks} wks quiet`, quiet: true };
  const d = new Date(lastMs);
  const sameYear = d.getFullYear() === now.getFullYear();
  const text = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return { text, quiet: false };
}

/** Deep link helpers for the life area workspace (readable `/manifest/<slug>`). */
export function lifeAreaHref(lifeAreaId: string): string {
  return lifeAreaHrefById(lifeAreaId);
}

export function lifeAreaStepHref(
  lifeAreaId: string,
  subtaskId: string,
): string {
  return `${lifeAreaHrefById(lifeAreaId)}?tab=steps&task=${encodeURIComponent(subtaskId)}`;
}

/**
 * Goals tab with a new goal started. Nothing is saved until the user confirms
 * in the existing "Add a goal…" field, which reads `newGoal` / `goalTitle`.
 */
export function newGoalHref(lifeAreaId: string, draftTitle?: string): string {
  const params = new URLSearchParams({ tab: "steps", newGoal: "1" });
  const title = draftTitle?.trim();
  if (title) params.set("goalTitle", title.slice(0, 200));
  return `${lifeAreaHref(lifeAreaId)}?${params.toString()}`;
}
