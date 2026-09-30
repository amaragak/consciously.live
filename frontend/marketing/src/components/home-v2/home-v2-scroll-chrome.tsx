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
import type { HomeV2ToolId } from "@/components/home-v2/constants";
import { HomeV2NavHeader } from "@/components/home-v2/home-v2-nav-header";
import { ReadingProgress } from "@/components/reading-progress";

const SCROLL_FILL_AT = 8;

const HomeV2ScrolledContext = createContext<boolean | null>(null);

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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root) ?? document.documentElement;

    const update = () => {
      const top =
        scroller === document.documentElement
          ? window.scrollY
          : (scroller as HTMLElement).scrollTop;
      setScrolled(top > SCROLL_FILL_AT);
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
 * Single page header: sticky to the content top (not viewport-fixed), so
 * overscroll at the top cannot pull it into the shell deadzone. Transparent
 * at rest; fades to solid fill once you scroll. Sun glow lives in SiteHeader.
 */
export function HomeV2Chrome({
  home = false,
  activeTool = null,
  scrolled: scrolledProp,
}: {
  home?: boolean;
  activeTool?: HomeV2ToolId | null;
  /** Omit to read from `HomeV2ScrollChrome` context. */
  scrolled?: boolean;
}) {
  const scrolledCtx = useContext(HomeV2ScrolledContext);
  const scrolled = scrolledProp ?? scrolledCtx ?? false;

  return (
    <HomeV2NavHeader
      tone="overlay"
      position="sticky"
      home={home}
      activeTool={activeTool}
      scrolled={scrolled}
    />
  );
}

/**
 * Page shell: scroll-fill context for `HomeV2Chrome` + optional reading progress.
 * Place chrome inside the painted field/hero ancestor so transparency reveals it.
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

  return (
    <div ref={rootRef} className="home-v2 min-h-full">
      <HomeV2ScrolledContext.Provider value={scrolled}>
        {children}
        {showReadingProgress ? (
          <ReadingProgress underStickyHeader />
        ) : null}
      </HomeV2ScrolledContext.Provider>
    </div>
  );
}
