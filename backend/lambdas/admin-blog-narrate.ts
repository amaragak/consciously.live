/**
 * Async TTS for a Read post: title + subheader + body.
 * Speechify (default) or Fish. No voice FX, no backing music. Loudnorm only.
 */
import type { Context } from "aws-lambda";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { loudnormMp3Buffer } from "./_shared/ffmpeg-loudnorm";
import {
  getBlogPostById,
  htmlToBlogNarrationScript,
  patchBlogPostAudio,
} from "./_shared/blog";
import { invalidateBlogCache } from "./_shared/blog-revalidate";
import { fishSpeakersForPicker } from "./_shared/fish-speakers";
import {
  chunkSpeechifyScript,
  coerceBlogTtsProvider,
  getSpeechifyApiKey,
  speechifyTtsMp3,
  speechifyVoiceId,
  type BlogTtsProvider,
} from "./_shared/speechify-tts";
import { listVoiceSpeakers } from "./_shared/voice-admin";

const execFileAsync = promisify(execFile);
const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});
const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
/** Only pack multiple paragraphs if the whole script is longer than this. Never cut mid-paragraph. */
const FISH_PACK_CHARS = 12_000;
const TIME_RESERVE_MS = 45_000;

function assertTimeLeft(context: Context | undefined, label: string) {
  if (!context) return;
  const left = context.getRemainingTimeInMillis();
  if (left < TIME_RESERVE_MS) {
    throw new Error(
      `Ran out of time during ${label} (${Math.round(left / 1000)}s left). Try again, or shorten the post.`,
    );
  }
}

function fishTtsModel(): string {
  return (process.env.FISH_TTS_MODEL || "s2.1-pro-free").trim() || "s2.1-pro-free";
}

let cachedApiKey: string | undefined;

async function getFishApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const arn = process.env.FISH_AUDIO_SECRET_ARN?.trim();
  if (!arn) throw new Error("FISH_AUDIO_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Fish Audio API key secret is empty");
  cachedApiKey = s;
  return cachedApiKey;
}

async function resolveSpeakerModelId(): Promise<string> {
  try {
    const speakers = await listVoiceSpeakers();
    const visible = speakers.filter((s) => !s.hidden && s.brand === "fish");
    if (visible[0]?.modelId) return visible[0].modelId;
  } catch {
    /* fall through */
  }
  const fallback = fishSpeakersForPicker()[0]?.modelId;
  if (!fallback) throw new Error("No Fish speaker is configured");
  return fallback;
}

function buildNarrationScript(post: {
  title: string;
  subheader: string;
  body: string;
}): string {
  const intro: string[] = [];
  if (post.title.trim()) intro.push(post.title.trim());
  if (post.subheader.trim()) intro.push("[short pause]", post.subheader.trim());
  const body = htmlToBlogNarrationScript(post.body);
  if (body) {
    if (intro.length) intro.push("[long pause]");
    intro.push(body);
  }
  return intro.join(" ").replace(/\s+/g, " ").trim();
}

function chunkNarration(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= FISH_PACK_CHARS) return [trimmed];

  const tokens = trimmed.split(/\s*(\[(?:short|long) pause\])\s*/i);
  const paragraphs: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = (tokens[i] ?? "").trim();
    if (!tok) continue;
    if (/^\[(?:short|long) pause\]$/i.test(tok)) {
      const next = (tokens[i + 1] ?? "").trim();
      paragraphs.push(next ? `${tok} ${next}` : tok);
      i += 1;
      continue;
    }
    paragraphs.push(tok);
  }

  const chunks: string[] = [];
  let buf = "";
  for (const para of paragraphs) {
    const next = buf ? `${buf} ${para}` : para;
    if (buf && next.length > FISH_PACK_CHARS) {
      chunks.push(buf.trim());
      buf = para;
      continue;
    }
    buf = next;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [trimmed];
}

async function fishTtsMp3(
  apiKey: string,
  referenceId: string,
  text: string,
): Promise<Buffer> {
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const upstream = await fetch(FISH_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: fishTtsModel(),
      },
      body: JSON.stringify({
        text,
        reference_id: referenceId,
        format: "mp3",
        latency: "normal",
        normalize: true,
        prosody: { speed: 0.95, normalize_loudness: true },
      }),
    });
    if (upstream.ok) return Buffer.from(await upstream.arrayBuffer());
    lastErr = await upstream.text();
    if (![429, 502, 503, 504].includes(upstream.status) || attempt >= 3) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error(`Fish TTS failed: ${lastErr.slice(0, 500)}`);
}

async function concatMp3(parts: Buffer[]): Promise<Buffer> {
  if (parts.length === 1) return parts[0]!;
  const id = randomUUID();
  const files: string[] = [];
  const listPath = `/tmp/blog-concat-${id}.txt`;
  const outPath = `/tmp/blog-concat-out-${id}.mp3`;
  try {
    for (let i = 0; i < parts.length; i += 1) {
      const p = `/tmp/blog-part-${id}-${i}.mp3`;
      fs.writeFileSync(p, parts[i]!);
      files.push(p);
    }
    fs.writeFileSync(
      listPath,
      files.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    for (const p of [...files, listPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

function audioKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/(blog\/audio\/[^/?#]+)/i.exec(url);
  return m?.[1] ?? null;
}

export async function handler(
  event: { id?: string; ttsProvider?: BlogTtsProvider },
  context?: Context,
): Promise<void> {
  const id = typeof event?.id === "string" ? event.id.trim() : "";
  if (!id) {
    console.error("admin-blog-narrate: missing id");
    return;
  }
  const post = await getBlogPostById(id);
  if (!post) {
    console.error("admin-blog-narrate: post not found", id);
    return;
  }

  try {
    const script = buildNarrationScript(post);
    if (!script.trim()) {
      throw new Error("Nothing to narrate — add a title or body, then save.");
    }
    const provider = coerceBlogTtsProvider(
      event.ttsProvider ?? post.audioTtsProvider,
    );
    const chunks =
      provider === "speechify"
        ? chunkSpeechifyScript(script)
        : chunkNarration(script);
    if (!chunks.length) throw new Error("Nothing to narrate");
    console.info(
      "admin-blog-narrate: start",
      id,
      provider,
      "chunks",
      chunks.length,
      "chars",
      script.length,
    );
    await patchBlogPostAudio(id, {
      audioStatus: "generating",
      audioTtsProvider: provider,
      audioProgress: `Preparing ${provider === "speechify" ? "Speechify" : "Fish"}… ${chunks.length} part${chunks.length === 1 ? "" : "s"}`,
    });

    const rawParts: Buffer[] = [];
    if (provider === "speechify") {
      const apiKey = await getSpeechifyApiKey();
      const voiceId = speechifyVoiceId();
      for (let i = 0; i < chunks.length; i += 1) {
        assertTimeLeft(context, `Speechify ${i + 1}/${chunks.length}`);
        await patchBlogPostAudio(id, {
          audioStatus: "generating",
          audioProgress: `Speechify: synthesizing ${i + 1} of ${chunks.length}…`,
        });
        rawParts.push(
          await speechifyTtsMp3({ apiKey, text: chunks[i]!, voiceId }),
        );
      }
    } else {
      const [apiKey, modelId] = await Promise.all([
        getFishApiKey(),
        resolveSpeakerModelId(),
      ]);
      for (let i = 0; i < chunks.length; i += 1) {
        assertTimeLeft(context, `TTS chunk ${i + 1}/${chunks.length}`);
        await patchBlogPostAudio(id, {
          audioStatus: "generating",
          audioProgress: `Fish: synthesizing ${i + 1} of ${chunks.length}…`,
        });
        rawParts.push(await fishTtsMp3(apiKey, modelId, chunks[i]!));
      }
    }
    await patchBlogPostAudio(id, {
      audioStatus: "generating",
      audioProgress: "Mixing and uploading…",
    });
    const joined = await concatMp3(rawParts);
    const mp3 = await loudnormMp3Buffer(joined);

    const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
    const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
    if (!bucket || !cfDomain) {
      throw new Error("MEDIA_BUCKET_NAME or MEDIA_CLOUDFRONT_DOMAIN is not set");
    }
    const key = `blog/audio/${id}-${Date.now()}.mp3`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: mp3,
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const previousKey = audioKeyFromUrl(post.audioUrl);
    if (previousKey && previousKey !== key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: previousKey }));
      } catch (e) {
        console.warn("admin-blog-narrate: could not delete old audio", previousKey, e);
      }
    }

    const saved = await patchBlogPostAudio(id, {
      audioUrl: `https://${cfDomain}/${key}`,
      audioStatus: "ready",
      audioError: null,
      audioProgress: null,
      audioStartedAt: null,
      audioGeneratedAt: new Date().toISOString(),
    });
    await invalidateBlogCache({ index: true, slugs: saved.slug ? [saved.slug] : [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Audio generation failed";
    console.error("admin-blog-narrate", id, msg);
    try {
      await patchBlogPostAudio(id, {
        audioStatus: "failed",
        audioError: msg,
        audioProgress: null,
      });
    } catch (patchErr) {
      console.error("admin-blog-narrate: failed to record error", patchErr);
    }
  }
}
