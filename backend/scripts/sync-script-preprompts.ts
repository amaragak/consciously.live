/**
 * Deploy-time sync: repo default files → versioned Pre-prompts in VoiceAdmin Dynamo.
 * Adds a version ONLY when a repo file's text changed since the last repo version.
 * Invoked from deploy-back after a successful CDK deploy.
 *
 * Usage:
 *   VOICE_ADMIN_TABLE_NAME=… npx tsx scripts/sync-script-preprompts.ts
 *   npx tsx scripts/sync-script-preprompts.ts --table <name> [--deploy-id <id>]
 *   npx tsx scripts/sync-script-preprompts.ts --stack ConsciouslyBackend
 */
import { execSync } from "node:child_process";
import {
  CloudFormationClient,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import { syncPrepromptsFromRepo } from "../lambdas/_shared/preprompts/preprompt-store";
import { renderPrepromptDefaultsData } from "./generate-preprompt-defaults-data";
import fs from "node:fs";
import path from "node:path";

export async function resolveTableFromStack(stackName: string): Promise<string> {
  const cfn = new CloudFormationClient({});
  const out = await cfn.send(
    new ListStackResourcesCommand({ StackName: stackName }),
  );
  const nests = (out.StackResourceSummaries ?? []).filter(
    (r) =>
      r.ResourceType === "AWS::CloudFormation::Stack" &&
      /Database/i.test(r.LogicalResourceId ?? ""),
  );
  for (const nest of nests) {
    const nestedName =
      nest.PhysicalResourceId?.match(/stack\/([^/]+)\//)?.[1] ??
      nest.PhysicalResourceId;
    if (!nestedName) continue;
    const nested = await cfn.send(
      new ListStackResourcesCommand({ StackName: nestedName }),
    );
    const table = (nested.StackResourceSummaries ?? []).find(
      (r) =>
        r.ResourceType === "AWS::DynamoDB::Table" &&
        /VoiceAdmin/i.test(r.LogicalResourceId ?? ""),
    );
    if (table?.PhysicalResourceId) return table.PhysicalResourceId;
  }
  const rootTable = (out.StackResourceSummaries ?? []).find(
    (r) =>
      r.ResourceType === "AWS::DynamoDB::Table" &&
      /VoiceAdmin/i.test(r.LogicalResourceId ?? ""),
  );
  if (rootTable?.PhysicalResourceId) return rootTable.PhysicalResourceId;
  throw new Error(
    `Could not find VoiceAdmin Dynamo table under stack ${stackName}`,
  );
}

export function gitShortSha(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let table = process.env.VOICE_ADMIN_TABLE_NAME?.trim() || "";
  let stack = "ConsciouslyBackend";
  let deployId = process.env.DEPLOY_ID?.trim() || "";

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--table" && args[i + 1]) table = args[++i]!.trim();
    else if (a.startsWith("--table=")) table = a.slice("--table=".length).trim();
    else if (a === "--stack" && args[i + 1]) stack = args[++i]!.trim();
    else if (a.startsWith("--stack=")) stack = a.slice("--stack=".length).trim();
    else if (a === "--deploy-id" && args[i + 1]) deployId = args[++i]!.trim();
    else if (a.startsWith("--deploy-id="))
      deployId = a.slice("--deploy-id=".length).trim();
  }

  // Lambdas read preprompt-defaults-data.ts when Dynamo is down; warn if it lags the files.
  const dataPath = path.resolve(
    __dirname,
    "../lambdas/_shared/preprompts/preprompt-defaults-data.ts",
  );
  if (
    !fs.existsSync(dataPath) ||
    fs.readFileSync(dataPath, "utf8") !== renderPrepromptDefaultsData()
  ) {
    console.warn(
      "WARN preprompt-defaults-data.ts is stale vs repo files. Run: npx tsx scripts/generate-preprompt-defaults-data.ts (and redeploy so the Lambda fallback matches).",
    );
  }

  if (!deployId) deployId = gitShortSha() ?? "";

  if (!table) {
    console.log(`Resolving VoiceAdmin table from stack ${stack}…`);
    table = await resolveTableFromStack(stack);
  }

  console.log(
    `Syncing script pre-prompts → ${table}${deployId ? ` (deploy ${deployId})` : ""}`,
  );
  const result = await syncPrepromptsFromRepo({
    tableName: table,
    deployId: deployId || undefined,
  });
  let errors = 0;
  for (const r of result.results) {
    const extra = r.replacedManual ? " (replaced a manual edit)" : "";
    if (r.error) {
      errors++;
      console.error(`  ! ${r.id}: ${r.error}`);
    } else {
      console.log(`  - ${r.id}: ${r.action} v${r.version}${extra}`);
    }
  }
  if (errors > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
