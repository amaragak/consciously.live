#!/usr/bin/env npx tsx
/**
 * Copy DynamoDB + S3 from MedimadeBackend → ConsciouslyBackend (no deletes).
 *   AWS_PROFILE=mm AWS_REGION=eu-west-2 npx tsx scripts/copy-medimade-to-consciously.ts
 *   ... --dry-run | --skip-s3 | --skip-ddb
 */
import { execFileSync } from "node:child_process";
import {
  BatchWriteItemCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

const REGION = process.env.AWS_REGION || "eu-west-2";
const dryRun = process.argv.includes("--dry-run");
const skipS3 = process.argv.includes("--skip-s3");
const skipDdb = process.argv.includes("--skip-ddb");
const ddb = new DynamoDBClient({ region: REGION });

function awsJson(args: string[]): unknown {
  const out = execFileSync("aws", [...args, "--region", REGION, "--output", "json"], {
    encoding: "utf8",
    env: process.env,
  });
  return JSON.parse(out);
}

function awsText(args: string[]): string {
  return execFileSync("aws", [...args, "--region", REGION, "--output", "text"], {
    encoding: "utf8",
    env: process.env,
  }).trim();
}

function normalizeKey(logical: string): string | null {
  if (logical.includes("MeditationAnalytics")) return "MeditationAnalytics";
  if (logical.includes("JournalInsights")) return "JournalInsights";
  if (logical.includes("AssistantChat")) return "AssistantChat";
  if (logical.includes("FamousQuotes")) return "FamousQuotes";
  if (logical.includes("IdeateTable") || /IdeateTable/i.test(logical))
    return "Ideate";
  if (logical.includes("Habits")) return "Habits";
  if (logical.includes("SoundCatalog")) return "SoundCatalog";
  if (logical.includes("VoiceAdmin")) return "VoiceAdmin";
  if (logical.includes("ListenerMix")) return "ListenerMix";
  if (logical.includes("MeditationJobs")) return "MeditationJobs";
  if (logical.includes("JournalTable")) return "Journal";
  if (logical.includes("UsersTable") || logical.includes("MedimadeUsers"))
    return "Users";
  if (logical.includes("MagicLink")) return "MagicLink";
  if (logical.includes("Refresh")) return "Refresh";
  // IdeateTable physical logical id is IdeateTable…
  if (logical.startsWith("Ideate") && !logical.includes("Famous")) return "Ideate";
  return null;
}

function collectTables(stackName: string): Map<string, string> {
  const map = new Map<string, string>();
  const stacks = [stackName];
  for (let i = 0; i < stacks.length; i++) {
    const s = stacks[i]!;
    const rows = awsJson([
      "cloudformation",
      "list-stack-resources",
      "--stack-name",
      s,
    ]) as {
      StackResourceSummaries?: {
        ResourceType?: string;
        LogicalResourceId?: string;
        PhysicalResourceId?: string;
      }[];
    };
    for (const r of rows.StackResourceSummaries || []) {
      const typ = r.ResourceType || "";
      const logical = r.LogicalResourceId || "";
      const physical = r.PhysicalResourceId || "";
      if (!physical) continue;
      if (typ === "AWS::CloudFormation::Stack") {
        const parts = physical.split("/");
        const nested = parts[parts.length - 2];
        if (nested) stacks.push(nested);
      } else if (typ === "AWS::DynamoDB::Table") {
        const key = normalizeKey(logical);
        if (key) map.set(key, physical);
      }
    }
  }
  return map;
}

async function copyTable(src: string, dst: string): Promise<number> {
  console.log(`\nDDB ${src}\n → ${dst}`);
  if (dryRun) {
    const desc = await ddb.send(new DescribeTableCommand({ TableName: src }));
    console.log(
      `  dry-run ~${desc.Table?.ItemCount ?? "?"} items / ${desc.Table?.TableSizeBytes ?? "?"} bytes`,
    );
    return 0;
  }
  let copied = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const scan = await ddb.send(
      new ScanCommand({
        TableName: src,
        ExclusiveStartKey: startKey as never,
      }),
    );
    const items = scan.Items || [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      let req: Record<string, { PutRequest: { Item: (typeof chunk)[0] } }[]> = {
        [dst]: chunk.map((Item) => ({ PutRequest: { Item } })),
      };
      for (let attempt = 0; attempt < 12; attempt++) {
        const res = await ddb.send(
          new BatchWriteItemCommand({ RequestItems: req as never }),
        );
        const left = res.UnprocessedItems?.[dst];
        if (!left?.length) break;
        req = { [dst]: left as never };
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
      }
      copied += chunk.length;
      process.stdout.write(`\r  ${copied}`);
    }
    startKey = scan.LastEvaluatedKey as never;
  } while (startKey);
  console.log(`\n  done (${copied} items)`);
  return copied;
}

async function main() {
  console.log({ REGION, dryRun, skipS3, skipDdb });
  const src = collectTables("MedimadeBackend");
  const dst = collectTables("ConsciouslyBackend");
  console.log("src", Object.fromEntries(src));
  console.log("dst", Object.fromEntries(dst));

  if (!skipDdb) {
    for (const key of [...src.keys()].sort()) {
      const a = src.get(key);
      const b = dst.get(key);
      if (!a || !b) {
        console.warn(`SKIP ${key}: src=${a || "?"} dst=${b || "?"}`);
        continue;
      }
      await copyTable(a, b);
    }
  }

  if (!skipS3) {
    const srcBucket = awsText([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      "MedimadeBackend",
      "--query",
      "Stacks[0].Outputs[?OutputKey=='MediaBucketName'].OutputValue|[0]",
    ]);
    const dstBucket = awsText([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      "ConsciouslyBackend",
      "--query",
      "Stacks[0].Outputs[?OutputKey=='MediaBucketName'].OutputValue|[0]",
    ]);
    console.log(`\nS3 s3://${srcBucket} → s3://${dstBucket}`);
    if (dryRun) {
      console.log("  dry-run: would aws s3 sync");
    } else {
      execFileSync(
        "aws",
        [
          "s3",
          "sync",
          `s3://${srcBucket}`,
          `s3://${dstBucket}`,
          "--region",
          REGION,
          "--only-show-errors",
        ],
        { stdio: "inherit", env: process.env },
      );
      console.log("  s3 sync complete");
    }
  }
  console.log("\nFinished (source untouched).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
