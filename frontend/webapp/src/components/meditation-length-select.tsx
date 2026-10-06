import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CreateFlowNavPill } from "@/components/create-flow-nav-pill";
import {
  MEDITATION_TARGET_MINUTES,
  type MeditationTargetMinutes,
} from "@/lib/medimade-api";

type Props = {
  value: number;
  onChange: (mins: number) => void;
  disabled?: boolean;
  /** Label on the control when not a plain minutes value (e.g. Program / Mixed). */
  displayLabel?: string;
  extraOption?: { label: string; onSelect: () => void };
};

/**
 * Styled length picker for the create-flow bottom bar.
 * Menu opens upward so it clears the bar. Options: 2 / 5 / 10 / 20.
 */
export function MeditationLengthSelect({
  value,
  onChange,
  disabled,
  displayLabel,
  extraOption,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t || rootRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = displayLabel ?? `${value} min`;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1 sm:flex-row sm:gap-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:text-[11px]">
        Length
      </span>
      <div ref={rootRef} className={`relative ${open ? "z-40" : ""}`}>
        <CreateFlowNavPill
          variant="control"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Target meditation length"
          title="Target spoken length. If you change this after generating a script in chat, audio will regenerate the script to match."
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
          }}
          className="min-w-[5.5rem] justify-between text-left disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[6.25rem]"
        >
          <span>{label}</span>
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform sm:h-4 sm:w-4 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </CreateFlowNavPill>
        {open ? (
          <div
            role="listbox"
            className="absolute bottom-full left-1/2 z-[90] mb-1.5 min-w-full -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl"
          >
            {extraOption ? (
              <button
                type="button"
                role="option"
                aria-selected={displayLabel === "Program"}
                className={`block w-full px-3.5 py-2 text-left text-sm hover:bg-background sm:py-2.5 ${
                  displayLabel === "Program"
                    ? "font-semibold text-foreground"
                    : "text-muted"
                }`}
                onClick={() => {
                  extraOption.onSelect();
                  setOpen(false);
                }}
              >
                {extraOption.label}
              </button>
            ) : null}
            {MEDITATION_TARGET_MINUTES.map((mins) => (
              <button
                key={mins}
                type="button"
                role="option"
                aria-selected={
                  displayLabel ? displayLabel === `${mins} min` : mins === value
                }
                className={`block w-full px-3.5 py-2 text-left text-sm hover:bg-background sm:py-2.5 ${
                  (displayLabel
                    ? displayLabel === `${mins} min`
                    : mins === value)
                    ? "font-semibold text-foreground"
                    : "text-muted"
                }`}
                onClick={() => {
                  onChange(mins);
                  setOpen(false);
                }}
              >
                {mins} min
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type SessionLengthPillProps = {
  value: MeditationTargetMinutes;
  defaultMinutes: MeditationTargetMinutes;
  onChange: (mins: MeditationTargetMinutes) => void;
  onReset: () => void;
};

/** Compact per-session length control for the program checklist. */
export function SessionLengthPill({
  value,
  defaultMinutes,
  onChange,
  onReset,
}: SessionLengthPillProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const isCustom = value !== defaultMinutes;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t || rootRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setOpenUp(window.innerHeight - r.bottom < 260);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Session length ${value} min`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex h-6 cursor-pointer items-center gap-0.5 whitespace-nowrap rounded-full px-2 text-[12px] ${
          open
            ? "border border-accent bg-card font-semibold text-foreground ring-[3px] ring-accent/25"
            : isCustom
              ? "border border-accent bg-accent-soft font-semibold text-foreground"
              : "border border-border bg-transparent text-muted"
        }`}
      >
        {value} min
        <svg
          viewBox="0 0 24 24"
          className="h-[9px] w-[9px] shrink-0 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div
          role="listbox"
          className={`absolute right-0 z-[90] w-[230px] rounded-xl border border-border bg-card p-1.5 shadow-[0_8px_24px_rgb(0_0_0_/_0.12)] ${
            openUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          <div className="flex flex-col gap-0.5">
            {MEDITATION_TARGET_MINUTES.map((mins) => {
              const selected = mins === value;
              return (
                <button
                  key={mins}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] text-foreground ${
                    selected
                      ? "bg-accent-soft font-semibold"
                      : "hover:bg-background"
                  }`}
                  onClick={() => {
                    onChange(mins);
                    setOpen(false);
                  }}
                >
                  {mins} min
                  {selected ? (
                    <span className="text-accent-link" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {isCustom ? (
            <>
              <div className="my-1.5 h-px bg-border" />
              <button
                type="button"
                className="flex h-8 w-full cursor-pointer items-center whitespace-nowrap rounded-lg px-2.5 text-left text-[13px] font-semibold text-accent-link hover:bg-background"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
              >
                Reset to program ({defaultMinutes} min)
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
