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

/** ~220 wpm; never typed in — always from body word count. */
function blogReadMinutes(body: string): number {
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
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
      if (!post || !blogBodyHasContent(post.body)) {
        return json(404, { error: "Not found" });
      }
      // Allowlist — omit admin-only fields (notes, audio progress, etc.).
      return json(200, {
        post: {
          id: post.id,
          slug: post.slug,
          title: post.title,
          subheader: post.subheader,
          excerpt: post.excerpt,
          tags: post.tags,
          category: post.category,
          series: post.series,
          part: post.part,
          body: post.body,
          hasBody: true,
          published: post.published,
          pinned: post.pinned,
          topPicks: post.topPicks,
          startHere: post.startHere,
          coverImageUrl: post.coverImageUrl,
          listenSlug: post.listenSlug,
          listenCardLabel: post.listenCardLabel,
          readMinutes: blogReadMinutes(post.body),
          publishedAt: post.publishedAt,
          audioUrl: post.audioUrl,
          audioStatus: post.audioStatus === "ready" ? "ready" : "none",
          updatedAt: post.updatedAt,
        },
      });
    }
    const [posts, settings] = await Promise.all([
      listPublishedBlogPosts(),
      getBlogSettings(),
    ]);
    // Index payload omits full body for bandwidth; skip empty published drafts.
    return json(200, {
      indexSummary: settings.indexSummary,
      authorPhotoUrl: settings.authorPhotoUrl,
      authorPhotoEnabled: settings.authorPhotoEnabled,
      posts: posts
        .filter((p) => blogBodyHasContent(p.body))
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          subheader: p.subheader,
          excerpt: p.excerpt,
          tags: p.tags,
          category: p.category,
          series: p.series,
          part: p.part,
          hasBody: true,
          audioUrl: p.audioUrl,
          pinned: p.pinned,
          topPicks: p.topPicks,
          startHere: p.startHere,
          coverImageUrl: p.coverImageUrl,
          listenSlug: p.listenSlug,
          listenCardLabel: p.listenCardLabel,
          readMinutes: blogReadMinutes(p.body),
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
