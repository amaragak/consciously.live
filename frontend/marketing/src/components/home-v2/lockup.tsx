import Link from "next/link";
import type { HomeV2ToolId } from "@/components/home-v2/constants";
import { LogoMark } from "@/components/logo-mark";

type Props = {
  tool?: HomeV2ToolId | string | null;
  /** Accessible name stays "Consciously home" when used as a link label. */
  className?: string;
  size?: "nav" | "eyebrow" | "card" | "sticky";
  /** Light-on-navy panels (tool vignettes). */
  onNavy?: boolean;
  /** Hero / sticky chrome — follows light/dark/v2 hero tokens. */
  onHero?: boolean;
  /** Brand sun before the wordmark (header lockups). */
  withMark?: boolean;
  /**
   * When set, only the sun + “consciously” navigate home.
   * The tool verb stays plain text beside the link.
   */
  homeHref?: string;
  onHomeClick?: () => void;
};

const sizeClass: Record<NonNullable<Props["size"]>, string> = {
  nav: "text-2xl font-medium tracking-tight md:text-[28px] md:tracking-[-0.5px]",
  sticky: "text-[26px] font-medium tracking-[-0.4px]",
  eyebrow: "text-[22px]",
  card: "text-[15px]",
};

/** Slightly larger than the marketing site header sun (34). */
const markSize: Partial<Record<NonNullable<Props["size"]>, number>> = {
  nav: 40,
  sticky: 38,
};

/**
 * Brand lockup: "consciously" + optional italic tool verb.
 */
export function Lockup({
  tool,
  className = "",
  size = "eyebrow",
  onNavy = false,
  onHero = false,
  withMark = false,
  homeHref,
  onHomeClick,
}: Props) {
  const brand = onHero
    ? "text-[var(--hv2-hero-fg)]"
    : onNavy
      ? "text-[var(--hv2-ivory)]"
      : "text-[var(--hv2-muted)]";
  const verb =
    onHero || onNavy ? "text-[var(--hv2-gold)]" : "text-[var(--hv2-tan-text)]";
  const label =
    typeof tool === "string" && tool
      ? tool.charAt(0).toUpperCase() + tool.slice(1)
      : null;
  const sun = withMark ? markSize[size] : undefined;
  const brandGap = sun ? "gap-3" : "gap-2";

  const brandBlock = (
    <>
      {sun ? (
        <LogoMark
          size={sun}
          className="relative top-px mr-0.5 shrink-0 text-[var(--hv2-gold)]"
        />
      ) : null}
      <span className={brand}>consciously</span>
    </>
  );

  return (
    <span
      className={`home-v2-display inline-flex items-center gap-2 ${sizeClass[size]} ${className}`}
    >
      {homeHref ? (
        <Link
          href={homeHref}
          aria-label="Consciously home"
          onClick={onHomeClick}
          className={`inline-flex items-center ${brandGap}`}
        >
          {brandBlock}
        </Link>
      ) : (
        <span className={`inline-flex items-center ${brandGap}`}>
          {brandBlock}
        </span>
      )}
      {label ? (
        <em className={`select-text font-normal italic ${verb}`}>{label}</em>
      ) : null}
    </span>
  );
}
