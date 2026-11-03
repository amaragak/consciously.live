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
