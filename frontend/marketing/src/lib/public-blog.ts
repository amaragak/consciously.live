import {
  normalizeBlogCategory,
  type BlogCategory,
} from "@/lib/blog-categories";

/**
 * Server-side public Read helpers for marketing SSR pages (`/read`).
 *
 * In production, responses are cached indefinitely (`revalidate: false`) and
 * tagged so admin saves can purge via `POST /api/revalidate-blog` on the
 * deployed origin. In `next dev`, fetches are uncached — local never receives
 * that purge, so indefinite cache would stay stale forever.
 */

export type PublicBlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  subheader: string;
  excerpt: string;
  tags: string[];
  category: BlogCategory;
  series: string;
  part: number | null;
  hasBody: boolean;
  audioUrl: string | null;
  pinned: boolean;
  topPicks: boolean;
  startHere: boolean;
  coverImageUrl: string | null;
  listenSlug: string | null;
  listenCardLabel: string;
  readMinutes: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type PublicBlogPost = PublicBlogPostSummary & {
  body: string;
};

export function formatBlogSeries(series: string, part: number | null): string {
  const s = series.trim();
  if (s && part != null) return `${s} · Part ${part}`;
  if (s) return s;
  if (part != null) return `Part ${part}`;
  return "";
}

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

const DEFAULT_INDEX_SUMMARY =
  "Essays on consciousness, travel and practice.";

function apiBase(): string | null {
  const u = process.env.NEXT_PUBLIC_MEDIMADE_API_URL?.trim().replace(/\/$/, "");
  return u || null;
}

/** Prod: indefinite tagged cache. Dev: always hit the API (no local purge). */
function blogFetchInit(tags: string[]): RequestInit {
  if (process.env.NODE_ENV === "development") {
    return { cache: "no-store" };
  }
  return { next: { revalidate: false, tags } } as RequestInit;
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
  const pinned = o.pinned === true;
  const readMinutesRaw =
    typeof o.readMinutes === "number"
      ? o.readMinutes
      : Number(String(o.readMinutes ?? "").trim());
  return {
    id,
    slug,
    title,
    subheader: typeof o.subheader === "string" ? o.subheader.trim() : "",
    excerpt: typeof o.excerpt === "string" ? o.excerpt.trim() : "",
    tags: coerceTags(o.tags),
    category: normalizeBlogCategory(o.category),
    series: typeof o.series === "string" ? o.series.trim() : "",
    part: (() => {
      const n =
        typeof o.part === "number" ? o.part : Number(String(o.part ?? "").trim());
      return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
    })(),
    hasBody: o.hasBody === true,
    audioUrl:
      typeof o.audioUrl === "string" && o.audioUrl.trim()
        ? o.audioUrl.trim()
        : null,
    pinned,
    topPicks: o.topPicks === true,
    startHere:
      o.startHere === true ||
      (o.startHere !== false && (pinned || o.topPicks === true)),
    coverImageUrl:
      typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
        ? o.coverImageUrl.trim()
        : null,
    listenSlug:
      typeof o.listenSlug === "string" && o.listenSlug.trim()
        ? o.listenSlug.trim()
        : null,
    listenCardLabel:
      typeof o.listenCardLabel === "string" && o.listenCardLabel.trim()
        ? o.listenCardLabel.trim()
        : "From Listen",
    readMinutes:
      Number.isFinite(readMinutesRaw) && readMinutesRaw >= 1
        ? Math.round(readMinutesRaw)
        : 1,
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
    const res = await fetch(`${base}/public/blog`, blogFetchInit([BLOG_INDEX_TAG]));
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
        .filter((p): p is PublicBlogPostSummary => p != null && p.hasBody)
        .sort((a, b) => {
          const aT = a.publishedAt || a.updatedAt || "";
          const bT = b.publishedAt || b.updatedAt || "";
          return bT.localeCompare(aT);
        }),
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
    const res = await fetch(
      `${base}/public/blog/${encodeURIComponent(s)}`,
      blogFetchInit([blogPostTag(s), BLOG_INDEX_TAG]),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: unknown };
    const summary = coerceSummary(data.post);
    if (!summary || !data.post || typeof data.post !== "object") return null;
    const raw = data.post as Record<string, unknown>;
    const body = typeof raw.body === "string" ? raw.body : "";
    const hasBody =
      raw.hasBody === true ||
      Boolean(
        body
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    // Public Read never surfaces published shells with no article body.
    if (!hasBody) return null;
    return { ...summary, body, hasBody: true };
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

export function formatBlogMetaLine(
  post: Pick<
    PublicBlogPostSummary,
    "category" | "series" | "part" | "publishedAt" | "updatedAt" | "readMinutes"
  >,
  opts?: { includeCategory?: boolean; includeSeries?: boolean },
): string {
  const parts: string[] = [];
  if (opts?.includeSeries !== false) {
    const series = formatBlogSeries(post.series, post.part);
    if (series) parts.push(series);
  }
  if (opts?.includeCategory) {
    if (post.category && post.category !== "Other") parts.push(post.category);
  }
  const date = formatBlogDate(post.publishedAt || post.updatedAt);
  if (date) parts.push(date);
  parts.push(`${post.readMinutes} min read`);
  return parts.join(" · ");
}

/** Pick up to 3 “Read next” essays: same category first, then newest. */
export function pickReadNext(
  current: PublicBlogPostSummary,
  all: PublicBlogPostSummary[],
  limit = 3,
): PublicBlogPostSummary[] {
  const rest = all.filter((p) => p.id !== current.id);
  const same = rest
    .filter((p) => p.category === current.category)
    .sort((a, b) =>
      (b.publishedAt || b.updatedAt).localeCompare(
        a.publishedAt || a.updatedAt,
      ),
    );
  const other = rest
    .filter((p) => p.category !== current.category)
    .sort((a, b) =>
      (b.publishedAt || b.updatedAt).localeCompare(
        a.publishedAt || a.updatedAt,
      ),
    );
  return [...same, ...other].slice(0, limit);
}
