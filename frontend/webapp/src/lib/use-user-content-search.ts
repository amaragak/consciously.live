import { useEffect, useState } from "react";
import {
  isMedimadeSessionActive,
  searchUserContentRemote,
} from "@/lib/medimade-api";

/** Strip `type:` prefix from Algolia objectID → local entity id / sk. */
export function algoliaRecordId(objectID: string): string {
  const i = objectID.indexOf(":");
  return i >= 0 ? objectID.slice(i + 1) : objectID;
}

export type UseUserContentSearchIdsResult = {
  /**
   * `null` → caller should use local text filter (or show all).
   * `Set` → Algolia match ids for the current query (may be empty).
   */
  ids: Set<string> | null;
  /** Same ids in Algolia relevance order. */
  orderedIds: string[] | null;
  busy: boolean;
  /** True when `ids` is Algolia-driven for the current query. */
  active: boolean;
};

/**
 * Debounced Algolia search scoped by JWT email.
 * Falls back to `ids: null` when signed out, query too short, or the request fails.
 */
export function useUserContentSearchIds(
  query: string,
  type: string,
  opts?: { enabled?: boolean; minChars?: number; debounceMs?: number },
): UseUserContentSearchIdsResult {
  const enabled = opts?.enabled !== false;
  const minChars = opts?.minChars ?? 2;
  const debounceMs = opts?.debounceMs ?? 220;

  const [ids, setIds] = useState<Set<string> | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const q = query.trim();
    const typeKey = type.trim();
    if (!enabled || !typeKey || q.length < minChars) {
      setIds(null);
      setOrderedIds(null);
      setBusy(false);
      setActive(false);
      return;
    }
    if (!isMedimadeSessionActive()) {
      setIds(null);
      setOrderedIds(null);
      setBusy(false);
      setActive(false);
      return;
    }

    let cancelled = false;
    setBusy(true);
    const handle = window.setTimeout(() => {
      void searchUserContentRemote(q, { type: typeKey })
        .then((hits) => {
          if (cancelled) return;
          const ordered: string[] = [];
          const next = new Set<string>();
          for (const h of hits) {
            const id = algoliaRecordId(h.objectID);
            if (!id || next.has(id)) continue;
            next.add(id);
            ordered.push(id);
          }
          setIds(next);
          setOrderedIds(ordered);
          setActive(true);
        })
        .catch(() => {
          if (cancelled) return;
          setIds(null);
          setOrderedIds(null);
          setActive(false);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, type, enabled, minChars, debounceMs]);

  return { ids, orderedIds, busy, active };
}

/** Sort items so Algolia hit order comes first; unknowns keep relative order at the end. */
export function sortByAlgoliaOrder<T>(
  items: T[],
  orderedIds: string[] | null,
  idOf: (item: T) => string,
): T[] {
  if (!orderedIds?.length) return items;
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(idOf(a));
    const rb = rank.get(idOf(b));
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}
