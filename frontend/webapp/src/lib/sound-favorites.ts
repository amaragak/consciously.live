import { useCallback, useMemo, useState } from "react";
import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

const STORE_KEY = "mm_sound_favorites_v1";

export type SoundFavorites = {
  voices: string[];
  compositions: string[];
  mixes: string[];
};

function emptyStore(): SoundFavorites {
  return { voices: [], compositions: [], mixes: [] };
}

function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function readSoundFavorites(): SoundFavorites {
  try {
    const raw = readAccountLocalStorage(STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const o = parsed as Record<string, unknown>;
    return {
      voices: normalizeList(o.voices),
      compositions: normalizeList(o.compositions),
      mixes: normalizeList(o.mixes),
    };
  } catch {
    return emptyStore();
  }
}

function writeSoundFavorites(next: SoundFavorites): void {
  writeAccountLocalStorage(STORE_KEY, JSON.stringify(next));
}

function toggleIn(list: string[], id: string): string[] {
  const key = id.trim();
  if (!key) return list;
  return list.includes(key) ? list.filter((x) => x !== key) : [key, ...list];
}

export function factoryMixFavoriteId(presetId: string): string {
  return `factory:${presetId}`;
}

export function userMixFavoriteId(mixId: string): string {
  return `mix:${mixId}`;
}

export function useSoundFavorites() {
  const [tick, setTick] = useState(0);
  const store = useMemo(() => {
    void tick;
    return readSoundFavorites();
  }, [tick]);

  const voiceSet = useMemo(() => new Set(store.voices), [store.voices]);
  const compositionSet = useMemo(
    () => new Set(store.compositions),
    [store.compositions],
  );
  const mixSet = useMemo(() => new Set(store.mixes), [store.mixes]);

  const toggleVoice = useCallback((modelId: string) => {
    const cur = readSoundFavorites();
    writeSoundFavorites({ ...cur, voices: toggleIn(cur.voices, modelId) });
    setTick((n) => n + 1);
  }, []);

  const toggleComposition = useCallback((key: string) => {
    const cur = readSoundFavorites();
    writeSoundFavorites({
      ...cur,
      compositions: toggleIn(cur.compositions, key),
    });
    setTick((n) => n + 1);
  }, []);

  const toggleMix = useCallback((mixFavoriteId: string) => {
    const cur = readSoundFavorites();
    writeSoundFavorites({ ...cur, mixes: toggleIn(cur.mixes, mixFavoriteId) });
    setTick((n) => n + 1);
  }, []);

  return {
    voiceSet,
    compositionSet,
    mixSet,
    toggleVoice,
    toggleComposition,
    toggleMix,
  };
}
