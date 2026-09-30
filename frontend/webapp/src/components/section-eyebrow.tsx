import type { HTMLAttributes, ReactNode } from "react";

export type SectionEyebrowTone = "accent" | "muted";

const TONE_CLASS: Record<SectionEyebrowTone, string> = {
  accent: "text-accent-link",
  muted: "text-muted",
};

type Props = {
  children: ReactNode;
  /** Gold accent for primary section labels; muted for secondary (e.g. low days). */
  tone?: SectionEyebrowTone;
  as?: "p" | "span" | "h2" | "h3";
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">;

const BASE = "text-[12px] font-bold uppercase tracking-[0.09em]";

/**
 * Mini section header — uppercase, bold, accent-link gold.
 * Used for Insights labels (“On your 2 good days”), dashboard section titles, etc.
 */
export function SectionEyebrow({
  children,
  tone = "accent",
  as: Tag = "p",
  className = "",
  ...rest
}: Props) {
  return (
    <Tag
      className={`${BASE} ${TONE_CLASS[tone]}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
