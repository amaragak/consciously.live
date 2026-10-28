export type SoundsHubTab = "custom" | "soundscapes" | "voices";

export const SOUNDS_HREF = "/meditate/sounds";

/** Custom mix hub (Build your own). Bare `/meditate/sounds` redirects to Soundscapes. */
export const SOUNDS_CUSTOM_HREF = `${SOUNDS_HREF}/custom`;

export const SOUNDS_HUB_TABS: {
  id: SoundsHubTab;
  label: string;
  shortLabel: string;
  path: string;
}[] = [
  {
    id: "soundscapes",
    label: "Soundscapes",
    shortLabel: "Soundscapes",
    path: `${SOUNDS_HREF}/soundscapes`,
  },
  {
    id: "voices",
    label: "Voices",
    shortLabel: "Voices",
    path: `${SOUNDS_HREF}/voices`,
  },
  {
    id: "custom",
    label: "Custom sounds",
    shortLabel: "Custom",
    path: SOUNDS_CUSTOM_HREF,
  },
];

export function isSoundsCustomEditorPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || SOUNDS_HREF;
  if (p === `${SOUNDS_HREF}/new`) return true;
  if (p.startsWith(`${SOUNDS_HREF}/mix/`)) return true;
  if (p.startsWith(`${SOUNDS_HREF}/preset/`)) return true;
  return false;
}

export function soundsHubTabFromPath(pathname: string): SoundsHubTab {
  const p = pathname.replace(/\/$/, "") || SOUNDS_HREF;
  if (p === `${SOUNDS_HREF}/soundscapes`) return "soundscapes";
  if (p === `${SOUNDS_HREF}/voices`) return "voices";
  if (p === SOUNDS_CUSTOM_HREF || isSoundsCustomEditorPath(pathname)) {
    return "custom";
  }
  // Bare hub used to be custom; now Soundscapes is the default landing.
  return "soundscapes";
}

export function soundsHubHref(tab: SoundsHubTab): string {
  return SOUNDS_HUB_TABS.find((t) => t.id === tab)?.path ?? SOUNDS_CUSTOM_HREF;
}
