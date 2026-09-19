import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const BLOG_PK = "BLOG";
const BLOG_SETTINGS_SK = "SETTINGS";

export const DEFAULT_BLOG_INDEX_SUMMARY =
  "Essays and updates from Consciously.";

export type BlogAudioStatus = "none" | "generating" | "ready" | "failed";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  /** Optional line under the title on the published article. */
  subheader: string;
  /** Optional summary on the Read index (/read). */
  excerpt: string;
  /** Topic chips shown on the index and article. */
  tags: string[];
  /** Optional series name (e.g. “Chasing Mountains”). */
  series: string;
  /** Optional 1-based part within the series. */
  part: number | null;
  /** HTML (TipTap) or legacy markdown body. */
  body: string;
  published: boolean;
  /** ISO timestamp when first published (sticky after unpublish). */
  publishedAt: string | null;
  /** CloudFront URL for Fish TTS narration (no FX, no music). */
  audioUrl: string | null;
  audioStatus: BlogAudioStatus;
  audioError: string | null;
  audioGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Site-level Read index copy (not per-post). */
export type BlogSettings = {
  indexSummary: string;
  /** CloudFront URL for the author photo on /read (null if unset). */
  authorPhotoUrl: string | null;
  /** When true, public /read shows the author photo (if a URL is set). */
  authorPhotoEnabled: boolean;
  updatedAt: string;
};

type BlogRow = BlogPost & {
  pk: typeof BLOG_PK;
  sk: string;
};

function tableName(): string {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!n) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  return n;
}

function skForId(id: string): string {
  return `POST#${id}`;
}

export function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `post-${randomUUID().slice(0, 8)}`;
}

const MAX_BLOG_TAGS = 12;
const MAX_BLOG_TAG_LEN = 40;
const MAX_BLOG_SERIES_LEN = 80;

/** Strip HTML/markdown to plain text for “has content” and TTS. */
export function htmlToNarrationText(source: string): string {
  let t = source.replace(/\r\n/g, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(?:p|h[1-6]|li|blockquote|div)>/gi, "\n\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

export function blogBodyHasContent(body: string): boolean {
  return htmlToNarrationText(body).length > 0;
}

export function normalizeBlogSeries(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_BLOG_SERIES_LEN);
}

export function normalizeBlogPart(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 1 || i > 999) return null;
  return i;
}

function coerceAudioStatus(raw: unknown): BlogAudioStatus {
  if (raw === "generating" || raw === "ready" || raw === "failed") return raw;
  return "none";
}

/** Normalize tag chips: trim, drop empties, case-insensitive dedupe, cap count/length. */
export function normalizeBlogTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, MAX_BLOG_TAG_LEN);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_BLOG_TAGS) break;
  }
  return out;
}

function coercePost(raw: Record<string, unknown>): BlogPost | null {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
  if (!id) return null;
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 200)
      : "Untitled";
  const slugRaw =
    typeof raw.slug === "string" && raw.slug.trim()
      ? raw.slug.trim().toLowerCase()
      : slugifyTitle(title);
  const slug = slugRaw
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return {
    id,
    slug: slug || slugifyTitle(title),
    title,
    subheader:
      typeof raw.subheader === "string"
        ? raw.subheader.trim().slice(0, 300)
        : "",
    excerpt:
      typeof raw.excerpt === "string" ? raw.excerpt.trim().slice(0, 500) : "",
    tags: normalizeBlogTags(raw.tags),
    series: normalizeBlogSeries(raw.series),
    part: normalizeBlogPart(raw.part),
    body: typeof raw.body === "string" ? raw.body.slice(0, 100_000) : "",
    published: raw.published === true,
    publishedAt:
      typeof raw.publishedAt === "string" && raw.publishedAt.trim()
        ? raw.publishedAt.trim()
        : null,
    audioUrl:
      typeof raw.audioUrl === "string" && raw.audioUrl.trim()
        ? raw.audioUrl.trim().slice(0, 2048)
        : null,
    audioStatus: coerceAudioStatus(raw.audioStatus),
    audioError:
      typeof raw.audioError === "string" && raw.audioError.trim()
        ? raw.audioError.trim().slice(0, 500)
        : null,
    audioGeneratedAt:
      typeof raw.audioGeneratedAt === "string" && raw.audioGeneratedAt.trim()
        ? raw.audioGeneratedAt.trim()
        : null,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt.trim()
        : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt.trim()
        : new Date().toISOString(),
  };
}

function rowToPost(row: BlogRow): BlogPost {
  const { pk: _pk, sk: _sk, ...rest } = row;
  void _pk;
  void _sk;
  return rest;
}

export async function listBlogPosts(): Promise<BlogPost[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": BLOG_PK,
        ":prefix": "POST#",
      },
      // Admin save → immediate re-list; eventual reads can return the prior title
      // (capitalization-only edits look like “save did nothing”).
      ConsistentRead: true,
    }),
  );
  const posts = (res.Items ?? [])
    .map((item) => coercePost(item as Record<string, unknown>))
    .filter((p): p is BlogPost => Boolean(p));
  posts.sort(compareAdminBlogPosts);
  return posts;
}

function compareAdminBlogPosts(a: BlogPost, b: BlogPost): number {
  const aT = a.publishedAt || a.updatedAt;
  const bT = b.publishedAt || b.updatedAt;
  return bT.localeCompare(aT);
}

function comparePublishedBlogPosts(a: BlogPost, b: BlogPost): number {
  const aHas = blogBodyHasContent(a.body) ? 0 : 1;
  const bHas = blogBodyHasContent(b.body) ? 0 : 1;
  if (aHas !== bHas) return aHas - bHas;
  const aSeries = a.series.toLowerCase();
  const bSeries = b.series.toLowerCase();
  if (aSeries && bSeries && aSeries !== bSeries) {
    return aSeries.localeCompare(bSeries);
  }
  if (aSeries && !bSeries) return -1;
  if (!aSeries && bSeries) return 1;
  if (aSeries && bSeries) {
    const aPart = a.part ?? 9999;
    const bPart = b.part ?? 9999;
    if (aPart !== bPart) return aPart - bPart;
  }
  const aT = a.publishedAt || a.updatedAt;
  const bT = b.publishedAt || b.updatedAt;
  return bT.localeCompare(aT);
}

export async function listPublishedBlogPosts(): Promise<BlogPost[]> {
  const all = await listBlogPosts();
  return all.filter((p) => p.published).sort(comparePublishedBlogPosts);
}

export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: BLOG_PK, sk: skForId(id) },
      ConsistentRead: true,
    }),
  );
  if (!res.Item) return null;
  return coercePost(res.Item as Record<string, unknown>);
}

export async function getBlogPostBySlug(
  slug: string,
  opts?: { publishedOnly?: boolean },
): Promise<BlogPost | null> {
  const needle = slug.trim().toLowerCase();
  if (!needle) return null;
  const all = await listBlogPosts();
  const post = all.find((p) => p.slug === needle) ?? null;
  if (!post) return null;
  if (opts?.publishedOnly && !post.published) return null;
  return post;
}

export async function putBlogPost(
  input: Record<string, unknown>,
): Promise<BlogPost> {
  const now = new Date().toISOString();
  const existingId =
    typeof input.id === "string" && input.id.trim() ? input.id.trim() : "";
  const existing = existingId ? await getBlogPostById(existingId) : null;

  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim().slice(0, 200)
      : existing?.title || "Untitled";
  const slugInput =
    typeof input.slug === "string" && input.slug.trim()
      ? input.slug.trim()
      : existing?.slug || slugifyTitle(title);
  let slug = slugifyTitle(slugInput.replace(/-/g, " "));
  // Prefer explicit slug with hyphens preserved
  if (typeof input.slug === "string" && input.slug.trim()) {
    slug = input.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
  }

  // Unique slug (excluding self)
  const all = await listBlogPosts();
  let unique = slug || slugifyTitle(title);
  if (all.some((p) => p.slug === unique && p.id !== existingId)) {
    unique = `${unique}-${randomUUID().slice(0, 6)}`;
  }

  const published =
    typeof input.published === "boolean"
      ? input.published
      : (existing?.published ?? false);
  let publishedAt = existing?.publishedAt ?? null;
  if (published && !publishedAt) publishedAt = now;
  if (!published) {
    // Keep publishedAt for history; only clear if never published
    publishedAt = existing?.publishedAt ?? null;
  }

  const post: BlogPost = {
    id: existingId || randomUUID(),
    slug: unique,
    title,
    subheader:
      typeof input.subheader === "string"
        ? input.subheader.trim().slice(0, 300)
        : (existing?.subheader ?? ""),
    excerpt:
      typeof input.excerpt === "string"
        ? input.excerpt.trim().slice(0, 500)
        : (existing?.excerpt ?? ""),
    tags: Object.prototype.hasOwnProperty.call(input, "tags")
      ? normalizeBlogTags(input.tags)
      : (existing?.tags ?? []),
    series: Object.prototype.hasOwnProperty.call(input, "series")
      ? normalizeBlogSeries(input.series)
      : (existing?.series ?? ""),
    part: Object.prototype.hasOwnProperty.call(input, "part")
      ? normalizeBlogPart(input.part)
      : (existing?.part ?? null),
    body:
      typeof input.body === "string"
        ? input.body.slice(0, 100_000)
        : (existing?.body ?? ""),
    published,
    publishedAt,
    audioUrl: existing?.audioUrl ?? null,
    audioStatus: existing?.audioStatus ?? "none",
    audioError: existing?.audioError ?? null,
    audioGeneratedAt: existing?.audioGeneratedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const row: BlogRow = {
    pk: BLOG_PK,
    sk: skForId(post.id),
    ...post,
  };
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: row,
    }),
  );
  return post;
}

export async function patchBlogPostAudio(
  id: string,
  patch: {
    audioUrl?: string | null;
    audioStatus?: BlogAudioStatus;
    audioError?: string | null;
    audioGeneratedAt?: string | null;
  },
): Promise<BlogPost> {
  const existing = await getBlogPostById(id);
  if (!existing) throw new Error("Post not found");
  const post: BlogPost = {
    ...existing,
    audioUrl:
      Object.prototype.hasOwnProperty.call(patch, "audioUrl")
        ? patch.audioUrl ?? null
        : existing.audioUrl,
    audioStatus: patch.audioStatus ?? existing.audioStatus,
    audioError:
      Object.prototype.hasOwnProperty.call(patch, "audioError")
        ? patch.audioError ?? null
        : existing.audioError,
    audioGeneratedAt:
      Object.prototype.hasOwnProperty.call(patch, "audioGeneratedAt")
        ? patch.audioGeneratedAt ?? null
        : existing.audioGeneratedAt,
    updatedAt: new Date().toISOString(),
  };
  const row: BlogRow = {
    pk: BLOG_PK,
    sk: skForId(post.id),
    ...post,
  };
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: row,
    }),
  );
  return post;
}

export async function deleteBlogPost(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: BLOG_PK, sk: skForId(id) },
    }),
  );
}

export async function getBlogSettings(): Promise<BlogSettings> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: BLOG_PK, sk: BLOG_SETTINGS_SK },
    }),
  );
  const item = res.Item as Record<string, unknown> | undefined;
  const summary =
    typeof item?.indexSummary === "string" && item.indexSummary.trim()
      ? item.indexSummary.trim().slice(0, 500)
      : DEFAULT_BLOG_INDEX_SUMMARY;
  const photoRaw =
    typeof item?.authorPhotoUrl === "string" ? item.authorPhotoUrl.trim() : "";
  const updatedAt =
    typeof item?.updatedAt === "string" && item.updatedAt.trim()
      ? item.updatedAt.trim()
      : new Date(0).toISOString();
  return {
    indexSummary: summary,
    authorPhotoUrl: photoRaw || null,
    authorPhotoEnabled: item?.authorPhotoEnabled === true,
    updatedAt,
  };
}

export async function putBlogSettings(input: {
  indexSummary?: unknown;
  authorPhotoUrl?: unknown;
  authorPhotoEnabled?: unknown;
}): Promise<BlogSettings> {
  const now = new Date().toISOString();
  const existing = await getBlogSettings();
  const indexSummary =
    typeof input.indexSummary === "string"
      ? input.indexSummary.trim().slice(0, 500) || DEFAULT_BLOG_INDEX_SUMMARY
      : existing.indexSummary;
  let authorPhotoUrl = existing.authorPhotoUrl;
  if (Object.prototype.hasOwnProperty.call(input, "authorPhotoUrl")) {
    if (
      input.authorPhotoUrl === null ||
      input.authorPhotoUrl === "" ||
      (typeof input.authorPhotoUrl === "string" && !input.authorPhotoUrl.trim())
    ) {
      authorPhotoUrl = null;
    } else if (typeof input.authorPhotoUrl === "string") {
      authorPhotoUrl = input.authorPhotoUrl.trim().slice(0, 2048);
    }
  }
  const authorPhotoEnabled = Object.prototype.hasOwnProperty.call(
    input,
    "authorPhotoEnabled",
  )
    ? input.authorPhotoEnabled === true
    : existing.authorPhotoEnabled;
  const settings: BlogSettings = {
    indexSummary,
    authorPhotoUrl,
    authorPhotoEnabled,
    updatedAt: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: BLOG_PK,
        sk: BLOG_SETTINGS_SK,
        indexSummary: settings.indexSummary,
        authorPhotoEnabled: settings.authorPhotoEnabled,
        updatedAt: settings.updatedAt,
        ...(settings.authorPhotoUrl
          ? { authorPhotoUrl: settings.authorPhotoUrl }
          : {}),
      },
    }),
  );
  return settings;
}
