import type { ReactNode } from "react";

export type SegmentedPillTabOption<T extends string = string> = {
  id: T;
  label: ReactNode;
};

type SegmentedPillTabsProps<T extends string> = {
  options: readonly SegmentedPillTabOption<T>[];
  value: T;
  onChange: (id: T) => void;
  "aria-label": string;
  className?: string;
  /** Override active-tab chrome (default: selected fill). */
  selectedClassName?: string;
  /** Override idle-tab text/chrome. */
  idleClassName?: string;
  /** Stretch each tab equally across the control (e.g. mobile library). */
  equalWidth?: boolean;
  disabled?: boolean;
};

/**
 * Shared pill tab control — same chrome as Create › Audio
 * (Soundscapes / Build your own). Active tab uses the primary fill.
 */
export function SegmentedPillTabs<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className = "",
  selectedClassName = "bg-selected text-on-selected",
  idleClassName = "text-muted hover:text-foreground",
  equalWidth = false,
  disabled = false,
}: SegmentedPillTabsProps<T>) {
  const overridesTrackBorder = /\bborder-/.test(className);
  const overridesTrackBg = /\bbg-/.test(className);
  const overridesRadius = /\brounded-/.test(className);
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full flex-nowrap overflow-hidden p-1 ${
        overridesRadius ? "" : "rounded-full"
      } ${overridesTrackBorder ? "" : "border"} ${
        overridesTrackBorder ? "" : "border-border"
      } ${overridesTrackBg ? "" : "bg-background"} ${
        equalWidth ? "w-full" : "shrink-0"
      } ${className}`}
    >
      {options.map((opt) => {
        const selected = opt.id === value;
        const activeClass = selected ? selectedClassName : idleClassName;
        const tabPad = /\bpy-/.test(activeClass) ? "" : "py-1.5";
        const tabPx = /\bpx-/.test(activeClass)
          ? ""
          : equalWidth
            ? "px-1.5"
            : "px-3.5";
        const tabRadius = /\brounded-/.test(activeClass) ? "" : "rounded-full";
        const tabText = /\btext-/.test(activeClass) ? "" : "text-sm";
        const tabWeight = /\bfont-/.test(activeClass) ? "" : "font-semibold";
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => {
              if (disabled || opt.id === value) return;
              onChange(opt.id);
            }}
            className={`cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${tabWeight} ${tabText} ${tabRadius} ${tabPad} ${tabPx} ${
              equalWidth
                ? "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                : "shrink-0"
            } ${activeClass}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
