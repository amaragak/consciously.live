// iOS launch-screen lockup = the web lockup markup, minus web-only attributes.
// node native-assets/src/export-lockup-svg.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const { BRAND_LOCKUP_INNER } = await import(new URL("src/lib/native/brand-lockup-markup.ts", root).href);

const svg = BRAND_LOCKUP_INNER.replace(/ class="[^"]*"/, "").replace(/ aria-hidden="true"/, "");
const out = fileURLToPath(new URL("ios/App/App/Assets.xcassets/Lockup.imageset/lockup.svg", root));
writeFileSync(out, svg + "\n");
console.log("wrote", out);
