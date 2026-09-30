"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/** Homepage motion + reveal only — no section-linked nav/wordmark. */
export function useHomeV2Scroll(rootRef: RefObject<HTMLElement | null>) {
  const [motionReady, setMotionReady] = useState(false);

  useLayoutEffect(() => {
    setMotionReady(true);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root) ?? document.documentElement;
    const reduce = prefersReducedMotion();

    if (!reduce) {
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
      return () => {
        io.disconnect();
      };
    }

    root.querySelectorAll<HTMLElement>("[data-hv2-reveal]").forEach((el) => {
      el.classList.add("is-in");
    });
    return undefined;
  }, [rootRef]);

  return { motionReady };
}

export function smoothScrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}
