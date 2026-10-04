/**
 * Bed fields for createMeditationAudioJob — mirrors create-workspace Sound step.
 */

import { backgroundAudioStreamingKey } from "@/lib/medimade-api";

export const SOUNDSCAPE_GAIN = 100;

export type CreateSoundBedMode = "soundscape" | "mixer";

export type CreateMeditationBedInput = {
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
  /** When melodic music locks drums, pass "" so drums are omitted. */
  drumsPreviewKey: string;
};

export type CreateMeditationBedJobFields = {
  backgroundNatureKey?: string;
  backgroundMusicKey?: string;
  backgroundDrumsKey?: string;
  backgroundNoiseKey?: string;
  backgroundNatureGain?: number;
  backgroundMusicGain?: number;
  backgroundDrumsGain?: number;
  backgroundNoiseGain?: number;
};

/** Soundscape rides the music slot alone; mixer sends optional layered keys. */
export function buildCreateMeditationBedJobFields(
  input: CreateMeditationBedInput,
): CreateMeditationBedJobFields {
  const soundscapeActive =
    input.soundMode === "soundscape" && Boolean(input.compositionKey.trim());

  if (soundscapeActive) {
    return {
      backgroundMusicKey: backgroundAudioStreamingKey(input.compositionKey),
      backgroundMusicGain: SOUNDSCAPE_GAIN,
    };
  }

  const out: CreateMeditationBedJobFields = {};
  if (input.backgroundNatureKey.trim()) {
    out.backgroundNatureKey = backgroundAudioStreamingKey(
      input.backgroundNatureKey,
    );
    out.backgroundNatureGain = input.backgroundNatureGain;
  }
  if (input.backgroundMusicKey.trim()) {
    out.backgroundMusicKey = backgroundAudioStreamingKey(
      input.backgroundMusicKey,
    );
    out.backgroundMusicGain = input.backgroundMusicGain;
  }
  if (input.drumsPreviewKey.trim()) {
    out.backgroundDrumsKey = backgroundAudioStreamingKey(input.drumsPreviewKey);
    out.backgroundDrumsGain = input.backgroundDrumsGain;
  }
  if (input.backgroundNoiseKey.trim()) {
    out.backgroundNoiseKey = backgroundAudioStreamingKey(
      input.backgroundNoiseKey,
    );
    out.backgroundNoiseGain = input.backgroundNoiseGain;
  }
  return out;
}
