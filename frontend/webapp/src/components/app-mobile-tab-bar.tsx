"use client";

import {
  BookOpen,
  ChevronRight,
  Focus,
  Heart,
  Library,
  ScrollText,
  Sparkles,
  Timer,
  Volume2,
  Waves,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AppNavSectionIcon } from "@/components/app-nav-section-icon";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  APP_MOBILE_TAB_BAR_H_PX,
  APP_MOBILE_TAB_PILL_INSET_PX,
  mobileTabContentClearancePx,
  readMobileTabPillBottomOffsetPx,
  setAppMobileTabBarState,
  shouldHideMobileTabBar,
} from "@/lib/app-mobile-tab-bar";
import { applyMvpNav, useMvpFlags } from "@/lib/mvp-flags";
import {
  APP_NAV_MAIN,
  activeNavSectionId,
  isSubItemActive,
  type AppNavSection,
  type AppNavSubItem,
} from "@/lib/app-nav";
import {
  activeHealItems,
  loadHealStore,
  restedHealItems,
  subscribeHealStore,
} from "@/lib/heal-store";
import { Link, usePathname, useRouter } from "@/lib/spa-nav";
import { healItemHref } from "@/lib/entity-href";
import {
  NATIVE_KEYBOARD_EVENT,
  isNativeApp,
  isNativeKeyboardOpen,
  nativeHapticTap,
  type NativeKeyboardDetail,
} from "@/lib/native/native-bridge";

const LONG_PRESS_MS = 400;
const LONG_PRESS_SLOP_PX = 10;
/** Card scale/fade — keep in sync with close timer. */
const MENU_MOTION_MS = 200;
/** Gap between section menu card bottom and the floating pill. */
const MENU_PILL_GAP_PX = 8;

function hapticLight(): void {
  if (nativeHapticTap()) return;
  try {
    navigator.vibrate?.(10);
  } catch {
    /* ignore */
  }
}

function useKeyboardOccludes(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) {
        setOpen(false);
        return;
      }
      setOpen(window.innerHeight - vv.height > 150);
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    const onNativeKeyboard = (e: Event) => {
      setOpen((e as CustomEvent<NativeKeyboardDetail>).detail.open);
    };
    if (isNativeApp()) {
      setOpen(isNativeKeyboardOpen());
      window.addEventListener(NATIVE_KEYBOARD_EVENT, onNativeKeyboard);
    }

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener(NATIVE_KEYBOARD_EVENT, onNativeKeyboard);
    };
  }, []);
  return open;
}

function subIcon(id: string, size = 16): ReactNode {
  const props = {
    "aria-hidden": true as const,
    width: size,
    height: size,
    strokeWidth: 1.85,
    className: "shrink-0",
  };
  if (id === "create") return <Sparkles {...props} />;
  if (id === "library" || id.startsWith("library-")) return <Library {...props} />;
  if (id === "sounds" || id === "sounds-soundscapes") return <Waves {...props} />;
  if (id === "sounds-voices" || id === "sounds-custom") return <Volume2 {...props} />;
  if (id === "entries" || id === "gratitudes" || id === "insights")
    return <BookOpen {...props} />;
  if (id === "manifesto") return <ScrollText {...props} />;
  if (id === "story") return <BookOpen {...props} />;
  if (id === "vision-board") return <Sparkles {...props} />;
  if (id === "tracker") return <Focus {...props} />;
  if (id === "timer") return <Timer {...props} />;
  if (id === "history") return <Focus {...props} />;
  if (id.startsWith("heal")) return <Heart {...props} />;
  return <Sparkles {...props} />;
}

/**
 * Old full-width bottom sheet (consciously-mobile-floating-nav v1) — kept for
 * reference; replaced by the notched card that grows out of the pill (v2).
 *
 * <div className="fixed inset-0 z-[125]">
 *   <button className="absolute inset-x-0 top-0 …" style={{ bottom: TAB_BAR_BOTTOM }} />
 *   <div className="absolute inset-x-0 rounded-t-[22px] …" style={{ bottom: TAB_BAR_BOTTOM,
 *        transform: open ? "translateY(0)" : "translateY(105%)" }}>
 *     <div>drag handle</div><div>label + X</div><nav>flat rows…</nav>
 *   </div>
 * </div>
 */

function SectionMenu({
  section,
  tabIndex,
  tabCount,
  pathname,
  search,
  hash,
  open,
  onClose,
  onNavigate,
}: {
  section: AppNavSection;
  /** 0-based index among the five visible tabs (for notch placement). */
  tabIndex: number;
  tabCount: number;
  pathname: string;
  search: string;
  hash: string;
  open: boolean;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const children = section.children ?? [];
  const bottomOffsetPx = readMobileTabPillBottomOffsetPx();
  const cardBottom =
    bottomOffsetPx + APP_MOBILE_TAB_BAR_H_PX + MENU_PILL_GAP_PX;
  const notchPct = ((tabIndex + 0.5) / Math.max(1, tabCount)) * 100;
  const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
  const motion = `opacity ${MENU_MOTION_MS}ms ${ease}, transform ${MENU_MOTION_MS}ms ${ease}`;

  const dragStartY = useRef<number | null>(null);

  const onCardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragStartY.current = e.clientY;
  };
  const onCardPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartY.current;
    dragStartY.current = null;
    if (start == null) return;
    if (e.clientY - start > 48) onClose();
  };

  const isMeditate = section.id === "meditate";
  const createItem = isMeditate
    ? children.find((c) => c.id === "create")
    : null;
  const groupItems = isMeditate
    ? children.filter((c) => c.id !== "create")
    : [];
  const flatItems = isMeditate ? [] : children;

  return (
    <div
      className="fixed inset-0 z-[125] md:hidden"
      role="presentation"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      {/* Dim covers the page; pill stays above (z-130). */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-overlay/22 motion-reduce:!transition-none"
        style={{
          opacity: open ? 1 : 0,
          transition: motion,
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={section.label}
        className="absolute flex max-h-[min(62dvh,440px)] flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_14px_36px_-10px_rgb(15_27_45_/_0.28)] motion-reduce:!transition-none"
        style={{
          left: APP_MOBILE_TAB_PILL_INSET_PX,
          right: APP_MOBILE_TAB_PILL_INSET_PX,
          bottom: cardBottom,
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.92) translateY(12px)",
          transformOrigin: `${notchPct}% 100%`,
          transition: motion,
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onCardPointerDown}
        onPointerUp={onCardPointerUp}
        onPointerCancel={() => {
          dragStartY.current = null;
        }}
      >
        {/* Notch pointing at the tab. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[-7px] h-3.5 w-3.5 rotate-45 border-b border-r border-border bg-card"
          style={{
            left: `calc(${notchPct}% - 7px)`,
          }}
        />

        <div className="shrink-0 px-4 pb-1.5 pt-3.5">
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
            {section.label}
          </span>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {createItem ? (
            <Link
              href={createItem.href}
              onClick={onNavigate}
              className="mb-2 flex min-h-[50px] w-full items-center gap-2.5 rounded-[14px] px-3.5 text-[15px] font-semibold text-on-accent accent-fill-gradient"
              style={PRIMARY_ACCENT_FILL_STYLE}
            >
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
              <span className="min-w-0 flex-1">Create meditation</span>
            </Link>
          ) : null}

          {isMeditate ? (
            <ul className="m-0 flex list-none flex-col gap-0 p-0">
              {groupItems.map((group, i) => {
                const active = isSubItemActive(
                  pathname,
                  hash,
                  search,
                  group,
                  section.id,
                );
                const chips = group.children ?? [];
                return (
                  <li key={group.id}>
                    {i > 0 ? (
                      <div
                        className="mx-1 my-1.5 h-px bg-border/70"
                        aria-hidden
                      />
                    ) : null}
                    <Link
                      href={group.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[50px] w-full items-center gap-2.5 rounded-[14px] px-2.5 text-left transition-colors ${
                        active
                          ? "bg-accent-soft font-semibold text-foreground"
                          : "text-foreground"
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-link">
                        {subIcon(group.id)}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] leading-snug">
                        {group.label}
                      </span>
                      <ChevronRight
                        className="h-[14px] w-[14px] shrink-0 text-muted"
                        aria-hidden
                      />
                    </Link>
                    {chips.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 px-2.5 pb-2 pt-1">
                        {chips.map((chip) => {
                          const chipActive = isSubItemActive(
                            pathname,
                            hash,
                            search,
                            chip,
                            section.id,
                          );
                          return (
                            <Link
                              key={chip.id}
                              href={chip.href}
                              onClick={onNavigate}
                              aria-current={chipActive ? "page" : undefined}
                              className={`inline-flex h-8 items-center rounded-full border px-2.5 text-[12.5px] font-medium transition-colors ${
                                chipActive
                                  ? "border-accent/50 bg-accent-soft font-semibold text-foreground"
                                  : "border-border bg-card text-foreground"
                              }`}
                            >
                              {chip.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {flatItems.map((item) => {
                const active = isSubItemActive(
                  pathname,
                  hash,
                  search,
                  item,
                  section.id,
                );
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[50px] w-full items-center gap-2.5 rounded-[14px] px-2.5 text-left transition-colors ${
                        active
                          ? "bg-accent-soft font-semibold text-foreground"
                          : "text-foreground"
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-link">
                        {subIcon(item.id)}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] leading-snug">
                        {item.label}
                      </span>
                      <ChevronRight
                        className="h-[14px] w-[14px] shrink-0 text-muted"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>
    </div>
  );
}

export function AppMobileTabBar() {
  const mvp = useMvpFlags();
  const navMain = useMemo(() => applyMvpNav(APP_NAV_MAIN, mvp), [mvp]);
  const tabSections = useMemo(
    () => navMain.filter((section) => section.id !== "chat"),
    [navMain],
  );
  const mdUp = useMinWidth(768);
  const pathname = usePathname() || "/";
  const router = useRouter();
  const keyboardOpen = useKeyboardOccludes();
  const immersive = shouldHideMobileTabBar(pathname);
  const visible = !mdUp && !immersive && !keyboardOpen;
  const activeId = activeNavSectionId(pathname);
  /** Mounted section while open or mid exit-animation. */
  const [sheetSectionId, setSheetSectionId] = useState<string | null>(null);
  /** Visual open state — false while exiting so CSS can animate out. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetCloseTimerRef = useRef<number | null>(null);
  const sheetOpenRafRef = useRef<number | null>(null);
  const search =
    typeof window !== "undefined" ? window.location.search : "";
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const [healChildren, setHealChildren] = useState<AppNavSubItem[]>(() =>
    APP_NAV_MAIN.find((section) => section.id === "heal")?.children ?? [],
  );

  useEffect(() => {
    const sync = () => {
      const store = loadHealStore();
      const items = activeHealItems(store);
      const rested = restedHealItems(store);
      setHealChildren([
        { id: "heal-home", label: "What you're carrying", href: "/heal" },
        ...items.map((item) => ({
          id: `heal-item:${item.id}`,
          label: item.title.trim() || "Untitled",
          href: healItemHref(item),
        })),
        ...(rested.length > 0
          ? [{ id: "heal-rested", label: "Laid to rest", href: "/heal/rested" }]
          : []),
      ]);
    };
    sync();
    return subscribeHealStore(sync);
  }, []);

  const clearSheetCloseTimer = useCallback(() => {
    if (sheetCloseTimerRef.current != null) {
      window.clearTimeout(sheetCloseTimerRef.current);
      sheetCloseTimerRef.current = null;
    }
  }, []);

  const clearSheetOpenRaf = useCallback(() => {
    if (sheetOpenRafRef.current != null) {
      window.cancelAnimationFrame(sheetOpenRafRef.current);
      sheetOpenRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      // Create routes own the floating step pill — don't zero their offset.
      if (!immersive) {
        setAppMobileTabBarState({
          visible: false,
          offsetPx: 0,
          bottomOffsetPx: 0,
        });
      }
      return;
    }
    const bottomOffsetPx = readMobileTabPillBottomOffsetPx();
    setAppMobileTabBarState({
      visible: true,
      offsetPx: mobileTabContentClearancePx(),
      bottomOffsetPx,
    });
    return () =>
      setAppMobileTabBarState({ visible: false, offsetPx: 0, bottomOffsetPx: 0 });
  }, [visible, immersive]);

  useEffect(() => {
    clearSheetCloseTimer();
    clearSheetOpenRaf();
    setSheetOpen(false);
    setSheetSectionId(null);
  }, [pathname, clearSheetCloseTimer, clearSheetOpenRaf]);

  // Enter: mount closed, then open next frame so opacity/transform can tween.
  useEffect(() => {
    if (sheetSectionId == null) return;
    clearSheetCloseTimer();
    clearSheetOpenRaf();
    setSheetOpen(false);
    sheetOpenRafRef.current = window.requestAnimationFrame(() => {
      sheetOpenRafRef.current = window.requestAnimationFrame(() => {
        setSheetOpen(true);
        sheetOpenRafRef.current = null;
      });
    });
    return () => clearSheetOpenRaf();
  }, [sheetSectionId, clearSheetCloseTimer, clearSheetOpenRaf]);

  const closeSheet = useCallback(() => {
    if (sheetSectionId == null) return;
    clearSheetOpenRaf();
    setSheetOpen(false);
    clearSheetCloseTimer();
    sheetCloseTimerRef.current = window.setTimeout(() => {
      setSheetSectionId(null);
      sheetCloseTimerRef.current = null;
    }, MENU_MOTION_MS);
  }, [sheetSectionId, clearSheetCloseTimer, clearSheetOpenRaf]);

  const openSheet = useCallback(
    (sectionId: string) => {
      hapticLight();
      if (sheetSectionId === sectionId && sheetOpen) {
        closeSheet();
        return;
      }
      setSheetSectionId(sectionId);
    },
    [sheetSectionId, sheetOpen, closeSheet],
  );

  const goSection = useCallback(
    (section: AppNavSection) => {
      const landing = section.href;
      const onLanding =
        pathname === landing ||
        pathname === `${landing}/` ||
        (section.id === "focus" &&
          (pathname === "/focus" || pathname === "/focus/"));
      const hasChildren = (section.children?.length ?? 0) > 0;

      // Menu already open for this tab → close.
      if (sheetSectionId === section.id && sheetOpen) {
        closeSheet();
        return;
      }

      if (activeId === section.id && onLanding) {
        if (hasChildren) {
          openSheet(section.id);
          return;
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        const main = document.querySelector("main");
        main?.scrollTo?.({ top: 0, behavior: "smooth" });
        return;
      }

      if (activeId === section.id && !onLanding) {
        // Child page → overview (tap again later opens the menu).
        router.push(landing);
        return;
      }

      router.push(landing);
    },
    [
      activeId,
      router,
      pathname,
      sheetSectionId,
      sheetOpen,
      closeSheet,
      openSheet,
    ],
  );

  if (mdUp) return null;

  const sheetSection = (() => {
    if (sheetSectionId == null) return null;
    const found = navMain.find((s) => s.id === sheetSectionId) ?? null;
    if (!found) return null;
    if (found.id !== "heal") return found;
    return { ...found, children: healChildren };
  })();

  const sheetTabIndex = Math.max(
    0,
    tabSections.findIndex((s) => s.id === sheetSectionId),
  );

  const bottomOffsetPx = readMobileTabPillBottomOffsetPx();

  /*
   * Old full-width docked bar (kept for reference):
   * <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card …"
   *   style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
   *   <div className="grid grid-cols-5" style={{ height: APP_MOBILE_TAB_BAR_H_PX }}>…
   * </nav>
   */
  const bar = (
    <>
      {/* Short fade so scrolling content softens under the pill. */}
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-[119] md:hidden ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{
          height: mobileTabContentClearancePx() + 12,
          background:
            "linear-gradient(to top, var(--background) 28%, transparent)",
          transition: "opacity 180ms ease",
        }}
      />
      <nav
        aria-label="Primary"
        className={`app-mobile-tab-bar fixed z-[120] border border-border bg-card shadow-[0_10px_28px_-12px_rgb(0_0_0_/_0.35)] md:hidden ${
          sheetSectionId != null ? "z-[130]" : ""
        } ${visible ? "" : "pointer-events-none translate-y-full opacity-0"}`}
        style={{
          left: APP_MOBILE_TAB_PILL_INSET_PX,
          right: APP_MOBILE_TAB_PILL_INSET_PX,
          bottom: bottomOffsetPx,
          height: APP_MOBILE_TAB_BAR_H_PX,
          borderRadius: 9999,
          transition: "transform 180ms ease, opacity 180ms ease",
        }}
      >
        <div
          className="grid h-full grid-cols-5 px-1"
          style={{ height: APP_MOBILE_TAB_BAR_H_PX }}
        >
          {tabSections.map((section) => {
            const active = activeId === section.id;
            const hasChildren = (section.children?.length ?? 0) > 0;
            return (
              <TabButton
                key={section.id}
                section={section}
                active={active}
                hasChildren={hasChildren}
                onTap={() => goSection(section)}
                onLongPress={() => {
                  if (!hasChildren) {
                    goSection(section);
                    return;
                  }
                  openSheet(section.id);
                }}
              />
            );
          })}
        </div>
      </nav>
    </>
  );

  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(bar, document.body)
        : bar}
      {sheetSection && typeof document !== "undefined"
        ? createPortal(
            <SectionMenu
              section={sheetSection}
              tabIndex={sheetTabIndex}
              tabCount={tabSections.length}
              pathname={pathname}
              search={search}
              hash={hash}
              open={sheetOpen}
              onClose={closeSheet}
              onNavigate={closeSheet}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function TabButton({
  section,
  active,
  hasChildren,
  onTap,
  onLongPress,
}: {
  section: AppNavSection;
  active: boolean;
  hasChildren: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    longFired.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      longFired.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const s = startRef.current;
    if (!s) return;
    if (
      Math.hypot(e.clientX - s.x, e.clientY - s.y) > LONG_PRESS_SLOP_PX
    ) {
      clearTimer();
      startRef.current = null;
    }
  };

  const onPointerUp = () => {
    const wasLong = longFired.current;
    clearTimer();
    startRef.current = null;
    if (!wasLong) onTap();
    longFired.current = false;
  };

  const onPointerCancel = () => {
    clearTimer();
    startRef.current = null;
    longFired.current = false;
  };

  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={section.label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex min-h-11 min-w-0 cursor-pointer select-none flex-col items-center justify-center gap-[3px] [-webkit-touch-callout:none] ${
        active
          ? "font-semibold text-foreground"
          : "font-medium text-muted"
      }`}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-1/2 top-0 h-[3px] w-7 -translate-x-1/2 rounded-b-full bg-accent"
        />
      ) : null}
      <AppNavSectionIcon
        sectionId={section.id}
        size={22}
        strokeWidth={active ? 2.15 : 1.75}
      />
      <span className="max-w-full truncate px-0.5 text-[11px] leading-none">
        {section.label}
      </span>
      {!hasChildren ? null : null}
    </button>
  );
}
