import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  fetchJournalInsightsRemote,
  getMedimadeApiBase,
  listJournalWeeklyLettersRemote,
  type JournalInsights,
  type JournalInsightsTopicId,
  type JournalWeeklyLetterSummary,
} from "@/lib/medimade-api";
import {
  clearJournalRemoteSessionCache,
  getCachedJournalInsights,
  getCachedWeeklyLetters,
  invalidateCachedWeeklyLetters,
  setCachedJournalInsights,
  setCachedWeeklyLetters,
} from "@/lib/journal-remote-cache";
import { JournalWeeklyReflectionCard } from "@/components/journal-weekly-reflection-card";
import { ChatMarkdown } from "@/components/chat-markdown";

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

function formatLetterRange(weekStart: string, weekEnd: string): string {
  if (!weekStart || !weekEnd) return "This week";
  try {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  } catch {
    return `${weekStart.slice(0, 10)} – ${weekEnd.slice(0, 10)}`;
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
  currentWeekKey: string;
  selectedWeekKey: string | null;
  loading: boolean;
  onSelect: (weekKey: string) => void;
  /** Compact chip row for mobile */
  mobileChips?: boolean;
}) {
  const {
    letters,
    currentWeekKey,
    selectedWeekKey,
    loading,
    onSelect,
    mobileChips,
  } = props;

  if (mobileChips) {
    return (
      <div className="shrink-0 lg:hidden">
        <label className="sr-only" htmlFor="insights-week-select">
          Your letters
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
          ) : letters.length === 0 ? (
            <option value={currentWeekKey || ""}>This week</option>
          ) : (
            letters.map((letter) => {
              const isCurrent = letter.weekKey === currentWeekKey;
              const range = formatLetterRange(letter.weekStart, letter.weekEnd);
              return (
                <option key={letter.weekKey} value={letter.weekKey}>
                  {isCurrent ? `This week · ${range}` : range}
                </option>
              );
            })
          )}
        </select>
      </div>
    );
  }

  return (
    <aside
      aria-label="Your letters"
      className="relative z-[1] hidden min-h-0 w-[260px] shrink-0 flex-col gap-2 overflow-hidden border-r-[0.5px] border-border bg-surface-rail px-3 pb-4 pt-3 xl:w-[300px] lg:flex"
    >
      <div className="px-3 pb-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
        Your letters
      </div>
      <nav
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]"
        aria-label="Your letters"
      >
        {loading ? (
          <p className="px-3 text-sm text-muted">Loading…</p>
        ) : letters.length === 0 ? (
          <p className="px-3 text-sm text-muted">
            Nothing here yet — your first letter will appear once you write one.
          </p>
        ) : (
          <ul className="space-y-1">
            {letters.map((letter) => {
              const isActive = letter.weekKey === selectedWeekKey;
              const isCurrent = letter.weekKey === currentWeekKey;
              const range = formatLetterRange(letter.weekStart, letter.weekEnd);
              const title = isCurrent ? `This week · ${range}` : range;
              const preview = letter.preview?.trim();
              return (
                <li key={letter.weekKey}>
                  <button
                    type="button"
                    onClick={() => onSelect(letter.weekKey)}
                    className={`flex w-full cursor-pointer flex-col gap-1 rounded-xl px-4 py-3.5 text-left transition-colors ${
                      isActive
                        ? "border border-border border-l-[3px] border-l-accent bg-card text-foreground shadow-sm"
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
                        : isCurrent
                          ? "This week’s letter"
                          : "Weekly letter"}
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
    const cur = cachedLetters?.currentWeekKey;
    if (cur) return cur;
    return cachedLetters?.letters[0]?.weekKey ?? null;
  });
  const [lettersLoading, setLettersLoading] = useState(() => !cachedLetters);
  const [moreOpen, setMoreOpen] = useState(false);

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
          setSelectedWeekKey((prev) => {
            if (routeWeekKey) return routeWeekKey;
            if (prev) {
              if (prev === cached.currentWeekKey) return prev;
              if (cached.letters.some((l) => l.weekKey === prev)) return prev;
            }
            return cached.currentWeekKey || cached.letters[0]?.weekKey || null;
          });
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
        setSelectedWeekKey((prev) => {
          if (routeWeekKey) return routeWeekKey;
          if (prev) {
            if (prev === got.currentWeekKey) return prev;
            if (got.letters.some((l) => l.weekKey === prev)) return prev;
          }
          return got.currentWeekKey || got.letters[0]?.weekKey || null;
        });
      } catch {
        /* offline */
      } finally {
        setLettersLoading(false);
      }
    },
    [apiEnabled, routeWeekKey],
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
    setSelectedWeekKey(routeWeekKey);
  }, [routeWeekKey]);

  const displayLetters = useMemo(() => {
    if (!currentWeekKey) return letters;
    if (letters.some((l) => l.weekKey === currentWeekKey)) return letters;
    return [
      {
        weekKey: currentWeekKey,
        weekStart: "",
        weekEnd: "",
        generatedAt: "",
      },
      ...letters,
    ];
  }, [letters, currentWeekKey]);

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

  const activeWeekKey =
    routeWeekKey || selectedWeekKey || currentWeekKey || null;

  const isCurrentWeekLetter =
    Boolean(activeWeekKey) &&
    Boolean(currentWeekKey) &&
    activeWeekKey === currentWeekKey;

  const selectWeek = useCallback(
    (weekKey: string) => {
      setSelectedWeekKey(weekKey);
      if (insightsWeekKeyFromPath(pathname) === weekKey) return;
      // Keep list URL on desktop; deep-link week for shareable state.
      navigate(`${INSIGHTS_HREF}/${encodeURIComponent(weekKey)}`, {
        replace: true,
      });
    },
    [pathname, navigate],
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <InsightsYourLettersSidebar
        letters={displayLetters}
        currentWeekKey={currentWeekKey}
        selectedWeekKey={activeWeekKey}
        loading={lettersLoading}
        onSelect={selectWeek}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[820px] flex-1 flex-col gap-7 overflow-y-auto px-4 pb-8 pt-3 sm:px-8 sm:pb-10 sm:pt-4 lg:px-10">
        <InsightsYourLettersSidebar
          letters={displayLetters}
          currentWeekKey={currentWeekKey}
          selectedWeekKey={activeWeekKey}
          loading={lettersLoading}
          onSelect={selectWeek}
          mobileChips
        />

        <JournalWeeklyReflectionCard
          weekKey={activeWeekKey}
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
      </div>
    </div>
  );
}
