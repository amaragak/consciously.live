import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for the SPA. The app ships the production `dist/` build; nothing
 * is loaded from app.consciously.live. Live reload is opt-in via
 * `npm run native:dev:ios|android`, which passes `--live-reload` to `cap run`.
 */
const config: CapacitorConfig = {
  appId: "live.consciously.app",
  appName: "Consciously",
  webDir: "dist",
  ios: {
    contentInset: "never",
    backgroundColor: "#1E232E",
    // Keep the WKWebView from showing the iOS link preview on long press.
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: "#1E232E",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
    },
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: false,
      backgroundColor: "#1E232E",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
