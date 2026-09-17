/**
 * Backfill Algolia indexes from Dynamo (journal, Manifest, meditations).
 *
 *   AWS_PROFILE=mm npx tsx scripts/backfill-algolia.ts
 *   AWS_PROFILE=mm npx tsx scripts/backfill-algolia.ts --email=you@example.com
 *   AWS_PROFILE=mm npx tsx scripts/backfill-algolia.ts --all
 *   AWS_PROFILE=mm npx tsx scripts/backfill-algolia.ts --dry-run
 *
 * Default email: Continue-as-guest account (alexmaragakis@hotmail.co.uk).
 */

import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ALGOLIA_GUEST_USER_ID,
  backfillAlgoliaForUser,
} from "../lib/algolia-backfill";

const rawDdb = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawDdb, {
  marshallOptions: { removeUndefinedValues: true },
});

const USERS =
  process.env.USERS_TABLE_NAME?.trim() ||
  "MedimadeBackend-MedimadeUsersTable56DCE6C2-1AXT1LLLN1H4S";
const IDEATE =
  process.env.IDEATE_TABLE_NAME?.trim() ||
  "MedimadeBackend-IdeateTable6FC78D26-M84L0GZB3VFS";
const ANALYTICS =
  process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim() ||
  "MedimadeBackend-MeditationAnalyticsTableDBD22E65-INTB3IF3ZBC";

const dryRun = process.argv.includes("--dry-run");
const all = process.argv.includes("--all");
const emailArg = process.argv
  .find((a) => a.startsWith("--email="))
  ?.slice("--email=".length)
  ?.trim()
  .toLowerCase();

async function resolveJournalTable(): Promise<string> {
  const env = process.env.JOURNAL_TABLE_NAME?.trim();
  if (env) return env;
  let start: string | undefined;
  do {
    const out = await rawDdb.send(
      new ListTablesCommand({
        ExclusiveStartTableName: start,
        Limit: 100,
      }),
    );
    const hit = (out.TableNames ?? []).find((t) => t.includes("JournalTable"));
    if (hit) return hit;
    start = out.LastEvaluatedTableName;
  } while (start);
  throw new Error("Could not find JournalTable — set JOURNAL_TABLE_NAME");
}

async function userIdForEmail(
  usersTable: string,
  email: string,
): Promise<string> {
  const out = await ddb.send(
    new GetCommand({
      TableName: usersTable,
      Key: { email: email.trim().toLowerCase() },
    }),
  );
  const uid = out.Item?.userId;
  if (typeof uid !== "string" || !uid.trim()) {
    throw new Error(`No userId for ${email}`);
  }
  return uid.trim();
}

async function listUserEmails(usersTable: string): Promise<string[]> {
  const emails: string[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new ScanCommand({
        TableName: usersTable,
        ProjectionExpression: "email",
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const it of r.Items ?? []) {
      if (typeof it.email === "string" && it.email.trim()) {
        emails.push(it.email.trim().toLowerCase());
      }
    }
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return [...new Set(emails)].sort();
}

async function main(): Promise<void> {
  process.env.ALGOLIA_SECRET_NAME =
    process.env.ALGOLIA_SECRET_NAME?.trim() || "medimade/ALGOLIA";

  const journal = await resolveJournalTable();
  console.log(dryRun ? "Dry run — no Algolia writes" : "Writing to Algolia");
  console.log(`Users table:      ${USERS}`);
  console.log(`Journal table:    ${journal}`);
  console.log(`Ideate table:     ${IDEATE}`);
  console.log(`Analytics table:  ${ANALYTICS}`);

  const emails = all
    ? await listUserEmails(USERS)
    : [emailArg || ALGOLIA_GUEST_USER_ID];

  if (!emails.length) {
    console.log("No users to backfill.");
    return;
  }

  let grand = 0;
  for (const email of emails) {
    try {
      const ownerId = await userIdForEmail(USERS, email);
      const result = await backfillAlgoliaForUser({
        email,
        ownerId,
        journalTable: journal,
        ideateTable: IDEATE,
        meditationTable: ANALYTICS,
        dryRun,
      });
      grand += result.total;
      console.log(
        `${email} → ${result.total} records (journal=${result.journal}, gratitude=${result.gratitude}, manifest=${result.manifest}, meditation=${result.meditation})`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${email}: ${msg}`);
    }
  }
  console.log(`Done. ${grand} total records${dryRun ? " (dry-run)" : ""}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
