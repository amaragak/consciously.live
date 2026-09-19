/**
 * Server-side public Read helpers for marketing SSR pages (`/read`).
 *
 * Responses are cached indefinitely (`revalidate: false`) and tagged so admin
 * saves can purge via `POST /api/revalidate-blog`.
 */

export type PublicBlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  subheader: string;
  excerpt: string;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
};

export type PublicBlogPost = PublicBlogPostSummary & {
  body: string;
};

export type PublicBlogIndex = {
  indexSummary: string;
  authorPhotoUrl: string | null;
  authorPhotoEnabled: boolean;
  posts: PublicBlogPostSummary[];
};

/** Tag for /read index + list payload. */
export const BLOG_INDEX_TAG = "blog-index";

/** Tag for a single published post (and its page). */
export function blogPostTag(slug: string): string {
  return `blog-post:${slug.trim().toLowerCase()}`;
}

const DEFAULT_INDEX_SUMMARY = "Essays and updates from Consciously.";

function apiBase(): string | null {
  const u = process.env.NEXT_PUBLIC_MEDIMADE_API_URL?.trim().replace(/\/$/, "");
  return u || null;
}

function coerceTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

function coerceSummary(raw: unknown): PublicBlogPostSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const slug = typeof o.slug === "string" ? o.slug.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!id || !slug || !title) return null;
  return {
    id,
    slug,
    title,
    subheader: typeof o.subheader === "string" ? o.subheader.trim() : "",
    excerpt: typeof o.excerpt === "string" ? o.excerpt.trim() : "",
    tags: coerceTags(o.tags),
    publishedAt:
      typeof o.publishedAt === "string" && o.publishedAt.trim()
        ? o.publishedAt.trim()
        : null,
    updatedAt:
      typeof o.updatedAt === "string" && o.updatedAt.trim()
        ? o.updatedAt.trim()
        : "",
  };
}

export async function fetchPublishedBlogIndex(): Promise<PublicBlogIndex> {
  const base = apiBase();
  if (!base) {
    return {
      indexSummary: DEFAULT_INDEX_SUMMARY,
      authorPhotoUrl: null,
      authorPhotoEnabled: false,
      posts: [],
    };
  }
  try {
    const res = await fetch(`${base}/public/blog`, {
      next: { revalidate: false, tags: [BLOG_INDEX_TAG] },
    });
    if (!res.ok) {
      return {
        indexSummary: DEFAULT_INDEX_SUMMARY,
        authorPhotoUrl: null,
        authorPhotoEnabled: false,
        posts: [],
      };
    }
    const data = (await res.json()) as {
      posts?: unknown[];
      indexSummary?: unknown;
      authorPhotoUrl?: unknown;
      authorPhotoEnabled?: unknown;
    };
    const indexSummary =
      typeof data.indexSummary === "string" && data.indexSummary.trim()
        ? data.indexSummary.trim()
        : DEFAULT_INDEX_SUMMARY;
    const authorPhotoUrl =
      typeof data.authorPhotoUrl === "string" && data.authorPhotoUrl.trim()
        ? data.authorPhotoUrl.trim()
        : null;
    return {
      indexSummary,
      authorPhotoUrl,
      authorPhotoEnabled: data.authorPhotoEnabled === true,
      posts: (data.posts ?? [])
        .map(coerceSummary)
        .filter((p): p is PublicBlogPostSummary => Boolean(p)),
    };
  } catch {
    return {
      indexSummary: DEFAULT_INDEX_SUMMARY,
      authorPhotoUrl: null,
      authorPhotoEnabled: false,
      posts: [],
    };
  }
}

/** @deprecated Prefer fetchPublishedBlogIndex */
export async function fetchPublishedBlogPosts(): Promise<PublicBlogPostSummary[]> {
  const { posts } = await fetchPublishedBlogIndex();
  return posts;
}

export async function fetchPublishedBlogPost(
  slug: string,
): Promise<PublicBlogPost | null> {
  const base = apiBase();
  const s = slug.trim();
  if (!base || !s) return null;
  try {
    const res = await fetch(`${base}/public/blog/${encodeURIComponent(s)}`, {
      next: {
        revalidate: false,
        tags: [blogPostTag(s), BLOG_INDEX_TAG],
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: unknown };
    const summary = coerceSummary(data.post);
    if (!summary || !data.post || typeof data.post !== "object") return null;
    const body =
      typeof (data.post as Record<string, unknown>).body === "string"
        ? ((data.post as Record<string, unknown>).body as string)
        : "";
    return { ...summary, body };
  } catch {
    return null;
  }
}

export function formatBlogDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
