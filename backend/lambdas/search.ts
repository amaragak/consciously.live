/**
 * GET /search?q=… — Algolia user-content search filtered by JWT email
 * (guest → alexmaragakis@hotmail.co.uk).
 * POST /search/reindex — backfill this user's Dynamo content into Algolia.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserJson } from "../lib/medimade-auth-http";
import {
  algoliaUserIdFromEmail,
  getAlgoliaCreds,
  searchUserContent,
  type AlgoliaRecordType,
} from "../lib/algolia";
import { backfillAlgoliaForUser } from "../lib/algolia-backfill";

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(payload),
  };
}

function options(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    },
    body: "",
  };
}

const TYPE_SET = new Set<string>([
  "gratitude",
  "journal",
  "meditation",
  "life_area",
  "goal",
  "todo",
  "value",
  "regret",
  "quote",
  "manifesto",
  "vision",
  "resistance",
]);

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return options();

  const auth = await requireUserJson(event);
  if ("statusCode" in auth) return auth;
  const user = auth as { sub: string; email?: string };

  const path = event.rawPath || event.requestContext.http.path || "";

  if (method === "POST" && path.includes("reindex")) {
    const journalTable = process.env.JOURNAL_TABLE_NAME?.trim();
    const ideateTable = process.env.IDEATE_TABLE_NAME?.trim();
    const meditationTable =
      process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim();
    if (!journalTable || !ideateTable || !meditationTable) {
      return json(500, { error: "Search reindex tables are not configured" });
    }
    const creds = await getAlgoliaCreds();
    if (!creds) {
      return json(503, {
        error:
          "Search is not configured. Create secret medimade/ALGOLIA with appId, adminApiKey, searchApiKey.",
      });
    }
    try {
      const result = await backfillAlgoliaForUser({
        email: algoliaUserIdFromEmail(user.email),
        ownerId: user.sub,
        journalTable,
        ideateTable,
        meditationTable,
      });
      return json(200, { ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reindex failed";
      return json(502, { error: msg });
    }
  }

  if (method !== "GET") return json(405, { error: "Method not allowed" });

  const creds = await getAlgoliaCreds();
  if (!creds) {
    return json(503, {
      error:
        "Search is not configured. Create secret medimade/ALGOLIA with appId, adminApiKey, searchApiKey.",
    });
  }

  const q = (event.queryStringParameters?.q ?? "").trim();
  if (!q) return json(400, { error: "Query parameter `q` is required" });

  const typeRaw = (event.queryStringParameters?.type ?? "").trim();
  const types = typeRaw
    ? typeRaw
        .split(",")
        .map((t) => t.trim())
        .filter((t): t is AlgoliaRecordType => TYPE_SET.has(t))
    : undefined;

  const userId = algoliaUserIdFromEmail(user.email);
  try {
    const hits = await searchUserContent({
      userId,
      query: q.slice(0, 200),
      ...(types?.length ? { types } : {}),
      hitsPerPage: 24,
    });
    return json(200, { userId, hits });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return json(502, { error: msg });
  }
}
