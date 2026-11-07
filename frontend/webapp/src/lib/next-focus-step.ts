/**
 * Focus suggestion for Manifesto cards.
 *
 * Only explicit Tracker Doing items. The old Ideate-todo inference is kept
 * commented below so we can restore it if needed — it must not run.
 */

import { doingItemsAcrossLifeAreas } from "@/lib/life-area-doing";
import type { IdeateStoreV2 } from "@/lib/plan-ideate-store";
import type { TrackerItem } from "@/lib/tracker-items";

export type NextFocusStep = {
  lifeAreaTitle: string;
  goalTitle: string;
  stepTitle: string;
  done: number;
  total: number;
  /** Ideate subtask id — empty when suggestion is a Tracker Doing item. */
  subtaskId: string;
  /** Tracker Doing item when the suggestion is explicit. */
  trackerItem?: TrackerItem;
  lifeAreaId?: string;
};

/*
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { subtasksForProject, todosForSubtask } from "@/lib/plan-ideate-store";

function ts(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Legacy: next incomplete step of the most recently active goal. *
export function nextFocusStepInferred(store: IdeateStoreV2): NextFocusStep | null {
  const dreams = store.dreams.filter((dream) => !isDemoIdeateDream(dream));
  let best: { updatedAt: string; projectId: string; id: string; title: string } | null =
    null;
  for (const dream of dreams) {
    for (const sub of subtasksForProject(store, dream.id)) {
      if (sub.status === "done") continue;
      if (!best || ts(sub.updatedAt) > ts(best.updatedAt)) {
        best = {
          updatedAt: sub.updatedAt,
          projectId: sub.projectId,
          id: sub.id,
          title: sub.title,
        };
      }
    }
  }
  if (!best) return null;
  const dream = dreams.find((row) => row.id === best.projectId);
  const todos = todosForSubtask(store, best.id);
  const next = todos.find((todo) => !todo.isChecked);
  const done = todos.filter((todo) => todo.isChecked).length;
  return {
    lifeAreaTitle: dream?.title.trim() || "Life area",
    goalTitle: best.title.trim() || "Goal",
    stepTitle: next?.title.trim() || best.title.trim() || "Next step",
    done: todos.length > 0 ? done : 0,
    total: todos.length > 0 ? todos.length : 1,
    subtaskId: best.id,
  };
}
*/

/** Most recently marked Doing item across life areas, or null. */
export function nextFocusStep(store: IdeateStoreV2): NextFocusStep | null {
  const doing = doingItemsAcrossLifeAreas(store);
  const top = doing[0];
  if (!top) return null;
  const { item, dream } = top;
  return {
    lifeAreaTitle: dream.title.trim() || "Life area",
    goalTitle: dream.title.trim() || "Life area",
    stepTitle: item.title.trim() || "Untitled",
    done: 0,
    total: doing.length,
    subtaskId: "",
    trackerItem: item,
    lifeAreaId: dream.id,
  };
}
