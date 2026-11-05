/**
 * Shared cache + warm decode for Library / Create style category covers.
 * Known product-chrome thumbs ship in `public/category-thumbs/` (web + Capacitor).
 * API covers only fill categories that are not bundled yet.
 */

import {
  fetchLibraryCategoryImages,
  type LibraryCategoryImagePublic,
} from "@/lib/medimade-api";

/** Display size in the Create style panel (~3-col × 74px high). */
export const CREATE_STYLE_TILE_IMAGE_WIDTH_PX = 200;
export const CREATE_STYLE_TILE_IMAGE_HEIGHT_PX = 74;

/** Create Add-context tiles — refetch if a warm cache predates these slots. */
const CREATE_CONTEXT_COVER_CATEGORIES = [
  "All",
  "Journal",
  "Program",
  "Manifest",
  "Heal",
] as const;

/**
 * Bundled category cover filenames under `/category-thumbs/`.
 * Keep in sync with files in `public/category-thumbs/`.
 */
const BUNDLED_CATEGORY_THUMB_SLUGS: Record<string, string> = {
  All: "all",
  "Body scan": "body-scan",
  Visualization: "visualization",
  "Breath-led": "breath-led",
  Manifestation: "manifestation",
  "Affirmation loop": "affirmation-loop",
  Story: "story",
  Reflection: "reflection",
  Sleep: "sleep",
  "Loving-kindness": "loving-kindness",
  "Anxiety relief": "anxiety-relief",
  "Movement meditation": "movement-meditation",
  "Open awareness": "open-awareness",
  Journal: "journal",
  Program: "program",
  Manifest: "manifest",
  Heal: "heal",
};

export function bundledCategoryThumb(category: string): string | undefined {
  const slug = BUNDLED_CATEGORY_THUMB_SLUGS[category];
  return slug ? `/category-thumbs/${slug}.jpg` : undefined;
}

/** Full local map for Create / style pickers (no network). */
export function bundledCategoryThumbMap(): Partial<Record<string, string>> {
  const map: Partial<Record<string, string>> = {};
  for (const [category, slug] of Object.entries(BUNDLED_CATEGORY_THUMB_SLUGS)) {
    const url = `/category-thumbs/${slug}.jpg`;
    map[category] = url;
    if (category === "All") map.all = url;
  }
  return map;
}

/** Last-resort covers so Create tiles paint even if the list API fails. */
export function createContextCoverFallbacks(): Partial<Record<string, string>> {
  const map: Partial<Record<string, string>> = {};
  for (const category of CREATE_CONTEXT_COVER_CATEGORIES) {
    const url = bundledCategoryThumb(category);
    if (url) map[category] = url;
  }
  return map;
}

let cachedList: LibraryCategoryImagePublic[] | null = null;
/** Seeded with bundled thumbs so Create / style pickers never wait on network. */
let cachedMap: Partial<Record<string, string>> | null =
  bundledCategoryThumbMap();
let inflight: Promise<LibraryCategoryImagePublic[]> | null = null;
const decodedUrls = new Set<string>();

function listToMap(
  images: LibraryCategoryImagePublic[],
): Partial<Record<string, string>> {
  // Local product chrome first — Capacitor must not depend on CloudFront for these.
  const map: Partial<Record<string, string>> = { ...bundledCategoryThumbMap() };
  for (const img of images) {
    if (!img.category || !img.imageUrl) continue;
    if (bundledCategoryThumb(img.category)) continue;
    map[img.category] = img.imageUrl;
    if (img.category === "All") map.all = img.imageUrl;
  }
  return map;
}

function cacheMissingCreateCovers(
  map: Partial<Record<string, string>> | null,
): boolean {
  if (!map) return true;
  return CREATE_CONTEXT_COVER_CATEGORIES.some((k) => !map[k]?.trim());
}

/** Prefer a CDN/query thumb when the URL already carries size hints; else original. */
export function categoryImageUrlForTile(
  url: string,
  width = CREATE_STYLE_TILE_IMAGE_WIDTH_PX,
  height = CREATE_STYLE_TILE_IMAGE_HEIGHT_PX,
): string {
  const u = url.trim();
  if (!u) return "";
  // Bundled paths need no transform CDN.
  if (u.startsWith("/")) return u;
  try {
    const parsed = new URL(
      u,
      typeof window !== "undefined" ? window.location.origin : "https://local",
    );
    if (parsed.searchParams.has("w") || parsed.searchParams.has("width")) {
      return u;
    }
    const host = parsed.hostname;
    if (
      host.includes("cloudinary") ||
      host.includes("imgix") ||
      host.includes("imagekit")
    ) {
      parsed.searchParams.set("w", String(width));
      parsed.searchParams.set("h", String(height));
      parsed.searchParams.set("fit", "cover");
      return parsed.toString();
    }
  } catch {
    /* keep original */
  }
  return u;
}

function warmDecodeUrl(url: string): Promise<void> {
  const src = categoryImageUrlForTile(url);
  if (!src || decodedUrls.has(src) || typeof Image === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      decodedUrls.add(src);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

async function warmDecodeMap(
  map: Partial<Record<string, string>>,
): Promise<void> {
  const urls = [...new Set(Object.values(map).filter(Boolean))] as string[];
  await Promise.all(urls.map((url) => warmDecodeUrl(url)));
}

/** Sync peek of the URL map (bundled defaults if not loaded yet). */
export function peekLibraryCategoryImageMap(): Partial<Record<string, string>> {
  return cachedMap ? { ...cachedMap } : bundledCategoryThumbMap();
}

export function libraryCategoryImagesCached(): boolean {
  return cachedMap != null;
}

/**
 * Seed from bundled thumbs immediately, then optionally merge any
 * non-bundled categories from the API. Safe to call repeatedly.
 */
export async function prefetchLibraryCategoryImages(options?: {
  force?: boolean;
}): Promise<Partial<Record<string, string>>> {
  if (options?.force) {
    cachedMap = null;
    cachedList = null;
  }
  if (!cachedMap) {
    cachedMap = bundledCategoryThumbMap();
    void warmDecodeMap(cachedMap);
  }
  if (cachedMap && !cacheMissingCreateCovers(cachedMap) && !options?.force) {
    // Bundled set is complete — still try API once for future slots, non-blocking.
    if (!inflight && !cachedList) {
      inflight = fetchLibraryCategoryImages()
        .then((list) => {
          cachedList = list;
          cachedMap = listToMap(list);
          return list;
        })
        .catch(() => {
          cachedList = [];
          return [] as LibraryCategoryImagePublic[];
        })
        .finally(() => {
          inflight = null;
        });
      void inflight.then(() => {
        if (cachedMap) void warmDecodeMap(cachedMap);
      });
    }
    return { ...cachedMap };
  }
  if (cachedMap && cacheMissingCreateCovers(cachedMap)) {
    cachedMap = bundledCategoryThumbMap();
  }
  if (!inflight) {
    inflight = fetchLibraryCategoryImages()
      .then((list) => {
        cachedList = list;
        cachedMap = listToMap(list);
        return list;
      })
      .catch(() => {
        cachedList = [];
        cachedMap = bundledCategoryThumbMap();
        return [] as LibraryCategoryImagePublic[];
      })
      .finally(() => {
        inflight = null;
      });
  }
  await inflight;
  if (cachedMap) await warmDecodeMap(cachedMap);
  return { ...(cachedMap ?? bundledCategoryThumbMap()) };
}

/** Create wizard entry: warm local covers without blocking paint. */
export function prefetchLibraryCategoryImagesForCreate(): void {
  cachedMap = bundledCategoryThumbMap();
  void warmDecodeMap(cachedMap);
  void prefetchLibraryCategoryImages().catch(() => {});
}
