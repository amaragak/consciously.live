import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  sentenceBreakMs,
  type DeliveryId,
} from "./_shared/delivery-profiles";
import {
  paceAdjustmentPct,
  voicePaceTable,
} from "./_shared/meditation-length-fit";
import { countSpokenWords } from "./_shared/meditation-length-fit";
import {
  measuredScriptGenCostRows,
  overlayAvgCharsFromCells,
  spokenCharCount,
  usdFromCell,
  type ScriptGenCostRow,
} from "./_shared/script-gen-cost";
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
  clearScriptCalibrationForModel,
  clearSingleCallCalibrationForModel,
  clearTimeBasedCalibrationForModel,
  loadComparisonMeta,
  loadComparisonPairs,
  loadLengthPreviewLogs,
  loadScriptCalibrationBatch,
  loadTimeBasedCalibrationCells,
  loadScriptCalibrationCells,
  loadSingleCallCalibrationCells,
  saveCalibration,
  saveCalibrationConfig,
  saveComparisonMeta,
  saveComparisonPair,
  saveDeliveryProfileRecord,
  saveLengthPreviewLog,
  saveScriptCalibrationBatch,
  saveScriptCalibrationCell,
  saveSingleCallCalibrationCell,
  saveSingleCallCalibrationMeta,
  saveTimeBasedCalibrationCell,
  loadSilenceFitCalibrationCells,
  loadSilenceHaikuCalibrationCells,
  loadSilenceWordsCalibrationCells,
  loadSilenceWordsHaikuCalibrationCells,
  loadSilenceWordsHaikuComparePairs,
  type SpeakerRateDoc,
  loadRecentLengthLogs,
  type LengthLog,
} from "./_shared/voice-calibration-store";
import { runTimeBasedScriptCell } from "./_shared/script-time-based-cost-cell";
import {
  isTimeBasedCostWorkerEvent,
  loadTimeBasedCostRun,
  processTimeBasedCostTick,
  startTimeBasedCostRun,
  stopTimeBasedCostRun,
} from "./_shared/script-time-based-cost-run";
import {
  isSilenceFitCostWorkerEvent,
  loadSilenceFitCostRun,
  processSilenceFitCostTick,
  silenceFitWorkItems,
  startSilenceFitCostRun,
  stopSilenceFitCostRun,
} from "./_shared/script-silence-fit-cost-run";
import {
  isSilenceHaikuCostWorkerEvent,
  loadSilenceHaikuCostRun,
  processSilenceHaikuCostTick,
  silenceHaikuWorkItems,
  startSilenceHaikuCostRun,
  stopSilenceHaikuCostRun,
} from "./_shared/script-silence-haiku-cost-run";
import {
  isSilenceWordsCostWorkerEvent,
  loadSilenceWordsCostRun,
  processSilenceWordsCostTick,
  silenceWordsWorkItems,
  startSilenceWordsCostRun,
  stopSilenceWordsCostRun,
} from "./_shared/script-silence-words-cost-run";
import {
  isSilenceWordsHaikuCostWorkerEvent,
  loadSilenceWordsHaikuCostRun,
  processSilenceWordsHaikuCostTick,
  silenceWordsHaikuWorkItems,
  startSilenceWordsHaikuCostRun,
  stopSilenceWordsHaikuCostRun,
} from "./_shared/script-silence-words-haiku-cost-run";
import {
  isSilenceWordsHaikuCompareWorkerEvent,
  loadSilenceWordsHaikuCompareRun,
  processSilenceWordsHaikuCompareTick,
  silenceWordsHaikuCompareWorkItems,
  startSilenceWordsHaikuCompareRun,
  stopSilenceWordsHaikuCompareRun,
} from "./_shared/script-silence-words-haiku-compare-run";
import type {
  SilenceWordsHaikuCompareModeResult,
  SilenceWordsHaikuComparePair,
} from "./_shared/script-silence-words-haiku-compare-cell";
import {
  silenceWordsAsFitSettings,
  silenceWordsWordBudget,
} from "./_shared/script-silence-words-settings";
import {
  SILENCE_FIT_LENGTHS,
  SILENCE_FIT_OPTIONS,
  SILENCE_FIT_OPTION_LABEL,
  silenceFitAutoSpeakingBands,
  silenceFitEstimatedTotalAudioSeconds,
  silenceFitCellFor,
  silenceFitMinLongPauses,
  silenceFitSentenceBudget,
  silenceFitSpeakingShare,
} from "./_shared/script-silence-fit-settings";
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
  CALIBRATION_MEDIAN_WPM,
  CHECK_VOICES,
  calibrationWorkItems,
  cellsForActiveBriefs,
  diversionsFromCells,
  factorSpreadRows,
  factorsFromCalibrationCells,
  perScriptFactorRows,
  perScriptSectionBreakdown,
  rejudgeCalibrationFidelity,
  runCalibrationCell,
  summarizeCalibrationCellGroup,
  type CalibrationCellResult,
  type StoredCalibrationBatch,
} from "./_shared/script-calibration-batch";
import {
  deleteScriptCalibrationRun,
  isScriptCalibrationWorkerEvent,
  loadScriptCalibrationRun,
  processScriptCalibrationTick,
  startScriptCalibrationRun,
  stopScriptCalibrationRun,
} from "./_shared/script-calibration-run";
import {
  activeCalibrationBriefs,
  coerceCalibrationBriefCount,
  coerceScriptGenerationSettings,
  correctionForModel,
  resetCorrectionForModel,
  setCorrectionForModel,
  setSingleCallCorrectionForModel,
  singleCallCalibrationBriefs,
  singleCallCorrectionForModel,
} from "./_shared/script-generation-settings";
import {
  buildComparisonTable,
  factorsFromSingleCallCells,
  metricsFromCell,
  runSectionedScriptCell,
  runSingleCallScriptCell,
  singleCallWorkItems,
  type ComparisonPairResult,
} from "./_shared/script-single-call-compare";
import {
  fmtClock,
  runLengthPreview,
} from "./_shared/script-length-preview";
import { stepVoiceCalibration } from "./_shared/voice-calibration-run";

const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});

/** Active briefs (n) + cells filtered to this run’s brief window. */
function runBriefsAndCells(
  scriptGeneration: import("./_shared/script-generation-settings").ScriptGenerationSettings,
  cells: CalibrationCellResult[],
): {
  briefs: string[];
  briefCount: number;
  cells: CalibrationCellResult[];
} {
  const briefs = activeCalibrationBriefs(scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  return {
    briefs,
    briefCount,
    cells: cellsForActiveBriefs(cells, briefCount),
  };
}

function buildScriptGenCostRows(params: {
  profiles: import("./_shared/delivery-profiles").DeliveryProfiles;
  modelId: string;
  cells: CalibrationCellResult[];
  /** Sections (default) vs single-call vs time-based / silence-fit path. */
  mode?:
    | "sections"
    | "single"
    | "time"
    | "silence"
    | "silence_haiku"
    | "silence_words"
    | "silence_words_haiku";
}): ScriptGenCostRow[] {
  const { modelId, cells } = params;
  void params.mode;
  void params.profiles;
  // Measured only — no synthetic estimate filler in admin cost tables.
  const measured = measuredScriptGenCostRows(cells, modelId);
  return overlayAvgCharsFromCells(measured, cells);
}

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
  event: APIGatewayProxyEventV2 | Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2 | void> {
  // Async self-invoke: script calibration tick (no API Gateway / no auth).
  if (isScriptCalibrationWorkerEvent(event)) {
    try {
      await processScriptCalibrationTick({
        modelId: event.job.modelId,
        runToken: event.job.runToken,
      });
    } catch (e) {
      console.error(
        "script-calibration worker",
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }
  if (isTimeBasedCostWorkerEvent(event)) {
    try {
      await processTimeBasedCostTick({
        modelId: event.job.modelId,
        runToken: event.job.runToken,
      });
    } catch (e) {
      console.error(
        "time-based-cost worker",
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }
  if (isSilenceFitCostWorkerEvent(event)) {
    try {
      await processSilenceFitCostTick({
        modelId: event.job.modelId,
        runToken: event.job.runToken,
      });
    } catch (e) {
      console.error(
        "silence-fit-cost worker",
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }
  if (isSilenceHaikuCostWorkerEvent(event)) {
    try {
      await processSilenceHaikuCostTick({
        modelId: event.job.modelId,
        runToken: event.job.runToken,
      });
    } catch (e) {
      console.error(
        "silence-haiku-cost worker",
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }
  if (isSilenceWordsCostWorkerEvent(event)) {
    try {
      await processSilenceWordsCostTick({
        modelId: event.job.modelId,
        runToken: event.job.runToken,
      });
    } catch (e) {
      console.error(
        "silence-words-cost worker",
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }

  if (isSilenceWordsHaikuCostWorkerEvent(event)) {
    try {
      await processSilenceWordsHaikuCostTick({
        modelId: event.job.modelId,
        runToken: event.job.runToken,
      });
    } catch (e) {
      console.error(
        "silence-words-haiku-cost worker",
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }

  if (isSilenceWordsHaikuCompareWorkerEvent(event)) {
    try {
      await processSilenceWordsHaikuCompareTick({
        modelId: event.job.modelId,
        runToken: event.job.runToken,
      });
    } catch (e) {
      console.error(
        "silence-words-haiku-compare worker",
        e instanceof Error ? e.message : e,
      );
    }
    return;
  }

  const httpEvent = event as APIGatewayProxyEventV2;
  const method = httpEvent.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const admin = await requireAdminJson(httpEvent);
  if (!("sub" in admin)) return admin;

  try {
    if (method === "GET") return await handleGet(httpEvent);
    if (method === "PATCH") return await handlePatch(httpEvent);
    if (method === "POST") return await handlePost(httpEvent, admin);
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

/** Word-fix call fields from API-stored per-call usage (model = response id). */
function haikuFixCallExportFields(cell: {
  calls?: Array<{
    label?: string;
    model?: string;
    usage?: { input_tokens?: number } | null;
  }>;
}): {
  fixCallsModel: string | null;
  fixCallsInputTokensTotal: number | null;
  fixCallsCount: number;
} {
  const fixes = (cell.calls ?? []).filter((c) =>
    /^haiku-phase-/i.test(c.label ?? ""),
  );
  const models = [
    ...new Set(
      fixes
        .map((c) => (typeof c.model === "string" ? c.model.trim() : ""))
        .filter(Boolean),
    ),
  ];
  const inputTotal = fixes.reduce(
    (s, c) => s + (c.usage?.input_tokens ?? 0),
    0,
  );
  return {
    fixCallsModel: models.length ? models.join("|") : null,
    fixCallsInputTokensTotal: fixes.length ? Math.round(inputTotal) : null,
    fixCallsCount: fixes.length,
  };
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
            // Same as Speechify samples: pcm @ 44.1k → AAC → MP3 for the shared stem path.
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
  /** Wipe sectioned calibration cells + meta so Run calibration starts fresh. */
  if (action === "clear-script-calibration-batch") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cleared = await clearScriptCalibrationForModel(modelId);
    await deleteScriptCalibrationRun(modelId);
    return json(200, {
      ok: true,
      modelId,
      deletedCells: cleared.deletedCells,
    });
  }
  /**
   * Start (or resume) server-side calibration. Worker ticks chain themselves;
   * client only polls get-script-calibration-batch / get-script-calibration-run.
   */
  if (action === "start-script-calibration-run") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const restart = body.restart === true;
    const by = admin.email?.trim() || admin.sub || "admin";
    // Persist n from the request so the worker uses the same brief count.
    if (body.briefCount != null) {
      const briefCount = coerceCalibrationBriefCount(
        body.briefCount,
        prev.scriptGeneration.calibrationBriefs.length,
      );
      if (briefCount !== prev.scriptGeneration.calibrationBriefCount) {
        await saveDeliveryProfileRecord({
          profiles: prev.profiles,
          scriptGeneration: {
            ...prev.scriptGeneration,
            calibrationBriefCount: briefCount,
          },
          by,
          note: `Calibration brief count → ${briefCount}`,
        });
      }
    }
    const run = await startScriptCalibrationRun({
      modelId,
      restart,
      by,
    });
    return json(200, { ok: true, run });
  }
  if (action === "stop-script-calibration-run") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const run = await stopScriptCalibrationRun(modelId);
    return json(200, { ok: true, run });
  }
  if (action === "get-script-calibration-run") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const run = await loadScriptCalibrationRun(modelId);
    const { briefs, briefCount, cells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadScriptCalibrationCells(modelId),
    );
    const workItems = calibrationWorkItems(briefs);
    return json(200, {
      ok: true,
      run,
      briefCount,
      completedCount: cells.length,
      total: workItems.length,
      canResume: cells.length > 0 && cells.length < workItems.length,
    });
  }
  if (action === "clear-single-call-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cleared = await clearSingleCallCalibrationForModel(modelId);
    return json(200, {
      ok: true,
      modelId,
      deletedCells: cleared.deletedCells,
    });
  }
  if (action === "clear-time-based-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cleared = await clearTimeBasedCalibrationForModel(modelId);
    return json(200, {
      ok: true,
      modelId,
      deletedCells: cleared.deletedCells,
    });
  }
  if (action === "start-time-based-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      typeof body.calibrationBriefCount === "number"
        ? body.calibrationBriefCount
        : prev.scriptGeneration.calibrationBriefCount,
      prev.scriptGeneration.calibrationBriefs.length || 10,
    );
    if (briefCount !== prev.scriptGeneration.calibrationBriefCount) {
      await saveDeliveryProfileRecord({
        profiles: prev.profiles,
        scriptGeneration: {
          ...prev.scriptGeneration,
          calibrationBriefCount: briefCount,
        },
        by: admin.email?.trim() || admin.sub || "admin",
        note: `Time-based cost run n=${briefCount}`,
      });
    }
    const run = await startTimeBasedCostRun({
      modelId,
      restart: body.restart !== false,
    });
    return json(200, { ok: true, run });
  }
  if (action === "stop-time-based-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const run = await stopTimeBasedCostRun(modelId);
    return json(200, { ok: true, run });
  }
  if (action === "start-silence-fit-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      typeof body.calibrationBriefCount === "number"
        ? body.calibrationBriefCount
        : prev.scriptGeneration.calibrationBriefCount,
      prev.scriptGeneration.calibrationBriefs.length || 10,
    );
    if (briefCount !== prev.scriptGeneration.calibrationBriefCount) {
      await saveDeliveryProfileRecord({
        profiles: prev.profiles,
        scriptGeneration: {
          ...prev.scriptGeneration,
          calibrationBriefCount: briefCount,
        },
        by: admin.email?.trim() || admin.sub || "admin",
        note: `Silence-fit cost run n=${briefCount}`,
      });
    }
    const run = await startSilenceFitCostRun({
      modelId,
      calibrationBriefCount: briefCount,
      restart: body.restart !== false,
    });
    return json(200, { ok: true, run });
  }
  if (action === "stop-silence-fit-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    await stopSilenceFitCostRun(modelId);
    const run = await loadSilenceFitCostRun(modelId);
    return json(200, { ok: true, run });
  }
  if (action === "get-silence-fit-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    // Last-run results: keep every stored brief. The n selector only scopes the
    // next Run — clipping here hid all but brief 0 when n was set back to 1.
    const cells = await loadSilenceFitCalibrationCells(modelId);
    const briefs = activeCalibrationBriefs(prev.scriptGeneration);
    const briefCount = coerceCalibrationBriefCount(
      prev.scriptGeneration.calibrationBriefCount,
      briefs.length,
    );
    const workItems = silenceFitWorkItems(briefCount);
    const completedKeys = cells.map((c) =>
      `${c.silenceFitOption ?? "guided"}#${c.minutes}#${c.briefIndex}`,
    );
    const sf = prev.scriptGeneration.silenceFit;
    const avg = (nums: number[]) =>
      nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
    /** Finer mean — speech share must not collapse to 10% buckets. */
    const avgFine = (nums: number[]) =>
      nums.length
        ? Math.round(
            (nums.reduce((a, b) => a + b, 0) / nums.length) * 10000,
          ) / 10000
        : null;
    const lengthAccuracy = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const group = cells.filter(
          (c) =>
            c.silenceFitOption === option &&
            c.minutes === minutes &&
            !c.error &&
            c.silenceFitAccuracy,
        );
        const snaps = group.map((c) => c.silenceFitAccuracy!).filter(Boolean);
        const n = snaps.length;
        const outside = snaps.filter((s) => s.outsideTolerance);
        const inBand = snaps.filter((s) => s.insideSpeakingBand);
        const afterPcts = snaps.map((s) =>
          s.targetSeconds > 0
            ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) *
              100
            : 0,
        );
        const cellCfg = silenceFitCellFor(sf, option, minutes);
        // Why whenever fit went past long pauses (not only outside tolerance).
        const whys = [
          ...new Set(
            snaps
              .map((s) => s.why)
              .filter((w): w is string => typeof w === "string" && !!w.trim()),
          ),
        ];
        const steps = snaps.map((s) => s.fitStep);
        const stepMode =
          steps.length === 0
            ? null
            : steps.every((s) => s === steps[0])
              ? steps[0]
              : "mixed";
        const estimatedTotals = snaps.map((s) =>
          typeof s.estimatedTotalAudioSeconds === "number" &&
          Number.isFinite(s.estimatedTotalAudioSeconds)
            ? s.estimatedTotalAudioSeconds
            : silenceFitEstimatedTotalAudioSeconds(s.predictedSecondsAfter),
        );
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          scripts: n,
          speechShare: avgFine(snaps.map((s) => s.speechShare)),
          speakingBandMin: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMin,
          speakingBandMax: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMax,
          beforeFitPct: avg(
            snaps.map((s) =>
              s.targetSeconds > 0
                ? ((s.predictedSecondsBefore - s.targetSeconds) /
                    s.targetSeconds) *
                  100
                : 0,
            ),
          ),
          afterFitPct: avg(afterPcts),
          estimatedTotalAudioSeconds: avg(estimatedTotals),
          fitStep: stepMode,
          outsideCount: outside.length,
          outsidePct:
            n > 0 ? Math.round((outside.length / n) * 1000) / 10 : null,
          inBandCount: inBand.length,
          inBandPct:
            n > 0 ? Math.round((inBand.length / n) * 1000) / 10 : null,
          why:
            whys.length === 1
              ? whys[0]!
              : whys.length > 1
                ? whys.join("; ")
                : null,
          scriptsDetail: group.map((c) => {
            const acc = c.silenceFitAccuracy;
            const phases = acc?.phases ?? [];
            const words = acc?.words;
            const sentencesWritten = acc?.writtenSentenceTotal;
            const wpsUsed = acc?.wordsPerSentence;
            const sentenceBudget = acc?.sentenceBudget;
            const wordsBudget =
              typeof sentenceBudget === "number" &&
              typeof wpsUsed === "number" &&
              sentenceBudget > 0 &&
              wpsUsed > 0
                ? Math.round(sentenceBudget * wpsUsed)
                : null;
            const wpsActual =
              typeof words === "number" &&
              typeof sentencesWritten === "number" &&
              sentencesWritten > 0
                ? Math.round((words / sentencesWritten) * 10) / 10
                : null;
            const headerMinutes = phases.reduce(
              (s, p) => s + (p.headerMinutes || 0),
              0,
            );
            const chars = spokenCharCount(c.scriptText);
            const claudeUsd = c.usage ? usdFromCell(c, modelId) : null;
            const briefWords = countSpokenWords(c.brief || "");
            return {
              briefIndex: c.briefIndex,
              brief: c.brief,
              ...(acc ?? {}),
              scriptTextAsWritten: c.scriptTextAsWritten,
              scriptText: c.scriptText,
              wordsBudget,
              wordsPerSentenceActual: wpsActual,
              phaseCount: phases.length,
              headerMinutes: Math.round(headerMinutes * 10) / 10,
              chars: chars > 0 ? chars : null,
              claudeUsd,
              briefWords: briefWords > 0 ? briefWords : null,
            };
          }),
        };
      }),
    );
    const okSnaps = cells
      .map((c) => c.silenceFitAccuracy)
      .filter(Boolean) as NonNullable<(typeof cells)[0]["silenceFitAccuracy"]>[];
    const missPcts = okSnaps.map((s) =>
      s.targetSeconds > 0
        ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) * 100
        : 0,
    );
    const absMisses = missPcts.map((m) => Math.abs(m));
    let largestMissPct: number | null = null;
    if (missPcts.length) {
      let best = missPcts[0]!;
      for (const m of missPcts) {
        if (Math.abs(m) > Math.abs(best)) best = m;
      }
      largestMissPct = Math.round(best * 10) / 10;
    }
    const summary = {
      scripts: okSnaps.length,
      withinTolerance: okSnaps.filter((s) => !s.outsideTolerance).length,
      insideSpeakingBand: okSnaps.filter((s) => s.insideSpeakingBand).length,
      // Absolute average — signed misses cancel otherwise.
      avgMissAfterPct: avg(absMisses),
      largestMissAfterPct: largestMissPct,
    };
    const avgCharsByOptionLength = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const group = cells.filter(
          (c) =>
            c.silenceFitOption === option &&
            c.minutes === minutes &&
            !c.error &&
            c.scriptText,
        );
        const chars = group.map((c) =>
          (c.scriptText || "").replace(/\[\[PAUSE[^\]]*\]\]/gi, "").length,
        );
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          scripts: group.length,
          avgChars: avg(chars),
        };
      }),
    );
    // Read-only computed budgets for Settings.
    const budgets = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const cellCfg = silenceFitCellFor(sf, option, minutes);
        const scriptTimeSeconds = Math.max(30, minutes * 60 - 45);
        const wpsRow = sf.wordsPerSentenceByOption[option];
        const wps =
          wpsRow.scriptCount > 0 ? wpsRow.wordsPerSentence : 12;
        // Was: speakingBandMin: cellCfg.speakingBandMin (bottom of band).
        const speakingShareForBudget = silenceFitSpeakingShare(
          prev.profiles,
          option,
        );
        const sentenceBudget = silenceFitSentenceBudget({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          effectiveWpm: CALIBRATION_MEDIAN_WPM,
          wordsPerSentence: wps,
        });
        const minLongPauses = silenceFitMinLongPauses({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          longestSingleSilenceSeconds: cellCfg.longestSingleSilenceSeconds,
        });
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          sentenceBudget,
          minLongPauses,
          wordsPerSentence: wps,
          wpsScriptCount: wpsRow.scriptCount,
          speakingShareForBudget,
          speakingSeconds: Math.round(
            scriptTimeSeconds * speakingShareForBudget,
          ),
        };
      }),
    );
    const run = await loadSilenceFitCostRun(modelId);
    return json(200, {
      ok: true,
      briefCount,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      scriptGenCostsSilence: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells,
        mode: "silence",
      }),
      lengthAccuracy,
      summary,
      avgCharsByOptionLength,
      budgets,
      silenceFit: sf,
      run,
    });
  }
  if (action === "start-silence-haiku-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      typeof body.calibrationBriefCount === "number"
        ? body.calibrationBriefCount
        : prev.scriptGeneration.calibrationBriefCount,
      prev.scriptGeneration.calibrationBriefs.length || 10,
    );
    if (briefCount !== prev.scriptGeneration.calibrationBriefCount) {
      await saveDeliveryProfileRecord({
        profiles: prev.profiles,
        scriptGeneration: {
          ...prev.scriptGeneration,
          calibrationBriefCount: briefCount,
        },
        by: admin.email?.trim() || admin.sub || "admin",
        note: `Silence-haiku cost run n=${briefCount}`,
      });
    }
    const run = await startSilenceHaikuCostRun({
      modelId,
      calibrationBriefCount: briefCount,
      restart: body.restart !== false,
    });
    return json(200, { ok: true, run });
  }
  if (action === "stop-silence-haiku-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    await stopSilenceHaikuCostRun(modelId);
    const run = await loadSilenceHaikuCostRun(modelId);
    return json(200, { ok: true, run });
  }
  if (action === "get-silence-haiku-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cells = await loadSilenceHaikuCalibrationCells(modelId);
    const briefs = activeCalibrationBriefs(prev.scriptGeneration);
    const briefCount = coerceCalibrationBriefCount(
      prev.scriptGeneration.calibrationBriefCount,
      briefs.length,
    );
    const workItems = silenceHaikuWorkItems(briefCount);
    const completedKeys = cells.map(
      (c) =>
        `${c.silenceFitOption ?? "guided"}#${c.minutes}#${c.briefIndex}`,
    );
    const sh = prev.scriptGeneration.silenceHaiku;
    const avg = (nums: number[]) =>
      nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
    const avgFine = (nums: number[]) =>
      nums.length
        ? Math.round(
            (nums.reduce((a, b) => a + b, 0) / nums.length) * 10000,
          ) / 10000
        : null;
    const lengthAccuracy = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const group = cells.filter(
          (c) =>
            c.silenceFitOption === option &&
            c.minutes === minutes &&
            !c.error &&
            c.silenceHaikuAccuracy,
        );
        const snaps = group.map((c) => c.silenceHaikuAccuracy!).filter(Boolean);
        const n = snaps.length;
        const outside = snaps.filter((s) => s.outsideTolerance);
        const inBand = snaps.filter((s) => s.insideSpeakingBand);
        const afterPcts = snaps.map((s) =>
          s.targetSeconds > 0
            ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) *
              100
            : 0,
        );
        const cellCfg = silenceFitCellFor(sh, option, minutes);
        const whys = [
          ...new Set(
            snaps
              .map((s) => s.why)
              .filter(
                (w): w is NonNullable<(typeof snaps)[number]["why"]> =>
                  typeof w === "string" && !!w.trim(),
              ),
          ),
        ];
        const steps = snaps.map((s) => s.fitStep);
        const stepMode =
          steps.length === 0
            ? null
            : steps.every((s) => s === steps[0])
              ? steps[0]
              : "mixed";
        const estimatedTotals = snaps.map((s) =>
          typeof s.estimatedTotalAudioSeconds === "number" &&
          Number.isFinite(s.estimatedTotalAudioSeconds)
            ? s.estimatedTotalAudioSeconds
            : silenceFitEstimatedTotalAudioSeconds(s.predictedSecondsAfter),
        );
        const haikuRan = snaps.filter((s) => s.haikuRan).length;
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          scripts: n,
          speechShare: avgFine(snaps.map((s) => s.speechShare)),
          speechShareSonnet: avgFine(
            snaps.map((s) => s.speechShareSonnet ?? s.speechShare),
          ),
          speakingBandMin: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMin,
          speakingBandMax: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMax,
          beforeFitPct: avg(
            snaps.map((s) =>
              s.targetSeconds > 0
                ? ((s.predictedSecondsBefore - s.targetSeconds) /
                    s.targetSeconds) *
                  100
                : 0,
            ),
          ),
          afterFitPct: avg(afterPcts),
          wordsVsBudgetPct: avg(snaps.map((s) => s.wordsVsBudgetPct)),
          wordsVsBudgetSonnetPct: avg(
            snaps.map((s) => s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct),
          ),
          wordsVsBudgetSonnetMin: (() => {
            const vals = snaps.map(
              (s) => s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct,
            );
            return vals.length ? Math.min(...vals) : null;
          })(),
          wordsVsBudgetSonnetMax: (() => {
            const vals = snaps.map(
              (s) => s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct,
            );
            return vals.length ? Math.max(...vals) : null;
          })(),
          wordsSonnetUnderCount: snaps.filter(
            (s) => (s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct) < 0,
          ).length,
          haikuRanCount: haikuRan,
          haikuPhasesFixedAvg: avg(snaps.map((s) => s.phasesFixed)),
          estimatedTotalAudioSeconds: avg(estimatedTotals),
          fitStep: stepMode,
          outsideCount: outside.length,
          outsidePct:
            n > 0 ? Math.round((outside.length / n) * 1000) / 10 : null,
          inBandCount: inBand.length,
          inBandPct:
            n > 0 ? Math.round((inBand.length / n) * 1000) / 10 : null,
          why:
            whys.length === 1
              ? whys[0]!
              : whys.length > 1
                ? whys.join("; ")
                : null,
          scriptsDetail: group.map((c) => {
            const acc = c.silenceHaikuAccuracy;
            const phases = acc?.phases ?? [];
            const words = acc?.words;
            const sentencesWritten = acc?.writtenSentenceTotal;
            const wpsUsed = acc?.wordsPerSentence;
            const sentenceBudget = acc?.sentenceBudget;
            const wordsBudget =
              typeof sentenceBudget === "number" &&
              typeof wpsUsed === "number" &&
              sentenceBudget > 0 &&
              wpsUsed > 0
                ? Math.round(sentenceBudget * wpsUsed)
                : null;
            const wpsActual =
              typeof words === "number" &&
              typeof sentencesWritten === "number" &&
              sentencesWritten > 0
                ? Math.round((words / sentencesWritten) * 10) / 10
                : null;
            const headerMinutes = phases.reduce(
              (s, p) => s + (p.headerMinutes || 0),
              0,
            );
            const chars = spokenCharCount(c.scriptText);
            const claudeUsd = c.usage ? usdFromCell(c, modelId) : null;
            const briefWords = countSpokenWords(c.brief || "");
            const fixCalls = haikuFixCallExportFields(c);
            return {
              briefIndex: c.briefIndex,
              brief: c.brief,
              ...(acc ?? {}),
              scriptTextAsWritten: c.scriptTextAsWritten,
              scriptTextAfterHaiku:
                c.scriptTextAfterHaiku ?? acc?.scriptAfterHaiku,
              scriptText: c.scriptText,
              wordsBudget,
              wordsPerSentenceActual: wpsActual,
              fixCallsModel: fixCalls.fixCallsModel,
              fixCallsInputTokensTotal: fixCalls.fixCallsInputTokensTotal,
              fixCallsCount: fixCalls.fixCallsCount,
              phaseCount: phases.length,
              headerMinutes: Math.round(headerMinutes * 10) / 10,
              chars: chars > 0 ? chars : null,
              claudeUsd,
              briefWords: briefWords > 0 ? briefWords : null,
            };
          }),
        };
      }),
    );
    const okSnaps = cells
      .map((c) => c.silenceHaikuAccuracy)
      .filter(
        Boolean,
      ) as NonNullable<(typeof cells)[0]["silenceHaikuAccuracy"]>[];
    const missPcts = okSnaps.map((s) =>
      s.targetSeconds > 0
        ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) * 100
        : 0,
    );
    const absMisses = missPcts.map((m) => Math.abs(m));
    let largestMissPct: number | null = null;
    if (missPcts.length) {
      let best = missPcts[0]!;
      for (const m of missPcts) {
        if (Math.abs(m) > Math.abs(best)) best = m;
      }
      largestMissPct = Math.round(best * 10) / 10;
    }
    const summary = {
      scripts: okSnaps.length,
      withinTolerance: okSnaps.filter((s) => !s.outsideTolerance).length,
      insideSpeakingBand: okSnaps.filter((s) => s.insideSpeakingBand).length,
      avgMissAfterPct: avg(absMisses),
      largestMissAfterPct: largestMissPct,
      haikuRanCount: okSnaps.filter((s) => s.haikuRan).length,
    };
    const avgCharsByOptionLength = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const group = cells.filter(
          (c) =>
            c.silenceFitOption === option &&
            c.minutes === minutes &&
            !c.error &&
            c.scriptText,
        );
        const chars = group.map((c) =>
          (c.scriptText || "").replace(/\[\[PAUSE[^\]]*\]\]/gi, "").length,
        );
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          scripts: group.length,
          avgChars: avg(chars),
        };
      }),
    );
    const budgets = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const cellCfg = silenceFitCellFor(sh, option, minutes);
        const scriptTimeSeconds = Math.max(30, minutes * 60 - 45);
        const wpsRow = sh.wordsPerSentenceByOption[option];
        const wps =
          wpsRow.scriptCount > 0 ? wpsRow.wordsPerSentence : 12;
        // Was: bottom of band / middle of band from stored speakingBandMin/Max.
        // const speakingShareForBudget = cellCfg.speakingBandMin;
        // const speakingShareForBudget =
        //   (cellCfg.speakingBandMin + cellCfg.speakingBandMax) / 2;
        const speakingShareForBudget = silenceFitSpeakingShare(
          prev.profiles,
          option,
        );
        const sentenceBudget = silenceFitSentenceBudget({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          effectiveWpm: CALIBRATION_MEDIAN_WPM,
          wordsPerSentence: wps,
        });
        const minLongPauses = silenceFitMinLongPauses({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          longestSingleSilenceSeconds: cellCfg.longestSingleSilenceSeconds,
        });
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          sentenceBudget,
          minLongPauses,
          wordsPerSentence: wps,
          wpsScriptCount: wpsRow.scriptCount,
          speakingShareForBudget,
          speakingSeconds: Math.round(
            scriptTimeSeconds * speakingShareForBudget,
          ),
        };
      }),
    );
    const run = await loadSilenceHaikuCostRun(modelId);
    return json(200, {
      ok: true,
      briefCount,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      scriptGenCostsSilenceHaiku: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells,
        mode: "silence_haiku",
      }),
      lengthAccuracy,
      summary,
      avgCharsByOptionLength,
      budgets,
      silenceHaiku: sh,
      run,
    });
  }
  if (action === "start-silence-words-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      typeof body.calibrationBriefCount === "number"
        ? body.calibrationBriefCount
        : prev.scriptGeneration.calibrationBriefCount,
      prev.scriptGeneration.calibrationBriefs.length || 10,
    );
    if (briefCount !== prev.scriptGeneration.calibrationBriefCount) {
      await saveDeliveryProfileRecord({
        profiles: prev.profiles,
        scriptGeneration: {
          ...prev.scriptGeneration,
          calibrationBriefCount: briefCount,
        },
        by: admin.email?.trim() || admin.sub || "admin",
        note: `Silence-words cost run n=${briefCount}`,
      });
    }
    const run = await startSilenceWordsCostRun({
      modelId,
      calibrationBriefCount: briefCount,
      restart: body.restart !== false,
    });
    return json(200, { ok: true, run });
  }
  if (action === "stop-silence-words-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    await stopSilenceWordsCostRun(modelId);
    const run = await loadSilenceWordsCostRun(modelId);
    return json(200, { ok: true, run });
  }
  if (action === "get-silence-words-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cells = await loadSilenceWordsCalibrationCells(modelId);
    const briefs = activeCalibrationBriefs(prev.scriptGeneration);
    const briefCount = coerceCalibrationBriefCount(
      prev.scriptGeneration.calibrationBriefCount,
      briefs.length,
    );
    const workItems = silenceWordsWorkItems(briefCount);
    const completedKeys = cells.map(
      (c) =>
        `${c.silenceFitOption ?? "guided"}#${c.minutes}#${c.briefIndex}`,
    );
    const sw = prev.scriptGeneration.silenceWords;
    const fitSettings = silenceWordsAsFitSettings(sw);
    const avg = (nums: number[]) =>
      nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
    const avgFine = (nums: number[]) =>
      nums.length
        ? Math.round(
            (nums.reduce((a, b) => a + b, 0) / nums.length) * 10000,
          ) / 10000
        : null;
    const lengthAccuracy = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const group = cells.filter(
          (c) =>
            c.silenceFitOption === option &&
            c.minutes === minutes &&
            !c.error &&
            c.silenceWordsAccuracy,
        );
        const snaps = group.map((c) => c.silenceWordsAccuracy!).filter(Boolean);
        const n = snaps.length;
        const outside = snaps.filter((s) => s.outsideTolerance);
        const inBand = snaps.filter((s) => s.insideSpeakingBand);
        const afterPcts = snaps.map((s) =>
          s.targetSeconds > 0
            ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) *
              100
            : 0,
        );
        const cellCfg = silenceFitCellFor(fitSettings, option, minutes);
        const whys = [
          ...new Set(
            snaps
              .map((s) => s.why)
              .filter(
                (w): w is NonNullable<(typeof snaps)[number]["why"]> =>
                  typeof w === "string" && !!w.trim(),
              ),
          ),
        ];
        const steps = snaps.map((s) => s.fitStep);
        const stepMode =
          steps.length === 0
            ? null
            : steps.every((s) => s === steps[0])
              ? steps[0]
              : "mixed";
        const estimatedTotals = snaps.map((s) =>
          typeof s.estimatedTotalAudioSeconds === "number" &&
          Number.isFinite(s.estimatedTotalAudioSeconds)
            ? s.estimatedTotalAudioSeconds
            : silenceFitEstimatedTotalAudioSeconds(s.predictedSecondsAfter),
        );
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          scripts: n,
          speechShare: avgFine(snaps.map((s) => s.speechShare)),
          speakingBandMin: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMin,
          speakingBandMax: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMax,
          beforeFitPct: avg(
            snaps.map((s) =>
              s.targetSeconds > 0
                ? ((s.predictedSecondsBefore - s.targetSeconds) /
                    s.targetSeconds) *
                  100
                : 0,
            ),
          ),
          afterFitPct: avg(afterPcts),
          wordsVsBudgetPct: avg(snaps.map((s) => s.wordsVsBudgetPct)),
          estimatedTotalAudioSeconds: avg(estimatedTotals),
          fitStep: stepMode,
          outsideCount: outside.length,
          outsidePct:
            n > 0 ? Math.round((outside.length / n) * 1000) / 10 : null,
          inBandCount: inBand.length,
          inBandPct:
            n > 0 ? Math.round((inBand.length / n) * 1000) / 10 : null,
          why:
            whys.length === 1
              ? whys[0]!
              : whys.length > 1
                ? whys.join("; ")
                : null,
          scriptsDetail: group.map((c) => {
            const acc = c.silenceWordsAccuracy;
            const phases = acc?.phases ?? [];
            const chars = spokenCharCount(c.scriptText);
            const claudeUsd = c.usage ? usdFromCell(c, modelId) : null;
            const briefWords = countSpokenWords(c.brief || "");
            return {
              briefIndex: c.briefIndex,
              brief: c.brief,
              ...(acc ?? {}),
              scriptTextAsWritten: c.scriptTextAsWritten,
              scriptText: c.scriptText,
              wordBudget: acc?.wordBudget ?? null,
              headerWords: acc?.headerWordTotal ?? null,
              words: acc?.wordsWritten ?? acc?.words ?? null,
              // Sentence columns left empty for this mode.
              sentenceBudget: null,
              headerSentenceTotal: null,
              writtenSentenceTotal: null,
              wordsPerSentence: null,
              phaseCount: phases.length,
              chars: chars > 0 ? chars : null,
              claudeUsd,
              briefWords: briefWords > 0 ? briefWords : null,
            };
          }),
        };
      }),
    );
    const okSnaps = cells
      .map((c) => c.silenceWordsAccuracy)
      .filter(
        Boolean,
      ) as NonNullable<(typeof cells)[0]["silenceWordsAccuracy"]>[];
    const missPcts = okSnaps.map((s) =>
      s.targetSeconds > 0
        ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) * 100
        : 0,
    );
    const absMisses = missPcts.map((m) => Math.abs(m));
    let largestMissPct: number | null = null;
    if (missPcts.length) {
      let best = missPcts[0]!;
      for (const m of missPcts) {
        if (Math.abs(m) > Math.abs(best)) best = m;
      }
      largestMissPct = Math.round(best * 10) / 10;
    }
    const summary = {
      scripts: okSnaps.length,
      withinTolerance: okSnaps.filter((s) => !s.outsideTolerance).length,
      insideSpeakingBand: okSnaps.filter((s) => s.insideSpeakingBand).length,
      avgMissAfterPct: avg(absMisses),
      largestMissAfterPct: largestMissPct,
    };
    const budgets = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const cellCfg = silenceFitCellFor(fitSettings, option, minutes);
        const scriptTimeSeconds = Math.max(30, minutes * 60 - 45);
        // Was: bottom of band / middle of band from stored speakingBandMin/Max.
        // const speakingShareForBudget = cellCfg.speakingBandMin;
        // const speakingShareForBudget =
        //   (cellCfg.speakingBandMin + cellCfg.speakingBandMax) / 2;
        const speakingShareForBudget = silenceFitSpeakingShare(
          prev.profiles,
          option,
        );
        const wordBudget = silenceWordsWordBudget({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          effectiveWpm: CALIBRATION_MEDIAN_WPM,
        });
        const minLongPauses = silenceFitMinLongPauses({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          longestSingleSilenceSeconds: cellCfg.longestSingleSilenceSeconds,
        });
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          wordBudget,
          minLongPauses,
          speakingShareForBudget,
          speakingSeconds: Math.round(
            scriptTimeSeconds * speakingShareForBudget,
          ),
        };
      }),
    );
    const run = await loadSilenceWordsCostRun(modelId);
    return json(200, {
      ok: true,
      briefCount,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      scriptGenCostsSilenceWords: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells,
        mode: "silence_words",
      }),
      lengthAccuracy,
      summary,
      budgets,
      silenceWords: sw,
      run,
    });
  }
  if (action === "start-silence-words-haiku-compare") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      typeof body.calibrationBriefCount === "number"
        ? body.calibrationBriefCount
        : prev.scriptGeneration.calibrationBriefCount,
      prev.scriptGeneration.calibrationBriefs.length || 10,
    );
    if (briefCount !== prev.scriptGeneration.calibrationBriefCount) {
      await saveDeliveryProfileRecord({
        profiles: prev.profiles,
        scriptGeneration: {
          ...prev.scriptGeneration,
          calibrationBriefCount: briefCount,
        },
        by: admin.email?.trim() || admin.sub || "admin",
        note: `Silence-words-haiku compare run n=${briefCount}`,
      });
    }
    const run = await startSilenceWordsHaikuCompareRun({
      modelId,
      calibrationBriefCount: briefCount,
      restart: body.restart !== false,
    });
    return json(200, { ok: true, run });
  }
  if (action === "stop-silence-words-haiku-compare") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    await stopSilenceWordsHaikuCompareRun(modelId);
    const run = await loadSilenceWordsHaikuCompareRun(modelId);
    return json(200, { ok: true, run });
  }
  if (action === "get-silence-words-haiku-compare") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const pairs = await loadSilenceWordsHaikuComparePairs(modelId);
    const briefs = activeCalibrationBriefs(prev.scriptGeneration);
    const run = await loadSilenceWordsHaikuCompareRun(modelId);
    const briefCount = coerceCalibrationBriefCount(
      run?.briefCount ?? prev.scriptGeneration.calibrationBriefCount,
      briefs.length,
    );
    const workItems = silenceWordsHaikuCompareWorkItems(briefCount);
    const avg = (nums: number[]) =>
      nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
    const avgFine = (nums: number[]) =>
      nums.length
        ? Math.round(
            (nums.reduce((a, b) => a + b, 0) / nums.length) * 10000,
          ) / 10000
        : null;
    const avgInt = (nums: number[]) =>
      nums.length
        ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
        : null;
    const modeSnap = (
      m: SilenceWordsHaikuCompareModeResult | undefined,
    ) => m?.accuracy;
    const rows = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const cellPairs = pairs.filter(
          (p) => p.option === option && p.minutes === minutes,
        );
        const failedCell = cellPairs.filter(
          (p) => typeof p.error === "string" && p.error.trim(),
        );
        const group = cellPairs.filter(
          (p) => !p.error && p.stream?.accuracy && p.gated?.accuracy,
        );
        const n = group.length;
        const streamSnaps = group.map((p) => p.stream);
        const gatedSnaps = group.map((p) => p.gated);
        const bands = silenceFitAutoSpeakingBands(
          silenceFitSpeakingShare(prev.profiles, option),
        );
        const missAfter = (
          snaps: SilenceWordsHaikuCompareModeResult[],
        ) =>
          avg(
            snaps.map((s) => {
              const a = s.accuracy;
              return a.targetSeconds > 0
                ? ((a.predictedSecondsAfter - a.targetSeconds) /
                    a.targetSeconds) *
                    100
                : 0;
            }),
          );
        const missBefore = (
          snaps: SilenceWordsHaikuCompareModeResult[],
        ) =>
          avg(
            snaps.map((s) => {
              const a = s.accuracy;
              return a.targetSeconds > 0
                ? ((a.predictedSecondsBefore - a.targetSeconds) /
                    a.targetSeconds) *
                    100
                : 0;
            }),
          );
        const detailFor = (
          p: SilenceWordsHaikuComparePair,
          m: SilenceWordsHaikuCompareModeResult,
        ) => {
          const acc = m.accuracy;
          return {
            briefIndex: p.briefIndex,
            brief: p.brief,
            mode: m.mode,
            ...(acc ?? {}),
            phasesAttempted: m.phasesAttempted,
            phasesFixed: m.phasesFixed,
            phasesRejected: m.phasesRejected,
            haikuRan: m.haikuRan,
            haikuMs: m.haikuMs,
            totalMs: m.totalMs,
            scriptMs: m.scriptMs,
            ttsMs: m.ttsMs,
            assembleMs: m.assembleMs,
            ttsPhases: m.ttsPhases,
            audioBytes: m.audioBytes,
            haikuUsd: m.haikuUsd,
            claudeUsd: m.claudeUsd,
            sonnetMs: p.sonnetMs,
            wordBudget: m.wordBudget ?? p.wordBudget,
            scriptText: m.scriptText,
            scriptAsWritten: m.scriptAsWritten || p.scriptAsWritten,
            scriptAfterHaiku: m.scriptAfterHaiku,
          };
        };
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          scripts: n,
          failed: failedCell.length,
          failedError: failedCell[0]?.error?.slice(0, 160) ?? null,
          speakingBandMin: bands.speakingBandMin,
          speakingBandMax: bands.speakingBandMax,
          speechShareSonnet: avgFine(
            streamSnaps.map(
              (s) =>
                modeSnap(s)?.speechShareSonnet ??
                modeSnap(s)?.speechShare ??
                0,
            ),
          ),
          stream: {
            speechShare: avgFine(
              streamSnaps.map((s) => modeSnap(s)?.speechShare ?? 0),
            ),
            wordsVsBudgetPct: avg(
              streamSnaps.map((s) => modeSnap(s)?.wordsVsBudgetPct ?? 0),
            ),
            wordsVsBudgetSonnetPct: avg(
              streamSnaps.map(
                (s) =>
                  modeSnap(s)?.wordsVsBudgetSonnetPct ??
                  modeSnap(s)?.wordsVsBudgetPct ??
                  0,
              ),
            ),
            beforeFitPct: missBefore(streamSnaps),
            afterFitPct: missAfter(streamSnaps),
            estimatedTotalAudioSeconds: avg(
              streamSnaps.map(
                (s) => modeSnap(s)?.estimatedTotalAudioSeconds ?? 0,
              ),
            ),
            haikuRanCount: streamSnaps.filter((s) => s.haikuRan).length,
            phasesAttemptedAvg: avg(
              streamSnaps.map((s) => s.phasesAttempted),
            ),
            phasesFixedAvg: avg(streamSnaps.map((s) => s.phasesFixed)),
            phasesRejectedAvg: avg(
              streamSnaps.map((s) => s.phasesRejected),
            ),
            haikuMsAvg: avgInt(streamSnaps.map((s) => s.haikuMs)),
            totalMsAvg: avgInt(streamSnaps.map((s) => s.totalMs)),
            scriptMsAvg: avgInt(streamSnaps.map((s) => s.scriptMs ?? 0)),
            ttsMsAvg: avgInt(streamSnaps.map((s) => s.ttsMs ?? 0)),
            assembleMsAvg: avgInt(streamSnaps.map((s) => s.assembleMs ?? 0)),
            haikuUsdAvg: avgFine(streamSnaps.map((s) => s.haikuUsd)),
            claudeUsdAvg: avgFine(streamSnaps.map((s) => s.claudeUsd)),
            fitStep:
              streamSnaps.length &&
              streamSnaps.every(
                (s) =>
                  modeSnap(s)?.fitStep === modeSnap(streamSnaps[0])?.fitStep,
              )
                ? modeSnap(streamSnaps[0])?.fitStep ?? null
                : streamSnaps.length
                  ? "mixed"
                  : null,
            why: (() => {
              const whys = [
                ...new Set(
                  streamSnaps
                    .map((s) => modeSnap(s)?.why)
                    .filter(
                      (w): w is string => typeof w === "string" && !!w.trim(),
                    ),
                ),
              ];
              return whys.length === 1
                ? whys[0]!
                : whys.length > 1
                  ? whys.join("; ")
                  : null;
            })(),
          },
          gated: {
            speechShare: avgFine(
              gatedSnaps.map((s) => modeSnap(s)?.speechShare ?? 0),
            ),
            wordsVsBudgetPct: avg(
              gatedSnaps.map((s) => modeSnap(s)?.wordsVsBudgetPct ?? 0),
            ),
            wordsVsBudgetSonnetPct: avg(
              gatedSnaps.map(
                (s) =>
                  modeSnap(s)?.wordsVsBudgetSonnetPct ??
                  modeSnap(s)?.wordsVsBudgetPct ??
                  0,
              ),
            ),
            beforeFitPct: missBefore(gatedSnaps),
            afterFitPct: missAfter(gatedSnaps),
            estimatedTotalAudioSeconds: avg(
              gatedSnaps.map(
                (s) => modeSnap(s)?.estimatedTotalAudioSeconds ?? 0,
              ),
            ),
            haikuRanCount: gatedSnaps.filter((s) => s.haikuRan).length,
            phasesAttemptedAvg: avg(
              gatedSnaps.map((s) => s.phasesAttempted),
            ),
            phasesFixedAvg: avg(gatedSnaps.map((s) => s.phasesFixed)),
            phasesRejectedAvg: avg(
              gatedSnaps.map((s) => s.phasesRejected),
            ),
            haikuMsAvg: avgInt(gatedSnaps.map((s) => s.haikuMs)),
            totalMsAvg: avgInt(gatedSnaps.map((s) => s.totalMs)),
            scriptMsAvg: avgInt(gatedSnaps.map((s) => s.scriptMs ?? 0)),
            ttsMsAvg: avgInt(gatedSnaps.map((s) => s.ttsMs ?? 0)),
            assembleMsAvg: avgInt(gatedSnaps.map((s) => s.assembleMs ?? 0)),
            haikuUsdAvg: avgFine(gatedSnaps.map((s) => s.haikuUsd)),
            claudeUsdAvg: avgFine(gatedSnaps.map((s) => s.claudeUsd)),
            fitStep:
              gatedSnaps.length &&
              gatedSnaps.every(
                (s) =>
                  modeSnap(s)?.fitStep === modeSnap(gatedSnaps[0])?.fitStep,
              )
                ? modeSnap(gatedSnaps[0])?.fitStep ?? null
                : gatedSnaps.length
                  ? "mixed"
                  : null,
            why: (() => {
              const whys = [
                ...new Set(
                  gatedSnaps
                    .map((s) => modeSnap(s)?.why)
                    .filter(
                      (w): w is string => typeof w === "string" && !!w.trim(),
                    ),
                ),
              ];
              return whys.length === 1
                ? whys[0]!
                : whys.length > 1
                  ? whys.join("; ")
                  : null;
            })(),
          },
          sonnetMsAvg: avgInt(group.map((p) => p.sonnetMs)),
          scriptsDetail: group.flatMap((p) => [
            detailFor(p, p.stream),
            detailFor(p, p.gated),
          ]),
        };
      }),
    );
    const okPairs = pairs.filter((p) => !p.error && p.stream && p.gated);
    const failedPairs = pairs.filter(
      (p) => typeof p.error === "string" && p.error.trim(),
    );
    return json(200, {
      ok: true,
      briefCount,
      workItems,
      completedCount: okPairs.length,
      total: workItems.length,
      rows,
      summary: {
        pairs: okPairs.length,
        failed: failedPairs.length,
        failedSample: failedPairs
          .slice(0, 3)
          .map((p) =>
            `${p.option}/${p.minutes}m: ${(p.error || "").slice(0, 160)}`,
          ),
        streamHaikuRan: okPairs.filter((p) => p.stream.haikuRan).length,
        gatedHaikuRan: okPairs.filter((p) => p.gated.haikuRan).length,
        streamPhasesAttemptedAvg: avg(
          okPairs.map((p) => p.stream.phasesAttempted),
        ),
        gatedPhasesAttemptedAvg: avg(
          okPairs.map((p) => p.gated.phasesAttempted),
        ),
        streamHaikuMsAvg: avgInt(okPairs.map((p) => p.stream.haikuMs)),
        gatedHaikuMsAvg: avgInt(okPairs.map((p) => p.gated.haikuMs)),
        streamTtsMsAvg: avgInt(okPairs.map((p) => p.stream.ttsMs ?? 0)),
        gatedTtsMsAvg: avgInt(okPairs.map((p) => p.gated.ttsMs ?? 0)),
        streamTotalMsAvg: avgInt(okPairs.map((p) => p.stream.totalMs)),
        gatedTotalMsAvg: avgInt(okPairs.map((p) => p.gated.totalMs)),
        ttsVoiceName: okPairs.find((p) => p.ttsVoiceName)?.ttsVoiceName ?? null,
      },
      run,
    });
  }
  if (action === "start-silence-words-haiku-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      typeof body.calibrationBriefCount === "number"
        ? body.calibrationBriefCount
        : prev.scriptGeneration.calibrationBriefCount,
      prev.scriptGeneration.calibrationBriefs.length || 10,
    );
    if (briefCount !== prev.scriptGeneration.calibrationBriefCount) {
      await saveDeliveryProfileRecord({
        profiles: prev.profiles,
        scriptGeneration: {
          ...prev.scriptGeneration,
          calibrationBriefCount: briefCount,
        },
        by: admin.email?.trim() || admin.sub || "admin",
        note: `Silence-words-haiku cost run n=${briefCount}`,
      });
    }
    const run = await startSilenceWordsHaikuCostRun({
      modelId,
      calibrationBriefCount: briefCount,
      restart: body.restart !== false,
    });
    return json(200, { ok: true, run });
  }
  if (action === "stop-silence-words-haiku-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    await stopSilenceWordsHaikuCostRun(modelId);
    const run = await loadSilenceWordsHaikuCostRun(modelId);
    return json(200, { ok: true, run });
  }
  if (action === "get-silence-words-haiku-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cells = await loadSilenceWordsHaikuCalibrationCells(modelId);
    const briefs = activeCalibrationBriefs(prev.scriptGeneration);
    const briefCount = coerceCalibrationBriefCount(
      prev.scriptGeneration.calibrationBriefCount,
      briefs.length,
    );
    const workItems = silenceWordsHaikuWorkItems(briefCount);
    const completedKeys = cells.map(
      (c) =>
        `${c.silenceFitOption ?? "guided"}#${c.minutes}#${c.briefIndex}`,
    );
    const sw = prev.scriptGeneration.silenceWordsHaiku;
    const fitSettings = silenceWordsAsFitSettings(sw);
    const avg = (nums: number[]) =>
      nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
    const avgFine = (nums: number[]) =>
      nums.length
        ? Math.round(
            (nums.reduce((a, b) => a + b, 0) / nums.length) * 10000,
          ) / 10000
        : null;
    const lengthAccuracy = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const group = cells.filter(
          (c) =>
            c.silenceFitOption === option &&
            c.minutes === minutes &&
            !c.error &&
            c.silenceWordsHaikuAccuracy,
        );
        const snaps = group.map((c) => c.silenceWordsHaikuAccuracy!).filter(Boolean);
        const n = snaps.length;
        const outside = snaps.filter((s) => s.outsideTolerance);
        const inBand = snaps.filter((s) => s.insideSpeakingBand);
        const afterPcts = snaps.map((s) =>
          s.targetSeconds > 0
            ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) *
              100
            : 0,
        );
        const cellCfg = silenceFitCellFor(fitSettings, option, minutes);
        const whys = [
          ...new Set(
            snaps
              .map((s) => s.why)
              .filter(
                (w): w is NonNullable<(typeof snaps)[number]["why"]> =>
                  typeof w === "string" && !!w.trim(),
              ),
          ),
        ];
        const steps = snaps.map((s) => s.fitStep);
        const stepMode =
          steps.length === 0
            ? null
            : steps.every((s) => s === steps[0])
              ? steps[0]
              : "mixed";
        const estimatedTotals = snaps.map((s) =>
          typeof s.estimatedTotalAudioSeconds === "number" &&
          Number.isFinite(s.estimatedTotalAudioSeconds)
            ? s.estimatedTotalAudioSeconds
            : silenceFitEstimatedTotalAudioSeconds(s.predictedSecondsAfter),
        );
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          scripts: n,
          speechShare: avgFine(snaps.map((s) => s.speechShare)),
          speechShareSonnet: avgFine(
            snaps.map((s) => s.speechShareSonnet ?? s.speechShare),
          ),
          speakingBandMin: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMin,
          speakingBandMax: silenceFitAutoSpeakingBands(
            silenceFitSpeakingShare(prev.profiles, option),
          ).speakingBandMax,
          beforeFitPct: avg(
            snaps.map((s) =>
              s.targetSeconds > 0
                ? ((s.predictedSecondsBefore - s.targetSeconds) /
                    s.targetSeconds) *
                  100
                : 0,
            ),
          ),
          afterFitPct: avg(afterPcts),
          wordsVsBudgetPct: avg(snaps.map((s) => s.wordsVsBudgetPct)),
          wordsVsBudgetSonnetPct: avg(
            snaps.map((s) => s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct),
          ),
          wordsVsBudgetSonnetMin: (() => {
            const vals = snaps.map(
              (s) => s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct,
            );
            return vals.length ? Math.min(...vals) : null;
          })(),
          wordsVsBudgetSonnetMax: (() => {
            const vals = snaps.map(
              (s) => s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct,
            );
            return vals.length ? Math.max(...vals) : null;
          })(),
          wordsSonnetUnderCount: snaps.filter(
            (s) => (s.wordsVsBudgetSonnetPct ?? s.wordsVsBudgetPct) < 0,
          ).length,
          haikuRanCount: snaps.filter((s) => s.haikuRan).length,
          haikuPhasesFixedAvg: avg(snaps.map((s) => s.phasesFixed)),
          estimatedTotalAudioSeconds: avg(estimatedTotals),
          fitStep: stepMode,
          outsideCount: outside.length,
          outsidePct:
            n > 0 ? Math.round((outside.length / n) * 1000) / 10 : null,
          inBandCount: inBand.length,
          inBandPct:
            n > 0 ? Math.round((inBand.length / n) * 1000) / 10 : null,
          why:
            whys.length === 1
              ? whys[0]!
              : whys.length > 1
                ? whys.join("; ")
                : null,
          scriptsDetail: group.map((c) => {
            const acc = c.silenceWordsHaikuAccuracy;
            const phases = acc?.phases ?? [];
            const chars = spokenCharCount(c.scriptText);
            const claudeUsd = c.usage ? usdFromCell(c, modelId) : null;
            const briefWords = countSpokenWords(c.brief || "");
            const fixCalls = haikuFixCallExportFields(c);
            return {
              briefIndex: c.briefIndex,
              brief: c.brief,
              ...(acc ?? {}),
              scriptTextAsWritten: c.scriptTextAsWritten,
              scriptTextAfterHaiku:
                c.scriptTextAfterHaiku ?? acc?.scriptAfterHaiku,
              scriptText: c.scriptText,
              wordBudget: acc?.wordBudget ?? null,
              headerWords: acc?.headerWordTotal ?? null,
              words: acc?.wordsWritten ?? acc?.words ?? null,
              // Sentence columns left empty for this mode.
              sentenceBudget: null,
              headerSentenceTotal: null,
              writtenSentenceTotal: null,
              wordsPerSentence: null,
              phaseCount: phases.length,
              chars: chars > 0 ? chars : null,
              claudeUsd,
              briefWords: briefWords > 0 ? briefWords : null,
              fixCallsModel: fixCalls.fixCallsModel,
              fixCallsInputTokensTotal: fixCalls.fixCallsInputTokensTotal,
              fixCallsCount: fixCalls.fixCallsCount,
            };
          }),
        };
      }),
    );
    const okSnaps = cells
      .map((c) => c.silenceWordsHaikuAccuracy)
      .filter(
        Boolean,
      ) as NonNullable<(typeof cells)[0]["silenceWordsHaikuAccuracy"]>[];
    const missPcts = okSnaps.map((s) =>
      s.targetSeconds > 0
        ? ((s.predictedSecondsAfter - s.targetSeconds) / s.targetSeconds) * 100
        : 0,
    );
    const absMisses = missPcts.map((m) => Math.abs(m));
    let largestMissPct: number | null = null;
    if (missPcts.length) {
      let best = missPcts[0]!;
      for (const m of missPcts) {
        if (Math.abs(m) > Math.abs(best)) best = m;
      }
      largestMissPct = Math.round(best * 10) / 10;
    }
    const summary = {
      scripts: okSnaps.length,
      withinTolerance: okSnaps.filter((s) => !s.outsideTolerance).length,
      insideSpeakingBand: okSnaps.filter((s) => s.insideSpeakingBand).length,
      avgMissAfterPct: avg(absMisses),
      largestMissAfterPct: largestMissPct,
      haikuRanCount: okSnaps.filter((s) => s.haikuRan).length,
    };
    const budgets = SILENCE_FIT_OPTIONS.flatMap((option) =>
      SILENCE_FIT_LENGTHS.map((len) => {
        const minutes = Number(len);
        const cellCfg = silenceFitCellFor(fitSettings, option, minutes);
        const scriptTimeSeconds = Math.max(30, minutes * 60 - 45);
        // Was: bottom of band / middle of band from stored speakingBandMin/Max.
        // const speakingShareForBudget = cellCfg.speakingBandMin;
        // const speakingShareForBudget =
        //   (cellCfg.speakingBandMin + cellCfg.speakingBandMax) / 2;
        const speakingShareForBudget = silenceFitSpeakingShare(
          prev.profiles,
          option,
        );
        const wordBudget = silenceWordsWordBudget({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          effectiveWpm: CALIBRATION_MEDIAN_WPM,
        });
        const minLongPauses = silenceFitMinLongPauses({
          scriptTimeSeconds,
          speakingBandMin: speakingShareForBudget,
          longestSingleSilenceSeconds: cellCfg.longestSingleSilenceSeconds,
        });
        return {
          option,
          label: SILENCE_FIT_OPTION_LABEL[option],
          minutes,
          wordBudget,
          minLongPauses,
          speakingShareForBudget,
          speakingSeconds: Math.round(
            scriptTimeSeconds * speakingShareForBudget,
          ),
        };
      }),
    );
    const run = await loadSilenceWordsHaikuCostRun(modelId);
    return json(200, {
      ok: true,
      briefCount,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      scriptGenCostsSilenceWordsHaiku: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells,
        mode: "silence_words_haiku",
      }),
      lengthAccuracy,
      summary,
      budgets,
      silenceWordsHaiku: sw,
      run,
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
    const briefs = activeCalibrationBriefs(prev.scriptGeneration);
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
    const { briefs, briefCount, cells } = runBriefsAndCells(
      prev.scriptGeneration,
      [...byKey.values()],
    );
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
      briefs,
      briefCount,
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
      factorSpread: factorSpreadRows(cells, factors),
      scriptFactors: perScriptFactorRows(cells),
      sectionBreakdown: perScriptSectionBreakdown(cells),
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
    const { briefs, briefCount, cells } = runBriefsAndCells(
      prev.scriptGeneration,
      batch?.cells ?? (await loadScriptCalibrationCells(modelId)),
    );
    const workItems = calibrationWorkItems(briefs);
    const completedKeys = cells.map((c) =>
      calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
    );
    const diversions = (
      batch?.diversions && batch.diversions.length > 0
        ? batch.diversions
        : diversionsFromCells(cells)
    ).filter((d) => d.briefIndex < briefCount);
    const factors =
      batch?.factors &&
      correctionHasCalibratedSamples(batch.factors) &&
      (batch.briefCount == null || batch.briefCount === briefCount)
        ? batch.factors
        : prev.scriptGeneration.targetCorrectionByModel[modelId] ||
          prev.targetCorrection;
    const summary = cells.length
      ? CALIBRATE_DELIVERIES.flatMap((delivery) =>
          CALIBRATE_MINUTES.map((minutes) =>
            summarizeCalibrationCellGroup(cells, delivery, minutes, factors),
          ),
        )
      : [];
    const { cells: singleCells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadSingleCallCalibrationCells(modelId),
    );
    const { cells: timeCells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadTimeBasedCalibrationCells(modelId),
    );
    const scriptGenCosts = buildScriptGenCostRows({
      profiles: prev.profiles,
      modelId,
      cells,
      mode: "sections",
    });
    const scriptGenCostsSingle = buildScriptGenCostRows({
      profiles: prev.profiles,
      modelId,
      cells: singleCells,
      mode: "single",
    });
    const scriptGenCostsTime = buildScriptGenCostRows({
      profiles: prev.profiles,
      modelId,
      cells: timeCells,
      mode: "time",
    });
    return json(200, {
      ok: true,
      batch: batch
        ? { ...batch, diversions, cells: undefined }
        : cells.length
          ? { diversions, ranAt: null }
          : null,
      diversions,
      summary,
      factorSpread: cells.length ? factorSpreadRows(cells, factors) : [],
      scriptFactors: cells.length ? perScriptFactorRows(cells) : [],
      sectionBreakdown: cells.length ? perScriptSectionBreakdown(cells) : [],
      scriptGenCosts,
      scriptGenCostsSingle,
      scriptGenCostsTime,
      briefCount,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      // All cells saved but factors never written — Resume should finalize, not wipe.
      needsFinalize:
        workItems.length > 0 &&
        completedKeys.length >= workItems.length &&
        !(
          batch?.factors &&
          correctionHasCalibratedSamples(batch.factors) &&
          (batch.briefCount == null || batch.briefCount === briefCount)
        ),
      run: await loadScriptCalibrationRun(modelId),
    });
  }
  if (action === "get-script-gen-costs") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const [rawCells, rawSingle, rawTime, rawSilence] = await Promise.all([
      loadScriptCalibrationCells(modelId),
      loadSingleCallCalibrationCells(modelId),
      loadTimeBasedCalibrationCells(modelId),
      loadSilenceFitCalibrationCells(modelId),
    ]);
    const { briefCount, cells } = runBriefsAndCells(
      prev.scriptGeneration,
      rawCells,
    );
    const { cells: singleCells } = runBriefsAndCells(
      prev.scriptGeneration,
      rawSingle,
    );
    const { cells: timeCells } = runBriefsAndCells(
      prev.scriptGeneration,
      rawTime,
    );
    return json(200, {
      ok: true,
      modelId,
      briefCount,
      scriptGenCosts: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells,
        mode: "sections",
      }),
      scriptGenCostsSingle: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells: singleCells,
        mode: "single",
      }),
      scriptGenCostsTime: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells: timeCells,
        mode: "time",
      }),
      // Same as get-silence-fit-calibration: show full last run, not clipped by n.
      scriptGenCostsSilence: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells: rawSilence,
        mode: "silence",
      }),
    });
  }
  /**
   * Re-run fidelity on a chunk of stored calibration scripts (no script regen).
   * UI loops offset until done — keeps under API Gateway time limits.
   */
  if (action === "rejudge-script-calibration-fidelity") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const cells = await loadScriptCalibrationCells(modelId);
    if (!cells.length) {
      return json(400, {
        error: "No stored calibration scripts for this model — run calibration first.",
      });
    }
    const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
    const limitRaw = Math.floor(Number(body.limit) || 8);
    const limit = Math.max(1, Math.min(limitRaw, 12));
    const slice = cells.slice(offset, offset + limit);
    if (!slice.length) {
      const diversions = diversionsFromCells(cells);
      return json(200, {
        ok: true,
        done: true,
        offset,
        nextOffset: offset,
        diversions,
        judged: 0,
        skipped: 0,
        cellCount: cells.length,
      });
    }
    const judged = await rejudgeCalibrationFidelity({
      cells: slice,
      concurrency: Math.min(6, slice.length),
    });
    // Merge judged slice back into full list and persist those cells.
    const byKey = new Map(
      cells.map((c) => [calibrationCellKey(c.delivery, c.minutes, c.briefIndex), c]),
    );
    for (const c of judged.cells) {
      byKey.set(calibrationCellKey(c.delivery, c.minutes, c.briefIndex), c);
      await saveScriptCalibrationCell({ modelId, cell: c });
    }
    const merged = [...byKey.values()];
    const nextOffset = offset + slice.length;
    const done = nextOffset >= cells.length;
    const diversions = done ? diversionsFromCells(merged) : undefined;
    if (done) {
      const existing = await loadScriptCalibrationBatch(modelId, {
        includeCells: false,
      });
      const ranAt = existing?.ranAt || new Date().toISOString();
      await saveScriptCalibrationBatch({
        modelId,
        ranAt,
        briefs: existing?.briefs?.length
          ? existing.briefs
          : prev.scriptGeneration.calibrationBriefs,
        medianWpm: existing?.medianWpm || CALIBRATION_MEDIAN_WPM,
        cells: merged,
        factors: existing?.factors || prev.targetCorrection,
        failures: existing?.failures || [],
        diversions: diversions ?? [],
      });
    }
    return json(200, {
      ok: true,
      done,
      offset,
      nextOffset,
      diversions: diversions ?? null,
      judged: judged.judged,
      skipped: judged.skipped,
      cellCount: cells.length,
      chunkSize: slice.length,
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
  /** One delivery × length × brief for time-based cost measurement. */
  if (action === "calibrate-time-based-cell") {
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
    const briefs = singleCallCalibrationBriefs(prev.scriptGeneration);
    if (
      !delivery ||
      !CALIBRATE_MINUTES.includes(minutes as (typeof CALIBRATE_MINUTES)[number]) ||
      !Number.isInteger(briefIndex) ||
      briefIndex < 0 ||
      briefIndex >= briefs.length
    ) {
      return json(400, {
        error: `delivery, minutes (5|10|20), and briefIndex (0..${briefs.length - 1}) required`,
        workItems: singleCallWorkItems(briefs).length,
        briefCount: briefs.length,
      });
    }
    const result = await runTimeBasedScriptCell({
      modelId,
      delivery,
      minutes,
      briefIndex,
      brief: briefs[briefIndex]!,
      trimModelId: prev.scriptGeneration.styleInferModelId,
    });
    await saveTimeBasedCalibrationCell({ modelId, cell: result });
    const { cells: savedCells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadTimeBasedCalibrationCells(modelId),
    );
    return json(200, {
      ok: true,
      result: {
        delivery: result.delivery,
        minutes: result.minutes,
        briefIndex: result.briefIndex,
        writtenWords: result.writtenWords,
        error: result.error,
        usage: result.usage,
      },
      total: singleCallWorkItems(briefs).length,
      briefCount: briefs.length,
      completedCount: savedCells.length,
      completedKeys: savedCells.map((c) =>
        calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
      ),
      scriptGenCostsTime: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells: savedCells,
        mode: "time",
      }),
    });
  }
  if (action === "get-time-based-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const { briefs, briefCount, cells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadTimeBasedCalibrationCells(modelId),
    );
    const workItems = singleCallWorkItems(briefs);
    const completedKeys = cells.map((c) =>
      calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
    );
    // Avg sentences written vs header per delivery × length.
    const sentenceAccuracy = CALIBRATE_DELIVERIES.flatMap((delivery) =>
      CALIBRATE_MINUTES.map((minutes) => {
        const group = cells.filter(
          (c) =>
            c.delivery === delivery &&
            c.minutes === minutes &&
            !c.error &&
            (c.timePhases?.length ?? 0) > 0,
        );
        let header = 0;
        let actual = 0;
        let phaseCount = 0;
        for (const c of group) {
          for (const p of c.timePhases ?? []) {
            if (!(p.headerSentences > 0)) continue;
            header += p.headerSentences;
            actual += p.actualSentences;
            phaseCount += 1;
          }
        }
        return {
          delivery,
          minutes,
          scripts: group.length,
          phases: phaseCount,
          avgHeaderSentences:
            phaseCount > 0 ? Math.round((header / phaseCount) * 10) / 10 : null,
          avgActualSentences:
            phaseCount > 0 ? Math.round((actual / phaseCount) * 10) / 10 : null,
          avgActualVsHeaderPct:
            header > 0
              ? Math.round(((actual - header) / header) * 1000) / 10
              : null,
        };
      }),
    );
    // Legacy count-only table (commented out on FE). Kept for older clients.
    const lengthToleranceAccuracy = CALIBRATE_DELIVERIES.flatMap((delivery) =>
      CALIBRATE_MINUTES.map((minutes) => {
        const group = cells.filter(
          (c) =>
            c.delivery === delivery &&
            c.minutes === minutes &&
            !c.error &&
            c.writtenWords > 0,
        );
        const outside = group.filter((c) => c.timeOutsideTolerance === true);
        const tooShort = outside.filter(
          (c) => c.timeOutsideReason === "too_short",
        ).length;
        const tooLong = outside.filter(
          (c) => c.timeOutsideReason === "too_long",
        ).length;
        return {
          delivery,
          minutes,
          scripts: group.length,
          outsideCount: outside.length,
          outsidePct:
            group.length > 0
              ? Math.round((outside.length / group.length) * 1000) / 10
              : null,
          tooShort,
          tooLong,
        };
      }),
    );
    const avg = (nums: number[]) =>
      nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
    // Rich length accuracy · time-based (averages when n > 1).
    const lengthAccuracy = CALIBRATE_DELIVERIES.flatMap((delivery) =>
      CALIBRATE_MINUTES.map((minutes) => {
        const group = cells.filter(
          (c) =>
            c.delivery === delivery &&
            c.minutes === minutes &&
            !c.error &&
            c.timeLengthAccuracy,
        );
        const snaps = group
          .map((c) => c.timeLengthAccuracy!)
          .filter(Boolean);
        const n = snaps.length;
        const outside = snaps.filter((s) => s.outsideTolerance);
        const whys = [
          ...new Set(
            outside
              .map((s) => s.why)
              .filter((w): w is string => typeof w === "string" && !!w.trim()),
          ),
        ];
        const tol =
          snaps[0]?.lengthTolerancePct ??
          prev.profiles.shared.lengthTolerancePct ??
          10;
        return {
          delivery,
          minutes,
          scripts: n,
          targetSeconds: avg(snaps.map((s) => s.targetSeconds)),
          predictedSecondsBefore: avg(
            snaps.map((s) => s.predictedSecondsBefore),
          ),
          predictedSecondsAfter: avg(
            snaps.map((s) => s.predictedSecondsAfter),
          ),
          speechSeconds: avg(snaps.map((s) => s.speechSeconds)),
          silenceShareAfter: avg(snaps.map((s) => s.silenceShareAfter)),
          spaceRangeMin: snaps[0]?.spaceRangeMin ?? null,
          spaceRangeMax: snaps[0]?.spaceRangeMax ?? null,
          words: avg(snaps.map((s) => s.words)),
          roughSpeechWords: avg(snaps.map((s) => s.roughSpeechWords)),
          extendableCount: avg(snaps.map((s) => s.extendableCount)),
          extendableSecondsBefore: avg(
            snaps.map((s) => s.extendableSecondsBefore),
          ),
          extendableSecondsAfter: avg(
            snaps.map((s) => s.extendableSecondsAfter),
          ),
          outsideCount: outside.length,
          outsidePct:
            n > 0 ? Math.round((outside.length / n) * 1000) / 10 : null,
          lengthTolerancePct: tol,
          why: whys.length === 1 ? whys[0]! : whys.length > 1 ? whys.join("; ") : null,
          scriptsDetail: group.map((c) => ({
            briefIndex: c.briefIndex,
            brief: c.brief,
            ...(c.timeLengthAccuracy ?? {}),
          })),
        };
      }),
    );
    const run = await loadTimeBasedCostRun(modelId);
    return json(200, {
      ok: true,
      briefCount,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      scriptGenCostsTime: buildScriptGenCostRows({
        profiles: prev.profiles,
        modelId,
        cells,
        mode: "time",
      }),
      sentenceAccuracy,
      lengthToleranceAccuracy,
      lengthAccuracy,
      run,
    });
  }
  /** One of 27 single-call calibration scripts (factors OFF). */
  if (action === "calibrate-single-call-cell") {
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
    const briefs = singleCallCalibrationBriefs(prev.scriptGeneration);
    if (
      !delivery ||
      !CALIBRATE_MINUTES.includes(minutes as (typeof CALIBRATE_MINUTES)[number]) ||
      !Number.isInteger(briefIndex) ||
      briefIndex < 0 ||
      briefIndex >= briefs.length
    ) {
      return json(400, {
        error: `delivery, minutes (5|10|20), and briefIndex (0..${briefs.length - 1}) required`,
        workItems: singleCallWorkItems(briefs).length,
        briefCount: briefs.length,
      });
    }
    const result = await runSingleCallScriptCell({
      modelId,
      delivery,
      minutes,
      briefIndex,
      brief: briefs[briefIndex]!,
      correction: null,
    });
    await saveSingleCallCalibrationCell({ modelId, cell: result });
    const { cells: savedCells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadSingleCallCalibrationCells(modelId),
    );
    return json(200, {
      ok: true,
      result,
      total: singleCallWorkItems(briefs).length,
      briefCount: briefs.length,
      completedCount: savedCells.length,
      completedKeys: savedCells.map((c) =>
        calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
      ),
    });
  }
  if (action === "calibrate-single-call-finalize") {
    const by = admin.email?.trim() || admin.sub || "admin";
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const { cells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadSingleCallCalibrationCells(modelId),
    );
    if (cells.length < 1) {
      return json(400, {
        error: "No single-call cells found — run cells first (or resume).",
      });
    }
    const ranAt = new Date().toISOString();
    const factors = factorsFromSingleCallCells(cells, ranAt);
    const failures = cells
      .filter((c) => c.error)
      .map((c) => ({
        delivery: c.delivery,
        minutes: c.minutes,
        briefIndex: c.briefIndex,
        error: c.error || "failed",
      }));
    await saveSingleCallCalibrationMeta({
      modelId,
      ranAt,
      factors,
      cellCount: cells.length,
      failures,
    });
    const scriptGeneration = setSingleCallCorrectionForModel(
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
      note: `Single-call calibration ${modelId}: ${cells.length - failures.length}/${cells.length} scripts`,
    });
    const summary = CALIBRATE_DELIVERIES.flatMap((delivery) =>
      CALIBRATE_MINUTES.map((minutes) =>
        summarizeCalibrationCellGroup(cells, delivery, minutes, factors),
      ),
    );
    return json(200, {
      ok: true,
      scriptGeneration: saved.scriptGeneration,
      singleCallCorrection: singleCallCorrectionForModel(
        saved.scriptGeneration,
        modelId,
      ),
      summary,
      factorSpread: factorSpreadRows(cells, factors),
      scriptFactors: perScriptFactorRows(cells),
      failures,
      batchMeta: { ranAt, modelId, cellCount: cells.length },
      hasCalibratedSamples: correctionHasCalibratedSamples(factors),
    });
  }
  if (action === "get-single-call-calibration") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const { briefs, briefCount, cells } = runBriefsAndCells(
      prev.scriptGeneration,
      await loadSingleCallCalibrationCells(modelId),
    );
    const workItems = singleCallWorkItems(briefs);
    const completedKeys = cells.map((c) =>
      calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
    );
    const factors = singleCallCorrectionForModel(prev.scriptGeneration, modelId);
    const summary = cells.length
      ? CALIBRATE_DELIVERIES.flatMap((delivery) =>
          CALIBRATE_MINUTES.map((minutes) =>
            summarizeCalibrationCellGroup(cells, delivery, minutes, factors),
          ),
        )
      : [];
    const scriptGenCostsSingle = buildScriptGenCostRows({
      profiles: prev.profiles,
      modelId,
      cells,
      mode: "single",
    });
    return json(200, {
      ok: true,
      // Resume keys only — full scripts stay server-side.
      briefCount,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      singleCallCorrection: factors,
      summary,
      factorSpread: cells.length ? factorSpreadRows(cells, factors) : [],
      scriptFactors: cells.length ? perScriptFactorRows(cells) : [],
      scriptGenCostsSingle,
    });
  }
  /** One of 27 comparison pairs (single + sectioned, factors ON). */
  if (action === "compare-script-modes-cell") {
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
    // Same briefs as sectioned / single-call calibration.
    const briefs = singleCallCalibrationBriefs(prev.scriptGeneration);
    if (
      !delivery ||
      !CALIBRATE_MINUTES.includes(minutes as (typeof CALIBRATE_MINUTES)[number]) ||
      !Number.isInteger(briefIndex) ||
      briefIndex < 0 ||
      briefIndex >= briefs.length
    ) {
      return json(400, {
        error: `delivery, minutes (5|10|20), and briefIndex (0..${briefs.length - 1}) required`,
        workItems: singleCallWorkItems(briefs).length,
        briefCount: briefs.length,
      });
    }
    const sectionedCorrection = correctionForModel(
      prev.scriptGeneration,
      modelId,
      prev.scriptGeneration.scriptModelId,
    ).correction;
    const singleCorrection = singleCallCorrectionForModel(
      prev.scriptGeneration,
      modelId,
    );
    const brief = briefs[briefIndex]!;
    const [singleCell, sectionedCell] = await Promise.all([
      runSingleCallScriptCell({
        modelId,
        delivery,
        minutes,
        briefIndex,
        brief,
        correction: singleCorrection,
      }),
      runSectionedScriptCell({
        modelId,
        delivery,
        minutes,
        briefIndex,
        brief,
        correction: sectionedCorrection,
      }),
    ]);
    const medianWpm = CALIBRATION_MEDIAN_WPM;
    const voiceWpms = CHECK_VOICES.map((v) => v.wpm);
    const pair: ComparisonPairResult = {
      delivery,
      minutes,
      briefIndex,
      brief,
      single: metricsFromCell(singleCell, medianWpm, voiceWpms),
      sectioned: metricsFromCell(sectionedCell, medianWpm, voiceWpms),
    };
    await saveComparisonPair({
      modelId,
      pair: {
        delivery,
        minutes,
        briefIndex,
        brief,
        single: pair.single,
        sectioned: pair.sectioned,
      },
    });
    const savedPairs = await loadComparisonPairs(modelId);
    return json(200, {
      ok: true,
      pair,
      total: singleCallWorkItems(briefs).length,
      completedCount: savedPairs.length,
      completedKeys: savedPairs.map((p) =>
        calibrationCellKey(p.delivery, p.minutes, p.briefIndex),
      ),
    });
  }
  if (action === "compare-script-modes-finalize") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const stored = await loadComparisonPairs(modelId);
    if (stored.length < 1) {
      return json(400, {
        error: "No comparison pairs found — run cells first (or resume).",
      });
    }
    const pairs: ComparisonPairResult[] = stored.map((p) => ({
      delivery: p.delivery,
      minutes: p.minutes,
      briefIndex: p.briefIndex,
      brief: p.brief,
      single: p.single as ComparisonPairResult["single"],
      sectioned: p.sectioned as ComparisonPairResult["sectioned"],
    }));
    const table = buildComparisonTable(pairs);
    const ranAt = new Date().toISOString();
    await saveComparisonMeta({
      modelId,
      ranAt,
      table,
      pairCount: pairs.length,
    });
    return json(200, {
      ok: true,
      table,
      pairs,
      batchMeta: { ranAt, modelId, pairCount: pairs.length },
    });
  }
  if (action === "get-script-mode-comparison") {
    const prev = await loadDeliveryProfileRecord();
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : prev.scriptGeneration.scriptModelId;
    const briefs = singleCallCalibrationBriefs(prev.scriptGeneration);
    const pairs = await loadComparisonPairs(modelId);
    const meta = await loadComparisonMeta(modelId);
    const workItems = singleCallWorkItems(briefs);
    const completedKeys = pairs.map((p) =>
      calibrationCellKey(p.delivery, p.minutes, p.briefIndex),
    );
    return json(200, {
      ok: true,
      pairs,
      table: meta?.table ?? null,
      ranAt: meta?.ranAt ?? null,
      workItems,
      completedKeys,
      completedCount: completedKeys.length,
      total: workItems.length,
      canResume:
        completedKeys.length > 0 && completedKeys.length < workItems.length,
      briefs,
      scriptWriteMode: prev.scriptGeneration.scriptWriteMode,
    });
  }
  if (action === "save-script-write-modes") {
    const by = admin.email?.trim() || admin.sub || "admin";
    const prev = await loadDeliveryProfileRecord();
    const scriptWriteMode =
      body.scriptWriteMode === "single" || body.scriptWriteMode === "sections"
        ? body.scriptWriteMode
        : prev.scriptGeneration.scriptWriteMode;
    const userScriptFidelityCheck =
      typeof body.userScriptFidelityCheck === "boolean"
        ? body.userScriptFidelityCheck
        : prev.scriptGeneration.userScriptFidelityCheck === true;
    const coerced = coerceScriptGenerationSettings(
      {
        ...prev.scriptGeneration,
        scriptWriteMode,
        userScriptFidelityCheck,
      },
      prev.targetCorrection,
    );
    const saved = await saveDeliveryProfileRecord({
      profiles: prev.profiles,
      scriptGeneration: coerced,
      by,
      note: `Script write mode → ${scriptWriteMode}; user fidelity → ${userScriptFidelityCheck ? "on" : "off"}`,
    });
    return json(200, {
      ok: true,
      scriptGeneration: saved.scriptGeneration,
    });
  }
  if (action === "length-preview") {
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
    const brief =
      typeof body.brief === "string" && body.brief.trim()
        ? body.brief.trim()
        : prev.scriptGeneration.comparisonBriefs[0] ||
          prev.scriptGeneration.calibrationBriefs[0] ||
          "";
    const mode =
      body.mode === "single" ||
      body.mode === "sections" ||
      body.mode === "time"
        ? body.mode
        : undefined;
    if (
      !delivery ||
      !CALIBRATE_MINUTES.includes(minutes as (typeof CALIBRATE_MINUTES)[number]) ||
      !brief
    ) {
      return json(400, {
        error: "delivery, minutes (5|10|20), and brief required",
      });
    }
    const preview = await runLengthPreview({
      settings: prev.scriptGeneration,
      modelId,
      delivery,
      minutes,
      mode,
      brief,
      title: typeof body.title === "string" ? body.title : "A short practice.",
    });
    const id = `${Date.now()}-${delivery}-${minutes}`;
    const ranAt = new Date().toISOString();
    await saveLengthPreviewLog({
      id,
      ranAt,
      delivery,
      minutes,
      mode: preview.mode,
      modelId,
      medianPctVsRequested: preview.medianPctVsRequested,
      voices: preview.voices.map((v) => ({
        modelId: v.modelId,
        name: v.name,
        pctVsRequested: v.pctVsRequested,
        predictedTotalSeconds: v.predictedTotalSeconds,
        actualTotalSeconds: null,
      })),
      avgAbsPredictionErrorPct: null,
    });
    const history = await loadLengthPreviewLogs(40);
    return json(200, {
      ok: true,
      preview: {
        ...preview,
        scriptText: preview.cell.scriptText,
        clocks: {
          scriptTarget: fmtClock(preview.scriptTargetSeconds),
          aroundTotal: fmtClock(preview.around.aroundTotalSeconds),
          leadIn: fmtClock(preview.around.leadInSeconds),
          fadeOut: fmtClock(preview.around.fadeOutSeconds),
          titleSpeech: fmtClock(preview.around.titleSpeechSeconds),
          titlePauses: fmtClock(preview.around.titlePauseRendered),
        },
      },
      history: history.logs,
      avgAbsPredictionErrorPct: history.avgAbsPredictionErrorPct,
    });
  }
  if (action === "get-length-preview-logs") {
    const history = await loadLengthPreviewLogs(40);
    return json(200, {
      ok: true,
      history: history.logs,
      avgAbsPredictionErrorPct: history.avgAbsPredictionErrorPct,
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
