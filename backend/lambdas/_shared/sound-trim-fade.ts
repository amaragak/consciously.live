/**
 * ffmpeg filter chain for trimming a bed and baking edge fades into streaming AAC.
 *
 * Must use atrim + asetpts so the timeline starts at 0. Using `-ss` after `-i`
 * keeps original PTS, and then `afade=st=0` never applies (fade-in is skipped).
 */

const EDGE_FADE_SEC = 0.01;

/**
 * Fades at the clip edges. The tiny default is a de-click, not a musical fade —
 * an explicit fade time replaces it. Neither may exceed a quarter of the clip.
 * Assumes the stream timeline starts at 0 (after `asetpts=PTS-STARTPTS`).
 */
export function fadeFilter(
  clipDurSec: number,
  fadeInSec: number,
  fadeOutSec: number,
): string | null {
  const cap = clipDurSec / 4;
  const fadeIn = Math.min(fadeInSec > 0 ? fadeInSec : EDGE_FADE_SEC, cap);
  const fadeOut = Math.min(fadeOutSec > 0 ? fadeOutSec : EDGE_FADE_SEC, cap);
  const parts: string[] = [];
  if (fadeIn > 0) parts.push(`afade=t=in:st=0:d=${fadeIn}:curve=qsin`);
  if (fadeOut > 0) {
    parts.push(
      `afade=t=out:st=${Math.max(0, clipDurSec - fadeOut)}:d=${fadeOut}:curve=qsin`,
    );
  }
  return parts.length > 0 ? parts.join(",") : null;
}

/** Trim in the filter graph and zero PTS so afade st=0 is the clip start. */
export function trimAndFadeFilter(
  startSec: number,
  endSec: number | null,
  clipDurSec: number,
  fadeInSec: number,
  fadeOutSec: number,
): string {
  const parts: string[] = [];
  if (endSec != null) {
    parts.push(`atrim=start=${startSec}:end=${endSec}`);
  } else if (startSec > 0) {
    parts.push(`atrim=start=${startSec}`);
  }
  if (parts.length > 0) parts.push("asetpts=PTS-STARTPTS");
  const fade = fadeFilter(clipDurSec, fadeInSec, fadeOutSec);
  if (fade) parts.push(fade);
  return parts.join(",");
}

export function clipDurationSec(
  startSec: number,
  endSec: number | null,
  sourceDurSec: number,
): number {
  if (endSec != null) return Math.max(0, endSec - startSec);
  return Math.max(0, sourceDurSec - startSec);
}
