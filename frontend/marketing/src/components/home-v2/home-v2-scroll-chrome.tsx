"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
 * Homepage-style scroll chrome: fixed solid sticky header after scroll.
 * Place `HomeV2TopChrome` inside children for the translucent + radial top bar.
 */
export function HomeV2ScrollChrome({
  children,
  showReadingProgress = false,
  home = false,
}: {
  children: ReactNode;
  showReadingProgress?: boolean;
  home?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

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
    <div ref={rootRef} className="home-v2 min-h-full">
      {stuck ? (
        <>
          <HomeV2NavHeader tone="solid" position="fixed" home={home} />
          {showReadingProgress ? (
            <ReadingProgress underStickyHeader />
          ) : null}
        </>
      ) : null}
      {children}
    </div>
  );
}
