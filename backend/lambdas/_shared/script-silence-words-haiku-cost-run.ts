/**
 * Server-side Silence-fit · words + Haiku cost / calibrate run (self-chaining ticks).
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
import { runSilenceWordsHaikuScriptCell } from "./script-silence-words-haiku-cost-cell";
import {
  SILENCE_FIT_LENGTHS,
  SILENCE_FIT_OPTIONS,
  SILENCE_FIT_OPTION_LABEL,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import { VOICE_SETTINGS_PK } from "./voice-admin";
import {
  clearSilenceWordsHaikuCalibrationForModel,
  loadDeliveryProfileRecord,
  loadSilenceWordsHaikuCalibrationCells,
  saveSilenceWordsHaikuCalibrationCell,
  silenceWordsHaikuCellKey,
} from "./voice-calibration-store";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const lambda = new LambdaClient({});

const RUN_SK_PREFIX = "script-silence-words-haiku-cost-run#";

export type SilenceWordsHaikuCostRunStatus =
  | "idle"
  | "running"
  | "stopping"
  | "paused"
  | "done"
  | "failed";

export type SilenceWordsHaikuCostRun = {
  modelId: string;
  status: SilenceWordsHaikuCostRunStatus;
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

export type SilenceWordsHaikuCostWorkerEvent = {
  worker: true;
  job: {
    kind: "silence-words-haiku-cost-tick";
    modelId: string;
    runToken: string;
  };
};

export function isSilenceWordsHaikuCostWorkerEvent(
  event: unknown,
): event is SilenceWordsHaikuCostWorkerEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  if (e.worker !== true || !e.job || typeof e.job !== "object") return false;
  const job = e.job as Record<string, unknown>;
  return (
    job.kind === "silence-words-haiku-cost-tick" &&
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

export type SilenceWordsHaikuWorkItem = {
  option: SilenceFitOptionId;
  minutes: number;
  briefIndex: number;
};

export function silenceWordsHaikuWorkItems(
  briefCount: number,
): SilenceWordsHaikuWorkItem[] {
  const n = Math.max(1, briefCount);
  const items: SilenceWordsHaikuWorkItem[] = [];
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

export async function loadSilenceWordsHaikuCostRun(
  modelId: string,
): Promise<(SilenceWordsHaikuCostRun & { runToken?: string }) | null> {
  const table = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!table) return null;
  const id = coerceClaudeModel(modelId);
  const res = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: runSk(id) },
    }),
  );
  const item = res.Item;
  if (!item || typeof item !== "object") return null;
  return {
    modelId: id,
    status: (item.status as SilenceWordsHaikuCostRunStatus) || "idle",
    total: Number(item.total) || 0,
    completedCount: Number(item.completedCount) || 0,
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
    runToken: typeof item.runToken === "string" ? item.runToken : undefined,
  };
}

async function saveRun(
  run: SilenceWordsHaikuCostRun & { runToken: string },
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
  const payload: SilenceWordsHaikuCostWorkerEvent = {
    worker: true,
    job: {
      kind: "silence-words-haiku-cost-tick",
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

export async function startSilenceWordsHaikuCostRun(params: {
  modelId: string;
  calibrationBriefCount?: number;
  restart?: boolean;
}): Promise<SilenceWordsHaikuCostRun> {
  const prev = await loadDeliveryProfileRecord();
  const modelId = coerceClaudeModel(
    params.modelId || prev.scriptGeneration.scriptModelId,
  );
  const briefs = activeCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    params.calibrationBriefCount ?? prev.scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  const items = silenceWordsHaikuWorkItems(briefCount);
  if (params.restart) {
    await clearSilenceWordsHaikuCalibrationForModel(modelId);
  }
  const existing = await loadSilenceWordsHaikuCalibrationCells(modelId);
  const done = new Set(
    existing
      .filter((c) => c.briefIndex < briefCount && !c.error)
      .map((c) =>
        silenceWordsHaikuCellKey({
          option: c.silenceFitOption ?? "guided",
          minutes: c.minutes,
          briefIndex: c.briefIndex,
        }),
      ),
  );
  const runToken = newRunToken();
  const run: SilenceWordsHaikuCostRun & { runToken: string } = {
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

export async function stopSilenceWordsHaikuCostRun(modelId: string): Promise<void> {
  const table = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!table) return;
  const id = coerceClaudeModel(modelId);
  // Atomic flag — do not Put the whole run (worker claim Puts were wiping stop).
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: VOICE_SETTINGS_PK, sk: runSk(id) },
        UpdateExpression:
          "SET stopRequested = :t, #st = :stopping, updatedAt = :now, currentLabel = :label",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(runToken)",
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

export async function processSilenceWordsHaikuCostTick(params: {
  modelId: string;
  runToken: string;
}): Promise<void> {
  const modelId = coerceClaudeModel(params.modelId);
  const existing = await loadSilenceWordsHaikuCostRun(modelId);
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
  const items = silenceWordsHaikuWorkItems(briefCount);
  const cells = await loadSilenceWordsHaikuCalibrationCells(modelId);
  const done = new Set(
    cells
      .filter((c) => c.briefIndex < briefCount)
      .map((c) =>
        silenceWordsHaikuCellKey({
          option: c.silenceFitOption ?? "guided",
          minutes: c.minutes,
          briefIndex: c.briefIndex,
        }),
      ),
  );
  const next = items.find(
    (it) =>
      !done.has(
        silenceWordsHaikuCellKey({
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
      currentLabel: `Done · ${items.length} cells`,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const key = silenceWordsHaikuCellKey(next);
  const label = `${SILENCE_FIT_OPTION_LABEL[next.option]} ${next.minutes} · brief ${next.briefIndex + 1}`;
  // Re-load before claiming so a concurrent Stop is not clobbered.
  const beforeCell = await loadSilenceWordsHaikuCostRun(modelId);
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
    const stopped = await loadSilenceWordsHaikuCostRun(modelId);
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

  try {
    const result = await runSilenceWordsHaikuScriptCell({
      modelId,
      option: next.option,
      minutes: next.minutes,
      briefIndex: next.briefIndex,
      brief: briefs[next.briefIndex]!,
    });
    await saveSilenceWordsHaikuCalibrationCell({ modelId, cell: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("silence-words cell failed", label, msg);
    await saveSilenceWordsHaikuCalibrationCell({
      modelId,
      cell: {
        delivery:
          next.option === "guided_casual"
            ? "casual"
            : next.option === "open_sits"
              ? "open_sits"
              : "guided",
        minutes: next.minutes,
        briefIndex: next.briefIndex,
        brief: briefs[next.briefIndex]!,
        path: "silence_words_haiku",
        silenceFitOption: next.option,
        sections: [],
        targetWords: 0,
        writtenWords: 0,
        plannedPauseSeconds: 0,
        writtenPauseSeconds: 0,
        scriptText: "",
        planMs: 0,
        writeMs: 0,
        error: msg.slice(0, 240),
      },
    });
  }

  const afterCells = await loadSilenceWordsHaikuCalibrationCells(modelId);
  const completedCount = afterCells.filter(
    (c) =>
      c.briefIndex < briefCount &&
      items.some(
        (it) =>
          it.option === (c.silenceFitOption ?? "guided") &&
          it.minutes === c.minutes &&
          it.briefIndex === c.briefIndex,
      ),
  ).length;
  const still = await loadSilenceWordsHaikuCostRun(modelId);
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
      currentLabel: `Done · ${items.length} cells`,
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
