/** Both stems use the same stream format so they stay locked. */

/** AAC-in-MP4 for both stems (Safari + Chromium). */
export function voiceStemStreamExt(): ".m4a" {
  return ".m4a";
}

export function voiceStemPlaybackUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const ext = voiceStemStreamExt();
  try {
    const u = new URL(trimmed, "https://local.invalid");
    if (!/\.(wav|mp3|opus|m4a)$/i.test(u.pathname)) return trimmed;
    u.pathname = u.pathname.replace(/\.(wav|mp3|opus|m4a)$/i, ext);
    if (/^https?:\/\//i.test(trimmed)) return u.toString();
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return trimmed.replace(/\.(wav|mp3|opus|m4a)$/i, ext);
  }
}

/** Prefer AAC; fall back to MP3 until backfill finishes. */
export function voiceStemPlaybackCandidates(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const m4a = voiceStemPlaybackUrl(trimmed);
  let mp3 = trimmed;
  try {
    const u = new URL(trimmed, "https://local.invalid");
    if (/\.(wav|mp3|opus|m4a)$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\.(wav|mp3|opus|m4a)$/i, ".mp3");
      mp3 = /^https?:\/\//i.test(trimmed)
        ? u.toString()
        : `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    mp3 = trimmed.replace(/\.(wav|mp3|opus|m4a)$/i, ".mp3");
  }
  return m4a === mp3 ? [m4a] : [m4a, mp3];
}

/** Baked meditation / sample URL: prefer `.m4a`, fall back to `.mp3`. */
export function mediaPlaybackCandidates(url: string): string[] {
  return voiceStemPlaybackCandidates(url);
}
