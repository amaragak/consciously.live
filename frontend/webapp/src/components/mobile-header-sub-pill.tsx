"use client";

/**
 * Mobile header sub-pill (consciously-mobile-header-subtabs-v2).
 * Second floating pill under the capsule — stepper (create) or tab-select.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  useMobileHeaderSubPillTarget,
  useSetMobileHeaderSubPillActive,
} from "@/components/app-primary-tabs";

export type MobileHeaderSubPillTabOption<T extends string = string> = {
  id: T;
  label: string;
  count?: string | number | null;
  disabled?: boolean;
};

/** Shell that matches the floating header capsule. */
export function MobileHeaderSubPillShell({
  children,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role={ariaLabel ? "navigation" : undefined}
      aria-label={ariaLabel}
      className={`app-header-subpill flex w-full items-center rounded-full border border-border bg-card px-1 py-1 shadow-[0_8px_24px_rgb(15_27_45_/_0.1)] ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Portals children into the fixed slot under the header capsule (md:hidden).
 * Registers active state so `--app-header-h` grows for content padding.
 */
export function MobileHeaderSubPillPortal({
  children,
}: {
  children: ReactNode;
}) {
  const target = useMobileHeaderSubPillTarget();
  const setActive = useSetMobileHeaderSubPillActive();

  useEffect(() => {
    if (!target) return;
    setActive(true);
    return () => setActive(false);
  }, [target, setActive]);

  if (!target) return null;
  return createPortal(children, target);
}

/** Tab-select mode: navy filled segment, equal width. */
export function MobileHeaderSubPillTabs<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  activeRef,
  className = "",
}: {
  options: readonly MobileHeaderSubPillTabOption<T>[];
  value: T;
  onChange: (id: T) => void;
  "aria-label": string;
  activeRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
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
    <MobileHeaderSubPillShell aria-label={ariaLabel} className={className}>
      <div
        ref={trackRef}
        role="tablist"
        aria-label={ariaLabel}
        className="relative flex w-full gap-0.5"
      >
        {box ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 rounded-full bg-[var(--deep,#0f1b2d)] shadow-[0_4px_12px_-4px_rgba(30,35,46,0.45)]"
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
              className={`relative z-[1] inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? "text-[#F4F0E8]" : "text-foreground"
              }`}
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
    </MobileHeaderSubPillShell>
  );
}
