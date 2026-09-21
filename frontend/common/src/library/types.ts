/** Shared library / playback types for marketing + SPA. */

export type BackgroundAudioItem = {
  key: string;
  name: string;
  size: number | null;
  /** Normalized WAV sibling for pro-tier / high-quality download when present. */
  wavKey?: string;
  subcategory?: string;
};

/** Fields needed to build a strip track from a library row. */
export type LibraryMeditationFields = {
  audioUrl: string;
  title: string;
  s3Key: string;
  liveMix?: boolean;
  dryAudioUrl?: string | null;
  wetAudioUrl?: string | null;
  /** CDN URL for square cover art (gpt-image), when generated. */
  coverImageUrl?: string | null;
  voiceFxDial?: number | null;
  durationSeconds?: number | null;
  backgroundNatureKey?: string | null;
  backgroundMusicKey?: string | null;
  backgroundDrumsKey?: string | null;
  backgroundNoiseKey?: string | null;
  backgroundNatureGain?: number | null;
  backgroundMusicGain?: number | null;
  backgroundDrumsGain?: number | null;
  backgroundNoiseGain?: number | null;
};
