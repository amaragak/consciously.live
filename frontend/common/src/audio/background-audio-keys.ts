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
 * Leftover `.mp3` / `.wav` / `.opus` siblings are older or wrong-format —
 * never return those for fetch.
 */
export function backgroundAudioPlaybackKey(key: string): string {
  const catalog = backgroundAudioStreamingKey(key);
  if (!catalog) return catalog;
  const pathOnly = catalog.split(/[?#]/)[0] ?? catalog;
  const lower = pathOnly.toLowerCase();
  const bedIdx = lower.indexOf("background-audio/");
  if (bedIdx < 0) return catalog;
  const bedPath = pathOnly.slice(bedIdx);
  const bedLower = bedPath.toLowerCase();
  if (bedLower.endsWith(".m4a")) return bedPath;
  if (
    bedLower.endsWith(".mp3") ||
    bedLower.endsWith(".wav") ||
    bedLower.endsWith(".opus")
  ) {
    return `${bedPath.slice(0, bedPath.lastIndexOf("."))}.m4a`;
  }
  return catalog;
}

/**
 * @deprecated Beds are AAC-only — same as {@link backgroundAudioPlaybackKey}.
 * Kept so older call sites compile; do not introduce MP3 fallbacks.
 */
export function backgroundAudioPlaybackFallbackKey(key: string): string {
  return backgroundAudioPlaybackKey(key);
}
