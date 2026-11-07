/**
 * Explicit Tracker "Doing" items — the only source for "what you're working on"
 * on cards, dashboard, and Focus. Inferred next-step helpers stay in place but
 * are no longer wired into these surfaces.
 */

import { lifeAreaHrefById, lifeAreaTrackerItemHref } from "@/lib/entity-href";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { loadPlanDreamsStore, type PlanDream } from "@/lib/plan-dreams";
import type { IdeateStoreV2 } from "@/lib/plan-ideate-store";
import {
  ensureTracker,
  itemsForArea,
  type TrackerItem,
} from "@/lib/tracker-items";

function touchedMs(item: TrackerItem): number {
  const t = Date.parse(item.lastTouchedAt || item.updatedAt || item.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/** Doing items in one life area, most recently marked first. */
export function doingItemsForLifeArea(
  store: IdeateStoreV2,
  lifeAreaId: string,
): TrackerItem[] {
  const tracked = ensureTracker(store);
  return itemsForArea(tracked, lifeAreaId)
    .filter((item) => item.status === "doing")
    .sort((a, b) => touchedMs(b) - touchedMs(a));
}

/** Doing across all non-demo life areas, most recently marked first. */
export function doingItemsAcrossLifeAreas(store: IdeateStoreV2): Array<{
  item: TrackerItem;
  dream: PlanDream;
}> {
  const tracked = ensureTracker(store);
  const dreams = (tracked.dreams.length ? tracked.dreams : loadPlanDreamsStore().dreams).filter(
    (d) => !isDemoIdeateDream(d),
  );
  const out: Array<{ item: TrackerItem; dream: PlanDream }> = [];
  for (const dream of dreams) {
    for (const item of doingItemsForLifeArea(tracked, dream.id)) {
      out.push({ item, dream });
    }
  }
  return out.sort((a, b) => touchedMs(b.item) - touchedMs(a.item));
}

/** Tracker tab — user picks / marks Doing themselves. */
export function trackerChooseHref(lifeAreaId: string): string {
  return lifeAreaHrefById(lifeAreaId, "tracker");
}

export function doingItemHref(
  dream: Pick<PlanDream, "id" | "title" | "urlSlug">,
  item: TrackerItem,
): string {
  return lifeAreaTrackerItemHref(dream, item);
}
