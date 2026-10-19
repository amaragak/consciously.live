/**
 * Generate Create-flow Journal, Program, Manifest, and Heal category covers via Nano Banana Pro
 * and store them in the media bucket + VoiceAdmin CATEGORY_IMAGES doc.
 *
 *   AWS_PROFILE=mm \
 *   VOICE_ADMIN_TABLE_NAME=… \
 *   MEDIA_BUCKET_NAME=… \
 *   MEDIA_CLOUDFRONT_DOMAIN=… \
 *   GOOGLE_AI_SECRET_ARN=… \
 *   npx tsx scripts/generate-create-context-covers.ts
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  applyCategoryImageNext,
  loadLibraryCategoryImages,
  putLibraryCategoryImage,
} from "../lambdas/_shared/library-category-images";
import {
  categoryCoverObjectKey,
  generateAdminImageFromPrompt,
} from "../lambdas/_shared/meditation-cover";

const s3 = new S3Client({});

const JOBS = [
  {
    category: "Journal",
    prompt: [
      "Quiet still life of an open linen-bound journal alone on a sunlit wooden desk by a window,",
      "blank cream pages, fountain pen resting beside the notebook, no hands, no fingers, no arms, no person,",
      "warm morning light, calm reflective mood,",
      "no text overlays, no logos, square full-bleed crop, no picture frame.",
    ].join(" "),
  },
  {
    category: "Program",
    prompt: [
      "Gentle guided practice path: a calm sequence of soft meditation cushions",
      "arranged along a sunlit wooden floor in an airy wellness studio,",
      "warm natural light through sheer curtains, sense of progressive journey,",
      "no people,",
      "no text overlays, no logos, square full-bleed crop, no picture frame.",
    ].join(" "),
  },
  {
    category: "Manifest",
    prompt: [
      "A stylised figure standing on a gentle overlook, seen from behind,",
      "arms gently open, looking out over a soft misty valley,",
      "calm hopeful mood, shallow atmospheric haze, face not the focus,",
      "no text overlays, no logos, square full-bleed crop, no picture frame.",
    ].join(" "),
  },
  {
    category: "Heal",
    prompt: [
      "Quiet private moment of self-kindness: a person sitting alone beside a sunlit window,",
      "seen from behind so the face is not the focus, one hand resting gently over the heart,",
      "soft linen clothes, warm morning light, calm and tender mood,",
      "a stylised figure, face not the focus,",
      "no text overlays, no logos, square full-bleed crop, no picture frame.",
    ].join(" "),
  },
] as const;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function putCover(params: {
  category: string;
  body: Buffer;
  mime: "image/jpeg" | "image/png";
}): Promise<{ key: string; url: string }> {
  const bucket = requireEnv("MEDIA_BUCKET_NAME");
  const cfDomain = requireEnv("MEDIA_CLOUDFRONT_DOMAIN");
  const baseKey = categoryCoverObjectKey(params.category);
  const ext = params.mime === "image/png" ? "png" : "jpg";
  const key = baseKey.replace(/\.jpg$/i, `-${Date.now()}.${ext}`);
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

async function main() {
  requireEnv("VOICE_ADMIN_TABLE_NAME");
  requireEnv("MEDIA_BUCKET_NAME");
  requireEnv("MEDIA_CLOUDFRONT_DOMAIN");
  if (
    !process.env.GOOGLE_AI_API_KEY?.trim() &&
    !process.env.GOOGLE_AI_SECRET_ARN?.trim()
  ) {
    throw new Error("GOOGLE_AI_API_KEY or GOOGLE_AI_SECRET_ARN is required");
  }

  const only = new Set(
    process.argv.slice(2).map((s) => s.trim()).filter(Boolean),
  );
  const jobs = only.size
    ? JOBS.filter((j) => only.has(j.category))
    : [...JOBS];
  if (!jobs.length) {
    throw new Error(
      `No matching jobs. Available: ${JOBS.map((j) => j.category).join(", ")}`,
    );
  }

  for (const job of jobs) {
    console.log(`Generating ${job.category}…`);
    const { body, mime } = await generateAdminImageFromPrompt({
      prompt: job.prompt,
      model: "nano-banana-pro",
    });
    const { key, url } = await putCover({
      category: job.category,
      body,
      mime,
    });
    const existing = await loadLibraryCategoryImages();
    const previous = existing.byCategory[job.category] ?? null;
    const { entry } = applyCategoryImageNext(previous, {
      category: job.category,
      imageUrl: url,
      imageKey: key,
      lastPrompt: job.prompt,
    });
    await putLibraryCategoryImage(entry);
    console.log(`  → ${url}`);
    console.log(`  → key ${key}`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
