/**
 * Insights v7 wellbeing — shared prompt wording (keep in sync with FE).
 */

export type WellbeingLevel = "none" | "struggling" | "at_risk";

export const WELLBEING_LETTER_GUIDANCE = {
  struggling:
    "Write a gentle letter. Acknowledge how hard this period has been before any encouragement. No pep talk, no 'wins' framing, no pressure to feel better. Stay warm and steady. Still use light markdown (###, **bold**, _italics_) sparingly.",
  at_risk:
    "Write a short, warm note (about 80–140 words). Acknowledge that things have been heavy. Say they deserve support right now, and gently point them to the support information shown with this insight. No advice, no diagnosis, no phrasing that we 'noticed', 'detected', or 'flagged' anything. No meditation offer. Soft ### optional; keep markdown minimal.",
} as const;

/** Literal token the model must emit; the client fills this with the user's display name. */
export const LETTER_NAME_PLACEHOLDER = "[[NAME]]";

export const INSIGHTS_DAILY_GENERATION_LIMIT = 5;

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
