import { useEffect, useId, useRef, useState } from "react";
import {
  fetchJournalInsightsPreviewRemote,
  type JournalInsightPeriodType,
  type JournalWeeklyPatternsSelection,
} from "@/lib/medimade-api";
import {
  addDaysToDate,
  daysBetweenInclusive,
  formatRangeWords,
  MAX_CUSTOM_RANGE_DAYS,
  resolveInsightPeriod,
  todayInTimeZone,
} from "@/lib/insight-period";

export const INSIGHTS_GENERATE_PREFS_KEY = "mm_insights_generate_prefs_v2";

export type InsightsPeriodPreset = "last7" | "last30" | "custom";

export type InsightsGeneratePrefs = {
  remember: boolean;
  letter: boolean;
  patterns: boolean;
  felt: boolean;
  moved: boolean;
  wins: boolean;
  thought: boolean;
  /** Remembered Covering preset; custom falls back to last7. */
  periodPreset: InsightsPeriodPreset;
};

export type InsightsGenerateSelection = {
  letter: boolean;
  patterns: JournalWeeklyPatternsSelection;
  remember: boolean;
  periodType: JournalInsightPeriodType;
  startDate: string;
  endDate: string;
  timeZone: string;
};

export type InsightsGeneratePrefill = {
  letter?: boolean;
  patterns?: boolean;
  periodType?: JournalInsightPeriodType;
  startDate?: string;
  endDate?: string;
  /** Hide the Covering picker — used when regenerating an existing range. */
  lockPeriod?: boolean;
};

const DEFAULT_PREFS: InsightsGeneratePrefs = {
  remember: false,
  letter: true,
  patterns: true,
  felt: true,
  moved: true,
  wins: true,
  thought: true,
  periodPreset: "last7",
};

function readPrefs(): InsightsGeneratePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(INSIGHTS_GENERATE_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<InsightsGeneratePrefs>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFS };
    if (parsed.remember !== true) return { ...DEFAULT_PREFS };
    const preset =
      parsed.periodPreset === "last30" || parsed.periodPreset === "last7"
        ? parsed.periodPreset
        : "last7";
    return {
      remember: true,
      letter: parsed.letter !== false,
      patterns: parsed.patterns !== false,
      felt: parsed.felt !== false,
      moved: parsed.moved !== false,
      wins: parsed.wins !== false,
      thought: parsed.thought !== false,
      periodPreset: preset,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeInsightsGeneratePrefs(prefs: InsightsGeneratePrefs): void {
  if (typeof window === "undefined") return;
  try {
    if (!prefs.remember) {
      window.localStorage.removeItem(INSIGHTS_GENERATE_PREFS_KEY);
      return;
    }
    window.localStorage.setItem(
      INSIGHTS_GENERATE_PREFS_KEY,
      JSON.stringify({
        remember: true,
        letter: prefs.letter,
        patterns: prefs.patterns,
        felt: prefs.felt,
        moved: prefs.moved,
        wins: prefs.wins,
        thought: prefs.thought,
        periodPreset:
          prefs.periodPreset === "custom" ? "last7" : prefs.periodPreset,
      } satisfies InsightsGeneratePrefs),
    );
  } catch {
    /* ignore */
  }
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return [...nodes].filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-hidden") !== "true" &&
      el.tabIndex !== -1,
  );
}

function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerate: (selection: InsightsGenerateSelection) => void;
  entryCount: number;
  meditationCount: number;
  weekStartLabel: string;
  prefill?: InsightsGeneratePrefill | null;
};

export function InsightsGenerateDialog({
  open,
  onClose,
  onGenerate,
  entryCount,
  meditationCount,
  weekStartLabel: _weekStartLabel,
  prefill = null,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const timeZone = clientTimeZone();

  const [letter, setLetter] = useState(true);
  const [patterns, setPatterns] = useState(true);
  const [felt, setFelt] = useState(true);
  const [moved, setMoved] = useState(true);
  const [wins, setWins] = useState(true);
  const [thought, setThought] = useState(true);
  const [remember, setRemember] = useState(false);
  const [patternsOpen, setPatternsOpen] = useState(false);
  const [periodPreset, setPeriodPreset] =
    useState<InsightsPeriodPreset>("last7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [lockPeriod, setLockPeriod] = useState(false);
  const [previewEntries, setPreviewEntries] = useState(entryCount);
  const [previewMeds, setPreviewMeds] = useState(meditationCount);
  const [previewBusy, setPreviewBusy] = useState(false);

  const today = todayInTimeZone(timeZone);
  const resolvedPeriod = (() => {
    if (lockPeriod && customFrom && customTo) {
      return resolveInsightPeriod({
        periodType: periodPreset === "custom" ? "custom" : periodPreset,
        startDate: customFrom,
        endDate: customTo,
        timeZone,
      });
    }
    if (periodPreset === "custom") {
      return resolveInsightPeriod({
        periodType: "custom",
        startDate: customFrom || today,
        endDate: customTo || today,
        timeZone,
      });
    }
    return resolveInsightPeriod({ periodType: periodPreset, timeZone });
  })();
  const rangeError =
    periodPreset === "custom" && !lockPeriod && !resolvedPeriod.ok
      ? resolvedPeriod.error
      : null;

  useEffect(() => {
    if (!open) return;
    const prefs = readPrefs();
    let nextLetter = prefs.letter;
    let nextPatterns = prefs.patterns;
    let nextPreset: InsightsPeriodPreset = prefs.periodPreset;
    let from = addDaysToDate(today, -6);
    let to = today;
    let nextLock = false;
    if (prefill) {
      if (typeof prefill.letter === "boolean") nextLetter = prefill.letter;
      if (typeof prefill.patterns === "boolean") nextPatterns = prefill.patterns;
      if (prefill.lockPeriod && prefill.startDate && prefill.endDate) {
        nextLock = true;
        from = prefill.startDate;
        to = prefill.endDate;
        if (prefill.periodType === "last7" || prefill.periodType === "last30") {
          nextPreset = prefill.periodType;
        } else {
          nextPreset = "custom";
        }
      } else if (prefill.periodType === "last7" || prefill.periodType === "last30") {
        nextPreset = prefill.periodType;
      } else if (prefill.startDate && prefill.endDate) {
        const asLast7 = resolveInsightPeriod({
          periodType: "last7",
          timeZone,
        });
        const asLast30 = resolveInsightPeriod({
          periodType: "last30",
          timeZone,
        });
        if (
          asLast7.ok &&
          asLast7.period.startDate === prefill.startDate &&
          asLast7.period.endDate === prefill.endDate
        ) {
          nextPreset = "last7";
        } else if (
          asLast30.ok &&
          asLast30.period.startDate === prefill.startDate &&
          asLast30.period.endDate === prefill.endDate
        ) {
          nextPreset = "last30";
        } else {
          nextPreset = "custom";
          from = prefill.startDate;
          to = prefill.endDate;
        }
      }
    }
    setLetter(nextLetter);
    setPatterns(nextPatterns);
    setFelt(prefs.felt);
    setMoved(prefs.moved);
    setWins(prefs.wins);
    setThought(prefs.thought);
    setRemember(prefs.remember);
    setPatternsOpen(false);
    setPeriodPreset(nextPreset);
    setCustomFrom(from);
    setCustomTo(to);
    setLockPeriod(nextLock);
    setPreviewEntries(entryCount);
    setPreviewMeds(meditationCount);

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = focusableWithin(panel);
      (focusables[0] ?? panel).focus();
    }, 0);

    return () => {
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per open
  }, [open, prefill]);

  useEffect(() => {
    if (!open || !resolvedPeriod.ok) return;
    let cancelled = false;
    setPreviewBusy(true);
    void fetchJournalInsightsPreviewRemote({
      startDate: resolvedPeriod.period.startDate,
      endDate: resolvedPeriod.period.endDate,
      periodType: resolvedPeriod.period.periodType,
      timeZone,
    })
      .then((got) => {
        if (cancelled) return;
        setPreviewEntries(got.entryCount);
        setPreviewMeds(got.meditationCount);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewEntries(entryCount);
        setPreviewMeds(meditationCount);
      })
      .finally(() => {
        if (!cancelled) setPreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    resolvedPeriod.ok,
    resolvedPeriod.ok
      ? resolvedPeriod.period.startDate
      : "",
    resolvedPeriod.ok ? resolvedPeriod.period.endDate : "",
    timeZone,
    entryCount,
    meditationCount,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = focusableWithin(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const anySub = felt || moved || wins || thought;
  const patternsEffective = patterns && anySub;
  const noEntries = previewEntries === 0;
  const canGo =
    (letter || patternsEffective) &&
    resolvedPeriod.ok &&
    !noEntries;

  const medPart =
    previewMeds > 0
      ? ` and ${previewMeds} meditation${previewMeds === 1 ? "" : "s"}`
      : "";
  const periodSummary = (() => {
    if (!resolvedPeriod.ok) {
      return "Choose a valid date range.";
    }
    const n = previewEntries;
    const entryWord = n === 1 ? "entry" : "entries";
    if (lockPeriod) {
      const range = formatRangeWords(
        resolvedPeriod.period.startDate,
        resolvedPeriod.period.endDate,
      );
      return `From your ${n} ${entryWord}${medPart} between ${range}.`;
    }
    if (periodPreset === "last7") {
      return `From your ${n} ${entryWord}${medPart} in the last 7 days.`;
    }
    if (periodPreset === "last30") {
      return `From your ${n} ${entryWord}${medPart} in the last 30 days.`;
    }
    const range = formatRangeWords(
      resolvedPeriod.period.startDate,
      resolvedPeriod.period.endDate,
    );
    return `From your ${n} ${entryWord}${medPart} between ${range}.`;
  })();

  const submit = () => {
    if (!canGo || !resolvedPeriod.ok) return;
    const selection: InsightsGenerateSelection = {
      letter,
      patterns: patternsEffective
        ? { felt, moved, wins, thought }
        : { felt: false, moved: false, wins: false, thought: false },
      remember,
      periodType: resolvedPeriod.period.periodType,
      startDate: resolvedPeriod.period.startDate,
      endDate: resolvedPeriod.period.endDate,
      timeZone,
    };
    writeInsightsGeneratePrefs({
      remember,
      letter,
      patterns: patternsEffective,
      felt,
      moved,
      wins,
      thought,
      periodPreset: periodPreset === "custom" ? "last7" : periodPreset,
    });
    onGenerate(selection);
  };

  const togglePatterns = () => {
    setPatterns((v) => {
      const next = !v;
      if (next && !(felt || moved || wins || thought)) {
        setFelt(true);
        setMoved(true);
        setWins(true);
        setThought(true);
      }
      return next;
    });
  };

  const toggleSub = (
    key: "felt" | "moved" | "wins" | "thought",
    next: boolean,
  ) => {
    const nextFelt = key === "felt" ? next : felt;
    const nextMoved = key === "moved" ? next : moved;
    const nextWins = key === "wins" ? next : wins;
    const nextThought = key === "thought" ? next : thought;
    if (key === "felt") setFelt(next);
    if (key === "moved") setMoved(next);
    if (key === "wins") setWins(next);
    if (key === "thought") setThought(next);
    if (!(nextFelt || nextMoved || nextWins || nextThought)) {
      setPatterns(false);
    } else {
      setPatterns(true);
    }
  };

  const segBtn = (id: InsightsPeriodPreset, label: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={periodPreset === id}
      onClick={() => setPeriodPreset(id)}
      className={`flex-1 cursor-pointer rounded-[10px] border px-2 py-2.5 text-[13px] sm:text-[15px] ${
        periodPreset === id
          ? "border-border bg-card font-semibold text-foreground shadow-sm"
          : "border-transparent bg-transparent font-medium text-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-[rgba(27,34,48,0.38)] p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[min(92vh,38rem)] w-full max-w-[580px] flex-col overflow-hidden rounded-t-[20px] border border-border bg-[color:var(--journal-warm-bg,#FAF6F0)] shadow-[0_24px_60px_rgba(27,34,48,0.25)] outline-none sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 pb-3 pt-5 sm:px-6 sm:pt-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2
              id={titleId}
              className="font-display text-[1.35rem] font-normal tracking-tight text-foreground sm:text-[1.55rem]"
            >
              Generate insights
            </h2>
            <p className="text-[13px] leading-snug text-muted">
              {previewBusy ? "Counting entries…" : periodSummary}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg leading-none text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-3.5 sm:px-6">
          {lockPeriod && resolvedPeriod.ok ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground/80">
                Covering
              </span>
              <p className="text-[15px] text-foreground">
                {periodPreset === "last7"
                  ? "Last 7 days"
                  : periodPreset === "last30"
                    ? "Last 30 days"
                    : "Custom range"}
                {" · "}
                {formatRangeWords(
                  resolvedPeriod.period.startDate,
                  resolvedPeriod.period.endDate,
                )}
              </p>
            </div>
          ) : (
            <div role="group" aria-labelledby="insights-period-label" className="flex flex-col gap-2">
              <span
                id="insights-period-label"
                className="text-[13px] font-semibold text-foreground/80"
              >
                Covering
              </span>
              <div className="flex gap-1 rounded-[14px] bg-[color:var(--border-subtle,#F0E7DA)] p-1">
                {segBtn("last7", "Last 7 days")}
                {segBtn("last30", "Last 30 days")}
                {segBtn("custom", "Custom…")}
              </div>
              {periodPreset === "custom" ? (
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex gap-3">
                    <label className="flex flex-1 flex-col gap-1 text-[13px] text-muted">
                      From
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo || today}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="h-11 rounded-[10px] border border-border bg-card px-3 text-[15px] text-foreground outline-none"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-[13px] text-muted">
                      To
                      <input
                        type="date"
                        value={customTo}
                        max={today}
                        min={customFrom || undefined}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="h-11 rounded-[10px] border border-border bg-card px-3 text-[15px] text-foreground outline-none"
                      />
                    </label>
                  </div>
                  <p className="text-[13px] text-muted">
                    Up to {MAX_CUSTOM_RANGE_DAYS} days
                    {customFrom && customTo
                      ? ` · ${daysBetweenInclusive(customFrom, customTo)} selected`
                      : ""}
                    .
                  </p>
                  {rangeError ? (
                    <p className="text-[13px] text-danger">{rangeError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <label className="flex cursor-pointer gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
            <input
              type="checkbox"
              checked={letter}
              onChange={(e) => setLetter(e.target.checked)}
              className="mt-0.5 size-[18px] shrink-0 accent-[var(--accent,#C98A55)]"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-lg font-normal leading-tight text-foreground">
                A letter to you
              </span>
              <span className="text-[13px] leading-snug text-muted">
                A personal note written from these days: what came up, what
                shifted, what to carry forward.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3.5 py-3">
            <label className="flex cursor-pointer gap-3">
              <input
                type="checkbox"
                checked={patterns}
                onChange={togglePatterns}
                className="mt-0.5 size-[18px] shrink-0 accent-[var(--accent,#C98A55)]"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-lg font-normal leading-tight text-foreground">
                  Patterns
                </span>
                <span className="text-[13px] leading-snug text-muted">
                  Charts and highlights: how this time felt and moved, your
                  wins, promises and recurring thoughts.
                </span>
              </span>
            </label>
            <button
              type="button"
              aria-expanded={patternsOpen}
              onClick={() => setPatternsOpen((v) => !v)}
              className="ml-[30px] cursor-pointer self-start border-none bg-transparent py-1 text-[13px] font-semibold text-accent-link"
            >
              {patternsOpen
                ? "Hide pattern options ▴"
                : "Choose which patterns ▾"}
            </button>
            {patternsOpen ? (
              <div className="ml-[30px] flex flex-col border-t border-border-subtle pt-0.5">
                {(
                  [
                    {
                      key: "felt" as const,
                      checked: felt,
                      label: (
                        <>
                          How this time felt{" "}
                          <span className="text-muted">· emotion scores</span>
                        </>
                      ),
                    },
                    {
                      key: "moved" as const,
                      checked: moved,
                      label: "How it moved",
                    },
                    {
                      key: "wins" as const,
                      checked: wins,
                      label: "Wins and promises",
                    },
                    {
                      key: "thought" as const,
                      checked: thought,
                      label: "The thought that keeps coming back",
                    },
                  ] as const
                ).map((row) => (
                  <label
                    key={row.key}
                    className={`flex items-center gap-2.5 py-1.5 text-[13px] leading-snug ${
                      patterns
                        ? "cursor-pointer text-foreground"
                        : "cursor-default text-muted opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.checked}
                      disabled={!patterns}
                      onChange={(e) => toggleSub(row.key, e.target.checked)}
                      className="size-4 shrink-0 accent-[var(--accent,#C98A55)] disabled:cursor-not-allowed"
                    />
                    <span>{row.label}</span>
                  </label>
                ))}
                <p className="px-0.5 pb-0.5 pt-1 text-[12px] leading-snug text-muted">
                  Always on, from your data: Mood, What lifts you, Over time.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3 sm:px-6">
          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 shrink-0 accent-[var(--accent,#C98A55)]"
            />
            <span className="leading-snug">Remember my choices for next time</span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canGo}
              onClick={submit}
              className="inline-flex h-10 cursor-pointer items-center rounded-full accent-fill-gradient px-5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-border disabled:bg-none disabled:text-muted disabled:opacity-100"
            >
              {!resolvedPeriod.ok
                ? "Choose valid dates"
                : noEntries
                  ? "No entries in these dates"
                  : canGo
                    ? "Generate"
                    : "Choose at least one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
