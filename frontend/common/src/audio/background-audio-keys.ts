/** Prefer CDN MP3 for previews and mixer jobs (`background-audio/…` beds). */
export function backgroundAudioStreamingKey(key: string): string {
  const k = key.trim();
  if (!k) return k;
  const lower = k.toLowerCase();
  if (!lower.startsWith("background-audio/") || !lower.endsWith(".wav")) return k;
  return `${k.slice(0, -4)}.mp3`;
}

let cachedOpusSupport: boolean | null = null;

function browserPlaysOggOpus(): boolean {
  if (cachedOpusSupport !== null) return cachedOpusSupport;
  if (typeof document === "undefined") return false;
  const probe = document.createElement("audio");
  cachedOpusSupport = probe.canPlayType('audio/ogg; codecs="opus"') !== "";
  return cachedOpusSupport;
}

/**
 * Playback-only key for beds. Opus is gapless, so looped beds have no encoder
 * padding at the seam; MP3 stays the fallback where Ogg Opus is unsupported.
 */
export function backgroundAudioPlaybackKey(key: string): string {
  const mp3 = backgroundAudioStreamingKey(key);
  if (!mp3) return mp3;
  const lower = mp3.toLowerCase();
  if (!lower.startsWith("background-audio/") || !lower.endsWith(".mp3")) return mp3;
  if (!browserPlaysOggOpus()) return mp3;
  return `${mp3.slice(0, -4)}.opus`;
}
