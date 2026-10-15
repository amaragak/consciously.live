/**
 * Focus / Meditate shortcuts on a Manifesto life-area card. They reuse the
 * handoffs the life-area workspace and goal cards already write.
 */

import {
  focusMyHrefFromIdeate,
  writeFocusSessionHandoff,
} from "@/lib/focus-session-handoff";
import { writeFocusActiveIdeateSubtask } from "@/lib/focus-preflight-link";
import {
  writePlanCreateHandoff,
  type PlanCreateHandoffV2,
} from "@/lib/plan-create-handoff";
import {
  loadIdeateStore,
  saveIdeateStore,
  upsertDream,
} from "@/lib/plan-ideate-store";
import { activeResistanceThemesForProject } from "@/lib/plan-resistance-threads";

/** Same as "Start focus session" on a goal: returns the Focus href. */
export function startLifeAreaFocus(subtaskId: string): string {
  writeFocusSessionHandoff({ v: 1, subtaskId });
  writeFocusActiveIdeateSubtask(subtaskId);
  return focusMyHrefFromIdeate();
}

/** Same handoff as "Generate meditation" in the workspace: returns the Create href. */
export function startLifeAreaMeditation(
  lifeAreaId: string,
  fallbackTitle?: string,
): string | null {
  let store = loadIdeateStore();
  const dream = store.dreams.find((d) => d.id === lifeAreaId);
  if (!dream) return null;
  const vision =
    dream.visionText.trim() ||
    dream.dreamText.trim() ||
    fallbackTitle?.trim() ||
    dream.title.trim();
  if (!vision) return null;

  const themes = activeResistanceThemesForProject(store, dream.id);
  const handoff: PlanCreateHandoffV2 = {
    v: 2,
    goalTitle: dream.title.trim() || "My project",
    visionText: vision,
    dreamText: dream.dreamText.trim() || undefined,
    obstacleText: dream.obstacleText.trim() || undefined,
    lifeAreaId: dream.id,
    project: {
      dreamText: dream.dreamText.trim(),
      resistanceText: dream.obstacleText.trim(),
      visionText: vision,
    },
    activeResistanceThemes: themes.map((t) => ({
      category: t.category,
      sampleText: t.sampleText,
      level: t.level,
      occurrences: t.occurrences,
    })),
  };
  writePlanCreateHandoff(handoff);
  store = upsertDream(store, {
    ...dream,
    meditationsGenerated: dream.meditationsGenerated + 1,
  });
  saveIdeateStore(store);
  return "/meditate/create?step=shape&fromDream=1&seed=goal";
}
