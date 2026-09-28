/**
 * "What lifts you" — staged activity/mood co-occurrence (Insights v5).
 * Pure counting over journal moods + weekly-extracted activities. No model calls.
 */

export type WhatLiftsEntry = {
  id: string;
  /** createdAt / updatedAt ISO */
  at: string;
  mood?: string | null;
};

export type WhatLiftsActivityRow = {
  entryId: string;
  items: string[];
};

export type WhatLiftsLetter = {
  weekKey: string;
  activities?: WhatLiftsActivityRow[];
};

export type WhatLiftsActivityHit = {
  /** Display label (first-seen casing after normalise key). */
  label: string;
  /** Days on this side the activity appears. */
  count: number;
  /** Total good or low days on that side (for “3 of 4”). */
  of: number;
};

export type WhatLiftsStage = 1 | 2 | 3;

export type WhatLiftsYouResult = {
  stage: WhatLiftsStage | "empty";
  windowWeeks: number;
  windowLabel: string;
  goodDays: number;
  lowDays: number;
  moodTaggedDays: number;
  goodLabel: string;
  lowLabel: string;
  good: WhatLiftsActivityHit[];
  low: WhatLiftsActivityHit[];
  /** Stages 1–2 only. */
  footer: string | null;
  emptyMessage: string | null;
};

const FOOTER_EARLY =
  "Early days: this gets clearer the more days you tag a mood.";
const EMPTY_MESSAGE =
  "Tag a mood on your entries and we'll show what tends to come before your good days.";

/** Share gap that counts as “clearly higher” for stage 3. */
const STAGE3_SHARE_GAP = 0.15;

export function normalizeActivityName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function localDateKeyFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = local.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + mondayOffset);
  local.setHours(0, 0, 0, 0);
  return local;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DaySide = "good" | "low";

type DayRecord = {
  key: string;
  side: DaySide | null;
  /** Any mood tag (incl. mixed/heavy). */
  moodTagged: boolean;
  activities: Map<string, string>; // norm → label
  latestMoodAt: number;
};

function daySideFromMood(mood: string): DaySide | null {
  if (mood === "good" || mood === "calm") return "good";
  if (mood === "low") return "low";
  return null;
}

function buildDayRecords(
  entries: WhatLiftsEntry[],
  letters: WhatLiftsLetter[],
): Map<string, DayRecord> {
  const days = new Map<string, DayRecord>();
  const entryDay = new Map<string, string>();

  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });

  for (const e of sorted) {
    const key = localDateKeyFromIso(e.at);
    if (!key) continue;
    entryDay.set(e.id, key);
    const at = new Date(e.at).getTime();
    let day = days.get(key);
    if (!day) {
      day = {
        key,
        side: null,
        moodTagged: false,
        activities: new Map(),
        latestMoodAt: -1,
      };
      days.set(key, day);
    }
    const mood = typeof e.mood === "string" ? e.mood.trim().toLowerCase() : "";
    if (!mood) continue;
    const t = Number.isFinite(at) ? at : 0;
    if (t < day.latestMoodAt) continue;
    day.latestMoodAt = t;
    day.moodTagged = true;
    day.side = daySideFromMood(mood);
  }

  for (const letter of letters) {
    for (const row of letter.activities ?? []) {
      const key = entryDay.get(row.entryId);
      if (!key) continue;
      const day = days.get(key);
      if (!day) continue;
      for (const item of row.items) {
        if (typeof item !== "string") continue;
        const norm = normalizeActivityName(item);
        if (!norm) continue;
        if (!day.activities.has(norm)) {
          day.activities.set(norm, item.trim().replace(/\s+/g, " "));
        }
      }
    }
  }

  return days;
}

function resolveWindowWeeks(
  days: Map<string, DayRecord>,
  asOf: Date,
): number {
  const asOfMonday = startOfWeekMonday(asOf);
  let weeks = 4;
  while (weeks < 12) {
    const start = addDays(asOfMonday, -(weeks - 1) * 7);
    const startKey = dateKey(start);
    let tagged = 0;
    let earlier = false;
    for (const day of days.values()) {
      if (!day.moodTagged) continue;
      if (day.key >= startKey && day.key <= dateKey(asOf)) {
        tagged += 1;
      } else if (day.key < startKey) {
        earlier = true;
      }
    }
    if (tagged >= 6) return weeks;
    if (!earlier) return weeks;
    weeks += 1;
  }
  return 12;
}

function countActivityDays(
  windowDays: DayRecord[],
  side: DaySide,
): {
  sideDays: number;
  byActivity: Map<string, { label: string; count: number }>;
} {
  const sideDaysList = windowDays.filter((d) => d.side === side);
  const byActivity = new Map<string, { label: string; count: number }>();
  for (const day of sideDaysList) {
    for (const [norm, label] of day.activities) {
      const cur = byActivity.get(norm);
      if (cur) cur.count += 1;
      else byActivity.set(norm, { label, count: 1 });
    }
  }
  return { sideDays: sideDaysList.length, byActivity };
}

function stage1Hits(
  byActivity: Map<string, { label: string; count: number }>,
  of: number,
): WhatLiftsActivityHit[] {
  return [...byActivity.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3)
    .map((x) => ({ label: x.label, count: x.count, of }));
}

function stage2Hits(
  sideMap: Map<string, { label: string; count: number }>,
  otherMap: Map<string, { label: string; count: number }>,
  of: number,
  preferOverOther: boolean,
): WhatLiftsActivityHit[] {
  let rows = [...sideMap.entries()]
    .map(([norm, v]) => ({
      norm,
      label: v.label,
      count: v.count,
      other: otherMap.get(norm)?.count ?? 0,
    }))
    .filter((r) => r.count >= 2);
  if (preferOverOther) {
    rows = rows.filter((r) => r.count > r.other);
  }
  rows.sort(
    (a, b) =>
      b.count - a.count ||
      b.count - b.other - (a.count - a.other) ||
      a.label.localeCompare(b.label),
  );
  return rows.slice(0, 3).map((r) => ({
    label: r.label,
    count: r.count,
    of,
  }));
}

function stage3Hits(
  sideMap: Map<string, { label: string; count: number }>,
  otherMap: Map<string, { label: string; count: number }>,
  sideTotal: number,
  otherTotal: number,
  of: number,
): WhatLiftsActivityHit[] {
  if (sideTotal <= 0) return [];
  const rows: WhatLiftsActivityHit[] = [];
  for (const [norm, v] of sideMap) {
    if (v.count < 3) continue;
    const sideShare = v.count / sideTotal;
    const otherCount = otherMap.get(norm)?.count ?? 0;
    const otherShare = otherTotal > 0 ? otherCount / otherTotal : 0;
    if (sideShare < otherShare + STAGE3_SHARE_GAP) continue;
    rows.push({ label: v.label, count: v.count, of });
  }
  rows.sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  return rows.slice(0, 3);
}

function goodLabelFor(stage: WhatLiftsStage, n: number): string {
  if (stage === 3) return "Tends to show up on your good days";
  if (stage === 2) {
    return `On your ${n} good or calm day${n === 1 ? "" : "s"}`;
  }
  if (n === 1) return "On your good day";
  return `On your ${n} good days`;
}

function lowLabelFor(stage: WhatLiftsStage, n: number): string {
  if (stage === 3) return "Tends to show up on your low days";
  if (n === 1) return "On your low day";
  return `On your ${n} low days`;
}

/**
 * Build the What lifts you card model.
 * @param asOf — clock for windowing (inject in tests).
 * @param minWindowDays — when set (e.g. the selected insight period), the
 *   window is at least this many calendar days, taking the longer of that and
 *   the staged week window from update 5.
 */
export function computeWhatLiftsYou(
  entries: WhatLiftsEntry[],
  letters: WhatLiftsLetter[],
  asOf: Date = new Date(),
  minWindowDays?: number,
): WhatLiftsYouResult {
  const days = buildDayRecords(entries, letters);
  const windowWeeks = resolveWindowWeeks(days, asOf);
  const stagedDays = windowWeeks * 7;
  const windowDayCount = Math.max(
    stagedDays,
    typeof minWindowDays === "number" && minWindowDays > 0 ? minWindowDays : 0,
  );
  const asOfMonday = startOfWeekMonday(asOf);
  // Prefer week-aligned start when the staged window wins; otherwise count
  // calendar days back from asOf so a 30-day insight covers those 30 days.
  const windowStart =
    windowDayCount === stagedDays
      ? addDays(asOfMonday, -(windowWeeks - 1) * 7)
      : addDays(asOf, -(windowDayCount - 1));
  const startKey = dateKey(windowStart);
  const endKey = dateKey(asOf);

  const windowDays: DayRecord[] = [];
  let moodTaggedDays = 0;
  for (const day of days.values()) {
    if (day.key < startKey || day.key > endKey) continue;
    windowDays.push(day);
    if (day.moodTagged) moodTaggedDays += 1;
  }

  const goodDays = windowDays.filter((d) => d.side === "good").length;
  const lowDays = windowDays.filter((d) => d.side === "low").length;

  const windowLabel =
    windowDayCount === stagedDays
      ? `Last ${windowWeeks} week${windowWeeks === 1 ? "" : "s"}`
      : `Last ${windowDayCount} days`;

  const emptyBase = {
    windowWeeks:
      windowDayCount === stagedDays
        ? windowWeeks
        : Math.max(1, Math.ceil(windowDayCount / 7)),
    windowLabel,
    goodDays,
    lowDays,
    moodTaggedDays,
    goodLabel: "",
    lowLabel: "",
    good: [] as WhatLiftsActivityHit[],
    low: [] as WhatLiftsActivityHit[],
  };

  if (goodDays === 0 && lowDays === 0) {
    return {
      ...emptyBase,
      stage: "empty",
      footer: null,
      emptyMessage: EMPTY_MESSAGE,
    };
  }

  const goodAgg = countActivityDays(windowDays, "good");
  const lowAgg = countActivityDays(windowDays, "low");

  const canStage3 =
    moodTaggedDays >= 10 && goodDays >= 3 && lowDays >= 2;
  const canStage2 = goodDays >= 3 && lowDays >= 1;

  if (canStage3) {
    const good = stage3Hits(
      goodAgg.byActivity,
      lowAgg.byActivity,
      goodAgg.sideDays,
      lowAgg.sideDays,
      goodAgg.sideDays,
    );
    const low = stage3Hits(
      lowAgg.byActivity,
      goodAgg.byActivity,
      lowAgg.sideDays,
      goodAgg.sideDays,
      lowAgg.sideDays,
    );
    if (good.length > 0 || low.length > 0) {
      return {
        ...emptyBase,
        stage: 3,
        goodLabel: goodLabelFor(3, goodDays),
        lowLabel: lowLabelFor(3, lowDays),
        good,
        low,
        footer: null,
        emptyMessage: null,
      };
    }
    // Fall through to stage 2.
  }

  if (canStage2 || canStage3) {
    const good = stage2Hits(
      goodAgg.byActivity,
      lowAgg.byActivity,
      goodAgg.sideDays,
      true,
    );
    const low = stage2Hits(
      lowAgg.byActivity,
      goodAgg.byActivity,
      lowAgg.sideDays,
      true,
    );
    return {
      ...emptyBase,
      stage: 2,
      goodLabel: goodLabelFor(2, goodDays),
      lowLabel: lowLabelFor(2, lowDays),
      good,
      low,
      footer: FOOTER_EARLY,
      emptyMessage: null,
    };
  }

  // Stage 1
  return {
    ...emptyBase,
    stage: 1,
    goodLabel: goodLabelFor(1, goodDays),
    lowLabel: lowLabelFor(1, lowDays),
    good: stage1Hits(goodAgg.byActivity, goodAgg.sideDays),
    low: stage1Hits(lowAgg.byActivity, lowAgg.sideDays),
    footer: FOOTER_EARLY,
    emptyMessage: null,
  };
}
