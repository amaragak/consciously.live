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

/**
 * User-facing stems are AAC-in-MP4 only (phase-locked dry/FX from one ffmpeg
 * encode). Catalog keys may still end in `.wav` — remap via
 * `voiceStemPlaybackUrl`; never fall back to WAV/MP3 for playback.
 *
 * Speechify Create Sound asks for paced keys (`r0-loud-dry.m4a`, …). When those
 * are not on the CDN yet, fall back to the legacy centre stems
 * (`loud-dry.m4a` / `loud-fx.m4a`) so audition still plays.
 */
export function voiceStemPlaybackCandidates(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const m4a = voiceStemPlaybackUrl(trimmed);
  const out: string[] = [m4a];
  // `…/r-20-loud-dry.m4a` → `…/loud-dry.m4a` (preserve query string).
  const legacySpeechify = m4a.replace(
    /\/r-?\d+-loud-(dry|fx|wet)\.m4a(?=\?|$)/i,
    "/loud-$1.m4a",
  );
  if (legacySpeechify !== m4a) out.push(legacySpeechify);
  return out;
}

/** Same as voice stems — AAC delivery only. */
export function mediaPlaybackCandidates(url: string): string[] {
  return voiceStemPlaybackCandidates(url);
}
