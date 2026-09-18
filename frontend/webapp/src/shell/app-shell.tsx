import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { readHasSessionHint } from "@consciously/common";
import { AppChrome } from "@/components/app-chrome";
import { LibraryPlayerProvider } from "@/components/library-player-provider";
import { ensureMedimadeSession } from "@/lib/auth-session";
import { consumeAuthHandoffFromUrl } from "@/lib/spa-handoff";
import { LoggedOutShell } from "./logged-out-shell";

/**
 * Pure SPA auth gate — no SSR/hydration tricks.
 * Optimistic shell from localStorage, corrected by ensureMedimadeSession.
 * Consumes marketing → SPA handoff codes before deciding logged-out.
 */
export function AppShell() {
  const location = useLocation();
  const [authState, setAuthState] = useState<"pending" | "in" | "out">("pending");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fromHandoff = await consumeAuthHandoffFromUrl();
      if (cancelled) return;
      if (fromHandoff) {
        setAuthState("in");
        return;
      }
      const hinted = readHasSessionHint();
      if (!hinted) {
        setAuthState("out");
        // Still try ensure in case cookie-only refresh works
      }
      const valid = await ensureMedimadeSession();
      if (!cancelled) setAuthState(valid ? "in" : "out");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      void ensureMedimadeSession().then((valid) => {
        setAuthState(valid ? "in" : "out");
      });
    };
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  if (authState === "pending") {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (authState === "out") {
    return <LoggedOutShell />;
  }

  void location.pathname;

  return (
    <LibraryPlayerProvider>
      <AppChrome>
        <Outlet />
      </AppChrome>
    </LibraryPlayerProvider>
  );
}
