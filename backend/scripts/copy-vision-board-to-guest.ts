/**
 * One-shot: copy visionBoard from a real account onto guest@consciously.live.
 * NEVER writes Continue-as-guest / personal accounts.
 *
 *   AWS_PROFILE=mm npx tsx scripts/copy-vision-board-to-guest.ts
 *   AWS_PROFILE=mm npx tsx scripts/copy-vision-board-to-guest.ts --dry-run
 *   AWS_PROFILE=mm npx tsx scripts/copy-vision-board-to-guest.ts --from you@example.com
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

/** Hard-locked target — never use auth-guest Continue-as-guest email. */
const OPS_GUEST_SEED_EMAIL = "guest@consciously.live";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const dryRun = process.argv.includes("--dry-run");
const fromFlag = process.argv.indexOf("--from");
const SOURCE_EMAIL =
  (fromFlag >= 0 ? process.argv[fromFlag + 1] : undefined)?.trim() ||
  "alexmaragakis@hotmail.co.uk";

const USERS =
  process.env.USERS_TABLE_NAME?.trim() ||
  "MedimadeBackend-MedimadeUsersTable56DCE6C2-1AXT1LLLN1H4S";
const IDEATE =
  process.env.IDEATE_TABLE_NAME?.trim() ||
  "MedimadeBackend-IdeateTable6FC78D26-M84L0GZB3VFS";

const SK_STORE = "STORE";

function assertOpsGuestOnly(email: string): void {
  const e = email.trim().toLowerCase();
  if (e !== OPS_GUEST_SEED_EMAIL) {
    throw new Error(
      `Refusing to seed ${email}. Ops guest scripts may only target ${OPS_GUEST_SEED_EMAIL}.`,
    );
  }
  if (e === SOURCE_EMAIL.trim().toLowerCase()) {
    throw new Error(
      `Refusing to copy visionBoard onto itself (${email}). Use --from another account.`,
    );
  }
}

async function userIdForEmail(email: string): Promise<string> {
  const out = await ddb.send(
    new GetCommand({
      TableName: USERS,
      Key: { email: email.trim().toLowerCase() },
    }),
  );
  const id = out.Item?.userId;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`No userId for ${email}`);
  }
  return id.trim();
}

async function getStore(userId: string): Promise<Record<string, unknown> | null> {
  const out = await ddb.send(
    new GetCommand({
      TableName: IDEATE,
      Key: { pk: userId, sk: SK_STORE },
    }),
  );
  return (out.Item as Record<string, unknown> | undefined) ?? null;
}

async function main() {
  assertOpsGuestOnly(OPS_GUEST_SEED_EMAIL);
  console.log(
    `copy visionBoard ${SOURCE_EMAIL} → ${OPS_GUEST_SEED_EMAIL}`,
    dryRun ? "(dry-run)" : "",
  );

  const sourceId = await userIdForEmail(SOURCE_EMAIL);
  const guestId = await userIdForEmail(OPS_GUEST_SEED_EMAIL);

  const sourceStore = await getStore(sourceId);
  if (!sourceStore) {
    throw new Error(`No Ideate STORE for ${SOURCE_EMAIL}`);
  }
  const visionBoard = sourceStore.visionBoard;
  if (visionBoard == null) {
    throw new Error(`No visionBoard on ${SOURCE_EMAIL}`);
  }

  const guestStore = await getStore(guestId);
  if (!guestStore) {
    throw new Error(`No Ideate STORE for ${OPS_GUEST_SEED_EMAIL}`);
  }

  const next = {
    ...guestStore,
    visionBoard,
    updatedAt: new Date().toISOString(),
  };

  if (dryRun) {
    console.log("Would write visionBoard onto guest STORE.");
    return;
  }

  await ddb.send(
    new PutCommand({
      TableName: IDEATE,
      Item: {
        ...next,
        pk: guestId,
        sk: SK_STORE,
      },
    }),
  );
  console.log("Wrote guest visionBoard.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
