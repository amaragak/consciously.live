import {
  COMPOSITION_COMPOSERS,
  DEFAULT_COMPOSITION_COMPOSER,
  type BackgroundAudioItem,
  type CompositionComposer,
} from "@/lib/medimade-api";

/** Pack-row chip that filters by composer (not customPackName). */
export const CONSCIOUSLY_ORIGINALS_PACK = "Consciously Originals" as const;

/** Resolve catalog composer; missing → zenmix (pre-backfill default). */
export function compositionArtist(
  item: Pick<BackgroundAudioItem, "composer">,
): CompositionComposer {
  const raw = item.composer?.trim() ?? "";
  if ((COMPOSITION_COMPOSERS as readonly string[]).includes(raw)) {
    return raw as CompositionComposer;
  }
  return DEFAULT_COMPOSITION_COMPOSER;
}

/** True when the pack chip should match this item via composer credit. */
export function matchesConsciouslyOriginalsPack(
  item: Pick<BackgroundAudioItem, "composer">,
): boolean {
  return compositionArtist(item) === CONSCIOUSLY_ORIGINALS_PACK;
}

/** Public soundscape pickers hide this catalog until the flag is turned off. */
export const HIDE_CONSCIOUSLY_ORIGINALS_FROM_PUBLIC = true;

export function isPublicSoundscapeHidden(
  item: Pick<BackgroundAudioItem, "composer" | "customPackName">,
): boolean {
  if (!HIDE_CONSCIOUSLY_ORIGINALS_FROM_PUBLIC) return false;
  if (matchesConsciouslyOriginalsPack(item)) return true;
  return (item.customPackName ?? "").trim() === CONSCIOUSLY_ORIGINALS_PACK;
}
