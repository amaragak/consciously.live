import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  BG_AUDIO_PREFIX,
  originalKeyForPublicKey,
  siblingWavKey,
} from "./_shared/background-audio-keys";
import {
  AAC_CONTENT_TYPE,
  AAC_EXTENSION,
  aacEncodeArgs,
  siblingAacKey,
} from "./_shared/audio-aac";
import { coerceSoundEqBands, ffmpegEqFilter } from "./_shared/sound-eq-bands";
import {
  getSoundRow,
  putSoundRow,
  soundEnabledFromStatus,
} from "./_shared/sound-catalog";

const s3 = new S3Client({});
const execFileAsync = promisify(execFile);

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

function ffmpegExecutable(): string {
  if (fs.existsSync("/opt/bin/ffmpeg")) return "/opt/bin/ffmpeg";
  return "ffmpeg";
}

function binEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `/opt/bin:${process.env.PATH || ""}` };
}

async function execFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegExecutable();
  try {
    await execFileAsync(bin, args, { env: binEnv(), maxBuffer: 10 * 1024 * 1024 });
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer; message?: string };
    const stderr = e.stderr?.toString?.().trim() ?? "";
    throw new Error(
      `ffmpeg failed (${bin}): ${e.message ?? String(err)}${stderr ? `\n${stderr}` : ""}`,
    );
  }
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(bucket: string, key: string, path: string): Promise<void> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!obj.Body) throw new Error("S3 body is empty");
  const buf = Buffer.from(await obj.Body.transformToByteArray());
  fs.writeFileSync(path, buf);
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method === "OPTIONS") return json(204, {});
  if (event.requestContext.http.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  const bucket = process.env.MEDIA_BUCKET_NAME;
  if (!bucket) return json(500, { error: "MEDIA_BUCKET_NAME is not set" });

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith(BG_AUDIO_PREFIX)) {
    return json(400, { error: "key must be a background-audio object" });
  }

  const bands = coerceSoundEqBands(body.bands);
  const af = ffmpegEqFilter(bands);
  if (!af) {
    return json(400, { error: "At least one active EQ band is required" });
  }

  const mp3Key = key.toLowerCase().endsWith(".wav") ? `${key.slice(0, -4)}.mp3` : key;
  const wavKey = siblingWavKey(mp3Key) ?? `${mp3Key.slice(0, -4)}.wav`;
  const aacKey = siblingAacKey(mp3Key) ?? `${mp3Key.slice(0, -4)}${AAC_EXTENSION}`;
  const origMp3 = originalKeyForPublicKey(mp3Key);

  const id = randomUUID();
  const inPath = `/tmp/eq-in-${id}`;
  const outWav = `/tmp/eq-out-${id}.wav`;
  const outMp3 = `/tmp/eq-out-${id}.mp3`;
  const outAac = `/tmp/eq-out-${id}${AAC_EXTENSION}`;

  try {
    // EQ what the admin is hearing now (public file). Keep archived original
    // for re-trim; ensure an original MP3 exists if somehow missing.
    let sourceKey: string | null = null;
    let ext = "wav";
    if (await objectExists(bucket, wavKey)) {
      sourceKey = wavKey;
      ext = "wav";
    } else if (await objectExists(bucket, mp3Key)) {
      sourceKey = mp3Key;
      ext = "mp3";
    } else if (await objectExists(bucket, origMp3)) {
      sourceKey = origMp3;
      ext = "mp3";
    }
    if (!sourceKey) {
      return json(404, { error: "Audio object not found (still processing?)" });
    }

    const srcPath = `${inPath}.${ext}`;
    await downloadToFile(bucket, sourceKey, srcPath);

    if (!(await objectExists(bucket, origMp3)) && sourceKey !== origMp3) {
      // First destructive edit without an archive — keep pre-EQ public as original.
      const archivePath = `/tmp/eq-orig-${id}.mp3`;
      if (ext === "mp3") {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: origMp3,
            Body: fs.readFileSync(srcPath),
            ContentType: "audio/mpeg",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      } else {
        await execFfmpeg([
          "-hide_banner",
          "-y",
          "-i",
          srcPath,
          "-c:a",
          "libmp3lame",
          "-q:a",
          "2",
          archivePath,
        ]);
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: origMp3,
            Body: fs.readFileSync(archivePath),
            ContentType: "audio/mpeg",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      }
    }

    await execFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      srcPath,
      "-af",
      af,
      "-c:a",
      "pcm_s24le",
      outWav,
    ]);
    await execFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      outWav,
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      outMp3,
    ]);
    let aacBuf: Buffer | null = null;
    try {
      await execFfmpeg(aacEncodeArgs(outWav, outAac));
      aacBuf = fs.readFileSync(outAac);
    } catch (e) {
      console.warn("aac encode skipped", e instanceof Error ? e.message : e);
    }

    const wavBuf = fs.readFileSync(outWav);
    const mp3Buf = fs.readFileSync(outMp3);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: wavKey,
        Body: wavBuf,
        ContentType: "audio/wav",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: mp3Key,
        Body: mp3Buf,
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    if (aacBuf) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: aacKey,
          Body: aacBuf,
          ContentType: AAC_CONTENT_TYPE,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    }

    const existing = await getSoundRow(mp3Key);
    if (existing) {
      await putSoundRow({
        ...existing,
        originalKey: existing.originalKey || origMp3,
        enabled: soundEnabledFromStatus(existing.status),
        updatedAt: new Date().toISOString(),
      });
    }

    return json(200, {
      ok: true,
      key: mp3Key,
      wavKey,
      bands,
      filter: af,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-sounds-eq", msg);
    return json(500, { error: "EQ apply failed", detail: msg.slice(0, 2000) });
  } finally {
    for (const p of [
      `${inPath}.wav`,
      `${inPath}.mp3`,
      outWav,
      outMp3,
      outAac,
      `/tmp/eq-orig-${id}.mp3`,
    ]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}
