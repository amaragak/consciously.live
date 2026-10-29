import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  deleteBlogPost,
  getBlogPostById,
  getBlogSettings,
  listBlogPosts,
  patchBlogPostAudio,
  putBlogPost,
  putBlogSettings,
} from "./_shared/blog";
import { invalidateBlogCache } from "./_shared/blog-revalidate";
import {
  coverUrlFromRow,
  LISTEN_PATH_PK,
  LISTEN_SLUG_PK,
  parseListenShare,
} from "./_shared/listen-share";
import {
  CLAUDE_HAIKU_45_MODEL_ID,
  withClaudeThinkingOff,
} from "./_shared/anthropic-pricing";
import { recordClaudeUsageFromResponseText } from "./_shared/ai-usage";
import { generateAdminImageFromPrompt } from "./_shared/meditation-cover";
import { meditationPlaybackS3Key } from "./_shared/playback-keys";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const s3 = new S3Client({});
const lambda = new LambdaClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 4 * 1024 * 1024;
const MAX_ESSAY_CHARS_FOR_PROMPT = 7000;

let cachedClaudeKey: string | undefined;

async function getClaudeApiKey(): Promise<string> {
  if (cachedClaudeKey) return cachedClaudeKey;
  const arn = process.env.CLAUDE_SECRET_ARN?.trim();
  if (!arn) throw new Error("CLAUDE_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Claude API key secret is empty");
  cachedClaudeKey = s;
  return cachedClaudeKey;
}

/** Prefer full essay plain text; fall back to legacy `opening` field. */
function essayTextFromBody(body: Record<string, unknown>): string {
  const full =
    typeof body.bodyText === "string"
      ? body.bodyText
      : typeof body.essay === "string"
        ? body.essay
        : "";
  const opening =
    typeof body.opening === "string" ? body.opening : "";
  const raw = (full.trim() || opening.trim()).replace(/\s+/g, " ");
  if (raw.length <= MAX_ESSAY_CHARS_FOR_PROMPT) return raw;
  // Keep head + middle + tail so the topic isn't only the lede.
  const head = Math.floor(MAX_ESSAY_CHARS_FOR_PROMPT * 0.45);
  const mid = Math.floor(MAX_ESSAY_CHARS_FOR_PROMPT * 0.25);
  const tail = MAX_ESSAY_CHARS_FOR_PROMPT - head - mid - 30;
  const midStart = Math.max(
    head,
    Math.floor((raw.length - mid) / 2),
  );
  return [
    raw.slice(0, head).trim(),
    "…",
    raw.slice(midStart, midStart + mid).trim(),
    "…",
    raw.slice(-tail).trim(),
  ].join(" ");
}

/** Crude overview when Haiku is unavailable — not just the opening lines. */
function heuristicEssayOverview(essay: string): string {
  if (!essay) return "";
  if (essay.length <= 500) return essay;
  const parts = essay.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= 4) return essay.slice(0, 500);
  const take = (idxs: number[]) =>
    idxs
      .map((i) => parts[i])
      .filter(Boolean)
      .join(" ");
  const last = parts.length - 1;
  const mid = Math.floor(parts.length / 2);
  return take([0, 1, mid, last - 1, last]).slice(0, 700);
}

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

function fallbackCoverPrompt(body: Record<string, unknown>): string {
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "an essay";
  const sub =
    typeof body.subheader === "string" && body.subheader.trim()
      ? body.subheader.trim()
      : "";
  const overview = heuristicEssayOverview(essayTextFromBody(body));
  return [
    `Editorial cover illustration for a Consciously essay titled "${title}".`,
    sub ? `Subtitle: ${sub}.` : "",
    overview
      ? `Overall subject and arc (not only the opening): ${overview}`
      : "",
    "Quiet, contemplative atmosphere. No text, logos, or watermarks in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Write an image-gen prompt from the essay as a whole — title, subtitle, and
 * an overall summary of the piece (not just the opening paragraph).
 */
async function buildCoverPromptFromEssay(
  body: Record<string, unknown>,
): Promise<string> {
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled essay";
  const sub =
    typeof body.subheader === "string" && body.subheader.trim()
      ? body.subheader.trim()
      : "";
  const essay = essayTextFromBody(body);
  if (!essay) return fallbackCoverPrompt(body);

  try {
    const apiKey = await getClaudeApiKey();
    const system = [
      "You write image-generation prompts for 16:9 editorial illustration covers for Consciously essays.",
      "You are given the essay title, optional subtitle, and the essay text.",
      "First infer the overall topic, argument, and emotional arc of the WHOLE piece — do not lean only on the opening.",
      "Then write ONE complete image prompt that visually expresses that overall subject.",
      "Keep: quiet, contemplative mood; full-bleed illustration; landscape 16:9; no overlaid text, logos, watermarks, or UI.",
      "Do not ask for a photograph. Reply with ONLY the image prompt — no quotes, labels, or explanation.",
    ].join("\n");
    const user = [
      `Title: ${title}`,
      sub ? `Subtitle: ${sub}` : "",
      "",
      "Essay:",
      essay,
      "",
      "Write the image prompt now.",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(
        withClaudeThinkingOff({
          model: CLAUDE_HAIKU_45_MODEL_ID,
          max_tokens: 500,
          temperature: 0.4,
          system,
          messages: [{ role: "user", content: user }],
        }),
      ),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Haiku blog cover prompt failed: ${raw.slice(0, 400)}`);
    }
    void recordClaudeUsageFromResponseText({
      responseText: raw,
      model: CLAUDE_HAIKU_45_MODEL_ID,
      feature: "blog-cover-prompt",
    });
    let text = "";
    try {
      const parsed = JSON.parse(raw) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      text = (parsed.content ?? [])
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text!.trim())
        .join("\n")
        .trim();
    } catch {
      throw new Error("Haiku returned invalid JSON");
    }
    text = text
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^(image\s+)?prompt\s*:\s*/i, "")
      .trim();
    if (text.length < 40) {
      throw new Error("Haiku returned an empty cover prompt");
    }
    return text.slice(0, 2000);
  } catch (e) {
    console.warn(
      "buildCoverPromptFromEssay fallback:",
      e instanceof Error ? e.message : e,
    );
    return fallbackCoverPrompt(body);
  }
}

async function generateCoverOptions(body: Record<string, unknown>): Promise<{
  prompt: string;
  options: Array<{ url: string; key: string }>;
}> {
  const prompt =
    typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim().slice(0, 2000)
      : await buildCoverPromptFromEssay(body);
  // Default 1: API Gateway HTTP APIs hard-cap at 30s. Callers that want a
  // grid of options should request count:1 repeatedly from the client.
  const countRaw =
    typeof body.count === "number" ? body.count : Number(body.count ?? 1);
  const count = Math.min(2, Math.max(1, Number.isFinite(countRaw) ? countRaw : 1));

  const results: Array<{ url: string; key: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const out = await generateAdminImageFromPrompt({
      prompt,
      model: "nano-banana-pro",
      illustrationStyle: true,
      aspectRatio: "16:9",
    });
    const mime = out.mime === "image/png" ? "image/png" : "image/jpeg";
    const key = `blog/covers/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${imageExt(mime)}`;
    const url = await putBlogMediaObject({
      key,
      body: out.body,
      mime,
    });
    results.push({ url, key });
  }
  return { prompt, options: results };
}

async function uploadCoverImage(
  body: Record<string, unknown>,
): Promise<{ url: string; key: string }> {
  const mime = parseImageMime(body.mimeType);
  const b64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!b64) throw new Error("`imageBase64` is required");
  const buf = decodeImageBase64(b64);
  if (!buf.byteLength) throw new Error("Image is empty");
  if (buf.byteLength > MAX_COVER_BYTES) {
    throw new Error("Cover must be under 4 MB");
  }
  const key = `blog/covers/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${imageExt(mime)}`;
  const url = await putBlogMediaObject({ key, body: buf, mime });
  return { url, key };
}

function normalizeListenSlugInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?consciously\.live\/listen\//, "")
    .replace(/^.*\/listen\//, "")
    .replace(/\/+$/, "")
    .slice(0, 120);
}

async function resolveListenLink(body: Record<string, unknown>): Promise<{
  status: "ok" | "unlisted" | "revoked" | "missing";
  item?: {
    slug: string;
    kind: string;
    title: string;
    description: string;
    listed: boolean;
    durationSec: number | null;
    coverImageUrl: string | null;
    audioUrl: string | null;
  };
  warning?: string;
  error?: string;
}> {
  const rawPath = normalizeListenSlugInput(
    body.slug ?? body.listenSlug ?? body.url,
  );
  if (!rawPath) {
    return { status: "missing", error: "Paste a Listen link or slug." };
  }
  const tableName = process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim();
  if (!tableName) {
    throw new Error("MEDITATION_ANALYTICS_TABLE_NAME is not set");
  }
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();

  let row: Record<string, unknown> | null = null;
  let slug = rawPath;

  // New format: <username>/<pathSlug> or <username>/<pathSlug>-<token>
  const slash = rawPath.indexOf("/");
  if (slash > 0) {
    const username = rawPath.slice(0, slash);
    const pathKey = rawPath.slice(slash + 1);
    const pathReg = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: LISTEN_PATH_PK, sk: `${username}/${pathKey}` },
      }),
    );
    if (pathReg.Item?.status === "revoked") {
      return {
        status: "revoked",
        error: "This Listen item is no longer shared.",
      };
    }
    if (
      pathReg.Item?.status === "active" &&
      typeof pathReg.Item.ownerPk === "string" &&
      typeof pathReg.Item.ownerSk === "string"
    ) {
      const got = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: pathReg.Item.ownerPk, sk: pathReg.Item.ownerSk },
        }),
      );
      if (got.Item) {
        row = got.Item as Record<string, unknown>;
        slug =
          typeof row.listenSlug === "string" && row.listenSlug.trim()
            ? row.listenSlug.trim()
            : pathKey;
      }
    }
  }

  if (!row) {
    const flatSlug = rawPath
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    slug = flatSlug;
    const reg = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: LISTEN_SLUG_PK, sk: flatSlug },
      }),
    );
    if (reg.Item?.status === "revoked") {
      return {
        status: "revoked",
        error: "This Listen item is no longer shared.",
      };
    }
    if (
      reg.Item?.status === "active" &&
      typeof reg.Item.ownerPk === "string" &&
      typeof reg.Item.ownerSk === "string"
    ) {
      const got = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: reg.Item.ownerPk, sk: reg.Item.ownerSk },
        }),
      );
      if (got.Item) row = got.Item as Record<string, unknown>;
    }
    if (!row) {
      const q = await ddb.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "listenSlugIndex",
          KeyConditionExpression: "listenSlug = :s",
          ExpressionAttributeValues: { ":s": flatSlug },
          Limit: 1,
        }),
      );
      row = (q.Items?.[0] as Record<string, unknown> | undefined) ?? null;
    }
  }
  const share = row ? parseListenShare(row.listenShare) : null;
  if (!row || !share) {
    return {
      status: "missing",
      error: "No shared Listen item found for that link.",
    };
  }
  const rawKey = typeof row.s3Key === "string" ? row.s3Key.trim() : "";
  const s3Key = rawKey ? meditationPlaybackS3Key(rawKey) : "";
  const audioUrl =
    s3Key && cfDomain ? `https://${cfDomain}/${s3Key}` : null;
  const durationSec =
    typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
      ? row.durationSec
      : typeof row.durationSeconds === "number" &&
          Number.isFinite(row.durationSeconds)
        ? row.durationSeconds
        : null;
  const listed = share.listed || share.isExample;
  const item = {
    slug,
    kind: share.kind,
    title: share.title,
    description: share.description,
    listed,
    durationSec,
    coverImageUrl: coverUrlFromRow(row, cfDomain),
    audioUrl,
  };
  if (!listed) {
    return {
      status: "unlisted",
      item,
      warning:
        "This is shared by link only. Linking it here makes it visible to everyone who reads the essay.",
    };
  }
  return { status: "ok", item };
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
      if (action === "generateCoverOptions") {
        const result = await generateCoverOptions(body);
        return json(200, result);
      }
      if (action === "uploadCoverImage") {
        const result = await uploadCoverImage(body);
        return json(200, result);
      }
      if (action === "resolveListenSlug") {
        const result = await resolveListenLink(body);
        const code =
          result.status === "missing"
            ? 404
            : result.status === "revoked"
              ? 410
              : 200;
        return json(code, result);
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
      if (action === "generateAudio") {
        const id = String(body.id ?? "").trim();
        if (!id) return json(400, { error: "id is required" });
        const existing = await getBlogPostById(id);
        if (!existing) return json(404, { error: "Post not found" });
        const fn = process.env.BLOG_NARRATE_FUNCTION_NAME?.trim();
        if (!fn) {
          return json(500, { error: "Audio generation is not configured" });
        }
        const ttsProvider =
          body.ttsProvider === "fish" ? "fish" : "speechify";
        const post = await patchBlogPostAudio(id, {
          audioStatus: "generating",
          audioError: null,
          audioProgress: `Queued — starting ${ttsProvider === "speechify" ? "Speechify" : "Fish"}…`,
          audioStartedAt: new Date().toISOString(),
          audioTtsProvider: ttsProvider,
        });
        await lambda.send(
          new InvokeCommand({
            FunctionName: fn,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({ id, ttsProvider })),
          }),
        );
        return json(202, { post });
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
