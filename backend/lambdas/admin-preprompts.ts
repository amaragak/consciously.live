import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireAdminJson } from "./_shared/admin-auth";
import { listClaudePrepromptsFromDynamo } from "./_shared/claude-preprompts-store";

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

/**
 * Admin read-only Claude preprompts (seeded on deploy from codebase).
 * GET /admin/preprompts
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  if (method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  try {
    const { prompts, meta } = await listClaudePrepromptsFromDynamo();
    return json(200, {
      prompts,
      meta,
      note: "Read-only. Edit prompts in the codebase; redeploy to refresh.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load preprompts";
    console.error("admin-preprompts", e);
    return json(500, { error: msg });
  }
}
