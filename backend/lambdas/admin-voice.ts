import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  CopyObjectCommand,
  ListObjectsV2Command,
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
  speakerPreviewReady,
} from "./_shared/fish-speaker-preview";
import {
  getSpeechifyApiKey,
  speechifyRateToSsml,
  speechifyTtsMp3,
} from "./_shared/speechify-tts";
import {
  deleteVoiceSpeaker,
  loadPauseBandSeconds,
  listVoiceSpeakers,
  putVoiceSpeaker,
  renameVoiceSpeaker,
  savePauseBandSeconds,
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
  const [speakers, pauses] = await Promise.all([
    seedVoiceSpeakersIfEmpty(),
    loadPauseBandSeconds(),
  ]);
  const withSamples = await Promise.all(
    speakers.map(async (s) => {
      let hasSample = false;
      if (bucket) {
        try {
          hasSample = await speakerPreviewReady(s3, bucket, s.modelId, s.brand);
        } catch {
          hasSample = false;
        }
      }
      const sampleKey = speakerPreviewLoudFxSampleKey(
        s.modelId,
        FIXED_SPEECH_PREVIEW_SPEED,
        s.brand,
      );
      const bust = encodeURIComponent(s.updatedAt || String(Date.now()));
      return {
        ...s,
        hasSample,
        sampleUrl: hasSample && baseUrl ? `${baseUrl}/${sampleKey}?v=${bust}` : null,
      };
    }),
  );
  return json(200, { baseUrl, speakers: withSamples, pauses, pauseBands: SCRIPT_PAUSE_BANDS });
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
      speechifyRate:
        Object.prototype.hasOwnProperty.call(s, "speechifyRate")
          ? (s.speechifyRate as number | null)
          : undefined,
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

  return json(200, { ok: true, pauses, speaker });
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
    const keys =
      brand === "speechify"
        ? await generateFishSpeakerPreview({
            s3,
            bucket,
            modelId,
            brand,
            apiBase,
            force,
            synthesize: async () =>
              speechifyTtsMp3({
                apiKey: await getSpeechifyApiKey(),
                text: SPEAKER_PREVIEW_TEXT,
                voiceId: modelId,
                rate: speechifyRateToSsml(existing?.speechifyRate ?? null),
              }),
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
    let updatedAt = existing?.updatedAt;
    if (existing && !keys.skipped) {
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
      FIXED_SPEECH_PREVIEW_SPEED,
      brand,
    );
    const bust = encodeURIComponent(updatedAt || String(Date.now()));
    const sampleUrl = domain ? `https://${domain}/${sampleKey}?v=${bust}` : null;
    return json(200, { ok: true, ...keys, sampleUrl });
  }
  return json(400, { error: "Unknown action" });
}
