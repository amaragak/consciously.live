import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getMedimadeSessionJwt } from "@/lib/auth-session";
import {
  holdNativeDarkSurface,
  markNativeSplashCleared,
  onNativeAppReady,
  type NativeAppReadyInfo,
} from "@/lib/native/native-bridge";
import { clearNativeBootSplash } from "@/lib/native/native-boot-splash";
import { hideNativeSplash } from "@/lib/native/native-shell";
import "./native-launch-overlay.css";

const MAX_MS = 6000;
/** Soft cross-fade of the boot splash into the dashboard. */
export const SIGNED_IN_SPLASH_FADE_MS = 480;

type Phase = "loading" | "done";

/**
 * Cap cover over the inline boot splash.
 * Signed-out: drop immediately — AuthShell owns the lockup morph.
 * Signed-in: fade the boot splash itself so the dashboard appears underneath.
 */
export default function NativeLaunchOverlay() {
  const [phase, setPhase] = useState<Phase>("loading");
  const leftRef = useRef(false);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      hideNativeSplash();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const releaseStatusBar = holdNativeDarkSurface();
    let cancelled = false;
    let exitTimer = 0;

    const finishSplash = () => {
      clearNativeBootSplash();
      releaseStatusBar();
      markNativeSplashCleared();
    };

    const leave = (info: NativeAppReadyInfo) => {
      if (cancelled || leftRef.current) return;
      leftRef.current = true;

      if (!info.signedIn) {
        // AuthShell takes the boot lockup; this cover just gets out of the way.
        releaseStatusBar();
        setPhase("done");
        // No dashboard under login — still clear the gate so nothing waits forever.
        markNativeSplashCleared();
        return;
      }

      // Unmount the underlay first so fading the boot reveals the app, not navy.
      setPhase("done");

      const boot = document.getElementById("native-boot-splash");
      if (!boot) {
        finishSplash();
        return;
      }

      boot.style.transition = `opacity ${SIGNED_IN_SPLASH_FADE_MS}ms ease`;
      void boot.getBoundingClientRect();
      boot.style.opacity = "0";

      exitTimer = window.setTimeout(() => {
        if (cancelled) return;
        finishSplash();
      }, SIGNED_IN_SPLASH_FADE_MS);
    };

    const offReady = onNativeAppReady(leave);
    const maxTimer = window.setTimeout(() => {
      leave({ signedIn: Boolean(getMedimadeSessionJwt()) });
    }, MAX_MS);

    return () => {
      cancelled = true;
      offReady();
      window.clearTimeout(maxTimer);
      window.clearTimeout(exitTimer);
      releaseStatusBar();
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div className="native-launch" role="presentation" aria-hidden />
  );
}
