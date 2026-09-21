/**
 * Meditation library cover art via OpenAI gpt-image-1-mini (1024², low quality).
 * Prefer a photorealistic scene tied to title / description / style when clear;
 * otherwise a calm generic editorial still.
 *
 * Admin surfaces (category / program covers) may also use Nano Banana Pro
 * (Gemini 3 Pro Image) via generateAdminImageFromPrompt.
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { MeditationCreationProvenance } from "./meditation-creation-provenance";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const COVER_MODEL = "gpt-image-1-mini";
const COVER_SIZE = "1024x1024";
const COVER_QUALITY = "low";
const COVER_FORMAT = "jpeg";

/** Gemini 3 Pro Image — same id as vision-board "Nano Banana Pro". */
const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image";

export const ADMIN_IMAGE_MODELS = [
  "gpt-image-1-mini",
  "nano-banana-pro",
] as const;
export type AdminImageModel = (typeof ADMIN_IMAGE_MODELS)[number];

export function coerceAdminImageModel(raw: unknown): AdminImageModel {
  if (raw === "nano-banana-pro") return "nano-banana-pro";
  return "gpt-image-1-mini";
}

export function adminImageModelLabel(model: AdminImageModel): string {
  return model === "nano-banana-pro"
    ? "Nano Banana Pro"
    : "GPT Image 1 Mini";
}

const secrets = new SecretsManagerClient({});
let cachedOpenAiKey: string | undefined;
let cachedGoogleKey: string | undefined;

async function getOpenAiApiKey(): Promise<string> {
  if (cachedOpenAiKey) return cachedOpenAiKey;
  const inline = process.env.OPENAI_API_KEY?.trim();
  if (inline) {
    cachedOpenAiKey = inline;
    return cachedOpenAiKey;
  }
  const arn = process.env.OPENAI_SECRET_ARN?.trim();
  if (!arn) {
    throw new Error("OPENAI_SECRET_ARN or OPENAI_API_KEY is not set");
  }
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("OpenAI API key secret is empty");
  cachedOpenAiKey = s;
  return cachedOpenAiKey;
}

async function getGoogleAiApiKey(): Promise<string> {
  if (cachedGoogleKey) return cachedGoogleKey;
  const inline = process.env.GOOGLE_AI_API_KEY?.trim();
  if (inline) {
    cachedGoogleKey = inline;
    return cachedGoogleKey;
  }
  const arn = process.env.GOOGLE_AI_SECRET_ARN?.trim();
  if (!arn) {
    throw new Error("GOOGLE_AI_SECRET_ARN or GOOGLE_AI_API_KEY is not set");
  }
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Google AI API key secret is empty");
  cachedGoogleKey = s;
  return cachedGoogleKey;
}

export type MeditationCoverInput = {
  title: string;
  description?: string | null;
  meditationStyle?: string | null;
  meditationType?: string | null;
  /** Short user/create prompt when available. */
  createPrompt?: string | null;
};

/**
 * Pull a short create-intent string from provenance for cover prompts.
 * Shared by generate-meditation-audio and backfill-meditation-covers.
 */
export function createPromptFromProvenance(
  provenance:
    | MeditationCreationProvenance
    | Record<string, unknown>
    | null
    | undefined,
): string | null {
  if (!provenance || typeof provenance !== "object") return null;
  const p = provenance as MeditationCreationProvenance;
  if (typeof p.directPrompt === "string" && p.directPrompt.trim()) {
    return p.directPrompt.trim().slice(0, 400);
  }
  if (Array.isArray(p.messages)) {
    for (let i = p.messages.length - 1; i >= 0; i -= 1) {
      const m = p.messages[i];
      if (m?.role === "user" && m.text?.trim()) {
        return m.text.trim().slice(0, 400);
      }
    }
  }
  if (typeof p.journalGuidance === "string" && p.journalGuidance.trim()) {
    return p.journalGuidance.trim().slice(0, 400);
  }
  if (p.manifest && typeof p.manifest === "object") {
    const bits = [
      p.manifest.lifeAreaTitle,
      p.manifest.focusGoalTitle,
      p.manifest.obstacleText,
      p.manifest.guidance,
    ]
      .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
      .map((s) => s.trim());
    if (bits.length) return bits.join(" — ").slice(0, 400);
  }
  if (Array.isArray(p.styleQuestionAnswers)) {
    const joined = p.styleQuestionAnswers
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .join(" ");
    if (joined) return joined.slice(0, 400);
  }
  return null;
}

/** S3 key under the media bucket. */
export function meditationCoverObjectKey(
  userId: string,
  meditationId: string,
): string {
  return `meditation-covers/${userId}/${meditationId}.jpg`;
}

/**
 * Build the image prompt. Concrete create inputs → related scene;
 * thin metadata → calm generic editorial still.
 */
export function buildMeditationCoverPrompt(input: MeditationCoverInput): string {
  const title = input.title.trim() || "Guided meditation";
  const description = (input.description ?? "").trim();
  const style = (
    input.meditationStyle ||
    input.meditationType ||
    ""
  ).trim();
  const createPrompt = (input.createPrompt ?? "").trim();

  const subjectBits: string[] = [];
  if (createPrompt) subjectBits.push(`Create intent: ${createPrompt.slice(0, 280)}`);
  if (description) subjectBits.push(`Description: ${description.slice(0, 320)}`);
  if (style) subjectBits.push(`Practice style: ${style}`);
  subjectBits.push(`Meditation title: ${title}`);

  const hasConcrete =
    createPrompt.length >= 12 ||
    description.length >= 24 ||
    /\b(ocean|sea|forest|rain|mountain|breath|sleep|anxiety|kindness|ground|body|walk|garden|river|storm|night|dawn|sun)\b/i.test(
      `${title} ${description} ${createPrompt} ${style}`,
    );

  const sceneGuidance = hasConcrete
    ? `Invent one clear, fitting photorealistic subject that visually echoes this meditation's theme and emotional tone (not a literal illustration of the words). Prefer nature, light, texture, or quiet interiors over abstract graphics.`
    : `No strong visual theme was given — choose a calm, generic editorial still suitable for a meditation library thumbnail (soft natural light, quiet landscape or intimate nature detail).`;

  return [
    `A photorealistic photograph, editorial/lifestyle style, evoking the mood of a guided meditation.`,
    sceneGuidance,
    subjectBits.join(" "),
    `Natural lighting, shallow depth of field, subtle film grain. No people, no faces, no text, no logos, no overlaid graphics, no UI chrome.`,
    `Square 1:1 composition, generous negative space suitable for a small thumbnail.`,
    `Color palette chosen to suit the specific theme and emotional tone of this meditation, not fixed.`,
  ].join(" ");
}

export async function generateMeditationCoverJpeg(
  input: MeditationCoverInput,
): Promise<{ jpeg: Buffer; prompt: string }> {
  const prompt = buildMeditationCoverPrompt(input);
  return generateJpegFromPrompt(prompt);
}

/** Always gpt-image-1-mini — used for meditation library covers. */
export async function generateJpegFromPrompt(
  prompt: string,
): Promise<{ jpeg: Buffer; prompt: string }> {
  const out = await generateGptImage1Mini(prompt);
  return { jpeg: out.body, prompt: out.prompt };
}

/**
 * Admin-only image gen: gpt-image-1-mini (default) or Nano Banana Pro (Gemini).
 * Meditation covers must keep using generateJpegFromPrompt / generateMeditationCoverJpeg.
 */
export async function generateAdminImageFromPrompt(params: {
  prompt: string;
  model?: AdminImageModel | string | null;
}): Promise<{
  body: Buffer;
  mime: "image/jpeg" | "image/png";
  prompt: string;
  model: AdminImageModel;
}> {
  const model = coerceAdminImageModel(params.model);
  if (model === "nano-banana-pro") {
    const out = await generateNanoBananaProImage(params.prompt);
    return { ...out, model };
  }
  const out = await generateGptImage1Mini(params.prompt);
  return { ...out, model };
}

async function generateGptImage1Mini(
  prompt: string,
): Promise<{ body: Buffer; mime: "image/jpeg"; prompt: string }> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Image prompt is empty");
  const apiKey = await getOpenAiApiKey();
  const upstream = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COVER_MODEL,
      prompt: trimmed,
      size: COVER_SIZE,
      quality: COVER_QUALITY,
      output_format: COVER_FORMAT,
      n: 1,
    }),
  });
  const raw = await upstream.text();
  type ImagesResponse = {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };
  let data: ImagesResponse | null = null;
  try {
    data = JSON.parse(raw) as ImagesResponse;
  } catch {
    data = null;
  }
  if (!upstream.ok) {
    throw new Error(
      `OpenAI image failed (${upstream.status}): ${
        data?.error?.message || raw.slice(0, 400)
      }`,
    );
  }
  const b64 = data?.data?.[0]?.b64_json?.trim();
  if (b64) {
    return {
      body: Buffer.from(b64, "base64"),
      mime: "image/jpeg",
      prompt: trimmed,
    };
  }
  const url = data?.data?.[0]?.url?.trim();
  if (url) {
    const img = await fetch(url);
    if (!img.ok) throw new Error(`cover download failed (${img.status})`);
    return {
      body: Buffer.from(await img.arrayBuffer()),
      mime: "image/jpeg",
      prompt: trimmed,
    };
  }
  throw new Error("OpenAI image response missing image data");
}

/** Text-only Nano Banana Pro (Gemini 3 Pro Image) — square editorial still. */
async function generateNanoBananaProImage(
  prompt: string,
): Promise<{ body: Buffer; mime: "image/png" | "image/jpeg"; prompt: string }> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Image prompt is empty");
  const apiKey = await getGoogleAiApiKey();
  const model =
    process.env.ADMIN_NANO_BANANA_MODEL?.trim() || NANO_BANANA_PRO_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const scenePrompt = [
    "Create a single square 1:1 photorealistic editorial photograph suitable as a meditation library / category cover thumbnail.",
    "Natural lighting, shallow depth of field, subtle film grain. No people, no faces, no text, no logos, no overlaid graphics, no UI chrome.",
    "Generous negative space suitable for a small thumbnail.",
    `Scene: ${trimmed}`,
  ].join("\n");

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: scenePrompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });
  const rawText = await upstream.text();
  if (!upstream.ok) {
    throw new Error(
      `Nano Banana Pro failed (${upstream.status}): ${rawText.slice(0, 400)}`,
    );
  }

  let outB64 = "";
  let outMime: "image/png" | "image/jpeg" = "image/png";
  try {
    const data = JSON.parse(rawText) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType?: string; data?: string };
            inline_data?: { mime_type?: string; data?: string };
          }>;
        };
      }>;
    };
    const outParts = data.candidates?.[0]?.content?.parts ?? [];
    for (const p of outParts) {
      const inline = p.inlineData ?? p.inline_data;
      if (inline?.data) {
        outB64 = inline.data;
        const mimeGuess =
          "mimeType" in inline
            ? inline.mimeType
            : "mime_type" in inline
              ? inline.mime_type
              : undefined;
        if (mimeGuess?.includes("jpeg") || mimeGuess?.includes("jpg")) {
          outMime = "image/jpeg";
        } else {
          outMime = "image/png";
        }
        break;
      }
    }
  } catch {
    throw new Error("Invalid JSON from Nano Banana Pro");
  }
  if (!outB64) {
    throw new Error("Nano Banana Pro response missing image data");
  }
  return {
    body: Buffer.from(outB64, "base64"),
    mime: outMime,
    prompt: trimmed,
  };
}

/** S3 key for a library category cover (stable per category label). */
export function categoryCoverObjectKey(category: string): string {
  const slug = category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `category-covers/${slug || "unknown"}.jpg`;
}

export async function putCategoryCover(params: {
  s3: S3Client;
  bucket: string;
  category: string;
  jpeg: Buffer;
}): Promise<string> {
  const key = categoryCoverObjectKey(params.category);
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: key,
      Body: params.jpeg,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=86400",
    }),
  );
  return key;
}

export async function putMeditationCover(params: {
  s3: S3Client;
  bucket: string;
  userId: string;
  meditationId: string;
  jpeg: Buffer;
}): Promise<string> {
  const key = meditationCoverObjectKey(params.userId, params.meditationId);
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: key,
      Body: params.jpeg,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return key;
}

/** Best-effort generate + upload. Returns null on failure. */
export async function generateAndStoreMeditationCover(params: {
  s3: S3Client;
  bucket: string;
  userId: string;
  meditationId: string;
  input: MeditationCoverInput;
}): Promise<string | null> {
  try {
    const { jpeg, prompt } = await generateMeditationCoverJpeg(params.input);
    const key = await putMeditationCover({
      s3: params.s3,
      bucket: params.bucket,
      userId: params.userId,
      meditationId: params.meditationId,
      jpeg,
    });
    console.log("meditation cover uploaded", {
      key,
      bytes: jpeg.byteLength,
      promptChars: prompt.length,
    });
    return key;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("meditation cover skipped", { msg });
    return null;
  }
}
