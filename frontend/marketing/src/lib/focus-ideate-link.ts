/**
 * Build Focus session rows from Ideate + keep checkbox state shared.
 */

import {
  type FocusTaskItem,
  type FocusIdeateKind,
} from "@/lib/focus-timer-storage";
import {
  loadIdeateStore,
  recomputeSubtaskStatus,
  saveIdeateStore,
  todosForSubtask,
  upsertSubtask,
  upsertTodo,
  type IdeateStoreV2,
} from "@/lib/plan-ideate-store";

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
    },
  ];
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
    return { ...t, done };
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
