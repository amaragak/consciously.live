/**
 * Insight periods (Insights v6): last 7 days / last 30 days / custom / legacy week.
 *
 * All periods are inclusive calendar-date ranges in the *user's* time zone. The
 * client sends an IANA zone name; everything here converts date-only strings to
 * absolute instants with that zone, so a DST change inside a range still gives
 * local midnight-to-midnight bounds.
 */

export type InsightPeriodType = "last7" | "last30" | "custom" | "week";

export const MAX_CUSTOM_RANGE_DAYS = 90;

/**
 * Maximum journal body text sent to the model per request.
 *
 * 24,000 characters ≈ 6,000 tokens, which leaves room for meditation chats,
 * mood tags and the instructions inside a single Haiku call. A 90-day period
 * with heavy journalling goes well past this, so entries are shortened
 * proportionally (start and end kept) rather than dropped.
 */
export const JOURNAL_TEXT_BUDGET_CHARS = 24_000;

/** Never shorten a single entry below this — a stub is worse than nothing. */
export const MIN_ENTRY_CHARS = 240;

export type InsightPeriod = {
  periodType: InsightPeriodType;
  /** Inclusive first calendar day, YYYY-MM-DD in the user's zone. */
  startDate: string;
  /** Inclusive last calendar day, YYYY-MM-DD in the user's zone. */
  endDate: string;
  /** Absolute instant of local 00:00:00.000 on startDate. */
  startIso: string;
  /** Absolute instant of local 23:59:59.999 on endDate. */
  endIso: string;
  /** Inclusive day count. */
  days: number;
  timeZone: string;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_ONLY.exec(value.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

function dateOnlyToUtcMs(dateStr: string): number {
  const m = DATE_ONLY.exec(dateStr)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function utcMsToDateOnly(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Calendar arithmetic on YYYY-MM-DD; crosses month and year ends. */
export function addDaysToDate(dateStr: string, n: number): string {
  return utcMsToDateOnly(dateOnlyToUtcMs(dateStr) + n * 86_400_000);
}

/** Inclusive day count between two YYYY-MM-DD dates (1 for the same day). */
export function daysBetweenInclusive(startDate: string, endDate: string): number {
  return (
    Math.round((dateOnlyToUtcMs(endDate) - dateOnlyToUtcMs(startDate)) / 86_400_000) +
    1
  );
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date. */
export function dayOfWeek(dateStr: string): number {
  return new Date(dateOnlyToUtcMs(dateStr)).getUTCDay();
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` at `instant`, in ms (local − UTC). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string): number => {
    const v = parts.find((p) => p.type === type)?.value ?? "0";
    return Number(v);
  };
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Wall-clock time in `timeZone` → absolute instant (two-pass, DST-safe). */
export function zonedWallClockToInstant(
  dateStr: string,
  hours: number,
  minutes: number,
  seconds: number,
  ms: number,
  timeZone: string,
): Date {
  const naive =
    dateOnlyToUtcMs(dateStr) +
    hours * 3_600_000 +
    minutes * 60_000 +
    seconds * 1000 +
    ms;
  let guess = naive - zoneOffsetMs(new Date(naive), timeZone);
  guess = naive - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Today's calendar date in `timeZone`. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now).slice(0, 10);
}

/** Inclusive local-day bounds as absolute instants. */
export function zonedRangeToIso(
  startDate: string,
  endDate: string,
  timeZone: string,
): { startIso: string; endIso: string } {
  const start = zonedWallClockToInstant(startDate, 0, 0, 0, 0, timeZone);
  const end = zonedWallClockToInstant(endDate, 23, 59, 59, 999, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Monday–Sunday window containing `dateStr` (legacy weekly insights). */
export function weekBoundsForDate(dateStr: string): {
  startDate: string;
  endDate: string;
} {
  const dow = dayOfWeek(dateStr);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const startDate = addDaysToDate(dateStr, mondayOffset);
  return { startDate, endDate: addDaysToDate(startDate, 6) };
}

export function parsePeriodType(raw: unknown): InsightPeriodType | null {
  if (raw === "last7" || raw === "last30" || raw === "custom" || raw === "week") {
    return raw;
  }
  return null;
}

export type ResolvePeriodResult =
  | { ok: true; period: InsightPeriod }
  | { ok: false; error: string };

/**
 * Turn a request (query string or body) into a validated period.
 * Server-side twin of the dialog's validation.
 */
export function resolveInsightPeriod(
  input: {
    periodType?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    /** Legacy: a date inside the wanted Monday–Sunday week. */
    week?: unknown;
    timeZone?: unknown;
  },
  now: Date = new Date(),
): ResolvePeriodResult {
  const timeZone = isValidTimeZone(input.timeZone)
    ? (input.timeZone as string).trim()
    : "UTC";
  const today = todayInTimeZone(timeZone, now);
  const requested = parsePeriodType(input.periodType);

  const finish = (
    periodType: InsightPeriodType,
    startDate: string,
    endDate: string,
  ): ResolvePeriodResult => {
    const days = daysBetweenInclusive(startDate, endDate);
    if (days < 1) return { ok: false, error: "From must be on or before To" };
    if (days > MAX_CUSTOM_RANGE_DAYS) {
      return {
        ok: false,
        error: `A period can cover at most ${MAX_CUSTOM_RANGE_DAYS} days`,
      };
    }
    const { startIso, endIso } = zonedRangeToIso(startDate, endDate, timeZone);
    return {
      ok: true,
      period: { periodType, startDate, endDate, startIso, endIso, days, timeZone },
    };
  };

  // Explicit start/end win over last7/last30 so regenerate keeps the same range.
  const hasRange = isDateOnly(input.startDate) && isDateOnly(input.endDate);
  if (hasRange) {
    const startDate = (input.startDate as string).trim();
    const endDate = (input.endDate as string).trim();
    if (endDate > today) {
      return { ok: false, error: "To can't be later than today" };
    }
    if (startDate > endDate) {
      return { ok: false, error: "From must be on or before To" };
    }
    return finish(requested ?? "custom", startDate, endDate);
  }

  if (typeof input.startDate === "string" || typeof input.endDate === "string") {
    const bad =
      !isDateOnly(input.startDate) && typeof input.startDate === "string"
        ? "From"
        : "To";
    return { ok: false, error: `${bad} must be a valid date (YYYY-MM-DD)` };
  }

  if (requested === "last7" || requested === "last30") {
    const span = requested === "last7" ? 7 : 30;
    return finish(requested, addDaysToDate(today, -(span - 1)), today);
  }

  // Legacy clients: a week key, or nothing at all → the current week.
  const weekAnchor = isDateOnly(input.week) ? (input.week as string).trim() : today;
  const bounds = weekBoundsForDate(weekAnchor);
  return finish("week", bounds.startDate, bounds.endDate);
}

/** Dynamo sort key. One insight per exact range, so regenerating replaces it. */
export function insightSortKey(startDate: string, endDate: string): string {
  return `RANGE#${startDate}#${endDate}`;
}

/** URL/deep-link key: `YYYY-MM-DD_YYYY-MM-DD`. */
export function insightRangeKey(startDate: string, endDate: string): string {
  return `${startDate}_${endDate}`;
}

export function parseInsightRangeKey(
  key: string,
): { startDate: string; endDate: string } | null {
  const raw = key.trim();
  const parts = raw.split("_");
  if (parts.length === 2 && isDateOnly(parts[0]) && isDateOnly(parts[1])) {
    return { startDate: parts[0]!, endDate: parts[1]! };
  }
  // A bare date is an old Monday-only week link.
  if (isDateOnly(raw)) return weekBoundsForDate(raw);
  return null;
}

/**
 * A stored WEEKLY# row read back as a v6 period. Legacy rows keep their
 * Monday–Sunday dates and become `periodType: 'week'`; nothing is lost.
 */
export function migrateStoredPeriod(item: {
  sk?: unknown;
  periodType?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  weekKey?: unknown;
  weekStart?: unknown;
  weekEnd?: unknown;
}): { periodType: InsightPeriodType; startDate: string; endDate: string } | null {
  if (isDateOnly(item.startDate) && isDateOnly(item.endDate)) {
    return {
      periodType: parsePeriodType(item.periodType) ?? "custom",
      startDate: (item.startDate as string).trim(),
      endDate: (item.endDate as string).trim(),
    };
  }
  const sk = typeof item.sk === "string" ? item.sk : "";
  if (sk.startsWith("RANGE#")) {
    const [, start, end] = sk.split("#");
    if (isDateOnly(start) && isDateOnly(end)) {
      return {
        periodType: parsePeriodType(item.periodType) ?? "custom",
        startDate: start,
        endDate: end,
      };
    }
  }
  const weekKey = isDateOnly(item.weekKey)
    ? (item.weekKey as string).trim()
    : sk.startsWith("WEEKLY#") && isDateOnly(sk.slice("WEEKLY#".length))
      ? sk.slice("WEEKLY#".length)
      : null;
  if (!weekKey) return null;
  const bounds = weekBoundsForDate(weekKey);
  return { periodType: "week", startDate: bounds.startDate, endDate: bounds.endDate };
}

/** How the letter should talk about the period. */
export function periodPhraseForPrompt(period: {
  startDate: string;
  endDate: string;
  days: number;
}): string {
  const range = formatRangeWords(period.startDate, period.endDate);
  if (period.days <= 7) return "this week";
  if (period.days >= 28 && period.days <= 31) return "this month";
  if (period.days % 7 === 0) {
    const weeks = period.days / 7;
    return `these ${numberWord(weeks)} weeks, ${range}`;
  }
  return `these ${period.days} days, ${range}`;
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

/** “14–28 Sept” / “30 Aug – 28 Sept”, stable across locales for the prompt. */
export function formatRangeWords(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = endDate.split("-").map(Number) as [number, number, number];
  if (sy === ey && sm === em) return `${sd}–${ed} ${MONTHS[em - 1]}`;
  if (sy === ey) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]}`;
  return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
}

/**
 * Shorten texts so their combined length fits `budget`, keeping each entry's
 * start and end. Entries are cut proportionally; none drops out entirely.
 */
export function trimTextsToBudget(
  texts: string[],
  budget: number = JOURNAL_TEXT_BUDGET_CHARS,
  minChars: number = MIN_ENTRY_CHARS,
): string[] {
  const total = texts.reduce((n, t) => n + t.length, 0);
  if (total <= budget || total === 0) return texts;

  const ratio = budget / total;
  const targets = texts.map((t) =>
    Math.min(t.length, Math.max(minChars, Math.round(t.length * ratio))),
  );

  // Short entries kept whole can push the total back over budget; take the
  // overflow from the entries that still have slack above the floor.
  let over = targets.reduce((n, t) => n + t, 0) - budget;
  if (over > 0) {
    const slack = targets.reduce((n, t) => n + Math.max(0, t - minChars), 0);
    if (slack > 0) {
      const cut = Math.min(over, slack);
      for (let i = 0; i < targets.length; i += 1) {
        const s = Math.max(0, targets[i]! - minChars);
        if (s === 0) continue;
        targets[i] = targets[i]! - Math.floor((s / slack) * cut);
      }
      over = targets.reduce((n, t) => n + t, 0) - budget;
    }
  }

  return texts.map((t, i) => clipKeepingEnds(t, targets[i]!));
}

const TRIM_MARKER = " […] ";

/** Keep ~60% from the start and the rest from the end. */
export function clipKeepingEnds(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const room = maxChars - TRIM_MARKER.length;
  if (room <= 0) return text.slice(0, Math.max(0, maxChars));
  const head = Math.ceil(room * 0.6);
  const tail = room - head;
  return `${text.slice(0, head)}${TRIM_MARKER}${tail > 0 ? text.slice(text.length - tail) : ""}`;
}
