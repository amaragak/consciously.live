import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  getGuideByAreaSlug,
  incrementGuideHelpful,
  isGuideArea,
  listPublishedGuides,
  type Guide,
} from "./_shared/guides";

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  let raw = event.body ?? "";
  if (event.isBase64Encoded && raw) {
    raw = Buffer.from(raw, "base64").toString("utf-8");
  }
  return JSON.parse(raw || "{}") as Record<string, unknown>;
}

/** List payload omits `body` for bandwidth. */
function toListItem(g: Guide) {
  return {
    id: g.id,
    area: g.area,
    slug: g.slug,
    title: g.title,
    summary: g.summary,
    category: g.category,
    coverImageUrl: g.coverImageUrl,
    practiceBrief: g.practiceBrief,
    readMinutes: g.readMinutes,
    order: g.order,
    updatedAt: g.updatedAt,
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  try {
    const areaParam = event.pathParameters?.area?.trim().toLowerCase();
    const slug = event.pathParameters?.slug?.trim().toLowerCase();

    // POST /public/guides/{area}/{slug}/helpful
    if (method === "POST") {
      if (!areaParam || !slug || !isGuideArea(areaParam)) {
        return json(404, { error: "Not found" });
      }
      let body: Record<string, unknown> = {};
      try {
        body = parseBody(event);
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const vote =
        body.vote ?? event.queryStringParameters?.vote?.trim().toLowerCase();
      if (vote !== "yes" && vote !== "no") {
        return json(400, { error: "vote must be 'yes' or 'no'" });
      }
      const guide = await getGuideByAreaSlug(areaParam, slug, {
        publishedOnly: true,
      });
      if (!guide) return json(404, { error: "Not found" });
      const updated = await incrementGuideHelpful(guide.id, vote);
      if (!updated) return json(404, { error: "Not found" });
      return json(200, {
        ok: true,
        helpfulYes: updated.helpfulYes,
        helpfulNo: updated.helpfulNo,
      });
    }

    if (method !== "GET") return json(405, { error: "Method not allowed" });

    // GET /public/guides/{area}/{slug}
    if (areaParam && slug) {
      if (!isGuideArea(areaParam)) return json(404, { error: "Not found" });
      const guide = await getGuideByAreaSlug(areaParam, slug, {
        publishedOnly: true,
      });
      if (!guide) return json(404, { error: "Not found" });
      return json(200, {
        guide: {
          ...toListItem(guide),
          body: guide.body,
          status: guide.status,
          createdAt: guide.createdAt,
          helpfulYes: guide.helpfulYes,
          helpfulNo: guide.helpfulNo,
        },
      });
    }

    // GET /public/guides?area=meditate|journal
    const areaQuery = event.queryStringParameters?.area?.trim().toLowerCase();
    if (areaQuery && !isGuideArea(areaQuery)) {
      return json(400, { error: "area must be 'meditate' or 'journal'" });
    }
    const guides = await listPublishedGuides(
      areaQuery && isGuideArea(areaQuery) ? areaQuery : undefined,
    );
    return json(200, { guides: guides.map(toListItem) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Public guides failed";
    console.error("public-guides", msg);
    return json(500, { error: msg });
  }
}
