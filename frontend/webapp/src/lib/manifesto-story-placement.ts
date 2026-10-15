/**
 * Shared data for Story cards on Library, Manifest Edit, and Dashboard.
 */

import { hasLibraryMeditationBeenPlayed } from "@/lib/daily-habits";
import {
  loadIdeateVisionBoardStore,
  visionItemHasImage,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import {
  loadManifestoStoryStore,
  storyListeningStreak,
  storyNarrationDrift,
  type ManifestoStoryStoreV1,
  type StoryVersion,
} from "@/lib/manifesto-story";
import type { LibraryMeditationItem } from "@/lib/medimade-api";

export const STORY_NARRATION_HREF = "/manifest/my?view=story&tab=narration";
export const STORY_DRAFT_HREF = "/manifest/my?view=story";

export type NarratedStoryPlacement = {
  store: ManifestoStoryStoreV1;
  version: StoryVersion;
  libraryItem: LibraryMeditationItem;
  minutes: number;
  voice: string | null;
  sound: string | null;
  listenCount: number;
  listenStreak: number;
  changedCount: number;
  visionImageUrls: string[];
};

export function isLibraryStoryItem(
  m: LibraryMeditationItem,
  store: ManifestoStoryStoreV1 = loadManifestoStoryStore(),
): boolean {
  if ((m.meditationStyle ?? "").trim().toLowerCase() === "story") return true;
  const keys = new Set(
    store.versions
      .map((v) => v.audioId?.trim())
      .filter((k): k is string => Boolean(k)),
  );
  if (keys.size === 0) return false;
  return Boolean(
    (m.s3Key && keys.has(m.s3Key)) ||
      (m.sk && keys.has(m.sk)) ||
      (m.id && keys.has(m.id)),
  );
}

export function storyTitlePossessive(firstName: string): string {
  const name = firstName.trim() || "Your";
  if (name.toLowerCase() === "your") return "Your story";
  return `${name}’s story`;
}

export function storyMinutesFromItem(item: LibraryMeditationItem): number {
  const sec = item.durationSeconds;
  if (typeof sec === "number" && Number.isFinite(sec) && sec > 0) {
    return Math.max(1, Math.round(sec / 60));
  }
  return 1;
}

/** Readable label from a bed key when catalog names aren’t loaded. */
export function soundLabelFromKey(key: string | null | undefined): string | null {
  const raw = key?.trim();
  if (!raw) return null;
  const base = raw.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
  if (!base) return null;
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function visionBoardPreviewUrls(
  items: VisionBoardItem[] = loadIdeateVisionBoardStore().items,
  max = 4,
): string[] {
  const urls: string[] = [];
  for (const item of items) {
    if (urls.length >= max) break;
    if (!visionItemHasImage(item)) continue;
    const src = item.imageUrl?.trim();
    if (src) urls.push(src);
  }
  return urls;
}

/** Latest narrated version that has a matching Library Story item. */
export function resolveNarratedStoryPlacement(
  libraryItems: readonly LibraryMeditationItem[],
  store: ManifestoStoryStoreV1 = loadManifestoStoryStore(),
): NarratedStoryPlacement | null {
  const narrated = [...store.versions]
    .filter((v) => Boolean(v.audioId && v.narratedAt))
    .sort((a, b) =>
      (b.narratedAt ?? b.createdAt).localeCompare(a.narratedAt ?? a.createdAt),
    );
  for (const version of narrated) {
    const audioId = version.audioId!.trim();
    const libraryItem =
      libraryItems.find(
        (m) =>
          m.s3Key === audioId ||
          m.sk === audioId ||
          (m.id != null && m.id === audioId),
      ) ?? null;
    if (!libraryItem || !libraryItem.audioUrl) continue;
    const drift = storyNarrationDrift(store.draft, version);
    return {
      store,
      version,
      libraryItem,
      minutes: storyMinutesFromItem(libraryItem),
      voice: libraryItem.speakerName?.trim() || null,
      sound:
        soundLabelFromKey(libraryItem.backgroundMusicKey) ||
        soundLabelFromKey(libraryItem.backgroundNatureKey) ||
        null,
      listenCount: store.listenCount,
      listenStreak: storyListeningStreak(store.listenNights),
      changedCount: drift.changedCount,
      visionImageUrls: visionBoardPreviewUrls(),
    };
  }
  return null;
}

const UNPLAYED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Newest own non-Story meditation created in the last 7 days and never played. */
export function pickUnplayedNewMeditation(
  items: readonly LibraryMeditationItem[],
  now = Date.now(),
  store: ManifestoStoryStoreV1 = loadManifestoStoryStore(),
): LibraryMeditationItem | null {
  const cutoff = now - UNPLAYED_WINDOW_MS;
  const candidates = items
    .filter((m) => {
      if (isLibraryStoryItem(m, store)) return false;
      if (m.archived === true || m.isDraft === true || !m.catalogued) {
        return false;
      }
      if (!m.createdAt) return false;
      const t = Date.parse(m.createdAt);
      if (!Number.isFinite(t) || t < cutoff) return false;
      const id = (m.id || m.sk || m.s3Key || "").trim();
      if (!id) return false;
      if (hasLibraryMeditationBeenPlayed(id)) return false;
      if (m.s3Key && hasLibraryMeditationBeenPlayed(m.s3Key)) return false;
      return true;
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return candidates[0] ?? null;
}

export function storyMetaListenLine(placement: NarratedStoryPlacement): string {
  const streak = placement.listenStreak;
  if (streak >= 1) {
    return `${streak} night${streak === 1 ? "" : "s"} in a row`;
  }
  const n = placement.listenCount;
  if (n > 0) return `Listened ${n} time${n === 1 ? "" : "s"}`;
  return "Start your streak";
}

export function storyCardMetaLine(placement: NarratedStoryPlacement): string {
  return [
    `${placement.minutes} min`,
    placement.voice,
    placement.sound,
    `Listened ${placement.listenCount} time${placement.listenCount === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function storyCardCompactMeta(placement: NarratedStoryPlacement): string {
  return [`${placement.minutes} min`, placement.voice]
    .filter(Boolean)
    .join(" · ");
}

export function storyMatchesSearch(
  placement: NarratedStoryPlacement,
  query: string,
  firstName: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    storyTitlePossessive(firstName),
    "story",
    "your story",
    placement.voice ?? "",
    placement.sound ?? "",
    placement.libraryItem.title ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
