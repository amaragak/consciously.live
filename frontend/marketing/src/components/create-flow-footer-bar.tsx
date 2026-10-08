"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { setChatFabFooterInset } from "@/lib/assistant-chat-fab-footer-inset";
import { useLibraryPlayer } from "@/components/library-player-provider";

type Props = {
  children: ReactNode;
  /** Extra classes on the outer bar (rarely needed). */
  className?: string;
};

/**
 * Shared create-flow bottom bar — same padding, border, and background on every
 * step so nav controls don’t jump or recolor when moving Create → Chat → Audio.
 *
 * Expected children (when length is shown): [left nav] [length] [right nav].
 * Length stays centered in the row on all breakpoints.
 *
 * Reports its height so the app Chat FAB can sit above it.
 * Hosts the now-playing strip directly above the length nav when a track plays.
 */
export function CreateFlowFooterBar({ children, className }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stripHostRef = useRef<HTMLDivElement | null>(null);
  const { setPlayerStripDockHost } = useLibraryPlayer();

  useLayoutEffect(() => {
    setPlayerStripDockHost(stripHostRef.current);
    return () => setPlayerStripDockHost(null);
  }, [setPlayerStripDockHost]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const report = () => {
      setChatFabFooterInset(el.getBoundingClientRect().height);
    };
    report();

    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setChatFabFooterInset(0);
    };
  }, []);

  return (
    <div className="relative shrink-0">
      {/* Floats above the length nav; out of flow so page content shows through. */}
      <div
        ref={stripHostRef}
        className="pointer-events-none absolute inset-x-0 bottom-full z-50"
      />
      <div
        ref={rootRef}
        className={[
          "border-t border-border/60 bg-background pt-3 pb-4 sm:pt-4 sm:pb-6",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-6xl items-center gap-2 px-4 sm:min-h-[2.75rem] sm:gap-3 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
