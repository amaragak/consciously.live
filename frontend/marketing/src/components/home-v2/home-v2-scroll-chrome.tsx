"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { HomeV2NavHeader } from "@/components/home-v2/home-v2-nav-header";
import { ReadingProgress } from "@/components/reading-progress";

const HomeV2ScrolledContext = createContext<boolean | null>(null);

/** Compact chrome when scrolled past this (px). */
const SCROLL_FILL_ENTER = 24;
/** Return to top chrome only when back below this (hysteresis). */
const SCROLL_FILL_EXIT = 8;

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function useHomeV2HeaderScrolled(
  rootRef: RefObject<HTMLElement | null>,
): boolean {
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root) ?? document.documentElement;

    const update = () => {
      const top =
        scroller === document.documentElement
          ? window.scrollY
          : (scroller as HTMLElement).scrollTop;
      const next = scrolledRef.current
        ? top > SCROLL_FILL_EXIT
        : top > SCROLL_FILL_ENTER;
      if (next === scrolledRef.current) return;
      scrolledRef.current = next;
      setScrolled(next);
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [rootRef]);

  return scrolled;
}

/**
 * Single page header: sticky overlay that compacts on scroll (paisley stays).
 * Soft-sun / compact states live in SiteHeader.
 */
export function HomeV2Chrome({
  scrolled: scrolledProp,
}: {
  /** Omit to read from `HomeV2ScrollChrome` context. */
  scrolled?: boolean;
} = {}) {
  const scrolledCtx = useContext(HomeV2ScrolledContext);
  const scrolled = scrolledProp ?? scrolledCtx ?? false;

  return (
    <HomeV2NavHeader
      tone="overlay"
      position="sticky"
      scrolled={scrolled}
    />
  );
}

/**
 * Page shell: scroll-fill context for `HomeV2Chrome` + optional reading progress
 * + reveal animations for `[data-hv2-reveal]`.
 */
export function HomeV2ScrollChrome({
  children,
  showReadingProgress = false,
}: {
  children: ReactNode;
  showReadingProgress?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrolled = useHomeV2HeaderScrolled(rootRef);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root) ?? document.documentElement;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      root.querySelectorAll<HTMLElement>("[data-hv2-reveal]").forEach((el) => {
        el.classList.add("is-in");
      });
      return undefined;
    }

    const revealEls = root.querySelectorAll<HTMLElement>("[data-hv2-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      {
        root: scroller === document.documentElement ? null : scroller,
        threshold: 0.12,
      },
    );
    revealEls.forEach((el) => {
      el.classList.add("home-v2-reveal");
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="home-v2 min-h-full">
      <HomeV2ScrolledContext.Provider value={scrolled}>
        {children}
        {showReadingProgress ? (
          <ReadingProgress underStickyHeader visible={scrolled} />
        ) : null}
      </HomeV2ScrolledContext.Provider>
    </div>
  );
}
