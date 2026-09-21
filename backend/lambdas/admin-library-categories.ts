import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  allCategoryImageKeys,
  applyCategoryImageNext,
  categoryImagesList,
  clearLibraryCategoryImage,
  isKnownLibraryCategory,
  LIBRARY_CATEGORY_IMAGE_SLOTS,
  loadLibraryCategoryImages,
  putLibraryCategoryImage,
  restoreCategoryImageVersion,
  type LibraryCategoryImage,
} from "./_shared/library-category-images";
import {
  categoryCoverObjectKey,
  coerceAdminImageModel,
  generateAdminImageFromPrompt,
} from "./_shared/meditation-cover";

const s3 = new S3Client({});
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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

function parseImageMime(raw: unknown): "image/jpeg" | "image/png" | "image/webp" {
  const mimeRaw = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (mimeRaw === "image/png") return "image/png";
  if (mimeRaw === "image/webp") return "image/webp";
  return "image/jpeg";
}

function imageExt(mime: "image/jpeg" | "image/png" | "image/webp"): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

function decodeImageBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const dataUrl = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(trimmed);
  const b64 = dataUrl?.[1] ?? trimmed;
  return Buffer.from(b64, "base64");
}

function mediaConfig(): { bucket: string; cfDomain: string } {
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!bucket || !cfDomain) {
    throw new Error("MEDIA_BUCKET_NAME or MEDIA_CLOUDFRONT_DOMAIN is not set");
  }
  return { bucket, cfDomain };
}

async function deleteObjectBestEffort(bucket: string, key: string | null) {
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn("admin-library-categories: could not delete", key, e);
  }
}

async function deleteKeysBestEffort(bucket: string, keys: string[]) {
  for (const key of keys) {
    await deleteObjectBestEffort(bucket, key);
  }
}

async function putCategoryImageObject(params: {
  category: string;
  body: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
}): Promise<{ key: string; url: string }> {
  const { bucket, cfDomain } = mediaConfig();
  const baseKey = categoryCoverObjectKey(params.category);
  const key =
    params.mime === "image/jpeg"
      ? baseKey.replace(/\.jpg$/i, `-${Date.now()}.jpg`)
      : baseKey.replace(/\.jpg$/i, `-${Date.now()}.${imageExt(params.mime)}`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.body,
      ContentType: params.mime,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return { key, url: `https://${cfDomain}/${key}` };
}

function serializeAdminImage(x: LibraryCategoryImage) {
  return {
    category: x.category,
    imageUrl: x.imageUrl,
    imageKey: x.imageKey,
    lastPrompt: x.lastPrompt,
    updatedAt: x.updatedAt,
    versions: x.versions.map((v) => ({
      id: v.id,
      imageUrl: v.imageUrl,
      imageKey: v.imageKey,
      lastPrompt: v.lastPrompt,
      createdAt: v.createdAt,
    })),
  };
}

function publicPayload(doc: Awaited<ReturnType<typeof loadLibraryCategoryImages>>) {
  return {
    categories: [...LIBRARY_CATEGORY_IMAGE_SLOTS],
    images: categoryImagesList(doc).map((x) => ({
      category: x.category,
      imageUrl: x.imageUrl,
      updatedAt: x.updatedAt,
    })),
  };
}

function adminPayload(doc: Awaited<ReturnType<typeof loadLibraryCategoryImages>>) {
  return {
    categories: [...LIBRARY_CATEGORY_IMAGE_SLOTS],
    images: categoryImagesList(doc).map(serializeAdminImage),
  };
}

async function handleUpload(
  body: Record<string, unknown>,
): Promise<LibraryCategoryImage> {
  const category =
    typeof body.category === "string" ? body.category.trim() : "";
  if (!isKnownLibraryCategory(category)) {
    throw new Error("`category` must be a known meditation type");
  }
  const mime = parseImageMime(body.mimeType);
  const b64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!b64) throw new Error("`imageBase64` is required");
  const buf = decodeImageBase64(b64);
  if (!buf.byteLength) throw new Error("Image is empty");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 2 MB (compress before upload)");
  }

  const existing = await loadLibraryCategoryImages();
  const previous = existing.byCategory[category] ?? null;
  const { key, url } = await putCategoryImageObject({
    category,
    body: buf,
    mime,
  });
  const { entry, droppedKeys } = applyCategoryImageNext(previous, {
    category,
    imageUrl: url,
    imageKey: key,
    lastPrompt: null,
  });
  await putLibraryCategoryImage(entry);
  const { bucket } = mediaConfig();
  await deleteKeysBestEffort(bucket, droppedKeys);
  return entry;
}

async function handleGenerate(
  body: Record<string, unknown>,
): Promise<LibraryCategoryImage> {
  const category =
    typeof body.category === "string" ? body.category.trim() : "";
  if (!isKnownLibraryCategory(category)) {
    throw new Error("`category` must be a known meditation type");
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("`prompt` is required");

  const model = coerceAdminImageModel(body.model);
  const { body: imageBody, mime } = await generateAdminImageFromPrompt({
    prompt,
    model,
  });
  const existing = await loadLibraryCategoryImages();
  const previous = existing.byCategory[category] ?? null;
  const { key, url } = await putCategoryImageObject({
    category,
    body: imageBody,
    mime,
  });
  const { entry, droppedKeys } = applyCategoryImageNext(previous, {
    category,
    imageUrl: url,
    imageKey: key,
    lastPrompt: prompt,
  });
  await putLibraryCategoryImage(entry);
  const { bucket } = mediaConfig();
  await deleteKeysBestEffort(bucket, droppedKeys);
  return entry;
}

async function handleRestore(
  body: Record<string, unknown>,
): Promise<LibraryCategoryImage> {
  const category =
    typeof body.category === "string" ? body.category.trim() : "";
  if (!isKnownLibraryCategory(category)) {
    throw new Error("`category` must be a known meditation type");
  }
  const versionId =
    typeof body.versionId === "string" ? body.versionId.trim() : "";
  if (!versionId) throw new Error("`versionId` is required");

  const existing = await loadLibraryCategoryImages();
  const previous = existing.byCategory[category];
  if (!previous) throw new Error("No image for this category");
  const restored = restoreCategoryImageVersion(previous, versionId);
  if (!restored) throw new Error("Version not found");
  await putLibraryCategoryImage(restored.entry);
  const { bucket } = mediaConfig();
  await deleteKeysBestEffort(bucket, restored.droppedKeys);
  return restored.entry;
}

async function handleClear(body: Record<string, unknown>) {
  const category =
    typeof body.category === "string" ? body.category.trim() : "";
  if (!isKnownLibraryCategory(category)) {
    throw new Error("`category` must be a known meditation type");
  }
  const { doc, removed } = await clearLibraryCategoryImage(category);
  if (removed) {
    const { bucket } = mediaConfig();
    await deleteKeysBestEffort(bucket, allCategoryImageKeys(removed));
  }
  return doc;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const path = event.rawPath || event.requestContext.http.path || "";
  const isAdmin = path.includes("/admin/");

  try {
    if (method === "GET") {
      if (isAdmin) {
        const admin = await requireAdminJson(event);
        if ("statusCode" in admin) return admin;
      }
      const doc = await loadLibraryCategoryImages();
      return json(200, isAdmin ? adminPayload(doc) : publicPayload(doc));
    }

    if (method === "POST") {
      const admin = await requireAdminJson(event);
      if ("statusCode" in admin) return admin;

      let body: Record<string, unknown>;
      try {
        body = parseBody(event);
      } catch {
        return json(400, { error: "Invalid JSON" });
      }

      const action =
        typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

      if (action === "upload") {
        const image = await handleUpload(body);
        const doc = await loadLibraryCategoryImages();
        return json(200, { ok: true, image: serializeAdminImage(image), ...adminPayload(doc) });
      }
      if (action === "generate") {
        const image = await handleGenerate(body);
        const doc = await loadLibraryCategoryImages();
        return json(200, { ok: true, image: serializeAdminImage(image), ...adminPayload(doc) });
      }
      if (action === "restore") {
        const image = await handleRestore(body);
        const doc = await loadLibraryCategoryImages();
        return json(200, { ok: true, image: serializeAdminImage(image), ...adminPayload(doc) });
      }
      if (action === "clear") {
        const doc = await handleClear(body);
        return json(200, { ok: true, ...adminPayload(doc) });
      }
      return json(400, {
        error: "action must be upload, generate, restore, or clear",
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Library category images failed";
    console.error("admin-library-categories", msg);
    return json(500, { error: msg });
  }
}
