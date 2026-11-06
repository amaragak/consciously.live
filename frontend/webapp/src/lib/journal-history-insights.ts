/**
 * Journal history Insights (v2): per-entry analysis store + period aggregation.
 * Analysis runs once per content hash (debounced on save); Insights opens cheaply.
 */

import {
  journalEntryHrefById,
  type JournalEntry,
} from "@/lib/journal-storage";
import {
  isJournalMoodId,
  type JournalMoodId,
} from "@/lib/journal-moods";

export type InsightsPeriodId = "30d" | "3m" | "year" | "all";

export const INSIGHTS_PERIODS: Array<{ id: InsightsPeriodId; label: string }> = [
  { id: "30d", label: "30 days" },
  { id: "3m", label: "3 months" },
  { id: "year", label: "Year" },
  { id: "all", label: "All" },
];

/** -1 (negative) … +1 (positive). */
export type ToneScore = number;

export type JournalEntryThemeMention = {
  theme: string;
  /** Sentence(s) that mention the theme. */
  sentences: string[];
  tone: ToneScore;
};

export type JournalEntryAnalysis = {
  entryId: string;
  contentHash: string;
  analyzedAt: string;
  /** Overall tone of the writing. */
  tone: ToneScore;
  themes: JournalEntryThemeMention[];
  /** One or two standout sentences. */
  notableSentences: string[];
  /** Optional linked life-area name when the model suggests one. */
  lifeAreaHint?: string | null;
};

type AnalysisStore = {
  version: 1;
  byEntryId: Record<string, JournalEntryAnalysis>;
};

const STORE_KEY = "mm_journal_entry_analysis_v1";

export function contentHashForEntry(entry: Pick<JournalEntry, "contentHtml" | "title" | "mood">): string {
  const raw = `${entry.title || ""}\n${entry.mood || ""}\n${entry.contentHtml || ""}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function readStore(): AnalysisStore {
  if (typeof window === "undefined") return { version: 1, byEntryId: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { version: 1, byEntryId: {} };
    const parsed = JSON.parse(raw) as Partial<AnalysisStore>;
    if (parsed?.version !== 1 || !parsed.byEntryId || typeof parsed.byEntryId !== "object") {
      return { version: 1, byEntryId: {} };
    }
    return { version: 1, byEntryId: parsed.byEntryId };
  } catch {
    return { version: 1, byEntryId: {} };
  }
}

function writeStore(store: AnalysisStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* */
  }
}

export function getEntryAnalysis(entryId: string): JournalEntryAnalysis | null {
  return readStore().byEntryId[entryId] ?? null;
}

export function upsertEntryAnalysis(analysis: JournalEntryAnalysis): void {
  const store = readStore();
  store.byEntryId[analysis.entryId] = analysis;
  writeStore(store);
}

export function listEntryAnalyses(): JournalEntryAnalysis[] {
  return Object.values(readStore().byEntryId);
}

export function analysisNeedsRefresh(
  entry: JournalEntry,
): boolean {
  const existing = getEntryAnalysis(entry.id);
  if (!existing) return true;
  return existing.contentHash !== contentHashForEntry(entry);
}

export function moodToTone(mood: string | undefined): ToneScore | null {
  if (!isJournalMoodId(mood)) return null;
  const map: Record<JournalMoodId, ToneScore> = {
    good: 0.85,
    calm: 0.45,
    mixed: 0,
    low: -0.45,
    heavy: -0.85,
  };
  return map[mood];
}

export function combinedEntryTone(
  entry: JournalEntry,
  analysis: JournalEntryAnalysis | null,
): ToneScore {
  const fromMood = moodToTone(entry.mood);
  const fromText = analysis?.tone;
  if (fromMood != null && fromText != null) return (fromMood + fromText) / 2;
  if (fromMood != null) return fromMood;
  if (fromText != null) return fromText;
  return 0;
}

export function periodStartIso(period: InsightsPeriodId, now = new Date()): string | null {
  if (period === "all") return null;
  const d = new Date(now);
  if (period === "30d") d.setDate(d.getDate() - 30);
  else if (period === "3m") d.setMonth(d.getMonth() - 3);
  else if (period === "year") d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

export function entryInPeriod(
  entry: JournalEntry,
  period: InsightsPeriodId,
  now = new Date(),
): boolean {
  const start = periodStartIso(period, now);
  if (!start) return true;
  const t = Date.parse(entry.entryDate || entry.createdAt || entry.updatedAt);
  if (!Number.isFinite(t)) return false;
  return t >= Date.parse(start);
}

export function normalizeThemeName(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Title-ish: keep "The album", "Sam"
  return s.replace(/^./, (c) => c.toUpperCase());
}

export function themeSlug(name: string): string {
  return normalizeThemeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export type WeekMoodPoint = {
  weekStart: string;
  weekEnd: string;
  label: string;
  tone: ToneScore;
  entryCount: number;
  tellingLine: string | null;
  tellingEntryId: string | null;
};

export type ThemeRow = {
  name: string;
  slug: string;
  entryCount: number;
  avgTone: ToneScore;
  trend: string;
  sparkline: number[];
  lifeAreaHint?: string | null;
};

export type StandoutLine = {
  quote: string;
  highlightPhrase: string;
  entryId: string;
  dateIso: string;
  theme: string | null;
  moodLabel: string | null;
};

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString(undefined, opts)}–${end.toLocaleDateString(undefined, opts)}`;
}

export function buildWeeklyMoodSeries(
  entries: JournalEntry[],
  analyses: Map<string, JournalEntryAnalysis>,
  period: InsightsPeriodId,
): WeekMoodPoint[] {
  const inPeriod = entries.filter((e) => entryInPeriod(e, period));
  if (!inPeriod.length) return [];

  const byWeek = new Map<
    string,
    { tones: number[]; lines: Array<{ line: string; entryId: string; abs: number }> }
  >();

  for (const e of inPeriod) {
    const when = new Date(e.entryDate || e.createdAt);
    if (Number.isNaN(when.getTime())) continue;
    const ws = startOfWeekMonday(when);
    const key = isoDay(ws);
    const analysis = analyses.get(e.id) ?? null;
    const tone = combinedEntryTone(e, analysis);
    const bucket = byWeek.get(key) ?? { tones: [], lines: [] };
    bucket.tones.push(tone);
    const notable = analysis?.notableSentences?.[0];
    if (notable) {
      bucket.lines.push({ line: notable, entryId: e.id, abs: Math.abs(tone) });
    }
    byWeek.set(key, bucket);
  }

  const keys = [...byWeek.keys()].sort();
  return keys.map((key) => {
    const bucket = byWeek.get(key)!;
    const start = new Date(key + "T12:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const avg =
      bucket.tones.reduce((a, b) => a + b, 0) / Math.max(1, bucket.tones.length);
    const telling = bucket.lines.sort((a, b) => b.abs - a.abs)[0] ?? null;
    return {
      weekStart: key,
      weekEnd: isoDay(end),
      label: formatWeekLabel(start, end),
      tone: avg,
      entryCount: bucket.tones.length,
      tellingLine: telling?.line ?? null,
      tellingEntryId: telling?.entryId ?? null,
    };
  });
}

function trendLabel(
  sparkline: number[],
  firstSeen: string,
  periodStart: string | null,
): string {
  if (sparkline.length < 2) {
    if (periodStart && firstSeen >= periodStart.slice(0, 10)) return "new this month";
    return "steady";
  }
  const mid = Math.floor(sparkline.length / 2);
  const early =
    sparkline.slice(0, mid).reduce((a, b) => a + b, 0) / Math.max(1, mid);
  const late =
    sparkline.slice(mid).reduce((a, b) => a + b, 0) /
    Math.max(1, sparkline.length - mid);
  if (late > early * 1.35) return "mentioned more lately";
  if (early > late * 1.35) {
    // Peak month from max bucket
    return "peaked earlier";
  }
  return "steady";
}

export function buildThemeRows(
  entries: JournalEntry[],
  analyses: Map<string, JournalEntryAnalysis>,
  period: InsightsPeriodId,
): ThemeRow[] {
  const inPeriod = entries.filter((e) => entryInPeriod(e, period));
  const periodStart = periodStartIso(period);
  type Acc = {
    name: string;
    tones: number[];
    entryIds: Set<string>;
    weeks: Map<string, number>;
    firstSeen: string;
    lifeAreaHint?: string | null;
  };
  const byTheme = new Map<string, Acc>();

  for (const e of inPeriod) {
    const a = analyses.get(e.id);
    if (!a?.themes?.length) continue;
    const day = (e.entryDate || e.createdAt || "").slice(0, 10);
    const week = isoDay(startOfWeekMonday(new Date(day + "T12:00:00")));
    for (const t of a.themes) {
      const name = normalizeThemeName(t.theme);
      if (!name) continue;
      const key = name.toLowerCase();
      const acc =
        byTheme.get(key) ??
        ({
          name,
          tones: [] as number[],
          entryIds: new Set<string>(),
          weeks: new Map<string, number>(),
          firstSeen: day,
          lifeAreaHint: a.lifeAreaHint,
        } satisfies Acc);
      acc.entryIds.add(e.id);
      acc.tones.push(typeof t.tone === "number" ? t.tone : a.tone);
      acc.weeks.set(week, (acc.weeks.get(week) ?? 0) + 1);
      if (day && day < acc.firstSeen) acc.firstSeen = day;
      if (!acc.lifeAreaHint && a.lifeAreaHint) acc.lifeAreaHint = a.lifeAreaHint;
      byTheme.set(key, acc);
    }
  }

  const allWeeks = [...new Set([...byTheme.values()].flatMap((a) => [...a.weeks.keys()]))].sort();

  return [...byTheme.values()]
    .map((acc) => {
      const sparkline = allWeeks.map((w) => acc.weeks.get(w) ?? 0);
      const avgTone =
        acc.tones.reduce((a, b) => a + b, 0) / Math.max(1, acc.tones.length);
      return {
        name: acc.name,
        slug: themeSlug(acc.name),
        entryCount: acc.entryIds.size,
        avgTone,
        trend: trendLabel(sparkline, acc.firstSeen, periodStart),
        sparkline,
        lifeAreaHint: acc.lifeAreaHint,
      } satisfies ThemeRow;
    })
    .sort((a, b) => b.entryCount - a.entryCount);
}

export function buildMoodMovers(themes: ThemeRow[]): {
  lifts: ThemeRow[];
  weighs: ThemeRow[];
} {
  const scored = themes.filter((t) => t.entryCount >= 1);
  const lifts = [...scored]
    .filter((t) => t.avgTone > 0.12)
    .sort((a, b) => b.avgTone - a.avgTone)
    .slice(0, 3);
  const weighs = [...scored]
    .filter((t) => t.avgTone < -0.12)
    .sort((a, b) => a.avgTone - b.avgTone)
    .slice(0, 3);
  return { lifts, weighs };
}

export function buildStandoutLines(
  entries: JournalEntry[],
  analyses: Map<string, JournalEntryAnalysis>,
  period: InsightsPeriodId,
  limit = 3,
): StandoutLine[] {
  const inPeriod = entries.filter((e) => entryInPeriod(e, period));
  const byId = new Map(inPeriod.map((e) => [e.id, e]));
  const out: StandoutLine[] = [];
  for (const e of inPeriod) {
    const a = analyses.get(e.id);
    if (!a) continue;
    for (const sentence of a.notableSentences ?? []) {
      const theme = a.themes[0]?.theme ?? null;
      const phrase =
        a.themes[0]?.theme &&
        sentence.toLowerCase().includes(a.themes[0].theme.toLowerCase())
          ? a.themes[0].theme
          : sentence.split(/\s+/).slice(0, 4).join(" ");
      out.push({
        quote: sentence,
        highlightPhrase: phrase,
        entryId: e.id,
        dateIso: e.entryDate || e.createdAt,
        theme,
        moodLabel: isJournalMoodId(e.mood)
          ? e.mood.charAt(0).toUpperCase() + e.mood.slice(1)
          : null,
      });
    }
  }
  // Prefer more recent
  out.sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso));
  const seen = new Set<string>();
  const unique: StandoutLine[] = [];
  for (const line of out) {
    const key = line.quote.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byId.has(line.entryId)) continue;
    unique.push(line);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function entryHrefWithHighlight(
  entryId: string,
  quote: string,
  opts?: { theme?: string },
): string {
  const base = journalEntryHrefById(entryId);
  const params = new URLSearchParams();
  params.set("highlight", quote);
  if (opts?.theme) params.set("fromTheme", opts.theme);
  return `${base}?${params.toString()}`;
}

/** Prefer static import in callers; this helper avoids circular imports in tests. */
export function buildEntryHighlightHref(
  hrefBase: string,
  quote: string,
  theme?: string,
): string {
  const params = new URLSearchParams();
  params.set("highlight", quote);
  if (theme) params.set("fromTheme", theme);
  return `${hrefBase}?${params.toString()}`;
}

export function toneDotClass(tone: ToneScore): string {
  if (tone > 0.15) return "bg-[color:#7AC4A0]";
  if (tone < -0.15) return "bg-[color:#B09070]";
  return "bg-muted";
}

export function htmlToPlain(html: string): string {
  if (typeof document === "undefined") {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return (wrap.textContent || "").replace(/\s+/g, " ").trim();
}
