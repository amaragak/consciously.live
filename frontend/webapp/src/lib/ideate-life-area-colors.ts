/**
 * Fixed card backgrounds for Ideate life areas —
 * assigned in creation order (cycles after 5).
 *
 * Variations of the SPA header navy (`#1E232E`).
 */

export const LIFE_AREA_CARD_PALETTE_LIGHT = [
  "#1E232E",
  "#262C3A",
  "#2E3646",
  "#242A36",
  "#343C4E",
] as const;

/** Slightly lifted so the same navy family still separates from a dark page. */
export const LIFE_AREA_CARD_PALETTE_DARK = [
  "#2A3140",
  "#323A4C",
  "#242A38",
  "#303848",
  "#3A4456",
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
