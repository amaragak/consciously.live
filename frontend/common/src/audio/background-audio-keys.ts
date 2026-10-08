/**
 * Canonical catalog / API bed key (`background-audio/….mp3` path shape).
 * WAV inputs are mapped to the MP3-shaped identity — not a CDN fetch format.
 */
export function backgroundAudioStreamingKey(key: string): string {
  const k = key.trim();
  if (!k) return k;
  const lower = k.toLowerCase();
  if (!lower.startsWith("background-audio/") || !lower.endsWith(".wav")) return k;
  return `${k.slice(0, -4)}.mp3`;
}

/**
 * Bed playback key: AAC-in-MP4 only. Catalog keys stay `.mp3`-shaped.
 */
export function backgroundAudioPlaybackKey(key: string): string {
  const catalog = backgroundAudioStreamingKey(key);
  if (!catalog) return catalog;
  const lower = catalog.toLowerCase();
  if (!lower.startsWith("background-audio/") || !lower.endsWith(".mp3")) {
    return catalog;
  }
  return `${catalog.slice(0, -4)}.m4a`;
}

/**
 * @deprecated Beds are AAC-only — same as {@link backgroundAudioPlaybackKey}.
 * Kept so older call sites compile; do not introduce MP3 fallbacks.
 */
export function backgroundAudioPlaybackFallbackKey(key: string): string {
  return backgroundAudioPlaybackKey(key);
}
