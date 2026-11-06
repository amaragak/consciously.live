/**
 * Phone bottom tab bar — height, hide rules, and CSS variable sync.
 * Below Tailwind `md` only; md+ keeps the sidebar / hamburger.
 *
 * Floating pill geometry (consciously-mobile-floating-nav-v2):
 * inset 14px sides; bottom offset = max(safeArea − 8, 16) ≈ 26px on notch.
 */

export const APP_MOBILE_TAB_BAR_H_PX = 58;
/** Horizontal inset of the floating pill from the screen edges. */
export const APP_MOBILE_TAB_PILL_INSET_PX = 14;
/**
 * Gap between the pill’s bottom edge and the physical screen edge when there
 * is no home-indicator inset. With an inset: safeArea − 8 (never below this).
 */
export const APP_MOBILE_TAB_PILL_BOTTOM_MIN_PX = 16;
export const APP_MOBILE_TAB_PILL_SAFE_TRIM_PX = 8;
/** Extra lift for mini-player / floating tools above the bar. */
export const APP_MOBILE_TAB_BAR_GAP_PX = 8;
/** Approximate mini-player strip height (measured live when shown). */
export const APP_MOBILE_MINI_PLAYER_H_PX = 64;

export const APP_MOBILE_TAB_BAR_CHANGED = "consciously-mobile-tab-bar";

export type AppMobileTabBarState = {
  /** Bar is mounted and visible (phone + not immersive + keyboard closed). */
  visible: boolean;
  /** Content offset: pill height + bottom offset (+ mini-player when present). */
  offsetPx: number;
  /** Bottom offset of the pill from the screen edge (safe-area aware). */
  bottomOffsetPx: number;
};

let state: AppMobileTabBarState = {
  visible: false,
  offsetPx: 0,
  bottomOffsetPx: APP_MOBILE_TAB_PILL_BOTTOM_MIN_PX,
};

export function getAppMobileTabBarState(): AppMobileTabBarState {
  return state;
}

export function setAppMobileTabBarState(
  next: Omit<AppMobileTabBarState, "bottomOffsetPx"> & {
    bottomOffsetPx?: number;
  },
): void {
  const bottomOffsetPx =
    next.bottomOffsetPx ??
    (next.visible ? readMobileTabPillBottomOffsetPx() : 0);
  if (
    state.visible === next.visible &&
    state.offsetPx === next.offsetPx &&
    state.bottomOffsetPx === bottomOffsetPx
  ) {
    return;
  }
  state = {
    visible: next.visible,
    offsetPx: next.offsetPx,
    bottomOffsetPx,
  };
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty(
      "--app-mobile-tab-h",
      `${state.offsetPx}px`,
    );
    document.documentElement.style.setProperty(
      "--app-mobile-tab-bottom",
      `${state.bottomOffsetPx}px`,
    );
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(APP_MOBILE_TAB_BAR_CHANGED, { detail: state }),
    );
  }
}

/** Routes where the tab bar hides (own bottom chrome / immersive). */
export function shouldHideMobileTabBar(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return (
    path === "/meditate/create" ||
    path.startsWith("/meditate/create/") ||
    path === "/create" ||
    path.startsWith("/create/")
  );
}

export function readSafeAreaBottomPx(): number {
  if (typeof window === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return px;
}

/** Pill bottom edge ≈ 26px above the screen on notched phones; ≥16px otherwise. */
export function readMobileTabPillBottomOffsetPx(): number {
  const safe = readSafeAreaBottomPx();
  return Math.max(
    APP_MOBILE_TAB_PILL_BOTTOM_MIN_PX,
    safe - APP_MOBILE_TAB_PILL_SAFE_TRIM_PX,
  );
}

/** Content padding so the last item clears the floating pill (+ gap). */
export function mobileTabContentClearancePx(opts?: {
  miniPlayerPx?: number;
}): number {
  const bottom = readMobileTabPillBottomOffsetPx();
  const mini = opts?.miniPlayerPx ?? 0;
  return (
    APP_MOBILE_TAB_BAR_H_PX +
    bottom +
    APP_MOBILE_TAB_BAR_GAP_PX +
    (mini > 0 ? mini + APP_MOBILE_TAB_BAR_GAP_PX : 0)
  );
}
