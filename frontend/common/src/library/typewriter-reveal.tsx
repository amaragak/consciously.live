/** Reveal text with a short typewriter when it first becomes available. */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
} from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type TypewriterRevealProps = {
  text: string;
  className?: string;
  style?: CSSProperties;
  as?: "h2" | "p" | "span";
  /** Base ms per character (capped by maxMs). */
  charMs?: number;
  /** Hard cap so long descriptions don't drag. */
  maxMs?: number;
};

export function TypewriterReveal({
  text,
  className,
  style,
  as: Tag = "span",
  charMs = 26,
  maxMs = 1600,
}: TypewriterRevealProps) {
  const reduced = prefersReducedMotion();
  const [visible, setVisible] = useState(() => (reduced ? text : ""));
  const targetRef = useRef(text);

  useEffect(() => {
    targetRef.current = text;
    if (!text) {
      setVisible("");
      return;
    }
    if (prefersReducedMotion()) {
      setVisible(text);
      return;
    }
    setVisible("");
    const step = Math.max(
      10,
      Math.min(charMs, Math.floor(maxMs / Math.max(1, text.length))),
    );
    let i = 0;
    const id = window.setInterval(() => {
      if (targetRef.current !== text) {
        window.clearInterval(id);
        return;
      }
      i += 1;
      setVisible(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, step);
    return () => window.clearInterval(id);
  }, [text, charMs, maxMs]);

  const Comp = Tag as ElementType;
  return (
    <Comp className={className} style={style}>
      {visible}
      {visible.length < text.length ? (
        <span className="inline-block w-[0.55ch] animate-pulse opacity-70" aria-hidden>
          |
        </span>
      ) : null}
    </Comp>
  );
}
