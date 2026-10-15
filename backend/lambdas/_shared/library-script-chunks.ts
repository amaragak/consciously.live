/**
 * Timed script chunks for Library meditation detail (follow-along).
 * Times are absolute on the delivered voice stem (includes title intro).
 */

import {
  parseScriptIntoSegments,
  spokenTitleForTts,
  type ScriptPauseBand,
  type ScriptSegment,
} from "./script-pause-bands";

export type LibraryScriptChunk = {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
  /** Silence after this chunk before the next speech (scaled render seconds). */
  pauseAfterMs?: number;
};

export function sanitizeChunkDisplayText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/**
 * Walk TTS segments + measured speech durations into library display chunks.
 * Skips the spoken title intro segment (when present) so chunks align with
 * the body `scriptText` shown in the app, while startMs stays absolute.
 */
export function buildLibraryScriptChunks(params: {
  segments: ScriptSegment[];
  /** Duration of each non-empty speech segment, in order. */
  speechDurationsMs: number[];
  pauseScale: number;
  meditationTitle?: string | null;
}): LibraryScriptChunk[] {
  const pauseScale =
    typeof params.pauseScale === "number" && Number.isFinite(params.pauseScale)
      ? params.pauseScale
      : 1;
  const spokenTitle = sanitizeChunkDisplayText(
    spokenTitleForTts(params.meditationTitle),
  );
  let speechI = 0;
  let cursorMs = 0;
  let skippedTitle = !spokenTitle;
  const out: LibraryScriptChunk[] = [];

  for (const seg of params.segments) {
    const text = sanitizeChunkDisplayText(seg.text);
    if (text) {
      const speechMs = Math.max(0, params.speechDurationsMs[speechI] ?? 0);
      speechI += 1;
      const startMs = Math.round(cursorMs);
      const endMs = Math.round(cursorMs + speechMs);
      const pauseAfterMs =
        seg.pauseSeconds > 0
          ? Math.round(seg.pauseSeconds * pauseScale * 1000)
          : 0;
      cursorMs = endMs + pauseAfterMs;

      if (!skippedTitle && textsMatchSpokenTitle(text, spokenTitle)) {
        skippedTitle = true;
        continue;
      }
      skippedTitle = true;
      out.push({
        index: out.length,
        text,
        startMs,
        endMs,
        ...(pauseAfterMs > 0 ? { pauseAfterMs } : {}),
      });
    } else if (seg.pauseSeconds > 0) {
      cursorMs += Math.round(seg.pauseSeconds * pauseScale * 1000);
    }
  }

  return out;
}

function textsMatchSpokenTitle(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.!?…]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

/** Convenience: parse script + build from measured speech ms list. */
export function buildLibraryScriptChunksFromScript(params: {
  ttsScript: string;
  speechDurationsMs: number[];
  pauseScale: number;
  pauseBands?: Record<ScriptPauseBand, number>;
  meditationTitle?: string | null;
}): LibraryScriptChunk[] {
  const segments = parseScriptIntoSegments(params.ttsScript, params.pauseBands);
  return buildLibraryScriptChunks({
    segments,
    speechDurationsMs: params.speechDurationsMs,
    pauseScale: params.pauseScale,
    meditationTitle: params.meditationTitle,
  });
}

/** Normalize a Dynamo / API payload into timed chunks (or null). */
export function normalizeLibraryScriptChunks(
  raw: unknown,
): LibraryScriptChunk[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: LibraryScriptChunk[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") return null;
    const o = row as Record<string, unknown>;
    const text =
      typeof o.text === "string" ? sanitizeChunkDisplayText(o.text) : "";
    const startMs =
      typeof o.startMs === "number" && Number.isFinite(o.startMs)
        ? Math.max(0, Math.round(o.startMs))
        : NaN;
    const endMs =
      typeof o.endMs === "number" && Number.isFinite(o.endMs)
        ? Math.max(0, Math.round(o.endMs))
        : NaN;
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return null;
    }
    const pauseAfterMs =
      typeof o.pauseAfterMs === "number" &&
      Number.isFinite(o.pauseAfterMs) &&
      o.pauseAfterMs > 0
        ? Math.round(o.pauseAfterMs)
        : undefined;
    out.push({
      index: typeof o.index === "number" ? o.index : i,
      text,
      startMs,
      endMs: Math.max(endMs, startMs),
      ...(pauseAfterMs != null ? { pauseAfterMs } : {}),
    });
  }
  return out;
}
