/**
 * Deploy-time seed: push codebase Claude preprompts into VoiceAdmin Dynamo.
 * Invoked from deploy-back after successful CDK deploy.
 *
 * Usage:
 *   VOICE_ADMIN_TABLE_NAME=… npx tsx scripts/seed-claude-preprompts.ts
 *   npx tsx scripts/seed-claude-preprompts.ts --table <name>
 *   npx tsx scripts/seed-claude-preprompts.ts --stack ConsciouslyBackend
 */
import {
  CloudFormationClient,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import { seedClaudePrepromptsToDynamo } from "../lambdas/_shared/claude-preprompts-store";

async function resolveTableFromStack(stackName: string): Promise<string> {
  const cfn = new CloudFormationClient({});
  const queue = await cfn.send(
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

  // Fallback: scan root stack resources (non-nested layouts).
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

async function main() {
  const args = process.argv.slice(2);
  let table = process.env.VOICE_ADMIN_TABLE_NAME?.trim() || "";
  let stack = "ConsciouslyBackend";

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--table" && args[i + 1]) {
      table = args[++i]!.trim();
    } else if (a.startsWith("--table=")) {
      table = a.slice("--table=".length).trim();
    } else if (a === "--stack" && args[i + 1]) {
      stack = args[++i]!.trim();
    } else if (a.startsWith("--stack=")) {
      stack = a.slice("--stack=".length).trim();
    }
  }

  if (!table) {
    console.log(`Resolving VoiceAdmin table from stack ${stack}…`);
    table = await resolveTableFromStack(stack);
  }

  console.log(`Seeding Claude preprompts → ${table}`);
  const result = await seedClaudePrepromptsToDynamo({ tableName: table });
  console.log(
    `Seeded ${result.count} prompts at ${result.deployedAt}`,
  );
  for (const id of result.ids) console.log(`  - ${id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
