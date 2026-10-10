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
import { CLAUDE_HAIKU_45_MODEL_ID } from "./anthropic-pricing";
import {
  recordClaudeUsageFromResponseText,
  recordGoogleImageUsage,
  recordOpenAiImageUsage,
} from "./ai-usage";
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

/** Cover art prompt for Music › Compositions, derived from the track title. */
export function buildCompositionCoverPrompt(params: {
  title: string;
  /** Optional editor direction — honored strongly when present. */
  guidePrompt?: string;
}): string {
  const title = params.title.trim() || "Untitled composition";
  const guide = params.guidePrompt?.trim().slice(0, 800) ?? "";
  const cues = compositionTitleVisualCues(title);
  const motifLine = cues.length
    ? `Let these title-derived motifs guide the scene (poetically, not as text overlays): ${cues.join("; ")}.`
    : `Derive the subject freely from the title's wording, rhythm, and implied place or feeling.`;
  const guideLine = guide
    ? `Creative direction from the editor (honor this strongly): ${guide}.`
    : "";

  return [
    `Photorealistic photograph capturing the mood of the instrumental piece titled "${title}".`,
    motifLine,
    guideLine,
    `Subject matter is open: landscapes, interiors, people, objects, weather, architecture — whatever fits the title best. Make it specific and memorable to THIS title.`,
    `Visual style: editorial photography, natural or dramatic light, shallow depth of field where it helps, subtle film grain, rich color graded to the title's emotional register.`,
    `Square 1:1 composition. No overlaid text, logos, or UI chrome.`,
  ]
    .filter(Boolean)
    .join(" ");
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
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

/**
 * Rewrite the image prompt using prior cover prompts as context and a
 * "what to change" note. Returns a full replacement prompt (not a diff).
 */
export async function refineCompositionCoverPromptWithChange(params: {
  title: string;
  previousPrompts: string[];
  changeRequest: string;
}): Promise<string> {
  const title = params.title.trim() || "Untitled composition";
  const change = params.changeRequest.trim().slice(0, 600);
  if (!change) {
    throw new Error("changeRequest is required to refine a cover prompt");
  }

  const previous = params.previousPrompts
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(-5)
    .map((p) => p.slice(0, 3500));

  const baseFallback =
    previous[previous.length - 1] || buildCompositionCoverPrompt({ title });

  try {
    const apiKey = await getClaudeApiKey();
    const system = [
      "You revise image-generation prompts for square photoreal album/cover art.",
      "You are given prior prompt(s) that produced earlier versions of the cover, plus a short change request.",
      "Write ONE complete replacement image prompt that keeps what still works from the prior prompt(s) and applies the requested change.",
      "Do not invent hard bans on subject matter (people, faces, objects, interiors are fine).",
      "Keep: photorealistic editorial style, square 1:1 intent, no overlaid text/logos/UI.",
      "Reply with ONLY the prompt text — no quotes, labels, or explanation.",
    ].join("\n");

    const historyBlock =
      previous.length === 0
        ? `(none — start from a fresh title-based brief for "${title}")`
        : previous
            .map((p, i) => `--- prior prompt ${i + 1} of ${previous.length} ---\n${p}`)
            .join("\n\n");

    const user = [
      `Track title: ${title}`,
      "",
      "Previous image prompts (oldest → newest):",
      historyBlock,
      "",
      `Requested change:\n${change}`,
      "",
      "Write the full updated image prompt now.",
    ].join("\n");

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_HAIKU_45_MODEL_ID,
        max_tokens: 700,
        temperature: 0.35,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Haiku cover refine failed: ${raw.slice(0, 400)}`);
    }
    void recordClaudeUsageFromResponseText({
      responseText: raw,
      model: CLAUDE_HAIKU_45_MODEL_ID,
      feature: "composition-cover-refine",
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
      .replace(/^(updated|revised|final|improved)\s+prompt\s*:\s*/i, "")
      .trim();
    if (text.length < 20) {
      throw new Error("Haiku returned an empty cover prompt");
    }
    return text.slice(0, 4000);
  } catch (e) {
    // Fallback: keep prior prompt and append the change note.
    console.warn(
      "refineCompositionCoverPromptWithChange fallback:",
      e instanceof Error ? e.message : e,
    );
    return `${baseFallback} Apply this change while keeping the square photoreal cover style: ${change}`.slice(
      0,
      4000,
    );
  }
}

/** Roll prior last prompt into history (newest last), cap length. */
export function appendCoverPromptHistory(
  history: string[] | undefined,
  lastPrompt: string | undefined,
  max = 5,
): string[] {
  const out = (history ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.slice(0, 4000));
  const last = lastPrompt?.trim().slice(0, 4000);
  if (last && out[out.length - 1] !== last) out.push(last);
  return out.slice(-max);
}

/**
 * Pull concrete visual motifs from composition titles like
 * "(Theta 8Hz) ZEN Underwater" or "Chinese Miracle Mountain Lake".
 */
function compositionTitleVisualCues(title: string): string[] {
  const raw = title.trim();
  if (!raw) return [];
  const cues: string[] = [];

  const paren = raw.match(/\(([^)]+)\)/g) ?? [];
  for (const p of paren) {
    const inner = p.slice(1, -1).trim();
    if (!inner) continue;
    if (/\b(theta|delta|alpha|beta|gamma)\b/i.test(inner)) {
      const band = inner.match(/\b(theta|delta|alpha|beta|gamma)\b/i)?.[1];
      if (band) {
        const mood: Record<string, string> = {
          theta: "dreamy liminal dusk, soft indigo haze",
          delta: "deep night stillness, low horizon, heavy quiet",
          alpha: "calm daylight clarity, open air",
          beta: "alert crisp daylight, sharper edges",
          gamma: "high-energy crystalline light, bright speculars",
        };
        cues.push(`${band.toLowerCase()} brainwave mood — ${mood[band.toLowerCase()]!}`);
      }
    }
    if (/\b\d+(\.\d+)?\s*hz\b/i.test(inner)) {
      cues.push("subtle rhythmic pulse implied by light, water, or wind — not numerals");
    }
    if (/decreasing|increasing|frequency/i.test(inner)) {
      cues.push("a sense of gradual shift or descent/ascent in the landscape");
    }
  }

  const body = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const placeHints: Array<{ re: RegExp; cue: string }> = [
    { re: /\bunderwater|ocean|sea|tidal|shore|river|lake|brook|waterfall\b/i, cue: "water body / aquatic environment matching the title" },
    { re: /\bforest|woods|tree|grove|bamboo\b/i, cue: "forest or tree canopy environment" },
    { re: /\bmountain|peak|alpine|himalaya\b/i, cue: "mountain terrain" },
    { re: /\brain|storm|thunder|tempest\b/i, cue: "active weather — rain or storm atmosphere" },
    { re: /\bfire|hearth|ember|flame\b/i, cue: "firelight or glowing embers in a wider scene" },
    { re: /\bcave|grotto|underground\b/i, cue: "cave or subterranean space" },
    { re: /\bdesert|dune|arid\b/i, cue: "desert or arid expanse" },
    { re: /\bsnow|ice|glacier|winter|frost\b/i, cue: "cold winter or ice landscape" },
    { re: /\bdawn|sunrise|morning\b/i, cue: "dawn / sunrise light" },
    { re: /\bdusk|sunset|twilight|evening\b/i, cue: "dusk / twilight light" },
    { re: /\bnight|midnight|nocturne\b/i, cue: "night landscape" },
    { re: /\bcrystal|bowl|singing\b/i, cue: "crystalline light, refraction, mineral surfaces" },
    { re: /\btemple|shrine|monastery|pagoda\b/i, cue: "sacred architecture" },
    { re: /\bgarden|meadow|field|prairie\b/i, cue: "open garden or meadow" },
    { re: /\bfog|mist|haze\b/i, cue: "fog or mist" },
    { re: /\bcosmos|cosmic|galaxy|star|nebula|multiverse\b/i, cue: "celestial / night-sky scale" },
    { re: /\bportal|gateway|threshold\b/i, cue: "architectural or natural threshold / opening" },
    { re: /\broot|roots|earth|soil|ground\b/i, cue: "rooted earth, soil, or ancient tree roots" },
    { re: /\bchinese|tibetan|slavic|peruvian|roman|ancient\b/i, cue: "place/culture hinted by the title" },
    { re: /\bzen|trance|dream|sleep|heal|peace|serenity|quiet|still\b/i, cue: "quiet contemplative atmosphere" },
  ];
  for (const { re, cue } of placeHints) {
    if (re.test(body) || re.test(raw)) cues.push(cue);
  }

  // Dedupe while preserving order; cap so the prompt stays focused.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cues) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= 5) break;
  }
  return out;
}

/** S3 key under the media bucket for a composition cover. */
export function compositionCoverObjectKey(
  soundKey: string,
  ext: "jpg" | "png" | "webp" = "jpg",
): string {
  const stem = soundKey
    .replace(/^background-audio\//i, "")
    .replace(/\.(mp3|wav|opus)$/i, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/\/+/g, "--")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "composition";
  return `composition-covers/${stem}-${Date.now()}.${ext}`;
}

/** Sibling thumb key for a full-size composition cover object. */
export function compositionCoverThumbObjectKey(fullCoverKey: string): string {
  const trimmed = fullCoverKey.trim();
  if (/\.thumb\.(jpe?g|png|webp)$/i.test(trimmed)) return trimmed;
  return trimmed.replace(/\.(jpe?g|png|webp)$/i, ".thumb.jpg");
}

/** Edge length for list / picker thumbs (covers retina ~84 CSS px). */
export const COMPOSITION_COVER_THUMB_EDGE = 256;

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
  void recordOpenAiImageUsage({
    feature: "cover-image",
    model: COVER_MODEL,
  });
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
    "Create a single square 1:1 photorealistic photograph matching the scene brief below.",
    "Follow the brief's subject and mood. People, faces, hands, interiors, objects, and landscapes are all allowed when they fit the brief.",
    `Brief:\n${trimmed}`,
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
        // Keep full covers at ~1K (same as current NB Pro default); thumbs are
        // resized separately in composition-cover-thumb.
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K",
        },
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
  void recordGoogleImageUsage({
    feature: "cover-image",
    model,
  });
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
