import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

const STORE_KEY = "mm_sounds_recent_mixes_v1";
const LAST_OPEN_KEY = "mm_sounds_last_open_v1";
const MAX_RECENT = 24;

/** Last Custom Sounds desk selection (account-scoped). */
export type SoundsLastOpen =
  | { kind: "preset"; id: string }
  | { kind: "mix"; id: string };

export function readSoundsLastOpen(): SoundsLastOpen | null {
  try {
    const raw = readAccountLocalStorage(LAST_OPEN_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const kind = (o as { kind?: unknown }).kind;
    const id = (o as { id?: unknown }).id;
    if (
      (kind === "preset" || kind === "mix") &&
      typeof id === "string" &&
      id.trim()
    ) {
      return { kind, id: id.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSoundsLastOpen(next: SoundsLastOpen): void {
  try {
    writeAccountLocalStorage(
      LAST_OPEN_KEY,
      JSON.stringify({ kind: next.kind, id: next.id }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Recently loaded mixes on the Sounds page (most recent first).
 * Ids use the favourite id shapes: `factory:<id>` / `mix:<id>`.
 */
export function readRecentMixIds(): string[] {
  try {
    const raw = readAccountLocalStorage(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x !== "");
  } catch {
    return [];
  }
}

/** Move `id` to the front and persist; returns the next list. */
export function pushRecentMixId(id: string): string[] {
  const next = [id, ...readRecentMixIds().filter((x) => x !== id)].slice(
    0,
    MAX_RECENT,
  );
  try {
    writeAccountLocalStorage(STORE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
