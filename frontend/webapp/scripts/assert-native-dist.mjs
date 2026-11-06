#!/usr/bin/env node
/**
 * Fail `cap sync` when `dist/` is a web build. The Cap shell needs
 * `--mode native*` (`#native-boot-splash` + `__NATIVE_BUILD__`) or the launch
 * splash never hides and the phone looks stuck with a blank / frozen open.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "dist", "index.html");

if (!existsSync(indexPath)) {
  console.error(
    "\n[cap sync] dist/index.html missing. Run `npm run build:native` (or native:sync:ios) first.\n",
  );
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");
if (!html.includes('id="native-boot-splash"')) {
  console.error(`
[cap sync] dist/ is a web build, not a native build.

  Wrong:  npm run build && npx cap sync ios
  Right:  npm run native:sync:ios

Web bundles never call SplashScreen.hide(), so the iPhone stays stuck on launch.
`);
  process.exit(1);
}

const assetsDir = path.join(root, "dist", "assets");
const js = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => f.endsWith(".js") && !f.endsWith(".map.js"))
  : [];
let sawNativeTrue = false;
for (const file of js.slice(0, 30)) {
  const src = readFileSync(path.join(assetsDir, file), "utf8");
  // Vite inlines __NATIVE_BUILD__ as !0 / true in native mode.
  if (
    src.includes("native-boot-splash") ||
    /__NATIVE_BUILD__\s*=\s*!0/.test(src) ||
    src.includes("cap-native")
  ) {
    sawNativeTrue = true;
    break;
  }
}
if (!sawNativeTrue) {
  // HTML boot is enough — JS check is best-effort across chunk splits.
  console.warn(
    "[cap sync] native boot splash found in index.html (JS chunk check inconclusive).",
  );
}

console.log("[cap sync] native dist OK");
