import { useEffect, useRef, useState, type ReactNode } from "react";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";

type Props = {
  open: boolean;
  eyebrow: string;
  title: string;
  subtitle?: string;
  footSummary?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children: ReactNode;
};

const CLOSE_MS = 300;

/**
 * Desktop: right panel over the content area (slides from the right).
 * Mobile: bottom sheet (slides up from the bottom).
 */
export function CreateOneFlowPickerShell({
  open,
  eyebrow,
  title,
  subtitle,
  footSummary,
  confirmLabel,
  confirmDisabled,
  onClose,
  onConfirm,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60] md:absolute md:inset-0">
      <button
        type="button"
        aria-label="Close picker"
        className={`absolute inset-0 bg-foreground/25 transition-opacity duration-300 ease-out md:bg-foreground/15 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[18px] bg-background shadow-[0_-8px_32px_rgb(0_0_0_/_0.18)] transition-transform duration-300 ease-out will-change-transform md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[520px] md:rounded-none md:border-l md:border-border md:shadow-[-12px_0_40px_rgb(0_0_0_/_0.12)] ${
          entered
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-x-full md:translate-y-0"
        }`}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden"
          aria-hidden
        />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-1.5 md:px-6 md:pb-3.5 md:pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link md:text-[11px]">
              {eyebrow}
            </p>
            <h2 className="mt-0.5 font-display text-[20px] font-normal leading-tight text-foreground md:text-2xl">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-[13px] text-foreground/90">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground md:h-9 md:w-9"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-6 md:py-4">
          {children}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2.5 md:px-6 md:py-3.5">
          <p className="hidden min-w-0 truncate text-[13px] text-foreground md:block">
            {footSummary ?? "\u00a0"}
          </p>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            style={PRIMARY_ACCENT_FILL_STYLE}
            className="h-11 w-full cursor-pointer rounded-full accent-fill-gradient px-5 text-[14px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 md:h-[42px] md:w-auto md:min-w-[10rem]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
