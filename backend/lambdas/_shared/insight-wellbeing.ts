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

/** Default prod cap (UTC day). Override with env `INSIGHTS_DAILY_GENERATION_LIMIT` (`0` = off). */
export const INSIGHTS_DAILY_GENERATION_LIMIT = 5;

/**
 * Effective daily cap, or `null` when unlimited.
 * Env `INSIGHTS_DAILY_GENERATION_LIMIT=0` (or `off` / `unlimited`) disables the cap.
 */
export function resolveInsightsDailyLimit(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env.INSIGHTS_DAILY_GENERATION_LIMIT?.trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false" || raw === "unlimited") {
    return null;
  }
  if (raw && /^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    if (n <= 0) return null;
    return n;
  }
  return INSIGHTS_DAILY_GENERATION_LIMIT;
}

/** Next UTC midnight — when `GENCOUNT#YYYY-MM-DD` rolls over. */
export function nextInsightsQuotaResetAt(now = new Date()): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
}

function isLikelyTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Warm copy for the 429 daily-limit response, with a concrete reset time.
 */
export function formatInsightsDailyLimitMessage(params: {
  now?: Date;
  timeZone?: string | null;
}): { error: string; resetsAt: string } {
  const now = params.now ?? new Date();
  const resetsAt = nextInsightsQuotaResetAt(now);
  const tz =
    params.timeZone?.trim() && isLikelyTimeZone(params.timeZone.trim())
      ? params.timeZone.trim()
      : "UTC";

  let whenLabel: string;
  try {
    whenLabel = resetsAt.toLocaleString("en-GB", {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    whenLabel = `${resetsAt.toISOString().slice(11, 16)} UTC`;
  }

  const ms = resetsAt.getTime() - now.getTime();
  const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  const relative =
    hours === 1 ? "in about an hour" : `in about ${hours} hours`;

  return {
    resetsAt: resetsAt.toISOString(),
    error: `You've used today's insights — rest easy. Fresh ones unlock ${whenLabel} (${relative}).`,
  };
}

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
