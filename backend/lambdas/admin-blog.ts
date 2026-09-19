import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdminJson } from "../lib/admin-auth";
import { jsonAuth } from "../lib/medimade-auth-http";
import {
  deleteBlogPost,
  getBlogPostById,
  getBlogSettings,
  listBlogPosts,
  putBlogPost,
  putBlogSettings,
} from "../lib/blog";
import { invalidateBlogCache } from "../lib/blog-revalidate";

const s3 = new S3Client({});
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Extract `blog/author-photo…` key from a media URL (ignores query string). */
function authorPhotoKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/(blog\/author-photo[^/?#]*)/i.exec(url);
  return m?.[1] ?? null;
}

function parseImageMime(raw: unknown): "image/jpeg" | "image/png" | "image/webp" {
  const mimeRaw = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (mimeRaw === "image/png") return "image/png";
  if (mimeRaw === "image/webp") return "image/webp";
  return "image/jpeg";
}

function imageExt(mime: "image/jpeg" | "image/png" | "image/webp"): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

async function deleteAuthorPhotoObject(
  bucket: string,
  key: string | null,
): Promise<void> {
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn("admin-blog: could not delete old author photo", key, e);
  }
}

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

function decodeImageBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const dataUrl = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(trimmed);
  const b64 = dataUrl?.[1] ?? trimmed;
  return Buffer.from(b64, "base64");
}

async function putBlogMediaObject(params: {
  key: string;
  body: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
}): Promise<string> {
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!bucket || !cfDomain) {
    throw new Error("MEDIA_BUCKET_NAME or MEDIA_CLOUDFRONT_DOMAIN is not set");
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.mime,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `https://${cfDomain}/${params.key}`;
}

async function uploadAuthorPhoto(body: Record<string, unknown>) {
  const mime = parseImageMime(body.mimeType);

  const b64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!b64) throw new Error("`imageBase64` is required");

  const buf = decodeImageBase64(b64);
  if (!buf.byteLength) throw new Error("Image is empty");
  if (buf.byteLength > MAX_PHOTO_BYTES) {
    throw new Error("Image must be under 2 MB (compress before upload)");
  }

  // Unique key per upload — CloudFront’s default cache policy ignores
  // query strings, so overwriting blog/author-photo.jpg kept serving the old image.
  const key = `blog/author-photo-${Date.now()}.${imageExt(mime)}`;

  const existing = await getBlogSettings();
  const previousKey = authorPhotoKeyFromUrl(existing.authorPhotoUrl);

  const url = await putBlogMediaObject({ key, body: buf, mime });
  const settings = await putBlogSettings({ authorPhotoUrl: url });

  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  if (bucket && previousKey && previousKey !== key) {
    await deleteAuthorPhotoObject(bucket, previousKey);
  }

  await invalidateBlogCache({ index: true });
  return settings;
}

/** Upload an in-post image; returns CDN URL for TipTap insertion. */
async function uploadPostImage(body: Record<string, unknown>): Promise<string> {
  const mime = parseImageMime(body.mimeType);

  const b64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!b64) throw new Error("`imageBase64` is required");

  const buf = decodeImageBase64(b64);
  if (!buf.byteLength) throw new Error("Image is empty");
  if (buf.byteLength > MAX_PHOTO_BYTES) {
    throw new Error("Image must be under 2 MB (compress before upload)");
  }

  const key = `blog/posts/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${imageExt(mime)}`;
  return putBlogMediaObject({ key, body: buf, mime });
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  try {
    if (method === "GET") {
      const [posts, settings] = await Promise.all([
        listBlogPosts(),
        getBlogSettings(),
      ]);
      return json(200, { posts, settings });
    }
    if (method === "PATCH") {
      let body: Record<string, unknown> = {};
      try {
        body = parseBody(event);
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      if (body.settings && typeof body.settings === "object") {
        const settings = await putBlogSettings(
          body.settings as {
            indexSummary?: unknown;
            authorPhotoUrl?: unknown;
          },
        );
        await invalidateBlogCache({ index: true });
        return json(200, { settings });
      }
      const existingId =
        typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
      const previous = existingId ? await getBlogPostById(existingId) : null;
      const post = await putBlogPost(body);
      const slugs = [post.slug];
      if (previous?.slug && previous.slug !== post.slug) {
        slugs.push(previous.slug);
      }
      await invalidateBlogCache({ index: true, slugs });
      return json(200, { post });
    }
    if (method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = parseBody(event);
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const action = String(body.action ?? "").trim();
      if (action === "saveSettings") {
        const settings = await putBlogSettings({
          indexSummary: body.indexSummary,
          ...(Object.prototype.hasOwnProperty.call(body, "authorPhotoUrl")
            ? { authorPhotoUrl: body.authorPhotoUrl }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(body, "authorPhotoEnabled")
            ? { authorPhotoEnabled: body.authorPhotoEnabled }
            : {}),
        });
        await invalidateBlogCache({ index: true });
        return json(200, { settings });
      }
      if (action === "uploadAuthorPhoto") {
        const settings = await uploadAuthorPhoto(body);
        return json(200, { settings });
      }
      if (action === "uploadPostImage") {
        const url = await uploadPostImage(body);
        return json(200, { url });
      }
      if (action === "clearAuthorPhoto") {
        const existing = await getBlogSettings();
        const settings = await putBlogSettings({ authorPhotoUrl: null });
        const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
        if (bucket) {
          await deleteAuthorPhotoObject(
            bucket,
            authorPhotoKeyFromUrl(existing.authorPhotoUrl),
          );
        }
        await invalidateBlogCache({ index: true });
        return json(200, { settings });
      }
      if (action === "delete") {
        const id = String(body.id ?? "").trim();
        if (!id) return json(400, { error: "id is required" });
        const previous = await getBlogPostById(id);
        await deleteBlogPost(id);
        await invalidateBlogCache({
          index: true,
          slugs: previous?.slug ? [previous.slug] : [],
        });
        return json(200, { ok: true });
      }
      return json(400, { error: "Unknown action" });
    }
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin blog failed";
    console.error("admin-blog", msg);
    return json(500, { error: msg });
  }
}
