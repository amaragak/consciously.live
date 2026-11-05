/**
 * One-time native chrome setup. Imported dynamically from `main.tsx` only when
 * running inside Capacitor, so none of this reaches the web bundle's hot path.
 */
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  nativeDarkSurfaceActive,
  nativePlatform,
  setNativeHapticImpl,
  setNativeKeyboardOverlayImpl,
  setNativeKeyboardState,
  setNativeOpenExternalImpl,
  setNativeStatusBarSyncImpl,
} from "./native-bridge";
import { nativeAudioLog } from "./native-audio-log";

export async function initNativeShell(): Promise<void> {
  const platform = nativePlatform();
  const root = document.documentElement;
  root.classList.add("cap-native", `cap-${platform}`);

  setNativeHapticImpl(() => {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  });
  setNativeOpenExternalImpl((url) => {
    void openInAppBrowser(url);
  });

  setNativeStatusBarSyncImpl(syncStatusBarWithHeader);
  syncStatusBarWithHeader();
  new MutationObserver(syncStatusBarWithHeader).observe(root, {
    attributes: true,
    attributeFilter: ["class", "data-color-scheme"],
  });

  installKeyboardHandling();
  installExternalLinkHandling();
  installBackButton();

  void App.addListener("appStateChange", ({ isActive }) => {
    nativeAudioLog("app", isActive ? "foreground" : "background");
  });

  // Overlay hides the launch splash after it paints. Do NOT SplashScreen.show()
  // here — that races after the overlay hide and pins the splash on screen.
  window.setTimeout(() => hideNativeSplash(), 6000);
}

/** Swap the native splash for the web launch overlay (same artwork, no flash). */
export function hideNativeSplash(): void {
  // Always call hide — a later SplashScreen.show() must not leave us stuck
  // because we no-op'd after the first successful hide.
  void SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
}

/** Light status-bar content on the navy header; dark content on hybrid cream. */
function syncStatusBarWithHeader(): void {
  const meta = document
    .querySelector('meta[name="theme-color"]')
    ?.getAttribute("content");
  const style =
    !nativeDarkSurfaceActive() && meta && isLightHex(meta)
      ? Style.Light
      : Style.Dark;
  void StatusBar.setStyle({ style }).catch(() => {});
}

function isLightHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}

function isTextEntry(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "submit", "file"].includes(
      el.type,
    );
  }
  return false;
}

function installKeyboardHandling(): void {
  // Default matches capacitor.config Keyboard.resize: "none". Auth used to flip
  // back to Native on unmount, which shoved the tab bar / create footer up.
  void Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {});
  setNativeKeyboardOverlayImpl((overlay) => {
    void Keyboard.setResizeMode({
      mode: overlay ? KeyboardResize.None : KeyboardResize.Native,
    }).catch(() => {});
  });
  void Keyboard.addListener("keyboardWillShow", (info) => {
    setNativeKeyboardState({ open: true, heightPx: info.keyboardHeight ?? 0 });
  });
  void Keyboard.addListener("keyboardWillHide", () => {
    setNativeKeyboardState({ open: false, heightPx: 0 });
  });
  // Keep the focused field above the overlay keyboard.
  void Keyboard.addListener("keyboardDidShow", () => {
    const el = document.activeElement;
    if (!isTextEntry(el)) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function externalHttpUrl(raw: string | URL | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(String(raw), window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.origin === window.location.origin) return null;
    return url;
  } catch {
    return null;
  }
}

async function openInAppBrowser(url: string): Promise<void> {
  try {
    await Browser.open({ url, presentationStyle: "popover" });
  } catch (e) {
    nativeAudioLog("error", `Browser.open failed: ${String(e)}`);
  }
}

/**
 * Marketing pages (Listen, Read, home, legal) and any other site open in the
 * in-app browser sheet instead of replacing the app's web view.
 */
function installExternalLinkHandling(): void {
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const target = e.target as Element | null;
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download")) return;
      const url = externalHttpUrl(a.getAttribute("href"));
      if (!url) return;
      e.preventDefault();
      void openInAppBrowser(url.toString());
    },
    true,
  );

  const nativeOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const external = externalHttpUrl(url ?? null);
    if (external) {
      void openInAppBrowser(external.toString());
      return null;
    }
    return nativeOpen(url, target, features);
  };
}

/** Android hardware back: app history first, then leave the app from the top. */
function installBackButton(): void {
  if (nativePlatform() !== "android") return;
  void App.addListener("backButton", ({ canGoBack }) => {
    const atRoot = window.location.pathname === "/" || !canGoBack;
    if (atRoot) {
      void App.exitApp();
      return;
    }
    window.history.back();
  });
}
