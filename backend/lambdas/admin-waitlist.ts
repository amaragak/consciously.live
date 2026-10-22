import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { optionsAuth } from "./_shared/consciously-auth-http";
import { requireAdminJson } from "./_shared/admin-auth";
import { corsHeadersForEvent } from "./_shared/consciously-auth-tokens";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Signup = {
  email: string;
  brief: string | null;
  source: string | null;
  referrer: string | null;
  utm: Record<string, string> | null;
  createdAt: string | null;
  updatedAt: string | null;
  userId: string | null;
};

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

function csvCell(value: string | null): string {
  const text = value ?? "";
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "GET") return json(event, 405, { error: "Method not allowed" });

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  const table = process.env.WAITLIST_TABLE_NAME?.trim();
  if (!table) return json(event, 500, { error: "Waitlist is not configured" });

  const signups: Signup[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: table,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      const email = typeof item.email === "string" ? item.email : "";
      if (!email || email.startsWith("rate#") || item.kind === "rate") continue;
      signups.push({
        email,
        brief: typeof item.brief === "string" && item.brief.trim() ? item.brief : null,
        source: typeof item.source === "string" ? item.source : null,
        referrer: typeof item.referrer === "string" ? item.referrer : null,
        utm:
          item.utm && typeof item.utm === "object"
            ? (item.utm as Record<string, string>)
            : null,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
        userId: typeof item.userId === "string" ? item.userId : null,
      });
    }
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);

  signups.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const format = event.queryStringParameters?.format;
  if (format === "csv") {
    const header = ["email", "brief", "source", "createdAt", "updatedAt", "userId", "referrer"];
    const lines = [
      header.join(","),
      ...signups.map((row) =>
        [
          row.email,
          row.brief,
          row.source,
          row.createdAt,
          row.updatedAt,
          row.userId,
          row.referrer,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"waitlist.csv\"",
        ...corsHeadersForEvent(event),
      },
      body: lines.join("\n"),
    };
  }

  return json(event, 200, { signups });
}
