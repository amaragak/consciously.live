"use client";

import { useEffect, useState } from "react";
import { EnhancedHomePage } from "@/components/enhanced-home-page";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { isMarketingPreviewMode } from "@/lib/marketing-preview";
import { navigateToSpa } from "@/lib/spa-handoff";

function hasAppSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

/**
 * Logged-out / marketing preview: marketing home.
 * Logged-in: hard-nav to SPA `/` (WelcomeDashboard lives there) with handoff.
 */
export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [goToSpa, setGoToSpa] = useState(false);

  useEffect(() => {
    const sync = () => {
      setGoToSpa(hasAppSession() && !isMarketingPreviewMode());
      setReady(true);
    };
    void import("@/lib/auth-session").then((m) =>
      m.ensureMedimadeSession().finally(sync),
    );
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  useEffect(() => {
    if (!goToSpa) return;
    void navigateToSpa("/");
  }, [goToSpa]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (goToSpa) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
        Redirecting to app…
      </div>
    );
  }

  return <EnhancedHomePage />;
}
