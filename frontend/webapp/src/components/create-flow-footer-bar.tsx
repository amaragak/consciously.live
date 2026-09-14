"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Extra classes on the outer bar (rarely needed). */
  className?: string;
};

/**
 * Shared create-flow bottom bar — same padding, border, and background on every
 * step so nav controls don’t jump or recolor when moving Create → Chat → Audio.
 */
export function CreateFlowFooterBar({ children, className }: Props) {
  return (
    <div
      className={[
        "shrink-0 border-t border-border/60 bg-background pt-4 pb-6",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mx-auto flex min-h-[2.75rem] w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        {children}
      </div>
    </div>
  );
}
