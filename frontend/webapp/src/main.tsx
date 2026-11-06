import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  applyColorScheme,
  colorSchemeBootScript,
  getStoredColorScheme,
  themeRootCss,
} from "@consciously/common/theme";
import { App } from "./App";
import { isNativeApp, nativePlatform } from "./lib/native/native-bridge";
import { scopeNativeHttp } from "./lib/native/native-http";
import "./index.css";

/** Apply shared theme CSS vars before first paint of React. */
function injectTheme(): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById("mm-theme-root") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "mm-theme-root";
    document.head.appendChild(style);
  }
  style.textContent = themeRootCss;
  if (!document.getElementById("mm-color-scheme-boot")) {
    const boot = document.createElement("script");
    boot.id = "mm-color-scheme-boot";
    boot.textContent = colorSchemeBootScript;
    document.head.appendChild(boot);
  }
  applyColorScheme(getStoredColorScheme());
}

injectTheme();

const onCapacitor = isNativeApp();
const native = __NATIVE_BUILD__ && onCapacitor;

/**
 * Web `vite build` synced into Cap leaves launchAutoHide:false with nobody
 * calling SplashScreen.hide() — phone stuck on a blank/frozen launch. Bail out
 * of the native splash immediately and surface the mistake.
 */
if (onCapacitor && !__NATIVE_BUILD__) {
  console.error(
    "[consciously] Cap shell is running a web dist. Rebuild with `npm run native:sync:ios`.",
  );
  void import("@capacitor/splash-screen").then(({ SplashScreen }) =>
    SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {}),
  );
}

function render(LaunchOverlay: ComponentType | null): void {
  // No StrictMode on native: it remounts and kills the launch morph mid-FLIP.
  const tree = (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  createRoot(document.getElementById("root")!).render(
    native ? (
      <>
        {tree}
        {LaunchOverlay ? <LaunchOverlay /> : null}
      </>
    ) : (
      <StrictMode>{tree}</StrictMode>
    ),
  );
}

if (native) {
  const apiBase = import.meta.env.VITE_MEDIMADE_API_URL?.trim();
  // Live-reload serves the app + `/__api` proxy from http://<LAN>:5173. Keep those
  // on WKWebView fetch (same-origin). CapacitorHttp is only for the real HTTPS API
  // from capacitor://localhost (CORS). Routing the Vite host through native HTTP
  // fails cleartext ATS and falsely trips the offline screen.
  const nativeHttpOrigins =
    nativePlatform() === "ios" &&
    apiBase &&
    apiBase.startsWith("https:") &&
    !apiBase.includes("/__api")
      ? [new URL(apiBase).origin]
      : [];
  scopeNativeHttp(nativeHttpOrigins);

  document.documentElement.style.backgroundColor = "#1A1820";
  document.body.style.backgroundColor = "#1A1820";

  // index.html already has the boot frame. Overlay clears it after paint.
  void import("./lib/native/native-shell").then((m) => m.initNativeShell());

  const restored = import("./lib/native/native-secure-session").then((m) =>
    m.restoreNativeSecureSession(),
  );
  const overlay = import("./components/native-launch-overlay");

  void Promise.all([
    overlay,
    Promise.race([restored, new Promise((r) => setTimeout(r, 800))]).catch(() => undefined),
  ]).then(([mod]) => render(mod.default));
} else {
  // Native vite mode (`native:dev`) injects #native-boot-splash into index.html for
  // the phone. Opening that same server in a desktop browser is not Capacitor, so
  // nothing would clear it — strip it here.
  if (__NATIVE_BUILD__) {
    void import("./lib/native/native-boot-splash").then((m) => m.clearNativeBootSplash());
    document.documentElement.style.backgroundColor = "";
    document.body.style.backgroundColor = "";
  }
  render(null);
}
