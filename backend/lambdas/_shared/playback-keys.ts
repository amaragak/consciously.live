/** Voice catalog prefixes that still use a `.mp3`-shaped Dynamo identity. */
const PLAYBACK_PREFIXES = ["meditations/", "programs/"] as const;

function hasPlaybackPrefix(pathOrKey: string): boolean {
  const lower = pathOrKey.toLowerCase().replace(/^\//, "");
  return PLAYBACK_PREFIXES.some((p) => lower.startsWith(p));
}

function stemExt(key: string): { stem: string; ext: string } | null {
  const k = key.trim();
  const lower = k.toLowerCase();
  const m = lower.match(/\.(wav|mp3|opus|m4a)$/);
  if (!m || m.index == null) return null;
  return { stem: k.slice(0, m.index), ext: m[1]! };
}

/**
 * Library + job polling: AAC-in-MP4 (.m4a) only for Safari-safe streaming.
 * Catalog rows may still store `.mp3` / `.wav` — rewrite the playback key.
 * Never serve leftover `.mp3` (historically AAC bytes + audio/mpeg).
 */
export function meditationPlaybackS3Key(key: string): string {
  const k = key.trim();
  if (!hasPlaybackPrefix(k)) return k;
  const parts = stemExt(k);
  if (!parts) return k;
  if (parts.ext === "m4a") return k;
  return `${parts.stem}.m4a`;
}

/**
 * @deprecated AAC-only delivery — do not use for playback. Kept for older
 * call sites that still name a catalog `.mp3` identity.
 */
export function meditationPlaybackFallbackS3Key(key: string): string {
  return meditationPlaybackS3Key(key);
}

/** Rewrite voice URLs under meditations/ or programs/ to `.m4a`. */
export function meditationPlaybackAudioUrl(audioUrl: string): string {
  const u = audioUrl.trim();
  if (!u) return u;
  try {
    const parsed = new URL(u);
    const path = parsed.pathname;
    if (!hasPlaybackPrefix(path)) return u;
    if (!/\.(wav|mp3|opus|m4a)$/i.test(path)) return u;
    parsed.pathname = path.replace(/\.(wav|mp3|opus|m4a)$/i, ".m4a");
    return parsed.toString();
  } catch {
    if (!hasPlaybackPrefix(u)) return u;
    return u.replace(/\.(wav|mp3|opus|m4a)$/i, ".m4a");
  }
}

/**
 * @deprecated AAC-only — same as {@link meditationPlaybackAudioUrl}.
 * Do not reintroduce MP3 fallback URLs.
 */
export function meditationPlaybackFallbackAudioUrl(audioUrl: string): string {
  return meditationPlaybackAudioUrl(audioUrl);
}
