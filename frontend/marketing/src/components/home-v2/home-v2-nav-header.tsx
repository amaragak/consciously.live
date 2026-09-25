"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import "@/components/home-v2/home-v2.css";
import {
  HOME_V2_CONNECT_HREF,
  HOME_V2_LISTEN_HREF,
  HOME_V2_READ_HREF,
  HOME_V2_START_FREE_HREF,
  HOME_V2_TOOLS,
  type HomeV2ToolId,
} from "@/components/home-v2/constants";
import { HomeV2AuthActions } from "@/components/home-v2/hero-prompt";
import { Lockup } from "@/components/home-v2/lockup";

type SecondaryId = "listen" | "read" | "connect";

const SECONDARY: readonly { id: SecondaryId; label: string; href: string }[] = [
  { id: "listen", label: "Listen", href: HOME_V2_LISTEN_HREF },
  { id: "read", label: "Read", href: HOME_V2_READ_HREF },
  { id: "connect", label: "Connect", href: HOME_V2_CONNECT_HREF },
];

function sectionActive(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function resolveNav(pathname: string): {
  verbLabel: string | null;
  activeTool: HomeV2ToolId | null;
  activeSecondary: SecondaryId | null;
  ctaHref: string;
  ctaLabel: string;
} {
  const tool = HOME_V2_TOOLS.find((t) => sectionActive(pathname, t.href));
  if (tool) {
    return {
      verbLabel: tool.label,
      activeTool: tool.id,
      activeSecondary: null,
      ctaHref: `/login?mode=signup&next=${encodeURIComponent(tool.href)}`,
      ctaLabel: tool.stickyCta,
    };
  }
  if (sectionActive(pathname, HOME_V2_LISTEN_HREF)) {
    return {
      verbLabel: "Listen",
      activeTool: null,
      activeSecondary: "listen",
      ctaHref: HOME_V2_START_FREE_HREF,
      ctaLabel: "Start free",
    };
  }
  if (sectionActive(pathname, HOME_V2_READ_HREF) || sectionActive(pathname, "/blog")) {
    return {
      verbLabel: "Read",
      activeTool: null,
      activeSecondary: "read",
      ctaHref: HOME_V2_START_FREE_HREF,
      ctaLabel: "Start free",
    };
  }
  if (sectionActive(pathname, HOME_V2_CONNECT_HREF)) {
    return {
      verbLabel: "Connect",
      activeTool: null,
      activeSecondary: "connect",
      ctaHref: HOME_V2_START_FREE_HREF,
      ctaLabel: "Start free",
    };
  }
  return {
    verbLabel: null,
    activeTool: null,
    activeSecondary: null,
    ctaHref: HOME_V2_START_FREE_HREF,
    ctaLabel: "Start free",
  };
}

/**
 * Site-wide marketing header matching homepage-v2 chrome.
 * Used on every Next marketing page except `/` (hero owns that) and `/legacy/*`.
 */
export function HomeV2NavHeader() {
  const pathname = usePathname() || "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const { verbLabel, activeTool, activeSecondary, ctaHref, ctaLabel } =
    resolveNav(pathname);

  const toolLinks = HOME_V2_TOOLS.filter((t) => t.id !== activeTool);
  const secondaryLinks = SECONDARY.filter((s) => s.id !== activeSecondary);

  return (
    <header className="home-v2 sticky top-0 z-40 border-b border-[var(--hv2-hero-hairline)] bg-[var(--hv2-sticky-bg)] px-5 text-[var(--hv2-hero-fg)] md:px-6">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-4 md:h-[64px]">
        <div className="shrink-0">
          <Lockup
            tool={verbLabel}
            size="sticky"
            onHero
            withMark
            homeHref="/"
            onHomeClick={() => setMenuOpen(false)}
          />
        </div>

        <nav
          aria-label="Main"
          className="hidden min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap text-[15px] text-[var(--hv2-hero-nav)] lg:flex"
        >
          {toolLinks.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="rounded-full px-3 py-2 hover:text-[var(--hv2-gold)]"
            >
              {t.label}
            </Link>
          ))}
          <span
            className="mx-3 h-5 w-px bg-[var(--hv2-hero-divider)]"
            aria-hidden
          />
          {secondaryLinks.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className="px-2.5 py-2 hover:text-[var(--hv2-gold)]"
            >
              {s.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden shrink-0 md:block lg:ml-0">
          <HomeV2AuthActions compact ctaHref={ctaHref} ctaLabel={ctaLabel} />
        </div>

        <div className="ml-auto flex items-center gap-2 md:hidden">
          <Link
            href={ctaHref}
            className="rounded-full bg-[var(--hv2-gold)] px-4 py-2.5 text-sm font-semibold text-[var(--hv2-on-gold)]"
          >
            Start free
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--hv2-hero-fg)]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              {menuOpen ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 8h16" />
                  <path d="M4 16h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-[var(--hv2-hero-hairline)] bg-[var(--hv2-hero-menu-bg)] py-4 md:hidden">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-1 text-[var(--hv2-hero-nav)]">
            {HOME_V2_TOOLS.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-lg px-3 py-3 ${
                  activeTool === t.id ? "text-[var(--hv2-gold)]" : ""
                }`}
              >
                {t.label}
              </Link>
            ))}
            <div className="my-2 border-t border-[var(--hv2-hero-hairline)]" />
            {SECONDARY.map((s) => (
              <Link
                key={s.id}
                href={s.href}
                className={`px-3 py-3 ${
                  activeSecondary === s.id ? "text-[var(--hv2-gold)]" : ""
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {s.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="px-3 py-3"
              onClick={() => setMenuOpen(false)}
            >
              Sign in
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
