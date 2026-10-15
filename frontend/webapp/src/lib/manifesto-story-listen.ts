/**
 * Increment Manifesto Story listen count when a narrated Story plays past 80%.
 */

import {
  incrementStoryListenCount,
  loadManifestoStoryStore,
  saveManifestoStoryStore,
} from "@/lib/manifesto-story";

const firedKeys = new Set<string>();

/** Call from the library player as playback time updates. */
export function maybeCountManifestoStoryListen(opts: {
  s3Key: string;
  timeSeconds: number;
  durationSeconds: number | null | undefined;
}): void {
  const key = opts.s3Key.trim();
  if (!key || firedKeys.has(key)) return;

  const store = loadManifestoStoryStore();
  const match = store.versions.find((v) => v.audioId === key);
  if (!match) return;

  let dur =
    typeof opts.durationSeconds === "number" && opts.durationSeconds > 0
      ? opts.durationSeconds
      : 0;
  if (dur <= 0) {
    // Fallback until the strip reports duration: ~140 wpm + short bed outro.
    dur = Math.max(60, (match.wordCount / 140) * 60 + 25);
  }
  if (opts.timeSeconds / dur < 0.8) return;

  firedKeys.add(key);
  saveManifestoStoryStore(incrementStoryListenCount(store));
}
