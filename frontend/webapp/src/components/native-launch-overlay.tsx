import { useEffect, useState } from "react";
import {
  holdNativeDarkSurface,
  onNativeAppReady,
} from "@/lib/native/native-bridge";
import { hideNativeSplash } from "@/lib/native/native-shell";

/** Same render as the native splash (`native-assets/splash.png`), aspect-fill. */
const LAUNCH_IMAGE = "/native/launch.webp";
/** Brief pause on the brand before the first screen, even when auth is instant. */
const MIN_VISIBLE_MS = 1100;
/** Never trap the user behind the overlay if nothing signals ready. */
const MAX_VISIBLE_MS = 6000;
const FADE_MS = 420;

type Phase = "showing" | "fading" | "done";

/**
 * Web copy of the native launch screen. The native splash is hidden only once
 * this has painted the same artwork, then this fades when the app is ready.
 */
export default function NativeLaunchOverlay() {
  const [phase, setPhase] = useState<Phase>("showing");

  useEffect(() => {
    const releaseStatusBar = holdNativeDarkSurface();
    const shownAt = performance.now();
    let cancelled = false;
    let fadeTimer = 0;

    const img = new Image();
    img.src = LAUNCH_IMAGE;
    const reveal = () => {
      if (cancelled) return;
      requestAnimationFrame(() => requestAnimationFrame(() => hideNativeSplash()));
    };
    img.decode().then(reveal, reveal);

    const startFade = () => {
      if (cancelled || fadeTimer) return;
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
      fadeTimer = window.setTimeout(() => {
        if (cancelled) return;
        releaseStatusBar();
        setPhase("fading");
        window.setTimeout(() => {
          if (!cancelled) setPhase("done");
        }, FADE_MS);
      }, wait);
    };

    const offReady = onNativeAppReady(startFade);
    const maxTimer = window.setTimeout(startFade, MAX_VISIBLE_MS);

    return () => {
      cancelled = true;
      offReady();
      window.clearTimeout(maxTimer);
      window.clearTimeout(fadeTimer);
      releaseStatusBar();
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      role="img"
      aria-label="consciously"
      aria-hidden={phase === "fading" ? true : undefined}
      className="fixed inset-0 z-[10000] select-none"
      style={{
        backgroundColor: "#1e2530",
        backgroundImage: `url(${LAUNCH_IMAGE})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        opacity: phase === "fading" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
    />
  );
}
