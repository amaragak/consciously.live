import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { OPUS_CONTENT_TYPE, opusEncodeArgs } from "./bg-audio-opus";

const execFileAsync = promisify(execFile);

export function voiceStemStreamKeys(
  wavKey: string,
): { mp3Key: string; opusKey: string } | null {
  const k = wavKey.trim();
  if (!k.toLowerCase().endsWith(".wav")) return null;
  const stem = k.slice(0, -4);
  return { mp3Key: `${stem}.mp3`, opusKey: `${stem}.opus` };
}

export async function encodeVoiceStemStreams(wavBuf: Buffer): Promise<{
  mp3: Buffer;
  opus: Buffer | null;
}> {
  const id = randomUUID();
  const inPath = `/tmp/voice-stem-${id}.wav`;
  const mp3Path = `/tmp/voice-stem-${id}.mp3`;
  const opusPath = `/tmp/voice-stem-${id}.opus`;
  fs.writeFileSync(inPath, wavBuf);
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inPath,
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      mp3Path,
    ]);
    const mp3 = fs.readFileSync(mp3Path);
    let opus: Buffer | null = null;
    try {
      await execFileAsync("ffmpeg", opusEncodeArgs(inPath, opusPath));
      opus = fs.readFileSync(opusPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "opus encode failed";
      console.warn("voice stem opus encode skipped", { msg });
    }
    return { mp3, opus };
  } finally {
    for (const p of [inPath, mp3Path, opusPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
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
  const { mp3, opus } = await encodeVoiceStemStreams(params.wavBuf);
  const uploaded: string[] = [];
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: keys.mp3Key,
      Body: mp3,
      ContentType: "audio/mpeg",
      CacheControl: params.cacheControl,
    }),
  );
  uploaded.push(keys.mp3Key);
  if (opus) {
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: keys.opusKey,
        Body: opus,
        ContentType: OPUS_CONTENT_TYPE,
        CacheControl: params.cacheControl,
      }),
    );
    uploaded.push(keys.opusKey);
  }
  return uploaded;
}
