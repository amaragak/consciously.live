"use client";

import { ColorSchemePicker } from "@consciously/common";
import { Settings, Shield } from "lucide-react";
import { Link, usePathname } from "@/lib/spa-nav";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo-mark";
import {
  AppPrimaryTabsSlot,
  AppTopBarTrailingSlot,
} from "@/components/app-primary-tabs";
import { AppGlobalSearch } from "@/components/app-global-search";
import { AppNotificationsBell } from "@/components/app-notifications-bell";
import { AlphaChromeButton } from "@/components/dev-chrome-button";
import {
  AppBreadcrumb,
  AppBreadcrumbBack,
} from "@/components/app-breadcrumb";
import {
  resolveAppHeaderLocation,
  APP_SIDEBAR_ICON_INSET_PX,
  isOwnerAdminAccount,
  type AppHeaderLocation,
} from "@/lib/app-nav";
import { ASSISTANT_CHAT_STORE_CHANGED } from "@/lib/assistant-chat-storage";
import { appHref, isCrossOriginApp } from "@/lib/app-origins";
import {
  clearMedimadeSession,
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
} from "@/lib/auth-session";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import {
  CREATE_SESSION_CHANGED_EVENT,
  readCreateSession,
} from "@/lib/create-session-storage";
import { parseCreateMeditationPathname } from "@/lib/create-meditation-path";
import {
  deriveEntryTitle,
  formatJournalEntryDate,
  loadJournalStoreRaw,
  localDateKey,
  localDateKeyFromIso,
  subscribeJournalStore,
} from "@/lib/journal-storage";
import {
  getJournalEntryLiveTitle,
  subscribeJournalEntryLiveTitle,
} from "@/lib/journal-entry-live-title";

function accountLabelFromSession(): string {
  return (
    getMedimadeSessionDisplayName()?.trim() ||
    getMedimadeSessionEmail()?.trim() ||
    "Guest"
  );
}

function AccountMenu({ accountLabel }: { accountLabel: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = (accountLabel.trim()[0] || "G").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${accountLabel}`}
        title={accountLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gold text-xs font-semibold text-on-accent transition-opacity hover:opacity-90"
      >
        {initial}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-[140] mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card py-1.5 text-foreground shadow-[0_8px_24px_color-mix(in_srgb,var(--overlay)_16%,transparent)]"
        >
          <p className="truncate px-4 py-2.5 text-sm text-muted">
            Signed in as{" "}
            <span className="font-medium text-foreground">{accountLabel}</span>
          </p>
          <div className="my-1 border-t border-border-subtle" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              clearMedimadeSession();
            }}
            className="block w-full cursor-pointer px-4 py-2 text-left text-sm text-muted transition-colors hover:bg-nav-active hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function lifeAreaTitleFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/(?:manifest|ideate|dream|plan)\/goal\/([^/?#]+)/);
  if (!m?.[1]) return null;
  try {
    const id = decodeURIComponent(m[1]);
    const dream = loadIdeateStore().dreams.find((d) => d.id === id);
    return dream?.title?.trim() || null;
  } catch {
    return null;
  }
}

function createMeditationStyleFromSession(pathname: string): string | null {
  const s = readCreateSession();
  if (!s) return null;
  // Random solidifies style only at generate — never show a pre-picked type in chrome.
  if (s.randomScript === true) return null;
  const style = s.meditationStyle?.trim();
  if (style) return style;
  // Only fall back to the pending pick once we've left the type picker URL,
  // so selecting a card doesn't prematurely rename the current crumb.
  const parsed = pathname.startsWith("/meditate/create")
    ? parseCreateMeditationPathname(pathname)
    : null;
  if (
    parsed?.path === "style" &&
    (parsed.styleStep === "questions" || parsed.mix)
  ) {
    return s.pendingStyleType?.trim() || null;
  }
  return null;
}

function createProgramTitleFromSession(pathname: string): string | null {
  const parsed = pathname.startsWith("/meditate/create")
    ? parseCreateMeditationPathname(pathname)
    : null;
  if (parsed?.path !== "fromProgram") return null;
  if (
    parsed.fromProgramStep !== "chat" &&
    parsed.fromProgramStep !== "sessions" &&
    !parsed.mix
  ) {
    return null;
  }
  const title = readCreateSession()?.programSelectedTitle?.trim();
  return title || null;
}

function journalEntryTitleFromPath(pathname: string): string | null {
  if (
    pathname === "/journal/my" ||
    pathname === "/journal/my/" ||
    pathname.startsWith("/journal/my/gratitudes") ||
    pathname.startsWith("/journal/my/insights")
  ) {
    return null;
  }
  const m = /^\/journal\/my\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    id = m[1];
  }
  try {
    const live = getJournalEntryLiveTitle(id);
    if (live != null) {
      const t = live.trim();
      return t || "Untitled entry";
    }
    const entry = loadJournalStoreRaw().entries.find((e) => e.id === id);
    if (!entry) return "Entry";
    return entry.title.trim() || deriveEntryTitle(entry.contentHtml);
  } catch {
    return "Entry";
  }
}

function gratitudeEntryLabelFromPath(pathname: string): string | null {
  const m = /^\/journal\/my\/gratitudes\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    id = m[1];
  }
  try {
    const entry = loadJournalStoreRaw().entries.find((e) => e.id === id);
    if (!entry) return "Gratitude";
    if (localDateKeyFromIso(entry.createdAt) === localDateKey()) {
      return "Today";
    }
    return formatJournalEntryDate(entry.createdAt);
  } catch {
    return "Gratitude";
  }
}

function BrandPhrase({
  verb,
  size,
  className,
}: {
  verb: string;
  size: "desktop" | "mobile";
  className?: string;
}) {
  const markSize = size === "desktop" ? 28 : 22;
  const textPx = size === "desktop" ? 22 : 19;
  return (
    <span
      className={`inline-flex shrink-0 items-baseline ${className ?? ""}`}
    >
      <Link
        href="/"
        title="consciously"
        aria-label="consciously home"
        className="inline-flex items-baseline"
      >
        <LogoMark
          size={markSize}
          className="app-header-brand-sun relative top-[0.12em] mr-2 shrink-0 self-center"
        />
        <span
          className="brand-wordmark relative shrink-0 font-display font-normal lowercase tracking-tight text-nav-foreground"
          style={{ fontSize: textPx }}
        >
          consciously
        </span>
      </Link>
      {verb ? (
        <span
          className="app-header-section-verb relative ml-[7px] shrink-0 font-display font-normal italic tracking-tight"
          style={{ fontSize: textPx }}
        >
          {verb}
        </span>
      ) : null}
    </span>
  );
}

const EMPTY_LOCATION: AppHeaderLocation = {
  verb: "",
  href: "/",
  trail: [],
};

export function AppTopBar({
  mobileSidebarOpen = false,
  onToggleSidebar,
}: {
  mobileSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** @deprecated Header phrase no longer depends on sidebar rail width. */
  sidebarCollapsed?: boolean;
}) {
  const pathname = usePathname() || "/";
  const [location, setLocation] = useState<AppHeaderLocation>(EMPTY_LOCATION);
  const [accountLabel, setAccountLabel] = useState(accountLabelFromSession);
  const [showAdmin, setShowAdmin] = useState(() =>
    isOwnerAdminAccount(getMedimadeSessionEmail()),
  );
  const headerRef = useRef<HTMLElement | null>(null);
  const leftClusterRef = useRef<HTMLDivElement | null>(null);
  const phraseRef = useRef<HTMLDivElement | null>(null);
  const tabsSlotRef = useRef<HTMLDivElement | null>(null);
  const [leftMaxPx, setLeftMaxPx] = useState<number | undefined>(undefined);

  useEffect(() => {
    const sync = () => {
      setAccountLabel(accountLabelFromSession());
      setShowAdmin(isOwnerAdminAccount(getMedimadeSessionEmail()));
    };
    sync();
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  useLayoutEffect(() => {
    const rebuild = () => {
      // Defer so journal (or other) store writes never setState into TopBar mid-render.
      queueMicrotask(() => {
        setLocation(
          resolveAppHeaderLocation(pathname, {
            lifeAreaTitle: lifeAreaTitleFromPath(pathname),
            createMeditationStyle: createMeditationStyleFromSession(pathname),
            createProgramTitle: createProgramTitleFromSession(pathname),
            createRandomScript: Boolean(readCreateSession()?.randomScript),
            journalEntryTitle: journalEntryTitleFromPath(pathname),
            gratitudeEntryLabel: gratitudeEntryLabelFromPath(pathname),
            hash: typeof window !== "undefined" ? window.location.hash : "",
            search: typeof window !== "undefined" ? window.location.search : "",
          }),
        );
      });
    };
    rebuild();
    const unsubIdeate = subscribeIdeateCloud(rebuild);
    const unsubJournal = subscribeJournalStore(rebuild);
    const unsubLiveTitle = subscribeJournalEntryLiveTitle(rebuild);
    window.addEventListener("storage", rebuild);
    window.addEventListener(CREATE_SESSION_CHANGED_EVENT, rebuild);
    window.addEventListener(ASSISTANT_CHAT_STORE_CHANGED, rebuild);
    return () => {
      unsubIdeate();
      unsubJournal();
      unsubLiveTitle();
      window.removeEventListener("storage", rebuild);
      window.removeEventListener(CREATE_SESSION_CHANGED_EVENT, rebuild);
      window.removeEventListener(ASSISTANT_CHAT_STORE_CHANGED, rebuild);
    };
  }, [pathname]);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => {
      const headerRect = header.getBoundingClientRect();
      // Measure the actual tab strip, not the full-bleed centering wrapper
      // (that wrapper is inset-0 so its left edge is always 0 — which was
      // clamping the phrase to ~120px and clipping "consciously").
      const strip = tabsSlotRef.current;
      const stripRect = strip?.getBoundingClientRect();
      const hasTabs = Boolean(stripRect && stripRect.width > 1);
      const phraseW = phraseRef.current?.getBoundingClientRect().width ?? 280;
      // Phrase must always fit; trail collapses inside whatever remains.
      const floor = Math.ceil(phraseW) + (location.trail.length > 0 ? 48 : 0);
      if (!hasTabs || !stripRect) {
        setLeftMaxPx(undefined);
        return;
      }
      const toTabs = Math.floor(stripRect.left - headerRect.left - 24);
      setLeftMaxPx(Math.max(floor, toTabs));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    if (tabsSlotRef.current) ro.observe(tabsSlotRef.current);
    if (phraseRef.current) ro.observe(phraseRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [location.trail.length, location.verb, pathname]);

  const trail = location.trail;
  const parentCrumb =
    trail.length >= 2
      ? trail[trail.length - 2]!
      : trail.length === 1
        ? { label: location.verb, href: location.href }
        : null;

  return (
    <header
      ref={headerRef}
      className="relative sticky top-0 z-[130] flex h-14 w-full shrink-0 items-center border-b border-[color:var(--header-border)] bg-nav text-nav-foreground shadow-[var(--header-shadow)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {/* Desktop sun center: icon inset + half of 28px LogoMark. */}
        <span
          className="app-header-sun-glow absolute top-1/2 hidden h-32 w-64 -translate-x-1/2 -translate-y-1/2 blur-md md:block"
          style={{ left: APP_SIDEBAR_ICON_INSET_PX + 14 }}
        />
      </div>
      {/* Desktop: brand phrase + optional trail. Keep clear of centre tabs. */}
      <div
        ref={leftClusterRef}
        className="pointer-events-none relative z-10 hidden items-center overflow-hidden pr-2 md:flex"
        style={{
          paddingLeft: APP_SIDEBAR_ICON_INSET_PX,
          ...(leftMaxPx != null ? { maxWidth: leftMaxPx } : {}),
        }}
      >
        <div className="pointer-events-auto flex max-w-full items-center">
          <div ref={phraseRef} className="shrink-0">
            <BrandPhrase
              verb={location.verb}
              size="desktop"
            />
          </div>
          {trail.length > 0 ? (
            <>
              <span
                className="app-header-crumb-divider mx-[14px] inline-block h-[18px] w-px shrink-0 self-center"
                aria-hidden
              />
              <AppBreadcrumb crumbs={trail} className="min-w-0 flex-1" />
            </>
          ) : null}
        </div>
      </div>

      {/* Mobile: back link on the left when deeper than a sidebar item. */}
      <div className="relative z-10 flex min-w-0 flex-1 items-center px-3 md:hidden">
        {trail.length > 0 && parentCrumb ? (
          <AppBreadcrumbBack parent={parentCrumb} />
        ) : null}
      </div>

      {/* Spacer so absolute centre/right chrome doesn't collide on desktop. */}
      <div className="hidden min-w-0 flex-1 md:block" aria-hidden />

      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 sm:right-4">
        {/* Mobile brand phrase sits to the left of the icon cluster. */}
        <BrandPhrase
          verb={location.verb}
          size="mobile"
          className="md:hidden"
        />
        <AppTopBarTrailingSlot className="flex max-w-[min(100vw-11rem,28rem)] items-center justify-end overflow-x-auto" />
        <div className="hidden md:contents">
          {isCrossOriginApp() ? (
            <AlphaChromeButton
              title="Open the logged-in SPA (Focus and migrated sections)"
              onClick={() => {
                window.location.assign(appHref("/"));
              }}
            >
              Open app
            </AlphaChromeButton>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5 md:gap-2">
          <AppGlobalSearch />
          <ColorSchemePicker variant="header" />
          <Link
            href="/settings/account"
            aria-label="Settings"
            aria-current={
              pathname.startsWith("/settings") ? "page" : undefined
            }
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              pathname.startsWith("/settings")
                ? "bg-nav-active text-nav-foreground"
                : "text-nav-muted hover:bg-nav-active hover:text-nav-foreground"
            }`}
          >
            <Settings aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </Link>
          {showAdmin ? (
            <Link
              href="/admin"
              aria-label="Admin"
              aria-current={
                pathname.startsWith("/admin") ? "page" : undefined
              }
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-nav-active text-nav-foreground"
                  : "text-nav-muted hover:bg-nav-active hover:text-nav-foreground"
              }`}
            >
              <Shield aria-hidden className="size-[18px]" strokeWidth={1.75} />
            </Link>
          ) : null}
          <span className="relative translate-x-[5px] md:translate-x-0">
            <AppNotificationsBell />
          </span>
          {onToggleSidebar ? (
            <button
              type="button"
              aria-label={mobileSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileSidebarOpen}
              onClick={onToggleSidebar}
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-nav-foreground md:hidden"
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
                {mobileSidebarOpen ? (
                  <>
                    <path d="M6 6l12 12" />
                    <path d="M18 6L6 18" />
                  </>
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          ) : null}
          <AccountMenu accountLabel={accountLabel} />
        </div>
      </div>

      {/* True viewport centre (full header width), not content-area centre. */}
      <div className="pointer-events-none absolute inset-0 z-[15] hidden items-center justify-center md:flex">
        <AppPrimaryTabsSlot
          ref={tabsSlotRef}
          className="pointer-events-auto flex max-w-[min(100%,48rem)] items-center justify-center overflow-x-auto"
        />
      </div>
    </header>
  );
}
