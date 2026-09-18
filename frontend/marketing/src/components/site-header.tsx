"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo-mark";
import { AlphaChromeButton } from "@/components/dev-chrome-button";
import {
  clearMedimadeSession,
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
  loginAsMedimadeGuest,
} from "@/lib/medimade-api";
import {
  COLOR_SCHEME_CHANGED_EVENT,
  applyColorScheme,
  getStoredColorScheme,
  toggleColorScheme,
  type ColorScheme,
} from "@/lib/color-scheme";
import {
  exitMarketingPreviewMode,
  isMarketingPreviewMode,
} from "@/lib/marketing-preview";
import { markSpaClientNavigation } from "@/lib/spa-client-nav";
import { navigateToSpa } from "@/lib/spa-handoff";

/** Marketing / logged-out top nav — section roots only (no app flyouts). */
const marketingNav: { href: string; label: string }[] = [
  { href: "/meditate", label: "Meditate" },
  { href: "/journal", label: "Journal" },
  { href: "/manifest", label: "Manifest" },
  { href: "/focus", label: "Focus" },
  { href: "/chat", label: "Chat" },
  { href: "/pricing", label: "Pricing" },
  { href: "/admin", label: "Admin" },
  { href: "/settings", label: "API" },
];

function sectionActive(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function ColorSchemeToggle({ className = "" }: { className?: string }) {
  const [scheme, setScheme] = useState<ColorScheme>("light");

  useEffect(() => {
    applyColorScheme(getStoredColorScheme());
    const sync = () => setScheme(getStoredColorScheme());
    sync();
    window.addEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
  }, []);

  const isDark = scheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setScheme(toggleColorScheme())}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-marketing-nav-chrome text-nav-muted transition-[background-color,color,border-color] duration-150 ease-out hover:bg-nav-active hover:text-nav-foreground ${className}`}
    >
      {isDark ? (
        <Sun aria-hidden className="size-4" strokeWidth={2} />
      ) : (
        <Moon aria-hidden className="size-4" strokeWidth={2} />
      )}
    </button>
  );
}

function AccountMenu({
  label,
  onSignOut,
}: {
  label: string;
  onSignOut: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = detailsRef.current;
      if (!el?.open) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        el.open = false;
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label="Account menu"
        title={label}
        className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-marketing-nav-chrome text-nav-muted transition-[background-color,color,border-color] duration-150 ease-out hover:bg-nav-active hover:text-nav-foreground [&::-webkit-details-marker]:hidden"
      >
        <User aria-hidden className="size-4" strokeWidth={2} />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card py-2 shadow-lg">
        <p
          className="truncate px-4 py-2 text-sm font-medium text-foreground"
          title={label}
        >
          {label}
        </p>
        <div className="my-1 border-t border-border" role="separator" />
        <button
          type="button"
          onClick={() => {
            if (detailsRef.current) detailsRef.current.open = false;
            onSignOut();
          }}
          className="block w-full px-4 py-2 text-left text-sm text-muted transition-colors hover:bg-accent-soft/50 hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </details>
  );
}

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const prevPathnameRef = useRef(pathname);
  const mobileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [marketingPreview, setMarketingPreview] = useState(false);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      markSpaClientNavigation();
      prevPathnameRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const sync = () => {
      const jwt = Boolean(getMedimadeSessionJwt());
      setHasSession(isMedimadeSessionActive() && jwt);
      setMarketingPreview(isMarketingPreviewMode());
      const email = getMedimadeSessionEmail();
      setSessionLabel(
        getMedimadeSessionDisplayName()?.trim() || email || null,
      );
    };
    void import("@/lib/auth-session").then((m) =>
      m.ensureMedimadeSession().finally(sync),
    );
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  const closeMobile = () => {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false;
  };

  /** Always performs a fresh guest login (JWT in localStorage — cookies optional). */
  async function previewAsGuest() {
    setGuestBusy(true);
    setGuestError(null);
    try {
      await loginAsMedimadeGuest();
      exitMarketingPreviewMode();
      const ok = await navigateToSpa("/");
      if (!ok) {
        // Handoff unavailable — stay on marketing signed in.
        window.location.assign("/");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Guest login failed";
      console.error("[preview-as-guest]", err);
      setGuestError(msg);
      setGuestBusy(false);
    }
  }

  async function goToDashboard() {
    setDashboardBusy(true);
    setDashboardError(null);
    try {
      exitMarketingPreviewMode();
      const ok = await navigateToSpa("/");
      if (!ok) {
        setDashboardError(
          "Couldn’t open the app (session handoff unavailable).",
        );
        setDashboardBusy(false);
      }
    } catch (err) {
      setDashboardError(
        err instanceof Error ? err.message : "Couldn’t open the app",
      );
      setDashboardBusy(false);
    }
  }

  // Marketing chrome: never show real Sign out while previewing (session kept).
  const showSignedInChrome = hasSession && !marketingPreview;

  return (
    <header className="site-header relative sticky top-0 z-[100] border-b border-[color:var(--header-border)] bg-nav shadow-[var(--header-shadow)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="relative mx-auto h-full max-w-6xl px-4 sm:px-6">
          <span className="site-header-glow-sun absolute left-[17px] top-[calc(50%+1px)] h-36 w-72 -translate-x-1/2 -translate-y-1/2 blur-lg" />
        </div>
        <span className="site-header-glow-right absolute right-0 top-1/2 h-40 w-[22rem] translate-x-[42%] -translate-y-1/2 blur-xl" />
      </div>
      <div className="relative grid h-14 w-full grid-cols-[minmax(0,1fr)_minmax(0,72rem)_minmax(0,1fr)] items-center">
        <div aria-hidden className="min-w-0" />
        <div className="flex min-w-0 items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="relative inline-flex shrink-0 items-center">
            <LogoMark
              size={34}
              className="relative z-[1] top-px mr-[13px] shrink-0 text-accent-button"
            />
            <span className="brand-wordmark relative z-[1] -top-px font-display text-2xl font-medium tracking-tight lowercase">
              consciously
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {marketingNav.map((item) => {
              const active =
                item.href === "/manifest"
                  ? sectionActive(pathname, "/manifest") ||
                    sectionActive(pathname, "/ideate") ||
                    sectionActive(pathname, "/dream") ||
                    sectionActive(pathname, "/plan")
                  : sectionActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm transition-colors hover:bg-nav-active hover:text-nav-foreground ${
                    active
                      ? "bg-nav-active font-semibold text-nav-foreground"
                      : "text-nav-muted"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <ColorSchemeToggle className="ml-1" />
            {showSignedInChrome ? (
              <div className="ml-1 flex items-center gap-2">
                <button
                  type="button"
                  disabled={dashboardBusy}
                  onClick={() => void goToDashboard()}
                  className="rounded-lg accent-fill-gradient px-3 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {dashboardBusy ? "Opening…" : "Dashboard"}
                </button>
                <AccountMenu
                  label={sessionLabel ?? "Signed in"}
                  onSignOut={() => clearMedimadeSession()}
                />
              </div>
            ) : (
              <Link
                href="/login"
                className="ml-1 rounded-lg border border-marketing-nav-chrome px-3 py-2 text-sm font-medium text-nav-foreground transition-[background-color,color,border-color] duration-150 ease-out hover:bg-nav-active"
              >
                Sign in
              </Link>
            )}
            {dashboardError ? (
              <p
                className="ml-2 max-w-[12rem] text-xs text-danger"
                role="alert"
              >
                {dashboardError}
              </p>
            ) : null}
          </nav>
          <div className="flex items-center gap-2 sm:hidden">
            {!showSignedInChrome ? (
              <AlphaChromeButton
                disabled={guestBusy}
                title="Alpha — signs in as the shared guest account"
                onClick={() => void previewAsGuest()}
              >
                {guestBusy ? "…" : "Guest"}
              </AlphaChromeButton>
            ) : null}
            <ColorSchemeToggle />
            <details ref={mobileMenuRef} className="relative">
              <summary
                aria-label="Menu"
                className="cursor-pointer list-none rounded-lg border border-marketing-nav-chrome p-2 text-sm text-nav-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </summary>
              <div className="absolute right-0 mt-2 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-border bg-card py-2 shadow-lg">
                {marketingNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile}
                    className={`block px-4 py-2 text-sm hover:bg-accent-soft/50 ${
                      sectionActive(pathname, item.href)
                        ? "font-semibold text-foreground"
                        : "text-muted"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="my-2 border-t border-border" role="separator" />
                {!showSignedInChrome ? (
                  <button
                    type="button"
                    disabled={guestBusy}
                    onClick={() => {
                      void previewAsGuest();
                      closeMobile();
                    }}
                    className="block w-full px-4 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-[#86198e] hover:bg-accent-soft/50"
                  >
                    Preview app as guest →
                  </button>
                ) : null}
                {showSignedInChrome ? (
                  <>
                    <button
                      type="button"
                      disabled={dashboardBusy}
                      onClick={() => {
                        void goToDashboard();
                        closeMobile();
                      }}
                      className="block w-full px-4 py-2 text-left text-sm font-semibold text-foreground hover:bg-accent-soft/50"
                    >
                      {dashboardBusy ? "Opening…" : "Dashboard"}
                    </button>
                    <p
                      className="truncate px-4 py-2 text-sm font-medium text-foreground"
                      title={sessionLabel ?? ""}
                    >
                      {sessionLabel ?? "Signed in"}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        clearMedimadeSession();
                        closeMobile();
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-muted hover:bg-accent-soft/50"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    onClick={closeMobile}
                    className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent-soft/50"
                  >
                    Sign in
                  </Link>
                )}
                {dashboardError ? (
                  <p className="px-4 py-2 text-xs text-danger" role="alert">
                    {dashboardError}
                  </p>
                ) : null}              </div>
            </details>
          </div>
        </div>
        <div className="relative flex min-w-0 items-center justify-end pr-4 sm:pr-6">
          {!showSignedInChrome ? (
            <div className="hidden flex-col items-end gap-1 sm:flex">
              <AlphaChromeButton
                className="shrink-0"
                disabled={guestBusy}
                title="Alpha — signs in as the shared guest account"
                onClick={() => void previewAsGuest()}
              >
                {guestBusy ? "Starting…" : "Preview app as guest"}
              </AlphaChromeButton>
              {guestError ? (
                <p
                  className="max-w-[14rem] text-right font-mono text-[10px] leading-snug text-danger"
                  role="alert"
                >
                  {guestError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
