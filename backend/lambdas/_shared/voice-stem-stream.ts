import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  AAC_CONTENT_TYPE,
  AAC_EXTENSION,
  aacEncodeArgs,
} from "./audio-aac";

const execFileAsync = promisify(execFile);

export function voiceStemStreamKeys(
  wavKey: string,
): { aacKey: string; mp3Key: string } | null {
  const k = wavKey.trim();
  if (!k.toLowerCase().endsWith(".wav")) return null;
  const stem = k.slice(0, -4);
  return { aacKey: `${stem}${AAC_EXTENSION}`, mp3Key: `${stem}.mp3` };
}

export async function encodeVoiceStemAac(wavBuf: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/voice-stem-${id}.wav`;
  const aacPath = `/tmp/voice-stem-${id}${AAC_EXTENSION}`;
  fs.writeFileSync(inPath, wavBuf);
  try {
    await execFileAsync("ffmpeg", aacEncodeArgs(inPath, aacPath));
    return fs.readFileSync(aacPath);
  } finally {
    for (const p of [inPath, aacPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

/** @deprecated Prefer encodeVoiceStemAac — kept for backfill callers that still want MP3. */
export async function encodeVoiceStemStreams(wavBuf: Buffer): Promise<{
  aac: Buffer;
  mp3: Buffer | null;
}> {
  const aac = await encodeVoiceStemAac(wavBuf);
  return { aac, mp3: null };
}

export async function putVoiceStemStreams(params: {
  s3: S3Client;
  bucket: string;
  wavKey: string;
  wavBuf: Buffer;
  cacheControl: string;
}): Promise<string[]> {
  const keys = voiceStemStreamKeys(params.wavKey);
  if (!keys) return [];
  const aac = await encodeVoiceStemAac(params.wavBuf);
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: keys.aacKey,
      Body: aac,
      ContentType: AAC_CONTENT_TYPE,
      CacheControl: params.cacheControl,
    }),
  );
  return [keys.aacKey];
}
