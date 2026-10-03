"use client";

import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";
import { useLibraryPlayer } from "@/components/library-player-provider";

/** Sticky site header height (`h-14`). */
const HEADER_OFFSET_PX = 56;
/** Treat a strip as “current” once its top is within this of the header line. */
const CURRENT_SLACK_PX = 48;

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function isNestedStrip(el: HTMLElement, root: HTMLElement): boolean {
  let p = el.parentElement;
  while (p && p !== root) {
    if (
      p.classList.contains("home-v2-band") ||
      p.classList.contains("home-v2-hero") ||
      p.hasAttribute("data-marketing-strip")
    ) {
      return true;
    }
    p = p.parentElement;
  }
  return false;
}

/** Top-level marketing strips (hero + bands + marked sections). */
export function collectMarketingStrips(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    ".home-v2-hero, .home-v2-band, [data-marketing-strip]",
  );
  return [...nodes].filter(
    (el) => el.offsetParent !== null && !isNestedStrip(el, root),
  );
}

function scrollPortTop(scroller: HTMLElement | null): number {
  if (!scroller || scroller === document.documentElement) return 0;
  return scroller.getBoundingClientRect().top;
}

function scrollPortBottom(scroller: HTMLElement | null): number {
  if (!scroller || scroller === document.documentElement) {
    return window.innerHeight;
  }
  return scroller.getBoundingClientRect().bottom;
}

function nextStripBelow(
  strips: HTMLElement[],
  scroller: HTMLElement | null,
): HTMLElement | null {
  const line =
    scrollPortTop(scroller) + HEADER_OFFSET_PX + CURRENT_SLACK_PX;
  for (const el of strips) {
    if (el.getBoundingClientRect().top > line) return el;
  }
  return null;
}

/** True when the site footer card is entirely inside the scrollport. */
function footerCardFullyInView(scroller: HTMLElement | null): boolean {
  const card = document.querySelector<HTMLElement>(".app-footer-card");
  if (!card) return false;
  const rect = card.getBoundingClientRect();
  const top = scrollPortTop(scroller);
  const bottom = scrollPortBottom(scroller);
  const slack = 2;
  return rect.top >= top - slack && rect.bottom <= bottom + slack;
}

function atScrollBottom(scroller: HTMLElement | null): boolean {
  const slack = 8;
  if (!scroller || scroller === document.documentElement) {
    const doc = document.documentElement;
    return window.scrollY + window.innerHeight >= doc.scrollHeight - slack;
  }
  return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - slack;
}

function smoothScrollToStrip(
  el: HTMLElement,
  scroller: HTMLElement | null,
): void {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth";

  if (!scroller || scroller === document.documentElement) {
    const y =
      window.scrollY + el.getBoundingClientRect().top - HEADER_OFFSET_PX;
    window.scrollTo({ top: Math.max(0, y), behavior });
    return;
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const top =
    scroller.scrollTop + (elRect.top - scrollerRect.top) - HEADER_OFFSET_PX;
  scroller.scrollTo({ top: Math.max(0, top), behavior });
}

/**
 * Floating circled chevron — smooth-scrolls to the next marketing strip.
 * Mount inside a `.home-v2` root (via `HomeV2ScrollChrome` / home page).
 */
export function MarketingNextStripButton({
  rootRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
}) {
  const [visible, setVisible] = useState(false);
  const { nowPlaying, playerStripHeightPx } = useLibraryPlayer();
  const playerPad =
    nowPlaying && playerStripHeightPx > 0 ? playerStripHeightPx + 8 : 0;

  const refresh = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      setVisible(false);
      return;
    }
    const scroller = findScrollParent(root);
    if (footerCardFullyInView(scroller) || atScrollBottom(scroller)) {
      setVisible(false);
      return;
    }
    const strips = collectMarketingStrips(root);
    setVisible(strips.length >= 2 && nextStripBelow(strips, scroller) != null);
  }, [rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root) ?? document.documentElement;

    refresh();
    const onScroll = () => refresh();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(root);
    const footer = document.querySelector(".app-footer");
    if (footer) ro.observe(footer);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
    };
  }, [rootRef, refresh]);

  const onClick = () => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root);
    if (footerCardFullyInView(scroller) || atScrollBottom(scroller)) return;
    const next = nextStripBelow(collectMarketingStrips(root), scroller);
    if (!next) return;
    smoothScrollToStrip(next, scroller);
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Scroll to next section"
      onClick={onClick}
      className="marketing-next-strip-btn fixed left-1/2 z-[90] flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-[rgb(255_252_248/0.28)] bg-[rgb(30_37_48/0.42)] text-[rgb(255_252_248/0.92)] shadow-[0_4px_18px_rgb(15_27_45/0.18)] backdrop-blur-md transition-[opacity,transform,background-color] duration-200 hover:bg-[rgb(30_37_48/0.58)] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(200_164_106/0.8)] active:scale-95"
      style={{
        bottom: `calc(1.25rem + env(safe-area-inset-bottom, 0px) + ${playerPad}px)`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
