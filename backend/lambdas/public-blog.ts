import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  blogBodyHasContent,
  getBlogPostBySlug,
  getBlogSettings,
  listPublishedBlogPosts,
} from "./_shared/blog";

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});
  if (method !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const slug = event.pathParameters?.slug?.trim();
    if (slug) {
      const post = await getBlogPostBySlug(slug, { publishedOnly: true });
      if (!post) return json(404, { error: "Not found" });
      return json(200, { post });
    }
    const [posts, settings] = await Promise.all([
      listPublishedBlogPosts(),
      getBlogSettings(),
    ]);
    // Index payload omits full body for bandwidth.
    return json(200, {
      indexSummary: settings.indexSummary,
      authorPhotoUrl: settings.authorPhotoUrl,
      authorPhotoEnabled: settings.authorPhotoEnabled,
      posts: posts.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        subheader: p.subheader,
        excerpt: p.excerpt,
        tags: p.tags,
        series: p.series,
        part: p.part,
        hasBody: blogBodyHasContent(p.body),
        audioUrl: p.audioUrl,
        publishedAt: p.publishedAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Public blog failed";
    console.error("public-blog", msg);
    return json(500, { error: msg });
  }
}
