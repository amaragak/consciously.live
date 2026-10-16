/**
 * Increment Manifesto Story listen count when a narrated Story plays past 90%.
 * Also records the local noon-to-noon night for streak.
 */

import { recordLocalStoryListen } from "@/lib/daily-habits";
import {
  incrementStoryListenCount,
  listeningSeconds,
  loadManifestoStoryStore,
  saveManifestoStoryStore,
  storyListenNightKey,
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
    // Fallback until the strip reports duration: calibrated speech plus title and fade.
    dur = listeningSeconds(match.wordCount, { fadeOut: store.fadeOutAtEnd });
  }
  if (opts.timeSeconds / dur < 0.9) return;

  firedKeys.add(key);
  saveManifestoStoryStore(
    incrementStoryListenCount(store, { nightKey: storyListenNightKey() }),
  );
  recordLocalStoryListen();
}
