"use client";

import { type ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppPrimaryTabsProvider } from "@/components/app-primary-tabs";
import { MainShell } from "@/components/main-shell";
import { SiteHeader } from "@/components/site-header";
import { ScrollToTopOnNavigate } from "@/components/scroll-to-top-on-navigate";
import {
  SignInPromptOverlay,
  useSignInPromptQuery,
} from "@/components/sign-in-prompt-overlay";
import {
  isProtectedAppPath,
  isPublicAuthPath,
  marketingSignInUrl,
  rememberAuthNext,
} from "@/lib/app-routes";
import {
  clearHasSessionHintCookieIfPresent,
  ensureHasSessionHintCookie,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import {
  exitMarketingPreviewMode,
  isMarketingPreviewMode,
} from "@/lib/marketing-preview";

/** Real access JWT required — not sticky ACTIVE_KEY alone. */
function hasAppSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

function SignInOverlayHost() {
  const { wantsSignIn, nextPath, clearSignInQuery } = useSignInPromptQuery();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(wantsSignIn);
  }, [wantsSignIn]);

  return (
    <SignInPromptOverlay
      open={open}
      nextPath={nextPath}
      onDismiss={() => {
        setOpen(false);
        clearSignInQuery();
      }}
    />
  );
}

type Props = {
  children: ReactNode;
  /** Kept for AppChromeHost API; marketing always uses SiteHeader now. */
  initialHasSessionHint: boolean;
};

/**
 * Marketing Next shell — always SiteHeader.
 * Logged-in users browse marketing freely; enter the SPA via “Go to dashboard”.
 * Deep app URLs still soft-redirect via SpaRedirect layouts.
 */
export function AppChrome({ children, initialHasSessionHint: _hint }: Props) {
  void _hint;
  const pathname = usePathname() || "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signedIn, setSignedIn] = useState(false);
  const [marketingPreview, setMarketingPreview] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nextSignedIn = hasAppSession();
      setSignedIn(nextSignedIn);
      setMarketingPreview(isMarketingPreviewMode());
      if (nextSignedIn) ensureHasSessionHintCookie();
      else clearHasSessionHintCookieIfPresent();
      setReady(true);
    };
    void import("@/lib/auth-session").then((m) =>
      m.ensureMedimadeSession().finally(sync),
    );
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  // Hitting a protected app URL while in marketing preview → leave preview.
  useEffect(() => {
    if (!ready || !signedIn || !marketingPreview) return;
    if (!isProtectedAppPath(pathname) || isPublicAuthPath(pathname)) return;
    exitMarketingPreviewMode();
  }, [ready, signedIn, marketingPreview, pathname]);

  // Gate protected app routes when logged out (no JWT).
  useEffect(() => {
    if (!ready || signedIn) return;
    if (isPublicAuthPath(pathname)) return;
    if (!isProtectedAppPath(pathname)) return;
    const search = searchParams?.toString()
      ? `?${searchParams.toString()}`
      : "";
    const full = `${pathname}${search}`;
    rememberAuthNext(full);
    router.replace(marketingSignInUrl(pathname, search));
  }, [ready, signedIn, pathname, searchParams, router]);

  const gateProtected =
    isProtectedAppPath(pathname) && !isPublicAuthPath(pathname);
  const redirectingAwayProtected = Boolean(
    ready && gateProtected && !signedIn,
  );

  const body: ReactNode = redirectingAwayProtected ? (
    <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
      Redirecting…
    </div>
  ) : (
    children
  );

  return (
    <AppPrimaryTabsProvider>
      <ScrollToTopOnNavigate />
      <SiteHeader />
      <MainShell>{body}</MainShell>
      <Suspense fallback={null}>
        <SignInOverlayHost />
      </Suspense>
    </AppPrimaryTabsProvider>
  );
}
