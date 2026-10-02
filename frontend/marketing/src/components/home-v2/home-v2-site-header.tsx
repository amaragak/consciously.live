"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import {
  HOME_V2_CONNECT_HREF,
  HOME_V2_LISTEN_HREF,
  HOME_V2_READ_HREF,
  type HomeV2ToolId,
} from "@/components/home-v2/constants";
import { HomeV2AuthActions } from "@/components/home-v2/hero-prompt";
import { HomeV2MobileMenu } from "@/components/home-v2/home-v2-mobile-menu";
import { Lockup } from "@/components/home-v2/lockup";

type SecondaryId = "listen" | "read" | "connect";

const SECONDARY: readonly { id: SecondaryId; label: string; href: string }[] = [
  { id: "listen", label: "Listen", href: HOME_V2_LISTEN_HREF },
  { id: "read", label: "Read", href: HOME_V2_READ_HREF },
  { id: "connect", label: "Connect", href: HOME_V2_CONNECT_HREF },
];

export type HomeV2SiteHeaderNavItem = {
  id: string;
  label: string;
  href: string;
  /** When set, used instead of a plain Link (e.g. homepage in-page tool anchors). */
  onClick?: () => void;
};

type Props = {
  verbLabel: string | null;
  /** Tools shown in the centre nav (full list, fixed order). */
  toolLinks: readonly HomeV2SiteHeaderNavItem[];
  /** Listen / Read / Connect (full list, fixed order). */
  secondaryLinks?: readonly HomeV2SiteHeaderNavItem[];
  /** Mobile drawer: full tool list. */
  mobileToolLinks: readonly HomeV2SiteHeaderNavItem[];
  /** Mobile drawer: full secondary list. */
  mobileSecondaryLinks?: readonly HomeV2SiteHeaderNavItem[];
  activeTool?: HomeV2ToolId | null;
  activeSecondary?: SecondaryId | null;
  ctaHref: string;
  ctaLabel: string;
  /** Optional leading icon for tool CTAs (sidebar glyph). */
  ctaIcon?: ReactNode;
  /** `fixed` = overlay chrome; `sticky` = site-wide marketing; `static` = in-flow. */
  position?: "fixed" | "sticky" | "static";
  /**
   * `solid` = always filled sticky.
   * `overlay` = hero paisley plate; `scrolled` only compacts chrome (no solid fill swap).
   * `transparent` = always clear (legacy; prefer overlay).
   */
  tone?: "solid" | "transparent" | "overlay";
  /** With `tone="overlay"`: compact chrome when true; paisley stays. */
  scrolled?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * Shared sticky chrome for homepage scroll header + all marketing pages.
 * Hybrid keeps the same peach primary as the hero nav on tonal-navy sticky.
 */
export function HomeV2SiteHeader({
  verbLabel,
  toolLinks,
  secondaryLinks = SECONDARY,
  mobileToolLinks,
  mobileSecondaryLinks = SECONDARY,
  activeTool = null,
  activeSecondary = null,
  ctaHref,
  ctaLabel,
  ctaIcon,
  position = "sticky",
  tone = "solid",
  scrolled = false,
  className = "",
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerId = useId();
  const menuPanelId = useId();
  const isFixed = position === "fixed";
  const isOverlay = tone === "overlay";
  const isTransparent = tone === "transparent";
  const isFilled = tone === "solid" || (isOverlay && scrolled);
  const compactChrome = isOverlay && scrolled;

  const closeMenu = () => setMenuOpen(false);

  const positionClass = isFixed
    ? "inset-x-0 top-0"
    : position === "sticky"
      ? "sticky top-0"
      : "relative";
  const toolLinkClass = (active: boolean) =>
    `hover:text-[var(--hv2-gold)]${active ? " text-[var(--hv2-gold)]" : ""}`;
  const secondaryLinkClass = (active: boolean) =>
    `hover:text-[var(--hv2-gold)]${active ? " text-[var(--hv2-gold)]" : ""}`;

  return (
    <header
      className={`home-v2 home-v2-site-header z-40 pl-5 pr-3 text-[var(--hv2-hero-fg)] md:px-6 ${
        isOverlay
          ? `home-v2-site-header--overlay${scrolled ? " is-scrolled" : ""}`
          : isTransparent
            ? "home-v2-site-header--transparent bg-transparent"
            : "home-v2-site-header--solid border-b border-[var(--hv2-hero-hairline)] bg-[var(--hv2-sticky-bg)]"
      } ${
        isOverlay || (isFilled && !menuOpen)
          ? "overflow-hidden"
          : "overflow-visible"
      } ${positionClass} ${className}`.trim()}
      style={isFixed ? { position: "fixed" } : undefined}
    >
      {/* Paisley plate — hero or field tokens (via CSS) so fade matches the page. */}
      {isOverlay ? (
        <div
          aria-hidden
          className="home-v2-site-header-hero-plate pointer-events-none absolute inset-0 z-0"
        />
      ) : null}
      {/* Soft sun radial over hero/field — owned by the shared header (not a page sibling). */}
      {isOverlay || isTransparent ? (
        <div
          aria-hidden
          className="home-v2-site-header-soft-sun pointer-events-none absolute inset-x-0 top-0 z-0"
        >
          <div className="relative mx-auto h-full max-w-[1200px]">
            <span className="home-v2-hero-chrome-glow-sun absolute left-[20px] top-[28px] size-[56px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl md:top-[36px] md:size-[64px]" />
          </div>
        </div>
      ) : null}
      {tone === "solid" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 px-5 md:px-6"
        >
          <div className="relative mx-auto h-full w-full max-w-[1200px]">
            <span className="home-v2-site-header-sun-glow absolute left-[20px] top-1/2 size-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
          </div>
        </div>
      ) : null}
      <div
        className={`home-v2-site-header-bar relative z-[1] mx-auto flex w-full max-w-[1200px] items-center gap-4${
          isOverlay ? "" : " h-14 md:h-[72px]"
        }${isTransparent ? " border-b border-[var(--hv2-hero-hairline)]" : ""}`}
      >
        <div className="relative shrink-0">
          <Lockup
            tool={verbLabel}
            size="nav"
            onHero
            withMark
            compact={compactChrome}
            homeHref="/"
            onHomeClick={() => setMenuOpen(false)}
          />
        </div>

        <nav
          aria-label="Main"
          className="hidden min-w-0 flex-1 items-center justify-center gap-7 whitespace-nowrap text-[15px] text-[var(--hv2-hero-nav)] lg:flex"
        >
          {toolLinks.map((t) => {
            const active = activeTool === t.id;
            const className = toolLinkClass(active);
            return t.onClick ? (
              <a
                key={t.id}
                href={t.href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  t.onClick?.();
                }}
                className={className}
              >
                {t.label}
              </a>
            ) : (
              <Link
                key={t.id}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                {t.label}
              </Link>
            );
          })}
          <span
            className="h-5 w-px bg-[var(--hv2-hero-divider)]"
            aria-hidden
          />
          {secondaryLinks.map((s) => {
            const active = activeSecondary === s.id;
            const className = secondaryLinkClass(active);
            return s.onClick ? (
              <a
                key={s.id}
                href={s.href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  s.onClick?.();
                }}
                className={className}
              >
                {s.label}
              </a>
            ) : (
              <Link
                key={s.id}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden shrink-0 md:block lg:ml-0">
          <HomeV2AuthActions
            compact={compactChrome}
            ctaHref={ctaHref}
            ctaLabel={ctaLabel}
            ctaIcon={ctaIcon}
          />
        </div>

        <div className="ml-auto flex items-center gap-2 md:hidden">
          <button
            id={menuTriggerId}
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls={menuPanelId}
            onClick={() => setMenuOpen((o) => !o)}
            className={`home-v2-site-header-menu-btn inline-flex h-11 w-11 items-center justify-center text-[var(--hv2-hero-fg)]${
              menuOpen ? " is-open" : ""
            }`}
          >
            <span className="home-v2-site-header-menu-icon" aria-hidden>
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <HomeV2MobileMenu
        open={menuOpen}
        onClose={closeMenu}
        toolLinks={mobileToolLinks}
        secondaryLinks={mobileSecondaryLinks}
        activeTool={activeTool}
        activeSecondary={activeSecondary}
        triggerId={menuTriggerId}
        panelId={menuPanelId}
      />
    </header>
  );
}

export { SECONDARY as HOME_V2_SITE_HEADER_SECONDARY };
export type { SecondaryId as HomeV2SiteHeaderSecondaryId };
