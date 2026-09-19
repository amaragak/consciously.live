import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { requireAdminJson } from "../lib/admin-auth";
import { jsonAuth } from "../lib/medimade-auth-http";
import {
  deleteBlogPost,
  getBlogSettings,
  listBlogPosts,
  putBlogPost,
  putBlogSettings,
} from "../lib/blog";

const s3 = new S3Client({});
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const AUTHOR_PHOTO_KEY = "blog/author-photo.jpg";

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

async function uploadAuthorPhoto(body: Record<string, unknown>) {
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!bucket || !cfDomain) {
    throw new Error("MEDIA_BUCKET_NAME or MEDIA_CLOUDFRONT_DOMAIN is not set");
  }

  const mimeRaw =
    typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const mime =
    mimeRaw === "image/png" ||
    mimeRaw === "image/webp" ||
    mimeRaw === "image/jpeg" ||
    mimeRaw === "image/jpg"
      ? mimeRaw === "image/jpg"
        ? "image/jpeg"
        : mimeRaw
      : "image/jpeg";

  const b64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!b64) throw new Error("`imageBase64` is required");

  const buf = decodeImageBase64(b64);
  if (!buf.byteLength) throw new Error("Image is empty");
  if (buf.byteLength > MAX_PHOTO_BYTES) {
    throw new Error("Image must be under 2 MB (compress before upload)");
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: AUTHOR_PHOTO_KEY,
      Body: buf,
      ContentType: mime,
      CacheControl: "public, max-age=86400",
    }),
  );

  const url = `https://${cfDomain}/${AUTHOR_PHOTO_KEY}?v=${Date.now()}`;
  return putBlogSettings({ authorPhotoUrl: url });
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
        return json(200, { settings });
      }
      const post = await putBlogPost(body);
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
        return json(200, { settings });
      }
      if (action === "uploadAuthorPhoto") {
        const settings = await uploadAuthorPhoto(body);
        return json(200, { settings });
      }
      if (action === "clearAuthorPhoto") {
        const settings = await putBlogSettings({ authorPhotoUrl: null });
        return json(200, { settings });
      }
      if (action === "delete") {
        const id = String(body.id ?? "").trim();
        if (!id) return json(400, { error: "id is required" });
        await deleteBlogPost(id);
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
