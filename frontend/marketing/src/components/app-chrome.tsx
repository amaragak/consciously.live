"use client";

import { type ReactNode, Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopBar } from "@/components/app-top-bar";
import { AppPrimaryTabsProvider } from "@/components/app-primary-tabs";
import { AssistantChatFab } from "@/components/assistant-chat-fab";
import { MainShell } from "@/components/main-shell";
import { SiteHeader } from "@/components/site-header";
import {
  SignInPromptOverlay,
  useSignInPromptQuery,
} from "@/components/sign-in-prompt-overlay";
import {
  isProtectedAppPath,
  isPublicAuthPath,
  marketingSignInUrl,
  rememberAuthNext,
  signedInDestinationForMarketingRoot,
} from "@/lib/app-routes";
import { navigateAuthDestination } from "@/lib/spa-handoff";
import {
  appSidebarWidthPx,
  loadAppSidebarCollapsed,
  saveAppSidebarCollapsed,
} from "@/lib/app-nav";
import {
  ensureHasSessionHintCookie,
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import {
  exitMarketingPreviewMode,
  isMarketingPreviewMode,
} from "@/lib/marketing-preview";

/** Sidebar / app shell needs a real access JWT, not sticky ACTIVE_KEY alone. */
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
  /** From same-origin `mm_has_session` cookie — SSR + first client paint must match. */
  initialHasSessionHint: boolean;
};

/**
 * Single shell from the server hint; `ensureMedimadeSession` may correct after mount.
 */
export function AppChrome({ children, initialHasSessionHint }: Props) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signedIn, setSignedIn] = useState(initialHasSessionHint);
  const [marketingPreview, setMarketingPreview] = useState(false);
  const [ready, setReady] = useState(false);
  const [accountLabel, setAccountLabel] = useState("Guest");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nextSignedIn = hasAppSession();
      const nextPreview = isMarketingPreviewMode();
      setSignedIn(nextSignedIn);
      setMarketingPreview(nextPreview);
      setAccountLabel(
        getMedimadeSessionDisplayName()?.trim() ||
          getMedimadeSessionEmail()?.trim() ||
          "Guest",
      );
      setSidebarCollapsed(loadAppSidebarCollapsed());
      // Keep SSR hint fresh for returning users (cookie may be missing before this deploy).
      if (nextSignedIn) ensureHasSessionHintCookie();
      setReady(true);
    };
    void import("@/lib/auth-session").then((m) =>
      m.ensureMedimadeSession().finally(sync),
    );
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  useEffect(() => {
    setSidebarCollapsed(loadAppSidebarCollapsed());
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [signedIn, marketingPreview, pathname]);

  // Before ready: match SSR hint. After: real session (marketing preview → nav chrome).
  // Public Community browse/detail + unlisted share listen pages are marketing
  // SSR surfaces (SiteHeader), not the signed-in Meditate library (SPA sidebar).
  const forceMarketingChrome =
    pathname === "/library" ||
    pathname.startsWith("/library/") ||
    pathname === "/listen" ||
    pathname.startsWith("/listen/");
  const showAppChrome = forceMarketingChrome
    ? false
    : ready
      ? signedIn && !marketingPreview
      : initialHasSessionHint;

  useEffect(() => {
    if (!showAppChrome) {
      document.documentElement.style.removeProperty("--app-sidebar-w");
      return;
    }
    document.documentElement.style.setProperty(
      "--app-sidebar-w",
      `${appSidebarWidthPx(sidebarCollapsed)}px`,
    );
    return () => {
      document.documentElement.style.removeProperty("--app-sidebar-w");
    };
  }, [showAppChrome, sidebarCollapsed]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      saveAppSidebarCollapsed(next);
      return next;
    });
  }, []);

  // Hitting a protected app URL while in marketing preview → open the app.
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

  // Marketing section roots → app destinations when signed in (not in preview).
  // Absolute URLs (SPA subdomain) use hard navigation with session handoff.
  useEffect(() => {
    if (!ready || !showAppChrome) return;
    const dest = signedInDestinationForMarketingRoot(pathname);
    if (!dest) return;
    if (/^https?:\/\//i.test(dest)) {
      void navigateAuthDestination(dest);
      return;
    }
    router.replace(dest);
  }, [ready, showAppChrome, pathname, router]);

  const gateProtected =
    isProtectedAppPath(pathname) && !isPublicAuthPath(pathname);
  const bounceToApp = Boolean(
    showAppChrome && signedInDestinationForMarketingRoot(pathname),
  );
  const redirectingAwayProtected = Boolean(
    ready && gateProtected && !signedIn,
  );

  let body: ReactNode = children;
  if (redirectingAwayProtected || bounceToApp) {
    body = (
      <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
        Redirecting…
      </div>
    );
  }

  return (
    <AppPrimaryTabsProvider>
      {showAppChrome ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <AppTopBar
            mobileSidebarOpen={mobileOpen}
            onToggleSidebar={() => setMobileOpen((v) => !v)}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="flex min-h-0 flex-1">
            <div
              className="hidden shrink-0 md:block"
              style={{ width: "var(--app-sidebar-w, 200px)" }}
              aria-hidden
            />
            <AppSidebar
              accountLabel={accountLabel}
              mobileOpen={mobileOpen}
              onCloseMobile={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              collapsed={sidebarCollapsed}
              onToggleCollapsed={toggleSidebarCollapsed}
            />
            <MainShell layout="app">{body}</MainShell>
          </div>
          <AssistantChatFab />
        </div>
      ) : (
        <>
          <SiteHeader />
          <MainShell>{body}</MainShell>
          <Suspense fallback={null}>
            <SignInOverlayHost />
          </Suspense>
        </>
      )}
    </AppPrimaryTabsProvider>
  );
}
