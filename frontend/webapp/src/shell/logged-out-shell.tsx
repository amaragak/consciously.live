import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { brand } from "@consciously/common";
import { safeAuthNext } from "@/lib/app-routes";
import { getLiveColorScheme, withAuthColorSchemeQuery } from "@/lib/color-scheme";
import { isNativeApp, NATIVE_DEV_TOOLS_ENABLED } from "@/lib/native/native-bridge";
import { getMarketingOrigin, marketingHref } from "@/lib/origins";

function currentAppReturnPath(pathname: string, search: string): string {
  const full = `${pathname}${search || ""}`;
  return safeAuthNext(full, "/");
}

/** Absolute SPA URL to reopen after marketing login (cross-origin handoff). */
function currentAppReturnUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildLoggedOutLoginHref(pathname: string, search = ""): string {
  const next = currentAppReturnPath(pathname, search);
  const appReturn = currentAppReturnUrl(next);
  const params = new URLSearchParams();
  params.set("next", next);
  params.set("appReturn", appReturn);
  return marketingHref(
    withAuthColorSchemeQuery(`/login?${params.toString()}`, getLiveColorScheme()),
  );
}

/** No session on the SPA — send people to marketing login, then back here. */
export function LoggedOutShell() {
  const location = useLocation();
  const loginHref = buildLoggedOutLoginHref(
    location.pathname,
    location.search,
  );
  const marketingHost = getMarketingOrigin().replace(/^https?:\/\//, "");
  // Native can't complete the marketing → app handoff yet; stay in the app.
  const native = isNativeApp();

  useEffect(() => {
    if (native) return;
    window.location.replace(loginHref);
  }, [loginHref, native]);

  return (
    <main className="native-safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-3xl tracking-tight">{brand.name}</h1>
      <p className="text-sm text-muted">
        {native
          ? "Signing in from the app is coming soon."
          : `Taking you to sign in on ${marketingHost}…`}
      </p>
      <a
        href={loginHref}
        className="text-sm font-medium text-accent-link underline-offset-2 hover:underline"
      >
        Continue →
      </a>
      {native && NATIVE_DEV_TOOLS_ENABLED ? (
        <Link to="/dev/audio" className="text-sm text-muted underline-offset-2 hover:underline">
          Audio test
        </Link>
      ) : null}
    </main>
  );
}
