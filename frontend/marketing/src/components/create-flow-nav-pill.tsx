"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared create-flow footer control chrome (border, surface, type, hover). */
export const CREATE_FLOW_FOOTER_CONTROL_BASE =
  "flex shrink-0 cursor-pointer items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent-soft/40 disabled:pointer-events-none disabled:opacity-40 sm:gap-2 sm:px-4 sm:py-2.5 dark:border-border dark:bg-surface dark:text-foreground dark:hover:bg-accent-soft/30";

/** Nav back/next pills — fully rounded. */
export const CREATE_FLOW_NAV_PILL_CLASS = `${CREATE_FLOW_FOOTER_CONTROL_BASE} rounded-full`;

/** Non-nav footer controls (e.g. Length) — soft rectangle, same chrome. */
export const CREATE_FLOW_FOOTER_CONTROL_CLASS = `${CREATE_FLOW_FOOTER_CONTROL_BASE} rounded-lg`;

type Variant = "nav" | "control";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** `nav` = rounded-full pill; `control` = rounded-lg (Length, etc.). */
  variant?: Variant;
};

export function CreateFlowNavPill({
  children,
  className,
  type = "button",
  variant = "nav",
  ...props
}: Props) {
  const base =
    variant === "control"
      ? CREATE_FLOW_FOOTER_CONTROL_CLASS
      : CREATE_FLOW_NAV_PILL_CLASS;
  return (
    <button
      type={type}
      className={className ? `${base} ${className}` : base}
      {...props}
    >
      {children}
    </button>
  );
}
