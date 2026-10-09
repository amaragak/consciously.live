export type SoundsHubTab = "custom" | "soundscapes" | "voices";

export const SOUNDS_HREF = "/meditate/sounds";

export const SOUNDS_HUB_TABS: {
  id: SoundsHubTab;
  path: string;
  label: string;
  shortLabel: string;
}[] = [
  {
    id: "soundscapes",
    path: `${SOUNDS_HREF}/soundscapes`,
    label: "Soundscapes",
    shortLabel: "Soundscapes",
  },
  {
    id: "voices",
    path: `${SOUNDS_HREF}/voices`,
    label: "Voices",
    shortLabel: "Voices",
  },
  {
    id: "custom",
    path: SOUNDS_HREF,
    label: "Custom sounds",
    shortLabel: "Custom",
  },
];

/** True when the path is a Custom Sounds editor (new / mix / preset). */
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
  return "custom";
}

export function soundsHubHref(tab: SoundsHubTab): string {
  return SOUNDS_HUB_TABS.find((t) => t.id === tab)?.path ?? SOUNDS_HREF;
}
