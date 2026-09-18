"use client";

import { useEffect } from "react";
import { spaPathForAppPath } from "@/lib/app-origins";
import { navigateToSpa } from "@/lib/spa-handoff";

/** Soft-redirect authenticated marketing routes to the Vite SPA (path + query preserved). */
export function SpaRedirect({ children }: { children?: React.ReactNode }) {
  useEffect(() => {
    const raw = `${window.location.pathname}${window.location.search}`;
    void navigateToSpa(spaPathForAppPath(raw));
  }, []);

  return (
    <>
      {children ? (
        <div className="hidden" aria-hidden>
          {children}
        </div>
      ) : null}
      <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
        Redirecting to app…
      </div>
    </>
  );
}
