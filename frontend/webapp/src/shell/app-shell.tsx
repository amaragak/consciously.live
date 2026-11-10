import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppChrome } from "@/components/app-chrome";
import { DailyAffirmationsWarmup } from "@/components/plan/daily-affirmations-card";
import { IdeateCloudProvider } from "@/components/plan/ideate-cloud-provider";
import { LibraryPlayerProvider } from "@/components/library-player-provider";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import {
  bootMedimadeAuthGate,
  ensureMedimadeSession,
  getMedimadeSessionJwt,
  isMedimadeAccessJwtUsable,
} from "@/lib/auth-session";
import {
  consumeAuthHandoffFromUrl,
  hasPendingAuthHandoff,
} from "@/lib/spa-handoff";
import { markNativeAppReady } from "@/lib/native/native-bridge";
import { MvpFlagsProvider } from "@/lib/mvp-flags";
import { LoggedOutShell } from "./logged-out-shell";

/**
 * Pure SPA auth gate — no SSR/hydration tricks.
 * A known session paints the app at once. A handoff or refresh can wait, but
 * that wait is blank: the home page is not a list, so it does not get list cards.
 * The wait cannot sit forever if the session call never returns.
 */
export function AppShell() {
  const location = useLocation();
  const [authState, setAuthState] = useState<"pending" | "in" | "out">(() =>
    hasPendingAuthHandoff() ? "pending" : bootMedimadeAuthGate(),
  );
  /** Native sign-in still has a step to show after the session exists. */
  const [nativeAuthHold, setNativeAuthHold] = useState(false);

  useEffect(() => {
    if (authState === "in") markNativeAppReady({ signedIn: true });
  }, [authState]);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: "in" | "out") => {
      if (!cancelled) setAuthState(next);
    };
    const giveUp = window.setTimeout(() => {
      settle(isMedimadeAccessJwtUsable(getMedimadeSessionJwt()) ? "in" : "out");
    }, 8_000);
    void (async () => {
      try {
        const fromHandoff = await consumeAuthHandoffFromUrl();
        if (cancelled) return;
        if (fromHandoff) {
          settle("in");
          return;
        }
        const valid = await ensureMedimadeSession();
        const inApp =
          valid && isMedimadeAccessJwtUsable(getMedimadeSessionJwt());
        settle(inApp ? "in" : "out");
      } catch {
        settle(isMedimadeAccessJwtUsable(getMedimadeSessionJwt()) ? "in" : "out");
      } finally {
        window.clearTimeout(giveUp);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      // Don't flip to "out" while a handoff redeem is still finishing.
      if (hasPendingAuthHandoff()) return;
      void ensureMedimadeSession().then((valid) => {
        const inApp =
          valid && isMedimadeAccessJwtUsable(getMedimadeSessionJwt());
        setAuthState(inApp ? "in" : "out");
      });
    };
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  if (authState === "pending") {
    // Native keeps its launch screen up. Web stays blank for a handoff or
    // refresh — not a stack of list cards in place of the home page.
    return null;
  }

  if (authState === "out" || (__NATIVE_BUILD__ && nativeAuthHold)) {
    return <LoggedOutShell onNativeAuthHoldChange={setNativeAuthHold} />;
  }

  void location.pathname;

  return (
    <MvpFlagsProvider>
      <LibraryPlayerProvider>
        <IdeateCloudProvider>
          <DailyAffirmationsWarmup />
          <OnboardingGate>
            <AppChrome>
              <Outlet />
            </AppChrome>
          </OnboardingGate>
        </IdeateCloudProvider>
      </LibraryPlayerProvider>
    </MvpFlagsProvider>
  );
}
