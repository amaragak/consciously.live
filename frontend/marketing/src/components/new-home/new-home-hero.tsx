"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Heart } from "lucide-react";
import {
  HOME_V2_CONNECT_HREF,
  HOME_V2_LISTEN_HREF,
  HOME_V2_READ_HREF,
  HOME_V2_START_FREE_HREF,
  type HomeV2ToolId,
} from "@/components/home-v2/constants";
import { HeroPrompt, HomeV2AuthActions } from "@/components/home-v2/hero-prompt";
import { HomeV2MobileMenu } from "@/components/home-v2/home-v2-mobile-menu";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { Lockup } from "@/components/home-v2/lockup";
import {
  HERO_PORTRAIT_AVIF,
  HERO_PORTRAIT_JPG,
  HERO_PORTRAIT_SIZES,
  HERO_PORTRAIT_WEBP,
  HERO_WIDE_ALT,
  HERO_WIDE_AVIF,
  HERO_WIDE_JPG,
  HERO_WIDE_SIZES,
  HERO_WIDE_SRC,
  HERO_WIDE_WEBP,
} from "@/components/new-home/new-home-hero-art";
import {
  pageScroller,
  scrollToNextBand,
  scrollToSection,
  scrollToTop,
} from "@/components/new-home/new-home-scroll";
import { useWaitlist } from "@/components/new-home/waitlist-modal";

const NAV = [
  ["Meditate", "meditate"],
  ["Manifest", "manifest"],
  ["Journal", "journal"],
  ["Heal", "heal"],
  ["Focus", "focus"],
] as const;

const MORE = [
  ["Listen", HOME_V2_LISTEN_HREF],
  ["Read", HOME_V2_READ_HREF],
  ["Connect", HOME_V2_CONNECT_HREF],
] as const;

const TILES = [
  ["meditate", "Meditate"],
  ["manifest", "Manifest"],
  ["journal", "Journal"],
  ["heal", "Heal"],
  ["focus", "Focus"],
] as const;

const HERO_STEP = 90;

function rise(step: number) {
  return {
    className: "home-v2-hero-anim",
    style: { animationDelay: `${step * HERO_STEP}ms` } as const,
  };
}

function HeroArt({
  phone,
  wing,
}: {
  phone: boolean;
  wing?: "left" | "right";
}) {
  return (
    <picture
      className={wing ? `new-home-hero-wing is-${wing}` : undefined}
      aria-hidden={wing ? true : undefined}
    >
      {phone ? (
        <>
          <source
            media="(max-width: 767.98px)"
            type="image/avif"
            srcSet={HERO_PORTRAIT_AVIF}
            sizes={HERO_PORTRAIT_SIZES}
          />
          <source
            media="(max-width: 767.98px)"
            type="image/webp"
            srcSet={HERO_PORTRAIT_WEBP}
            sizes={HERO_PORTRAIT_SIZES}
          />
          <source
            media="(max-width: 767.98px)"
            srcSet={HERO_PORTRAIT_JPG}
            sizes={HERO_PORTRAIT_SIZES}
          />
        </>
      ) : null}
      <source type="image/avif" srcSet={HERO_WIDE_AVIF} sizes={HERO_WIDE_SIZES} />
      <source type="image/webp" srcSet={HERO_WIDE_WEBP} sizes={HERO_WIDE_SIZES} />
      <img
        className="new-home-hero-photo"
        src={HERO_WIDE_SRC}
        srcSet={HERO_WIDE_JPG}
        sizes={HERO_WIDE_SIZES}
        alt={wing ? "" : HERO_WIDE_ALT}
        fetchPriority={wing ? "low" : "high"}
        decoding="async"
      />
    </picture>
  );
}

export function NewHomeHero({ phone = false }: { phone?: boolean }) {
  const [active, setActive] = useState("meditate");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerId = useId();
  const menuPanelId = useId();
  const waitlist = useWaitlist();
  const strap = rise(1);
  const text = rise(2);
  const path = rise(3);
  const input = rise(4);
  const cards = rise(5);

  useEffect(() => {
    const nodes = NAV.map(([, id]) => document.getElementById(id)).filter(
      (node): node is HTMLElement => Boolean(node),
    );
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-15% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="new-home-nav-bar">
        <div className="home-v2-site-header-hero-plate" aria-hidden />
        <div
          className="home-v2-site-header-soft-sun pointer-events-none absolute inset-x-0 top-0"
          aria-hidden
        >
          <div className="relative mx-auto h-full max-w-[1200px]">
            <span className="home-v2-hero-chrome-glow-sun absolute left-[20px] top-[28px] size-[56px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl md:top-[36px] md:size-[64px]" />
          </div>
        </div>
        <nav className="new-home-nav" aria-label="Primary">
          <div className="new-home-nav-brand">
            <Lockup
              size="nav"
              withMark
              onHero
              homeHref="/"
              onHomeClick={(event) => {
                setMenuOpen(false);
                const scroller = pageScroller();
                if (scroller.scrollTop < 2) return;
                event.preventDefault();
                scrollToTop();
              }}
            />
          </div>
          <div className="new-home-links">
            {NAV.map(([label, id]) => (
              <a
                key={id}
                href={`#${id}`}
                className={active === id ? "is-on" : undefined}
                aria-current={active === id ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(id);
                }}
              >
                {label}
              </a>
            ))}
            <span className="new-home-sep" aria-hidden />
            {MORE.map(([label, href]) => (
              <a key={label} href={href}>
                {label}
              </a>
            ))}
          </div>
          <div className="new-home-nav-end">
            <HomeV2AuthActions
              ctaHref={HOME_V2_START_FREE_HREF}
              ctaLabel={waitlist ? "Join the waitlist" : "Start free"}
              tone="mist"
              onJoinWaitlist={
                waitlist ? () => waitlist.open({ source: "header" }) : undefined
              }
            />
            <button
              id={menuTriggerId}
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls={menuPanelId}
              onClick={() => setMenuOpen((open) => !open)}
              className={`new-home-menu-btn home-v2-site-header-menu-btn${menuOpen ? " is-open" : ""}`}
            >
              <span className="home-v2-site-header-menu-icon" aria-hidden>
                <span />
                <span />
              </span>
            </button>
          </div>
        </nav>
        <HomeV2MobileMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          toolLinks={NAV.map(([label, id]) => ({
            id,
            label,
            href: `#${id}`,
            onClick: () => scrollToSection(id),
          }))}
          secondaryLinks={MORE.map(([label, href]) => ({
            id: label.toLowerCase(),
            label,
            href,
          }))}
          activeTool={active as HomeV2ToolId}
          triggerId={menuTriggerId}
          panelId={menuPanelId}
          joinWaitlist={
            waitlist
              ? () => {
                  setMenuOpen(false);
                  waitlist.open({ source: "header" });
                }
              : undefined
          }
        />
      </div>
      <header className="new-home-hero">
        <div className="new-home-stage">
        <div className="new-home-hero-frame">
          <HeroArt phone={phone} />
          <HeroArt phone={phone} wing="left" />
          <HeroArt phone={phone} wing="right" />
        </div>
        <div className="new-home-stage-shade" aria-hidden />
        <div className="new-home-wrap new-home-stage-inner">
          <div className="new-home-copy">
            <h1 className={`new-home-display ${strap.className}`} style={strap.style}>
              Become who you <em>said</em> you’d be.
            </h1>
            <p className={`new-home-lead ${text.className}`} style={text.style}>
              The app that catalyses personal transformation.
            </p>
            <p className={`new-home-path new-home-display ${path.className}`} style={path.style}>
              <span>See it</span>
              <span aria-hidden>→</span>
              <span>Clear it</span>
              <span aria-hidden>→</span>
              <span>Believe it</span>
              <span aria-hidden>→</span>
              <i>Become it.</i>
            </p>
            <div className={`new-home-prompt-slot ${input.className}`} style={input.style}>
              <HeroPrompt
                tone="line"
                onLineIntent={
                  waitlist
                    ? (brief) => waitlist.open({ source: "hero", brief })
                    : undefined
                }
              />
            </div>
          </div>
          <div className={`new-home-dock ${cards.className}`} style={cards.style}>
            <nav className="new-home-tiles new-home-swipe" aria-label="Features">
              {TILES.map(([id, label]) => (
                <a
                  key={id}
                  className="new-home-tile"
                  href={`#${id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection(id);
                  }}
                >
                  {id === "heal" ? (
                    <Heart aria-hidden width={20} height={20} strokeWidth={1.7} />
                  ) : (
                    <HomeV2ToolIcon tool={id} size={20} />
                  )}
                  <strong className="new-home-display">{label}</strong>
                </a>
              ))}
            </nav>
          </div>
          <p className="new-home-swipe-hint">
            <span aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Swipe for more →
          </p>
        </div>
      </div>
      </header>
    </>
  );
}

export function NewHomeScrollCue() {
  const [atBottom, setAtBottom] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalHost(document.body);
  }, []);

  useEffect(() => {
    const scroller = pageScroller();
    const sync = () => {
      const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      setAtBottom(remaining < 28);
    };
    sync();
    scroller.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      scroller.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const cue = (
    <a
      href="#meditate"
      className={`new-home-next${atBottom ? " is-gone" : ""}`}
      aria-label="Next section"
      aria-hidden={atBottom}
      tabIndex={atBottom ? -1 : 0}
      onClick={(event) => {
        event.preventDefault();
        scrollToNextBand();
      }}
    >
      <ChevronDown aria-hidden width={18} height={18} strokeWidth={1.8} />
    </a>
  );

  // Fixed inside the scrolling main is clipped in Safari, so the circle
  // paints and the click misses. Anchor it to the viewport instead.
  if (portalHost) return createPortal(cue, portalHost);
  return cue;
}
