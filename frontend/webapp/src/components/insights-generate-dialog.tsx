import { useEffect, useId, useRef, useState } from "react";
import type { JournalWeeklyPatternsSelection } from "@/lib/medimade-api";

export const INSIGHTS_GENERATE_PREFS_KEY = "mm_insights_generate_prefs_v1";

export type InsightsGeneratePrefs = {
  remember: boolean;
  letter: boolean;
  patterns: boolean;
  felt: boolean;
  moved: boolean;
  wins: boolean;
  thought: boolean;
};

export type InsightsGenerateSelection = {
  letter: boolean;
  patterns: JournalWeeklyPatternsSelection;
  remember: boolean;
};

export type InsightsGeneratePrefill = {
  letter?: boolean;
  patterns?: boolean;
};

const DEFAULT_PREFS: InsightsGeneratePrefs = {
  remember: false,
  letter: true,
  patterns: true,
  felt: true,
  moved: true,
  wins: true,
  thought: true,
};

function readPrefs(): InsightsGeneratePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(INSIGHTS_GENERATE_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<InsightsGeneratePrefs>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFS };
    if (parsed.remember !== true) return { ...DEFAULT_PREFS };
    return {
      remember: true,
      letter: parsed.letter !== false,
      patterns: parsed.patterns !== false,
      felt: parsed.felt !== false,
      moved: parsed.moved !== false,
      wins: parsed.wins !== false,
      thought: parsed.thought !== false,
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

type Props = {
  open: boolean;
  onClose: () => void;
  onGenerate: (selection: InsightsGenerateSelection) => void;
  entryCount: number;
  meditationCount: number;
  weekStartLabel: string;
  /** When set, overrides letter/patterns top-level defaults for this open. */
  prefill?: InsightsGeneratePrefill | null;
};

export function InsightsGenerateDialog({
  open,
  onClose,
  onGenerate,
  entryCount,
  meditationCount,
  weekStartLabel,
  prefill = null,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [letter, setLetter] = useState(true);
  const [patterns, setPatterns] = useState(true);
  const [felt, setFelt] = useState(true);
  const [moved, setMoved] = useState(true);
  const [wins, setWins] = useState(true);
  const [thought, setThought] = useState(true);
  const [remember, setRemember] = useState(false);
  const [patternsOpen, setPatternsOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prefs = readPrefs();
    let nextLetter = prefs.letter;
    let nextPatterns = prefs.patterns;
    if (prefill) {
      if (typeof prefill.letter === "boolean") nextLetter = prefill.letter;
      if (typeof prefill.patterns === "boolean") nextPatterns = prefill.patterns;
    }
    setLetter(nextLetter);
    setPatterns(nextPatterns);
    setFelt(prefs.felt);
    setMoved(prefs.moved);
    setWins(prefs.wins);
    setThought(prefs.thought);
    setRemember(prefs.remember);
    setPatternsOpen(false);

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
  }, [open, prefill]);

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
  const canGo = letter || patternsEffective;

  const medPart =
    meditationCount > 0
      ? ` and ${meditationCount} meditation${meditationCount === 1 ? "" : "s"}`
      : "";
  const subline = `From your ${entryCount} ${entryCount === 1 ? "entry" : "entries"}${medPart} since ${weekStartLabel}.`;

  const submit = () => {
    if (!canGo) return;
    const selection: InsightsGenerateSelection = {
      letter,
      patterns: patternsEffective
        ? { felt, moved, wins, thought }
        : { felt: false, moved: false, wins: false, thought: false },
      remember,
    };
    writeInsightsGeneratePrefs({
      remember,
      letter,
      patterns: patternsEffective,
      felt,
      moved,
      wins,
      thought,
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
        className="flex max-h-[min(92vh,34rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[20px] border border-border bg-[color:var(--journal-warm-bg,#FAF6F0)] shadow-[0_24px_60px_rgba(27,34,48,0.25)] outline-none sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 pb-3 pt-5 sm:px-6 sm:pt-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2
              id={titleId}
              className="font-display text-[1.35rem] font-normal tracking-tight text-foreground sm:text-[1.45rem]"
            >
              Generate this week&apos;s insights
            </h2>
            <p className="text-[13px] leading-snug text-muted">{subline}</p>
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
                A personal note from your week: what came up, what shifted, what
                to carry forward.
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
                  Charts and highlights: how the week felt and moved, wins,
                  promises and recurring thoughts.
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
                          How this week felt{" "}
                          <span className="text-muted">· emotion scores</span>
                        </>
                      ),
                    },
                    {
                      key: "moved" as const,
                      checked: moved,
                      label: "How the week moved",
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
                  Always on: Mood week, What lifts you, Your month so far.
                </p>
              </div>
            ) : null}
          </div>

          {entryCount < 2 ? (
            <p className="rounded-lg border border-border/80 bg-background/60 px-3 py-2 text-[13px] leading-snug text-muted">
              Insights are richer with a few more entries. You can still
              generate now.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3 sm:px-6">
          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 shrink-0 accent-[var(--accent,#C98A55)]"
            />
            <span className="leading-snug">Remember my choices</span>
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
              {canGo ? "Generate" : "Choose at least one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
