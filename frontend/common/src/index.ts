/**
 * Shared frontend package: theme tokens, session helpers, and playback UI
 * used by marketing (Next) and webapp (Vite SPA).
 */

export const brand = {
  name: "Consciously",
  marketingOrigin: "https://consciously.live",
  appOrigin: "https://app.consciously.live",
} as const;

export const SESSION_ACTIVE_KEY = "mm_session_active_v1";

/** Query param for one-time marketing → SPA session handoff. */
export const AUTH_HANDOFF_QUERY = "mm_handoff";

export function normalizeApiBase(url: string | undefined | null): string {
  return (url ?? "").trim().replace(/\/$/, "");
}

/** Synchronous SPA auth hint — same key the Next app already writes. */
export function readHasSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(SESSION_ACTIVE_KEY);
  } catch {
    return false;
  }
}

export type {
  BackgroundAudioItem,
  LibraryMeditationFields,
} from "./library/types";

export {
  LibraryAudioStrip,
  liveMixTrack,
  trackFromBlogNarration,
  trackFromLibraryItem,
  trackFromFocusMix,
  isSoundscapeKey,
  mediaFileUrl,
  FOCUS_AMBIENT_S3_PREFIX,
  type LibraryActiveTrack,
  type LibraryBedVolumeApi,
  type BedVolumeChannel,
} from "./library/library-audio-strip";

export { PublicMeditationPlayer } from "./library/public-meditation-player";

export {
  backgroundAudioPlaybackKey,
  backgroundAudioStreamingKey,
} from "./audio/background-audio-keys";

export { isMelodicMusicKey } from "./audio/sound-taxonomy";

export {
  DualStemPlayer,
} from "./audio/dual-stem-player";

export {
  VOICE_FX_DIAL_DEFAULT,
  clampVoiceFxDial,
  voiceFxDialGains,
} from "./audio/voice-fx-dial";

export { VoiceFxKnob } from "./ui/voice-fx-knob";

export * from "./theme";
