"use client";

import { useEffect, useState } from "react";
import { spaPathForAppPath } from "@/lib/app-origins";
import { useAuthLoginHref } from "@/lib/auth-login-href";
import { navigateToSpa } from "@/lib/spa-handoff";

/** Soft-redirect authenticated marketing routes to the Vite SPA (path + query preserved). */
export function SpaRedirect({ children }: { children?: React.ReactNode }) {
  const loginHref = useAuthLoginHref();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = `${window.location.pathname}${window.location.search}`;
      const ok = await navigateToSpa(spaPathForAppPath(raw));
      if (!cancelled && !ok) setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {children ? (
        <div className="hidden" aria-hidden>
          {children}
        </div>
      ) : null}
      <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
        {failed ? (
          <>
            Couldn’t open the app from this origin (session handoff unavailable).{" "}
            <a
              href={loginHref}
              className="text-accent-link underline-offset-2 hover:underline"
            >
              Sign in again
            </a>{" "}
            or stay on the marketing site.
          </>
        ) : (
          "Redirecting to app…"
        )}
      </div>
    </>
  );
}
