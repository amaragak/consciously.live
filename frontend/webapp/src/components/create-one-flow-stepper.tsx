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
      className={`flex w-full ${compact ? "justify-center" : "justify-start"}`}
    >
      <nav
        aria-label="Steps"
        className={`flex items-center ${compact ? "gap-2" : "gap-3 md:gap-4"}`}
      >
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = Boolean(onStepClick) && i <= current;
          return (
            <div
              key={s.id}
              className={`flex shrink-0 items-center ${
                compact ? "gap-2" : "gap-3 md:gap-4"
              }`}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStepClick?.(s.id)}
                className={`flex items-center ${
                  compact ? "gap-1.5" : "gap-2 md:gap-2.5"
                } ${clickable ? "cursor-pointer" : "cursor-default"}`}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-full border font-semibold ${
                    compact
                      ? "h-6 w-6 text-[11px]"
                      : "h-8 w-8 text-[13px] md:h-9 md:w-9 md:text-sm"
                  } ${
                    active || done
                      ? "header-gold-sunlit-fill border-transparent text-on-accent"
                      : compact
                        ? "border-[rgb(246_241_231_/_0.35)] bg-transparent text-nav-muted"
                        : "border-border bg-transparent text-muted"
                  }`}
                >
                  {done ? (
                    <svg
                      viewBox="0 0 16 16"
                      className={compact ? "h-3 w-3" : "h-3.5 w-3.5 md:h-4 md:w-4"}
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
                <span
                  className={`${
                    compact ? "text-[13px]" : "text-[15px] md:text-base"
                  } ${
                    active || done
                      ? compact
                        ? "font-semibold text-nav-foreground"
                        : "font-semibold text-foreground"
                      : compact
                        ? "font-normal text-nav-muted"
                        : "font-normal text-muted"
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={`h-px shrink-0 rounded-full ${
                    compact ? "w-5" : "w-10 md:w-14"
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
