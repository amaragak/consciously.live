"use client";

import { Link, usePathname } from "@/lib/spa-nav";
import { useLocation } from "react-router-dom";
import {
  BookOpen,
  Focus,
  Heart,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ColorSchemePicker } from "@consciously/common";
import { SelectChevron } from "@/components/select-chevron";
import { applyMvpNav, useMvpFlags } from "@/lib/mvp-flags";
import {
  APP_NAV_MAIN,
  APP_SIDEBAR_WIDTH_TRANSITION_MS,
  activeNavSectionId,
  clampMobileSidebarExpandState,
  isOwnerAdminAccount,
  isSubItemActive,
  resolveSidebarExpandState,
  saveSidebarExpandState,
  sidebarExpandableSectionIds,
  type AppNavSection,
  type AppNavSubItem,
} from "@/lib/app-nav";
import {
  clearMedimadeSession,
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import {
  activeHealItems,
  loadHealStore,
  restedHealItems,
  subscribeHealStore,
} from "@/lib/heal-store";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import {
  pullIdeateStoreFromCloud,
  subscribeIdeateCloud,
} from "@/lib/ideate-cloud";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";

function accountLabelFromSession(): string {
  return (
    getMedimadeSessionDisplayName()?.trim() ||
    getMedimadeSessionEmail()?.trim() ||
    "Guest"
  );
}


/** Animate nested nav open/close without unmounting mid-transition. */
function CollapsibleNavChildren({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

const SECTION_ICONS: Record<string, ReactNode> = {
  chat: (
    <MessageSquare aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
  ),
  meditate: (
    // Material Icons "self_improvement" — person in lotus posture (Apache-2.0).
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden
      className="size-[18px] shrink-0"
    >
      <circle cx="12" cy="6" r="2" />
      <path d="M21 16v-2c-2.24 0-4.16-.96-5.6-2.68l-1.34-1.6A1.98 1.98 0 0 0 12.53 9h-1.05c-.59 0-1.15.26-1.53.72l-1.34 1.6C7.16 13.04 5.24 14 3 14v2c2.77 0 5.19-1.17 7-3.25V15l-3.88 1.55c-.67.27-1.12.93-1.12 1.66C5 19.2 5.8 20 6.79 20H9v-.5a2.5 2.5 0 0 1 2.5-2.5h3c.28 0 .5.22.5.5s-.22.5-.5.5h-3c-.83 0-1.5.67-1.5 1.5v.5h7.21c.99 0 1.79-.8 1.79-1.79 0-.73-.45-1.39-1.12-1.66L14 15v-2.25c1.81 2.08 4.23 3.25 7 3.25z" />
    </svg>
  ),
  journal: <BookOpen aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />,
  ideate: <Sparkles aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />,
  focus: <Focus aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />,
  heal: <Heart aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />,
};

function subtreeHasActive(
  items: AppNavSubItem[],
  pathname: string,
  hash: string,
  search: string,
  sectionId: string,
): boolean {
  return items.some(
    (sub) =>
      isSubItemActive(pathname, hash, search, sub, sectionId) ||
      subtreeHasActive(sub.children ?? [], pathname, hash, search, sectionId),
  );
}

function SelectedAccentBar() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-[7px] left-0 top-[7px] w-[3px] rounded-r-[3px] bg-accent"
    />
  );
}

/** Centre of a section icon: link padding 10px + half of the 18px icon. */
const SECTION_GUIDE_X = 19;
/** Nested parents have no icon; the line sits under the first letter. */
const NESTED_GUIDE_X = 37;
const GUIDE_TEXT_GAP = 14;
const GUIDE_BAR = 3;
/** Half of a one-line sub-row, so the hairline ends at the last row's middle. */
const GUIDE_LAST_HALF = 16;

function guideX(depth: number): number {
  return depth <= 0 ? SECTION_GUIDE_X : NESTED_GUIDE_X + (depth - 1) * 18;
}

function GuideLine({ x }: { x: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-0 w-px -translate-x-1/2 bg-border"
      style={{ left: x, top: 6, bottom: GUIDE_LAST_HALF }}
    />
  );
}

const NAV_HOVER = "rounded-[10px] transition-colors hover:bg-background";
const NAV_SELECTED =
  "rounded-[10px] bg-card/70 font-semibold text-foreground hover:bg-card/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/60";
const SUB_IDLE =
  "rounded-[10px] font-normal text-foreground/78 transition-colors hover:bg-background group-hover/row:text-foreground";
const SUB_META =
  "text-foreground/60 group-hover/row:text-foreground hover:text-foreground";

function NavSectionBlock({
  section,
  items,
  lifeAreaItems,
  expanded,
  nestedExpanded,
  showChildren,
  onToggle,
  onToggleNested,
  pathname,
  hash,
  search,
  onNavigate,
  emptyAction,
}: {
  section: AppNavSection;
  /** Override static section.children when provided. */
  items?: AppNavSubItem[];
  /** Manifest: user life areas under a muted subheading. */
  lifeAreaItems?: AppNavSubItem[];
  expanded: boolean;
  /** Expand state for nested hubs (Library / Sounds). */
  nestedExpanded: Record<string, boolean>;
  /** False while the rail is still widening — hide nested rows until settled. */
  showChildren: boolean;
  onToggle: () => void;
  onToggleNested: (id: string) => void;
  pathname: string;
  hash: string;
  search: string;
  onNavigate?: () => void;
  /** Shown under children when the list has no dynamic items (e.g. add life area). */
  emptyAction?: { href: string; label: string };
}) {
  const subs = items ?? section.children ?? [];
  const lifeAreas = lifeAreaItems ?? [];
  const showLifeAreas = lifeAreaItems !== undefined;
  const lifeAreasOpen = Boolean(nestedExpanded["life-areas"]);
  const onLifeAreaPage = subtreeHasActive(
    lifeAreas,
    pathname,
    hash,
    search,
    section.id,
  );
  const lifeAreasActive = !lifeAreasOpen && onLifeAreaPage;
  const hasChildren =
    subs.length > 0 || showLifeAreas || Boolean(emptyAction);
  const sectionActive = activeNavSectionId(pathname) === section.id;
  const sectionSelf =
    sectionActive &&
    !subtreeHasActive(subs, pathname, hash, search, section.id) &&
    !onLifeAreaPage &&
    !lifeAreasActive;
  const icon = SECTION_ICONS[section.id];

  function childInset(depth: number) {
    const x = guideX(depth);
    return {
      marginLeft: x - GUIDE_BAR / 2,
      paddingLeft: GUIDE_TEXT_GAP + GUIDE_BAR / 2,
    };
  }

  function renderSubLink(sub: AppNavSubItem, depth: number) {
    const active = isSubItemActive(
      pathname,
      hash,
      search,
      sub,
      section.id,
    );
    return (
      <li key={sub.id} className="group/row flex items-center gap-0.5">
        <Link
          href={sub.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`relative z-[1] flex min-w-0 flex-1 items-center py-1.5 text-sm ${
            active ? NAV_SELECTED : SUB_IDLE
          }`}
          style={childInset(depth)}
        >
          {active ? <SelectedAccentBar /> : null}
          <span className="min-w-0 truncate">{sub.label}</span>
        </Link>
        {sub.actionHref ? (
          <Link
            href={sub.actionHref}
            onClick={onNavigate}
            aria-label={sub.actionAriaLabel ?? `New ${sub.label}`}
            title={sub.actionAriaLabel ?? `New ${sub.label}`}
            className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center text-base font-medium leading-none ${SUB_META} ${NAV_HOVER}`}
          >
            +
          </Link>
        ) : null}
      </li>
    );
  }

  function renderSub(sub: AppNavSubItem, depth: number) {
    const nested = sub.children ?? [];
    if (nested.length === 0) return renderSubLink(sub, depth);
    const open = Boolean(nestedExpanded[sub.id]);
    return (
      <li key={sub.id}>
        <div className="group/row flex min-w-0 items-center gap-0.5">
          <Link
            href={sub.href}
            onClick={onNavigate}
            title={sub.label}
            className={`relative z-[1] flex min-w-0 flex-1 items-center py-1.5 text-sm ${SUB_IDLE}`}
            style={childInset(depth)}
          >
            <span className="min-w-0 truncate">{sub.label}</span>
          </Link>
          <button
            type="button"
            aria-label={open ? `Collapse ${sub.label}` : `Expand ${sub.label}`}
            aria-expanded={open}
            onClick={() => onToggleNested(sub.id)}
            className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center ${SUB_META} ${NAV_HOVER}`}
          >
            <SelectChevron open={open} />
          </button>
        </div>
        <CollapsibleNavChildren open={open && showChildren}>
          <div className="relative">
            <GuideLine x={guideX(depth + 1)} />
            <ul className="relative z-[1] space-y-0.5">
              {nested.map((child) => renderSubLink(child, depth + 1))}
            </ul>
          </div>
        </CollapsibleNavChildren>
      </li>
    );
  }

  return (
    <div className="px-2">
      <div className="group/row flex min-w-0 items-center gap-0.5">
        <Link
          href={section.href}
          onClick={onNavigate}
          title={section.label}
          className={`relative flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-[15px] ${
            sectionSelf
              ? NAV_SELECTED
              : sectionActive
                ? `font-semibold text-foreground ${NAV_HOVER}`
                : `font-medium text-foreground ${NAV_HOVER}`
          }`}
        >
          {sectionSelf ? <SelectedAccentBar /> : null}
          <span
            className={
              sectionActive
                ? "text-foreground"
                : "text-foreground/70 group-hover/row:text-foreground"
            }
          >
            {icon ?? null}
          </span>
          <span className="min-w-0 truncate whitespace-nowrap">
            {section.label}
          </span>
        </Link>
        {hasChildren ? (
          <button
            type="button"
            aria-label={
              expanded
                ? `Collapse ${section.label}`
                : `Expand ${section.label}`
            }
            aria-expanded={expanded}
            onClick={onToggle}
            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-foreground/70 group-hover/row:text-foreground hover:text-foreground ${NAV_HOVER}`}
          >
            <SelectChevron open={expanded} />
          </button>
        ) : null}
      </div>
      {hasChildren ? (
        <CollapsibleNavChildren open={expanded && showChildren}>
          <div className="relative">
            <GuideLine x={SECTION_GUIDE_X} />
            <ul className="relative z-[1] space-y-0.5">
              {subs.map((sub) => renderSub(sub, 0))}
              {showLifeAreas ? (
                <li>
                  <div className="group/row flex min-w-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-expanded={lifeAreasOpen}
                      aria-current={lifeAreasActive ? "page" : undefined}
                      onClick={() => onToggleNested("life-areas")}
                      className={`relative z-[1] flex min-w-0 flex-1 cursor-pointer items-center py-1.5 text-left text-sm ${
                        lifeAreasActive ? NAV_SELECTED : SUB_IDLE
                      }`}
                      style={childInset(0)}
                    >
                      {lifeAreasActive ? <SelectedAccentBar /> : null}
                      <span className="min-w-0 truncate">Life areas</span>
                    </button>
                    <button
                      type="button"
                      aria-label={lifeAreasOpen ? "Collapse Life areas" : "Expand Life areas"}
                      aria-expanded={lifeAreasOpen}
                      onClick={() => onToggleNested("life-areas")}
                      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center ${SUB_META} ${NAV_HOVER}`}
                    >
                      <SelectChevron open={lifeAreasOpen} />
                    </button>
                  </div>
                  <CollapsibleNavChildren open={lifeAreasOpen && showChildren}>
                    <div className="relative">
                      <GuideLine x={guideX(1)} />
                      <ul className="relative z-[1] space-y-0.5">
                        {lifeAreas.map((sub) => renderSubLink(sub, 1))}
                        {emptyAction ? (
                          <li className="group/row">
                            <Link
                              href={emptyAction.href}
                              onClick={onNavigate}
                              className={`relative z-[1] flex min-w-0 items-center py-1.5 text-sm ${SUB_IDLE}`}
                              style={childInset(1)}
                            >
                              <span className="min-w-0 truncate">{emptyAction.label}</span>
                            </Link>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  </CollapsibleNavChildren>
                </li>
              ) : null}
            </ul>
          </div>
        </CollapsibleNavChildren>
      ) : null}
    </div>
  );
}

type Props = {
  mobileOpen?: boolean;
  onNavigate?: () => void;
  onCloseMobile?: () => void;
  /** Desktop icon-rail collapse (ignored on mobile drawer). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function AppSidebar({
  mobileOpen = false,
  onNavigate,
  onCloseMobile,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  const pathname = usePathname() || "/";
  const location = useLocation();
  const hash = location.hash || "";
  const search = location.search || "";
  const mvp = useMvpFlags();
  const navMain = useMemo(() => applyMvpNav(APP_NAV_MAIN, mvp), [mvp]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const path =
      typeof window !== "undefined" ? window.location.pathname || "/" : "/";
    const next = resolveSidebarExpandState(path);
    const mobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches;
    return mobile ? clampMobileSidebarExpandState(next, path) : next;
  });
  const [lifeAreas, setLifeAreas] = useState<
    { id: string; title: string }[]
  >([]);
  const [healItems, setHealItems] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [healHasRested, setHealHasRested] = useState(false);
  const [accountLabel, setAccountLabel] = useState(accountLabelFromSession);
  const [showAdmin, setShowAdmin] = useState(() =>
    isOwnerAdminAccount(getMedimadeSessionEmail()),
  );
  /** Below lg the drawer is always the expanded panel so open/close is a pure slide. */
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1023px)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Icon rail is desktop-only. Mobile drawer stays expanded (matches marketing slide).
  const railCollapsed = collapsed && !isMobileLayout;
  /**
   * Nested nav rows wait until the rail finishes widening. During the open
   * transition parents stay one line with ellipsis; children mount after.
   */
  const [childrenReady, setChildrenReady] = useState(() => !collapsed);

  useEffect(() => {
    if (railCollapsed) {
      setChildrenReady(false);
      return;
    }
    // Mobile drawer is already full-width (slides in); show children immediately.
    if (isMobileLayout || mobileOpen) {
      setChildrenReady(true);
      return;
    }
    const id = window.setTimeout(
      () => setChildrenReady(true),
      APP_SIDEBAR_WIDTH_TRANSITION_MS,
    );
    return () => window.clearTimeout(id);
  }, [railCollapsed, mobileOpen, isMobileLayout]);

  useEffect(() => {
    const syncLifeAreas = () => {
      const dreams = loadIdeateStore().dreams.filter((d) => !isDemoIdeateDream(d));
      const ordered = [...dreams].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setLifeAreas(
        ordered.map((d) => ({
          id: d.id,
          title: d.title.trim() || "Untitled",
        })),
      );
    };
    const syncAccount = () => {
      setAccountLabel(accountLabelFromSession());
      setShowAdmin(isOwnerAdminAccount(getMedimadeSessionEmail()));
    };
    syncLifeAreas();
    syncAccount();
    const unsub = subscribeIdeateCloud(syncLifeAreas);
    if (isMedimadeSessionActive()) {
      void pullIdeateStoreFromCloud().finally(syncLifeAreas);
    }
    window.addEventListener("medimade-session-changed", syncLifeAreas);
    window.addEventListener("medimade-session-changed", syncAccount);
    const syncHeal = () => {
      const store = loadHealStore();
      setHealItems(
        activeHealItems(store).map((item) => ({
          id: item.id,
          title: item.title.trim() || "Untitled",
        })),
      );
      setHealHasRested(restedHealItems(store).length > 0);
    };
    syncHeal();
    const unsubHeal = subscribeHealStore(syncHeal);
    return () => {
      unsub();
      unsubHeal();
      window.removeEventListener("medimade-session-changed", syncLifeAreas);
      window.removeEventListener("medimade-session-changed", syncAccount);
    };
  }, []);

  useEffect(() => {
    const next = resolveSidebarExpandState(pathname);
    setExpanded(
      isMobileLayout ? clampMobileSidebarExpandState(next, pathname) : next,
    );
  }, [pathname, isMobileLayout]);

  function toggleSection(id: string) {
    setExpanded((prev) => {
      const remember = (next: Record<string, boolean>) => {
        if (id === "life-areas") next["life-areas-open"] = next["life-areas"];
        saveSidebarExpandState(next);
        return next;
      };

      if (!isMobileLayout) {
        const next = { ...prev, [id]: !prev[id] };
        return remember(next);
      }

      const expandable = sidebarExpandableSectionIds();
      if (!expandable.includes(id)) {
        const next = { ...prev, [id]: !prev[id] };
        return remember(next);
      }

      const active = activeNavSectionId(pathname);
      const activePinned =
        active && expandable.includes(active) ? active : null;
      const willOpen = !prev[id];

      // Active tool section stays open on mobile.
      if (!willOpen && activePinned === id) {
        return prev;
      }

      const next: Record<string, boolean> = { ...prev };

      if (willOpen) {
        if (activePinned) {
          for (const sid of expandable) {
            if (sid !== activePinned && sid !== id) next[sid] = false;
          }
          next[activePinned] = true;
          next[id] = true;
        } else {
          for (const sid of expandable) {
            next[sid] = sid === id;
          }
        }
      } else {
        next[id] = false;
      }

      const clamped = clampMobileSidebarExpandState(next, pathname);
      return remember(clamped);
    });
  }

  const ideateChildren = useMemo((): AppNavSubItem[] => {
    const base =
      APP_NAV_MAIN.find((s) => s.id === "ideate")?.children?.slice() ?? [];
    return base;
  }, []);

  const healChildren = useMemo((): AppNavSubItem[] => {
    return [
      { id: "heal-home", label: "What you're carrying", href: "/heal" },
      ...healItems.map((item) => ({
        id: `heal-item:${item.id}`,
        label: item.title,
        href: `/heal/${encodeURIComponent(item.id)}`,
      })),
      ...(healHasRested
        ? [{ id: "heal-rested", label: "Laid to rest", href: "/heal/rested" }]
        : []),
    ];
  }, [healHasRested, healItems]);

  const ideateLifeAreaItems = useMemo((): AppNavSubItem[] => {
    return lifeAreas.map((d) => ({
      id: `life-area:${d.id}`,
      label: d.title,
      href: `/manifest/goal/${encodeURIComponent(d.id)}`,
    }));
  }, [lifeAreas]);

  const asideClass = useMemo(
    () =>
      [
        "app-sidebar-drawer flex shrink-0 flex-col overflow-x-hidden border-r-[0.5px] border-sidebar-border bg-surface-2",
        railCollapsed ? "w-14" : "w-[200px]",
        mobileOpen ? "is-open" : "",
        "shadow-[var(--sidebar-shadow)]",
      ]
        .filter(Boolean)
        .join(" "),
    [mobileOpen, railCollapsed],
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={mobileOpen ? undefined : -1}
        className={`app-sidebar-mobile-scrim fixed inset-0 top-[var(--app-header-h)] z-[110] lg:hidden${
          mobileOpen ? " is-open" : ""
        }`}
        onClick={onCloseMobile}
      />
      <aside className={asideClass} aria-label="App">
        {railCollapsed ? (
          <>
            <nav className="app-sidebar-scroll flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
              {navMain.map((section) => {
                const sectionActive = activeNavSectionId(pathname) === section.id;
                const icon = SECTION_ICONS[section.id];
                return (
                  <Link
                    key={section.id}
                    href={section.href}
                    onClick={onNavigate}
                    title={section.label}
                    aria-label={section.label}
                    aria-current={sectionActive ? "page" : undefined}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                      sectionActive
                        ? "bg-nav-active font-bold text-foreground"
                        : "text-muted hover:bg-background hover:text-foreground"
                    }`}
                  >
                    {icon ?? null}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex shrink-0 flex-col items-center gap-2 border-t border-border px-1.5 py-3">
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label="Expand sidebar"
                className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground lg:flex"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
        <nav className="app-sidebar-scroll app-sidebar-expanded-panel flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-3">
          {navMain.map((section) => (
            <NavSectionBlock
              key={section.id}
              section={section}
              items={
                section.id === "ideate"
                  ? ideateChildren
                  : section.id === "heal"
                    ? healChildren
                    : section.children
              }
              lifeAreaItems={
                section.id === "ideate" ? ideateLifeAreaItems : undefined
              }
              emptyAction={
                section.id === "ideate" && lifeAreas.length === 0
                  ? {
                      href: "/manifest/my?new=1",
                      label: "Add a life area",
                    }
                  : undefined
              }
              expanded={Boolean(expanded[section.id])}
              nestedExpanded={expanded}
              showChildren={childrenReady}
              onToggle={() => toggleSection(section.id)}
              onToggleNested={toggleSection}
              pathname={pathname}
              hash={hash}
              search={search}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className="mt-auto shrink-0 border-t border-border px-2 py-3">
          {/* Drawer chrome: appearance, settings, admin, account (header keeps these on lg+). */}
          <div className="mb-3 flex flex-col gap-0.5 lg:hidden">
            <div className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2">
              <span className="text-[13px] text-muted">Appearance</span>
              <ColorSchemePicker variant="sidebar" />
            </div>
            <Link
              href="/settings/account"
              onClick={onNavigate}
              aria-current={
                pathname.startsWith("/settings") ? "page" : undefined
              }
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors ${
                pathname.startsWith("/settings")
                  ? "bg-nav-active font-medium text-foreground"
                  : "text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              <Settings
                aria-hidden
                className="size-[18px] shrink-0"
                strokeWidth={1.75}
              />
              Settings
            </Link>
            {showAdmin ? (
              <Link
                href="/admin"
                onClick={onNavigate}
                aria-current={
                  pathname.startsWith("/admin") ? "page" : undefined
                }
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-nav-active font-medium text-foreground"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <Shield
                  aria-hidden
                  className="size-[18px] shrink-0"
                  strokeWidth={1.75}
                />
                Admin
              </Link>
            ) : null}
            <p className="truncate px-2.5 pt-2 text-[12px] text-muted">
              Signed in as{" "}
              <span className="font-medium text-foreground">{accountLabel}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                clearMedimadeSession();
              }}
              className="flex cursor-pointer items-center rounded-xl px-2.5 py-2 text-left text-[13px] text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              Sign out
            </button>
          </div>
          <div className="mb-1 flex items-center justify-end gap-1 px-1 lg:justify-start">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Collapse sidebar"
              className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground lg:inline-flex"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
        </div>
          </>
        )}
      </aside>
    </>
  );
}
