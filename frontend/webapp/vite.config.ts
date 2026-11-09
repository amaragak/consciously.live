import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import {
  BRAND_GLOW_BOOT_CSS,
  BRAND_GLOW_HTML,
  BRAND_LOCKUP_CSS,
  BRAND_LOCKUP_HTML,
  BRAND_LOCKUP_SCALE,
} from "./src/lib/native/brand-lockup-markup";

const NATIVE_RUNTIME_DIR = path.resolve(__dirname, "native-assets/runtime");

/** Serves/emits `native-assets/runtime/*` at `/native/*` for `--mode native*` only (web dist stays unchanged). */
function nativeRuntimeAssets(): Plugin {
  const files = () => fs.readdirSync(NATIVE_RUNTIME_DIR).filter((f) => !f.startsWith("."));
  return {
    name: "consciously-native-runtime-assets",
    configureServer(server) {
      server.middlewares.use("/native", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]!.replace(/^\//, ""));
        if (!files().includes(name)) return next();
        const type = name.endsWith(".png") ? "image/png" : name.endsWith(".m4a") ? "audio/mp4" : "application/octet-stream";
        res.setHeader("Content-Type", type);
        fs.createReadStream(path.join(NATIVE_RUNTIME_DIR, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of files()) {
        this.emitFile({
          type: "asset",
          fileName: `native/${name}`,
          source: fs.readFileSync(path.join(NATIVE_RUNTIME_DIR, name)),
        });
      }
    },
  };
}

/**
 * First paint before any JS modules: navy + sun + wordmark in index.html.
 * Live reload especially needs this — Cap splash is gone while Vite downloads the graph.
 */
function nativeIndexBootSplash(): Plugin {
  const boot = `
<style id="brand-lockup-css">${BRAND_LOCKUP_CSS}</style>
<style id="native-boot-css">
html,body{background:#1A1820!important;margin:0}
#native-boot-splash{position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;background:#1A1820;pointer-events:none}
#native-boot-splash::before{content:"";position:absolute;inset:0;opacity:.49;background:url("/patterns/paisley-dark-duotone.webp") center/calc(max(100vw,100vh)*0.73206) calc(max(100vw,100vh)*0.73206) repeat}
#native-boot-splash .brand-lockup{transform:scale(${BRAND_LOCKUP_SCALE})}
${BRAND_GLOW_BOOT_CSS}
</style>
<div id="native-boot-splash" aria-hidden="true">
  ${BRAND_GLOW_HTML}
  ${BRAND_LOCKUP_HTML}
</div>
<script>
  (function () {
    var cap = window.Capacitor;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return;
    var boot = document.getElementById("native-boot-splash");
    if (boot) boot.remove();
    var css = document.getElementById("native-boot-css");
    if (css) css.remove();
  })();
</script>`;
  return {
    name: "consciously-native-index-boot",
    transformIndexHtml(html) {
      if (html.includes('id="native-boot-splash"')) return html;
      return html.replace('<div id="root"></div>', `${boot}\n    <div id="root"></div>`);
    },
  };
}

/**
 * Vite 6 does not apply custom `define` keys while the dev server is serving
 * the browser, so `__NATIVE_BUILD__` throws and the boot splash never clears.
 * Replace it in source for both `vite` and `vite build`.
 */
function nativeBuildFlag(native: boolean): Plugin {
  const value = native ? "true" : "false";
  return {
    name: "consciously-native-build-flag",
    enforce: "pre",
    transform(code, id) {
      if (!code.includes("__NATIVE_BUILD__")) return null;
      if (id.includes("node_modules") || id.endsWith(".d.ts")) return null;
      const next = code.replace(/\b__NATIVE_BUILD__\b/g, value);
      return next === code ? null : next;
    },
  };
}

/**
 * Native live reload (`scripts/native-dev.mjs`): the phone loads the app from
 * `http://<LAN IP>:5173`, an origin the API's CORS list doesn't (and shouldn't)
 * allow. Route API calls through this dev server instead, so they're same-origin.
 */
const LIVE_RELOAD_API_PREFIX = "/__api";

export default defineConfig(({ mode }) => {
  const native = mode.startsWith("native");
  const liveReloadOrigin = process.env.CAP_LIVE_RELOAD_ORIGIN?.trim();
  const apiTarget = loadEnv(mode, __dirname, "VITE_").VITE_MEDIMADE_API_URL?.trim();
  const proxyApi = Boolean(native && liveReloadOrigin && apiTarget);

  return {
    plugins: [
      nativeBuildFlag(native),
      react(),
      tailwindcss(),
      ...(native ? [nativeRuntimeAssets(), nativeIndexBootSplash()] : []),
    ],
    // Phone builds must not share the desktop dev server's optimizer cache.
    cacheDir: native ? "node_modules/.vite-native" : "node_modules/.vite",
    define: {
      ...(proxyApi
        ? {
            "import.meta.env.VITE_MEDIMADE_API_URL": JSON.stringify(
              `${liveReloadOrigin}${LIVE_RELOAD_API_PREFIX}`,
            ),
          }
        : {}),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      ...(proxyApi
        ? {
            proxy: {
              [LIVE_RELOAD_API_PREFIX]: {
                target: apiTarget,
                changeOrigin: true,
                rewrite: (p: string) => p.slice(LIVE_RELOAD_API_PREFIX.length) || "/",
              },
            },
          }
        : {}),
    },
    preview: {
      port: 5173,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
