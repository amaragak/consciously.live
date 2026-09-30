/**
 * Fixed card backgrounds for Ideate life areas —
 * assigned in creation order (cycles after 5).
 *
 * Light: soft golds mixed from tab / `--gold` (`#C8A46A`) into cream.
 * Dark: slate navy tones aligned with marketing band / panel cards.
 */

export const LIFE_AREA_CARD_PALETTE_LIGHT = [
  "#E1CDAD",
  "#ECDFCA",
  "#DBC39D",
  "#DFC9A6",
  "#E6D5BA",
] as const;

/** Dark counterparts — soft navy panels like marketing-card / band surfaces. */
export const LIFE_AREA_CARD_PALETTE_DARK = [
  "#2A3544",
  "#323E4F",
  "#243447",
  "#2F3C4D",
  "#283443",
] as const;

export const LIFE_AREA_CARD_PALETTE = LIFE_AREA_CARD_PALETTE_LIGHT;

function paletteIndex(creationIndex: number, length: number): number {
  return ((creationIndex % length) + length) % length;
}

export function lifeAreaCardBackground(creationIndex: number): string {
  const i = paletteIndex(creationIndex, LIFE_AREA_CARD_PALETTE_LIGHT.length);
  return LIFE_AREA_CARD_PALETTE_LIGHT[i]!;
}

export function lifeAreaCardBackgroundDark(creationIndex: number): string {
  const i = paletteIndex(creationIndex, LIFE_AREA_CARD_PALETTE_DARK.length);
  return LIFE_AREA_CARD_PALETTE_DARK[i]!;
}

/** Inline CSS vars so `.dark .life-area-card` can swap fill without a JS theme hook. */
export function lifeAreaCardBgVars(creationIndex: number): React.CSSProperties {
  return {
    ["--life-area-bg" as string]: lifeAreaCardBackground(creationIndex),
    ["--life-area-bg-dark" as string]: lifeAreaCardBackgroundDark(creationIndex),
  };
}
