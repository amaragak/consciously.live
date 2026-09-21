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
  buildMeditationCoverPrompt,
  coerceAdminImageModel,
  generateAdminImageFromPrompt,
} from "./_shared/meditation-cover";
import {
  generateProgramDayDescription,
} from "./_shared/program-day-description";
import {
  deleteProgram,
  getProgram,
  listPrograms,
  putProgram,
  type ProgramPublic,
} from "./_shared/programs";

const s3 = new S3Client({});
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

function mediaConfig(): { bucket: string; cfDomain: string } {
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!bucket || !cfDomain) {
    throw new Error("MEDIA_BUCKET_NAME or MEDIA_CLOUDFRONT_DOMAIN is not set");
  }
  return { bucket, cfDomain };
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

async function deleteObjectBestEffort(bucket: string, key: string | null) {
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e) {
    console.warn("admin-programs: could not delete", key, e);
  }
}

async function putCoverObject(params: {
  programId: string;
  dayId: string | null;
  body: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
}): Promise<{ key: string; url: string }> {
  const { bucket, cfDomain } = mediaConfig();
  const ts = Date.now();
  const ext = imageExt(params.mime);
  const key = params.dayId
    ? `program-covers/${params.programId}/days/${params.dayId}-${ts}.${ext}`
    : `program-covers/${params.programId}/program-${ts}.${ext}`;
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

function applyCover(
  program: ProgramPublic,
  dayId: string | null,
  cover: { key: string | null; url: string | null },
): ProgramPublic {
  if (!dayId) {
    return {
      ...program,
      coverImageKey: cover.key,
      coverImageUrl: cover.url,
    };
  }
  return {
    ...program,
    days: program.days.map((d) =>
      d.id === dayId
        ? { ...d, coverImageKey: cover.key, coverImageUrl: cover.url }
        : d,
    ),
  };
}

function previousCoverKey(
  program: ProgramPublic,
  dayId: string | null,
): string | null {
  if (!dayId) return program.coverImageKey;
  return program.days.find((d) => d.id === dayId)?.coverImageKey ?? null;
}

async function handleGenerateCover(
  body: Record<string, unknown>,
): Promise<ProgramPublic> {
  const programId = typeof body.programId === "string" ? body.programId.trim() : "";
  if (!programId) throw new Error("programId is required");
  const dayId =
    typeof body.dayId === "string" && body.dayId.trim()
      ? body.dayId.trim()
      : null;

  const program = await getProgram(programId);
  if (!program) throw new Error("Program not found");

  const day = dayId ? program.days.find((d) => d.id === dayId) : null;
  if (dayId && !day) throw new Error("Lesson not found");

  const customPrompt =
    typeof body.prompt === "string" ? body.prompt.trim() : "";
  const model = coerceAdminImageModel(body.model);

  const prompt =
    customPrompt ||
    (day
      ? buildMeditationCoverPrompt({
          title: day.title || `Lesson ${day.dayNumber}`,
          description: day.description,
          createPrompt: day.prompt,
          meditationType: program.title,
        })
      : buildMeditationCoverPrompt({
          title: program.title,
          description: program.description,
          meditationType: "multi-day meditation program",
        }));

  const { body: imageBody, mime } = await generateAdminImageFromPrompt({
    prompt,
    model,
  });

  const { key, url } = await putCoverObject({
    programId,
    dayId,
    body: imageBody,
    mime,
  });
  const prev = previousCoverKey(program, dayId);
  const next = await putProgram(applyCover(program, dayId, { key, url }));
  const { bucket } = mediaConfig();
  if (prev && prev !== key) await deleteObjectBestEffort(bucket, prev);
  return next;
}

async function handleUploadCover(
  body: Record<string, unknown>,
): Promise<ProgramPublic> {
  const programId = typeof body.programId === "string" ? body.programId.trim() : "";
  if (!programId) throw new Error("programId is required");
  const dayId =
    typeof body.dayId === "string" && body.dayId.trim()
      ? body.dayId.trim()
      : null;

  const program = await getProgram(programId);
  if (!program) throw new Error("Program not found");
  if (dayId && !program.days.some((d) => d.id === dayId)) {
    throw new Error("Lesson not found");
  }

  const mime = parseImageMime(body.mimeType);
  const b64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!b64) throw new Error("imageBase64 is required");
  const buf = decodeImageBase64(b64);
  if (!buf.byteLength) throw new Error("Image is empty");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 2 MB (compress before upload)");
  }

  const { key, url } = await putCoverObject({
    programId,
    dayId,
    body: buf,
    mime,
  });
  const prev = previousCoverKey(program, dayId);
  const next = await putProgram(applyCover(program, dayId, { key, url }));
  const { bucket } = mediaConfig();
  if (prev && prev !== key) await deleteObjectBestEffort(bucket, prev);
  return next;
}

async function handleClearCover(
  body: Record<string, unknown>,
): Promise<ProgramPublic> {
  const programId = typeof body.programId === "string" ? body.programId.trim() : "";
  if (!programId) throw new Error("programId is required");
  const dayId =
    typeof body.dayId === "string" && body.dayId.trim()
      ? body.dayId.trim()
      : null;

  const program = await getProgram(programId);
  if (!program) throw new Error("Program not found");
  if (dayId && !program.days.some((d) => d.id === dayId)) {
    throw new Error("Lesson not found");
  }

  const prev = previousCoverKey(program, dayId);
  const next = await putProgram(
    applyCover(program, dayId, { key: null, url: null }),
  );
  const { bucket } = mediaConfig();
  await deleteObjectBestEffort(bucket, prev);
  return next;
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
      const programs = await listPrograms();
      return json(200, { programs });
    }
    if (method === "PATCH") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body || "{}") as Record<string, unknown>;
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const program = await putProgram(body);
      return json(200, { program });
    }
    if (method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body || "{}") as Record<string, unknown>;
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const action = String(body.action ?? "").trim();
      if (action === "delete") {
        const id = String(body.id ?? "").trim();
        if (!id) return json(400, { error: "id is required" });
        await deleteProgram(id);
        return json(200, { ok: true });
      }
      if (action === "describe-day") {
        const prompt = String(body.prompt ?? "").trim();
        if (!prompt) return json(400, { error: "prompt is required" });
        const description = await generateProgramDayDescription({
          prompt,
          title: typeof body.title === "string" ? body.title : "",
          programTitle:
            typeof body.programTitle === "string" ? body.programTitle : "",
        });
        return json(200, { description });
      }
      if (action === "generate-cover") {
        const program = await handleGenerateCover(body);
        return json(200, { program });
      }
      if (action === "upload-cover") {
        const program = await handleUploadCover(body);
        return json(200, { program });
      }
      if (action === "clear-cover") {
        const program = await handleClearCover(body);
        return json(200, { program });
      }
      return json(400, { error: "Unknown action" });
    }
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin programs failed";
    console.error("admin-programs", msg);
    return json(500, { error: msg });
  }
}
