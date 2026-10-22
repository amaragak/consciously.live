import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { corsHeadersForEvent } from "./_shared/consciously-auth-tokens";
import { optionsAuth } from "./_shared/consciously-auth-http";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IP_WINDOW_SEC = 60 * 60;
const IP_MAX_PER_WINDOW = 8;

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function json(
  event: APIGatewayProxyEventV2,
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeadersForEvent(event),
    },
    body: JSON.stringify(payload),
  };
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function clip(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, max);
}

function clientIp(event: APIGatewayProxyEventV2): string {
  return event.requestContext.http.sourceIp?.trim() || "unknown";
}

async function rateLimited(table: string, ip: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const key = `rate#ip#${ip}`;
  const got = await ddb.send(
    new GetCommand({ TableName: table, Key: { email: key } }),
  );
  const item = got.Item as { count?: number; windowStart?: number } | undefined;
  if (
    item &&
    typeof item.windowStart === "number" &&
    now - item.windowStart < IP_WINDOW_SEC
  ) {
    const count = typeof item.count === "number" ? item.count : 0;
    if (count >= IP_MAX_PER_WINDOW) return true;
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          email: key,
          kind: "rate",
          count: count + 1,
          windowStart: item.windowStart,
          ttl: item.windowStart + IP_WINDOW_SEC + 120,
        },
      }),
    );
    return false;
  }
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        email: key,
        kind: "rate",
        count: 1,
        windowStart: now,
        ttl: now + IP_WINDOW_SEC + 120,
      },
    }),
  );
  return false;
}

/**
 * Public waitlist sign-up. Does not send email.
 * Same address updates the row (adds a brief only when the row has none).
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") return json(event, 405, { error: "Method not allowed" });

  const table = process.env.WAITLIST_TABLE_NAME?.trim();
  if (!table) return json(event, 500, { error: "Waitlist is not configured" });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return json(event, 400, { error: "Invalid JSON body" });
  }

  if (typeof body.company === "string" && body.company.trim()) {
    return json(event, 200, { status: "joined", briefSaved: false });
  }

  const email = normalizeEmail(body.email);
  if (!email) return json(event, 400, { error: "Enter a valid email address." });

  if (await rateLimited(table, clientIp(event))) {
    return json(event, 429, { error: "Too many attempts. Try again in a little while." });
  }

  const brief = clip(body.brief, 2000);
  const source = clip(body.source, 80) || "unknown";
  const referrer = clip(body.referrer, 500);
  const utmIn = body.utm;
  const utm: Record<string, string> = {};
  if (utmIn && typeof utmIn === "object") {
    for (const key of UTM_KEYS) {
      const value = clip((utmIn as Record<string, unknown>)[key], 200);
      if (value) utm[key] = value;
    }
  }

  const now = new Date().toISOString();
  const existing = await ddb.send(
    new GetCommand({ TableName: table, Key: { email } }),
  );
  const row = existing.Item as
    | { kind?: string; brief?: string; createdAt?: string }
    | undefined;

  if (!row || row.kind === "rate") {
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          email,
          kind: "signup",
          brief: brief || null,
          source,
          referrer,
          utm: Object.keys(utm).length ? utm : null,
          createdAt: now,
          updatedAt: now,
          userId: null,
        },
      }),
    );
    return json(event, 200, { status: "joined", briefSaved: Boolean(brief) });
  }

  const hadBrief = typeof row.brief === "string" && row.brief.trim().length > 0;
  if (!hadBrief && brief) {
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { email },
        UpdateExpression: "SET brief = :b, updatedAt = :u",
        ExpressionAttributeValues: { ":b": brief, ":u": now },
      }),
    );
    return json(event, 200, { status: "updated", briefSaved: true });
  }

  return json(event, 200, { status: "already", briefSaved: false });
}
