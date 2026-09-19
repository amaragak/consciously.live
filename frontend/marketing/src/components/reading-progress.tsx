"use client";

import { useLayoutEffect, useRef } from "react";

type Props = {
  /** Element that wraps the rendered post body — progress is through this box. */
  containerId?: string;
};

/** Scrollport for the page (MainShell `<main overflow-y-auto>`), else the window. */
function getScrollParent(el: HTMLElement): HTMLElement | Window {
  let node: HTMLElement | null = el.parentElement;
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
  return window;
}

/**
 * Decorative reading progress bar pinned under the sticky site header.
 * Fills left→right with scroll through the article body container.
 * Listens on the real scrollport (MainShell), not `window` — the document
 * itself does not scroll on this site.
 */
export function ReadingProgress({
  containerId = "read-article-body",
}: Props) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;

    const apply = (value: number) => {
      fill.style.transform = `scaleX(${Math.min(1, Math.max(0, value))})`;
    };

    let scrollRoot: HTMLElement | Window = window;

    const update = () => {
      rafRef.current = null;
      const container = document.getElementById(containerId);
      if (!container) {
        apply(0);
        return;
      }

      const articleTop = container.getBoundingClientRect().top;
      const articleHeight = Math.max(1, container.offsetHeight);

      let viewBottom: number;
      if (scrollRoot instanceof Window) {
        viewBottom = window.innerHeight;
      } else {
        viewBottom = scrollRoot.getBoundingClientRect().bottom;
      }

      // 0 before the article enters the scrollport; 1 once its bottom reaches
      // the bottom of the visible area (end of article reached).
      apply((viewBottom - articleTop) / articleHeight);
    };

    const onScrollOrResize = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(update);
    };

    const container = document.getElementById(containerId);
    if (container) {
      scrollRoot = getScrollParent(container);
    }

    update();

    const rootEl = scrollRoot instanceof Window ? window : scrollRoot;
    rootEl.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    return () => {
      rootEl.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [containerId]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 z-[90] h-1"
      style={{ top: "var(--site-header-h)" }}
    >
      <div className="relative h-full w-full bg-gold/30 dark:bg-gold/25">
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 w-full origin-left bg-gold transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}
