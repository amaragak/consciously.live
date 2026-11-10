import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { sentenceBreakMs, type DeliveryId } from "./_shared/delivery-profiles";
import { paceAdjustmentPct, voicePaceTable } from "./_shared/meditation-length-fit";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  CopyObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import type { ConsciouslyAuthUser } from "./_shared/consciously-auth-http";
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
  speakerPreviewPlaybackUrl,
  speakerPreviewReady,
  speechifyEmotionSampleUrls,
} from "./_shared/fish-speaker-preview";
import { aacAdtsToMp3Buffer } from "./_shared/audio-aac";
import { bufferToMp3WithTempo } from "./_shared/audio-mp3";
import { fishTtsMp3, fishTtsPcm24k } from "./_shared/fish-tts";
import { pcm24kS16leToAac44100 } from "./_shared/voice-fx-ffmpeg-chain";
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
import {
  describeSpeaker,
  cancelCalibration,
  expireStaleMeasure,
  loadAllCalibrations,
  loadCalibrationConfig,
  loadDeliveryProfileRecord,
  calibrationCellKey,
  loadScriptCalibrationBatch,
  loadScriptCalibrationCells,
  saveCalibration,
  saveCalibrationConfig,
  saveDeliveryProfileRecord,
  saveScriptCalibrationBatch,
  saveScriptCalibrationCell,
  type SpeakerRateDoc,
  loadRecentLengthLogs,
  type LengthLog,
} from "./_shared/voice-calibration-store";
import {
  defaultScriptTargetCorrection,
  correctionHasCalibratedSamples,
} from "./_shared/script-target-correction";
import {
  CALIBRATE_DELIVERIES,
  CALIBRATE_MINUTES,
  CALIBRATE_VOICES,
  calibrateScriptModelCell,
} from "./_shared/script-model-calibrate";
import {
  applyFactorsToSettings,
  calibrationWorkItems,
  diversionsFromCells,
  factorsFromCalibrationCells,
  runCalibrationCell,
  summarizeCalibrationCellGroup,
  type CalibrationCellResult,
  type StoredCalibrationBatch,
} from "./_shared/script-calibration-batch";
import {
  correctionForModel,
  resetCorrectionForModel,
  setCorrectionForModel,
} from "./_shared/script-generation-settings";
import { stepVoiceCalibration } from "./_shared/voice-calibration-run";

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
  if (!("sub" in admin)) return admin;

  try {
    if (method === "GET") return await handleGet(event);
    if (method === "PATCH") return await handlePatch(event);
    if (method === "POST") return await handlePost(event, admin);
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin voice failed";
    console.error("admin-voice", msg);
    return json(500, { error: msg });
  }
}

function calibrationMediaUrl(
  key: string | null | undefined,
  version: string | null | undefined,
): string | null {
  const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
  if (!domain || !key) return null;
  const bust = encodeURIComponent(version || String(Date.now()));
  return `https://${domain}/${key}?v=${bust}`;
}


async function handleGet(event: APIGatewayProxyEventV2) {
  const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
  const baseUrl = domain ? `https://${domain}` : undefined;
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const requestedModelId = event.queryStringParameters?.modelId?.trim() || "";
  const [speakers, pauses, styleVoicePrefs, profileRecord, calibrationConfig, loadedDocs] =
    await Promise.all([
      seedVoiceSpeakersIfEmpty(),
      loadPauseBandSeconds(),
      loadStyleVoicePrefs(),
      loadDeliveryProfileRecord(),
      loadCalibrationConfig(),
      loadAllCalibrations(),
    ]);
  const docs = await Promise.all(
    loadedDocs.map(async (doc) => {
      const next = expireStaleMeasure(doc);
      if (next !== doc) await saveCalibration(next);
      return next;
    }),
  );
  const docsById = new Map(docs.map((d) => [d.modelId, d]));
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
        hasSample && baseUrl
          ? speakerPreviewPlaybackUrl(baseUrl, sampleKey, bust)
          : null;
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
  const blank = (modelId: string): SpeakerRateDoc => ({
    modelId,
    wpm: null,
    measuredAt: null,
    audioKey: null,
    texts: [],
    shortPauseSec: null,
    sentencePauseSec: null,
    words: null,
    durationSec: null,
    history: [],
    error: null,
    progress: null,
    job: null,
    updatedAt: null,
  });
  const paceTable = voicePaceTable(
    withSamples.map((s) => ({
      modelId: s.modelId,
      brand: s.brand === "speechify" ? "speechify" : "fish",
      wpm: docsById.get(s.modelId)?.wpm ?? null,
    })),
  );
  const lengthLogs = await loadRecentLengthLogs(90).catch(() => [] as LengthLog[]);
  const calibration = withSamples.map((s) => {
    const doc = docsById.get(s.modelId) ?? blank(s.modelId);
    const summary = describeSpeaker(doc);
    const pace = paceTable.get(s.modelId);
    return {
      modelId: s.modelId,
      ...summary,
      audioUrl: calibrationMediaUrl(doc.audioKey, doc.updatedAt),
      paceAdjustPct: pace ? paceAdjustmentPct(pace.paceAdjust) : null,
      lengthVsRequestPct: lengthVsRequestForVoice(lengthLogs, s.modelId),
    };
  });
  // Per-voice detail (rate, samples, history, approval) is not part of this page.
  void requestedModelId;
  return json(200, {
    baseUrl,
    speakers: withSamples,
    pauses,
    pauseBands: SCRIPT_PAUSE_BANDS,
    styleVoicePrefs,
    calibration,
    calibrationConfig,
    deliveryProfiles: profileRecord.profiles,
    targetCorrection: profileRecord.targetCorrection,
    scriptGeneration: profileRecord.scriptGeneration,
    deliveryProfileMeta: {
      updatedAt: profileRecord.updatedAt,
      updatedBy: profileRecord.updatedBy,
      history: profileRecord.history,
    },
    lengthStats: lengthStatsByDelivery(lengthLogs),
    sectionStats: sectionStatsByDeliveryAndLength(lengthLogs),
  });
}

function lengthDiffPct(log: LengthLog): number | null {
  const requested = log.requestedMinutes * 60;
  if (!(requested > 0) || !(log.actualSeconds > 0)) return null;
  const session = log.actualSeconds + (log.overheadSeconds ?? 0);
  return ((session - requested) / requested) * 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Average length vs request over a voice's last 20 meditations; null under 3. */
function lengthVsRequestForVoice(logs: LengthLog[], modelId: string): number | null {
  const diffs = logs
    .filter((log) => log.modelId === modelId)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 20)
    .flatMap((log) => {
      const d = lengthDiffPct(log);
      return d == null ? [] : [d];
    });
  if (diffs.length < 3) return null;
  return round1(diffs.reduce((sum, n) => sum + n, 0) / diffs.length);
}

type DeliveryLengthStats = {
  count: number;
  avgVsRequestPct: number | null;
  /** Meditations logged with the length check (newer logs). */
  checkedCount: number;
  preScaledPct: number | null;
  postScaledPct: number | null;
  revisedPct: number | null;
};

type SectionStatsRow = {
  delivery: DeliveryId;
  minutes: number;
  count: number;
  /** Average first-draft words vs target, percent (negative = short). */
  openingPct: number | null;
  mainPct: number | null;
  closingPct: number | null;
  totalPct: number | null;
  fixRatePct: number;
  shortRatePct: number;
  avgPlanMs: number | null;
  avgSectionsWriteMs: number | null;
};

function avg(values: number[]): number | null {
  return values.length ? round1(values.reduce((sum, n) => sum + n, 0) / values.length) : null;
}

/** First-draft accuracy per section kind and how often the targeted fix ran, per delivery and length. */
function sectionStatsByDeliveryAndLength(logs: LengthLog[]): SectionStatsRow[] {
  const groups = new Map<string, LengthLog[]>();
  for (const log of logs) {
    if (!log.sectionsFirstDraft?.length) continue;
    const key = `${log.delivery}#${log.requestedMinutes}`;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  }
  const order: DeliveryId[] = ["casual", "guided", "open_sits"];
  return [...groups.values()]
    .map((rows) => {
      const pct = (kind: (id: string) => boolean) =>
        avg(
          rows.flatMap((log) => {
            const secs = (log.sectionsFirstDraft ?? []).filter((x) => kind(x.id));
            const target = secs.reduce((sum, x) => sum + x.targetWords, 0);
            const words = secs.reduce((sum, x) => sum + x.words, 0);
            return target > 0 ? [((words - target) / target) * 100] : [];
          }),
        );
      return {
        delivery: rows[0]!.delivery,
        minutes: rows[0]!.requestedMinutes,
        count: rows.length,
        openingPct: pct((id) => id === "opening"),
        mainPct: pct((id) => id.startsWith("main")),
        closingPct: pct((id) => id === "closing"),
        totalPct: pct(() => true),
        fixRatePct: round1((rows.filter((r) => (r.sectionFix?.length ?? 0) > 0).length / rows.length) * 100),
        shortRatePct: round1((rows.filter((r) => r.scriptShort === true).length / rows.length) * 100),
        avgPlanMs: avg(rows.flatMap((r) => (typeof r.planMs === "number" ? [r.planMs] : []))),
        avgSectionsWriteMs: avg(
          rows.flatMap((r) => (typeof r.sectionsWriteMs === "number" ? [r.sectionsWriteMs] : [])),
        ),
      };
    })
    .sort((a, b) =>
      a.delivery === b.delivery
        ? a.minutes - b.minutes
        : order.indexOf(a.delivery) - order.indexOf(b.delivery),
    );
}

function lengthStatsByDelivery(logs: LengthLog[]): Record<DeliveryId, DeliveryLengthStats> {
  const out = {} as Record<DeliveryId, DeliveryLengthStats>;
  for (const delivery of ["casual", "guided", "open_sits"] as const) {
    const rows = logs.filter((log) => log.delivery === delivery);
    const diffs = rows.flatMap((log) => {
      const d = lengthDiffPct(log);
      return d == null ? [] : [d];
    });
    const checked = rows.filter((log) => typeof log.revised === "boolean");
    const share = (pred: (log: LengthLog) => boolean) =>
      checked.length ? round1((checked.filter(pred).length / checked.length) * 100) : null;
    out[delivery] = {
      count: rows.length,
      avgVsRequestPct: diffs.length
        ? round1(diffs.reduce((sum, n) => sum + n, 0) / diffs.length)
        : null,
      checkedCount: checked.length,
      preScaledPct: share((log) => Math.abs((log.preAudioPauseScale ?? 1) - 1) > 1e-3),
      postScaledPct: share((log) => log.postAudioScaled === true),
      revisedPct: share((log) => log.revised === true),
    };
  }
  return out;
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

async function synthesizeCalibrationLine(
  speaker: VoiceSpeakerRow,
  text: string,
  sentencePauseSec: number | null,
): Promise<Buffer> {
  if (speaker.brand === "speechify") {
    // Provider standard: no catalogue rate, no emotion, no comma breaks.
    // The shared sentence pause production uses, after every sentence end.
    const breakMs =
      sentencePauseSec != null
        ? Math.round(sentencePauseSec * 1000)
        : sentenceBreakMs((await loadDeliveryProfileRecord()).profiles);
    return aacAdtsToMp3Buffer(
      await speechifyTtsMp3({
        apiKey: await getSpeechifyApiKey(),
        text,
        voiceId: speaker.modelId,
        rate: "",
        emotion: null,
        loudnessNormalization: true,
        sentenceBreakMs: breakMs,
        breakAllSentenceEnds: true,
      }),
    );
  }
  // No reverb on a measurement, so Fish returns MP3 directly. s2.1-pro is several times faster than s2.1-pro-free on the same chunk. The runner adds [break] only on the paused pass.
  return fishTtsMp3({
    apiKey: await getFishApiKey(),
    text,
    referenceId: speaker.modelId,
    model: "s2.1-pro",
    feature: "voice-calibration",
  });
}

async function handlePost(
  event: APIGatewayProxyEventV2,
  admin: ConsciouslyAuthUser,
) {
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
            modelId,
            brand,
            apiBase,
            force,
            // Same as Speechify samples: pcm @ 24k → AAC → MP3 for the shared stem path.
            synthesize: async (speed) =>
              aacAdtsToMp3Buffer(
                await pcm24kS16leToAac44100(
                  await fishTtsPcm24k({
                    apiKey: await getFishApiKey(),
                    text: SPEAKER_PREVIEW_TEXT,
                    referenceId: modelId,
                    speed,
                    feature: "speaker-preview-tts",
                  }),
                ),
              ),
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
    const sampleUrl = domain
      ? speakerPreviewPlaybackUrl(`https://${domain}`, sampleKey, bust)
      : null;
    return json(200, {
      ok: true,
      ...keys,
      ...(letterIntroKey ? { letterIntroKey } : {}),
      sampleUrl,
    });
  }
  if (action === "rate-compare") {
    const modelId = String(body.modelId ?? "").trim();
    if (!modelId) return json(400, { error: "modelId is required" });
    const existing = (await listVoiceSpeakers()).find((s) => s.modelId === modelId);
    if (!existing || existing.brand !== "speechify") {
      return json(400, { error: "Rate comparison is Speechify-only" });
    }
    const rate = Math.round(existing.speechifyRate ?? 0);
    const tempo = Math.min(2, Math.max(0.5, 1 + rate / 100));
    const apiKey = await getSpeechifyApiKey();
    // `rate: ""` sends no <prosody rate>, so Speechify speaks at its own default.
    const [atRate, atDefault] = await Promise.all([
      speechifyTtsMp3({
        apiKey,
        text: SPEAKER_PREVIEW_TEXT,
        voiceId: modelId,
        rate: speechifyRateToSsml(rate) ?? "",
      }),
      speechifyTtsMp3({ apiKey, text: SPEAKER_PREVIEW_TEXT, voiceId: modelId, rate: "" }),
    ]);
    const isM4a = (b: Buffer) =>
      b.length >= 8 && b.toString("latin1", 4, 8) === "ftyp";
    const [rateMp3, stretchedMp3] = await Promise.all([
      aacAdtsToMp3Buffer(atRate),
      bufferToMp3WithTempo(atDefault, isM4a(atDefault) ? ".m4a" : ".aac", tempo),
    ]);
    return json(200, {
      ok: true,
      rate,
      tempo,
      rateAudioBase64: rateMp3.toString("base64"),
      stretchedAudioBase64: stretchedMp3.toString("base64"),
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
      gradientBackdrop: existing.brand === "fish",
    });
    const model = coerceAdminImageModel(body.model);
    const { body: imageBody, mime } = await generateAdminImageFromPrompt({
      prompt,
      model,
      illustrationStyle: false,
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
  if (
    action === "calibration-step" ||
    action === "calibration-cancel" ||
    action === "calibration-approve" ||
    action === "calibration-restore"
  ) {
    const modelId = String(body.modelId ?? "").trim();
    if (!modelId) return json(400, { error: "modelId is required" });
    const speaker = (await listVoiceSpeakers()).find((s) => s.modelId === modelId);
    if (!speaker) return json(404, { error: "Speaker not found" });
    if (action === "calibration-step" && speaker.hidden) {
      return json(400, { error: "This voice is hidden from the picker" });
    }
    const by = admin.email?.trim() || admin.sub || "admin";
    if (action === "calibration-cancel") {
      const doc = await cancelCalibration(modelId);
      return json(200, {
        ok: true,
        done: true,
        summary: {
          modelId,
          ...describeSpeaker(doc),
          audioUrl: calibrationMediaUrl(doc.audioKey, doc.updatedAt),
        },
      });
    }
    if (action === "calibration-step") {
      const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
      if (!bucket) return json(500, { error: "MEDIA_BUCKET_NAME is not set" });
      const stepped = await stepVoiceCalibration({
        modelId,
        by,
        comparePauses: speaker.brand === "fish",
        sentencePauseSec:
          speaker.brand === "speechify"
            ? sentenceBreakMs((await loadDeliveryProfileRecord()).profiles) / 1000
            : null,
        s3,
        bucket,
        synthesize: (text, pauseSec) => synthesizeCalibrationLine(speaker, text, pauseSec),
      });
      return json(200, {
        ok: true,
        done: stepped.done,
        busy: stepped.busy === true,
        summary: {
          modelId,
          ...describeSpeaker(stepped.doc),
          audioUrl: calibrationMediaUrl(stepped.doc.audioKey, stepped.doc.updatedAt),
        },
      });
    }
    return json(400, { error: "Unknown action" });
  }
  if (action === "save-delivery-profiles") {
    const by = admin.email?.trim() || admin.sub || "admin";
    const saved = await saveDeliveryProfileRecord({
      profiles: body.profiles,
      ...(body.targetCorrection !== undefined
        ? { targetCorrection: body.targetCorrection }
        : {}),
      ...(body.scriptGeneration !== undefined
        ? { scriptGeneration: body.scriptGeneration }
        : {}),
      by,
    });
    return json(200, {
      ok: true,
      deliveryProfiles: saved.profiles,
      targetCorrection: saved.targetCorrection,
      scriptGeneration: saved.scriptGeneration,
      deliveryProfileMeta: {
        updatedAt: saved.updatedAt,
        updatedBy: saved.updatedBy,
        history: saved.history,
      },
    });
  }
  if (action === "reset-target-correction") {
    const by = admin.email?.trim() || admin.sub || "admin";
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cleared = resetCorrectionForModel(prev.scriptGeneration, modelId);
    const seeded = correctionForModel(
      cleared,
      modelId,
      prev.scriptGeneration.scriptModelId === modelId
        ? null
        : prev.scriptGeneration.scriptModelId,
    );
    // Reset = start from defaults (not previous model), then re-seed defaults.
    const scriptGeneration = setCorrectionForModel(
      cleared,
      modelId,
      defaultScriptTargetCorrection(),
    );
    const saved = await saveDeliveryProfileRecord({
      profiles: prev.profiles,
      scriptGeneration: {
        ...scriptGeneration,
        scriptModelId: modelId,
      },
      by,
      note: `Reset target correction factors for ${modelId}`,
    });
    void seeded;
    return json(200, {
      ok: true,
      targetCorrection: saved.targetCorrection,
      scriptGeneration: saved.scriptGeneration,
      deliveryProfileMeta: {
        updatedAt: saved.updatedAt,
        updatedBy: saved.updatedBy,
        history: saved.history,
      },
    });
  }
  /** One of 90 calibration scripts (factors OFF). UI loops then finalize. */
  if (action === "calibrate-script-factors-cell") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const delivery =
      body.delivery === "casual" ||
      body.delivery === "guided" ||
      body.delivery === "open_sits"
        ? body.delivery
        : null;
    const minutes = Number(body.minutes);
    const briefIndex = Number(body.briefIndex);
    const briefs = prev.scriptGeneration.calibrationBriefs;
    if (
      !delivery ||
      !CALIBRATE_MINUTES.includes(minutes as (typeof CALIBRATE_MINUTES)[number]) ||
      !Number.isInteger(briefIndex) ||
      briefIndex < 0 ||
      briefIndex >= briefs.length
    ) {
      return json(400, {
        error: `delivery, minutes (5|10|20), and briefIndex (0..${briefs.length - 1}) required`,
        workItems: calibrationWorkItems(briefs).length,
        briefCount: briefs.length,
      });
    }
    const result = await runCalibrationCell({
      modelId,
      delivery,
      minutes,
      briefIndex,
      brief: briefs[briefIndex]!,
    });
    // Persist immediately so refresh can resume (also avoids 400KB mega-item).
    await saveScriptCalibrationCell({ modelId, cell: result });
    const savedCells = await loadScriptCalibrationCells(modelId);
    return json(200, {
      ok: true,
      result,
      total: calibrationWorkItems(briefs).length,
      completedCount: savedCells.length,
      completedKeys: savedCells.map((c) =>
        calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
      ),
    });
  }
  /**
   * After all cells: compute 9 factor pairs, save on model.
   * Prefers cells already saved per-row in Dynamo (resume-safe).
   */
  if (action === "calibrate-script-factors-finalize") {
    const by = admin.email?.trim() || admin.sub || "admin";
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const bodyCells = Array.isArray(body.cells)
      ? (body.cells as CalibrationCellResult[])
      : [];
    const storedCells = await loadScriptCalibrationCells(modelId);
    // Prefer Dynamo cells (authoritative after resume); fall back to body.
    const byKey = new Map<string, CalibrationCellResult>();
    for (const c of bodyCells) {
      byKey.set(calibrationCellKey(c.delivery, c.minutes, c.briefIndex), c);
    }
    for (const c of storedCells) {
      byKey.set(calibrationCellKey(c.delivery, c.minutes, c.briefIndex), c);
    }
    const cells = [...byKey.values()];
    if (cells.length < 1) {
      return json(400, {
        error: "No calibration cells found — run cells first (or resume).",
      });
    }
    const ranAt = new Date().toISOString();
    const factors = factorsFromCalibrationCells(cells, ranAt);
    const failures = cells
      .filter((c) => c.error)
      .map((c) => ({
        delivery: c.delivery,
        minutes: c.minutes,
        briefIndex: c.briefIndex,
        error: c.error || "failed",
      }));
    const diversions = diversionsFromCells(cells);
    const batch: StoredCalibrationBatch = {
      modelId,
      ranAt,
      briefs: prev.scriptGeneration.calibrationBriefs,
      medianWpm: 138.7 * 0.8,
      cells,
      factors,
      failures,
      diversions,
    };
    await saveScriptCalibrationBatch(batch);
    const scriptGeneration = applyFactorsToSettings(
      {
        ...prev.scriptGeneration,
        scriptModelId: modelId,
      },
      modelId,
      factors,
    );
    const saved = await saveDeliveryProfileRecord({
      profiles: prev.profiles,
      scriptGeneration,
      by,
      note: `Calibration batch ${modelId}: ${cells.length - failures.length}/${cells.length} scripts · ${diversions.length} brief diversions`,
    });
    const summary = CALIBRATE_DELIVERIES.flatMap((delivery) =>
      CALIBRATE_MINUTES.map((minutes) =>
        summarizeCalibrationCellGroup(cells, delivery, minutes, factors),
      ),
    );
    return json(200, {
      ok: true,
      targetCorrection: saved.targetCorrection,
      scriptGeneration: saved.scriptGeneration,
      summary,
      failures,
      diversions,
      batchMeta: { ranAt, modelId, cellCount: cells.length },
      hasCalibratedSamples: correctionHasCalibratedSamples(factors),
    });
  }
  if (action === "get-script-calibration-batch") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const batch = await loadScriptCalibrationBatch(modelId, {
      includeCells: true,
    });
    const cells = batch?.cells ?? (await loadScriptCalibrationCells(modelId));
    const workItems = calibrationWorkItems(prev.scriptGeneration.calibrationBriefs);
    const completedKeys = cells.map((c) =>
      calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
    );
    return json(200, {
      ok: true,
      batch,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume: completedKeys.length > 0 && completedKeys.length < workItems.length,
    });
  }
  /** Run check: factors ON, length prediction (no TTS). One voice×delivery×length. */
  if (
    action === "calibrate-script-model-cell" ||
    action === "check-script-factors-cell"
  ) {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const delivery =
      body.delivery === "casual" ||
      body.delivery === "guided" ||
      body.delivery === "open_sits"
        ? body.delivery
        : null;
    const minutes = Number(body.minutes);
    const voiceName =
      typeof body.voice === "string" && body.voice.trim()
        ? body.voice.trim()
        : "";
    const voice = CALIBRATE_VOICES.find((v) => v.name === voiceName);
    if (
      !delivery ||
      !CALIBRATE_MINUTES.includes(minutes as (typeof CALIBRATE_MINUTES)[number]) ||
      !voice
    ) {
      return json(400, {
        error: "delivery, minutes (5|10|20), and voice (Beatrice|Elijah|Oliver) required",
        deliveries: CALIBRATE_DELIVERIES,
        minutes: CALIBRATE_MINUTES,
        voices: CALIBRATE_VOICES.map((v) => v.name),
      });
    }
    const ran = await calibrateScriptModelCell({
      settings: {
        ...prev.scriptGeneration,
        scriptModelId: modelId,
      },
      modelId,
      delivery,
      minutes,
      voiceName: voice.name,
      voiceWpm: voice.wpm,
    });
    return json(200, {
      ok: true,
      result: ran.result,
      targetCorrection: prev.targetCorrection,
      scriptGeneration: prev.scriptGeneration,
    });
  }
  if (action === "save-calibration-config") {
    const saved = await saveCalibrationConfig({
      ...(typeof body.targetWpm === "number" ? { targetWpm: body.targetWpm } : {}),
      ...(Array.isArray(body.texts) ? { texts: body.texts } : {}),
      ...(typeof body.text === "string" ? { text: body.text } : {}),
    });
    return json(200, { ok: true, calibrationConfig: saved });
  }
  return json(400, { error: "Unknown action" });
}
