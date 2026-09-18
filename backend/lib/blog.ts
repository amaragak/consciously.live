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

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  /** Optional line under the title on the published article. */
  subheader: string;
  /** Optional summary on the Read index (/read). */
  excerpt: string;
  /** HTML (TipTap) or legacy markdown body. */
  body: string;
  published: boolean;
  /** ISO timestamp when first published (sticky after unpublish). */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Site-level Read index copy (not per-post). */
export type BlogSettings = {
  indexSummary: string;
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
    body: typeof raw.body === "string" ? raw.body.slice(0, 100_000) : "",
    published: raw.published === true,
    publishedAt:
      typeof raw.publishedAt === "string" && raw.publishedAt.trim()
        ? raw.publishedAt.trim()
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
    }),
  );
  const posts = (res.Items ?? [])
    .map((item) => coercePost(item as Record<string, unknown>))
    .filter((p): p is BlogPost => Boolean(p));
  posts.sort((a, b) => {
    const aT = a.publishedAt || a.updatedAt;
    const bT = b.publishedAt || b.updatedAt;
    return bT.localeCompare(aT);
  });
  return posts;
}

export async function listPublishedBlogPosts(): Promise<BlogPost[]> {
  const all = await listBlogPosts();
  return all.filter((p) => p.published);
}

export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: BLOG_PK, sk: skForId(id) },
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
    body:
      typeof input.body === "string"
        ? input.body.slice(0, 100_000)
        : (existing?.body ?? ""),
    published,
    publishedAt,
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
  const updatedAt =
    typeof item?.updatedAt === "string" && item.updatedAt.trim()
      ? item.updatedAt.trim()
      : new Date(0).toISOString();
  return { indexSummary: summary, updatedAt };
}

export async function putBlogSettings(input: {
  indexSummary?: unknown;
}): Promise<BlogSettings> {
  const now = new Date().toISOString();
  const existing = await getBlogSettings();
  const indexSummary =
    typeof input.indexSummary === "string"
      ? input.indexSummary.trim().slice(0, 500) || DEFAULT_BLOG_INDEX_SUMMARY
      : existing.indexSummary;
  const settings: BlogSettings = { indexSummary, updatedAt: now };
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: BLOG_PK,
        sk: BLOG_SETTINGS_SK,
        ...settings,
      },
    }),
  );
  return settings;
}
