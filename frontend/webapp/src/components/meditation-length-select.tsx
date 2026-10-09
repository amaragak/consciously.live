import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { SelectChevron } from "@/components/select-chevron";
import {
  MEDITATION_TARGET_MINUTES,
  type MeditationTargetMinutes,
} from "@/lib/medimade-api";

type Props = {
  value: number;
  onChange: (mins: number) => void;
  disabled?: boolean;
  /** Label on the control when not a plain minutes value (e.g. Program · ≈45 min). */
  displayLabel?: string;
  extraOption?: { label: string; onSelect: () => void };
  /**
   * When set, replaces the minutes listbox with a custom panel
   * (e.g. program session control). Width defaults to 320.
   */
  panel?: {
    width?: number;
    content: ReactNode;
  };
  /** 32px default; 26px for Sound summary strip. */
  size?: "default" | "compact";
  className?: string;
};

function IconClock({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/**
 * Length chip for Create flow brief areas (Start / Shape / Sound).
 * Options: 2 / 5 / 10 / 20 (+ optional program reset).
 */
export function MeditationLengthSelect({
  value,
  onChange,
  disabled,
  displayLabel,
  extraOption,
  panel,
  size = "default",
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const label = displayLabel ?? `${value} min`;
  const optionCount =
    MEDITATION_TARGET_MINUTES.length + (extraOption ? 1 : 0);
  const panelWidth = panel?.width ?? 320;
  const menuWidth = panel ? panelWidth : 200;

  function closeMenu() {
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(menuWidth, window.innerWidth - 32);
      const gap = 8;
      let left = r.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setMenuPos({ top: r.bottom + gap, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, menuWidth]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      closeMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || panel) return;
    const selectedMinsIdx = MEDITATION_TARGET_MINUTES.indexOf(
      value as MeditationTargetMinutes,
    );
    if (extraOption && (displayLabel === "Program" || displayLabel?.startsWith("Program"))) {
      setActiveIndex(0);
    } else if (selectedMinsIdx >= 0) {
      setActiveIndex(extraOption ? selectedMinsIdx + 1 : selectedMinsIdx);
    } else {
      setActiveIndex(0);
    }
  }, [open, value, displayLabel, extraOption, panel]);

  function selectIndex(i: number) {
    if (extraOption && i === 0) {
      extraOption.onSelect();
      closeMenu();
      return;
    }
    const minsIdx = extraOption ? i - 1 : i;
    const mins = MEDITATION_TARGET_MINUTES[minsIdx];
    if (mins == null) return;
    onChange(mins);
    closeMenu();
  }

  const compact = size === "compact";

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          panel ? (
            <div
              ref={listRef}
              id={listId}
              role="dialog"
              aria-label="Program length"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: Math.min(menuWidth, window.innerWidth - 32),
              }}
              className="fixed z-[200] flex flex-col gap-1.5 rounded-[14px] border border-border bg-card p-2.5 shadow-[0_8px_24px_rgb(0_0_0_/_0.12)]"
            >
              {panel.content}
            </div>
          ) : (
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Meditation length"
              style={{ top: menuPos.top, left: menuPos.left }}
              className="fixed z-[200] flex w-[200px] flex-col gap-0.5 rounded-xl border border-border bg-card p-1.5 shadow-[0_8px_24px_rgb(0_0_0_/_0.12)]"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(optionCount - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(0, i - 1));
                } else if (e.key === "Home") {
                  e.preventDefault();
                  setActiveIndex(0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  setActiveIndex(optionCount - 1);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  selectIndex(activeIndex);
                }
              }}
            >
              {extraOption ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={
                    displayLabel === "Program" ||
                    Boolean(displayLabel?.startsWith("Program"))
                  }
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] ${
                    displayLabel === "Program" ||
                    displayLabel?.startsWith("Program")
                      ? "bg-accent-soft font-semibold text-foreground"
                      : activeIndex === 0
                        ? "bg-background text-foreground"
                        : "text-foreground hover:bg-background"
                  }`}
                  onMouseEnter={() => setActiveIndex(0)}
                  onClick={() => selectIndex(0)}
                >
                  {extraOption.label}
                  {displayLabel === "Program" ||
                  displayLabel?.startsWith("Program") ? (
                    <span className="text-accent-link" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              ) : null}
              {MEDITATION_TARGET_MINUTES.map((mins, i) => {
                const idx = extraOption ? i + 1 : i;
                const selected = displayLabel
                  ? displayLabel === `${mins} min`
                  : mins === value;
                return (
                  <button
                    key={mins}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] ${
                      selected
                        ? "bg-accent-soft font-semibold text-foreground"
                        : activeIndex === idx
                          ? "bg-background text-foreground"
                          : "text-foreground hover:bg-background"
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectIndex(idx)}
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
          ),
          document.body,
        )
      : null;

  const chipSize = compact
    ? "h-[26px] gap-1.5 px-2.5 text-[12px]"
    : "h-8 gap-1.5 px-2.5 text-[13px]";
  const chipBase = `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border ${chipSize}`;

  if (disabled) {
    return (
      <div
        className={`relative shrink-0 ${className ?? ""}`}
        title="Target spoken length"
      >
        <span
          className={`${chipBase} border-accent/20 bg-accent-soft/50 font-medium text-foreground/80`}
          aria-label={`Length: ${label}`}
        >
          <IconClock className="h-3.5 w-3.5 shrink-0 text-accent-link/80" />
          <span>{label}</span>
        </span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className ?? ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup={panel ? "dialog" : "listbox"}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label="Target meditation length"
        title="Target spoken length. If you change this after generating a script in chat, audio will regenerate the script to match."
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`cursor-pointer bg-card font-semibold text-foreground transition-colors ${chipBase} ${
          open
            ? "border-accent ring-[3px] ring-accent/25"
            : "border-accent/35"
        }`}
      >
        <IconClock className="h-3.5 w-3.5 shrink-0 text-accent-link" />
        <span>{label}</span>
        <SelectChevron open={open} className="!h-2.5 !w-2.5" />
      </button>
      {menu}
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

  useEffect(() => {
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
        <SelectChevron open={open} />
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
