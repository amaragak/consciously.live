/**
 * Phone bottom tab bar — height, hide rules, and CSS variable sync.
 * Below Tailwind `md` only; md+ keeps the sidebar / hamburger.
 */

export const APP_MOBILE_TAB_BAR_H_PX = 58;
/** Extra lift for mini-player / floating tools above the bar. */
export const APP_MOBILE_TAB_BAR_GAP_PX = 8;

export const APP_MOBILE_TAB_BAR_CHANGED = "consciously-mobile-tab-bar";

export type AppMobileTabBarState = {
  /** Bar is mounted and visible (phone + not immersive + keyboard closed). */
  visible: boolean;
  /** Content offset: bar height + safe-area bottom (0 when hidden). */
  offsetPx: number;
};

let state: AppMobileTabBarState = { visible: false, offsetPx: 0 };

export function getAppMobileTabBarState(): AppMobileTabBarState {
  return state;
}

export function setAppMobileTabBarState(next: AppMobileTabBarState): void {
  if (state.visible === next.visible && state.offsetPx === next.offsetPx) return;
  state = next;
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty(
      "--app-mobile-tab-h",
      `${next.offsetPx}px`,
    );
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(APP_MOBILE_TAB_BAR_CHANGED, { detail: next }),
    );
  }
}

/** Routes where the tab bar hides (own bottom chrome / immersive). */
export function shouldHideMobileTabBar(_pathname: string): boolean {
  return false;
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
