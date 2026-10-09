import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  CopyObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import { SCRIPT_PAUSE_BANDS, type ScriptPauseBand } from "./_shared/script-pause-bands";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  speakerPreviewLoudFxSampleKey,
} from "./_shared/speaker-sample-speed";
import {
  SPEAKER_PREVIEW_TEXT,
  generateFishSpeakerPreview,
  generateSpeechifyEmotionSample,
  generateSpeechifyLetterIntroSample,
  letterIntroSampleText,
  speakerPreviewReady,
  speechifyEmotionSampleUrls,
} from "./_shared/fish-speaker-preview";
import { aacAdtsToMp3Buffer } from "./_shared/audio-aac";
import {
  getSpeechifyApiKey,
  speechifyRateToSsml,
  speechifyTtsMp3,
  type SpeechifyEmotionTag,
} from "./_shared/speechify-tts";
import {
  coerceSpeechifyEmotionSampleTag,
  SPEECHIFY_EMOTION_SAMPLE_TAGS,
  type SpeechifyEmotionSampleTag,
} from "./_shared/speaker-sample-speed";
import {
  buildSpeakerPortraitPrompt,
  coerceAppearanceDescription,
  coercePortraitBgColor,
  speakerPortraitObjectKey,
} from "./_shared/speaker-portrait";
import {
  coerceAdminImageModel,
  generateAdminImageFromPrompt,
} from "./_shared/meditation-cover";
import { coerceEnergies } from "./_shared/voice-preferred-traits";
import type { VoiceEnergy } from "./_shared/fish-speakers";
import {
  deleteVoiceSpeaker,
  loadPauseBandSeconds,
  loadStyleVoicePrefs,
  listVoiceSpeakers,
  putVoiceSpeaker,
  renameVoiceSpeaker,
  savePauseBandSeconds,
  saveStyleVoicePrefs,
  seedVoiceSpeakersIfEmpty,
  type PauseBandSeconds,
  type VoiceSpeakerRow,
} from "./_shared/voice-admin";

const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});

async function getFishApiKey(): Promise<string> {
  const arn = process.env.FISH_AUDIO_SECRET_ARN;
  if (!arn) throw new Error("FISH_AUDIO_SECRET_ARN is not set");
  const secret = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const apiKey = secret.SecretString?.trim();
  if (!apiKey) throw new Error("Fish Audio API key is empty");
  return apiKey;
}

async function copySpeakerSamplePrefix(
  fromModelId: string,
  toModelId: string,
): Promise<void> {
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  if (!bucket || !fromModelId || !toModelId || fromModelId === toModelId) return;
  const fromPrefix = `speaker-samples/${fromModelId}/`;
  const toPrefix = `speaker-samples/${toModelId}/`;
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: fromPrefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key;
      if (!key || !key.startsWith(fromPrefix)) continue;
      const dest = `${toPrefix}${key.slice(fromPrefix.length)}`;
      await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${key}`,
          Key: dest,
          MetadataDirective: "COPY",
        }),
      );
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  try {
    if (method === "GET") return await handleGet();
    if (method === "PATCH") return await handlePatch(event);
    if (method === "POST") return await handlePost(event);
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin voice failed";
    console.error("admin-voice", msg);
    return json(500, { error: msg });
  }
}

async function handleGet() {
  const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
  const baseUrl = domain ? `https://${domain}` : undefined;
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const [speakers, pauses, styleVoicePrefs] = await Promise.all([
    seedVoiceSpeakersIfEmpty(),
    loadPauseBandSeconds(),
    loadStyleVoicePrefs(),
  ]);
  const withSamples = await Promise.all(
    speakers.map(async (s) => {
      let hasSample = false;
      if (bucket) {
        try {
          hasSample = await speakerPreviewReady(
            s3,
            bucket,
            s.modelId,
            s.brand,
            s.brand === "speechify" ? (s.speechifyRate ?? 0) : undefined,
          );
        } catch {
          hasSample = false;
        }
      }
      const sampleKey = speakerPreviewLoudFxSampleKey(
        s.modelId,
        s.brand === "speechify"
          ? (s.speechifyRate ?? 0)
          : FIXED_SPEECH_PREVIEW_SPEED,
        s.brand,
      );
      const bust = encodeURIComponent(s.updatedAt || String(Date.now()));
      const sampleUrl =
        hasSample && baseUrl ? `${baseUrl}/${sampleKey}?v=${bust}` : null;
      let emotionSampleUrls: Partial<
        Record<SpeechifyEmotionSampleTag, string>
      > | null = null;
      if (s.brand === "speechify" && bucket) {
        try {
          emotionSampleUrls = await speechifyEmotionSampleUrls({
            s3,
            bucket,
            modelId: s.modelId,
            baseUrl,
            bust,
          });
        } catch {
          emotionSampleUrls = {};
        }
      }
      const portraitImageUrl =
        s.portraitImageKey && baseUrl
          ? `${baseUrl}/${s.portraitImageKey}?v=${bust}`
          : null;
      return {
        ...s,
        hasSample,
        sampleUrl,
        emotionSampleUrls,
        portraitImageUrl,
      };
    }),
  );
  return json(200, {
    baseUrl,
    speakers: withSamples,
    pauses,
    pauseBands: SCRIPT_PAUSE_BANDS,
    styleVoicePrefs,
  });
}

function optionalTrait<T>(
  s: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(s, key)) return undefined;
  const raw = s[key];
  if (raw === null || raw === "") return null;
  if (typeof raw === "string" && (allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  if (typeof raw === "string") {
    const n = raw.trim().toLowerCase();
    const hit = allowed.find((a) => String(a).toLowerCase() === n);
    if (hit) return hit;
  }
  return null;
}

function optionalEnergies(
  s: Record<string, unknown>,
  key: string,
): VoiceEnergy[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(s, key)) return undefined;
  return coerceEnergies(s[key]);
}

async function handlePatch(event: APIGatewayProxyEventV2) {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  let pauses: PauseBandSeconds | undefined;
  if (body.pauses && typeof body.pauses === "object") {
    pauses = await savePauseBandSeconds(body.pauses as Partial<Record<ScriptPauseBand, number>>);
  }

  let styleVoicePrefs: Awaited<ReturnType<typeof saveStyleVoicePrefs>> | undefined;
  if (body.styleVoicePrefs && typeof body.styleVoicePrefs === "object") {
    styleVoicePrefs = await saveStyleVoicePrefs(
      body.styleVoicePrefs as Record<string, unknown>,
    );
  }

  let speaker: VoiceSpeakerRow | undefined;
  if (body.speaker && typeof body.speaker === "object") {
    const s = body.speaker as Record<string, unknown>;
    const payload = {
      modelId: String(s.modelId ?? ""),
      name: String(s.name ?? ""),
      brand:
        s.brand === "fish" || s.brand === "speechify" ? s.brand : undefined,
      hidden: s.hidden === true,
      sort: typeof s.sort === "number" ? s.sort : undefined,
      description: typeof s.description === "string" ? s.description : undefined,
      goodFor:
        Array.isArray(s.goodFor) || typeof s.goodFor === "string"
          ? (s.goodFor as string[] | string)
          : undefined,
      gender:
        s.gender === "male" || s.gender === "female"
          ? s.gender
          : s.gender === null || s.gender === ""
            ? null
            : undefined,
      energy: optionalEnergies(s, "energy"),
      pitch: optionalTrait(s, "pitch", ["low", "mid", "high"] as const),
      accent: optionalTrait(s, "accent", ["UK", "US", "African"] as const),
      speechifyRate:
        Object.prototype.hasOwnProperty.call(s, "speechifyRate")
          ? (s.speechifyRate as number | null)
          : undefined,
      appearanceDescription:
        typeof s.appearanceDescription === "string"
          ? s.appearanceDescription
          : undefined,
      portraitBgColor:
        typeof s.portraitBgColor === "string" ? s.portraitBgColor : undefined,
    };
    const previousModelId = String(s.previousModelId ?? "").trim();
    speaker =
      previousModelId && previousModelId !== payload.modelId.trim()
        ? await renameVoiceSpeaker(previousModelId, payload)
        : await putVoiceSpeaker(payload);
    if (previousModelId && previousModelId !== speaker.modelId) {
      try {
        await copySpeakerSamplePrefix(previousModelId, speaker.modelId);
      } catch (e) {
        console.warn("copy speaker samples after rename failed", e);
      }
    }
  }

  return json(200, { ok: true, pauses, speaker, styleVoicePrefs });
}

async function handlePost(event: APIGatewayProxyEventV2) {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const action = String(body.action ?? "").trim();
  if (action === "delete") {
    const modelId = String(body.modelId ?? "").trim();
    if (!modelId) return json(400, { error: "modelId is required" });
    await deleteVoiceSpeaker(modelId);
    return json(200, { ok: true });
  }
  if (action === "sample") {
    const modelId = String(body.modelId ?? "").trim();
    if (!modelId) return json(400, { error: "modelId is required" });
    const existing = (await listVoiceSpeakers()).find((s) => s.modelId === modelId);
    const force = body.force === true;
    const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
    if (!bucket) return json(500, { error: "MEDIA_BUCKET_NAME is not set" });
    const apiBase = process.env.CONSCIOUSLY_API_URL?.trim() || null;
    const brand = existing?.brand === "speechify" ? "speechify" : "fish";
    // One absolute Speechify rate per call keeps us under API Gateway’s 30s cap.
    const onlySpeechifyRate =
      brand === "speechify" &&
      typeof body.speechifyRate === "number" &&
      Number.isFinite(body.speechifyRate)
        ? Math.max(-50, Math.min(50, Math.round(body.speechifyRate)))
        : null;
    const baseRate = existing?.speechifyRate ?? 0;
    const keys =
      brand === "speechify"
        ? await generateFishSpeakerPreview({
            s3,
            bucket,
            modelId,
            brand,
            apiBase,
            force,
            speechifyBaseRate: baseRate,
            ...(onlySpeechifyRate != null
              ? { onlyRates: [onlySpeechifyRate] }
              : {}),
            synthesize: async (rate) =>
              aacAdtsToMp3Buffer(
                await speechifyTtsMp3({
                  apiKey: await getSpeechifyApiKey(),
                  text: SPEAKER_PREVIEW_TEXT,
                  voiceId: modelId,
                  rate: speechifyRateToSsml(rate),
                }),
              ),
          })
        : await generateFishSpeakerPreview({
            s3,
            bucket,
            apiKey: await getFishApiKey(),
            modelId,
            brand,
            apiBase,
            force,
          });
    let letterIntroKey: string | null = null;
    let letterIntroWrote = false;
    // Letter intro once at admin (center) rate — skip when generating a pacing sibling.
    const shouldWriteLetterIntro =
      brand === "speechify" &&
      (onlySpeechifyRate == null || onlySpeechifyRate === Math.round(baseRate));
    if (shouldWriteLetterIntro) {
      const intro = await generateSpeechifyLetterIntroSample({
        s3,
        bucket,
        modelId,
        speakerName: existing?.name?.trim() || "your narrator",
        force,
        synthesize: async () =>
          aacAdtsToMp3Buffer(
            await speechifyTtsMp3({
              apiKey: await getSpeechifyApiKey(),
              text: letterIntroSampleText(
                existing?.name?.trim() || "your narrator",
              ),
              voiceId: modelId,
              rate: speechifyRateToSsml(existing?.speechifyRate ?? null),
            }),
          ),
      });
      letterIntroKey = intro.key;
      letterIntroWrote = intro.skipped !== true;
    }
    let updatedAt = existing?.updatedAt;
    if (existing && (!keys.skipped || letterIntroWrote)) {
      const saved = await putVoiceSpeaker({
        modelId,
        name: existing.name,
        brand: existing.brand,
        hidden: existing.hidden,
        sort: existing.sort,
        description: existing.description,
        goodFor: existing.goodFor,
        gender: existing.gender,
        speechifyRate: existing.speechifyRate,
      });
      updatedAt = saved.updatedAt;
    }
    const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
    const sampleKey = speakerPreviewLoudFxSampleKey(
      modelId,
      brand === "speechify"
        ? (existing?.speechifyRate ?? 0)
        : FIXED_SPEECH_PREVIEW_SPEED,
      brand,
    );
    const bust = encodeURIComponent(updatedAt || String(Date.now()));
    const sampleUrl = domain ? `https://${domain}/${sampleKey}?v=${bust}` : null;
    return json(200, {
      ok: true,
      ...keys,
      ...(letterIntroKey ? { letterIntroKey } : {}),
      sampleUrl,
    });
  }
  if (action === "emotion-samples") {
    const modelId = String(body.modelId ?? "").trim();
    if (!modelId) return json(400, { error: "modelId is required" });
    const existing = (await listVoiceSpeakers()).find((s) => s.modelId === modelId);
    if (!existing || existing.brand !== "speechify") {
      return json(400, { error: "Emotion samples are Speechify-only" });
    }
    const force = body.force === true;
    const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
    if (!bucket) return json(500, { error: "MEDIA_BUCKET_NAME is not set" });
    const one = coerceSpeechifyEmotionSampleTag(body.emotion);
    const tags: SpeechifyEmotionSampleTag[] = one
      ? [one]
      : [...SPEECHIFY_EMOTION_SAMPLE_TAGS];
    const apiKey = await getSpeechifyApiKey();
    const rate = speechifyRateToSsml(existing.speechifyRate ?? null);
    const results: Array<{
      tag: SpeechifyEmotionSampleTag;
      key: string;
      skipped?: boolean;
    }> = [];
    for (const tag of tags) {
      const emotion: SpeechifyEmotionTag | null =
        tag === "neutral" ? null : tag;
      const out = await generateSpeechifyEmotionSample({
        s3,
        bucket,
        modelId,
        tag,
        force,
        synthesize: async () =>
          aacAdtsToMp3Buffer(
            await speechifyTtsMp3({
              apiKey,
              text: SPEAKER_PREVIEW_TEXT,
              voiceId: modelId,
              rate,
              emotion,
            }),
          ),
      });
      results.push({ tag, key: out.key, skipped: out.skipped });
    }
    const wrote = results.some((r) => r.skipped !== true);
    let updatedAt = existing.updatedAt;
    if (wrote) {
      const saved = await putVoiceSpeaker({
        modelId,
        name: existing.name,
        brand: existing.brand,
        hidden: existing.hidden,
        sort: existing.sort,
        description: existing.description,
        goodFor: existing.goodFor,
        gender: existing.gender,
        speechifyRate: existing.speechifyRate,
      });
      updatedAt = saved.updatedAt;
    }
    const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
    const bust = encodeURIComponent(updatedAt || String(Date.now()));
    const emotionSampleUrls = await speechifyEmotionSampleUrls({
      s3,
      bucket,
      modelId,
      baseUrl: domain ? `https://${domain}` : undefined,
      bust,
    });
    return json(200, { ok: true, results, emotionSampleUrls });
  }
  if (action === "portrait") {
    const modelId = String(body.modelId ?? "").trim();
    if (!modelId) return json(400, { error: "modelId is required" });
    const existing = (await listVoiceSpeakers()).find((s) => s.modelId === modelId);
    if (!existing) return json(404, { error: "Speaker not found" });
    if (existing.brand !== "speechify") {
      return json(400, { error: "Portraits are Speechify-only for now" });
    }
    // Fall back to the same defaults as buildSpeakerPortraitPrompt so Generate
    // works before admin has filled appearance / background fields.
    const appearance =
      coerceAppearanceDescription(
        typeof body.appearanceDescription === "string"
          ? body.appearanceDescription
          : existing.appearanceDescription,
      ) ||
      coerceAppearanceDescription(existing.appearanceDescription) ||
      "a warm, friendly adult narrator with natural features";
    const bg =
      coercePortraitBgColor(
        typeof body.portraitBgColor === "string"
          ? body.portraitBgColor
          : existing.portraitBgColor,
      ) ||
      coercePortraitBgColor(existing.portraitBgColor) ||
      "a soft teal-to-blue gradient";
    const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
    if (!bucket) return json(500, { error: "MEDIA_BUCKET_NAME is not set" });
    const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
    if (!domain) {
      return json(500, { error: "MEDIA_CLOUDFRONT_DOMAIN is not set" });
    }

    const prompt = buildSpeakerPortraitPrompt({
      name: existing.name,
      appearanceDescription: appearance,
      portraitBgColor: bg,
      gender: existing.gender,
    });
    const model = coerceAdminImageModel(body.model);
    const { body: imageBody, mime } = await generateAdminImageFromPrompt({
      prompt,
      model,
    });
    const key = speakerPortraitObjectKey(modelId);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: imageBody,
        ContentType: mime,
        CacheControl: "public, max-age=0, must-revalidate",
      }),
    );
    const saved = await putVoiceSpeaker({
      modelId,
      name: existing.name,
      brand: existing.brand,
      hidden: existing.hidden,
      sort: existing.sort,
      description: existing.description,
      goodFor: existing.goodFor,
      gender: existing.gender,
      energy: existing.energy,
      pitch: existing.pitch,
      accent: existing.accent,
      speechifyRate: existing.speechifyRate,
      appearanceDescription: appearance,
      portraitBgColor: bg,
      portraitImageKey: key,
    });
    const bust = encodeURIComponent(saved.updatedAt || String(Date.now()));
    const portraitImageUrl = `https://${domain}/${key}?v=${bust}`;
    return json(200, {
      ok: true,
      speaker: { ...saved, portraitImageUrl },
      portraitImageUrl,
      portraitImageKey: key,
      prompt,
    });
  }
  return json(400, { error: "Unknown action" });
}
