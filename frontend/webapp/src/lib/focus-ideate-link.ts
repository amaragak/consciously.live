/**
 * Build Focus session rows from Ideate + keep checkbox state shared.
 */

import {
  type FocusTaskItem,
  type FocusIdeateKind,
  writeFocusTasksList,
} from "@/lib/focus-timer-storage";
import { clearFocusSessionHandoff } from "@/lib/focus-session-handoff";
import {
  loadIdeateStore,
  recomputeSubtaskStatus,
  saveIdeateStore,
  todosForSubtask,
  upsertSubtask,
  upsertTodo,
  type IdeateStoreV2,
} from "@/lib/plan-ideate-store";
import { patchTrackerItem } from "@/lib/tracker-items";

export function newFocusTaskId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Focus rows for one life-area task (IdeateSubtask): nested todos, or the task itself if none. */
export function focusTasksFromIdeateSubtask(
  store: IdeateStoreV2,
  subtaskId: string,
): FocusTaskItem[] {
  const sub = store.subtasks.find((s) => s.id === subtaskId);
  if (!sub) return [];
  const area = store.dreams.find((d) => d.id === sub.projectId);
  const lifeAreaId = area?.id ?? null;
  const lifeAreaTitle = area?.title?.trim() || null;
  const todos = todosForSubtask(store, subtaskId);

  if (todos.length > 0) {
    return todos.map((todo) => ({
      id: newFocusTaskId(),
      text: todo.title.trim() || "(untitled)",
      done: todo.isChecked,
      lifeAreaId,
      lifeAreaTitle,
      ideateKind: "todo" as const,
      ideateId: todo.id,
      inSession: !todo.isChecked,
    }));
  }

  return [
    {
      id: newFocusTaskId(),
      text: sub.title.trim() || "(untitled)",
      done: sub.status === "done",
      lifeAreaId,
      lifeAreaTitle,
      ideateKind: "subtask" as const,
      ideateId: sub.id,
      inSession: sub.status !== "done",
    },
  ];
}

/** Seed Focus from tracker leaves, in tree order, without the old single-goal handoff. */
export function queueTrackerFocus(
  rows: { id: string; title: string; lifeAreaId: string; done?: boolean }[],
  minutes = 25,
): string {
  clearFocusSessionHandoff();
  const store = loadIdeateStore();
  const tasks: FocusTaskItem[] = rows.map((row) => {
    const area = store.dreams.find((dream) => dream.id === row.lifeAreaId);
    return {
      id: newFocusTaskId(),
      text: row.title.trim() || "(untitled)",
      done: Boolean(row.done),
      lifeAreaId: row.lifeAreaId,
      lifeAreaTitle: area?.title?.trim() || null,
      ideateKind: "tracker",
      ideateId: row.id,
      inSession: !row.done,
    };
  });
  writeFocusTasksList(tasks);
  return `/focus?minutes=${minutes}&autoStart=1`;
}

/** Apply Ideate check state onto linked Focus rows (keeps local free-text rows as-is). */
export function syncFocusDoneFromIdeate(
  tasks: FocusTaskItem[],
  store: IdeateStoreV2 = loadIdeateStore(),
): FocusTaskItem[] {
  let changed = false;
  const next = tasks.map((t) => {
    if (!t.ideateKind || !t.ideateId) return t;
    const done = ideateDoneForLink(store, t.ideateKind, t.ideateId);
    if (done === null || done === t.done) return t;
    changed = true;
    return { ...t, done, inSession: done ? false : t.inSession };
  });
  return changed ? next : tasks;
}

function ideateDoneForLink(
  store: IdeateStoreV2,
  kind: FocusIdeateKind,
  id: string,
): boolean | null {
  if (kind === "todo") {
    const todo = store.todos.find((t) => t.id === id);
    return todo ? todo.isChecked : null;
  }
  if (kind === "tracker") {
    const item = store.trackerItems?.find((row) => row.id === id);
    return item ? item.status === "done" : null;
  }
  const sub = store.subtasks.find((s) => s.id === id);
  return sub ? sub.status === "done" : null;
}

/**
 * Write Focus checkbox through to Ideate (and recompute parent task status).
 * Returns the updated store, or null if the link was missing.
 */
export function writeIdeateDoneFromFocus(
  kind: FocusIdeateKind,
  ideateId: string,
  done: boolean,
): IdeateStoreV2 | null {
  let store = loadIdeateStore();
  const now = new Date().toISOString();
  if (kind === "tracker") {
    const item = store.trackerItems?.find((row) => row.id === ideateId);
    if (!item) return null;
    store = patchTrackerItem(store, ideateId, { status: done ? "done" : null });
    saveIdeateStore(store);
    return store;
  }
  if (kind === "todo") {
    const todo = store.todos.find((t) => t.id === ideateId);
    if (!todo) return null;
    store = upsertTodo(store, {
      ...todo,
      isChecked: done,
      checkedAt: done ? now : null,
      wasUnchecked: todo.isChecked && !done,
    });
    store = recomputeSubtaskStatus(store, todo.subtaskId);
  } else {
    const sub = store.subtasks.find((s) => s.id === ideateId);
    if (!sub) return null;
    if (done) {
      store = upsertSubtask(store, {
        ...sub,
        status: "done",
        completedAt: now,
        completedManually: true,
      });
    } else {
      store = upsertSubtask(store, {
        ...sub,
        status: "in_progress",
        completedAt: null,
        completedManually: true,
      });
    }
  }
  saveIdeateStore(store);
  return store;
}
