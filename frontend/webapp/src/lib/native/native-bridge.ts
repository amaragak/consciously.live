/**
 * Native (Capacitor) checks that cost nothing on the web build: no Capacitor
 * import here. The native bridge script defines `window.Capacitor` before the
 * bundle runs, so these are safe at module load.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Constant-folded: false in the web build, so every native branch is dropped. */
export function isNativeApp(): boolean {
  if (!__NATIVE_BUILD__) return false;
  try {
    return capacitorGlobal()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (!isNativeApp()) return "web";
  const p = capacitorGlobal()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

/** Dev tools (`/dev/audio`) ship in dev servers and internal test builds only. */
export const NATIVE_DEV_TOOLS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_INTERNAL_BUILD === "1";

export const NATIVE_KEYBOARD_EVENT = "consciously-native-keyboard";

export type NativeKeyboardDetail = { open: boolean; heightPx: number };

let keyboardOpen = false;

export function isNativeKeyboardOpen(): boolean {
  return keyboardOpen;
}

export function setNativeKeyboardState(detail: NativeKeyboardDetail): void {
  keyboardOpen = detail.open;
  window.dispatchEvent(
    new CustomEvent<NativeKeyboardDetail>(NATIVE_KEYBOARD_EVENT, { detail }),
  );
}

let hapticImpl: (() => void) | null = null;

export function setNativeHapticImpl(fn: (() => void) | null): void {
  hapticImpl = fn;
}

/** Light tap on native; returns false when there is no native haptics. */
export function nativeHapticTap(): boolean {
  if (!hapticImpl) return false;
  hapticImpl();
  return true;
}

let keyboardOverlayImpl: ((overlay: boolean) => void) | null = null;
let keyboardOverlay = false;

export function setNativeKeyboardOverlayImpl(fn: ((overlay: boolean) => void) | null): void {
  keyboardOverlayImpl = fn;
  if (keyboardOverlay) fn?.(true);
}

/** true: keyboard slides over the page without resizing it. false: default (web view resizes). */
export function setNativeKeyboardOverlay(overlay: boolean): void {
  keyboardOverlay = overlay;
  keyboardOverlayImpl?.(overlay);
}

let seekImpl: ((timeSeconds: number) => void) | null = null;

/** Set by the native strip while it owns playback. */
export function setNativeSeekImpl(fn: ((timeSeconds: number) => void) | null): void {
  seekImpl = fn;
}

/** Seek native playback; false when no native strip is active. */
export function nativeSeek(timeSeconds: number): boolean {
  if (!seekImpl) return false;
  seekImpl(timeSeconds);
  return true;
}

export type NativeAppReadyInfo = {
  /** Session is usable — overlay cross-fades into the app. */
  signedIn: boolean;
};

let appReady: NativeAppReadyInfo | null = null;
const appReadyListeners = new Set<(info: NativeAppReadyInfo) => void>();

/**
 * The first real screen (app, login, dev page) has rendered; the launch
 * overlay may leave. Idempotent, and a no-op outside the native app.
 */
export function markNativeAppReady(info: NativeAppReadyInfo = { signedIn: false }): void {
  if (!isNativeApp() || appReady) return;
  appReady = info;
  for (const fn of appReadyListeners) fn(info);
  appReadyListeners.clear();
}

/** Runs `fn` once the app is ready (immediately if it already is). */
export function onNativeAppReady(fn: (info: NativeAppReadyInfo) => void): () => void {
  if (appReady) {
    fn(appReady);
    return () => {};
  }
  appReadyListeners.add(fn);
  return () => {
    appReadyListeners.delete(fn);
  };
}

/**
 * Boot splash has finished fading (or there was none). Dashboard entrance
 * waits on this so cards don’t animate under the cover.
 */
let splashCleared = false;
const splashClearedListeners = new Set<() => void>();

export function markNativeSplashCleared(): void {
  if (splashCleared) return;
  splashCleared = true;
  for (const fn of splashClearedListeners) fn();
  splashClearedListeners.clear();
}

/** Runs `fn` once the splash is gone (immediately if it already is). */
export function onNativeSplashCleared(fn: () => void): () => void {
  if (!isNativeApp() || splashCleared) {
    fn();
    return () => {};
  }
  splashClearedListeners.add(fn);
  return () => {
    splashClearedListeners.delete(fn);
  };
}

let darkSurfaceHolds = 0;
let statusBarSyncImpl: (() => void) | null = null;

export function setNativeStatusBarSyncImpl(fn: (() => void) | null): void {
  statusBarSyncImpl = fn;
}

/** True while a full-bleed navy screen (launch, login) sits under the status bar. */
export function nativeDarkSurfaceActive(): boolean {
  return darkSurfaceHolds > 0;
}

/** Light status-bar content until the returned release runs. */
export function holdNativeDarkSurface(): () => void {
  darkSurfaceHolds += 1;
  statusBarSyncImpl?.();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    darkSurfaceHolds -= 1;
    statusBarSyncImpl?.();
  };
}

let openExternalImpl: ((url: string) => void) | null = null;

export function setNativeOpenExternalImpl(
  fn: ((url: string) => void) | null,
): void {
  openExternalImpl = fn;
}

/**
 * Leave the app for another site. Native: in-app browser sheet. Web: normal
 * navigation (`replace` keeps the current history entry out of the way).
 */
export function navigateToExternal(
  url: string,
  opts?: { replace?: boolean },
): void {
  if (openExternalImpl && isNativeApp()) {
    openExternalImpl(url);
    return;
  }
  if (opts?.replace) window.location.replace(url);
  else window.location.assign(url);
}
