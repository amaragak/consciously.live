/** Shared library / playback types for marketing + SPA. */

export type BackgroundAudioItem = {
  key: string;
  name: string;
  size: number | null;
  /** Normalized WAV sibling for pro-tier / high-quality download when present. */
  wavKey?: string;
  subcategory?: string;
  /** Catalog tags (lowercase), mainly for compositions / soundscapes. */
  tags?: string[];
  /** Beat frequency in Hz when the bed has a binaural component. */
  binauralHz?: number | null;
  adminFavourite?: boolean;
  customPackName?: string | null;
  /** Public CDN URL for composition / soundscape cover art when present. */
  coverImageUrl?: string | null;
  /** Smaller JPEG thumb for list / picker cards. */
  coverImageThumbUrl?: string | null;
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
  /** Bed-only seconds before voice starts (live mix). */
  leadInSeconds?: number | null;
  /** When false, beds stop with the voice (no post-voice fade). */
  fadeOut?: boolean | null;
  backgroundNatureKey?: string | null;
  backgroundMusicKey?: string | null;
  backgroundDrumsKey?: string | null;
  backgroundNoiseKey?: string | null;
  backgroundNatureGain?: number | null;
  backgroundMusicGain?: number | null;
  backgroundDrumsGain?: number | null;
  backgroundNoiseGain?: number | null;
};
