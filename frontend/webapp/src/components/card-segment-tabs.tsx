"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export type CardSegmentTabOption<T extends string = string> = {
  id: T;
  label: string;
  /** Inline count / note after the label (lighter weight), e.g. `10`. */
  count?: string | number | null;
  disabled?: boolean;
};

type Props<T extends string> = {
  options: readonly CardSegmentTabOption<T>[];
  value: T;
  onChange: (id: T) => void;
  "aria-label": string;
  /** Stretch segments equally across the content width (Journal). */
  equalWidth?: boolean;
  /** Optional ref on the active tab button (life-area scroll-into-view). */
  activeRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
};

/**
 * Card-surface segmented control — life area + Journal mobile tabs.
 * Single-row text labels (no icons); selected segment is navy with a light label.
 */
export function CardSegmentTabs<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  equalWidth = false,
  activeRef,
  className = "",
}: Props<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [reduce, setReduce] = useState(false);

  const measure = () => {
    const track = trackRef.current;
    const button = track?.querySelector<HTMLElement>("[data-active='true']");
    if (track && button) {
      setBox({
        x: button.offsetLeft,
        y: button.offsetTop,
        w: button.offsetWidth,
        h: button.offsetHeight,
      });
    }
  };

  useLayoutEffect(() => {
    measure();
  }, [value, options]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(motion.matches);
    apply();
    motion.addEventListener("change", apply);
    window.addEventListener("resize", measure);
    return () => {
      motion.removeEventListener("change", apply);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex gap-0.5 rounded-full border border-border bg-card p-1 shadow-[0_2px_8px_rgba(15,27,45,0.04)] ${
        equalWidth ? "w-full" : "inline-flex"
      } ${className}`}
    >
      {box ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 rounded-full bg-[#1E232E] shadow-[0_4px_12px_-4px_rgba(30,35,46,0.45)]"
          style={{
            width: box.w,
            height: box.h,
            transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
            transition: reduce
              ? "none"
              : "transform 250ms cubic-bezier(.22,1,.36,1), width 250ms cubic-bezier(.22,1,.36,1)",
          }}
        />
      ) : null}
      {options.map((opt) => {
        const active = opt.id === value;
        const count =
          opt.count === null || opt.count === undefined || opt.count === ""
            ? null
            : String(opt.count);
        const aria = count ? `${opt.label} ${count}` : opt.label;
        return (
          <button
            key={opt.id}
            ref={active ? activeRef : undefined}
            type="button"
            role="tab"
            data-active={active ? "true" : "false"}
            aria-selected={active}
            aria-label={aria}
            disabled={opt.disabled}
            onClick={() => {
              if (opt.disabled || opt.id === value) return;
              onChange(opt.id);
            }}
            className={`relative z-[1] inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 md:h-[38px] md:px-[11px] ${
              equalWidth ? "min-w-0 flex-1" : "shrink-0"
            } ${active ? "text-[#F4F0E8]" : "text-foreground"}`}
          >
            <span className="truncate">{opt.label}</span>
            {count ? (
              <span
                className={`font-normal tabular-nums ${
                  active ? "text-[#F4F0E8]/70" : "text-muted"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Convenience when a parent needs a non-generic ReactNode wrapper. */
export function cardSegmentLabel(
  label: string,
  count?: string | number | null,
): ReactNode {
  if (count == null || count === "") return label;
  return (
    <>
      {label}{" "}
      <span className="font-normal text-muted tabular-nums">{count}</span>
    </>
  );
}
