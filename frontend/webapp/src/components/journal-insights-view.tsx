import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import { SectionEyebrow } from "@/components/section-eyebrow";
import {
  fetchJournalInsightsPreviewRemote,
  fetchJournalInsightsRemote,
  generateJournalLetterAudioRemote,
  getMedimadeApiBase,
  isLikelyInsightsGatewayTimeout,
  listJournalWeeklyLettersRemote,
  pollJournalWeeklyReflectionAfterGenerate,
  runJournalWeeklyReflectionRemote,
  type JournalInsights,
  type JournalInsightsTopicId,
  type JournalWeeklyLetterSummary,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";
import {
  clearJournalRemoteSessionCache,
  getCachedJournalInsights,
  getCachedWeeklyLetters,
  invalidateCachedWeeklyLetters,
  invalidateCachedWeeklyReflection,
  setCachedJournalInsights,
  setCachedWeeklyLetters,
  setCachedWeeklyReflection,
} from "@/lib/journal-remote-cache";
import { JournalWeeklyReflectionCard } from "@/components/journal-weekly-reflection-card";
import {
  InsightsGenerateDialog,
  type InsightsGenerateSelection,
} from "@/components/insights-generate-dialog";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  insightHeaderLabel,
  insightRangeKey,
  latestInsightEndDate,
} from "@/lib/insight-period";
import { recentCorrectionGuidance } from "@/lib/insight-corrections";

const INSIGHTS_HREF = "/journal/my/insights";

/**
 * Collapsed “more insights” sections. Ordered to match the Insights assembly
 * (Overview → Emotions first). Extra legacy topic summaries follow until the
 * dedicated insight-type sections replace them.
 */
const MORE_INSIGHTS_TOPICS: Array<{ id: JournalInsightsTopicId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "emotions", label: "Emotions & mood patterns" },
  { id: "stress", label: "Stress & coping" },
  { id: "health", label: "Health & body" },
  { id: "relationships", label: "Relationships" },
  { id: "identity", label: "Identity & self-image" },
  { id: "worldview", label: "Worldview" },
  { id: "work", label: "Work" },
  { id: "projects", label: "Projects" },
  { id: "ideas", label: "Ideas" },
  { id: "values", label: "Values & priorities" },
  { id: "habits", label: "Habits & routines" },
  { id: "decisions", label: "Decisions & uncertainty" },
  { id: "growth", label: "Growth & learning" },
];

function insightsWeekKeyFromPath(pathname: string): string | null {
  const m = /^\/journal\/my\/insights\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function letterIdentity(letter: JournalWeeklyLetterSummary): string {
  return (
    letter.rangeKey ||
    (letter.startDate && letter.endDate
      ? insightRangeKey(letter.startDate, letter.endDate)
      : letter.weekKey)
  );
}

function isDateOnly(value: string | undefined | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function letterSidebarTitle(letter: JournalWeeklyLetterSummary): string {
  const start =
    (isDateOnly(letter.startDate) && letter.startDate) ||
    (isDateOnly(letter.weekStart?.slice(0, 10)) &&
      letter.weekStart!.slice(0, 10)) ||
    "";
  const end =
    (isDateOnly(letter.endDate) && letter.endDate) ||
    (isDateOnly(letter.weekEnd?.slice(0, 10)) && letter.weekEnd!.slice(0, 10)) ||
    start;
  if (!isDateOnly(start) || !isDateOnly(end)) {
    if (letter.periodType === "last7") return "Last 7 days";
    if (letter.periodType === "last30") return "Last 30 days";
    return "Insights";
  }
  return insightHeaderLabel(letter.periodType, start, end);
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function InsightTopicSection(props: {
  label: string;
  summaryMarkdown: string;
  updatedAt?: string;
  last?: boolean;
}) {
  const md = props.summaryMarkdown.trim();
  return (
    <section
      className={
        props.last ? "pb-0" : "mb-6 border-b-[0.5px] border-border pb-6"
      }
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-foreground">{props.label}</h2>
        <div className="text-xs text-muted">
          Updated {formatTs(props.updatedAt)}
        </div>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-foreground">
        {md ? (
          <ChatMarkdown text={md} />
        ) : (
          <p className="italic text-muted">No summary yet.</p>
        )}
      </div>
    </section>
  );
}

function InsightsYourLettersSidebar(props: {
  letters: JournalWeeklyLetterSummary[];
  selectedWeekKey: string | null;
  loading: boolean;
  generating?: boolean;
  onSelect: (weekKey: string) => void;
  onGenerate: () => void;
  /** Compact chip row for mobile */
  mobileChips?: boolean;
}) {
  const {
    letters,
    selectedWeekKey,
    loading,
    generating,
    onSelect,
    onGenerate,
    mobileChips,
  } = props;

  if (mobileChips) {
    return (
      <div className="flex shrink-0 flex-col gap-2 lg:hidden">
        <PrimaryCreateButton
          disabled={generating}
          onClick={onGenerate}
          className="w-full"
        >
          Generate insights
        </PrimaryCreateButton>
        {letters.length > 0 ? (
          <>
            <label className="sr-only" htmlFor="insights-week-select">
              Your insights
            </label>
            <select
              id="insights-week-select"
              className="w-full cursor-pointer rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50"
              value={selectedWeekKey ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onSelect(v);
              }}
            >
              {loading ? (
                <option value="">Loading…</option>
              ) : (
                <>
                  <option value="">Choose insights…</option>
                  {letters.map((letter) => {
                    const id = letterIdentity(letter);
                    return (
                      <option key={id} value={id}>
                        {letterSidebarTitle(letter)}
                      </option>
                    );
                  })}
                </>
              )}
            </select>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <aside
      aria-label="Your insights"
      className="relative z-[1] hidden min-h-0 w-[260px] shrink-0 flex-col gap-2 overflow-hidden border-r-[0.5px] border-sidebar-border bg-surface-rail px-3 pb-4 pt-3 xl:w-[300px] lg:flex"
    >
      <PrimaryCreateButton
        disabled={generating}
        onClick={onGenerate}
        className="mb-1 w-full"
      >
        Generate insights
      </PrimaryCreateButton>
      <SectionEyebrow tone="muted" className="px-3 pb-1.5 pt-1">
        Your insights
      </SectionEyebrow>
      <nav
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]"
        aria-label="Your insights"
      >
        {loading ? (
          <p className="px-3 text-sm text-muted">Loading…</p>
        ) : letters.length === 0 ? (
          <p className="px-3 text-sm leading-relaxed text-muted">
            Nothing here yet — generate your first insights from your journal.
          </p>
        ) : (
          <ul className="space-y-1">
            {letters.map((letter) => {
              const id = letterIdentity(letter);
              const isActive = id === selectedWeekKey;
              const title = letterSidebarTitle(letter);
              const preview = letter.preview?.trim();
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    className={`flex w-full cursor-pointer flex-col gap-1 rounded-xl px-4 py-3.5 text-left transition-colors ${
                      isActive
                        ? "border border-border border-l-[3px] border-l-selected bg-card text-foreground shadow-sm"
                        : "border border-transparent hover:bg-card/60"
                    }`}
                  >
                    <span
                      className={`block text-[15px] ${
                        isActive ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {title}
                    </span>
                    <span className="line-clamp-1 text-[13px] text-muted">
                      {preview
                        ? `“${preview.replace(/^["“]|["”]$/g, "")}”`
                        : "Insights from these days"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}

function InsightsEmptyContent(props: {
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <section
      aria-label="Generate insights"
      className="flex flex-col gap-6 py-4"
    >
      <div className="flex flex-col gap-2">
        <SectionEyebrow as="span" tone="muted">
          Insights
        </SectionEyebrow>
        <h1 className="font-display text-[28px] font-normal leading-tight tracking-tight text-foreground sm:text-[32px]">
          See what your journal has been saying
        </h1>
        <p className="max-w-[34rem] text-[15px] leading-relaxed text-foreground/80">
          Generate a letter and patterns from a stretch of entries — mood,
          wins, recurring thoughts, and what&apos;s been lifting you. Pick a
          range and we&apos;ll write from what&apos;s already on the page.
        </p>
      </div>
      <div>
        <PrimaryCreateButton
          disabled={props.generating}
          onClick={props.onGenerate}
        >
          {props.generating ? "Generating…" : "Generate insights"}
        </PrimaryCreateButton>
      </div>
      <p className="text-sm text-muted">
        Prefer to write first?{" "}
        <Link
          to="/journal/my"
          className="font-medium text-accent-link underline-offset-2 hover:underline"
        >
          Open your journal
        </Link>
      </p>
    </section>
  );
}

export function JournalInsightsView() {
  const { pathname: pathnameRaw } = useLocation();
  const pathname = pathnameRaw || INSIGHTS_HREF;
  const navigate = useNavigate();
  const routeWeekKey = insightsWeekKeyFromPath(pathname);

  const cachedInsights = getCachedJournalInsights();
  const cachedLetters = getCachedWeeklyLetters();
  const [insights, setInsights] = useState<JournalInsights | null>(
    () => cachedInsights ?? null,
  );
  const [letters, setLetters] = useState<JournalWeeklyLetterSummary[]>(
    () => cachedLetters?.letters ?? [],
  );
  const [currentWeekKey, setCurrentWeekKey] = useState(
    () => cachedLetters?.currentWeekKey ?? "",
  );
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(() => {
    if (routeWeekKey) return routeWeekKey;
    const first = cachedLetters?.letters[0];
    return first ? letterIdentity(first) : null;
  });
  const [lettersLoading, setLettersLoading] = useState(() => !cachedLetters);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewCounts, setPreviewCounts] = useState({
    entryCount: 0,
    meditationCount: 0,
  });

  const apiEnabled = Boolean(getMedimadeApiBase());

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!apiEnabled) return;
      if (!opts?.force) {
        const cached = getCachedJournalInsights();
        if (cached !== undefined) {
          setInsights(cached);
          return;
        }
      }
      try {
        const got = await fetchJournalInsightsRemote();
        setCachedJournalInsights(got);
        setInsights(got);
      } catch {
        /* offline */
      }
    },
    [apiEnabled],
  );

  const letterMatchesKey = useCallback(
    (letter: JournalWeeklyLetterSummary, key: string | null) => {
      if (!key) return false;
      return letterIdentity(letter) === key || letter.weekKey === key;
    },
    [],
  );

  const pickSelectableKey = useCallback(
    (
      preferred: string | null | undefined,
      list: JournalWeeklyLetterSummary[],
    ): string | null => {
      if (preferred && list.some((l) => letterMatchesKey(l, preferred))) {
        return preferred;
      }
      const first = list[0];
      return first ? letterIdentity(first) : null;
    },
    [letterMatchesKey],
  );

  const loadLetters = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!apiEnabled) {
        setLettersLoading(false);
        return;
      }
      if (!opts?.force) {
        const cached = getCachedWeeklyLetters();
        if (cached) {
          setLetters(cached.letters);
          setCurrentWeekKey(cached.currentWeekKey);
          setSelectedWeekKey((prev) =>
            pickSelectableKey(routeWeekKey || prev, cached.letters),
          );
          setLettersLoading(false);
          return;
        }
      }
      setLettersLoading(true);
      try {
        const got = await listJournalWeeklyLettersRemote();
        setCachedWeeklyLetters(got);
        setLetters(got.letters);
        setCurrentWeekKey(got.currentWeekKey);
        setSelectedWeekKey((prev) =>
          pickSelectableKey(routeWeekKey || prev, got.letters),
        );
      } catch {
        /* offline */
      } finally {
        setLettersLoading(false);
      }
    },
    [apiEnabled, routeWeekKey, pickSelectableKey],
  );

  useEffect(() => {
    void load();
    void loadLetters();
  }, [load, loadLetters]);

  useEffect(() => {
    const on = () => {
      clearJournalRemoteSessionCache();
      void load({ force: true });
      void loadLetters({ force: true });
    };
    window.addEventListener("medimade-session-changed", on);
    return () => window.removeEventListener("medimade-session-changed", on);
  }, [load, loadLetters]);

  useEffect(() => {
    if (!routeWeekKey) return;
    if (letters.some((l) => letterMatchesKey(l, routeWeekKey))) {
      setSelectedWeekKey(routeWeekKey);
    }
  }, [routeWeekKey, letters, letterMatchesKey]);

  useEffect(() => {
    if (!dialogOpen || !apiEnabled) return;
    let cancelled = false;
    void fetchJournalInsightsPreviewRemote({
      periodType: "last7",
      timeZone: clientTimeZone(),
    })
      .then((got) => {
        if (cancelled) return;
        setPreviewCounts({
          entryCount: got.entryCount,
          meditationCount: got.meditationCount,
        });
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, apiEnabled]);

  const topicsById = useMemo(() => {
    const map = new Map<
      JournalInsightsTopicId,
      { summaryMarkdown: string; updatedAt: string }
    >();
    for (const t of insights?.topics ?? []) {
      map.set(t.topicId, {
        summaryMarkdown: t.summaryMarkdown,
        updatedAt: t.updatedAt,
      });
    }
    return map;
  }, [insights]);

  const selectedLetter = useMemo(() => {
    const key = routeWeekKey || selectedWeekKey;
    if (!key) return null;
    return letters.find((l) => letterMatchesKey(l, key)) ?? null;
  }, [letters, routeWeekKey, selectedWeekKey, letterMatchesKey]);

  const activeWeekKey = selectedLetter
    ? letterIdentity(selectedLetter)
    : null;

  const isCurrentWeekLetter =
    Boolean(activeWeekKey) &&
    Boolean(currentWeekKey) &&
    (activeWeekKey === currentWeekKey ||
      letters.some(
        (l) =>
          letterMatchesKey(l, activeWeekKey) &&
          letterMatchesKey(l, currentWeekKey),
      ));

  const selectWeek = useCallback(
    (weekKey: string) => {
      setSelectedWeekKey(weekKey);
      if (insightsWeekKeyFromPath(pathname) === weekKey) return;
      navigate(`${INSIGHTS_HREF}/${encodeURIComponent(weekKey)}`, {
        replace: true,
      });
    },
    [pathname, navigate],
  );

  const openGenerate = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const runGenerate = useCallback(
    async (selection: InsightsGenerateSelection) => {
      if (!apiEnabled) return;
      setDialogOpen(false);
      setGenerating(true);
      const startedAt = Date.now();
      try {
        const applyResult = (got: {
          reflection: JournalWeeklyReflection | null;
          weekKey: string;
          weekStart: string;
          weekEnd: string;
          rangeKey?: string;
        }) => {
          const nextKey =
            got.rangeKey ||
            got.reflection?.rangeKey ||
            got.weekKey ||
            "";
          if (nextKey) {
            invalidateCachedWeeklyReflection(nextKey);
            setCachedWeeklyReflection(nextKey, got);
          }
          invalidateCachedWeeklyLetters();
          void loadLetters({ force: true });
          if (nextKey) {
            setSelectedWeekKey(nextKey);
            navigate(`${INSIGHTS_HREF}/${encodeURIComponent(nextKey)}`, {
              replace: true,
            });
          }
        };

        try {
          const got = await runJournalWeeklyReflectionRemote({
            letter: selection.letter,
            patterns: selection.patterns,
            periodType: selection.periodType,
            startDate: selection.startDate,
            endDate: selection.endDate,
            timeZone: selection.timeZone,
            corrections: recentCorrectionGuidance(10),
          });
          applyResult(got);
          if (
            selection.letter &&
            selection.letterNarration &&
            got.reflection?.letterMarkdown?.trim()
          ) {
            try {
              const audio = await generateJournalLetterAudioRemote({
                startDate: selection.startDate,
                endDate: selection.endDate,
                periodType: selection.periodType,
                timeZone: selection.timeZone,
                ...(selection.letterVoiceId
                  ? { voiceId: selection.letterVoiceId }
                  : {}),
              });
              if (audio.reflection) {
                const nextKey =
                  got.rangeKey ||
                  got.reflection?.rangeKey ||
                  got.weekKey ||
                  "";
                if (nextKey) {
                  setCachedWeeklyReflection(nextKey, {
                    ...got,
                    reflection: audio.reflection,
                  });
                }
              }
            } catch {
              /* letter ok; listen control can retry */
            }
          }
        } catch (e) {
          if (!isLikelyInsightsGatewayTimeout(e)) throw e;
          const recovered = await pollJournalWeeklyReflectionAfterGenerate({
            startDate: selection.startDate,
            endDate: selection.endDate,
            periodType: selection.periodType,
            timeZone: selection.timeZone,
            notBeforeMs: startedAt,
          });
          if (!recovered?.reflection) throw e;
          applyResult(recovered);
          if (
            selection.letter &&
            selection.letterNarration &&
            recovered.reflection.letterMarkdown?.trim()
          ) {
            try {
              const audio = await generateJournalLetterAudioRemote({
                startDate: selection.startDate,
                endDate: selection.endDate,
                periodType: selection.periodType,
                timeZone: selection.timeZone,
                ...(selection.letterVoiceId
                  ? { voiceId: selection.letterVoiceId }
                  : {}),
              });
              if (audio.reflection) {
                const nextKey =
                  recovered.rangeKey ||
                  recovered.reflection.rangeKey ||
                  recovered.weekKey ||
                  "";
                if (nextKey) {
                  setCachedWeeklyReflection(nextKey, {
                    ...recovered,
                    reflection: audio.reflection,
                  });
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e) {
        console.warn("[insights] generate failed", e);
      } finally {
        setGenerating(false);
      }
    },
    [apiEnabled, loadLetters, navigate],
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <InsightsYourLettersSidebar
        letters={letters}
        selectedWeekKey={activeWeekKey}
        loading={lettersLoading}
        generating={generating}
        onSelect={selectWeek}
        onGenerate={openGenerate}
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[color:var(--journal-warm-bg)] px-7 pb-10 pt-9 sm:pb-14">
        <div className="flex w-full max-w-[760px] flex-col gap-7">
          <InsightsYourLettersSidebar
            letters={letters}
            selectedWeekKey={activeWeekKey}
            loading={lettersLoading}
            generating={generating}
            onSelect={selectWeek}
            onGenerate={openGenerate}
            mobileChips
          />

          {activeWeekKey && selectedLetter ? (
            <>
              <JournalWeeklyReflectionCard
                weekKey={activeWeekKey}
                recentLetters={letters}
                onLetterChanged={() => {
                  invalidateCachedWeeklyLetters();
                  void loadLetters({ force: true });
                }}
              />

              <div className={isCurrentWeekLetter ? undefined : "max-sm:hidden"}>
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="mb-6 flex cursor-pointer items-center gap-1 self-start text-sm text-muted transition-colors hover:text-foreground"
                >
                  {moreOpen ? "Show less" : "Show more insights"}
                  {moreOpen ? (
                    <ChevronUp aria-hidden className="size-4" strokeWidth={2} />
                  ) : (
                    <ChevronDown aria-hidden className="size-4" strokeWidth={2} />
                  )}
                </button>

                {moreOpen ? (
                  <div>
                    {MORE_INSIGHTS_TOPICS.map((t, i) => {
                      const row = topicsById.get(t.id);
                      return (
                        <InsightTopicSection
                          key={t.id}
                          label={t.label}
                          summaryMarkdown={row?.summaryMarkdown ?? ""}
                          updatedAt={row?.updatedAt}
                          last={i === MORE_INSIGHTS_TOPICS.length - 1}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <InsightsEmptyContent
              generating={generating}
              onGenerate={openGenerate}
            />
          )}
        </div>
      </div>

      <InsightsGenerateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onGenerate={(selection) => void runGenerate(selection)}
        entryCount={previewCounts.entryCount}
        meditationCount={previewCounts.meditationCount}
        weekStartLabel="Monday"
        lastLetterEndDate={latestInsightEndDate(letters)}
      />
    </div>
  );
}
