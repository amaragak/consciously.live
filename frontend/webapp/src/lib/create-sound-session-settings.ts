/**
 * Per-session voice/sound overrides on Create → Sound when a Program is attached.
 * Resolved settings = { ...all, ...sessionOverrides[sessionId] }.
 */

import type { CreateSoundBedMode } from "@/lib/create-meditation-bed-payload";

export type CreateSoundSessionSettings = {
  speakerModelId: string;
  longerBreaks: boolean;
  pacingPercent: number;
  voiceFxDial: number;
  soundMode: CreateSoundBedMode;
  compositionKey: string;
  backgroundNatureKey: string;
  backgroundMusicKey: string;
  backgroundDrumsKey: string;
  backgroundNoiseKey: string;
  backgroundNatureGain: number;
  backgroundMusicGain: number;
  backgroundDrumsGain: number;
  backgroundNoiseGain: number;
  selectedMixKey: string;
  musicLevel: number;
  leadInSeconds: 0 | 20;
  fadeOut: boolean;
};

export type CreateSoundSessionOverride = Partial<CreateSoundSessionSettings>;

export const VOICE_SOUND_SETTING_KEYS = [
  "speakerModelId",
  "longerBreaks",
  "pacingPercent",
  "voiceFxDial",
  "soundMode",
  "compositionKey",
  "backgroundNatureKey",
  "backgroundMusicKey",
  "backgroundDrumsKey",
  "backgroundNoiseKey",
  "backgroundNatureGain",
  "backgroundMusicGain",
  "backgroundDrumsGain",
  "backgroundNoiseGain",
  "selectedMixKey",
  "musicLevel",
  "leadInSeconds",
  "fadeOut",
] as const satisfies ReadonlyArray<keyof CreateSoundSessionSettings>;

export const VOICE_SETTING_KEYS = [
  "speakerModelId",
  "longerBreaks",
  "pacingPercent",
  "voiceFxDial",
] as const satisfies ReadonlyArray<keyof CreateSoundSessionSettings>;

export const SOUND_SETTING_KEYS = [
  "soundMode",
  "compositionKey",
  "backgroundNatureKey",
  "backgroundMusicKey",
  "backgroundDrumsKey",
  "backgroundNoiseKey",
  "backgroundNatureGain",
  "backgroundMusicGain",
  "backgroundDrumsGain",
  "backgroundNoiseGain",
  "selectedMixKey",
  "musicLevel",
  "leadInSeconds",
  "fadeOut",
] as const satisfies ReadonlyArray<keyof CreateSoundSessionSettings>;

export function resolveSoundSessionSettings(
  all: CreateSoundSessionSettings,
  override: CreateSoundSessionOverride | undefined,
): CreateSoundSessionSettings {
  if (!override || Object.keys(override).length === 0) return all;
  return { ...all, ...override };
}

/** Diff `current` against `all`; omit fields that match All. */
export function diffSoundSessionSettings(
  all: CreateSoundSessionSettings,
  current: CreateSoundSessionSettings,
): CreateSoundSessionOverride {
  const out: CreateSoundSessionOverride = {};
  for (const key of VOICE_SOUND_SETTING_KEYS) {
    if (current[key] !== all[key]) {
      (out as Record<string, unknown>)[key] = current[key];
    }
  }
  return out;
}

export function overrideHasKeys(
  override: CreateSoundSessionOverride | undefined,
  keys: ReadonlyArray<keyof CreateSoundSessionSettings>,
): boolean {
  if (!override) return false;
  return keys.some((k) => Object.prototype.hasOwnProperty.call(override, k));
}

export function stripOverrideKeys(
  override: CreateSoundSessionOverride | undefined,
  keys: ReadonlyArray<keyof CreateSoundSessionSettings>,
): CreateSoundSessionOverride | undefined {
  if (!override) return undefined;
  const next: CreateSoundSessionOverride = { ...override };
  for (const k of keys) delete next[k];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function countNonEmptyOverrides(
  overrides: Record<string, CreateSoundSessionOverride>,
): number {
  return Object.values(overrides).filter((o) => Object.keys(o).length > 0)
    .length;
}
