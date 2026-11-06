"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { wasIdeateStorePulledThisSession } from "@/lib/ideate-cloud";
import {
  describeOnboardingCoverageCheck,
  loadOnboardingStore,
  onboardingHref,
  shouldBounceFromFullOnboarding,
  shouldGateToOnboarding,
} from "@/lib/onboarding-state";

/**
 * Wait for Ideate cloud pull before gating empty accounts to Tell me.
 * Accounts that already have any coverage go to Home (mostly-set-up sheet).
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { ready, revision } = useIdeateCloud();
  const [gate, setGate] = useState(false);
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const pulled = wasIdeateStorePulledThisSession();
    const next = shouldGateToOnboarding({ ideatePulled: pulled });
    setGate(next);

    if (!loggedRef.current && pulled) {
      loggedRef.current = true;
      const detail = describeOnboardingCoverageCheck();
      console.info("[onboarding] coverage check", detail);
    }
  }, [ready, revision, location.pathname]);

  useEffect(() => {
    const sync = () => {
      setGate(
        shouldGateToOnboarding({
          ideatePulled: wasIdeateStorePulledThisSession(),
        }),
      );
    };
    window.addEventListener("mm-onboarding-changed", sync);
    return () => window.removeEventListener("mm-onboarding-changed", sync);
  }, []);

  const path = location.pathname.split("?")[0] ?? location.pathname;
  const onOnboarding =
    path === "/onboarding" || path.startsWith("/onboarding/");

  const force = Boolean(loadOnboardingStore().forceRerunAt);
  const search = new URLSearchParams(location.search);
  const mode = search.get("mode");
  const intentional =
    force || mode === "merge" || mode === "gap" || mode === "mostly";

  // Existing accounts that landed on Tell me (race / old gate): bounce home.
  if (
    ready &&
    onOnboarding &&
    !intentional &&
    shouldBounceFromFullOnboarding()
  ) {
    return <Navigate to="/" replace />;
  }

  if ((force || (ready && gate)) && !onOnboarding) {
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
