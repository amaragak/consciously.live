import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  deleteGuide,
  listGuides,
  putGuide,
  reorderGuides,
  seedGuidesIfEmpty,
  upsertGuidesByAreaSlug,
  type GuideSeed,
} from "./_shared/guides";

const s3 = new S3Client({});
const MAX_COVER_BYTES = 2 * 1024 * 1024;

function parseImageMime(raw: unknown): "image/jpeg" | "image/png" | "image/webp" {
  const mimeRaw = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (mimeRaw === "image/png") return "image/png";
  if (mimeRaw === "image/webp") return "image/webp";
  return "image/jpeg";
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

/** Upload a guide cover; returns the CDN URL (client then PATCHes `coverImageUrl`). */
async function uploadCover(body: Record<string, unknown>): Promise<string> {
  const mime = parseImageMime(body.mimeType);
  const b64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!b64) throw new Error("`imageBase64` is required");

  const buf = decodeImageBase64(b64);
  if (!buf.byteLength) throw new Error("Image is empty");
  if (buf.byteLength > MAX_COVER_BYTES) {
    throw new Error("Image must be under 2 MB (compress before upload)");
  }

  // Always `.jpg` key per spec; ContentType carries the real mime.
  const key = `guides/covers/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
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
      return json(200, { guides: await listGuides() });
    }
    if (method === "PATCH") {
      let body: Record<string, unknown> = {};
      try {
        body = parseBody(event);
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const guide = await putGuide(body);
      return json(200, { guide });
    }
    if (method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = parseBody(event);
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const action = String(body.action ?? "").trim();
      if (action === "delete") {
        const id = String(body.id ?? "").trim();
        if (!id) return json(400, { error: "id is required" });
        await deleteGuide(id);
        return json(200, { ok: true });
      }
      if (action === "uploadCover") {
        const url = await uploadCover(body);
        return json(200, { url });
      }
      if (action === "reorder") {
        if (!Array.isArray(body.ids)) {
          return json(400, { error: "ids must be an array" });
        }
        const ids = body.ids.filter((x): x is string => typeof x === "string");
        const guides = await reorderGuides(ids);
        return json(200, { guides });
      }
      if (action === "seedStatic") {
        if (!Array.isArray(body.guides)) {
          return json(400, { error: "guides must be an array" });
        }
        const seeds = body.guides as GuideSeed[];
        // Default: only when empty. `upsert: true` merges by area+slug.
        const written =
          body.upsert === true
            ? await upsertGuidesByAreaSlug(seeds)
            : await seedGuidesIfEmpty(seeds);
        return json(200, { seeded: written, guides: await listGuides() });
      }
      return json(400, { error: "Unknown action" });
    }
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin guides failed";
    console.error("admin-guides", msg);
    return json(500, { error: msg });
  }
}
