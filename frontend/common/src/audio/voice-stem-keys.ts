/** Both stems use the same stream format so they stay locked. */

let cachedOpusSupport: boolean | null = null;

function browserPlaysOggOpus(): boolean {
  if (cachedOpusSupport !== null) return cachedOpusSupport;
  if (typeof document === "undefined") return false;
  const probe = document.createElement("audio");
  cachedOpusSupport = probe.canPlayType('audio/ogg; codecs="opus"') !== "";
  return cachedOpusSupport;
}

/** Opus for both stems; MP3 only when the browser cannot play Ogg Opus. */
export function voiceStemStreamExt(): ".opus" | ".mp3" {
  return browserPlaysOggOpus() ? ".opus" : ".mp3";
}

export function voiceStemPlaybackUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const ext = voiceStemStreamExt();
  try {
    const u = new URL(trimmed, "https://local.invalid");
    if (!/\.(wav|mp3|opus)$/i.test(u.pathname)) return trimmed;
    u.pathname = u.pathname.replace(/\.(wav|mp3|opus)$/i, ext);
    if (/^https?:\/\//i.test(trimmed)) return u.toString();
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return trimmed.replace(/\.(wav|mp3|opus)$/i, ext);
  }
}

export function voiceStemPlaybackCandidates(url: string): string[] {
  const u = voiceStemPlaybackUrl(url);
  return u ? [u] : [];
}
