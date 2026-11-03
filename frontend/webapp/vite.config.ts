import { defineConfig, type Plugin } from "vite";
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

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode.startsWith("native") ? [nativeRuntimeAssets()] : [])],
  define: {
    __NATIVE_BUILD__: JSON.stringify(mode.startsWith("native")),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
}));
