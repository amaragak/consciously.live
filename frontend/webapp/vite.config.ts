import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

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
    plugins: [react(), tailwindcss(), ...(native ? [nativeRuntimeAssets()] : [])],
    define: {
      __NATIVE_BUILD__: JSON.stringify(native),
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
