/**
 * Life-area tracker: one tree of items. Goals and steps migrate in with their ids.
 */

import {
  loadIdeateStore,
  saveIdeateStore,
  upsertSubtask,
  upsertTodo,
  type IdeateStoreV2,
  type IdeateSubtask,
  type IdeateTodo,
} from "@/lib/plan-ideate-store";
import type { PlanDream } from "@/lib/plan-dreams";

export type TrackerKind = "goal" | "project" | "feature" | "task";
export type TrackerStatus = "not_started" | "doing" | "waiting" | "done";

export type TrackerItem = {
  id: string;
  lifeAreaId: string;
  parentId: string | null;
  sortKey: string;
  title: string;
  kind: TrackerKind | null;
  status: TrackerStatus | null;
  waitingOn: string | null;
  due: string | null;
  plan: string | null;
  pinned: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastTouchedAt: string;
};

const KINDS: TrackerKind[] = ["goal", "project", "feature", "task"];
const STATUSES: TrackerStatus[] = ["not_started", "doing", "waiting", "done"];

export function parseTrackerItems(raw: unknown): TrackerItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackerItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.lifeAreaId !== "string") continue;
    const title = typeof o.title === "string" ? o.title : "";
    const now = new Date().toISOString();
    const kind = KINDS.includes(o.kind as TrackerKind) ? (o.kind as TrackerKind) : null;
    const status = STATUSES.includes(o.status as TrackerStatus)
      ? (o.status as TrackerStatus)
      : null;
    out.push({
      id: o.id,
      lifeAreaId: o.lifeAreaId,
      parentId: typeof o.parentId === "string" ? o.parentId : null,
      sortKey: typeof o.sortKey === "string" ? o.sortKey : "1024",
      title,
      kind,
      status,
      waitingOn: typeof o.waitingOn === "string" ? o.waitingOn : null,
      due: typeof o.due === "string" ? o.due : null,
      plan: typeof o.plan === "string" ? o.plan : null,
      pinned: o.pinned === true,
      completedAt: typeof o.completedAt === "string" ? o.completedAt : null,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
      lastTouchedAt: typeof o.lastTouchedAt === "string" ? o.lastTouchedAt : now,
    });
  }
  return out.slice(0, 4000);
}

function statusFromSubtask(status: IdeateSubtask["status"]): TrackerStatus {
  if (status === "done") return "done";
  if (status === "in_progress") return "doing";
  return "not_started";
}

/** Build the tree once from goals and steps. Existing ids stay so links keep working. */
export function migrateTrackerItems(store: IdeateStoreV2): TrackerItem[] {
  const items: TrackerItem[] = [];
  const dreams = new Map(store.dreams.map((d) => [d.id, d]));
  store.subtasks.forEach((sub, index) => {
    const dream = dreams.get(sub.projectId);
    items.push({
      id: sub.id,
      lifeAreaId: sub.projectId,
      parentId: null,
      sortKey: String((index + 1) * 1024),
      title: sub.title,
      kind: "goal",
      status: statusFromSubtask(sub.status),
      waitingOn: null,
      due: null,
      plan: sub.dreamText?.trim() || null,
      pinned: dream?.overviewGoalId === sub.id,
      completedAt: sub.completedAt,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
      lastTouchedAt: sub.updatedAt,
    });
    const todos = store.todos
      .filter((t) => t.subtaskId === sub.id)
      .sort((a, b) => a.order - b.order);
    todos.forEach((todo, i) => {
      items.push({
        id: todo.id,
        lifeAreaId: sub.projectId,
        parentId: sub.id,
        sortKey: String((i + 1) * 1024),
        title: todo.title,
        kind: null,
        status: todo.isChecked ? "done" : null,
        waitingOn: null,
        due: null,
        plan: null,
        pinned: false,
        completedAt: todo.checkedAt,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        lastTouchedAt: todo.checkedAt ?? sub.updatedAt,
      });
    });
  });
  return items;
}

export function ensureTracker(store: IdeateStoreV2): IdeateStoreV2 {
  if (Array.isArray(store.trackerItems)) return store;
  return { ...store, trackerItems: migrateTrackerItems(store) };
}

export function itemsForArea(store: IdeateStoreV2, lifeAreaId: string): TrackerItem[] {
  return (store.trackerItems ?? []).filter((item) => item.lifeAreaId === lifeAreaId);
}

export function childrenOf(items: TrackerItem[], parentId: string | null): TrackerItem[] {
  return items
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => Number(a.sortKey) - Number(b.sortKey) || a.title.localeCompare(b.title));
}

export function descendantsOf(items: TrackerItem[], id: string): TrackerItem[] {
  const out: TrackerItem[] = [];
  const walk = (parentId: string) => {
    for (const child of childrenOf(items, parentId)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

export function leavesOf(items: TrackerItem[], id: string): TrackerItem[] {
  const kids = childrenOf(items, id);
  if (kids.length === 0) {
    const self = items.find((item) => item.id === id);
    return self ? [self] : [];
  }
  return kids.flatMap((child) => leavesOf(items, child.id));
}

export type TrackerRollup = {
  leaves: number;
  doneLeaves: number;
  openLeaves: number;
  doing: number;
  tickable: boolean;
  progress: number;
};

export function rollup(items: TrackerItem[], id: string): TrackerRollup {
  const self = items.find((item) => item.id === id);
  const kids = childrenOf(items, id);
  if (!self) {
    return { leaves: 0, doneLeaves: 0, openLeaves: 0, doing: 0, tickable: false, progress: 0 };
  }
  if (kids.length === 0) {
    const tickable = self.status != null;
    const done = self.status === "done";
    return {
      leaves: 1,
      doneLeaves: done ? 1 : 0,
      openLeaves: done ? 0 : 1,
      doing: self.status === "doing" ? 1 : 0,
      tickable,
      progress: done ? 1 : 0,
    };
  }
  const leaves = leavesOf(items, id);
  const doneLeaves = leaves.filter((leaf) => leaf.status === "done").length;
  const doing = leaves.filter((leaf) => leaf.status === "doing").length;
  const tickable = leaves.some((leaf) => leaf.status != null);
  return {
    leaves: leaves.length,
    doneLeaves,
    openLeaves: leaves.length - doneLeaves,
    doing,
    tickable,
    progress: leaves.length ? doneLeaves / leaves.length : 0,
  };
}

export function openItemCount(items: TrackerItem[]): number {
  return items.filter((item) => item.parentId == null && item.status !== "done").length === 0
    ? items.filter((item) => item.status !== "done").length
    : items.filter((item) => item.status !== "done").length;
}

export function inFocusItem(store: IdeateStoreV2, dream: PlanDream): TrackerItem | null {
  const items = itemsForArea(store, dream.id);
  const pinned = items.find((item) => item.pinned && item.parentId == null && item.status !== "done");
  if (pinned) return pinned;
  const goals = items
    .filter((item) => item.parentId == null && item.kind === "goal" && item.status !== "done")
    .sort((a, b) => Date.parse(b.lastTouchedAt) - Date.parse(a.lastTouchedAt));
  if (goals[0]) return goals[0];
  const top = items
    .filter((item) => item.parentId == null && item.status !== "done")
    .sort((a, b) => Date.parse(b.lastTouchedAt) - Date.parse(a.lastTouchedAt));
  return top[0] ?? null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function newTrackerId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sortBetween(before: string | null, after: string | null): string {
  const lo = before == null ? 0 : Number(before);
  const hi = after == null ? lo + 2048 : Number(after);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 0.0001) {
    return String((Number.isFinite(lo) ? lo : 0) + 1024);
  }
  return String((lo + hi) / 2);
}

function touch(item: TrackerItem, patch: Partial<TrackerItem>): TrackerItem {
  const now = nowIso();
  return { ...item, ...patch, updatedAt: now, lastTouchedAt: now };
}

function mirrorLegacy(store: IdeateStoreV2, item: TrackerItem): IdeateStoreV2 {
  const sub = store.subtasks.find((row) => row.id === item.id);
  if (sub) {
    const status: IdeateSubtask["status"] =
      item.status === "done" ? "done" : item.status === "doing" ? "in_progress" : "not_started";
    return upsertSubtask(store, {
      ...sub,
      title: item.title,
      dreamText: item.plan ?? sub.dreamText,
      status,
      completedAt: item.status === "done" ? item.completedAt : null,
    });
  }
  const todo = store.todos.find((row) => row.id === item.id);
  if (todo) {
    const next: IdeateTodo = {
      ...todo,
      title: item.title,
      isChecked: item.status === "done",
      checkedAt: item.status === "done" ? item.completedAt : null,
    };
    return upsertTodo(store, next);
  }
  return store;
}

function writeItems(store: IdeateStoreV2, items: TrackerItem[]): IdeateStoreV2 {
  return { ...store, trackerItems: items };
}

export function patchTrackerItem(
  store: IdeateStoreV2,
  id: string,
  patch: Partial<TrackerItem>,
): IdeateStoreV2 {
  const items = store.trackerItems ?? [];
  const current = items.find((item) => item.id === id);
  if (!current) return store;
  let next = touch(current, patch);
  if (patch.status === "done" && current.status !== "done") {
    next = { ...next, completedAt: nowIso() };
  }
  if (patch.status && patch.status !== "done") {
    next = { ...next, completedAt: null };
  }
  if (patch.pinned === true) {
    const cleared = items.map((item) =>
      item.lifeAreaId === current.lifeAreaId && item.id !== id ? { ...item, pinned: false } : item,
    );
    const replaced = cleared.map((item) => (item.id === id ? next : item));
    let out = writeItems(store, replaced);
    out = mirrorLegacy(out, next);
    if (next.parentId == null) {
      out = {
        ...out,
        dreams: out.dreams.map((dream) =>
          dream.id === next.lifeAreaId ? { ...dream, overviewGoalId: next.id } : dream,
        ),
      };
    }
    return out;
  }
  const replaced = items.map((item) => (item.id === id ? next : item));
  return mirrorLegacy(writeItems(store, replaced), next);
}

export function addTrackerItem(
  store: IdeateStoreV2,
  input: {
    lifeAreaId: string;
    parentId: string | null;
    title?: string;
    kind?: TrackerKind | null;
    afterId?: string | null;
  },
): { store: IdeateStoreV2; id: string } {
  const items = store.trackerItems ?? [];
  const siblings = childrenOf(
    items.filter((item) => item.lifeAreaId === input.lifeAreaId),
    input.parentId,
  );
  const afterIndex = input.afterId ? siblings.findIndex((item) => item.id === input.afterId) : siblings.length - 1;
  const before = afterIndex >= 0 ? siblings[afterIndex]?.sortKey ?? null : null;
  const after = afterIndex >= 0 ? siblings[afterIndex + 1]?.sortKey ?? null : siblings[0]?.sortKey ?? null;
  const sortKey =
    input.afterId == null && siblings.length
      ? String(Number(siblings[siblings.length - 1]!.sortKey) + 1024)
      : input.afterId == null
        ? "1024"
        : sortBetween(before, after);
  const now = nowIso();
  const id = newTrackerId();
  const item: TrackerItem = {
    id,
    lifeAreaId: input.lifeAreaId,
    parentId: input.parentId,
    sortKey,
    title: input.title ?? "",
    kind: input.kind ?? null,
    status: null,
    waitingOn: null,
    due: null,
    plan: null,
    pinned: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    lastTouchedAt: now,
  };
  return { store: writeItems(store, [...items, item]), id };
}

export function deleteTrackerItem(store: IdeateStoreV2, id: string): IdeateStoreV2 {
  const items = store.trackerItems ?? [];
  const drop = new Set([id, ...descendantsOf(items, id).map((item) => item.id)]);
  return writeItems(
    store,
    items.filter((item) => !drop.has(item.id)),
  );
}

export function moveTrackerItem(
  store: IdeateStoreV2,
  id: string,
  parentId: string | null,
  beforeId: string | null,
): IdeateStoreV2 {
  const items = store.trackerItems ?? [];
  const item = items.find((row) => row.id === id);
  if (!item) return store;
  if (parentId === id || descendantsOf(items, id).some((row) => row.id === parentId)) return store;
  const siblings = childrenOf(
    items.filter((row) => row.lifeAreaId === item.lifeAreaId && row.id !== id),
    parentId,
  );
  const index = beforeId ? siblings.findIndex((row) => row.id === beforeId) : siblings.length;
  const prev = index > 0 ? siblings[index - 1]?.sortKey ?? null : null;
  const next = index >= 0 && index < siblings.length ? siblings[index]?.sortKey ?? null : null;
  const sortKey = sortBetween(prev, next ?? (prev ? String(Number(prev) + 2048) : null));
  const moved = touch(item, { parentId, sortKey });
  return writeItems(
    store,
    items.map((row) => (row.id === id ? moved : row)),
  );
}

/** Ticking a parent marks every item under it. Ticking a leaf sets done, or clears it when it had no status. */
export function toggleTrackerDone(store: IdeateStoreV2, id: string): IdeateStoreV2 {
  const items = store.trackerItems ?? [];
  const item = items.find((row) => row.id === id);
  if (!item) return store;
  const kids = descendantsOf(items, id);
  const now = nowIso();
  if (kids.length > 0) {
    const ids = new Set([id, ...kids.map((row) => row.id)]);
    const marking = item.status !== "done";
    let next = writeItems(
      store,
      items.map((row) => {
        if (!ids.has(row.id)) return row;
        return {
          ...row,
          status: marking ? "done" : null,
          completedAt: marking ? now : null,
          updatedAt: now,
          lastTouchedAt: now,
        };
      }),
    );
    const updated = next.trackerItems?.find((row) => row.id === id);
    if (updated) next = mirrorLegacy(next, updated);
    for (const child of kids) {
      const row = next.trackerItems?.find((entry) => entry.id === child.id);
      if (row) next = mirrorLegacy(next, row);
    }
    return next;
  }
  if (item.status == null) return patchTrackerItem(store, id, { status: "done" });
  if (item.status === "done") return patchTrackerItem(store, id, { status: null });
  return patchTrackerItem(store, id, { status: "done" });
}

export function moveTrackerToArea(
  store: IdeateStoreV2,
  id: string,
  lifeAreaId: string,
): IdeateStoreV2 {
  const items = store.trackerItems ?? [];
  const ids = new Set([id, ...descendantsOf(items, id).map((item) => item.id)]);
  return writeItems(
    store,
    items.map((item) => {
      if (!ids.has(item.id)) return item;
      if (item.id === id) return touch(item, { lifeAreaId, parentId: null, pinned: false });
      return touch(item, { lifeAreaId, pinned: false });
    }),
  );
}

export function duplicateTrackerItem(store: IdeateStoreV2, id: string): IdeateStoreV2 {
  const items = store.trackerItems ?? [];
  const item = items.find((row) => row.id === id);
  if (!item) return store;
  const copyTree = (sourceId: string, parentId: string | null, bucket: TrackerItem[]) => {
    const source = items.find((row) => row.id === sourceId);
    if (!source) return;
    const created = addTrackerItem(
      { ...store, trackerItems: [...items, ...bucket] },
      {
        lifeAreaId: source.lifeAreaId,
        parentId,
        title: sourceId === id ? `${source.title} copy` : source.title,
        kind: source.kind,
        afterId: sourceId === id ? id : null,
      },
    );
    const added = created.store.trackerItems?.find((row) => row.id === created.id);
    if (!added) return;
    bucket.push({
      ...added,
      status: source.status,
      waitingOn: source.waitingOn,
      due: source.due,
      plan: source.plan,
    });
    for (const child of childrenOf(items, sourceId)) copyTree(child.id, created.id, bucket);
  };
  const bucket: TrackerItem[] = [];
  copyTree(id, item.parentId, bucket);
  return writeItems(store, [...items, ...bucket]);
}

export function commitTracker(recipe: (store: IdeateStoreV2) => IdeateStoreV2): IdeateStoreV2 {
  const next = recipe(ensureTracker(loadIdeateStore()));
  saveIdeateStore(next);
  return next;
}

export function relativeTouched(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const days = Math.round((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dueLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
