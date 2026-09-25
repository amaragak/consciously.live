"use client";

import Link from "next/link";
import { useState } from "react";
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
import { smoothScrollToId } from "@/components/home-v2/use-home-v2-scroll";

type Props = {
  stuck: boolean;
  activeTool: HomeV2ToolId | null;
};

export function StickyToolHeader({ stuck, activeTool }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tool = HOME_V2_TOOLS.find((t) => t.id === activeTool);
  const ctaLabel = tool?.stickyCta ?? "Start free";
  const ctaHref = tool
    ? `/login?mode=signup&next=${encodeURIComponent(tool.href)}`
    : HOME_V2_START_FREE_HREF;
  const verbLabel = tool?.label ?? null;

  if (!stuck) return null;

  return (
    <header
      className="home-v2-sticky-enter fixed inset-x-0 top-0 z-40 border-b border-[var(--hv2-hero-hairline)] bg-[var(--hv2-sticky-bg)] px-5 text-[var(--hv2-hero-fg)] md:px-6"
    >
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
          {HOME_V2_TOOLS.filter((t) => t.id !== activeTool).map((t) => (
            <a
              key={t.id}
              href={`#tool-${t.id}`}
              onClick={(e) => {
                e.preventDefault();
                smoothScrollToId(`tool-${t.id}`);
              }}
              className="rounded-full px-3 py-2 hover:text-[var(--hv2-gold)]"
            >
              {t.label}
            </a>
          ))}
          <span
            className="mx-3 h-5 w-px bg-[var(--hv2-hero-divider)]"
            aria-hidden
          />
          <Link
            href={HOME_V2_LISTEN_HREF}
            className="px-2.5 py-2 hover:text-[var(--hv2-gold)]"
          >
            Listen
          </Link>
          <Link
            href={HOME_V2_READ_HREF}
            className="px-2.5 py-2 hover:text-[var(--hv2-gold)]"
          >
            Read
          </Link>
          <Link
            href={HOME_V2_CONNECT_HREF}
            className="px-2.5 py-2 hover:text-[var(--hv2-gold)]"
          >
            Connect
          </Link>
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
              <a
                key={t.id}
                href={`#tool-${t.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setMenuOpen(false);
                  smoothScrollToId(`tool-${t.id}`);
                }}
                className="rounded-lg px-3 py-3"
              >
                {t.label}
              </a>
            ))}
            <div className="my-2 border-t border-[var(--hv2-hero-hairline)]" />
            <Link href={HOME_V2_LISTEN_HREF} className="px-3 py-3" onClick={() => setMenuOpen(false)}>Listen</Link>
            <Link href={HOME_V2_READ_HREF} className="px-3 py-3" onClick={() => setMenuOpen(false)}>Read</Link>
            <Link href={HOME_V2_CONNECT_HREF} className="px-3 py-3" onClick={() => setMenuOpen(false)}>Connect</Link>
            <Link href="/login" className="px-3 py-3" onClick={() => setMenuOpen(false)}>Sign in</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
