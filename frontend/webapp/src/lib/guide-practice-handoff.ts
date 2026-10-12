/**
 * Guide → Create handoff: the reader writes a practice brief to
 * sessionStorage, `CreateOneFlow` consumes it once on mount and fills the
 * Start brief.
 */

const GUIDE_PRACTICE_BRIEF_KEY = "mm_guide_practice_brief_v1";

export function writeGuidePracticeBrief(brief: string): void {
  const text = brief.trim();
  if (!text || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(GUIDE_PRACTICE_BRIEF_KEY, text);
  } catch {
    /* storage unavailable — Create just opens empty */
  }
}

/** Returns the pending brief (if any) and clears it. */
export function consumeGuidePracticeBrief(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const text = window.sessionStorage.getItem(GUIDE_PRACTICE_BRIEF_KEY);
    window.sessionStorage.removeItem(GUIDE_PRACTICE_BRIEF_KEY);
    return text?.trim() || null;
  } catch {
    return null;
  }
}
