import { useCallback, useEffect, useRef } from "react";
import { onNativeSplashCleared } from "@/lib/native/native-bridge";

/** One cascade per overview scope per JS load. */
const playedScopes = new Set<string>();

const STEP_MS = 110;

/**
 * Stagger whole-card reveals on feature overview hubs (and the dashboard).
 * Cards stay hidden until the boot splash has cleared, then rise in order.
 * Overview hubs should mount loading cards on first paint so the cascade
 * runs at navigation time; late-fetched sections appear immediately.
 */
export function useOverviewEntrance(scope: string) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const rootRef = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!node) return;

      let cancelled = false;
      let mo: MutationObserver | null = null;
      let staggerIndex = 0;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      const playNodes = (immediate: boolean) => {
        const nodes = [
          ...node.querySelectorAll<HTMLElement>("[data-dash-reveal]"),
        ];
        nodes.forEach((el) => {
          if (el.dataset.dashPlayed === "1") return;
          el.dataset.dashPlayed = "1";
          if (immediate || reduce) {
            el.style.animationDelay = "0ms";
            el.classList.add("is-in");
            return;
          }
          el.style.animationDelay = `${staggerIndex * STEP_MS}ms`;
          staggerIndex += 1;
          requestAnimationFrame(() => el.classList.add("is-in"));
        });
      };

      const startEntrance = () => {
        if (cancelled) return;
        if (playedScopes.has(scope) || reduce) {
          playNodes(true);
          mo = new MutationObserver(() => playNodes(true));
          mo.observe(node, { childList: true, subtree: true });
          return;
        }
        playedScopes.add(scope);
        playNodes(false);
        // Content that swaps in after fetch should not re-cascade.
        mo = new MutationObserver(() => playNodes(true));
        mo.observe(node, { childList: true, subtree: true });
      };

      const offSplash = onNativeSplashCleared(startEntrance);
      cleanupRef.current = () => {
        cancelled = true;
        offSplash();
        mo?.disconnect();
      };
    },
    [scope],
  );

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [scope],
  );

  return rootRef;
}
