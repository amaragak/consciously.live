/** Prefer CDN MP3 for previews and mixer jobs (`background-audio/…` beds). */
export function backgroundAudioStreamingKey(key: string): string {
  const k = key.trim();
  if (!k) return k;
  const lower = k.toLowerCase();
  if (!lower.startsWith("background-audio/") || !lower.endsWith(".wav")) return k;
  return `${k.slice(0, -4)}.mp3`;
}

/**
 * Playback-only key for beds. Prefer AAC-in-MP4 (.m4a); catalog keys stay MP3.
 * Callers that get a 404 should fall back to {@link backgroundAudioStreamingKey}.
 */
export function backgroundAudioPlaybackKey(key: string): string {
  const mp3 = backgroundAudioStreamingKey(key);
  if (!mp3) return mp3;
  const lower = mp3.toLowerCase();
  if (!lower.startsWith("background-audio/") || !lower.endsWith(".mp3")) {
    return mp3;
  }
  return `${mp3.slice(0, -4)}.m4a`;
}

/** Legacy MP3 bed URL — use when `.m4a` is missing pre-backfill. */
export function backgroundAudioPlaybackFallbackKey(key: string): string {
  return backgroundAudioStreamingKey(key);
}
