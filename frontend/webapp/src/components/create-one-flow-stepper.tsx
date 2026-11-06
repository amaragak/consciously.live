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
  shapeSkipped = false,
}: {
  step: CreateOneFlowStep;
  /** Optional — only past/current steps are clickable when provided. */
  onStepClick?: (step: CreateOneFlowStep) => void;
  /** Tighter chrome for the desktop header slot. */
  compact?: boolean;
  /** Sound was opened without Shape — show "Shape · skipped". */
  shapeSkipped?: boolean;
}) {
  const current = stepIndex(step);
  const showShapeSkipped = shapeSkipped && step === "sound";

  /**
   * Mobile page step bar (consciously-mobile-floating-nav): three equal
   * segments — navy line for done, gold for current, muted for later.
   */
  if (!compact) {
    return (
      <nav aria-label="Steps" className="flex w-full gap-2">
        {STEPS.map((s, i) => {
          const skipped = showShapeSkipped && s.id === "shape";
          const done = !skipped && i < current;
          const active = i === current;
          const clickable =
            Boolean(onStepClick) && (i <= current || skipped);
          const label = skipped ? "Shape · skipped" : s.label;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick?.(s.id)}
              aria-label={label}
              aria-current={active ? "step" : undefined}
              className={`flex min-w-0 flex-1 flex-col gap-1.5 ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <span
                aria-hidden
                className={`h-[3px] w-full rounded-full ${
                  active
                    ? "bg-accent"
                    : done
                      ? "bg-[var(--deep,#0f1b2d)]"
                      : "bg-foreground/20"
                }`}
              />
              <span
                className={`truncate text-[13px] ${
                  active
                    ? "font-semibold text-foreground"
                    : "font-normal text-muted"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex w-max max-w-full justify-center">
      <nav
        aria-label="Steps"
        className="flex min-w-0 items-center gap-1.5 sm:gap-2"
      >
        {STEPS.map((s, i) => {
          const skipped = showShapeSkipped && s.id === "shape";
          const done = !skipped && i < current;
          const active = i === current;
          const clickable =
            Boolean(onStepClick) && (i <= current || skipped);
          const lit = active || done;
          const hasLine = i < STEPS.length - 1;
          const label = skipped ? "Shape · skipped" : s.label;
          return (
            <div
              key={s.id}
              className="flex shrink-0 items-center gap-1.5 sm:gap-2"
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStepClick?.(s.id)}
                aria-label={label}
                className={`flex items-center gap-1 sm:gap-1.5 ${
                  clickable ? "cursor-pointer" : "cursor-default"
                }`}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold sm:flex ${
                    skipped
                      ? "border-[rgb(246_241_231_/_0.35)] bg-transparent text-nav-muted"
                      : lit
                        ? "header-gold-sunlit-fill border-transparent text-on-accent"
                        : "border-[rgb(246_241_231_/_0.35)] bg-transparent text-nav-muted"
                  }`}
                >
                  {done ? (
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3 w-3"
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
                  className={`text-[13px] sm:hidden ${
                    skipped
                      ? "font-normal text-nav-muted"
                      : lit
                        ? "header-gold-sunlit font-bold"
                        : "font-normal text-nav-muted"
                  }`}
                >
                  {label}
                </span>
                <span
                  className={`hidden text-[13px] sm:inline ${
                    skipped
                      ? "font-normal text-nav-muted"
                      : lit
                        ? "font-bold text-nav-foreground"
                        : "font-normal text-nav-muted"
                  }`}
                >
                  {label}
                </span>
              </button>
              {hasLine ? (
                <span
                  aria-hidden
                  className={`h-px w-3 shrink-0 rounded-full sm:w-5 ${
                    done
                      ? "header-gold-sunlit-fill"
                      : "bg-[rgb(246_241_231_/_0.28)]"
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
