/**
 * Server-side public Read helpers for marketing SSR pages (`/read`).
 */

export type PublicBlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  updatedAt: string;
};

export type PublicBlogPost = PublicBlogPostSummary & {
  body: string;
};

function apiBase(): string | null {
  const u = process.env.NEXT_PUBLIC_MEDIMADE_API_URL?.trim().replace(/\/$/, "");
  return u || null;
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
    excerpt: typeof o.excerpt === "string" ? o.excerpt.trim() : "",
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

export async function fetchPublishedBlogPosts(): Promise<PublicBlogPostSummary[]> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/public/blog`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: unknown[] };
    return (data.posts ?? [])
      .map(coerceSummary)
      .filter((p): p is PublicBlogPostSummary => Boolean(p));
  } catch {
    return [];
  }
}

export async function fetchPublishedBlogPost(
  slug: string,
): Promise<PublicBlogPost | null> {
  const base = apiBase();
  const s = slug.trim();
  if (!base || !s) return null;
  try {
    const res = await fetch(`${base}/public/blog/${encodeURIComponent(s)}`, {
      next: { revalidate: 60 },
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
