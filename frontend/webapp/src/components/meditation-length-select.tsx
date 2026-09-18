
import { useEffect, useRef, useState } from "react";
import { CreateFlowNavPill } from "@/components/create-flow-nav-pill";
import { MEDITATION_TARGET_MINUTES } from "@/lib/medimade-api";

type Props = {
  value: number;
  onChange: (mins: number) => void;
  disabled?: boolean;
};

/**
 * Styled length picker for the create-flow bottom bar.
 * Menu opens upward so it clears the bar. Options: 2 / 5 / 10 / 20.
 */
export function MeditationLengthSelect({ value, onChange, disabled }: Props) {
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
          <span>{value} min</span>
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
            {MEDITATION_TARGET_MINUTES.map((mins) => (
              <button
                key={mins}
                type="button"
                role="option"
                aria-selected={mins === value}
                className={`block w-full px-3.5 py-2 text-left text-sm hover:bg-background sm:py-2.5 ${
                  mins === value
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
