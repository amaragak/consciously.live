/**
 * Guide / Manifesto → Create handoff: the caller writes a brief (and optional
 * attached context) to sessionStorage, `CreateOneFlow` consumes it once on
 * mount and fills the Start brief.
 */

const GUIDE_PRACTICE_BRIEF_KEY = "mm_guide_practice_brief_v1";

/** Id of the context attachment used for the Manifesto. */
export const MANIFESTO_CONTEXT_ID = "manifesto";

export type PracticeBriefContext = {
  id: string;
  title: string;
  bodyPlain: string;
};

export type PracticeBriefHandoff = {
  brief: string;
  context: PracticeBriefContext | null;
};

export function writeGuidePracticeBrief(
  brief: string,
  context?: PracticeBriefContext | null,
): void {
  const text = brief.trim();
  if (!text || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      GUIDE_PRACTICE_BRIEF_KEY,
      context ? JSON.stringify({ v: 2, brief: text, context }) : text,
    );
  } catch {
    /* storage unavailable — Create just opens empty */
  }
}

function parseHandoff(raw: string | null): PracticeBriefHandoff | null {
  const text = raw?.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      if (o.v === 2 && typeof o.brief === "string" && o.brief.trim()) {
        const c = o.context as Record<string, unknown> | null | undefined;
        const context =
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          typeof c.bodyPlain === "string"
            ? { id: c.id, title: c.title, bodyPlain: c.bodyPlain }
            : null;
        return { brief: o.brief.trim(), context };
      }
    } catch {
      /* fall through — treat as plain text */
    }
  }
  return { brief: text, context: null };
}

/** Returns the pending handoff (if any) and clears it. */
export function consumeGuidePracticeHandoff(): PracticeBriefHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(GUIDE_PRACTICE_BRIEF_KEY);
    window.sessionStorage.removeItem(GUIDE_PRACTICE_BRIEF_KEY);
    return parseHandoff(raw);
  } catch {
    return null;
  }
}

/** Returns the pending brief (if any) and clears it. */
export function consumeGuidePracticeBrief(): string | null {
  return consumeGuidePracticeHandoff()?.brief ?? null;
}
