import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireAdminJson } from "./_shared/admin-auth";
import {
  defaultDevUiSettings,
  loadDevUiSettings,
  saveDevUiSettings,
  type DevUiSettings,
} from "./_shared/dev-ui-settings";

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  try {
    if (method === "GET") {
      const settings = await loadDevUiSettings();
      return json(200, { settings });
    }

    if (method === "PATCH") {
      const admin = await requireAdminJson(event);
      if ("statusCode" in admin) return admin;

      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body || "{}") as Record<string, unknown>;
      } catch {
        return json(400, { error: "Invalid JSON" });
      }

      const patch: Partial<DevUiSettings> = {};
      if (typeof body.createAudioDevControls === "boolean") {
        patch.createAudioDevControls = body.createAudioDevControls;
      }
      if (typeof body.libraryDevFlyout === "boolean") {
        patch.libraryDevFlyout = body.libraryDevFlyout;
      }
      if (Object.keys(patch).length === 0) {
        return json(400, {
          error: "Provide createAudioDevControls and/or libraryDevFlyout",
        });
      }
      const settings = await saveDevUiSettings(patch);
      return json(200, { ok: true, settings });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Dev UI settings failed";
    console.error("dev-ui-settings", msg);
    return json(500, { error: msg });
  }
}

/** Exported for tests / defaults documentation. */
export { defaultDevUiSettings };
