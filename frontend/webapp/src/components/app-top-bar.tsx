"use client";

import { Link, usePathname, useRouter  } from "@/lib/spa-nav";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { LogoMark } from "@/components/logo-mark";
import { AppPrimaryTabsSlot, AppTopBarTrailingSlot } from "@/components/app-primary-tabs";
import { AppGlobalSearch } from "@/components/app-global-search";
import { AppNotificationsBell } from "@/components/app-notifications-bell";
import { AlphaChromeButton } from "@/components/dev-chrome-button";
import {
  buildAppBreadcrumbs,
  type AppBreadcrumbCrumb,
} from "@/lib/app-nav";
import { ASSISTANT_CHAT_STORE_CHANGED } from "@/lib/assistant-chat-storage";
import { enterMarketingPreviewMode } from "@/lib/marketing-preview";
import { appHref, isCrossOriginApp } from "@/lib/app-origins";
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

function BreadcrumbChevron() {
  return (
    <span
      className="mx-0.5 inline-flex shrink-0 items-center text-muted md:mx-2.5"
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-70"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </span>
  );
}

function BreadcrumbCrumb({
  crumb,
  last,
  allowTruncate,
}: {
  crumb: AppBreadcrumbCrumb;
  last: boolean;
  /** Only the current (usually title) crumb should truncate. */
  allowTruncate: boolean;
}) {
  const textClass = allowTruncate ? "min-w-0 truncate" : "shrink-0";
  if (last || !crumb.href) {
    return (
      <span
        className={`${textClass} ${
          last ? "text-foreground" : "italic text-muted"
        }`}
      >
        {crumb.label}
      </span>
    );
  }
  return (
    <Link
      href={crumb.href}
      className={`${textClass} italic text-accent-link underline-offset-2 hover:underline`}
    >
      {crumb.label}
    </Link>
  );
}

function MobileBreadcrumbEllipsis({
  intermediates,
}: {
  intermediates: AppBreadcrumbCrumb[];
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 6,
        left: rect.left + rect.width / 2,
      });
    }
    // Defer so the opening click doesn't immediately close the menu.
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Intermediate steps"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              transform: "translateX(-50%)",
            }}
            className="z-[200] min-w-[10rem] max-w-[min(100vw-2rem,16rem)] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
          >
            {intermediates.map((c, i) => (
              <div
                key={`mid-${c.label}-${i}`}
                role="none"
                className="px-3 py-2 text-sm"
              >
                {c.href ? (
                  <Link
                    role="menuitem"
                    href={c.href}
                    onClick={() => setOpen(false)}
                    className="block truncate italic text-accent-link underline-offset-2 hover:underline"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span
                    role="menuitem"
                    className="block truncate italic text-muted"
                  >
                    {c.label}
                  </span>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Show intermediate breadcrumb steps"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-6 min-w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-1.5 text-sm leading-none text-muted transition-colors hover:border-accent/40 hover:text-foreground"
      >
        …
      </button>
      {menu}
    </>
  );
}

export function AppTopBar({
  mobileSidebarOpen = false,
  onToggleSidebar,
  sidebarCollapsed = false,
}: {
  mobileSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** Matches desktop sidebar rail width via --app-sidebar-w. */
  sidebarCollapsed?: boolean;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [crumbs, setCrumbs] = useState<AppBreadcrumbCrumb[]>([]);

  useLayoutEffect(() => {
    const rebuild = () => {
      // Defer so journal (or other) store writes never setState into TopBar mid-render.
      queueMicrotask(() => {
        setCrumbs(
          buildAppBreadcrumbs(pathname, {
            lifeAreaTitle: lifeAreaTitleFromPath(pathname),
            createMeditationStyle: createMeditationStyleFromSession(pathname),
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

  const mobileHasEllipsis = crumbs.length > 2;
  const mobileIntermediates = mobileHasEllipsis ? crumbs.slice(1, -1) : [];
  const mobileCrumbs =
    crumbs.length <= 2
      ? crumbs
      : [crumbs[0]!, crumbs[crumbs.length - 1]!];

  return (
    <header className="relative sticky top-0 z-[130] flex h-14 w-full shrink-0 items-center border-b border-border bg-background">
      {/* Desktop: brand aligned with sidebar. Mobile: brand + breadcrumbs left. */}
      <div
        className="relative z-10 hidden h-full shrink-0 items-center px-2 transition-[width] duration-200 ease-out md:flex"
        style={{ width: "var(--app-sidebar-w, 200px)" }}
      >
        <Link
          href="/"
          className={`inline-flex min-w-0 items-center ${
            sidebarCollapsed ? "justify-center px-0" : "gap-2 px-2.5"
          }`}
          title="consciously"
        >
          <LogoMark
            size={28}
            className="relative z-[1] shrink-0 text-accent-button"
          />
          {sidebarCollapsed ? null : (
            <span className="brand-wordmark relative -top-px truncate font-display text-xl font-medium tracking-tight lowercase">
              consciously
            </span>
          )}
        </Link>
      </div>

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-3 overflow-hidden px-3 pr-[5.75rem] sm:px-4 md:pr-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 overflow-hidden md:max-w-[min(100%,calc(50vw-10rem))] md:gap-2">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center md:hidden"
          >
            <LogoMark
              size={24}
              className="relative z-[1] mr-1.5 shrink-0 text-accent-button"
            />
            <span className="brand-wordmark relative -top-px font-display text-lg font-medium tracking-tight lowercase">
              consciously
            </span>
          </Link>

          {/* Mobile: first … last; ellipsis opens intermediate steps */}
          {mobileCrumbs.length > 0 ? (
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center overflow-hidden font-display text-sm font-medium tracking-tight md:hidden"
            >
              {mobileCrumbs.map((c, i) => {
                const last = i === mobileCrumbs.length - 1;
                return (
                  <Fragment key={`m-${c.label}-${i}`}>
                    {i > 0 ? (
                      <>
                        <BreadcrumbChevron />
                        {mobileHasEllipsis && i === 1 ? (
                          <>
                            <MobileBreadcrumbEllipsis
                              intermediates={mobileIntermediates}
                            />
                            <BreadcrumbChevron />
                          </>
                        ) : null}
                      </>
                    ) : null}
                    <BreadcrumbCrumb
                      crumb={c}
                      last={last}
                      allowTruncate={last}
                    />
                  </Fragment>
                );
              })}
            </nav>
          ) : null}

          {/* Desktop: full trail */}
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center overflow-hidden font-display text-lg font-medium tracking-tight md:flex"
          >
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <Fragment key={`${c.label}-${i}`}>
                  {i > 0 ? <BreadcrumbChevron /> : null}
                  <BreadcrumbCrumb
                    crumb={c}
                    last={last}
                    allowTruncate={last}
                  />
                </Fragment>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 sm:right-4">
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
          <AlphaChromeButton
            title="Alpha — show marketing site without clearing session"
            onClick={() => {
              enterMarketingPreviewMode();
              router.push("/");
            }}
          >
            View marketing page
          </AlphaChromeButton>
        </div>
        <div className="flex items-center gap-0.5 md:gap-2">
          <AppGlobalSearch />
          <span className="relative translate-x-[5px] md:translate-x-0">
            <AppNotificationsBell />
          </span>
          {onToggleSidebar ? (
            <button
              type="button"
              aria-label={mobileSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileSidebarOpen}
              onClick={onToggleSidebar}
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-foreground md:hidden"
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
        </div>
      </div>

      {/* True viewport centre (full header width), not content-area centre.
          Above the breadcrumb flex row so tab clicks aren't swallowed. */}
      <div className="pointer-events-none absolute inset-0 z-[15] hidden items-center justify-center md:flex">
        <AppPrimaryTabsSlot className="pointer-events-auto flex max-w-[min(100%,48rem)] items-center justify-center overflow-x-auto" />
      </div>
    </header>
  );
}
