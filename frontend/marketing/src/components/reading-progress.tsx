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
 * On Read posts it only appears once the overlay header has shrunk,
 * animating in with that compact transition.
 * Sticky (not viewport-fixed) so it matches the scrollport width and does
 * not paint over the scrollbar.
 * Listens on the real scrollport (MainShell), not `window` — the document
 * itself does not scroll on this site.
 */
export function ReadingProgress({
  containerId = "read-article-body",
  underStickyHeader = false,
  visible = true,
}: Props & {
  /** Sit under homepage-v2 sticky chrome (Read / home scroll header). */
  underStickyHeader?: boolean;
  /** False until the overlay header is in its shrunk/filled state. */
  visible?: boolean;
}) {
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
      className={`home-v2-reading-progress pointer-events-none sticky z-[45] h-0 w-full overflow-visible${
        underStickyHeader ? " home-v2-reading-progress--under-sticky" : ""
      }${visible ? " is-visible" : ""}`}
      style={
        underStickyHeader
          ? undefined
          : { top: "var(--site-header-h)" }
      }
    >
      {/* Track sits in a zero-height sticky slot so it doesn't shift page flow,
          and stays within the scrollport (not viewport-fixed over the scrollbar). */}
      <div className="relative h-1 w-full bg-[color-mix(in_srgb,var(--hv2-gold)_30%,transparent)]">
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 w-full origin-left bg-[var(--hv2-gold)] transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}
