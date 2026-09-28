/**
 * Wellbeing level helpers + UI visibility rules (Insights v7).
 */

export type WellbeingLevel = "none" | "struggling" | "at_risk";

export type WellbeingInfo = {
  level: WellbeingLevel;
};

export function parseWellbeingLevel(raw: unknown): WellbeingLevel {
  if (raw === "struggling" || raw === "at_risk" || raw === "none") return raw;
  if (raw && typeof raw === "object") {
    const level = (raw as { level?: unknown }).level;
    if (level === "struggling" || level === "at_risk" || level === "none") {
      return level;
    }
  }
  return "none";
}

/** Which pattern/letter surfaces to show for a wellbeing level. */
export function wellbeingVisibility(level: WellbeingLevel): {
  softBanner: boolean;
  fullBanner: boolean;
  emotions: boolean;
  moved: boolean;
  wins: boolean;
  promises: boolean;
  lifts: boolean;
  thoughtMeditation: boolean;
  turnIntoMeditation: boolean;
  mood: boolean;
  entryLinks: boolean;
} {
  if (level === "at_risk") {
    return {
      softBanner: false,
      fullBanner: true,
      emotions: false,
      moved: false,
      wins: false,
      promises: false,
      lifts: false,
      thoughtMeditation: false,
      turnIntoMeditation: false,
      mood: true,
      entryLinks: true,
    };
  }
  if (level === "struggling") {
    return {
      softBanner: true,
      fullBanner: false,
      emotions: true,
      moved: true,
      wins: true,
      promises: true,
      lifts: true,
      thoughtMeditation: true,
      turnIntoMeditation: true,
      mood: true,
      entryLinks: true,
    };
  }
  return {
    softBanner: false,
    fullBanner: false,
    emotions: true,
    moved: true,
    wins: true,
    promises: true,
    lifts: true,
    thoughtMeditation: true,
    turnIntoMeditation: true,
    mood: true,
    entryLinks: true,
  };
}

/** Fixed letter guidance pasted into the model system prompt. */
export const WELLBEING_LETTER_GUIDANCE = {
  struggling:
    "Write a gentle letter. Acknowledge how hard this period has been before any encouragement. No pep talk, no 'wins' framing, no pressure to feel better. Stay warm and steady. Still use light markdown (###, **bold**, _italics_) sparingly.",
  at_risk:
    "Write a short, warm note (about 80–140 words). Acknowledge that things have been heavy. Say they deserve support right now, and gently point them to the support information shown with this insight. No advice, no diagnosis, no phrasing that we 'noticed', 'detected', or 'flagged' anything. No meditation offer. Soft ### optional; keep markdown minimal.",
} as const;

/** Literal token the model must emit; filled at render with the user's display name. */
export const LETTER_NAME_PLACEHOLDER = "[[NAME]]";

/** Replace [[NAME]] with the user's first name (or "friend" if unset). */
export function fillLetterNamePlaceholder(
  markdown: string,
  displayName?: string | null,
): string {
  if (!markdown.includes(LETTER_NAME_PLACEHOLDER)) return markdown;
  const first =
    (displayName ?? "").trim().split(/\s+/).filter(Boolean)[0] || "friend";
  return markdown.split(LETTER_NAME_PLACEHOLDER).join(first);
}
