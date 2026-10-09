import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

export type MixerPresetMix = {
  musicKey: string;
  natureKey: string;
  drumsKey: string;
  noiseKey: string;
  musicGain: number;
  natureGain: number;
  drumsGain: number;
  noiseGain: number;
  /** Layer power — off keeps sound + volume for restore. Default true. */
  musicEnabled: boolean;
  natureEnabled: boolean;
  drumsEnabled: boolean;
  noiseEnabled: boolean;
  /** 0–100 master gain applied on top of layer volumes. */
  masterVolume: number;
};

export type MixerPreset = MixerPresetMix & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type MixerPresetStoreV1 = {
  version: 1;
  activeId: string | null;
  presets: MixerPreset[];
};

const STORE_KEY = "mm_mixer_presets_v1";
const DEFAULT_GAIN = 25;

function clampGain(n: unknown): number {
  const x = typeof n === "number" && Number.isFinite(n) ? n : DEFAULT_GAIN;
  return Math.min(100, Math.max(0, x));
}

function boolOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

export function emptyMixerMix(): MixerPresetMix {
  return {
    musicKey: "",
    natureKey: "",
    drumsKey: "",
    noiseKey: "",
    musicGain: DEFAULT_GAIN,
    natureGain: DEFAULT_GAIN,
    drumsGain: DEFAULT_GAIN,
    noiseGain: DEFAULT_GAIN,
    musicEnabled: true,
    natureEnabled: true,
    drumsEnabled: true,
    noiseEnabled: true,
    masterVolume: 100,
  };
}

function newId(): string {
  const now = new Date().toISOString();
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mix_${now}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePreset(raw: unknown): MixerPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  const name =
    typeof o.name === "string" && o.name.trim()
      ? o.name.trim().slice(0, 80)
      : "Untitled mix";
  const createdAt =
    typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString();
  const updatedAt =
    typeof o.updatedAt === "string" ? o.updatedAt : createdAt;
  const musicKey = typeof o.musicKey === "string" ? o.musicKey : "";
  const natureKey = typeof o.natureKey === "string" ? o.natureKey : "";
  const drumsKey = typeof o.drumsKey === "string" ? o.drumsKey : "";
  const noiseKey = typeof o.noiseKey === "string" ? o.noiseKey : "";
  return {
    id: o.id,
    name,
    createdAt,
    updatedAt,
    musicKey,
    natureKey,
    drumsKey,
    noiseKey,
    musicGain: clampGain(o.musicGain),
    natureGain: clampGain(o.natureGain),
    drumsGain: clampGain(o.drumsGain),
    noiseGain: clampGain(o.noiseGain),
    musicEnabled: boolOr(o.musicEnabled, true),
    natureEnabled: boolOr(o.natureEnabled, true),
    drumsEnabled: boolOr(o.drumsEnabled, true),
    noiseEnabled: boolOr(o.noiseEnabled, true),
    masterVolume: clampGain(
      typeof o.masterVolume === "number" ? o.masterVolume : 100,
    ),
  };
}

export function loadMixerPresetStore(): MixerPresetStoreV1 {
  if (typeof window === "undefined") {
    return { version: 1, activeId: null, presets: [] };
  }
  try {
    const raw = readAccountLocalStorage(STORE_KEY);
    if (!raw) return { version: 1, activeId: null, presets: [] };
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") {
      return { version: 1, activeId: null, presets: [] };
    }
    const o = data as Record<string, unknown>;
    const presets = Array.isArray(o.presets)
      ? o.presets.map(normalizePreset).filter((x): x is MixerPreset => Boolean(x))
      : [];
    const activeId =
      typeof o.activeId === "string" && presets.some((p) => p.id === o.activeId)
        ? o.activeId
        : presets[0]?.id ?? null;
    return { version: 1, activeId, presets };
  } catch {
    return { version: 1, activeId: null, presets: [] };
  }
}

export function saveMixerPresetStore(store: MixerPresetStoreV1): void {
  if (typeof window === "undefined") return;
  writeAccountLocalStorage(STORE_KEY, JSON.stringify(store));
}

export function newMixerPreset(name?: string): MixerPreset {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: name?.trim() || "Untitled mix",
    createdAt: now,
    updatedAt: now,
    ...emptyMixerMix(),
  };
}

export function mixerPresetToMix(p: MixerPreset): MixerPresetMix {
  return {
    musicKey: p.musicKey,
    natureKey: p.natureKey,
    drumsKey: p.drumsKey,
    noiseKey: p.noiseKey,
    musicGain: p.musicGain,
    natureGain: p.natureGain,
    drumsGain: p.drumsGain,
    noiseGain: p.noiseGain,
    musicEnabled: p.musicEnabled !== false,
    natureEnabled: p.natureEnabled !== false,
    drumsEnabled: p.drumsEnabled !== false,
    noiseEnabled: p.noiseEnabled !== false,
    masterVolume:
      typeof p.masterVolume === "number" && Number.isFinite(p.masterVolume)
        ? Math.min(100, Math.max(0, p.masterVolume))
        : 100,
  };
}

export function mixEquals(a: MixerPresetMix, b: MixerPresetMix): boolean {
  return (
    a.musicKey === b.musicKey &&
    a.natureKey === b.natureKey &&
    a.drumsKey === b.drumsKey &&
    a.noiseKey === b.noiseKey &&
    a.musicGain === b.musicGain &&
    a.natureGain === b.natureGain &&
    a.drumsGain === b.drumsGain &&
    a.noiseGain === b.noiseGain &&
    a.musicEnabled === b.musicEnabled &&
    a.natureEnabled === b.natureEnabled &&
    a.drumsEnabled === b.drumsEnabled &&
    a.noiseEnabled === b.noiseEnabled &&
    a.masterVolume === b.masterVolume
  );
}

/**
 * Persist-time only: stretch layer faders so the loudest is 100% and the others
 * keep relative balance. Does not change live UI/playback — call this when
 * writing a mix, then load the stored values next time. Master is left alone.
 * No-op when every fader is 0 or the peak is already 100.
 */
export function normalizeFaderGains(mix: MixerPresetMix): MixerPresetMix {
  const gains = [
    mix.musicGain,
    mix.natureGain,
    mix.drumsGain,
    mix.noiseGain,
  ];
  const peak = Math.max(0, ...gains.map((g) => (Number.isFinite(g) ? g : 0)));
  if (peak <= 0 || peak === 100) return mix;
  const scale = (g: number) => {
    if (!Number.isFinite(g) || g <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((g / peak) * 100)));
  };
  return {
    ...mix,
    musicGain: scale(mix.musicGain),
    natureGain: scale(mix.natureGain),
    drumsGain: scale(mix.drumsGain),
    noiseGain: scale(mix.noiseGain),
  };
}

/**
 * Playback / Create load: drop disabled layers (keys cleared) and scale gains
 * by masterVolume. Stored mix is unchanged.
 */
export function mixForPlayback(mix: MixerPresetMix): MixerPresetMix {
  const m = Math.min(100, Math.max(0, mix.masterVolume ?? 100)) / 100;
  const scale = (g: number) => Math.round(Math.min(100, Math.max(0, g * m)));
  return {
    ...mix,
    musicKey: mix.musicEnabled !== false ? mix.musicKey : "",
    natureKey: mix.natureEnabled !== false ? mix.natureKey : "",
    drumsKey: mix.drumsEnabled !== false ? mix.drumsKey : "",
    noiseKey: mix.noiseEnabled !== false ? mix.noiseKey : "",
    musicGain: scale(mix.musicGain),
    natureGain: scale(mix.natureGain),
    drumsGain: scale(mix.drumsGain),
    noiseGain: scale(mix.noiseGain),
    musicEnabled: true,
    natureEnabled: true,
    drumsEnabled: true,
    noiseEnabled: true,
    masterVolume: 100,
  };
}

export function countEnabledLayers(mix: MixerPresetMix): number {
  let n = 0;
  if (mix.musicKey.trim() && mix.musicEnabled !== false) n += 1;
  if (mix.natureKey.trim() && mix.natureEnabled !== false) n += 1;
  if (mix.drumsKey.trim() && mix.drumsEnabled !== false) n += 1;
  if (mix.noiseKey.trim() && mix.noiseEnabled !== false) n += 1;
  return n;
}
