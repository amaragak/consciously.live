/**
 * Readable href builders for Heal items and Manifest life areas.
 * IDs stay in storage; these only shape the browser URL.
 */

import {
  contentTitleSlug,
  looksLikeUuid,
  uniquifySlug,
} from "@/lib/readable-url";
import { loadHealStore, type HealItem } from "@/lib/heal-store";
import { loadPlanDreamsStore, type PlanDream } from "@/lib/plan-dreams";

function takenSlugs(
  items: Array<{ id: string; urlSlug?: string; urlSlugHistory?: string[] }>,
  exceptId?: string,
): Set<string> {
  const taken = new Set<string>();
  for (const it of items) {
    if (exceptId && it.id === exceptId) continue;
    if (it.urlSlug) taken.add(it.urlSlug);
    for (const h of it.urlSlugHistory ?? []) taken.add(h);
  }
  return taken;
}

export function ensureEntityUrlSlug<
  T extends { id: string; title: string; urlSlug?: string; urlSlugHistory?: string[] },
>(items: T[], id: string): { items: T[]; item: T | null } {
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return { items, item: null };
  const item = items[idx]!;
  const desired = contentTitleSlug(item.title, undefined);
  const nextSlug = uniquifySlug(
    desired,
    takenSlugs(items, item.id),
    item.urlSlug,
  );
  if (item.urlSlug === nextSlug) return { items, item };
  const history = [...(item.urlSlugHistory ?? [])];
  if (item.urlSlug && !history.includes(item.urlSlug)) history.unshift(item.urlSlug);
  const updated = {
    ...item,
    urlSlug: nextSlug,
    urlSlugHistory: history.slice(0, 24),
  } as T;
  const next = items.slice();
  next[idx] = updated;
  return { items: next, item: updated };
}

export function findEntityByPathSlug<
  T extends { id: string; urlSlug?: string; urlSlugHistory?: string[] },
>(items: T[], raw: string): T | null {
  const key = decodeURIComponent(raw).trim().toLowerCase();
  if (!key) return null;
  if (looksLikeUuid(key) || key.startsWith("heal_") || key.startsWith("dream_")) {
    return items.find((x) => x.id === key || x.id.toLowerCase() === key) ?? null;
  }
  return (
    items.find((x) => x.urlSlug?.toLowerCase() === key) ??
    items.find((x) =>
      (x.urlSlugHistory ?? []).some((h) => h.toLowerCase() === key),
    ) ??
    null
  );
}

export function healItemHref(item: Pick<HealItem, "id" | "title" | "urlSlug">): string {
  const slug = item.urlSlug || contentTitleSlug(item.title) || item.id;
  return `/heal/${encodeURIComponent(slug)}`;
}

export function lifeAreaHref(
  dream: Pick<PlanDream, "id" | "title" | "urlSlug">,
  rest = "",
): string {
  const slug = dream.urlSlug || contentTitleSlug(dream.title) || dream.id;
  const base = `/manifest/${encodeURIComponent(slug)}`;
  if (!rest) return base;
  return `${base}/${rest.replace(/^\//, "")}`;
}

/** Prefer readable slug; falls back to legacy `/manifest/goal/<id>` only if missing. */
export function lifeAreaHrefById(lifeAreaId: string, rest = ""): string {
  const dream = loadPlanDreamsStore().dreams.find((d) => d.id === lifeAreaId);
  if (dream) return lifeAreaHref(dream, rest);
  const base = `/manifest/goal/${encodeURIComponent(lifeAreaId)}`;
  return rest ? `${base}/${rest.replace(/^\//, "")}` : base;
}

export function healItemHrefById(itemId: string, rest = ""): string {
  const item = loadHealStore().items.find((x) => x.id === itemId);
  if (item) {
    const base = healItemHref(item);
    return rest ? `${base}/${rest.replace(/^\//, "")}` : base;
  }
  const base = `/heal/${encodeURIComponent(itemId)}`;
  return rest ? `${base}/${rest.replace(/^\//, "")}` : base;
}

/** Nested tracker item under a life area (title slug, not storage id). */
export function lifeAreaTrackerItemHref(
  dream: Pick<PlanDream, "id" | "title" | "urlSlug">,
  item: Pick<{ id: string; title: string; urlSlug?: string }, "id" | "title" | "urlSlug">,
): string {
  const slug = item.urlSlug || contentTitleSlug(item.title) || item.id;
  return lifeAreaHref(dream, `tracker/${encodeURIComponent(slug)}`);
}
