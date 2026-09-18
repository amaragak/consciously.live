"use client";

type Props = {
  open: boolean;
  taskTitle: string;
  onSkip: () => void;
  onGenerate: () => void;
};

/**
 * Quick confirm before Ideate → Focus: optional 2‑min manifestation/visualization.
 */
export function PlanFocusPreflightModal({
  open,
  taskTitle,
  onSkip,
  onGenerate,
}: Props) {
  if (!open) return null;

  const label =
    taskTitle.trim().length > 48
      ? `${taskTitle.trim().slice(0, 47).trimEnd()}…`
      : taskTitle.trim() || "this goal";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-transparent p-4 sm:items-center"
      role="presentation"
      onClick={onSkip}
    >
      <div
        role="dialog"
        aria-labelledby="focus-preflight-title"
        aria-describedby="focus-preflight-desc"
        className="w-full max-w-md rounded-[16px] border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="focus-preflight-title"
          className="font-display text-xl font-medium text-foreground"
        >
          Set the tone first?
        </h2>
        <p
          id="focus-preflight-desc"
          className="mt-2 text-sm leading-relaxed text-muted"
        >
          Generate a quick{" "}
          <span className="font-medium text-foreground">2‑minute</span>{" "}
          visualisation for a success mindset in this life area — and for
          finishing{" "}
          <span className="font-medium text-foreground">{label}</span> without
          the usual blockers getting in the way. It starts in the background;
          you go straight to Focus. You’ll get a notification when it’s ready.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="cursor-pointer rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-accent-soft/30"
          >
            Skip, just focus
          </button>
          <button
            type="button"
            onClick={onGenerate}
            className="cursor-pointer rounded-xl accent-fill-gradient px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            Yes, generate 2‑min meditation
          </button>
        </div>
      </div>
    </div>
  );
}
