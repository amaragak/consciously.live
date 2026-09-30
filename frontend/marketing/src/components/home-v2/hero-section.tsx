"use client";

import Link from "next/link";
import { useState } from "react";
import {
  HOME_V2_CONNECT_HREF,
  HOME_V2_LISTEN_HREF,
  HOME_V2_READ_HREF,
  HOME_V2_START_FREE_HREF,
  HOME_V2_TOOLS,
} from "@/components/home-v2/constants";
import { HeroPrompt, HomeV2AuthActions } from "@/components/home-v2/hero-prompt";
import { Lockup } from "@/components/home-v2/lockup";
import { TypesSection } from "@/components/home-v2/types-section";
import { smoothScrollToId } from "@/components/home-v2/use-home-v2-scroll";

export function HeroSection({ motionReady }: { motionReady: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const anim = (delayMs: number) =>
    motionReady
      ? {
          className: "home-v2-hero-anim is-ready",
          style: { animationDelay: `${delayMs}ms` } as const,
        }
      : { className: "home-v2-hero-anim", style: undefined };

  const h1 = anim(0);
  const sub = anim(150);
  const form = anim(300);

  return (
    <section
      id="tool-home"
      className="home-v2-hero flex flex-col px-5 pb-14 text-[var(--hv2-hero-fg)] md:px-6 md:pb-[140px]"
    >
      {/* Soft radial about the sun — lives on the hero (not chrome-clipped). */}
      <div
        aria-hidden
        className="home-v2-hero-sun-glow px-5 md:px-6"
      >
        <div className="relative mx-auto h-full max-w-[1200px]">
          <span className="home-v2-hero-chrome-glow-sun absolute left-[20px] top-[28px] size-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl md:top-[36px] md:size-[200px]" />
        </div>
      </div>
      <div className="home-v2-hero-chrome mx-auto w-full max-w-[1200px] border-b border-[var(--hv2-hero-hairline)]">
        <nav
          aria-label="Main"
          className="relative flex h-14 items-center gap-4 md:h-[72px]"
        >
          <div className="relative shrink-0">
            <Lockup size="nav" onHero withMark homeHref="/" />
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-7 text-[15px] text-[var(--hv2-hero-nav)] lg:flex">
            {HOME_V2_TOOLS.map((t) => (
              <a
                key={t.id}
                href={`#tool-${t.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  smoothScrollToId(`tool-${t.id}`);
                }}
                className="hover:text-[var(--hv2-gold)]"
              >
                {t.label}
              </a>
            ))}
            <span className="h-5 w-px bg-[var(--hv2-hero-divider)]" aria-hidden />
            <Link href={HOME_V2_LISTEN_HREF} className="hover:text-[var(--hv2-gold)]">
              Listen
            </Link>
            <Link href={HOME_V2_READ_HREF} className="hover:text-[var(--hv2-gold)]">
              Read
            </Link>
            <Link href={HOME_V2_CONNECT_HREF} className="hover:text-[var(--hv2-gold)]">
              Connect
            </Link>
          </div>

          <div className="ml-auto hidden shrink-0 md:block lg:ml-0">
            <HomeV2AuthActions
              ctaHref={HOME_V2_START_FREE_HREF}
              ctaLabel="Start free →"
            />
          </div>

          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="ml-auto inline-flex h-11 w-11 items-center justify-center md:hidden"
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

          {menuOpen ? (
            <div className="absolute inset-x-0 top-full z-30 border-b border-[var(--hv2-hero-hairline)] bg-[var(--hv2-hero-menu-bg)] py-3 md:hidden">
              {HOME_V2_TOOLS.map((t) => (
                <a
                  key={t.id}
                  href={`#tool-${t.id}`}
                  className="block px-1 py-3 text-[var(--hv2-hero-nav)]"
                  onClick={(e) => {
                    e.preventDefault();
                    setMenuOpen(false);
                    smoothScrollToId(`tool-${t.id}`);
                  }}
                >
                  {t.label}
                </a>
              ))}
              <div className="my-2 border-t border-[var(--hv2-hero-hairline)]" />
              <Link href={HOME_V2_LISTEN_HREF} className="block py-3" onClick={() => setMenuOpen(false)}>Listen</Link>
              <Link href={HOME_V2_READ_HREF} className="block py-3" onClick={() => setMenuOpen(false)}>Read</Link>
              <Link href={HOME_V2_CONNECT_HREF} className="block py-3" onClick={() => setMenuOpen(false)}>Connect</Link>
              <Link href="/login" className="block py-3" onClick={() => setMenuOpen(false)}>Sign in</Link>
              <Link
                href={HOME_V2_START_FREE_HREF}
                className="accent-fill-gradient mt-2 inline-flex rounded-full px-5 py-3 font-semibold"
                onClick={() => setMenuOpen(false)}
              >
                Start free →
              </Link>
            </div>
          ) : null}
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 pt-7 md:gap-6 md:pt-[72px]">
        <h1
          className={`home-v2-display m-0 text-[40px] font-[350] leading-none tracking-[-1px] md:text-[clamp(52px,6vw,88px)] md:tracking-[-2px] ${h1.className}`}
          style={h1.style}
        >
          Become who you{" "}
          <em className="italic text-[var(--hv2-gold)]">said</em>
          {" "}
          you&apos;d be.
        </h1>
        <div className={sub.className} style={sub.style}>
          <p className="m-0 max-w-none text-center text-[17px] leading-relaxed text-[var(--hv2-hero-muted)] md:text-[22px] md:leading-[1.5]">
            <em className="home-v2-display text-[19px] font-normal italic text-[var(--hv2-ivory)] md:text-[26px]">
              Live consciously
            </em>{" "}
            with our all-inclusive{" "}
            <strong className="font-bold text-[var(--hv2-hero-fg)]">
              mind reprogramming
            </strong>{" "}
            suite:
          </p>
          <p className="m-0 mt-2 max-w-none text-center text-[17px] leading-relaxed text-[var(--hv2-hero-muted)] md:mt-2.5 md:text-[22px] md:leading-[1.5]">
            Personalised AI-guided meditations · Vision board · Goal planner ·
            Personal Manifesto · Focus sessions
          </p>
        </div>
        <div className={form.className} style={form.style}>
          <HeroPrompt />
        </div>
        <TypesSection motionReady={motionReady} />
      </div>
    </section>
  );
}
