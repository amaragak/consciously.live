import { useEffect, useId, useRef, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import {
  fetchJournalInsightsPreviewRemote,
  getMedimadeMediaBaseUrl,
  listBackgroundAudio,
  listFishSpeakers,
  type FishSpeaker,
  type JournalInsightPeriodType,
  type JournalWeeklyPatternsSelection,
} from "@/lib/medimade-api";
import {
  pickDefaultSpeechifySpeaker,
  speechifySpeakersForPicker,
} from "@/lib/fish-speakers";
import {
  speakerLetterIntroSampleKey,
  withSpeakerSampleCacheBust,
} from "@/lib/speaker-sample-speed";
import {
  addDaysToDate,
  daysBetweenInclusive,
  formatRangeWords,
  MAX_CUSTOM_RANGE_DAYS,
  resolveInsightPeriod,
  resolveSinceLastLetterPeriod,
  todayInTimeZone,
} from "@/lib/insight-period";
import {
  INSIGHTS_GENERATE_PREFS_KEY,
  readInsightsGeneratePrefs,
  writeInsightsGeneratePrefs,
  type InsightsGeneratePrefs,
  type InsightsPeriodPreset,
} from "@/lib/insights-generate-prefs";

export {
  INSIGHTS_GENERATE_PREFS_KEY,
  writeInsightsGeneratePrefs,
  type InsightsGeneratePrefs,
  type InsightsPeriodPreset,
};

export type InsightsGenerateSelection = {
  letter: boolean;
  /** Generate Speechify narration after the letter (opt-in). */
  letterNarration: boolean;
  /** Speechify voice model id (Beatrice when empty / unavailable). */
  letterVoiceId: string;
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

function mediaFileUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

function NarrateSpeakerSelect({
  voices,
  value,
  onChange,
  disabled,
  previewUrlFor,
}: {
  voices: FishSpeaker[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  previewUrlFor: (modelId: string) => string | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionAudioRef = useRef<HTMLAudioElement | null>(null);
  const [open, setOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const selected = voices.find((s) => s.modelId === value);
  const label = selected?.name || "Speaker";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t || rootRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (open) return;
    optionAudioRef.current?.pause();
    setPreviewingId(null);
  }, [open]);

  useEffect(
    () => () => {
      const el = optionAudioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
      }
    },
    [],
  );

  async function toggleOptionPreview(modelId: string) {
    const el = optionAudioRef.current;
    const url = previewUrlFor(modelId);
    if (!el || !url) return;
    if (previewingId === modelId && !el.paused) {
      el.pause();
      setPreviewingId(null);
      return;
    }
    el.loop = false;
    if (el.src !== url) {
      el.src = url;
      el.load();
    }
    try {
      await el.play();
      setPreviewingId(modelId);
    } catch {
      setPreviewingId(null);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled || voices.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Narration speaker"
        title={label}
        onClick={() => {
          if (disabled || voices.length === 0) return;
          setOpen((v) => !v);
        }}
        className="flex w-full min-w-0 items-center gap-1 rounded-[10px] border border-border bg-card px-2.5 py-1.5 text-left text-sm disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {voices.length === 0 ? "Loading…" : label}
        </span>
        <SelectChevron open={open} />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-[90] mt-1 max-h-56 min-w-full overflow-auto rounded-xl border border-border bg-card py-1 shadow-xl"
          role="listbox"
        >
          {voices.map((s) => (
            <div
              key={s.modelId}
              className="flex items-center gap-1 pr-1.5 hover:bg-background"
            >
              <button
                type="button"
                className={`min-w-0 flex-1 truncate px-3 py-1.5 text-left text-sm ${
                  s.modelId === value
                    ? "font-medium text-foreground"
                    : "text-muted"
                }`}
                onClick={() => {
                  onChange(s.modelId);
                  setOpen(false);
                }}
              >
                {s.name}
              </button>
              <button
                type="button"
                disabled={!previewUrlFor(s.modelId)}
                aria-label={
                  previewingId === s.modelId
                    ? `Pause ${s.name} sample`
                    : `Play ${s.name} sample`
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void toggleOptionPreview(s.modelId);
                }}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-accent-link transition-colors hover:bg-accent-soft/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {previewingId === s.modelId ? (
                  <svg
                    viewBox="0 0 24 24"
                    width={14}
                    height={14}
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width={14}
                    height={14}
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M8 5v14l11-7L8 5z" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <audio
        ref={optionAudioRef}
        className="hidden"
        playsInline
        onEnded={() => setPreviewingId(null)}
      />
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerate: (selection: InsightsGenerateSelection) => void;
  entryCount: number;
  meditationCount: number;
  weekStartLabel: string;
  prefill?: InsightsGeneratePrefill | null;
  /**
   * Inclusive end day of the most recent insights letter/range.
   * Enables “Since your last letter” (starts the day after).
   */
  lastLetterEndDate?: string | null;
};

export function InsightsGenerateDialog({
  open,
  onClose,
  onGenerate,
  entryCount,
  meditationCount,
  weekStartLabel: _weekStartLabel,
  prefill = null,
  lastLetterEndDate = null,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const timeZone = clientTimeZone();

  const [letter, setLetter] = useState(true);
  const [letterNarration, setLetterNarration] = useState(false);
  const [letterVoiceId, setLetterVoiceId] = useState("");
  const [speechifySpeakers, setSpeechifySpeakers] = useState<FishSpeaker[]>([]);
  const [mediaBaseUrl, setMediaBaseUrl] = useState<string | null>(null);
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
  const sinceLastAvailable = Boolean(lastLetterEndDate);
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
    if (periodPreset === "sinceLast") {
      if (!lastLetterEndDate) {
        return {
          ok: false as const,
          error: "Generate a letter first to use this range",
        };
      }
      return resolveSinceLastLetterPeriod(lastLetterEndDate, timeZone);
    }
    return resolveInsightPeriod({ periodType: periodPreset, timeZone });
  })();
  const rangeError =
    !lockPeriod &&
    (periodPreset === "custom" || periodPreset === "sinceLast") &&
    !resolvedPeriod.ok
      ? resolvedPeriod.error
      : null;

  useEffect(() => {
    if (!open) return;
    const prefs = readInsightsGeneratePrefs();
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
        if (
          prefill.periodType === "last7" ||
          prefill.periodType === "last30" ||
          prefill.periodType === "sinceLast"
        ) {
          nextPreset = prefill.periodType;
        } else {
          nextPreset = "custom";
        }
      } else if (
        prefill.periodType === "last7" ||
        prefill.periodType === "last30" ||
        prefill.periodType === "sinceLast"
      ) {
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
    if (nextPreset === "sinceLast" && !lastLetterEndDate) {
      nextPreset = "last7";
    }
    setLetter(nextLetter);
    setLetterNarration(nextLetter ? prefs.letterNarration === true : false);
    setLetterVoiceId(
      typeof prefs.letterVoiceId === "string" ? prefs.letterVoiceId.trim() : "",
    );
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
    if (!open) return;
    let cancelled = false;
    const envMedia = getMedimadeMediaBaseUrl();
    void listBackgroundAudio()
      .then((data) => {
        if (cancelled) return;
        const fromApi = data.baseUrl?.trim();
        setMediaBaseUrl(fromApi || envMedia || null);
      })
      .catch(() => {
        if (!cancelled) setMediaBaseUrl(envMedia || null);
      });
    void listFishSpeakers()
      .then((sp) => {
        if (cancelled) return;
        const next = speechifySpeakersForPicker(sp ?? []);
        setSpeechifySpeakers(next);
        setLetterVoiceId((current) => {
          if (current && next.some((s) => s.modelId === current)) return current;
          return pickDefaultSpeechifySpeaker(next)?.modelId ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) setSpeechifySpeakers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
    if (periodPreset === "sinceLast") {
      const range = formatRangeWords(
        resolvedPeriod.period.startDate,
        resolvedPeriod.period.endDate,
      );
      return `From your ${n} ${entryWord}${medPart} since your last letter (${range}).`;
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
      letterNarration: letter && letterNarration,
      letterVoiceId:
        letter && letterNarration && letterVoiceId.trim()
          ? letterVoiceId.trim()
          : "",
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
      letterNarration: letter && letterNarration,
      letterVoiceId:
        letter && letterNarration && letterVoiceId.trim()
          ? letterVoiceId.trim()
          : "",
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

  const segBtn = (
    id: InsightsPeriodPreset,
    label: string,
    opts?: { disabled?: boolean; title?: string },
  ) => (
    <button
      key={id}
      type="button"
      aria-pressed={periodPreset === id}
      disabled={opts?.disabled}
      title={opts?.title}
      onClick={() => {
        if (opts?.disabled) return;
        setPeriodPreset(id);
      }}
      className={`flex-1 cursor-pointer rounded-[10px] border px-2 py-2.5 text-[13px] sm:text-[15px] disabled:cursor-not-allowed disabled:opacity-45 ${
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
                    : periodPreset === "sinceLast"
                      ? "Since your last letter"
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
              <div className="flex flex-col gap-1 rounded-[14px] bg-[color:var(--border-subtle,#F0E7DA)] p-1">
                <div className="flex gap-1">
                  {segBtn("last7", "Last 7 days")}
                  {segBtn("last30", "Last 30 days")}
                  {segBtn("custom", "Custom…")}
                </div>
                {segBtn(
                  "sinceLast",
                  "Since your last letter",
                  sinceLastAvailable
                    ? undefined
                    : {
                        disabled: true,
                        title: "Generate a letter first to use this range",
                      },
                )}
              </div>
              {periodPreset === "sinceLast" ? (
                <div className="flex flex-col gap-1 pt-0.5">
                  {resolvedPeriod.ok ? (
                    <p className="text-[13px] text-muted">
                      From{" "}
                      {formatRangeWords(
                        resolvedPeriod.period.startDate,
                        resolvedPeriod.period.endDate,
                      )}{" "}
                      — the day after your last letter through today.
                    </p>
                  ) : null}
                  {rangeError ? (
                    <p className="text-[13px] text-danger">{rangeError}</p>
                  ) : null}
                </div>
              ) : null}
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
              onChange={(e) => {
                const next = e.target.checked;
                setLetter(next);
                if (!next) setLetterNarration(false);
              }}
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
          {letter ? (
            <div className="ml-[30px] flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <input
                  id="insights-letter-narrate"
                  type="checkbox"
                  checked={letterNarration}
                  onChange={(e) => setLetterNarration(e.target.checked)}
                  className="size-4 shrink-0 cursor-pointer accent-[var(--accent,#C98A55)]"
                />
                <label
                  htmlFor="insights-letter-narrate"
                  className="shrink-0 cursor-pointer text-sm font-semibold leading-tight text-foreground"
                >
                  Narrate with
                </label>
                <NarrateSpeakerSelect
                  voices={speechifySpeakers}
                  value={letterVoiceId}
                  onChange={setLetterVoiceId}
                  disabled={!letterNarration}
                  previewUrlFor={(modelId) => {
                    if (!mediaBaseUrl || !modelId) return null;
                    const speaker = speechifySpeakers.find(
                      (s) => s.modelId === modelId,
                    );
                    return withSpeakerSampleCacheBust(
                      mediaFileUrl(
                        mediaBaseUrl,
                        speakerLetterIntroSampleKey(modelId),
                      ),
                      speaker?.updatedAt,
                    );
                  }}
                />
              </div>
              <p className="pl-[26px] text-[13px] leading-snug text-muted">
                Spoken version of the letter (no music). Takes a minute or two
                after the letter is ready.
              </p>
            </div>
          ) : null}

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
              className="ml-[30px] inline-flex cursor-pointer items-center gap-1 self-start border-none bg-transparent py-1 text-[13px] font-semibold text-accent-link"
            >
              {patternsOpen ? "Hide pattern options" : "Choose which patterns"}
              <SelectChevron open={patternsOpen} />
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
