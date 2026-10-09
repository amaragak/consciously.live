import type { CreateOneFlowStep } from "@/lib/create-one-flow-state";

const STEPS: { id: CreateOneFlowStep; label: string; n: number }[] = [
  { id: "start", label: "Start", n: 1 },
  { id: "shape", label: "Shape", n: 2 },
  { id: "sound", label: "Sound", n: 3 },
];

function stepIndex(step: CreateOneFlowStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function CreateOneFlowStepper({
  step,
  onStepClick,
  compact = false,
}: {
  step: CreateOneFlowStep;
  /** Optional — only past/current steps are clickable when provided. */
  onStepClick?: (step: CreateOneFlowStep) => void;
  /** Tighter chrome for the desktop header slot. */
  compact?: boolean;
}) {
  const current = stepIndex(step);
  return (
    <div
      className={`flex ${compact ? "w-max max-w-full justify-center" : "w-full justify-start"}`}
    >
      <nav
        aria-label="Steps"
        className={`flex items-center ${compact ? "gap-1.5 sm:gap-2" : "gap-3 md:gap-4"}`}
      >
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = Boolean(onStepClick) && i <= current;
          const lit = active || done;
          return (
            <div
              key={s.id}
              className={`flex shrink-0 items-center ${
                compact ? "gap-1.5 sm:gap-2" : "gap-3 md:gap-4"
              }`}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStepClick?.(s.id)}
                aria-label={s.label}
                className={`flex items-center ${
                  compact ? "gap-1 sm:gap-1.5" : "gap-2 md:gap-2.5"
                } ${clickable ? "cursor-pointer" : "cursor-default"}`}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`shrink-0 items-center justify-center rounded-full border font-semibold ${
                    compact
                      ? `hidden h-6 w-6 text-[11px] sm:flex ${
                          lit
                            ? "header-gold-sunlit-fill border-transparent text-on-accent"
                            : "border-[rgb(246_241_231_/_0.35)] bg-transparent text-nav-muted"
                        }`
                      : `flex h-8 w-8 text-[13px] md:h-9 md:w-9 md:text-sm ${
                          lit
                            ? "header-gold-sunlit-fill border-transparent text-on-accent"
                            : "border-border bg-transparent text-muted"
                        }`
                  }`}
                >
                  {done ? (
                    <svg
                      viewBox="0 0 16 16"
                      className={
                        compact ? "h-3 w-3" : "h-3.5 w-3.5 md:h-4 md:w-4"
                      }
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M3.5 8.5 6.5 11.5 12.5 4.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    s.n
                  )}
                </span>
                {compact ? (
                  <>
                    {/* Mobile: labels only — gold when active/done. */}
                    <span
                      className={`text-[13px] sm:hidden ${
                        lit
                          ? "header-gold-sunlit font-bold"
                          : "font-normal text-nav-muted"
                      }`}
                    >
                      {s.label}
                    </span>
                    {/* sm+: circles + ivory labels when active/done. */}
                    <span
                      className={`hidden text-[13px] sm:inline ${
                        lit
                          ? "font-bold text-nav-foreground"
                          : "font-normal text-nav-muted"
                      }`}
                    >
                      {s.label}
                    </span>
                  </>
                ) : (
                  <span
                    className={
                      lit
                        ? "text-[15px] font-semibold text-foreground md:text-base"
                        : "text-[15px] font-normal text-muted md:text-base"
                    }
                  >
                    {s.label}
                  </span>
                )}
              </button>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={`h-px shrink-0 rounded-full ${
                    compact ? "w-3 sm:w-5" : "w-10 md:w-14"
                  } ${
                    done
                      ? "header-gold-sunlit-fill"
                      : compact
                        ? "bg-[rgb(246_241_231_/_0.28)]"
                        : "bg-border"
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
