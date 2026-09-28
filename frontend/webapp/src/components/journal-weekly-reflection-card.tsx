import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, MoreHorizontal, Play, ThumbsDown, ThumbsUp } from "lucide-react";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  readInsightsCollapsePrefs,
  writeInsightsCollapsePrefs,
} from "@/lib/insights-collapse-prefs";
import { isInsightItemHidden, recentCorrectionGuidance } from "@/lib/insight-corrections";
import {
  fetchJournalWeeklyReflectionRemote,
  getMedimadeApiBase,
  isLikelyInsightsGatewayTimeout,
  pollJournalWeeklyReflectionAfterGenerate,
  runJournalWeeklyReflectionRemote,
  type JournalWeeklyEmotionScore,
  type JournalWeeklyGeneratedParts,
  type JournalWeeklyLetterSummary,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";
import {
  getCachedWeeklyReflection,
  invalidateCachedWeeklyReflection,
  setCachedWeeklyReflection,
} from "@/lib/journal-remote-cache";
import {
  isJournalMoodId,
  journalMoodLabel,
  JOURNAL_MOOD_WEEK_CELL,
  type JournalMoodId,
} from "@/lib/journal-moods";
import { loadJournalStore, type JournalEntry } from "@/lib/journal-storage";
import { JOURNAL_STORE_CHANGED } from "@/lib/journal-storage";
import {
  buildInsightsMeditationPrompt,
  insightsCreateMeditationHref,
  writeInsightsMeditationPrompt,
} from "@/lib/insights-meditation-handoff";
import { InsightsPatternCards } from "@/components/insights-pattern-cards";
import { InsightsSupportBanner } from "@/components/insights-support-banner";
import "@/components/insights-mood-week.css";
import {
  InsightsGenerateDialog,
  type InsightsGeneratePrefill,
  type InsightsGenerateSelection,
} from "@/components/insights-generate-dialog";
import {
  daysBetweenInclusive,
  formatRangeWords,
  insightHeaderLabel,
  parseInsightRangeKey,
  periodUiCopy,
} from "@/lib/insight-period";
import { InsightsSourceLink } from "@/components/insights-source-link";
import {
  fillLetterNamePlaceholder,
  parseWellbeingLevel,
  wellbeingVisibility,
} from "@/lib/insight-wellbeing";
import { coerceLetterMarkdown, frameLetterMarkdown } from "@/lib/letter-markdown";
import { getMedimadeSessionDisplayName } from "@/lib/auth-session";

type InsightsPageNotice =
  | {
      kind: "error";
      title: string;
      message: string;
      detail?: string;
    }
  | { kind: "daily_limit"; message: string; resetsAt?: string };

function noticeFromUnknown(
  e: unknown,
  context: "load" | "generate",
): InsightsPageNotice {
  const err = e as Error & {
    code?: string;
    status?: number;
    resetsAt?: string;
  };
  const rawMessage =
    e instanceof Error
      ? e.message.trim()
      : typeof e === "string"
        ? e.trim()
        : "";
  const code = e instanceof Error ? err.code : undefined;
  const status = e instanceof Error ? err.status : undefined;
  const resetsAt = e instanceof Error ? err.resetsAt : undefined;

  const looksLikeLimit =
    code === "daily_limit" ||
    status === 429 ||
    /daily[_\s-]?limit|used today's insights|generated a lot today|try again tomorrow|fresh ones unlock|that's enough for today/i.test(
      rawMessage,
    );

  if (looksLikeLimit) {
    return {
      kind: "daily_limit",
      message:
        rawMessage && !/^request failed/i.test(rawMessage)
          ? rawMessage
          : "You've used today's insights.",
      ...(typeof resetsAt === "string" && resetsAt ? { resetsAt } : {}),
    };
  }

  if (typeof console !== "undefined") {
    console.warn("[insights]", context, e);
  }

  const title =
    context === "generate"
      ? "Something went wrong writing this"
      : "Couldn't load these insights";
  const message =
    context === "generate"
      ? "Nothing was lost. You can try again in a moment."
      : "Check your connection and try again in a moment.";

  const detail =
    rawMessage &&
    !/^failed to generate/i.test(rawMessage) &&
    !/^failed to load/i.test(rawMessage)
      ? rawMessage
      : status
        ? `HTTP ${status}`
        : undefined;

  return {
    kind: "error",
    title,
    message,
    ...(detail ? { detail } : {}),
  };
}

function formatInsightsUnlock(resetsAt: string | undefined): {
  absolute: string;
  relative: string;
} | null {
  if (!resetsAt) return null;
  const at = new Date(resetsAt);
  if (Number.isNaN(at.getTime())) return null;
  const absolute = at.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const hours = Math.max(
    1,
    Math.ceil((at.getTime() - Date.now()) / (60 * 60 * 1000)),
  );
  const relative =
    hours === 1 ? "In about an hour" : `In about ${hours} hours`;
  return { absolute, relative };
}

function InsightsNoticeCard({
  notice,
  onDismiss,
  onRetry,
}: {
  notice: InsightsPageNotice;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  const unlock =
    notice.kind === "daily_limit"
      ? formatInsightsUnlock(notice.resetsAt)
      : null;

  const eyebrow =
    notice.kind === "daily_limit" ? "Daily pause" : "Couldn't finish";
  const title =
    notice.kind === "daily_limit"
      ? "That's enough for today"
      : notice.title;
  const body =
    notice.kind === "daily_limit"
      ? unlock
        ? `Fresh insights unlock ${unlock.absolute}. Your writing stays put — come back then and pick up where you left off.`
        : notice.message
      : notice.message;

  return (
    <aside
      role={notice.kind === "error" ? "alert" : "status"}
      className="relative overflow-hidden rounded-xl border border-border bg-card px-5 py-5 shadow-sm"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-accent-soft/50 blur-2xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
            {eyebrow}
          </span>
          <p className="font-display text-[22px] font-normal leading-snug text-foreground">
            {title}
          </p>
          <p className="max-w-[36rem] text-[15px] leading-relaxed text-foreground/80">
            {body}
          </p>
          {notice.kind === "daily_limit" && unlock ? (
            <p className="text-sm text-muted">{unlock.relative}.</p>
          ) : null}
          {notice.kind === "error" && notice.detail ? (
            <p className="text-xs text-muted">{notice.detail}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {notice.kind === "error" && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full accent-fill-gradient px-5 text-[15px] font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-border bg-background px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-accent/40"
          >
            {notice.kind === "daily_limit" ? "Got it" : "Dismiss"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function LetterFeedbackRow({
  rangeKey,
  initial,
  regenerating = false,
  onRewrite,
}: {
  rangeKey: string;
  initial: { rating: "up" | "down"; note?: string; at: string } | null;
  regenerating?: boolean;
  /** Called when user wants a rewrite after thumbs-down + note. */
  onRewrite?: (note: string) => void;
}) {
  const storageKey = `mm_letter_feedback_${rangeKey}`;
  const [rating, setRating] = useState<"up" | "down" | null>(() => {
    if (initial?.rating) return initial.rating;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { rating?: string };
      return parsed.rating === "up" || parsed.rating === "down"
        ? parsed.rating
        : null;
    } catch {
      return null;
    }
  });
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(initial?.note ?? "");

  const save = (next: "up" | "down", noteText?: string) => {
    setRating(next);
    const payload = {
      rating: next,
      ...(noteText?.trim() ? { note: noteText.trim() } : {}),
      at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };

  const canRewrite =
    rating === "down" && Boolean(note.trim()) && Boolean(onRewrite);

  if (!rangeKey.trim()) return null;

  return (
    <div className="mt-8 flex flex-col gap-3 border-t border-border/60 pt-5">
      <p className="text-sm text-muted">Did this feel right?</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={rating === "up"}
          aria-label="Yes, this felt right"
          onClick={() => {
            setNoteOpen(false);
            save("up");
          }}
          className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
            rating === "up"
              ? "border-accent bg-accent-soft text-foreground"
              : "border-border bg-card text-muted hover:text-foreground"
          }`}
        >
          <ThumbsUp className="size-3.5" strokeWidth={2} />
          Yes
        </button>
        <button
          type="button"
          aria-pressed={rating === "down"}
          aria-label="No, this did not feel right"
          onClick={() => {
            setNoteOpen(true);
            save("down", note);
          }}
          className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
            rating === "down"
              ? "border-accent bg-accent-soft text-foreground"
              : "border-border bg-card text-muted hover:text-foreground"
          }`}
        >
          <ThumbsDown className="size-3.5" strokeWidth={2} />
          No
        </button>
      </div>
      {noteOpen || rating === "down" ? (
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          What felt off?{" "}
          <span className="font-normal text-muted/80">(optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => save("down", note)}
            rows={2}
            className="rounded-xl border border-border bg-card px-3 py-2 text-[15px] text-foreground outline-none focus:border-accent/50"
          />
        </label>
      ) : null}
      {canRewrite ? (
        <button
          type="button"
          disabled={regenerating}
          onClick={() => {
            const trimmed = note.trim();
            if (!trimmed || !onRewrite) return;
            save("down", trimmed);
            onRewrite(trimmed);
          }}
          className="inline-flex h-10 w-fit cursor-pointer items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {regenerating ? "Rewriting…" : "Rewrite with this feedback"}
        </button>
      ) : null}
    </div>
  );
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  try {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const sy = s.getFullYear();
    const ey = e.getFullYear();
    if (sy === ey) {
      return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
    }
    return `${s.toLocaleDateString(undefined, { ...opts, year: "numeric" })} – ${e.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
  } catch {
    return `${weekStart.slice(0, 10)} – ${weekEnd.slice(0, 10)}`;
  }
}

function formatWeekRangeShort(weekStart: string, weekEnd: string): string {
  try {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  } catch {
    return formatWeekRange(weekStart, weekEnd);
  }
}

function weekdayLong(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Monday";
    return d.toLocaleDateString(undefined, { weekday: "long" });
  } catch {
    return "Monday";
  }
}

function plainFromMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function letterWordCount(md: string): number {
  const plain = plainFromMarkdown(md);
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

/** Minutes at 200 wpm, rounded up (min 1 when there is any text). */
function letterMinutesRead(md: string): number {
  const words = letterWordCount(md);
  if (words <= 0) return 1;
  return Math.max(1, Math.ceil(words / 200));
}

/** First sentence after the “Dear …,” greeting, for collapsed preview. */
function firstLetterSentence(md: string): string {
  const plain = plainFromMarkdown(md);
  const withoutDear = plain.replace(/^Dear\s+[^,.]+[,.]?\s*/i, "").trim();
  if (!withoutDear) return "";
  const m = withoutDear.match(/^(.+?[.!?])(?:\s|$)/);
  return (m?.[1] ?? withoutDear).trim();
}

function InsightsSectionHeader({
  id,
  title,
  meta,
  expanded,
  onToggle,
  collapsible,
}: {
  id: string;
  title: string;
  meta: string;
  expanded: boolean;
  onToggle: () => void;
  collapsible: boolean;
}) {
  if (!collapsible) {
    return (
      <div className="flex w-full items-center gap-3 border-b border-border py-4 text-left">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted"
        >
          <ChevronDown className="size-3.5" strokeWidth={2.2} />
        </span>
        <span className="font-display text-[22px] font-normal text-foreground">
          {title}
        </span>
        <span className="ml-auto text-[13px] text-muted">{meta}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      id={`${id}-header`}
      aria-expanded={expanded}
      aria-controls={`${id}-body`}
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center gap-3 border-b border-border bg-transparent py-4 text-left font-inherit text-foreground"
    >
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" strokeWidth={2.2} />
        ) : (
          <ChevronRight className="size-3.5" strokeWidth={2.2} />
        )}
      </span>
      <span className="font-display text-[22px] font-normal text-foreground">
        {title}
      </span>
      <span className="ml-auto text-[13px] text-muted">{meta}</span>
    </button>
  );
}

function InsightsCollapsibleBody({
  id,
  open,
  children,
}: {
  id: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={`${id}-body`}
      role="region"
      aria-labelledby={`${id}-header`}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
        open
          ? "grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function countEntriesInWeek(
  entries: JournalEntry[],
  weekStart: string,
  weekEnd: string,
): number {
  if (!weekStart || !weekEnd) return 0;
  const start = new Date(weekStart).getTime();
  const end = new Date(weekEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  let n = 0;
  for (const e of entries) {
    if (e.kind === "gratitude") continue;
    const t = new Date(e.updatedAt || e.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= start && t <= end) n += 1;
  }
  return n;
}

/** Resolve which AI parts exist for display (legacy weeks = all parts). */
function resolveGeneratedParts(
  reflection: JournalWeeklyReflection | null,
): JournalWeeklyGeneratedParts | null {
  if (!reflection) return null;
  if (reflection.generatedParts) return reflection.generatedParts;
  if (reflection.letterMarkdown?.trim()) {
    return {
      letter: true,
      felt: true,
      moved: true,
      wins: true,
      thought: true,
    };
  }
  return null;
}

function hasAnyGeneratedPatternPart(
  parts: JournalWeeklyGeneratedParts | null,
): boolean {
  if (!parts) return false;
  return parts.felt || parts.moved || parts.wins || parts.thought;
}

type MoodDayEntry = {
  id: string;
  mood: JournalMoodId | null;
  at: number;
  createdAt: string;
  title?: string;
};

type MoodDay = {
  key: string;
  dayLabel: string;
  dateNum: number;
  /** Primary mood for legacy single-color fallback (first tagged, else null). */
  mood: JournalMoodId | null;
  entries: MoodDayEntry[];
  isToday: boolean;
  inPeriod: boolean;
  emptyLabel: string;
};

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 local → Sunday 23:59:59.999 local for a weekKey (YYYY-MM-DD Monday). */
function weekBoundsFromKey(weekKey: string): { weekStart: string; weekEnd: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const monday = new Date(y, mo, d, 0, 0, 0, 0);
  if (Number.isNaN(monday.getTime())) return null;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { weekStart: monday.toISOString(), weekEnd: sunday.toISOString() };
}

function startOfWeekMonday(d = new Date()): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = local.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + mondayOffset);
  local.setHours(0, 0, 0, 0);
  return local;
}

function parseLocalDateOnly(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function moodDaysForPeriod(
  entries: JournalEntry[],
  startDate: string,
  endDate: string,
): MoodDay[] {
  const startLocal = parseLocalDateOnly(startDate);
  const endLocal = parseLocalDateOnly(endDate);
  if (!startLocal || !endLocal) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDay = new Map<string, MoodDayEntry[]>();
  const startMs = startLocal.getTime();
  const endMs = new Date(
    endLocal.getFullYear(),
    endLocal.getMonth(),
    endLocal.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  for (const e of entries) {
    if (e.kind === "gratitude") continue;
    const at = new Date(e.updatedAt || e.createdAt).getTime();
    if (!Number.isFinite(at) || at < startMs || at > endMs) continue;
    const d = new Date(at);
    d.setHours(0, 0, 0, 0);
    const key = localDateKey(d);
    const list = byDay.get(key) ?? [];
    list.push({
      id: e.id,
      mood: isJournalMoodId(e.mood) ? e.mood : null,
      at,
      createdAt: e.createdAt,
      title: e.title?.trim() || undefined,
    });
    byDay.set(key, list);
  }
  for (const [, list] of byDay) {
    list.sort((a, b) => a.at - b.at);
  }

  const days: MoodDay[] = [];
  const cursor = new Date(startLocal);
  while (cursor.getTime() <= endLocal.getTime()) {
    const key = localDateKey(cursor);
    const isToday = cursor.getTime() === today.getTime();
    const dayEntries = byDay.get(key) ?? [];
    const firstMood = dayEntries.find((x) => x.mood)?.mood ?? null;
    days.push({
      key,
      dayLabel: dayNames[cursor.getDay()]!,
      dateNum: cursor.getDate(),
      mood: firstMood,
      entries: dayEntries,
      isToday,
      inPeriod: true,
      emptyLabel: isToday ? "Today" : "–",
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Calendar grid cells (Mon–Sun rows) for periods longer than 14 days. */
function moodCalendarCells(
  periodDays: MoodDay[],
): Array<MoodDay | { key: string; blank: true }> {
  if (periodDays.length === 0) return [];
  const first = parseLocalDateOnly(periodDays[0]!.key);
  if (!first) return periodDays;
  const monday = startOfWeekMonday(first);
  const last = parseLocalDateOnly(periodDays[periodDays.length - 1]!.key)!;
  const endSunday = startOfWeekMonday(last);
  endSunday.setDate(endSunday.getDate() + 6);

  const byKey = new Map(periodDays.map((d) => [d.key, d]));
  const cells: Array<MoodDay | { key: string; blank: true }> = [];
  const cursor = new Date(monday);
  while (cursor.getTime() <= endSunday.getTime()) {
    const key = localDateKey(cursor);
    const hit = byKey.get(key);
    if (hit) cells.push(hit);
    else cells.push({ key: `blank-${key}`, blank: true });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function moodDaysForWeek(
  entries: JournalEntry[],
  weekStart: string,
  weekEnd: string,
): MoodDay[] {
  let monday = weekStart ? new Date(weekStart) : new Date(NaN);
  if (Number.isNaN(monday.getTime())) {
    monday = startOfWeekMonday();
  } else {
    monday = startOfWeekMonday(monday);
  }
  const startKey = localDateKey(monday);
  const end = new Date(monday);
  end.setDate(monday.getDate() + 6);
  const endKey = localDateKey(end);
  // Prefer ISO instants when available; fall back to Mon–Sun of weekStart.
  if (weekStart && weekEnd) {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      return moodDaysForPeriod(
        entries,
        localDateKey(s),
        localDateKey(e),
      );
    }
  }
  return moodDaysForPeriod(entries, startKey, endKey);
}

function normalizeEmotions(
  raw: JournalWeeklyEmotionScore[] | undefined,
): JournalWeeklyEmotionScore[] {
  if (!raw?.length) return [];
  const out: JournalWeeklyEmotionScore[] = [];
  for (const row of raw) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const score = typeof row.score === "number" ? row.score : Number(row.score);
    if (!name || !Number.isFinite(score)) continue;
    const examples = Array.isArray(row.examples)
      ? row.examples
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().replace(/\s+/g, " "))
          .filter((x) => x.length >= 8)
          .slice(0, 3)
      : undefined;
    out.push({
      name,
      score: Math.max(0, Math.min(10, Math.round(score))),
      ...(examples?.length ? { examples } : {}),
      ...(row.sources?.length ? { sources: row.sources } : {}),
      ...(row.entryIds?.length ? { entryIds: row.entryIds } : {}),
    });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, 5);
}

function EmotionBars({ emotions }: { emotions: JournalWeeklyEmotionScore[] }) {
  return (
    <div className="flex flex-col gap-3">
      {emotions.map((e, i) => {
        if (isInsightItemHidden("emotion", e.name)) return null;
        const pct = Math.max(0, Math.min(100, (e.score / 10) * 100));
        const barColor = i === 0 ? "bg-accent" : "bg-deep";
        const sources = e.sources;
        const entryIds =
          sources?.map((s) => s.entryId) ?? e.entryIds ?? [];
        const row = (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">{e.name}</span>
              <span className="text-muted">{e.score}/10</span>
            </div>
            <div
              className="h-[10px] overflow-hidden rounded-full bg-border-subtle"
              role="img"
              aria-label={`${e.name}, ${e.score} out of 10`}
            >
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
        if (entryIds.length === 0) {
          return (
            <div key={`${e.name}-${i}`} className="rounded-lg">
              {row}
            </div>
          );
        }
        return (
          <InsightsSourceLink
            key={`${e.name}-${i}`}
            sources={sources}
            entryIds={entryIds}
            header={`Most behind '${e.name}'`}
            className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            triggerLabel={`${e.name}, ${e.score} out of 10, sources`}
          >
            <div className="rounded-lg transition-colors hover:bg-accent-soft/20">
              {row}
            </div>
          </InsightsSourceLink>
        );
      })}
    </div>
  );
}

function moodDayAriaLabel(day: MoodDay): string {
  const when = (() => {
    const d = parseLocalDateOnly(day.key);
    if (!d) return `${day.dayLabel} ${day.dateNum}`;
    return d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
  })();
  if (day.entries.length === 0) return `${when}, no entries`;
  const moods = day.entries
    .map((e) => (e.mood ? journalMoodLabel(e.mood) : "untagged"))
    .join(", ");
  const n = day.entries.length;
  return `${when}, ${n} ${n === 1 ? "entry" : "entries"}: ${moods}`;
}

function MoodDayCell({
  day,
  compact,
}: {
  day: MoodDay;
  compact?: boolean;
}) {
  const hasEntries = day.entries.length > 0;
  const hasMood = day.entries.some((e) => e.mood);
  const multi = day.entries.length > 1;
  const singleMood =
    !multi && day.entries.length === 1 ? day.entries[0]?.mood ?? null : null;
  const label = moodDayAriaLabel(day);

  if (!hasEntries) {
    return (
      <div className="mood-day-cell mood-day-cell--empty" aria-label={label} />
    );
  }

  const cell = (
    <div
      className={[
        "mood-day-cell",
        !hasMood ? "mood-day-cell--untagged" : "",
        multi ? "mood-day-cell--multi" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      {hasMood ? (
        <div className="mood-day-cell__slices">
          {day.entries.map((e) => (
            <div
              key={e.id}
              className="mood-day-cell__slice"
              style={{
                backgroundColor: e.mood
                  ? JOURNAL_MOOD_WEEK_CELL[e.mood]
                  : "var(--surface, var(--card))",
              }}
            />
          ))}
        </div>
      ) : (
        <span className="mood-day-cell__dot" />
      )}

      {singleMood && !compact ? (
        <span className="mood-day-cell__word">
          {journalMoodLabel(singleMood)}
        </span>
      ) : null}

      {compact ? (
        <span className="mood-day-cell__word">{day.dateNum}</span>
      ) : null}

      {multi ? (
        <span className="mood-day-cell__badge">{day.entries.length}</span>
      ) : null}
    </div>
  );

  if (day.entries.length === 1) {
    const only = day.entries[0]!;
    return (
      <InsightsSourceLink
        entryIds={[only.id]}
        header={`${day.dayLabel} ${day.dateNum}`}
        className="mood-day-trigger"
        triggerLabel={label}
        clickHref={`/journal/my/${encodeURIComponent(only.id)}`}
      >
        {cell}
      </InsightsSourceLink>
    );
  }

  return (
    <InsightsSourceLink
      entryIds={day.entries.map((e) => e.id)}
      header={`${day.dayLabel} ${day.dateNum} · ${day.entries.length} entries`}
      footerHref={`/journal/my?day=${encodeURIComponent(day.key)}`}
      footerLabel={`Open ${day.dayLabel} in Journal →`}
      className="mood-day-trigger"
      triggerLabel={label}
    >
      {cell}
    </InsightsSourceLink>
  );
}

function MoodWeekStrip({
  days,
  summary,
}: {
  days: MoodDay[];
  summary?: string;
}) {
  if (!days.length) return null;
  const useCalendar = days.length > 14;
  const cells = useCalendar ? moodCalendarCells(days) : days;

  return (
    <div className="flex flex-col gap-3.5">
      {useCalendar ? (
        <div className="flex flex-col gap-2">
          <div className="mood-day-grid--calendar-head">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mood-day-grid mood-day-grid--calendar">
            {cells.map((cell) => {
              if ("blank" in cell) {
                return (
                  <div key={cell.key} className="mood-day-grid__blank" />
                );
              }
              return <MoodDayCell key={cell.key} day={cell} compact />;
            })}
          </div>
        </div>
      ) : (
        <div className="mood-day-grid">
          {days.map((d) => (
            <div key={d.key} className="mood-day-col">
              <MoodDayCell day={d} />
              <span className="mood-day-col__label">
                <span>{d.dayLabel}</span>
                <span className="mood-day-col__date">{d.dateNum}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {summary?.trim() ? (
        <p className="text-sm leading-relaxed text-foreground/80">
          {summary.trim()}
        </p>
      ) : null}
    </div>
  );
}

export function JournalWeeklyReflectionCard({
  weekKey: weekKeyProp,
  onLetterChanged,
  recentLetters = [],
}: {
  weekKey?: string | null;
  onLetterChanged?: () => void;
  /** Recent weekly letters (for month chart + what lifts you). */
  recentLetters?: JournalWeeklyLetterSummary[];
}) {
  const navigate = useNavigate();
  const weekKey = weekKeyProp?.trim() || undefined;
  const cacheKey = weekKey || "__current__";
  const cached = getCachedWeeklyReflection(cacheKey);
  const [reflection, setReflection] = useState<JournalWeeklyReflection | null>(
    () => cached?.reflection ?? null,
  );
  const [weekStart, setWeekStart] = useState(() => cached?.weekStart ?? "");
  const [weekEnd, setWeekEnd] = useState(() => cached?.weekEnd ?? "");
  const [loading, setLoading] = useState(() => !cached);
  const [generating, setGenerating] = useState(false);
  const [pendingGeneration, setPendingGeneration] =
    useState<InsightsGenerateSelection | null>(null);
  const [notice, setNotice] = useState<InsightsPageNotice | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPrefill, setDialogPrefill] =
    useState<InsightsGeneratePrefill | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastGenerateSelectionRef = useRef<InsightsGenerateSelection | null>(
    null,
  );
  const [letterCollapsed, setLetterCollapsed] = useState(
    () => readInsightsCollapsePrefs().letterCollapsed,
  );
  const [patternsCollapsed, setPatternsCollapsed] = useState(
    () => readInsightsCollapsePrefs().patternsCollapsed,
  );

  const apiEnabled = Boolean(getMedimadeApiBase());

  const persistCollapse = useCallback(
    (next: { letterCollapsed: boolean; patternsCollapsed: boolean }) => {
      setLetterCollapsed(next.letterCollapsed);
      setPatternsCollapsed(next.patternsCollapsed);
      writeInsightsCollapsePrefs(next);
    },
    [],
  );

  const openGenerateDialog = useCallback(
    (prefill?: InsightsGeneratePrefill | null) => {
      const hasRange = Boolean(
        reflection?.startDate && reflection?.endDate,
      );
      const fromReflection: InsightsGeneratePrefill = {
        ...(hasRange
          ? {
              startDate: reflection!.startDate,
              endDate: reflection!.endDate,
              periodType: reflection!.periodType,
              lockPeriod: true,
            }
          : {}),
      };
      setDialogPrefill({ ...fromReflection, ...(prefill ?? null) });
      setDialogOpen(true);
      setMenuOpen(false);
    },
    [reflection],
  );

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!apiEnabled) return;
      if (!opts?.force) {
        const hit = getCachedWeeklyReflection(cacheKey);
        if (hit) {
          setReflection(hit.reflection);
          setWeekStart(hit.weekStart);
          setWeekEnd(hit.weekEnd);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      setNotice(null);
      try {
        const range = weekKey ? parseInsightRangeKey(weekKey) : null;
        const got = await fetchJournalWeeklyReflectionRemote(
          range
            ? { startDate: range.startDate, endDate: range.endDate }
            : weekKey
              ? { week: weekKey }
              : undefined,
        );
        setCachedWeeklyReflection(cacheKey, got);
        setReflection(got.reflection);
        setWeekStart(got.weekStart);
        setWeekEnd(got.weekEnd);
      } catch (e) {
        setNotice(
          noticeFromUnknown(e, "load"),
        );
      } finally {
        setLoading(false);
      }
    },
    [apiEnabled, cacheKey, weekKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const on = () => void load({ force: true });
    window.addEventListener("medimade-session-changed", on);
    return () => window.removeEventListener("medimade-session-changed", on);
  }, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      if (!menuRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const generate = useCallback(
    async (
      selection: InsightsGenerateSelection,
      opts?: {
        letterRevision?: {
          feedback: string;
          priorLetterMarkdown: string;
        };
      },
    ) => {
      if (!apiEnabled) return;
      setDialogOpen(false);
      setGenerating(true);
      setPendingGeneration(selection);
      lastGenerateSelectionRef.current = selection;
      setNotice(null);
      setMenuOpen(false);
      const startedAt = Date.now();
      try {
        const got = await runJournalWeeklyReflectionRemote({
          letter: selection.letter,
          patterns: selection.patterns,
          periodType: selection.periodType,
          startDate: selection.startDate,
          endDate: selection.endDate,
          timeZone: selection.timeZone,
          corrections: recentCorrectionGuidance(10),
          ...(opts?.letterRevision
            ? { letterRevision: opts.letterRevision }
            : {}),
        });
        const nextKey =
          got.rangeKey ||
          got.reflection?.rangeKey ||
          weekKey ||
          "__current__";
        invalidateCachedWeeklyReflection(weekKey);
        invalidateCachedWeeklyReflection(nextKey);
        setCachedWeeklyReflection(nextKey, got);
        setReflection(got.reflection);
        setWeekStart(got.weekStart);
        setWeekEnd(got.weekEnd);
        if (opts?.letterRevision) {
          const rk =
            got.rangeKey ||
            got.reflection?.rangeKey ||
            reflection?.rangeKey ||
            "";
          if (rk) {
            try {
              localStorage.removeItem(`mm_letter_feedback_${rk}`);
            } catch {
              /* ignore */
            }
          }
        }
        onLetterChanged?.();
        if (got.rangeKey && got.rangeKey !== weekKey) {
          navigate(`/journal/my/insights/${encodeURIComponent(got.rangeKey)}`, {
            replace: true,
          });
        }
      } catch (e) {
        // API Gateway hard-caps at 30s; Lambda often finishes and saves afterward.
        if (isLikelyInsightsGatewayTimeout(e)) {
          const recovered = await pollJournalWeeklyReflectionAfterGenerate({
            startDate: selection.startDate,
            endDate: selection.endDate,
            periodType: selection.periodType,
            timeZone: selection.timeZone,
            notBeforeMs: startedAt,
          });
          if (recovered?.reflection) {
            const nextKey =
              recovered.rangeKey ||
              recovered.reflection.rangeKey ||
              weekKey ||
              "__current__";
            invalidateCachedWeeklyReflection(weekKey);
            invalidateCachedWeeklyReflection(nextKey);
            setCachedWeeklyReflection(nextKey, recovered);
            setReflection(recovered.reflection);
            setWeekStart(recovered.weekStart);
            setWeekEnd(recovered.weekEnd);
            onLetterChanged?.();
            if (recovered.rangeKey && recovered.rangeKey !== weekKey) {
              navigate(
                `/journal/my/insights/${encodeURIComponent(recovered.rangeKey)}`,
                { replace: true },
              );
            }
            return;
          }
        }
        setNotice(noticeFromUnknown(e, "generate"));
      } finally {
        setGenerating(false);
        setPendingGeneration(null);
      }
    },
    [apiEnabled, navigate, onLetterChanged, reflection?.rangeKey, weekKey],
  );

  const rewriteLetterFromFeedback = useCallback(
    (note: string) => {
      if (!reflection?.letterMarkdown?.trim() || !note.trim()) return;
      const timeZone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const startDate = reflection.startDate || weekStart.slice(0, 10);
      const endDate = reflection.endDate || weekEnd.slice(0, 10);
      void generate(
        {
          letter: true,
          patterns: {
            felt: false,
            moved: false,
            wins: false,
            thought: false,
          },
          remember: false,
          periodType: reflection.periodType || "custom",
          startDate,
          endDate,
          timeZone,
        },
        {
          letterRevision: {
            feedback: note.trim(),
            priorLetterMarkdown: reflection.letterMarkdown,
          },
        },
      );
    },
    [generate, reflection, weekEnd, weekStart],
  );

  const weekLabel =
    weekStart && weekEnd ? formatWeekRangeShort(weekStart, weekEnd) : "These days";
  const weekLabelLong =
    weekStart && weekEnd ? formatWeekRange(weekStart, weekEnd) : "These days";

  const periodDates = useMemo(() => {
    if (reflection?.startDate && reflection?.endDate) {
      return {
        startDate: reflection.startDate,
        endDate: reflection.endDate,
        periodType: reflection.periodType,
      };
    }
    const fromKey = weekKey ? parseInsightRangeKey(weekKey) : null;
    if (fromKey) {
      return {
        startDate: fromKey.startDate,
        endDate: fromKey.endDate,
        periodType: reflection?.periodType,
      };
    }
    if (weekStart && weekEnd) {
      return {
        startDate: localDateKey(new Date(weekStart)),
        endDate: localDateKey(new Date(weekEnd)),
        periodType: reflection?.periodType,
      };
    }
    return null;
  }, [reflection, weekKey, weekStart, weekEnd]);

  const periodDays = periodDates
    ? daysBetweenInclusive(periodDates.startDate, periodDates.endDate)
    : 7;
  const uiCopy = periodUiCopy(periodDays);
  const headerLabel = periodDates
    ? insightHeaderLabel(
        periodDates.periodType,
        periodDates.startDate,
        periodDates.endDate,
      )
    : weekLabel;

  const [storeTick, setStoreTick] = useState(0);
  useEffect(() => {
    const bump = () => setStoreTick((n) => n + 1);
    window.addEventListener(JOURNAL_STORE_CHANGED, bump);
    return () => {
      window.removeEventListener(JOURNAL_STORE_CHANGED, bump);
    };
  }, []);

  const resolvedWeek = useMemo(() => {
    if (weekStart && weekEnd) return { weekStart, weekEnd };
    if (periodDates) {
      const start = parseLocalDateOnly(periodDates.startDate);
      const end = parseLocalDateOnly(periodDates.endDate);
      if (start && end) {
        end.setHours(23, 59, 59, 999);
        return { weekStart: start.toISOString(), weekEnd: end.toISOString() };
      }
    }
    if (weekKey) {
      const fromKey = weekBoundsFromKey(weekKey);
      if (fromKey) return fromKey;
    }
    const monday = startOfWeekMonday();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { weekStart: monday.toISOString(), weekEnd: sunday.toISOString() };
  }, [weekStart, weekEnd, weekKey, periodDates]);

  const storeEntries = useMemo(() => {
    void storeTick;
    return loadJournalStore().entries;
  }, [storeTick, reflection, resolvedWeek.weekStart, resolvedWeek.weekEnd, loading]);

  const weekEntryCount = useMemo(() => {
    if (reflection?.meta.journalEntryCount != null && reflection.meta.journalEntryCount > 0) {
      return reflection.meta.journalEntryCount;
    }
    return countEntriesInWeek(
      storeEntries,
      resolvedWeek.weekStart,
      resolvedWeek.weekEnd,
    );
  }, [reflection, storeEntries, resolvedWeek]);

  const moodDays = useMemo(() => {
    if (periodDates) {
      return moodDaysForPeriod(
        storeEntries,
        periodDates.startDate,
        periodDates.endDate,
      );
    }
    return moodDaysForWeek(
      storeEntries,
      resolvedWeek.weekStart,
      resolvedWeek.weekEnd,
    );
  }, [storeEntries, resolvedWeek, periodDates]);
  const hasAnyMood = moodDays.some((d) => d.mood);

  const generatedParts = resolveGeneratedParts(reflection);
  const hasLetter = Boolean(reflection?.letterMarkdown?.trim());
  const letterMarkdownDisplay = useMemo(
    () =>
      fillLetterNamePlaceholder(
        frameLetterMarkdown(
          coerceLetterMarkdown(
            (reflection?.letterMarkdown ?? "").replace(
              /^(#{1,6}\s+[^\n]+)\n{2,}/gm,
              "$1\n",
            ),
          ),
        ),
        getMedimadeSessionDisplayName(),
      ),
    [reflection?.letterMarkdown],
  );
  const hasGeneratedPatterns = hasAnyGeneratedPatternPart(generatedParts);
  const hasAnyInsights = hasLetter || hasGeneratedPatterns;
  const emotions = normalizeEmotions(reflection?.emotions);
  const showEmotionChart =
    Boolean(generatedParts?.felt) && emotions.length >= 1;
  const wellbeingLevel = parseWellbeingLevel(reflection?.wellbeing);
  const wellbeingVis = wellbeingVisibility(wellbeingLevel);
  const meditationCount = reflection?.meta.meditationChatCount ?? 0;
  const pendingLetter = Boolean(pendingGeneration?.letter);
  const pendingFelt = Boolean(pendingGeneration?.patterns.felt);
  const pendingMoved = Boolean(pendingGeneration?.patterns.moved);
  const pendingWins = Boolean(pendingGeneration?.patterns.wins);
  const pendingThought = Boolean(pendingGeneration?.patterns.thought);
  const pendingAnyPattern =
    pendingFelt || pendingMoved || pendingWins || pendingThought;

  const letterTitle = useMemo(() => {
    if (!hasLetter || !reflection) {
      if (!periodDates) return "Your insights";
      return `Your insights for ${formatRangeWords(
        periodDates.startDate,
        periodDates.endDate,
      )}`;
    }
    const plain = plainFromMarkdown(letterMarkdownDisplay);
    const withoutDear = plain.replace(/^Dear\s+[^,.]+[,.]?\s*/i, "").trim();
    const m = withoutDear.match(/^(.{12,72}?)(?:[.!?]|\n|$)/);
    const snippet = (m?.[1] ?? withoutDear).trim();
    if (snippet.length >= 12) {
      const words = snippet.split(/\s+/).slice(0, 8).join(" ");
      return words.endsWith(".") || words.endsWith("!") || words.endsWith("?")
        ? words.slice(0, -1)
        : words;
    }
    return periodDates
      ? `Your insights for ${formatRangeWords(
          periodDates.startDate,
          periodDates.endDate,
        )}`
      : `Your insights for ${weekLabel}`;
  }, [hasLetter, letterMarkdownDisplay, reflection, periodDates, weekLabel]);

  const writtenFromLine = useMemo(() => {
    if (!hasAnyInsights) return null;
    const j = reflection?.meta.journalEntryCount ?? weekEntryCount;
    let line = `Written from your ${j} journal ${j === 1 ? "entry" : "entries"}`;
    if (meditationCount > 0) {
      line += ` and ${meditationCount} meditation${meditationCount === 1 ? "" : "s"}`;
    }
    return line;
  }, [hasAnyInsights, reflection, weekEntryCount, meditationCount]);

  const createMeditation = useCallback(() => {
    if (!hasAnyInsights || !reflection) return;
    const plain = hasLetter
      ? plainFromMarkdown(letterMarkdownDisplay)
      : "";
    const prompt = buildInsightsMeditationPrompt({
      letterPlain: plain,
      emotions: reflection.emotions,
      weekLabel: weekLabelLong,
      wins: generatedParts?.wins
        ? reflection.wins?.map((w) => (typeof w === "string" ? w : w.text))
        : undefined,
      thought: generatedParts?.thought
        ? reflection.recurringThought?.text
        : undefined,
    });
    writeInsightsMeditationPrompt(prompt);
    navigate(insightsCreateMeditationHref());
  }, [
    generatedParts,
    hasAnyInsights,
    hasLetter,
    letterMarkdownDisplay,
    navigate,
    reflection,
    weekLabelLong,
  ]);

  const meditationSubline = useMemo(() => {
    const top = (emotions ?? []).slice(0, 2).map((e) => e.name.toLowerCase());
    const source = hasLetter ? "letter" : "insights";
    if (top.length >= 2) {
      return `Written from your ${source}: easing ${top[0]}, and trusting the ${top[1]}.`;
    }
    if (top.length === 1) {
      return `Written from your ${source}: easing into ${top[0]}.`;
    }
    return `Written from your ${source}: a practice shaped by ${uiCopy.periodNoun}.`;
  }, [emotions, hasLetter, uiCopy.periodNoun]);

  const weekStartWeekday = weekdayLong(resolvedWeek.weekStart);
  const showPatternsSection =
    hasAnyInsights ||
    hasAnyMood ||
    pendingAnyPattern ||
    Boolean(pendingGeneration) ||
    !loading;

  const letterOpen = !letterCollapsed;
  const patternsOpen = !patternsCollapsed;
  const letterCollapsible = hasLetter && !pendingLetter;
  /** Only the dashed “Add patterns” CTA — do not collapse that alone. */
  const patternsOnlyAddCta =
    hasLetter &&
    !hasGeneratedPatterns &&
    !pendingAnyPattern &&
    !hasAnyMood;
  const patternsCollapsible = showPatternsSection && !patternsOnlyAddCta;

  const letterMinutes = hasLetter && reflection
    ? letterMinutesRead(letterMarkdownDisplay)
    : 1;
  const letterPreview =
    hasLetter && reflection
      ? firstLetterSentence(letterMarkdownDisplay)
      : "";

  const patternsCollapsedMeta = useMemo(() => {
    const bits: string[] = [];
    if (showEmotionChart && emotions[0]) {
      bits.push(`${emotions[0].name} ${emotions[0].score}/10`);
    }
    const arc = reflection?.arc;
    if (generatedParts?.moved && arc?.start && arc?.end) {
      bits.push(`${arc.start} → ${arc.end}`);
    }
    const wins = (reflection?.wins ?? []).filter((w) => {
      const text = typeof w === "string" ? w : w.text;
      return Boolean(text);
    });
    if (generatedParts?.wins && wins.length > 0) {
      bits.push(`${wins.length} win${wins.length === 1 ? "" : "s"}`);
    }
    if (bits.length === 0) return "Expand";
    return `${bits.slice(0, 3).join(" · ")} · Expand`;
  }, [
    emotions,
    generatedParts,
    reflection,
    showEmotionChart,
  ]);

  const letterMeta = letterCollapsible
    ? `${letterMinutes} min read · ${letterOpen ? "Collapse" : "Expand"}`
    : "";
  const patternsMeta = patternsCollapsible
    ? patternsOpen
      ? "From your mood tags and what you wrote · Collapse"
      : patternsCollapsedMeta
    : hasGeneratedPatterns || hasAnyMood
      ? "From your mood tags and what you wrote"
      : "";

  const showLetterBlock =
    apiEnabled &&
    !loading &&
    (pendingLetter ||
      hasLetter ||
      hasGeneratedPatterns ||
      (!hasAnyInsights && !pendingAnyPattern));

  return (
    <div className="flex flex-col gap-7">
      {wellbeingVis.fullBanner || wellbeingVis.softBanner ? (
        <InsightsSupportBanner
          level={wellbeingLevel}
          rangeKey={
            reflection?.rangeKey ||
            (periodDates
              ? `${periodDates.startDate}_${periodDates.endDate}`
              : undefined)
          }
        />
      ) : null}
      <div className="flex items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.09em] text-accent-link">
            {headerLabel}
          </p>
          <h1 className="font-display text-[clamp(1.75rem,3vw,2.25rem)] font-normal tracking-tight text-foreground">
            {letterTitle}
          </h1>
          {writtenFromLine ? (
            <p className="text-sm text-muted">{writtenFromLine}</p>
          ) : !hasAnyInsights && !loading ? (
            <p className="text-sm text-muted">
              Your insights are written from these days&apos; journal entries.
            </p>
          ) : null}
        </div>
        {hasAnyInsights ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-label="Insights options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-transparent text-muted transition-colors hover:text-foreground"
            >
              <MoreHorizontal className="size-[18px]" strokeWidth={2} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-xl border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  disabled={!apiEnabled || generating}
                  onClick={() => openGenerateDialog()}
                  className="flex w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
                >
                  Generate again…
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {!apiEnabled ? (
        <p className="text-sm italic text-muted">
          Set{" "}
          <code className="rounded bg-background px-1 py-0.5 not-italic">
            VITE_MEDIMADE_API_URL
          </code>{" "}
          to enable weekly reflections.
        </p>
      ) : loading ? (
        <p className="text-sm italic text-muted">Loading…</p>
      ) : null}

      {notice ? (
        <InsightsNoticeCard
          notice={notice}
          onDismiss={() => setNotice(null)}
          onRetry={
            notice.kind === "error"
              ? () => {
                  const last = lastGenerateSelectionRef.current;
                  if (last) {
                    void generate(last);
                    return;
                  }
                  openGenerateDialog();
                }
              : undefined
          }
        />
      ) : null}

      {showLetterBlock ? (
        <section aria-label="Your letter" className="flex flex-col">
          {!hasAnyInsights && !pendingLetter && !pendingAnyPattern ? (
            <section
              aria-label="Before insights are written"
              className="flex flex-col gap-5 rounded-xl border-[1.5px] border-dashed border-border px-6 py-5 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
                  Before the letter is written
                </span>
                <span className="font-display text-xl font-normal text-foreground">
                  Your insights are written from these days&apos; entries.
                </span>
                <span className="text-sm text-foreground/80">
                  {weekEntryCount === 0
                    ? "Write your first entry in these dates to get insights."
                    : weekEntryCount === 1
                      ? "You've written 1 so far. A couple more make it richer."
                      : `You've written ${weekEntryCount} so far. A couple more make it richer.`}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  to="/journal/my"
                  className="inline-flex h-12 cursor-pointer items-center rounded-full border border-border bg-card px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-accent/40"
                >
                  Write an entry
                </Link>
                <button
                  type="button"
                  disabled={!apiEnabled || generating || weekEntryCount === 0}
                  title={
                    weekEntryCount === 0
                      ? "Write at least one journal entry in these dates first"
                      : undefined
                  }
                  onClick={() => openGenerateDialog()}
                  className="inline-flex h-12 cursor-pointer items-center rounded-full accent-fill-gradient px-5 text-[15px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Generate insights…
                </button>
              </div>
            </section>
          ) : (
            <>
              <InsightsSectionHeader
                id="insights-letter"
                title="Your letter"
                meta={letterMeta}
                expanded={letterOpen}
                collapsible={letterCollapsible}
                onToggle={() =>
                  persistCollapse({
                    letterCollapsed: !letterCollapsed,
                    patternsCollapsed,
                  })
                }
              />
              {letterCollapsible && !letterOpen && letterPreview ? (
                <button
                  type="button"
                  onClick={() =>
                    persistCollapse({
                      letterCollapsed: false,
                      patternsCollapsed,
                    })
                  }
                  className="cursor-pointer truncate pt-3 text-left text-[15px] italic text-muted"
                >
                  {letterPreview}
                  {letterPreview.endsWith(".") ? "" : "…"}
                </button>
              ) : null}
              {letterCollapsible ? (
                <InsightsCollapsibleBody
                  id="insights-letter"
                  open={letterOpen}
                >
                  {pendingLetter ? (
                    <p className="py-6 font-display text-lg italic text-muted">
                      Writing your letter…
                    </p>
                  ) : reflection ? (
                    <article className="max-w-[680px] py-6">
                      <div className="font-sans text-[17px] font-normal leading-[1.7] text-foreground [&_em]:italic [&_em]:font-normal [&_strong]:!text-[17px] [&_strong]:!font-medium [&_strong]:leading-[inherit] [&_strong]:text-foreground [&_[role=heading]]:mb-1.5 [&_[role=heading]]:mt-7 [&_[role=heading]]:font-display [&_[role=heading]]:!text-[17px] [&_[role=heading]]:font-semibold [&_[role=heading]]:leading-snug [&_[role=heading]]:tracking-tight [&_[role=heading]]:text-foreground [&_[role=heading]:first-child]:mt-0">
                        <ChatMarkdown
                          text={letterMarkdownDisplay}
                          singleAsteriskAs="italic"
                        />
                      </div>
                      <LetterFeedbackRow
                        key={`${reflection.rangeKey || reflection.startDate}-${reflection.meta.generatedAt}`}
                        rangeKey={
                          reflection.rangeKey ||
                          `${reflection.startDate ?? ""}_${reflection.endDate ?? ""}`
                        }
                        initial={reflection.letterFeedback ?? null}
                        regenerating={generating && Boolean(pendingLetter)}
                        onRewrite={rewriteLetterFromFeedback}
                      />
                    </article>
                  ) : null}
                </InsightsCollapsibleBody>
              ) : pendingLetter ? (
                <p className="py-6 font-display text-lg italic text-muted">
                  Writing your letter…
                </p>
              ) : hasGeneratedPatterns ? (
                <button
                  type="button"
                  disabled={!apiEnabled || generating}
                  onClick={() =>
                    openGenerateDialog({ letter: true, patterns: false })
                  }
                  className="mt-4 flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-4 text-left transition-colors hover:border-accent/40 disabled:opacity-50"
                >
                  <span className="font-display text-lg text-foreground">
                    Add a letter →
                  </span>
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {apiEnabled && !loading && showPatternsSection ? (
        <section aria-label="Patterns" className="flex flex-col">
          <InsightsSectionHeader
            id="insights-patterns"
            title="Patterns"
            meta={patternsMeta}
            expanded={patternsOpen}
            collapsible={patternsCollapsible}
            onToggle={() =>
              persistCollapse({
                letterCollapsed,
                patternsCollapsed: !patternsCollapsed,
              })
            }
          />

          {patternsCollapsible ? (
            <InsightsCollapsibleBody
              id="insights-patterns"
              open={patternsOpen}
            >
              <div className="flex flex-col gap-4 pt-5">
                {hasLetter && !hasGeneratedPatterns && !pendingAnyPattern ? (
                  <button
                    type="button"
                    disabled={!apiEnabled || generating}
                    onClick={() =>
                      openGenerateDialog({ letter: false, patterns: true })
                    }
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-4 text-left transition-colors hover:border-accent/40 disabled:opacity-50"
                  >
                    <span className="text-sm font-semibold text-accent-link">
                      Add patterns →
                    </span>
                  </button>
                ) : null}

                {pendingFelt ? (
                  <div
                    className="flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card px-6 py-[22px]"
                    aria-busy
                  >
                    <div className="h-4 w-40 animate-pulse rounded bg-border-subtle" />
                    <div className="flex flex-col gap-3">
                      <div className="h-2.5 animate-pulse rounded-full bg-border-subtle" />
                      <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-border-subtle" />
                      <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-border-subtle" />
                    </div>
                  </div>
                ) : generatedParts?.felt && wellbeingVis.emotions ? (
                  <div className="relative z-[1] flex flex-col gap-3 overflow-visible rounded-xl border border-border bg-card px-6 py-[22px]">
                    <div className="text-sm font-semibold text-foreground">
                      {uiCopy.feltTitle}
                    </div>
                    {showEmotionChart ? (
                      <>
                        <EmotionBars emotions={emotions} />
                        <p className="pt-0.5 text-xs leading-relaxed text-muted">
                          Hover a feeling to see what you wrote. Read from your
                          entries by AI — a reflection, not a measurement.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted">
                        Emotion scores will appear here once generation finishes
                        reading this writing.
                      </p>
                    )}
                  </div>
                ) : null}

                {hasAnyMood || hasAnyInsights || pendingAnyPattern ? (
                  <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-card px-6 py-[22px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">
                        Mood
                      </div>
                      <span className="text-[12px] text-muted">
                        From your mood tags
                      </span>
                    </div>
                    <MoodWeekStrip
                      days={moodDays}
                      summary={
                        hasAnyInsights ? reflection?.moodSummary : undefined
                      }
                    />
                  </div>
                ) : null}

                <InsightsPatternCards
                  reflection={reflection}
                  recentLetters={recentLetters}
                  storeEntries={storeEntries}
                  weekLabel={weekLabelLong}
                  periodDays={periodDays}
                  wellbeingLevel={wellbeingLevel}
                  generatedParts={generatedParts}
                  loadingParts={
                    pendingAnyPattern
                      ? {
                          moved: pendingMoved,
                          wins: pendingWins,
                          thought: pendingThought,
                        }
                      : null
                  }
                />

                {hasAnyInsights && wellbeingVis.turnIntoMeditation ? (
                  <div className="flex flex-col gap-4 rounded-xl bg-deep px-[26px] py-[22px] text-[color-mix(in_srgb,white_92%,var(--gold))] sm:flex-row sm:items-center sm:gap-5">
                    <span
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-deep"
                    >
                      <Play className="size-4 fill-current" strokeWidth={0} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-display text-xl font-normal">
                        {uiCopy.meditationTitle}
                      </span>
                      <span className="text-sm text-[color-mix(in_srgb,white_70%,transparent)]">
                        {meditationSubline}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={createMeditation}
                      className="inline-flex h-12 shrink-0 cursor-pointer items-center rounded-full bg-accent px-[22px] text-[15px] font-semibold text-deep transition-opacity hover:opacity-90"
                    >
                      Create meditation
                    </button>
                  </div>
                ) : null}
              </div>
            </InsightsCollapsibleBody>
          ) : (
            <div className="flex flex-col gap-4 pt-5">
              {hasLetter && !hasGeneratedPatterns && !pendingAnyPattern ? (
                <button
                  type="button"
                  disabled={!apiEnabled || generating}
                  onClick={() =>
                    openGenerateDialog({ letter: false, patterns: true })
                  }
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-4 text-left transition-colors hover:border-accent/40 disabled:opacity-50"
                >
                  <span className="text-sm font-semibold text-accent-link">
                    Add patterns →
                  </span>
                </button>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      <InsightsGenerateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onGenerate={(selection) => void generate(selection)}
        entryCount={weekEntryCount}
        meditationCount={meditationCount}
        weekStartLabel={weekStartWeekday}
        prefill={dialogPrefill}
      />
    </div>
  );
}
