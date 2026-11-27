/**
 * Full listen length for library card + player strip: voice stem plus bed
 * lead-in / outro when live beds are mixed client-side.
 */

import {
  BED_OUTRO_FADE_SECONDS,
  BED_OUTRO_HOLD_SECONDS,
  DEFAULT_MEDITATION_LEAD_IN_SECONDS,
} from "./bed-volume";

export type MeditationSessionDurationInput = {
  /** Catalog / measured voice-stem seconds. */
  voiceSeconds: number | null | undefined;
  liveMix?: boolean | null;
  leadInSeconds?: number | null;
  /** When false, beds stop with the voice (no post-voice hold+fade). */
  fadeOut?: boolean | null;
  backgroundNatureKey?: string | null;
  backgroundMusicKey?: string | null;
  backgroundDrumsKey?: string | null;
  backgroundNoiseKey?: string | null;
};

export function meditationHasLiveBeds(
  input: Pick<
    MeditationSessionDurationInput,
    | "liveMix"
    | "backgroundNatureKey"
    | "backgroundMusicKey"
    | "backgroundDrumsKey"
    | "backgroundNoiseKey"
  >,
): boolean {
  if (input.liveMix !== true) return false;
  return Boolean(
    (input.backgroundNatureKey ?? "").trim() ||
      (input.backgroundMusicKey ?? "").trim() ||
      (input.backgroundDrumsKey ?? "").trim() ||
      (input.backgroundNoiseKey ?? "").trim(),
  );
}

export function meditationLeadInSeconds(
  input: Pick<MeditationSessionDurationInput, "leadInSeconds"> & {
    hasLiveBeds: boolean;
  },
): number {
  if (!input.hasLiveBeds) return 0;
  const n = input.leadInSeconds;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_MEDITATION_LEAD_IN_SECONDS;
}

export function meditationOutroPadSeconds(
  input: Pick<MeditationSessionDurationInput, "fadeOut"> & {
    hasLiveBeds: boolean;
  },
): number {
  if (!input.hasLiveBeds || input.fadeOut === false) return 0;
  return BED_OUTRO_HOLD_SECONDS + BED_OUTRO_FADE_SECONDS;
}

/** Voice + bed lead-in + bed outro. Null when voice length is unknown. */
export function meditationSessionDurationSeconds(
  input: MeditationSessionDurationInput,
): number | null {
  const voice = input.voiceSeconds;
  if (typeof voice !== "number" || !Number.isFinite(voice) || voice <= 0) {
    return null;
  }
  const hasLiveBeds = meditationHasLiveBeds(input);
  const lead = meditationLeadInSeconds({ ...input, hasLiveBeds });
  const outro = meditationOutroPadSeconds({ ...input, hasLiveBeds });
  return voice + lead + outro;
}
