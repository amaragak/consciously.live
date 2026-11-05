import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Fixed-window counter stored in a `token`-keyed table with a `ttl` attribute
 * (the magic-link table). Returns true when `key` has used up `maxCount` in the window.
 */
export async function rateLimited(
  table: string,
  key: string,
  windowSec: number,
  maxCount: number,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const got = await ddb.send(new GetCommand({ TableName: table, Key: { token: key } }));
  const item = got.Item as { count?: number; windowStart?: number } | undefined;
  const inWindow =
    item && typeof item.windowStart === "number" && now - item.windowStart < windowSec;
  const count = inWindow && typeof item.count === "number" ? item.count : 0;
  if (inWindow && count >= maxCount) return true;
  const windowStart = inWindow ? (item.windowStart as number) : now;
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        token: key,
        kind: "rate",
        count: count + 1,
        windowStart,
        ttl: windowStart + windowSec + 60,
      },
    }),
  );
  return false;
}
