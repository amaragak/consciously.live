"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { HomeV2NavHeader } from "@/components/home-v2/home-v2-nav-header";
import { ReadingProgress } from "@/components/reading-progress";

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Read field shell: transparent top chrome over paisley, plus homepage-style
 * fixed sticky header after scroll. Post pages also get a reading progress
 * bar pinned under the sticky header.
 */
export function ReadFieldShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const pathname = usePathname() || "/";
  const isPost = /^\/read\/[^/]+/.test(pathname);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scroller = findScrollParent(root) ?? document.documentElement;

    const updateStuck = () => {
      const top =
        scroller === document.documentElement
          ? window.scrollY
          : (scroller as HTMLElement).scrollTop;
      setStuck(top > 140);
    };

    updateStuck();
    scroller.addEventListener("scroll", updateStuck, { passive: true });
    window.addEventListener("resize", updateStuck);
    return () => {
      scroller.removeEventListener("scroll", updateStuck);
      window.removeEventListener("resize", updateStuck);
    };
  }, []);

  return (
    <div ref={rootRef} className="home-v2 home-v2-field min-h-full">
      {stuck ? (
        <>
          <HomeV2NavHeader tone="solid" position="fixed" />
          {isPost ? <ReadingProgress underStickyHeader /> : null}
        </>
      ) : null}
      <HomeV2NavHeader tone="transparent" position="static" />
      {children}
    </div>
  );
}
