/**
 * Import the meditation harvester bundle (style guides, pacing profiles,
 * skeleton library, delivery fingerprints) into the versioned Pre-prompts store. Same no-overwrite
 * rules as the admin upload: a new version only for content that changed since
 * the last harvester import. Invoked from deploy-back after the pre-prompt sync.
 *
 * Usage:
 *   npx tsx scripts/import-harvester-bundle.ts [--file <path>] [--table <name> | --stack ConsciouslyBackend] [--deploy-id <id>]
 * Default file: tools/meditation-harvester/output/consciously-import.json
 * Missing file → prints a note and exits 0.
 */
import fs from "node:fs";
import path from "node:path";
import { importHarvesterBundle } from "../lambdas/_shared/preprompts/harvester-datasets";
import { gitShortSha, resolveTableFromStack } from "./sync-script-preprompts";

const DEFAULT_FILE = path.resolve(
  __dirname,
  "../../tools/meditation-harvester/output/consciously-import.json",
);

async function main() {
  const args = process.argv.slice(2);
  let file = DEFAULT_FILE;
  let table = process.env.VOICE_ADMIN_TABLE_NAME?.trim() || "";
  let stack = "ConsciouslyBackend";
  let deployId = process.env.DEPLOY_ID?.trim() || "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const next = () => args[++i]!.trim();
    if (a === "--file" && args[i + 1]) file = path.resolve(next());
    else if (a === "--table" && args[i + 1]) table = next();
    else if (a === "--stack" && args[i + 1]) stack = next();
    else if (a === "--deploy-id" && args[i + 1]) deployId = next();
  }

  if (!fs.existsSync(file)) {
    console.log(`No harvester bundle at ${file}; skipping import.`);
    return;
  }
  if (!deployId) deployId = gitShortSha() ?? "";
  if (!table) {
    console.log(`Resolving VoiceAdmin table from stack ${stack}…`);
    table = await resolveTableFromStack(stack);
  }

  const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(
    `Importing harvester bundle ${bundle?.version?.id ?? "?"} → ${table}${deployId ? ` (deploy ${deployId})` : ""}`,
  );
  const s = await importHarvesterBundle({
    bundle,
    importedVia: "deploy",
    deployId: deployId || undefined,
    tableName: table,
  });
  for (const g of s.styleGuides) {
    console.log(
      `  - style guide ${g.meditationType ?? g.style}: ${g.action} v${g.version}${g.error ? ` (${g.error})` : ""}`,
    );
  }
  for (const d of s.datasets) {
    console.log(`  - ${d.id}: ${d.action} v${d.version} (${d.styles} styles)`);
  }
  for (const k of s.skeletonsPerStyle) {
    const rt =
      k.medianRuntimeS != null
        ? `${Math.floor(k.medianRuntimeS / 60)}:${String(Math.round(k.medianRuntimeS % 60)).padStart(2, "0")}`
        : "—";
    console.log(
      `    ${k.meditationType}: ${k.skeletons} skeletons (${k.primary} primary), median ${rt}`,
    );
  }
  for (const r of s.rejected) {
    console.warn(`  ! rejected ${r.section}/${r.key}: ${r.reason}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
