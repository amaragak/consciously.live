"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import type { HomeV2ToolId } from "@/components/home-v2/constants";

const TOOL_IDS: HomeV2ToolId[] = [
  "meditate",
  "journal",
  "manifest",
  "focus",
  "chat",
];

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

export function useHomeV2Scroll(rootRef: RefObject<HTMLElement | null>) {
  const [stuck, setStuck] = useState(false);
  const [activeTool, setActiveTool] = useState<HomeV2ToolId | null>(null);
  const [motionReady, setMotionReady] = useState(false);

  useLayoutEffect(() => {
    setMotionReady(true);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root) ?? document.documentElement;
    const reduce = prefersReducedMotion();

    const updateActive = () => {
      const vh =
        scroller === document.documentElement
          ? window.innerHeight
          : (scroller as HTMLElement).clientHeight;
      const threshold = vh * 0.4;
      let current: HomeV2ToolId | null = null;
      for (const id of TOOL_IDS) {
        const el = root.querySelector<HTMLElement>(`[data-tool="${id}"]`);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top < threshold) current = id;
      }
      setActiveTool(current);
    };

    const updateStuck = () => {
      const top =
        scroller === document.documentElement
          ? window.scrollY
          : (scroller as HTMLElement).scrollTop;
      setStuck(top > 140);
    };

    const onScroll = () => {
      updateStuck();
      updateActive();
    };

    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

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
        { root: scroller === document.documentElement ? null : scroller, threshold: 0.12 },
      );
      revealEls.forEach((el) => {
        el.classList.add("home-v2-reveal");
        io.observe(el);
      });
      return () => {
        scroller.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        io.disconnect();
      };
    }

    root.querySelectorAll<HTMLElement>("[data-hv2-reveal]").forEach((el) => {
      el.classList.add("is-in");
    });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [rootRef]);

  return { stuck, activeTool, motionReady };
}

export function smoothScrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}
