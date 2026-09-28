/**
 * Per-type library / create / Read pill colours.
 * Keys are lowercase labels; "Movement meditation" maps to Movement.
 * Light surface = cream pages; dark surface = hybrid / dark navy.
 */

export type MeditationTypePillColors = { bg: string; fg: string };

const DEFAULT_PILL_LIGHT: MeditationTypePillColors = {
  bg: "rgba(180,140,80,0.12)",
  fg: "#7A5010",
};

const DEFAULT_PILL_DARK: MeditationTypePillColors = {
  bg: "rgba(232,200,130,0.22)",
  fg: "#F0E0B8",
};

const PILLS_LIGHT: Record<string, MeditationTypePillColors> = {
  "body scan": { bg: "rgba(184,100,26,0.10)", fg: "#8A4A0F" },
  visualization: { bg: "rgba(26,107,184,0.10)", fg: "#0F4C8A" },
  "breath-led": { bg: "rgba(26,140,107,0.10)", fg: "#0F6B50" },
  manifestation: { bg: "rgba(131,50,184,0.10)", fg: "#5C1F8A" },
  "affirmation loop": { bg: "rgba(131,50,184,0.10)", fg: "#5C1F8A" },
  story: { bg: "rgba(180,140,80,0.12)", fg: "#7A5010" },
  reflection: { bg: "rgba(26,107,184,0.10)", fg: "#0F4C8A" },
  sleep: { bg: "rgba(50,80,150,0.10)", fg: "#1F3A8A" },
  "loving-kindness": { bg: "rgba(184,60,100,0.10)", fg: "#8A1F4A" },
  "anxiety relief": { bg: "rgba(26,140,107,0.10)", fg: "#0F6B50" },
  movement: { bg: "rgba(184,100,26,0.10)", fg: "#8A4A0F" },
  "movement meditation": { bg: "rgba(184,100,26,0.10)", fg: "#8A4A0F" },
  "open awareness": { bg: "rgba(26,107,184,0.10)", fg: "#0F4C8A" },
};

/** Brighter fg + stronger wash so pills read on hybrid / dark navy. */
const PILLS_DARK: Record<string, MeditationTypePillColors> = {
  "body scan": { bg: "rgba(232,160,90,0.24)", fg: "#F2C896" },
  visualization: { bg: "rgba(110,170,230,0.22)", fg: "#B8D8F5" },
  "breath-led": { bg: "rgba(100,200,170,0.22)", fg: "#B0E8D4" },
  manifestation: { bg: "rgba(190,140,230,0.24)", fg: "#E0C4F5" },
  "affirmation loop": { bg: "rgba(190,140,230,0.24)", fg: "#E0C4F5" },
  story: { bg: "rgba(232,200,130,0.22)", fg: "#F0E0B8" },
  reflection: { bg: "rgba(110,170,230,0.22)", fg: "#B8D8F5" },
  sleep: { bg: "rgba(140,160,220,0.24)", fg: "#C8D0F0" },
  "loving-kindness": { bg: "rgba(230,130,170,0.24)", fg: "#F0C0D4" },
  "anxiety relief": { bg: "rgba(100,200,170,0.22)", fg: "#B0E8D4" },
  movement: { bg: "rgba(232,160,90,0.24)", fg: "#F2C896" },
  "movement meditation": { bg: "rgba(232,160,90,0.24)", fg: "#F2C896" },
  "open awareness": { bg: "rgba(110,170,230,0.22)", fg: "#B8D8F5" },
};

export type MeditationTypePillSurface = "light" | "dark";

/** True when the document root is a dark / hybrid colour scheme. */
export function meditationTypePillSurfaceFromDom(): MeditationTypePillSurface {
  if (typeof document === "undefined") return "light";
  const c = document.documentElement.classList;
  if (c.contains("hybrid") || c.contains("dark") || c.contains("v2")) {
    return "dark";
  }
  return "light";
}

/** Resolve pill colours for a meditation type / category / blog tag label. */
export function meditationTypePillColors(
  label: string | null | undefined,
  surface: MeditationTypePillSurface = "light",
): MeditationTypePillColors {
  const raw = (label ?? "").trim();
  const table = surface === "dark" ? PILLS_DARK : PILLS_LIGHT;
  const fallback = surface === "dark" ? DEFAULT_PILL_DARK : DEFAULT_PILL_LIGHT;
  if (!raw || raw === "—") return fallback;
  // Compound library labels ("Type · Style") — colour by the type segment.
  const primary = raw.split("·")[0]?.trim() ?? raw;
  const key = primary.toLowerCase();
  return table[key] ?? fallback;
}

/** Shared class for colour-coded type pills (colours via inline style). */
export const MEDITATION_TYPE_PILL_CLASS =
  "inline-block rounded-[10px] px-[9px] py-[3px] text-[10px] font-medium uppercase tracking-[0.06em]";
