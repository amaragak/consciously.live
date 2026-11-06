"use client";

import { useEffect, useRef, useState } from "react";
import {
  COVERAGE_MARK,
  coverageLevelLabel,
  labelCoverageLevel,
} from "@/lib/onboarding-state";
import {
  ONB_EASE,
  ensureOnboardingMotionCss,
  usePrefersReducedMotion,
} from "@/lib/onboarding-motion";

export type CoverageBarItem = {
  key: string;
  title: string;
  sub: string;
  score: number;
};

export function CoverageBars({
  items,
  compact,
  animate = true,
  onAllFilled,
}: {
  items: CoverageBarItem[];
  compact?: boolean;
  animate?: boolean;
  onAllFilled?: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number[]>(() =>
    items.map(() => (animate && !reduced ? 0 : 1)),
  );
  const [checks, setChecks] = useState<boolean[]>(() =>
    items.map((it) =>
      animate && !reduced ? false : it.score >= COVERAGE_MARK,
    ),
  );
  const prevScores = useRef(items.map((i) => i.score));
  const filledOnce = useRef(false);

  useEffect(() => {
    ensureOnboardingMotionCss();
  }, []);

  // Initial staggered fill (or compact value change).
  useEffect(() => {
    if (!animate || reduced) {
      setDisplay(items.map(() => 1));
      setChecks(items.map((it) => it.score >= COVERAGE_MARK));
      if (!filledOnce.current) {
        filledOnce.current = true;
        onAllFilled?.();
      }
      return;
    }

    const timers: number[] = [];
    const isUpdate = filledOnce.current;

    if (!isUpdate) {
      setDisplay(items.map(() => 0));
      setChecks(items.map(() => false));
      items.forEach((item, i) => {
        timers.push(
          window.setTimeout(() => {
            setDisplay((prev) => {
              const next = [...prev];
              next[i] = 1;
              return next;
            });
          }, i * 150),
        );
        if (item.score >= COVERAGE_MARK) {
          timers.push(
            window.setTimeout(
              () => {
                setChecks((prev) => {
                  const next = [...prev];
                  next[i] = true;
                  return next;
                });
              },
              i * 150 + 700,
            ),
          );
        }
      });
      timers.push(
        window.setTimeout(
          () => {
            filledOnce.current = true;
            onAllFilled?.();
          },
          items.length * 150 + 700,
        ),
      );
    } else {
      // Animate from previous scores to new (follow-up re-analyse).
      items.forEach((item, i) => {
        const prev = prevScores.current[i] ?? 0;
        if (Math.abs(prev - item.score) < 0.02) return;
        setDisplay((d) => {
          const next = [...d];
          next[i] = 0;
          return next;
        });
        timers.push(
          window.setTimeout(() => {
            setDisplay((d) => {
              const next = [...d];
              next[i] = 1;
              return next;
            });
            if (item.score >= COVERAGE_MARK) {
              setChecks((c) => {
                const next = [...c];
                next[i] = true;
                return next;
              });
            }
          }, 40),
        );
      });
    }
    prevScores.current = items.map((i) => i.score);
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.key}:${i.score}`).join("|"), animate, reduced]);

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-2.5 rounded-2xl border border-border bg-[#FFFDF8] p-3.5"
          : "flex flex-col gap-4"
      }
    >
      {items.map((item, i) => {
        const shown = (display[i] ?? 1) * item.score;
        const level = labelCoverageLevel(shown);
        const coveredNow = checks[i] && item.score >= COVERAGE_MARK;
        const pct = Math.round(Math.max(0, Math.min(1, shown)) * 100);
        const markPct = Math.round(COVERAGE_MARK * 100);
        return (
          <div key={item.key} className="min-w-0">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={
                    compact
                      ? "text-[13.5px] font-semibold text-foreground"
                      : "text-[15px] font-semibold text-foreground"
                  }
                >
                  {item.title}
                </p>
                {!compact ? (
                  <p className="text-[13px] text-muted">{item.sub}</p>
                ) : null}
              </div>
              <span
                className={
                  coveredNow
                    ? "inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-[#3D6B4F]"
                    : "shrink-0 text-[12.5px] font-semibold text-muted"
                }
              >
                {coveredNow ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    aria-hidden
                    className="onb-motion-check"
                    style={{
                      animation: reduced
                        ? undefined
                        : `onb-check-pop 250ms ${ONB_EASE} both`,
                    }}
                  >
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                ) : null}
                {coveredNow
                  ? "Covered"
                  : coverageLevelLabel(level)}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-[#E6DDCB]">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[#C8A46A]"
                style={{
                  width: `${pct}%`,
                  transition: reduced
                    ? `width 150ms ${ONB_EASE}`
                    : `width 700ms ${ONB_EASE}`,
                }}
              />
              <span
                className="absolute top-1/2 z-[1] h-3 w-0.5 -translate-y-1/2 bg-[#1E232E]/70"
                style={{ left: `${markPct}%` }}
                aria-hidden
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const TALK_BAR_DEFS: {
  key: "goals" | "values" | "blockers";
  title: string;
  sub: string;
}[] = [
  {
    key: "goals",
    title: "Goals and ambitions",
    sub: "What you want in each life area",
  },
  {
    key: "values",
    title: "Values",
    sub: "What matters most to you",
  },
  {
    key: "blockers",
    title: "Blockers",
    sub: "What gets in the way",
  },
];

export const DOMAIN_BAR_DEFS: {
  key: "goals" | "values" | "blockers" | "heal" | "manifesto";
  title: string;
  sub: string;
}[] = [
  {
    key: "goals",
    title: "Goals",
    sub: "Life areas with a dream or goal",
  },
  {
    key: "values",
    title: "Values",
    sub: "What matters most",
  },
  {
    key: "blockers",
    title: "Blockers",
    sub: "In the way on a life area",
  },
  {
    key: "heal",
    title: "Heal",
    sub: "Something hurting or holding you back",
  },
  {
    key: "manifesto",
    title: "Manifesto",
    sub: "Your one sentence",
  },
];
