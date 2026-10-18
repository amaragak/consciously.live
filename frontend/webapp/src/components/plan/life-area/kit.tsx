import type { DrvTimelineEntry, PlanDream, ThoughtKind } from "@/lib/plan-dreams";
import {
  loadIdeateStore,
  saveIdeateStore,
  type IdeateStoreV2,
  type IdeateSubtask,
  type IdeateTodo,
} from "@/lib/plan-ideate-store";

export const AREA_LABEL =
  "text-[10px] font-semibold uppercase tracking-[1.5px] text-accent-link";

export const MIST =
  "accent-fill-gradient inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

export const OUTLINE =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-card font-semibold text-foreground transition-colors hover:border-accent/40";

export function textHash(value: string): string {
  let h = 5381;
  const s = value.trim();
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) + h + s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export function commitIdeate(
  fn: (store: IdeateStoreV2) => IdeateStoreV2,
): IdeateStoreV2 {
  const next = fn(loadIdeateStore());
  saveIdeateStore(next);
  return next;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function obstacleChips(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed
    .split(/\n+/)
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 8);
  const parts = trimmed
    .split(/[;•]|(?:,\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  if (parts.length > 1) return parts.slice(0, 8);
  return [trimmed.length > 48 ? `${trimmed.slice(0, 46)}…` : trimmed];
}

export function areaThoughts(dream: PlanDream): DrvTimelineEntry[] {
  return [
    ...(dream.dreamEntries ?? []),
    ...(dream.obstacleEntries ?? []),
    ...(dream.visionEntries ?? []),
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function thoughtSource(
  dream: PlanDream,
  id: string,
): "dreamEntries" | "obstacleEntries" | "visionEntries" | null {
  if ((dream.dreamEntries ?? []).some((e) => e.id === id)) return "dreamEntries";
  if ((dream.obstacleEntries ?? []).some((e) => e.id === id))
    return "obstacleEntries";
  if ((dream.visionEntries ?? []).some((e) => e.id === id)) return "visionEntries";
  return null;
}

export type GoalProgress = {
  goal: IdeateSubtask;
  todos: IdeateTodo[];
  done: number;
  total: number;
  next: IdeateTodo | null;
  lastDone: IdeateTodo | null;
};

export function progressFor(
  store: IdeateStoreV2,
  goal: IdeateSubtask,
): GoalProgress {
  const todos = store.todos
    .filter((t) => t.subtaskId === goal.id)
    .sort((a, b) => a.order - b.order);
  const done = todos.filter((t) => t.isChecked).length;
  const next = todos.find((t) => !t.isChecked) ?? null;
  const doneRows = todos.filter((t) => t.isChecked);
  const lastDone = doneRows.length ? doneRows[doneRows.length - 1]! : null;
  return { goal, todos, done, total: todos.length, next, lastDone };
}

export function goalsForArea(
  store: IdeateStoreV2,
  dream: PlanDream,
): IdeateSubtask[] {
  const rows = store.subtasks.filter((s) => s.projectId === dream.id);
  const order = dream.goalOrder ?? [];
  return [...rows].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      if (ia !== ib) return ia - ib;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function activeOverviewGoal(
  store: IdeateStoreV2,
  dream: PlanDream,
): GoalProgress | null {
  const goals = goalsForArea(store, dream).filter((g) => g.status !== "done");
  const pinned = dream.overviewGoalId
    ? goals.find((g) => g.id === dream.overviewGoalId)
    : null;
  const goal =
    pinned ??
    [...goals].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
  return goal ? progressFor(store, goal) : null;
}

export function guessThoughtKind(text: string): ThoughtKind {
  const t = text.toLowerCase();
  if (/\b(won|win|proud|finished|did it|breakthrough)\b/.test(t)) return "win";
  if (/\b(stuck|can't|cannot|blocked|afraid|fear)\b/.test(t))
    return "hard_blocker";
  if (/\b(don't want|avoid|resist|procrastinat)\b/.test(t)) return "resistance";
  if (/\b(realise|realize|notice|pattern|insight)\b/.test(t)) return "insight";
  if (/\?/.test(t) || /\b(why|what if|should i)\b/.test(t)) return "question";
  if (/\b(i will|i'm going to|intend|tomorrow)\b/.test(t)) return "intention";
  if (/\b(progress|moved|step|practised|practiced)\b/.test(t)) return "progress";
  return "insight";
}

export function capWords(text: string, max: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return `${words.slice(0, max).join(" ")}…`;
}

/** Bold and italic markdown, with leftover asterisks removed. */
export function InsightText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\*/g, "");
  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function ProgressBar({
  done,
  total,
  className = "",
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span
      className={`block h-1.5 overflow-hidden rounded-full bg-border ${className}`}
      aria-hidden
    >
      <span
        className="block h-full rounded-full bg-accent"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
