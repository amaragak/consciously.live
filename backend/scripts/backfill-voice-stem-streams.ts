/**
 * Encode Opus + MP3 siblings for dry/FX WAVs that predate voice-stem
 * streaming (library meditations and Create speaker previews).
 *
 *   AWS_PROFILE=mm MEDIA_BUCKET_NAME=… npx tsx scripts/backfill-voice-stem-streams.ts
 *   npx tsx scripts/backfill-voice-stem-streams.ts --dry-run --bucket …
 */

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { putVoiceStemStreams } from "../lambdas/_shared/voice-stem-stream";

const s3 = new S3Client({});
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1]?.trim() || null;
}

const bucket =
  argValue("--bucket") ?? process.env.MEDIA_BUCKET_NAME ?? "";
if (!bucket) {
  throw new Error("MEDIA_BUCKET_NAME or --bucket is required");
}

function isVoiceStemWav(key: string): boolean {
  return (
    /-(?:dry|wet)\.wav$/i.test(key) ||
    /(?:^|\/)(?:\d+(?:\.\d+)-)?loud-(?:dry|fx|wet)\.wav$/i.test(key)
  );
}

async function listWavStems(): Promise<string[]> {
  const keys: string[] = [];
  for (const prefix of [
    "meditations/",
    "programs/",
    "speaker-samples/",
    "orpheus-speaker-samples/",
  ]) {
    let token: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of page.Contents ?? []) {
        const key = obj.Key ?? "";
        if (isVoiceStemWav(key)) keys.push(key);
      }
      token = page.NextContinuationToken;
    } while (token);
  }
  return keys;
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: "bytes=0-0",
      }),
    );
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const wavs = await listWavStems();
  console.log(`found ${wavs.length} dry/wet wavs`);
  for (const wavKey of wavs) {
    const stem = wavKey.slice(0, -4);
    const haveMp3 = await objectExists(`${stem}.mp3`);
    const haveOpus = await objectExists(`${stem}.opus`);
    if (haveMp3 && haveOpus) {
      console.log("skip", wavKey);
      continue;
    }
    if (dryRun) {
      console.log("would encode", wavKey);
      continue;
    }
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: wavKey }),
    );
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes?.byteLength) {
      console.warn("empty", wavKey);
      continue;
    }
    const uploaded = await putVoiceStemStreams({
      s3,
      bucket,
      wavKey,
      wavBuf: Buffer.from(bytes),
      cacheControl:
        wavKey.startsWith("speaker-samples/") ||
        wavKey.startsWith("orpheus-speaker-samples/")
          ? "public, max-age=0, must-revalidate"
          : "no-store",
    });
    console.log("encoded", wavKey, uploaded.join(" "));
  }
}

void main();
