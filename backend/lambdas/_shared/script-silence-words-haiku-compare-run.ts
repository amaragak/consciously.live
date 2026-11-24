/**
 * Server-side Silence-fit · words + Haiku stream vs gated compare run.
 * n briefs × 3 options × 3 lengths (each pair = 1 Sonnet + 2 Haiku + TTS).
 * Stream kicks Fish TTS per phase; gated does one full-script TTS after Haiku.
 */
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { coerceClaudeModel } from "./anthropic-pricing";
import {
  activeCalibrationBriefs,
  coerceCalibrationBriefCount,
} from "./script-generation-settings";
import {
  CompareStopError,
  runSilenceWordsHaikuComparePair,
} from "./script-silence-words-haiku-compare-cell";
import {
  SILENCE_FIT_LENGTHS,
  SILENCE_FIT_OPTIONS,
  SILENCE_FIT_OPTION_LABEL,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import { VOICE_SETTINGS_PK } from "./voice-admin";
import { isSpeechifyRetryablePairError } from "./speechify-tts";
import {
  clearSilenceWordsHaikuCompareForModel,
  loadDeliveryProfileRecord,
  loadSilenceWordsHaikuComparePairs,
  saveSilenceWordsHaikuComparePair,
  silenceWordsHaikuComparePairKey,
} from "./voice-calibration-store";

/** Successful pairs, or hard failures — rate-limit errors stay open for retry. */
function pairCountsAsDone(p: {
  error?: string | null;
}): boolean {
  if (!p.error) return true;
  return !isSpeechifyRetryablePairError(p.error);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const lambda = new LambdaClient({});

const RUN_SK_PREFIX = "script-silence-words-haiku-compare-run#";

export type SilenceWordsHaikuCompareRunStatus =
  | "idle"
  | "running"
  | "stopping"
  | "paused"
  | "done"
  | "failed";

export type SilenceWordsHaikuCompareRun = {
  modelId: string;
  status: SilenceWordsHaikuCompareRunStatus;
  total: number;
  completedCount: number;
  currentKey: string | null;
  currentLabel: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
  stopRequested: boolean;
  briefCount?: number;
};

export type SilenceWordsHaikuCompareWorkerEvent = {
  worker: true;
  job: {
    kind: "silence-words-haiku-compare-tick";
    modelId: string;
    runToken: string;
  };
};

export function isSilenceWordsHaikuCompareWorkerEvent(
  event: unknown,
): event is SilenceWordsHaikuCompareWorkerEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  if (e.worker !== true || !e.job || typeof e.job !== "object") return false;
  const job = e.job as Record<string, unknown>;
  return (
    job.kind === "silence-words-haiku-compare-tick" &&
    typeof job.modelId === "string" &&
    typeof job.runToken === "string"
  );
}

function runSk(modelId: string): string {
  return `${RUN_SK_PREFIX}${coerceClaudeModel(modelId)}`;
}

function newRunToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SilenceWordsHaikuCompareWorkItem = {
  option: SilenceFitOptionId;
  minutes: number;
  briefIndex: number;
};

export function silenceWordsHaikuCompareWorkItems(
  briefCount: number,
): SilenceWordsHaikuCompareWorkItem[] {
  const n = Math.max(1, briefCount);
  const items: SilenceWordsHaikuCompareWorkItem[] = [];
  for (const option of SILENCE_FIT_OPTIONS) {
    for (const len of SILENCE_FIT_LENGTHS) {
      const minutes = Number(len);
      for (let briefIndex = 0; briefIndex < n; briefIndex++) {
        items.push({ option, minutes, briefIndex });
      }
    }
  }
  return items;
}

export async function loadSilenceWordsHaikuCompareRun(
  modelId: string,
): Promise<(SilenceWordsHaikuCompareRun & { runToken?: string }) | null> {
  const table = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!table) return null;
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: runSk(modelId) },
    }),
  );
  const item = out.Item;
  if (!item) return null;
  return {
    modelId: coerceClaudeModel(item.modelId || modelId),
    status: (item.status as SilenceWordsHaikuCompareRunStatus) || "idle",
    total: typeof item.total === "number" ? item.total : 0,
    completedCount:
      typeof item.completedCount === "number" ? item.completedCount : 0,
    currentKey: typeof item.currentKey === "string" ? item.currentKey : null,
    currentLabel:
      typeof item.currentLabel === "string" ? item.currentLabel : null,
    error: typeof item.error === "string" ? item.error : null,
    startedAt: typeof item.startedAt === "string" ? item.startedAt : null,
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : new Date().toISOString(),
    finishedAt: typeof item.finishedAt === "string" ? item.finishedAt : null,
    stopRequested: item.stopRequested === true,
    briefCount:
      typeof item.briefCount === "number" ? item.briefCount : undefined,
    ...(typeof item.runToken === "string" ? { runToken: item.runToken } : {}),
  };
}

async function saveRun(
  run: SilenceWordsHaikuCompareRun & { runToken: string },
  opts?: { requireNotStopping?: boolean },
): Promise<void> {
  const table = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!table) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk: runSk(run.modelId),
        ...run,
      },
      ...(opts?.requireNotStopping
        ? {
            ConditionExpression:
              "attribute_not_exists(stopRequested) OR stopRequested = :f",
            ExpressionAttributeValues: { ":f": false },
          }
        : {}),
    }),
  );
}

async function enqueueTick(params: {
  modelId: string;
  runToken: string;
}): Promise<void> {
  const name = process.env.AWS_LAMBDA_FUNCTION_NAME?.trim();
  if (!name) throw new Error("AWS_LAMBDA_FUNCTION_NAME is not set");
  const payload: SilenceWordsHaikuCompareWorkerEvent = {
    worker: true,
    job: {
      kind: "silence-words-haiku-compare-tick",
      modelId: coerceClaudeModel(params.modelId),
      runToken: params.runToken,
    },
  };
  await lambda.send(
    new InvokeCommand({
      FunctionName: name,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
}

export async function startSilenceWordsHaikuCompareRun(params: {
  modelId: string;
  calibrationBriefCount?: number;
  restart?: boolean;
}): Promise<SilenceWordsHaikuCompareRun> {
  const prev = await loadDeliveryProfileRecord();
  const modelId = coerceClaudeModel(
    params.modelId || prev.scriptGeneration.scriptModelId,
  );
  const briefs = activeCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    params.calibrationBriefCount ?? prev.scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  const items = silenceWordsHaikuCompareWorkItems(briefCount);
  if (params.restart) {
    await clearSilenceWordsHaikuCompareForModel(modelId);
  }
  const existing = await loadSilenceWordsHaikuComparePairs(modelId);
  const done = new Set(
    existing
      .filter((p) => p.briefIndex < briefCount && pairCountsAsDone(p))
      .map((p) =>
        silenceWordsHaikuComparePairKey({
          option: p.option,
          minutes: p.minutes,
          briefIndex: p.briefIndex,
        }),
      ),
  );
  const runToken = newRunToken();
  const run: SilenceWordsHaikuCompareRun & { runToken: string } = {
    modelId,
    status: "running",
    total: items.length,
    completedCount: done.size,
    currentKey: null,
    currentLabel: done.size
      ? `Resuming · ${done.size} of ${items.length}`
      : `Starting · 0 of ${items.length}`,
    error: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    stopRequested: false,
    briefCount,
    runToken,
  };
  await saveRun(run);
  await enqueueTick({ modelId, runToken });
  return run;
}

export async function stopSilenceWordsHaikuCompareRun(
  modelId: string,
): Promise<void> {
  const table = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!table) return;
  const id = coerceClaudeModel(modelId);
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: VOICE_SETTINGS_PK, sk: runSk(id) },
        UpdateExpression:
          "SET stopRequested = :t, #st = :stopping, updatedAt = :now, currentLabel = :label",
        ConditionExpression:
          "attribute_exists(pk) AND attribute_exists(runToken)",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":t": true,
          ":stopping": "stopping",
          ":now": new Date().toISOString(),
          ":label": "Stopping…",
        },
      }),
    );
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
    if (name === "ConditionalCheckFailedException") return;
    throw e;
  }
}

export async function processSilenceWordsHaikuCompareTick(params: {
  modelId: string;
  runToken: string;
}): Promise<void> {
  const modelId = coerceClaudeModel(params.modelId);
  const existing = await loadSilenceWordsHaikuCompareRun(modelId);
  if (!existing || existing.runToken !== params.runToken) return;
  if (existing.stopRequested || existing.status === "stopping") {
    await saveRun({
      ...existing,
      runToken: params.runToken,
      status: "paused",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentLabel: `Paused · ${existing.completedCount} of ${existing.total}`,
    });
    return;
  }

  const prev = await loadDeliveryProfileRecord();
  const briefs = activeCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    existing.briefCount ?? prev.scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  const items = silenceWordsHaikuCompareWorkItems(briefCount);
  const pairs = await loadSilenceWordsHaikuComparePairs(modelId);
  const done = new Set(
    pairs
      .filter((p) => p.briefIndex < briefCount && pairCountsAsDone(p))
      .map((p) =>
        silenceWordsHaikuComparePairKey({
          option: p.option,
          minutes: p.minutes,
          briefIndex: p.briefIndex,
        }),
      ),
  );
  const next = items.find(
    (it) =>
      !done.has(
        silenceWordsHaikuComparePairKey({
          option: it.option,
          minutes: it.minutes,
          briefIndex: it.briefIndex,
        }),
      ),
  );
  if (!next) {
    await saveRun({
      ...existing,
      runToken: params.runToken,
      status: "done",
      completedCount: items.length,
      currentKey: null,
      currentLabel: `Done · ${items.length} pairs`,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const key = silenceWordsHaikuComparePairKey(next);
  const label = `${SILENCE_FIT_OPTION_LABEL[next.option]} ${next.minutes} · brief ${next.briefIndex + 1}`;
  const beforeCell = await loadSilenceWordsHaikuCompareRun(modelId);
  if (!beforeCell || beforeCell.runToken !== params.runToken) return;
  if (beforeCell.stopRequested || beforeCell.status === "stopping") {
    await saveRun({
      ...beforeCell,
      runToken: params.runToken,
      status: "paused",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentKey: null,
      currentLabel: `Paused · ${beforeCell.completedCount} of ${beforeCell.total}`,
      stopRequested: false,
    });
    return;
  }
  try {
    await saveRun(
      {
        ...beforeCell,
        runToken: params.runToken,
        status: "running",
        completedCount: done.size,
        currentKey: key,
        currentLabel: label,
        error: null,
        updatedAt: new Date().toISOString(),
        finishedAt: null,
        briefCount,
        stopRequested: false,
      },
      { requireNotStopping: true },
    );
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
    if (name !== "ConditionalCheckFailedException") throw e;
    const stopped = await loadSilenceWordsHaikuCompareRun(modelId);
    if (stopped && stopped.runToken === params.runToken) {
      await saveRun({
        ...stopped,
        runToken: params.runToken,
        status: "paused",
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentKey: null,
        currentLabel: `Paused · ${stopped.completedCount} of ${stopped.total}`,
        stopRequested: false,
      });
    }
    return;
  }

  const brief =
    briefs[next.briefIndex] ||
    briefs[0] ||
    "I want a short practice to settle after a busy day.";
  try {
    const pair = await runSilenceWordsHaikuComparePair({
      modelId,
      option: next.option,
      minutes: next.minutes,
      briefIndex: next.briefIndex,
      brief,
      checkStop: async () => {
        const r = await loadSilenceWordsHaikuCompareRun(modelId);
        return Boolean(
          r &&
            r.runToken === params.runToken &&
            (r.stopRequested || r.status === "stopping"),
        );
      },
    });
    await saveSilenceWordsHaikuComparePair({ modelId, pair });
  } catch (e) {
    if (e instanceof CompareStopError) {
      const stopped = await loadSilenceWordsHaikuCompareRun(modelId);
      if (stopped && stopped.runToken === params.runToken) {
        await saveRun({
          ...stopped,
          runToken: params.runToken,
          status: "paused",
          finishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentKey: null,
          currentLabel: `Paused · ${stopped.completedCount} of ${stopped.total}`,
          stopRequested: false,
        });
      }
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("silence-words-haiku compare pair failed", label, msg);
    await saveSilenceWordsHaikuComparePair({
      modelId,
      pair: {
        option: next.option,
        minutes: next.minutes,
        briefIndex: next.briefIndex,
        brief,
        path: "silence_words_haiku_compare",
        sonnetMs: 0,
        scriptAsWritten: "",
        wordBudget: 0,
        stream: {
          mode: "stream",
          streamingPartial: true,
          haikuParallel: true,
          accuracy: {
            targetSeconds: 0,
            speakingBandMin: 0,
            speakingBandMax: 1,
            speechSeconds: 0,
            speechShare: 0,
            speechShareSonnet: 0,
            words: 0,
            wordBudget: 0,
            headerWordTotal: 0,
            wordsWritten: 0,
            wordsVsBudgetPct: 0,
            wordsVsBudgetSonnetPct: 0,
            effectiveWpm: 0,
            predictedSecondsBefore: 0,
            predictedSecondsAfter: 0,
            estimatedTotalAudioSeconds: 0,
            shortPauseSecondsBefore: 0,
            shortPauseSecondsAfter: 0,
            longPauseCount: 0,
            longPauseSecondsBefore: 0,
            longPauseSecondsAfter: 0,
            longestLongPauseAfter: 0,
            ordinaryPauseCount: 0,
            ordinaryPauseAverageSeconds: null,
            ordinaryPauseLongestSeconds: 0,
            extendablePauseCount: 0,
            extendablePauseTotalSeconds: 0,
            namedMarkersUsed: 0,
            extraClosingMusicSeconds: 0,
            fitStep: "none",
            outsideTolerance: true,
            why: null,
            insideSpeakingBand: false,
            lengthTolerancePct: 10,
            phases: [],
            scriptWithHeadersBefore: "",
            scriptWithHeadersAfter: "",
            haikuRan: false,
            wordsBeforeHaiku: 0,
            wordsAfterHaiku: 0,
            phasesFixed: 0,
            phasesRejected: 0,
            phaseResults: [],
            haikuUsd: 0,
            scriptAsWritten: "",
            scriptAfterHaiku: "",
          },
          scriptText: "",
          scriptAsWritten: "",
          scriptAfterHaiku: "",
          wordBudget: 0,
          haikuMs: 0,
          totalMs: 0,
          scriptMs: 0,
          ttsMs: 0,
          assembleMs: 0,
          ttsPhases: 0,
          audioBytes: 0,
          ttsVoiceId: null,
          haikuUsd: 0,
          claudeUsd: 0,
          phasesAttempted: 0,
          phasesFixed: 0,
          phasesRejected: 0,
          haikuRan: false,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            thinking_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          usages: [],
        },
        gated: {
          mode: "gated",
          streamingPartial: false,
          haikuParallel: false,
          accuracy: {
            targetSeconds: 0,
            speakingBandMin: 0,
            speakingBandMax: 1,
            speechSeconds: 0,
            speechShare: 0,
            speechShareSonnet: 0,
            words: 0,
            wordBudget: 0,
            headerWordTotal: 0,
            wordsWritten: 0,
            wordsVsBudgetPct: 0,
            wordsVsBudgetSonnetPct: 0,
            effectiveWpm: 0,
            predictedSecondsBefore: 0,
            predictedSecondsAfter: 0,
            estimatedTotalAudioSeconds: 0,
            shortPauseSecondsBefore: 0,
            shortPauseSecondsAfter: 0,
            longPauseCount: 0,
            longPauseSecondsBefore: 0,
            longPauseSecondsAfter: 0,
            longestLongPauseAfter: 0,
            ordinaryPauseCount: 0,
            ordinaryPauseAverageSeconds: null,
            ordinaryPauseLongestSeconds: 0,
            extendablePauseCount: 0,
            extendablePauseTotalSeconds: 0,
            namedMarkersUsed: 0,
            extraClosingMusicSeconds: 0,
            fitStep: "none",
            outsideTolerance: true,
            why: null,
            insideSpeakingBand: false,
            lengthTolerancePct: 10,
            phases: [],
            scriptWithHeadersBefore: "",
            scriptWithHeadersAfter: "",
            haikuRan: false,
            wordsBeforeHaiku: 0,
            wordsAfterHaiku: 0,
            phasesFixed: 0,
            phasesRejected: 0,
            phaseResults: [],
            haikuUsd: 0,
            scriptAsWritten: "",
            scriptAfterHaiku: "",
          },
          scriptText: "",
          scriptAsWritten: "",
          scriptAfterHaiku: "",
          wordBudget: 0,
          haikuMs: 0,
          totalMs: 0,
          scriptMs: 0,
          ttsMs: 0,
          assembleMs: 0,
          ttsPhases: 0,
          audioBytes: 0,
          ttsVoiceId: null,
          haikuUsd: 0,
          claudeUsd: 0,
          phasesAttempted: 0,
          phasesFixed: 0,
          phasesRejected: 0,
          haikuRan: false,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            thinking_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          usages: [],
        },
        error: msg.slice(0, 240),
      },
    });
  }

  const afterPairs = await loadSilenceWordsHaikuComparePairs(modelId);
  const completedCount = afterPairs.filter(
    (p) =>
      p.briefIndex < briefCount &&
      pairCountsAsDone(p) &&
      items.some(
        (it) =>
          it.option === p.option &&
          it.minutes === p.minutes &&
          it.briefIndex === p.briefIndex,
      ),
  ).length;
  const still = await loadSilenceWordsHaikuCompareRun(modelId);
  if (!still || still.runToken !== params.runToken) return;
  if (still.stopRequested || still.status === "stopping") {
    await saveRun({
      ...still,
      runToken: params.runToken,
      status: "paused",
      completedCount,
      currentKey: null,
      currentLabel: `Paused · ${completedCount} of ${items.length}`,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stopRequested: false,
      briefCount,
    });
    return;
  }
  if (completedCount >= items.length) {
    await saveRun({
      ...still,
      runToken: params.runToken,
      status: "done",
      completedCount: items.length,
      currentKey: null,
      currentLabel: `Done · ${items.length} pairs`,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stopRequested: false,
      briefCount,
    });
    return;
  }
  await saveRun({
    ...still,
    runToken: params.runToken,
    status: "running",
    completedCount,
    currentKey: null,
    currentLabel: `${completedCount} of ${items.length} saved`,
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    stopRequested: false,
    briefCount,
  });
  await enqueueTick({ modelId, runToken: params.runToken });
}
