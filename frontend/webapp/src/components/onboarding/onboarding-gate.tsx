"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { wasIdeateStorePulledThisSession } from "@/lib/ideate-cloud";
import {
  ensureAccountOnboarding,
  settleAutomaticOnboarding,
} from "@/lib/onboarding-account";
import {
  describeOnboardingCoverageCheck,
  loadOnboardingStore,
  ONBOARDING_CHANGED,
  onboardingHref,
  shouldBounceFromFullOnboarding,
} from "@/lib/onboarding-state";

/**
 * Wait for Ideate cloud pull before gating empty accounts to Tell me.
 * Accounts that already have any coverage go to Home (mostly-set-up sheet).
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { ready, signedIn, revision } = useIdeateCloud();
  const [decision, setDecision] = useState<
    "loading" | "full" | "sheet" | "none"
  >("loading");
  const loggedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    void ensureAccountOnboarding().then(() => {
      if (!alive) return;
      const next = settleAutomaticOnboarding({ signedIn });
      setDecision(next);
      if (!loggedRef.current && wasIdeateStorePulledThisSession()) {
        loggedRef.current = true;
        console.info("[onboarding] coverage check", describeOnboardingCoverageCheck());
      }
    });
    return () => {
      alive = false;
    };
  }, [signedIn, ready, revision, location.pathname]);

  useEffect(() => {
    const sync = () => setDecision(settleAutomaticOnboarding({ signedIn }));
    window.addEventListener(ONBOARDING_CHANGED, sync);
    return () => window.removeEventListener(ONBOARDING_CHANGED, sync);
  }, [signedIn]);

  const path = location.pathname.split("?")[0] ?? location.pathname;
  const onOnboarding =
    path === "/onboarding" || path.startsWith("/onboarding/");

  const force = Boolean(loadOnboardingStore().forceRerunAt);
  const search = new URLSearchParams(location.search);
  const mode = search.get("mode");
  const intentional =
    force || mode === "merge" || mode === "gap" || mode === "mostly";

  const pulled = wasIdeateStorePulledThisSession();

  // Existing accounts that landed on Tell me (race / old gate): bounce home.
  if (
    signedIn &&
    pulled &&
    onOnboarding &&
    !intentional &&
    shouldBounceFromFullOnboarding()
  ) {
    return <Navigate to="/" replace />;
  }

  if ((force || decision === "full") && !onOnboarding) {
    return (
      <Navigate
        to={onboardingHref({
          step: "tell_me",
          mode: force ? "merge" : "full",
        })}
        replace
      />
    );
  }

  return <>{children}</>;
}
