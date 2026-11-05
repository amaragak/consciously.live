/**
 * Session SWR cache for the signed-in library meditation list.
 * Overview / dashboard remounts paint from memory, then revalidate.
 */

import { listLibraryMeditations, type LibraryMeditationItem } from "@/lib/medimade-api";

type CacheEntry = {
  items: LibraryMeditationItem[];
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let inflight: Promise<LibraryMeditationItem[]> | null = null;

export function peekLibraryMeditationsCache(): LibraryMeditationItem[] | null {
  return cache ? cache.items : null;
}

export function invalidateLibraryMeditationsCache(): void {
  cache = null;
}

export async function fetchLibraryMeditationsCached(opts?: {
  force?: boolean;
}): Promise<LibraryMeditationItem[]> {
  if (!opts?.force && cache) {
    void revalidateInBackground();
    return cache.items;
  }
  if (inflight) return inflight;
  inflight = listLibraryMeditations()
    .then((items) => {
      cache = { items, fetchedAt: Date.now() };
      return items;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function revalidateInBackground(): void {
  if (inflight) return;
  inflight = listLibraryMeditations()
    .then((items) => {
      cache = { items, fetchedAt: Date.now() };
      return items;
    })
    .finally(() => {
      inflight = null;
    });
  void inflight;
}
