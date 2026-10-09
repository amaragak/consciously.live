import {
  normalizeFaderGains,
  type MixerPresetMix,
} from "@/lib/mixer-preset-storage";

export type FactoryChannel = {
  source: string | null;
  volume: number;
  /** Layer power; missing means on. Off keeps source + volume. */
  enabled?: boolean;
};

export type MixerFactoryPreset = {
  id: string;
  name: string;
  description: string;
  icon: string;
  icon_bg: string;
  icon_color: string;
  channels: {
    music: FactoryChannel;
    ambience: FactoryChannel;
    drums: FactoryChannel;
    noise: FactoryChannel;
  };
};

/**
 * Design stubs only — live factory mixes come from admin Sound mixes (DynamoDB).
 */
export const MIXER_FACTORY_PRESETS: MixerFactoryPreset[] = [
  {
    id: "factory-rain-and-low-pad",
    name: "Rain and low pad",
    description: "Ambience, soft music",
    icon: "cloud-rain",
    icon_bg: "#E4EEF4",
    icon_color: "#3D5A73",
    channels: {
      music: { source: null, volume: 50 },
      ambience: { source: null, volume: 100 },
      drums: { source: null, volume: 0 },
      noise: { source: null, volume: 0 },
    },
  },
  {
    id: "factory-deep-silence",
    name: "Deep silence",
    description: "Near-silent noise floor",
    icon: "moon",
    icon_bg: "#EFEBF3",
    icon_color: "#7A5D8F",
    channels: {
      music: { source: null, volume: 0 },
      ambience: { source: null, volume: 0 },
      drums: { source: null, volume: 0 },
      noise: { source: null, volume: 100 },
    },
  },
  {
    id: "factory-heartbeat-drone",
    name: "Heartbeat drone",
    description: "Drums, low ambience",
    icon: "heartbeat",
    icon_bg: "#FBEAEA",
    icon_color: "#A65252",
    channels: {
      music: { source: null, volume: 0 },
      ambience: { source: null, volume: 51 },
      drums: { source: null, volume: 100 },
      noise: { source: null, volume: 0 },
    },
  },
  {
    id: "factory-forest-air",
    name: "Forest air",
    description: "Ambience, light noise",
    icon: "trees",
    icon_bg: "#E8F0E0",
    icon_color: "#4A6B3A",
    channels: {
      music: { source: null, volume: 0 },
      ambience: { source: null, volume: 100 },
      drums: { source: null, volume: 0 },
      noise: { source: null, volume: 32 },
    },
  },
];

export function factoryPresetToMix(p: MixerFactoryPreset): MixerPresetMix {
  return {
    musicKey: p.channels.music.source?.trim() || "",
    natureKey: p.channels.ambience.source?.trim() || "",
    drumsKey: p.channels.drums.source?.trim() || "",
    noiseKey: p.channels.noise.source?.trim() || "",
    musicGain: p.channels.music.volume,
    natureGain: p.channels.ambience.volume,
    drumsGain: p.channels.drums.volume,
    noiseGain: p.channels.noise.volume,
    musicEnabled: p.channels.music.enabled !== false,
    natureEnabled: p.channels.ambience.enabled !== false,
    drumsEnabled: p.channels.drums.enabled !== false,
    noiseEnabled: p.channels.noise.enabled !== false,
    masterVolume: 100,
  };
}

export function mixToFactoryChannels(mix: MixerPresetMix): MixerFactoryPreset["channels"] {
  return {
    music: {
      source: mix.musicKey.trim() || null,
      volume: mix.musicGain,
      enabled: mix.musicEnabled !== false,
    },
    ambience: {
      source: mix.natureKey.trim() || null,
      volume: mix.natureGain,
      enabled: mix.natureEnabled !== false,
    },
    drums: {
      source: mix.drumsKey.trim() || null,
      volume: mix.drumsGain,
      enabled: mix.drumsEnabled !== false,
    },
    noise: {
      source: mix.noiseKey.trim() || null,
      volume: mix.noiseGain,
      enabled: mix.noiseEnabled !== false,
    },
  };
}

export const FACTORY_ICON_OPTIONS = [
  { id: "cloud-rain", label: "Rain" },
  { id: "cloud-storm", label: "Storm" },
  { id: "cloud-fog", label: "Fog" },
  { id: "cloud", label: "Cloud" },
  { id: "wind", label: "Wind" },
  { id: "waves", label: "Waves" },
  { id: "droplet", label: "Water" },
  { id: "ripple", label: "Ripple" },
  { id: "mist", label: "Mist" },
  { id: "snowflake", label: "Snow" },
  { id: "flame", label: "Fire" },
  { id: "campfire", label: "Campfire" },
  { id: "moon", label: "Moon" },
  { id: "moon-stars", label: "Night" },
  { id: "sun", label: "Sun" },
  { id: "sunrise", label: "Dawn" },
  { id: "sunset", label: "Dusk" },
  { id: "stars", label: "Stars" },
  { id: "sparkles", label: "Sparkles" },
  { id: "trees", label: "Forest" },
  { id: "leaf", label: "Leaves" },
  { id: "mountain", label: "Mountain" },
  { id: "flower", label: "Garden" },
  { id: "heartbeat", label: "Heartbeat" },
  { id: "music", label: "Music" },
  { id: "headphones", label: "Headphones" },
  { id: "wave-sine", label: "Tone" },
  { id: "om", label: "Om" },
  { id: "yoga", label: "Stillness" },
] as const;

export const FACTORY_COLOR_PRESETS = [
  { icon_bg: "#E4EEF4", icon_color: "#3D5A73" },
  { icon_bg: "#EFEBF3", icon_color: "#7A5D8F" },
  { icon_bg: "#FBEAEA", icon_color: "#A65252" },
  { icon_bg: "#E8F0E0", icon_color: "#4A6B3A" },
  { icon_bg: "#F8EAD4", icon_color: "#B8703A" },
] as const;

export function emptyFactoryPreset(name?: string): MixerFactoryPreset {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `factory_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    name: name?.trim() || "Untitled mix",
    description: "",
    icon: "cloud-rain",
    icon_bg: "#E4EEF4",
    icon_color: "#3D5A73",
    channels: {
      music: { source: null, volume: 25, enabled: true },
      ambience: { source: null, volume: 25, enabled: true },
      drums: { source: null, volume: 25, enabled: true },
      noise: { source: null, volume: 25, enabled: true },
    },
  };
}

export function normalizeFactoryPreset(raw: unknown): MixerFactoryPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  const ch =
    o.channels && typeof o.channels === "object"
      ? (o.channels as Record<string, unknown>)
      : {};
  const channel = (c: unknown, fallback: number): FactoryChannel => {
    if (!c || typeof c !== "object") {
      return { source: null, volume: fallback, enabled: true };
    }
    const x = c as Record<string, unknown>;
    const src = typeof x.source === "string" ? x.source.trim() : "";
    const vol =
      typeof x.volume === "number" && Number.isFinite(x.volume) ? x.volume : fallback;
    return {
      source: src || null,
      volume: Math.min(100, Math.max(0, vol)),
      enabled: x.enabled !== false,
    };
  };
  return {
    id: o.id.trim(),
    name:
      typeof o.name === "string" && o.name.trim()
        ? o.name.trim().slice(0, 80)
        : "Untitled mix",
    description:
      typeof o.description === "string" ? o.description.trim().slice(0, 160) : "",
    icon: typeof o.icon === "string" && o.icon.trim() ? o.icon.trim() : "cloud-rain",
    icon_bg:
      typeof o.icon_bg === "string" && o.icon_bg.trim() ? o.icon_bg.trim() : "#E4EEF4",
    icon_color:
      typeof o.icon_color === "string" && o.icon_color.trim()
        ? o.icon_color.trim()
        : "#3D5A73",
    channels: (() => {
      const raw = {
        music: channel(ch.music, 25),
        ambience: channel(ch.ambience, 25),
        drums: channel(ch.drums, 25),
        noise: channel(ch.noise, 25),
      };
      // Peak among layers that have a sound; empty layers stay at 0.
      // Also covers stale catalog caches that still ship pre-normalised volumes.
      const withKeys = {
        musicKey: raw.music.source ?? "",
        natureKey: raw.ambience.source ?? "",
        drumsKey: raw.drums.source ?? "",
        noiseKey: raw.noise.source ?? "",
        musicGain: raw.music.source ? raw.music.volume : 0,
        natureGain: raw.ambience.source ? raw.ambience.volume : 0,
        drumsGain: raw.drums.source ? raw.drums.volume : 0,
        noiseGain: raw.noise.source ? raw.noise.volume : 0,
        musicEnabled: raw.music.enabled !== false,
        natureEnabled: raw.ambience.enabled !== false,
        drumsEnabled: raw.drums.enabled !== false,
        noiseEnabled: raw.noise.enabled !== false,
        masterVolume: 100,
      };
      const norm = normalizeFaderGains(withKeys);
      return {
        music: { ...raw.music, volume: norm.musicGain },
        ambience: { ...raw.ambience, volume: norm.natureGain },
        drums: { ...raw.drums, volume: norm.drumsGain },
        noise: { ...raw.noise, volume: norm.noiseGain },
      };
    })(),
  };
}

function channelsEqual(
  a: MixerFactoryPreset["channels"],
  b: MixerFactoryPreset["channels"],
): boolean {
  const keys = ["music", "ambience", "drums", "noise"] as const;
  return keys.every(
    (k) =>
      (a[k].source ?? null) === (b[k].source ?? null) &&
      a[k].volume === b[k].volume &&
      (a[k].enabled !== false) === (b[k].enabled !== false),
  );
}

export function factoryPresetEquals(a: MixerFactoryPreset, b: MixerFactoryPreset): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.description === b.description &&
    a.icon === b.icon &&
    a.icon_bg === b.icon_bg &&
    a.icon_color === b.icon_color &&
    channelsEqual(a.channels, b.channels)
  );
}
