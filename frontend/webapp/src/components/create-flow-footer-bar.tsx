
import { useEffect, useRef, type ReactNode } from "react";
import { setChatFabFooterInset } from "@/lib/assistant-chat-fab-footer-inset";

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
 */
export function CreateFlowFooterBar({ children, className }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

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
    <div
      ref={rootRef}
      className={[
        "shrink-0 border-t border-border/60 bg-background pt-3 pb-4 sm:pt-4 sm:pb-6",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-6xl items-center gap-2 px-4 sm:min-h-[2.75rem] sm:gap-3 sm:px-6">
        {children}
      </div>
    </div>
  );
}
