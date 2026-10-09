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
        className="header-gold-sunlit-fill flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-on-accent transition-opacity hover:opacity-90"
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
  showWordmark = true,
  /** Reveal wordmark/verb from `md` (compact header between md–lg). */
  wordmarkFromMd = false,
}: {
  verb: string;
  size: "desktop" | "mobile";
  className?: string;
  /** When false, only the sun mark (narrow phones). */
  showWordmark?: boolean;
  wordmarkFromMd?: boolean;
}) {
  const markSize = size === "desktop" ? 28 : 22;
  const textPx = size === "desktop" ? 22 : 19;
  const wordmarkReveal = wordmarkFromMd ? " hidden md:inline" : "";
  const showMarkGap = showWordmark && !wordmarkFromMd;
  return (
    <span
      className={`relative top-[2px] inline-flex shrink-0 items-center ${className ?? ""}`}
    >
      <Link
        href="/"
        title="consciously"
        aria-label="consciously home"
        className="inline-flex items-center"
      >
        <LogoMark
          size={markSize}
          className={`app-header-brand-sun relative top-[2px] block shrink-0${
            showMarkGap ? " mr-2" : wordmarkFromMd ? " md:mr-2" : ""
          }`}
        />
        {showWordmark ? (
          <span
            className={`brand-wordmark shrink-0 font-display font-normal lowercase leading-none tracking-tight text-nav-foreground${wordmarkReveal}`}
            style={{ fontSize: textPx }}
          >
            consciously
          </span>
        ) : null}
      </Link>
      {verb ? (
        <span
          className={`app-header-section-verb ml-[7px] shrink-0 font-display font-normal italic leading-none tracking-tight${wordmarkReveal}`}
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
  const phraseDesktopRef = useRef<HTMLDivElement | null>(null);
  const phraseCompactRef = useRef<HTMLDivElement | null>(null);
  const tabsSlotRef = useRef<HTMLDivElement | null>(null);
  const [leftMaxPx, setLeftMaxPx] = useState<number | undefined>(undefined);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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
      // lg+: true-centre tabs; clamp desktop left so the trail stays clear.
      // md–lg uses in-flow flex (left | flex-1 middle | right) — no measure.
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        setLeftMaxPx(undefined);
        return;
      }
      const headerRect = header.getBoundingClientRect();
      const strip = tabsSlotRef.current;
      const stripRect = strip?.getBoundingClientRect();
      const hasTabs = Boolean(stripRect && stripRect.width > 1);
      const phraseW = Math.max(
        phraseDesktopRef.current?.getBoundingClientRect().width ?? 0,
        120,
      );
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
    if (phraseDesktopRef.current) ro.observe(phraseDesktopRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [location.trail.length, location.verb, pathname]);

  const trail = location.trail;
  /**
   * Mobile: no italic section verb in the brand phrase — that width is for the
   * trail. Mirror desktop’s post-divider crumbs; only surface the section name
   * when there is no deeper trail (e.g. Focus home).
   */
  const mobileCrumbs =
    trail.length > 0
      ? trail
      : location.verb
        ? [{ label: location.verb, href: null as string | null }]
        : [];

  return (
    <header
      ref={headerRef}
      className="relative sticky top-0 z-[130] flex h-14 w-full shrink-0 items-center overflow-x-hidden border-b border-[color:var(--header-border)] bg-nav text-nav-foreground shadow-[var(--header-shadow)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {/* Desktop sun center: icon inset + half of 28px LogoMark. */}
        <span
          className="app-header-sun-glow absolute top-1/2 hidden h-32 w-64 -translate-x-1/2 -translate-y-1/2 blur-md lg:block"
          style={{ left: APP_SIDEBAR_ICON_INSET_PX + 14 }}
        />
      </div>
      {/* Desktop (lg+): brand phrase + optional trail. Keep clear of centre tabs. */}
      <div
        ref={leftClusterRef}
        className="pointer-events-none relative z-10 hidden items-center overflow-hidden pr-2 lg:flex"
        style={{
          paddingLeft: APP_SIDEBAR_ICON_INSET_PX,
          ...(leftMaxPx != null ? { maxWidth: leftMaxPx } : {}),
        }}
      >
        <div className="pointer-events-auto flex max-w-full items-center">
          <div ref={phraseDesktopRef} className="shrink-0">
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

      {/* Compact (&lt; lg): hamburger nav. Phone = sun only; md–lg keeps wordmark.
          Shrink-wrap so the flex-1 middle can centre in the free band. */}
      <div
        className={`relative z-10 flex w-fit max-w-[min(100%,42%)] shrink-0 items-center overflow-hidden py-0 pl-3 pr-2 transition-transform duration-200 ease-out lg:hidden ${
          mobileSearchOpen
            ? "pointer-events-none -translate-x-full"
            : "translate-x-0"
        }`}
        aria-hidden={mobileSearchOpen}
      >
        <div className="flex items-center">
          <div ref={phraseCompactRef} className="shrink-0">
            <BrandPhrase
              verb={location.verb}
              size="mobile"
              showWordmark
              wordmarkFromMd
              className="shrink-0"
            />
          </div>
          {mobileCrumbs.length > 0 ? (
            <>
              <span
                className="app-header-crumb-divider mx-2 inline-block h-[16px] w-px shrink-0 self-center"
                aria-hidden
              />
              <AppBreadcrumb
                crumbs={mobileCrumbs}
                className="min-w-0 shrink text-[13px] md:shrink-0"
              />
            </>
          ) : null}
        </div>
      </div>

      {/* &lt;lg: flex-1 band between left + right. lg+: absolute true viewport centre. */}
      <div className="pointer-events-none relative z-[15] flex min-w-0 flex-1 items-center justify-center lg:absolute lg:inset-0 lg:flex-none">
        <AppPrimaryTabsSlot
          ref={tabsSlotRef}
          className="pointer-events-auto flex w-max max-w-full items-center justify-center overflow-x-auto"
        />
      </div>

      {/* lg+: keeps right cluster at the trailing edge under the absolute centre slot. */}
      <div className="hidden min-w-0 flex-1 lg:block" aria-hidden />

      <div className="relative z-20 ml-auto flex shrink-0 items-center gap-2 pr-3 sm:pr-4 lg:ml-0">
        <AppTopBarTrailingSlot className="flex max-w-[min(100vw-11rem,28rem)] items-center justify-end overflow-x-auto" />
        <div className="hidden lg:contents">
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
        <div className="flex items-center gap-0.5 lg:gap-2">
          {/* +10px matches bell’s +5px nudge so search↔bell == bell↔hamburger on compact. */}
          <span className="relative translate-x-[10px] lg:translate-x-0">
            <AppGlobalSearch onOpenChange={setMobileSearchOpen} />
          </span>
          <div className="hidden lg:contents">
            <ColorSchemePicker variant="header" />
          </div>
          <Link
            href="/settings/account"
            aria-label="Settings"
            aria-current={
              pathname.startsWith("/settings") ? "page" : undefined
            }
            className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors lg:inline-flex ${
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
              className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors lg:inline-flex ${
                pathname.startsWith("/admin")
                  ? "bg-nav-active text-nav-foreground"
                  : "text-nav-muted hover:bg-nav-active hover:text-nav-foreground"
              }`}
            >
              <Shield aria-hidden className="size-[18px]" strokeWidth={1.75} />
            </Link>
          ) : null}
          <span className="relative translate-x-[5px] lg:translate-x-0">
            <AppNotificationsBell />
          </span>
          {onToggleSidebar ? (
            <button
              type="button"
              aria-label={mobileSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileSidebarOpen}
              onClick={onToggleSidebar}
              className={`app-top-bar-menu-btn inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-nav-foreground lg:hidden${
                mobileSidebarOpen ? " is-open" : ""
              }`}
            >
              <span className="app-top-bar-menu-icon" aria-hidden>
                <span />
                <span />
              </span>
            </button>
          ) : null}
          <div className="hidden lg:block">
            <AccountMenu accountLabel={accountLabel} />
          </div>
        </div>
      </div>

    </header>
  );
}
