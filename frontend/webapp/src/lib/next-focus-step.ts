/**
 * Next Focus step for the Manifesto card: the next incomplete step of the
 * most recently active goal across life areas.
 */

import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import {
  subtasksForProject,
  todosForSubtask,
  type IdeateStoreV2,
} from "@/lib/plan-ideate-store";

export type NextFocusStep = {
  lifeAreaTitle: string;
  goalTitle: string;
  stepTitle: string;
  done: number;
  total: number;
  subtaskId: string;
};

function ts(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function nextFocusStep(store: IdeateStoreV2): NextFocusStep | null {
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
