/**
 * Meditate / Journal guides: database-backed (public API) with a small
 * in-memory cache + React hooks. The original static copy lives on as
 * `STATIC_GUIDE_SEED`, used only by the admin "Seed from static" action.
 */

import { useEffect, useState } from "react";
import {
  fetchPublicGuide,
  fetchPublicGuides,
  type AdminGuideSeed,
  type GuideArea,
  type GuideStatus,
  type PublicGuide,
  type PublicGuideListItem,
} from "@/lib/medimade-api";

export type { GuideArea };

/** UI shape used by cards, overviews and the reader. */
export type Guide = {
  slug: string;
  title: string;
  category: string;
  readMinutes: number;
  /** Cover URL (API `coverImageUrl`), or a bundled fallback when unset. */
  image: string;
  order: number;
  area: GuideArea;
  summary?: string;
  status?: GuideStatus;
  practiceBrief?: string;
  body?: string;
  updatedAt?: string;
  id?: string;
  helpfulYes?: number;
  helpfulNo?: number;
};

const HERO = "/patterns/hero";

/** Used when a guide has no uploaded cover. */
export const GUIDE_FALLBACK_IMAGE = `${HERO}/adobestock-2055049378.webp`;

export function guidesBasePath(area: GuideArea): string {
  return area === "journal" ? "/journal/guides" : "/meditate/guides";
}

// ---------------------------------------------------------------------------
// API → UI mapping
// ---------------------------------------------------------------------------

export function toUiGuide(g: PublicGuideListItem | PublicGuide): Guide {
  const full = g as Partial<PublicGuide>;
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    category: g.category,
    readMinutes: g.readMinutes,
    image: g.coverImageUrl || GUIDE_FALLBACK_IMAGE,
    order: g.order,
    area: g.area,
    summary: g.summary || undefined,
    practiceBrief: g.practiceBrief || undefined,
    updatedAt: g.updatedAt || undefined,
    ...(full.body !== undefined ? { body: full.body } : {}),
    ...(full.status ? { status: full.status } : {}),
    ...(full.helpfulYes !== undefined ? { helpfulYes: full.helpfulYes } : {}),
    ...(full.helpfulNo !== undefined ? { helpfulNo: full.helpfulNo } : {}),
  };
}

function sortGuides(list: Guide[]): Guide[] {
  return [...list].sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  );
}

/** Up to `limit` other guides; same category first, then the rest by order. */
export function otherGuides(
  guides: Guide[],
  slug: string,
  category: string,
  limit = 3,
): Guide[] {
  const key = slug.trim().toLowerCase();
  const cat = category.trim().toLowerCase();
  const rest = sortGuides(guides).filter((g) => g.slug !== key);
  const same = rest.filter((g) => g.category.trim().toLowerCase() === cat);
  const other = rest.filter((g) => g.category.trim().toLowerCase() !== cat);
  return [...same, ...other].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Cache + subscriptions
// ---------------------------------------------------------------------------

const listCache = new Map<GuideArea, Guide[]>();
const listInflight = new Map<GuideArea, Promise<Guide[]>>();
const detailCache = new Map<string, Guide>();
const detailInflight = new Map<string, Promise<Guide | null>>();
const listeners = new Set<() => void>();

function detailKey(area: GuideArea, slug: string): string {
  return `${area}/${slug.trim().toLowerCase()}`;
}

function notify() {
  for (const fn of listeners) fn();
}

/** Notified whenever the guide cache changes (e.g. breadcrumb title resolved). */
export function subscribeGuides(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Drop cached guides (call after admin edits). */
export function invalidateGuidesCache(): void {
  listCache.clear();
  detailCache.clear();
  notify();
}

export async function loadGuides(area: GuideArea): Promise<Guide[]> {
  const inflight = listInflight.get(area);
  if (inflight) return inflight;
  const p = fetchPublicGuides(area)
    .then((items) => {
      const list = sortGuides(items.map(toUiGuide));
      listCache.set(area, list);
      notify();
      return list;
    })
    .finally(() => {
      listInflight.delete(area);
    });
  listInflight.set(area, p);
  return p;
}

export async function loadGuide(
  area: GuideArea,
  slug: string,
): Promise<Guide | null> {
  const key = detailKey(area, slug);
  const inflight = detailInflight.get(key);
  if (inflight) return inflight;
  const p = fetchPublicGuide(area, slug.trim().toLowerCase())
    .then((g) => {
      if (!g) {
        detailCache.delete(key);
        return null;
      }
      const ui = toUiGuide(g);
      detailCache.set(key, ui);
      notify();
      return ui;
    })
    .finally(() => {
      detailInflight.delete(key);
    });
  detailInflight.set(key, p);
  return p;
}

/** Sync lookup of anything already fetched (detail first, then list). */
export function peekGuide(slug: string, area: GuideArea): Guide | null {
  const key = slug.trim().toLowerCase();
  return (
    detailCache.get(detailKey(area, key)) ??
    listCache.get(area)?.find((g) => g.slug === key) ??
    null
  );
}

/** "my-slug-here" → "My slug here" (breadcrumb fallback before fetch lands). */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

/** Best title for a guide slug without waiting on the network. */
export function peekGuideTitle(slug: string, area: GuideArea): string {
  return peekGuide(slug, area)?.title ?? titleFromSlug(slug);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Published guides for an area. Empty while loading (cached copy shows first). */
export function useGuides(area: GuideArea): {
  guides: Guide[];
  loading: boolean;
  error: boolean;
} {
  const [guides, setGuides] = useState<Guide[]>(
    () => listCache.get(area) ?? [],
  );
  const [loading, setLoading] = useState(() => !listCache.has(area));
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGuides(listCache.get(area) ?? []);
    setLoading(!listCache.has(area));
    setError(false);
    loadGuides(area)
      .then((list) => {
        if (!cancelled) setGuides(list);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [area]);

  return { guides, loading, error };
}

/** One published guide by area + slug. `guide` is null while loading / missing. */
export function useGuide(
  area: GuideArea,
  slug: string,
): { guide: Guide | null; loading: boolean; notFound: boolean; error: boolean } {
  const key = detailKey(area, slug);
  const [guide, setGuide] = useState<Guide | null>(
    () => detailCache.get(key) ?? null,
  );
  const [loading, setLoading] = useState(() => !detailCache.has(key));
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGuide(detailCache.get(key) ?? null);
    setLoading(!detailCache.has(key));
    setNotFound(false);
    setError(false);
    loadGuide(area, slug)
      .then((g) => {
        if (cancelled) return;
        setGuide(g);
        setNotFound(!g);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [area, slug, key]);

  return { guide, loading, notFound, error };
}

// ---------------------------------------------------------------------------
// Static seed (admin "Seed from static" only — not read by public pages)
// ---------------------------------------------------------------------------

type StaticGuide = {
  slug: string;
  title: string;
  category: string;
  readMinutes: number;
  image: string;
  order: number;
  area: GuideArea;
  draft: true;
  body: string;
};

const STATIC_GUIDES: StaticGuide[] = [
  {
    slug: "what-meditation-actually-is",
    title: "What meditation actually is (and isn't)",
    category: "Basics",
    readMinutes: 4,
    image: `${HERO}/adobestock-2055049378.webp`,
    order: 1,
    area: "meditate",
    draft: true,
    body: `**Draft.** Meditation is training attention — not emptying the mind or forcing calm.

You notice what is here (breath, sound, thought), then gently return when you wander. That return *is* the practice.

This guide will expand with clearer myths, examples, and what “good” feels like on an ordinary day.`,
  },
  {
    slug: "your-first-week",
    title: "Your first week: a gentle plan",
    category: "Getting started",
    readMinutes: 6,
    image: `${HERO}/adobestock-2089052451.webp`,
    order: 2,
    area: "meditate",
    draft: true,
    body: `**Draft.** A soft ramp: short sessions, the same time of day if you can, and permission to miss a day without starting over.

Day 1–2: sit with the breath for a few minutes. Day 3–4: add a body scan. Day 5–7: try one guided session from your library.

Full week plan and check-ins will replace this placeholder.`,
  },
  {
    slug: "when-your-mind-wont-stop",
    title: "When your mind won't stop wandering",
    category: "Practice",
    readMinutes: 5,
    image: `${HERO}/adobestock-2156039259.webp`,
    order: 3,
    area: "meditate",
    draft: true,
    body: `**Draft.** Wandering is normal. The skill is noticing, then coming back — kindly, as many times as it takes.

If restlessness is high, shorten the sit, open your eyes, or switch to a body-led practice. Fighting the mind usually fuels it.

More tactics and scripts will land here.`,
  },
  {
    slug: "breath-body-scan-or-visualisation",
    title: "Breath, body scan or visualisation?",
    category: "Choosing",
    readMinutes: 7,
    image: `${HERO}/adobestock-1713569649.webp`,
    order: 4,
    area: "meditate",
    draft: true,
    body: `**Draft.** Breath practices anchor attention. Body scans ground you in sensation. Visualisation uses imagery for mood, goals, or rest.

Pick for the state you want — not a “best” style forever. Tired minds often like body scans; busy minds like breath counting; evening wind-downs often like gentle visualisation.

A fuller chooser and examples will replace this draft.`,
  },
  {
    slug: "why-writing-things-down-helps",
    title: "Why writing things down helps",
    category: "Basics",
    readMinutes: 4,
    image: `${HERO}/adobestock-2162625652.webp`,
    order: 1,
    area: "journal",
    draft: true,
    body: `**Draft.** Putting thoughts on a page (or speaking them into one) gives them somewhere to land outside your head.

You start to see patterns, name feelings, and notice what keeps looping. That clarity feeds better insights and kinder meditations.

Fuller research and examples will replace this placeholder.`,
  },
  {
    slug: "prompts-for-when-youre-stuck",
    title: "Prompts for when you're stuck",
    category: "Practice",
    readMinutes: 5,
    image: `${HERO}/adobestock-2157180245.webp`,
    order: 2,
    area: "journal",
    draft: true,
    body: `**Draft.** When the page feels blank, a small question is enough: what's taking space, what went well, what would ease tomorrow.

You don't need a perfect essay — a few honest lines count.

A longer prompt library will live here.`,
  },
  {
    slug: "gratitude-without-forcing-it",
    title: "Gratitude without forcing it",
    category: "Gratitude",
    readMinutes: 4,
    image: `${HERO}/adobestock-2055049378.webp`,
    order: 3,
    area: "journal",
    draft: true,
    body: `**Draft.** Gratitude works best when it's specific and true — not a performance of positivity.

One small, concrete thing is enough. Skip a day when you need to; come back when something real shows up.

More guidance will replace this draft.`,
  },
  {
    slug: "reading-your-weekly-insights",
    title: "Reading your weekly insights",
    category: "Insights",
    readMinutes: 3,
    image: `${HERO}/adobestock-2089052451.webp`,
    order: 4,
    area: "journal",
    draft: true,
    body: `**Draft.** Your weekly letter is a mirror of the stretch you lived — moods, themes, and what kept returning.

Read it slowly. Notice what lands, what feels off, and what you'd tell a friend in the same spot.

A fuller how-to will replace this placeholder.`,
  },
];

/**
 * Original placeholder guides mapped to the admin seed payload.
 * Seeded as published so public indexes/overviews stay populated after migration
 * (the old static module listed them even while marked draft copy).
 */
export const STATIC_GUIDE_SEED: AdminGuideSeed[] = STATIC_GUIDES.map((g) => ({
  area: g.area,
  slug: g.slug,
  title: g.title,
  category: g.category,
  coverImageUrl: g.image,
  body: g.body,
  order: g.order,
  status: "published",
}));
