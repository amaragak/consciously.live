import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  jsonAuth,
  optionsAuth,
  requireUserJson,
} from "./_shared/consciously-auth-http";
import { corsHeadersForEvent } from "./_shared/consciously-auth-tokens";
import {
  applyUserSettingsPatch,
  defaultUserSettings,
  normalizeUserSettings,
  type UserSettingsV1,
} from "./_shared/user-settings";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

async function loadSettings(
  table: string,
  email: string,
): Promise<{ settings: UserSettingsV1; persisted: boolean }> {
  const got = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { email },
      ProjectionExpression: "appSettings",
    }),
  );
  const raw = (got.Item as { appSettings?: unknown } | undefined)?.appSettings;
  if (raw == null) {
    return { settings: defaultUserSettings(), persisted: false };
  }
  return { settings: normalizeUserSettings(raw), persisted: true };
}

async function saveSettings(
  table: string,
  email: string,
  settings: UserSettingsV1,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { email },
      UpdateExpression: "SET appSettings = :s, updatedAt = :u",
      ExpressionAttributeValues: {
        ":s": settings,
        ":u": new Date().toISOString(),
      },
    }),
  );
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);

  const usersTable = process.env.USERS_TABLE_NAME?.trim();
  if (!usersTable) {
    return json(event, 500, { error: "USERS_TABLE_NAME is not configured" });
  }

  const u = await requireUserJson(event);
  if (!("sub" in u)) return u;
  const email = u.email?.trim().toLowerCase();
  if (!email) {
    return jsonAuth(401, { error: "Session is missing email" }, event);
  }

  if (method === "GET") {
    const loaded = await loadSettings(usersTable, email);
    return json(event, 200, {
      settings: loaded.settings,
      persisted: loaded.persisted,
    });
  }

  if (method === "PATCH") {
    let body: unknown;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(event, 400, { error: "Invalid JSON body" });
    }
    const patch =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "settings" in (body as object)
        ? (body as { settings: unknown }).settings
        : body;
    const current = await loadSettings(usersTable, email);
    const next = applyUserSettingsPatch(current.settings, patch);
    await saveSettings(usersTable, email, next);
    return json(event, 200, { settings: next, persisted: true });
  }

  return json(event, 405, { error: "Method not allowed" });
}
