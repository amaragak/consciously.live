import { useEffect, useRef, type ReactNode } from "react";

/**
 * Lightweight confirm for Custom Sounds. No backdrop blur — the mixer stays
 * visible behind a light scrim.
 */
export function SoundsConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-foreground/15 p-4 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sounds-confirm-title"
        aria-describedby="sounds-confirm-desc"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-[0_16px_40px_rgb(15_27_45_/_0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="sounds-confirm-title"
          className="font-display text-xl font-medium tracking-tight text-foreground"
        >
          {title}
        </h2>
        <div
          id="sounds-confirm-desc"
          className="mt-2 text-sm leading-relaxed text-muted"
        >
          {description}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
