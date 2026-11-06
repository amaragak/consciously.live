/**
 * Shared onboarding motion tokens — calm ease-out, opacity/transform only.
 */

import { useEffect, useState } from "react";

/** Gentle ease-out used for all onboarding motion. */
export const ONB_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/** Inject once — keyframes for breathe ring, sun rotate, spinner. */
let cssInjected = false;
export function ensureOnboardingMotionCss(): void {
  if (typeof document === "undefined" || cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.setAttribute("data-onboarding-motion", "1");
  style.textContent = `
@keyframes onb-breathe {
  0% { transform: scale(1); opacity: 0.55; }
  70% { transform: scale(1.35); opacity: 0; }
  100% { transform: scale(1.35); opacity: 0; }
}
@keyframes onb-sun-in {
  from { transform: rotate(-20deg); opacity: 0; }
  to { transform: rotate(0deg); opacity: 1; }
}
@keyframes onb-spin {
  to { transform: rotate(360deg); }
}
@keyframes onb-check-pop {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes onb-mic-press {
  0% { transform: scale(1); }
  45% { transform: scale(0.96); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .onb-motion-breathe,
  .onb-motion-sun,
  .onb-motion-spin,
  .onb-motion-check,
  .onb-motion-mic-press {
    animation: none !important;
  }
}
`;
  document.head.appendChild(style);
}

export function onbTransition(
  props: string,
  durationMs: number,
  delayMs = 0,
): string {
  return `${props} ${durationMs}ms ${ONB_EASE}${delayMs ? ` ${delayMs}ms` : ""}`;
}
