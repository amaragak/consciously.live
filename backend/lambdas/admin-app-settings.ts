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
import { handler as libraryCategoriesHandler } from "./admin-library-categories";

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

function wantsCategoryImages(event: APIGatewayProxyEventV2): boolean {
  const q = event.queryStringParameters ?? {};
  return q.categoryImages === "1" || q.categoryImages === "true";
}

function parseJsonBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  let raw = event.body ?? "";
  if (event.isBase64Encoded && raw) {
    raw = Buffer.from(raw, "base64").toString("utf-8");
  }
  return JSON.parse(raw || "{}") as Record<string, unknown>;
}

/** Any category-image shaped PATCH — never fall through to Dev UI settings. */
function isCategoryImageRequest(body: Record<string, unknown>): boolean {
  if (typeof body.action === "string" && body.action.trim()) return true;
  if (typeof body.category === "string" && body.category.trim()) return true;
  if (typeof body.prompt === "string") return true;
  if (typeof body.imageBase64 === "string") return true;
  return false;
}

/**
 * Shared Lambda (CFN 500-resource cap): Dev UI gates + library category images.
 *
 * Category images (admin-only mutations; public list via query):
 * - GET ?categoryImages=1
 * - PATCH ?categoryImages=1  { action: upload|generate|clear, category, ... }
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  try {
    if (method === "GET" && wantsCategoryImages(event)) {
      return libraryCategoriesHandler(event);
    }

    if (method === "GET") {
      const settings = await loadDevUiSettings();
      return json(200, { settings });
    }

    if (method === "PATCH") {
      const admin = await requireAdminJson(event);
      if ("statusCode" in admin) return admin;

      let body: Record<string, unknown> = {};
      try {
        body = parseJsonBody(event);
      } catch {
        return json(400, { error: "Invalid JSON" });
      }

      if (wantsCategoryImages(event) || isCategoryImageRequest(body)) {
        return libraryCategoriesHandler({
          ...event,
          body: JSON.stringify(body),
          isBase64Encoded: false,
          requestContext: {
            ...event.requestContext,
            http: {
              ...event.requestContext.http,
              method: "POST",
              path: "/admin/library-categories",
            },
          },
          rawPath: "/admin/library-categories",
        });
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
    const msg = e instanceof Error ? e.message : "Admin app settings failed";
    console.error("admin-app-settings", msg);
    return json(500, { error: msg });
  }
}

/** Exported for tests / defaults documentation. */
export { defaultDevUiSettings };
