/**
 * Shared cache + warm decode for Library / Create style category covers.
 * Prefetch when Create opens so the style panel does not re-hit the network
 * each time the picker mounts.
 */

import {
  fetchLibraryCategoryImages,
  type LibraryCategoryImagePublic,
} from "@/lib/medimade-api";

/** Display size in the Create style panel (~3-col × 74px high). */
export const CREATE_STYLE_TILE_IMAGE_WIDTH_PX = 200;
export const CREATE_STYLE_TILE_IMAGE_HEIGHT_PX = 74;

let cachedList: LibraryCategoryImagePublic[] | null = null;
let cachedMap: Partial<Record<string, string>> | null = null;
let inflight: Promise<LibraryCategoryImagePublic[]> | null = null;
const decodedUrls = new Set<string>();

/** Create Add-context tiles — refetch if a warm cache predates these slots. */
const CREATE_CONTEXT_COVER_CATEGORIES = [
  "All",
  "Journal",
  "Program",
  "Manifest",
] as const;

/** Last-resort CDN covers so Create tiles paint even if the list API fails. */
export function createContextCoverFallbacks(): Partial<Record<string, string>> {
  const media = (
    typeof import.meta !== "undefined" &&
    typeof import.meta.env?.VITE_MEDIMADE_MEDIA_BASE_URL === "string"
      ? import.meta.env.VITE_MEDIMADE_MEDIA_BASE_URL
      : "https://d3k8rq6eqba40d.cloudfront.net"
  ).replace(/\/$/, "");
  return {
    All: `${media}/category-covers/all-1790015419626.jpg`,
    Journal: `${media}/category-covers/journal-1791073729812.jpg`,
    Program: `${media}/category-covers/program-1791073744647.jpg`,
    Manifest: `${media}/category-covers/manifest-1791074930787.jpg`,
  };
}

function listToMap(
  images: LibraryCategoryImagePublic[],
): Partial<Record<string, string>> {
  const map: Partial<Record<string, string>> = {};
  for (const img of images) {
    if (img.category && img.imageUrl) {
      map[img.category] = img.imageUrl;
      if (img.category === "All") map.all = img.imageUrl;
    }
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
  try {
    const parsed = new URL(u, typeof window !== "undefined" ? window.location.origin : "https://local");
    // Cloudinary-style / Cloudflare Image Resizing hooks if ever present.
    if (parsed.searchParams.has("w") || parsed.searchParams.has("width")) {
      return u;
    }
    // Only append soft hints when the host looks like a transform CDN.
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

async function warmDecodeAll(images: LibraryCategoryImagePublic[]): Promise<void> {
  await Promise.all(
    images.map((img) => warmDecodeUrl(img.imageUrl)).filter(Boolean),
  );
}

/** Sync peek of the URL map (empty object if not loaded yet). */
export function peekLibraryCategoryImageMap(): Partial<Record<string, string>> {
  return cachedMap ? { ...cachedMap } : {};
}

export function libraryCategoryImagesCached(): boolean {
  return cachedMap != null;
}

/**
 * Fetch once (shared), populate cache, and decode tile-sized covers into the
 * browser image cache. Safe to call repeatedly.
 */
export async function prefetchLibraryCategoryImages(options?: {
  force?: boolean;
}): Promise<Partial<Record<string, string>>> {
  if (options?.force) {
    cachedMap = null;
    cachedList = null;
  }
  if (cachedMap && !cacheMissingCreateCovers(cachedMap)) {
    void warmDecodeAll(cachedList ?? []);
    return { ...cachedMap };
  }
  // Stale session cache (e.g. before Manifest slot existed) — refetch.
  if (cachedMap && cacheMissingCreateCovers(cachedMap)) {
    cachedMap = null;
    cachedList = null;
  }
  if (!inflight) {
    inflight = fetchLibraryCategoryImages()
      .then((list) => {
        cachedList = list;
        cachedMap = listToMap(list);
        return list;
      })
      .finally(() => {
        inflight = null;
      });
  }
  const list = await inflight;
  cachedList = list;
  cachedMap = listToMap(list);
  await warmDecodeAll(list);
  return { ...cachedMap };
}

/** Create wizard entry: kick off prefetch without blocking paint. */
export function prefetchLibraryCategoryImagesForCreate(): void {
  void prefetchLibraryCategoryImages({ force: true }).catch(() => {});
}
