"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  eyebrow: string;
  summary: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Full-bleed band sections — no top hairline; rhythm comes from band colour. */
  variant?: "default" | "band";
  /**
   * Keep section chrome; force open and mark busy.
   * Prefer the same section component so layout stays aligned when chrome changes.
   */
  loading?: boolean;
};

/**
 * Manifesto section chrome: header-row toggle, inline collapsed preview,
 * height-only content animation.
 */
export function IdeateCollapsibleSection({
  eyebrow,
  summary,
  collapsed,
  onToggle,
  children,
  variant = "default",
  loading = false,
}: Props) {
  const band = variant === "band";
  const isCollapsed = loading ? false : collapsed;

  return (
    <section
      className={`group ${loading ? "" : "cursor-pointer"} ${
        band ? "pt-6" : "border-t border-border pt-8"
      }`}
      aria-busy={loading || undefined}
    >
      <button
        type="button"
        onClick={loading ? undefined : onToggle}
        disabled={loading}
        aria-expanded={!isCollapsed}
        className={`flex w-full items-center justify-between gap-4 text-left ${
          loading ? "cursor-default" : "cursor-pointer"
        } ${isCollapsed ? (band ? "pb-6" : "pb-8") : "pb-2"}`}
      >
        <div className="flex min-w-0 items-center gap-4">
          <p className="shrink-0 font-sans text-[15px] font-medium uppercase tracking-[0.08em] text-muted">
            {eyebrow}
          </p>
          {isCollapsed ? (
            loading ? (
              <Skeleton className="h-3.5 w-40 max-w-[320px]" />
            ) : (
              <span className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[14px] font-normal italic text-muted/50">
                {summary}
              </span>
            )
          ) : null}
        </div>
        <IconChevronDown
          size={18}
          stroke={2}
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-200 ease-[ease] ${
            isCollapsed ? "" : "rotate-180"
          } ${loading ? "opacity-40" : ""}`}
        />
      </button>

      {/* Hairline only when collapsed — default stack only (bands use colour). */}
      {isCollapsed && !band ? (
        <div
          aria-hidden
          className="-mb-px border-b border-border transition-[border-color] duration-200 ease-[ease] group-hover:border-[#F0A865]"
        />
      ) : null}

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-[ease]"
        style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr" }}
      >
        <div
          className={`min-h-0 ${isCollapsed ? "overflow-hidden" : "overflow-visible"}`}
        >
          <div className={isCollapsed ? "" : band ? "pb-7 pt-4" : "pb-8 pt-4"}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
