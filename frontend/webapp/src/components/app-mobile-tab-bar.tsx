"use client";

import { ChevronRight, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { AppNavSectionIcon } from "@/components/app-nav-section-icon";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  APP_MOBILE_TAB_BAR_H_PX,
  readSafeAreaBottomPx,
  setAppMobileTabBarState,
  shouldHideMobileTabBar,
} from "@/lib/app-mobile-tab-bar";
import {
  APP_NAV_MAIN,
  activeNavSectionId,
  isSubItemActive,
  type AppNavSection,
  type AppNavSubItem,
} from "@/lib/app-nav";
import { activeHealItems, loadHealStore, subscribeHealStore } from "@/lib/heal-store";
import { Link, usePathname, useRouter } from "@/lib/spa-nav";

const LONG_PRESS_MS = 400;
const LONG_PRESS_SLOP_PX = 10;
/** Sheet slide + scrim fade — keep in sync. */
const SHEET_MOTION_MS = 220;
const TAB_BAR_BOTTOM =
  "calc(58px + env(safe-area-inset-bottom, 0px))" as const;

function hapticLight(): void {
  void (async () => {
    try {
      const load = new Function(
        "return import('@capacitor/haptics')",
      ) as () => Promise<{
        Haptics?: {
          impact: (o: { style: string }) => Promise<void>;
        };
        ImpactStyle?: { Light: string };
      }>;
      const mod = await load();
      if (mod?.Haptics?.impact) {
        await mod.Haptics.impact({
          style: mod.ImpactStyle?.Light ?? "LIGHT",
        });
        return;
      }
    } catch {
      /* web / no Capacitor */
    }
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
  })();
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

    let disposeCap: (() => void) | undefined;
    void (async () => {
      try {
        const load = new Function(
          "return import('@capacitor/keyboard')",
        ) as () => Promise<{
          Keyboard?: {
            addListener: (
              e: string,
              cb: () => void,
            ) => Promise<{ remove: () => void }>;
          };
        }>;
        const Keyboard = (await load()).Keyboard;
        if (!Keyboard?.addListener) return;
        const show = await Keyboard.addListener("keyboardWillShow", () =>
          setOpen(true),
        );
        const hide = await Keyboard.addListener("keyboardWillHide", () =>
          setOpen(false),
        );
        disposeCap = () => {
          show.remove();
          hide.remove();
        };
      } catch {
        /* web */
      }
    })();

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      disposeCap?.();
    };
  }, []);
  return open;
}

function SectionSheet({
  section,
  pathname,
  search,
  hash,
  open,
  onClose,
  onNavigate,
}: {
  section: AppNavSection;
  pathname: string;
  search: string;
  hash: string;
  /** When false, plays the exit motion (parent unmounts after SHEET_MOTION_MS). */
  open: boolean;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const children = section.children ?? [];
  const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
  const motionTransition = `opacity ${SHEET_MOTION_MS}ms ${ease}, transform ${SHEET_MOTION_MS}ms ${ease}`;
  return (
    <div
      className="fixed inset-0 z-[125] md:hidden"
      role="presentation"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      {/* Scrim stops above the tab bar so the bar never dims. */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-x-0 top-0 bg-overlay/22 motion-reduce:!transition-none"
        style={{
          bottom: TAB_BAR_BOTTOM,
          opacity: open ? 1 : 0,
          transition: motionTransition,
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={section.label}
        className="absolute inset-x-0 flex max-h-[min(70dvh,520px)] flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-card shadow-[0_-8px_28px_rgb(15_27_45_/_0.12)] motion-reduce:!transition-none"
        style={{
          bottom: TAB_BAR_BOTTOM,
          // Keep sheet opaque while sliding — only the scrim fades.
          opacity: 1,
          transform: open ? "translateY(0)" : "translateY(105%)",
          transition: motionTransition,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center gap-2 px-[18px] pb-2 pt-2">
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
            {section.label}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
            className="ml-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {children.map((sub) => (
              <SheetRow
                key={sub.id}
                item={sub}
                pathname={pathname}
                search={search}
                hash={hash}
                sectionId={section.id}
                depth={0}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function SheetRow({
  item,
  pathname,
  search,
  hash,
  sectionId,
  depth,
  onNavigate,
}: {
  item: AppNavSubItem;
  pathname: string;
  search: string;
  hash: string;
  sectionId: string;
  depth: number;
  onNavigate: () => void;
}) {
  const active = isSubItemActive(pathname, hash, search, item, sectionId);
  const nested = item.children ?? [];
  const parent = nested.length > 0;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
          active ? "bg-accent-soft font-semibold text-foreground" : "text-foreground"
        } ${depth > 0 ? "pl-[30px]" : ""}`}
      >
        {depth > 0 ? (
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              active ? "bg-accent-link" : "bg-muted/60"
            }`}
            aria-hidden
          />
        ) : null}
        <span className="min-w-0 flex-1">
          <span
            className={`block ${
              parent
                ? "font-display text-[17px] leading-tight"
                : "text-[15px] leading-snug"
            }`}
          >
            {item.label}
          </span>
        </span>
        {parent ? (
          <ChevronRight className="h-[14px] w-[14px] shrink-0 text-muted" aria-hidden />
        ) : null}
      </Link>
      {nested.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {nested.map((child) => (
            <SheetRow
              key={child.id}
              item={child}
              pathname={pathname}
              search={search}
              hash={hash}
              sectionId={sectionId}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function AppMobileTabBar() {
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
      const items = activeHealItems(loadHealStore());
      setHealChildren([
        { id: "heal-home", label: "What you're carrying", href: "/heal" },
        ...items.map((item) => ({
          id: `heal-item:${item.id}`,
          label: item.title.trim() || "Untitled",
          href: `/heal/${encodeURIComponent(item.id)}`,
        })),
        { id: "heal-rested", label: "Laid to rest", href: "/heal/rested" },
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
      setAppMobileTabBarState({ visible: false, offsetPx: 0 });
      return;
    }
    const safe = readSafeAreaBottomPx();
    setAppMobileTabBarState({
      visible: true,
      offsetPx: APP_MOBILE_TAB_BAR_H_PX + safe,
    });
    return () => setAppMobileTabBarState({ visible: false, offsetPx: 0 });
  }, [visible]);

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
    // Already exiting or closed — don't restart / skip the fade.
    if (sheetSectionId == null) return;
    clearSheetOpenRaf();
    setSheetOpen(false);
    clearSheetCloseTimer();
    sheetCloseTimerRef.current = window.setTimeout(() => {
      setSheetSectionId(null);
      sheetCloseTimerRef.current = null;
    }, SHEET_MOTION_MS);
  }, [
    sheetSectionId,
    clearSheetCloseTimer,
    clearSheetOpenRaf,
  ]);

  const goSection = useCallback(
    (section: AppNavSection) => {
      const landing = section.href;
      const onLanding =
        pathname === landing ||
        pathname === `${landing}/` ||
        (section.id === "focus" &&
          (pathname === "/focus" || pathname === "/focus/"));
      if (activeId === section.id && onLanding) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        const main = document.querySelector("main");
        main?.scrollTo?.({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(landing);
    },
    [activeId, router, pathname],
  );

  if (mdUp) return null;

  const sheetSection = (() => {
    if (sheetSectionId == null) return null;
    const found = APP_NAV_MAIN.find((s) => s.id === sheetSectionId) ?? null;
    if (!found) return null;
    if (found.id !== "heal") return found;
    return { ...found, children: healChildren };
  })();

  const bar = (
    <nav
      aria-label="Primary"
      className={`fixed inset-x-0 bottom-0 border-t border-border bg-card md:hidden ${
        sheetSectionId != null ? "z-[130]" : "z-[120]"
      } ${visible ? "" : "pointer-events-none translate-y-full opacity-0"}`}
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transition: "transform 180ms ease, opacity 180ms ease",
      }}
    >
      <div
        className="grid grid-cols-5"
        style={{ height: APP_MOBILE_TAB_BAR_H_PX }}
      >
        {APP_NAV_MAIN.map((section) => {
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
                hapticLight();
                setSheetSectionId(section.id);
              }}
            />
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      {typeof document !== "undefined"
        ? createPortal(bar, document.body)
        : bar}
      {sheetSection && typeof document !== "undefined"
        ? createPortal(
            <SectionSheet
              section={sheetSection}
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
