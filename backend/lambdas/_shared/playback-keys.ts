const MEDITATIONS_PREFIX = "meditations/";

function stemExt(key: string): { stem: string; ext: string } | null {
  const k = key.trim();
  const lower = k.toLowerCase();
  const m = lower.match(/\.(wav|mp3|opus|m4a)$/);
  if (!m || m.index == null) return null;
  return { stem: k.slice(0, m.index), ext: m[1]! };
}

/**
 * Library + job polling: prefer AAC-in-MP4 (.m4a) for Safari-safe streaming.
 * Catalog rows may still store `.mp3` / `.wav` — rewrite the playback key.
 */
export function meditationPlaybackS3Key(key: string): string {
  const k = key.trim();
  const lower = k.toLowerCase();
  if (!lower.startsWith(MEDITATIONS_PREFIX)) return k;
  const parts = stemExt(k);
  if (!parts) return k;
  if (parts.ext === "m4a") return k;
  return `${parts.stem}.m4a`;
}

/** Legacy MP3 sibling when `.m4a` is missing (pre-backfill / older gens). */
export function meditationPlaybackFallbackS3Key(key: string): string {
  const k = key.trim();
  const lower = k.toLowerCase();
  if (!lower.startsWith(MEDITATIONS_PREFIX)) return k;
  const parts = stemExt(k);
  if (!parts) return k;
  if (parts.ext === "mp3") return k;
  return `${parts.stem}.mp3`;
}

/** Rewrite `…/meditations/*.(wav|mp3|opus)` URL to `.m4a` for the same stem. */
export function meditationPlaybackAudioUrl(audioUrl: string): string {
  const u = audioUrl.trim();
  if (!u) return u;
  try {
    const parsed = new URL(u);
    const path = parsed.pathname;
    const lower = path.toLowerCase();
    if (!lower.startsWith("/meditations/")) return u;
    if (!/\.(wav|mp3|opus|m4a)$/i.test(path)) return u;
    parsed.pathname = path.replace(/\.(wav|mp3|opus|m4a)$/i, ".m4a");
    return parsed.toString();
  } catch {
    return u.replace(/\.(wav|mp3|opus|m4a)$/i, ".m4a");
  }
}

/** Legacy MP3 URL when `.m4a` 404s. */
export function meditationPlaybackFallbackAudioUrl(audioUrl: string): string {
  const u = audioUrl.trim();
  if (!u) return u;
  try {
    const parsed = new URL(u);
    const path = parsed.pathname;
    const lower = path.toLowerCase();
    if (!lower.startsWith("/meditations/")) return u;
    if (!/\.(wav|mp3|opus|m4a)$/i.test(path)) return u;
    parsed.pathname = path.replace(/\.(wav|mp3|opus|m4a)$/i, ".mp3");
    return parsed.toString();
  } catch {
    return u.replace(/\.(wav|mp3|opus|m4a)$/i, ".mp3");
  }
}
