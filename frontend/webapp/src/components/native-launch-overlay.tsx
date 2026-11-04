import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/brand-lockup";
import { getMedimadeSessionJwt } from "@/lib/auth-session";
import {
  holdNativeDarkSurface,
  onNativeAppReady,
  type NativeAppReadyInfo,
} from "@/lib/native/native-bridge";
import { clearNativeBootSplash } from "@/lib/native/native-boot-splash";
import { hideNativeSplash } from "@/lib/native/native-shell";
import "./native-launch-overlay.css";

const MAX_MS = 6000;
const CROSSFADE_MS = 250;

type Phase = "loading" | "exit-in" | "done";

/**
 * Cap cover. Signed-out: no lockup (AuthShell’s BrandLockup is the only one).
 * Signed-in: BrandLockup + cross-fade into the app.
 */
export default function NativeLaunchOverlay() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [signedInExit, setSignedInExit] = useState(false);
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

    const leave = (info: NativeAppReadyInfo) => {
      if (cancelled || leftRef.current) return;
      leftRef.current = true;

      if (!info.signedIn) {
        releaseStatusBar();
        setPhase("done");
        return;
      }

      setSignedInExit(true);
      clearNativeBootSplash();
      setPhase("exit-in");
      exitTimer = window.setTimeout(() => {
        if (!cancelled) {
          releaseStatusBar();
          setPhase("done");
        }
      }, CROSSFADE_MS);
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
    <div
      className={[
        "native-launch",
        phase === "exit-in" ? "native-launch--fade" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="presentation"
      aria-hidden
    >
      {signedInExit ? (
        <div className="native-launch__lockup-center">
          <BrandLockup />
        </div>
      ) : null}
    </div>
  );
}
