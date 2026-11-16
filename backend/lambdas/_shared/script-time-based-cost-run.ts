/**
 * Server-side time-based cost run.
 * Client starts / stops / polls; a self-chaining Lambda tick writes one cell
 * at a time (avoids API Gateway ~29s limits on long Claude writes).
 */
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { coerceClaudeModel } from "./anthropic-pricing";
import { singleCallWorkItems } from "./script-single-call-compare";
import { runTimeBasedScriptCell } from "./script-time-based-cost-cell";
import {
  activeCalibrationBriefs,
  coerceCalibrationBriefCount,
  singleCallCalibrationBriefs,
} from "./script-generation-settings";
import { refreshTimeWordsPerSentenceFromCells } from "./script-time-words-per-sentence";
import { VOICE_SETTINGS_PK } from "./voice-admin";
import {
  calibrationCellKey,
  clearTimeBasedCalibrationForModel,
  loadDeliveryProfileRecord,
  loadTimeBasedCalibrationCells,
  saveTimeBasedCalibrationCell,
} from "./voice-calibration-store";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const lambda = new LambdaClient({});

const RUN_SK_PREFIX = "script-time-cost-run#";

export type TimeCostRunStatus =
  | "idle"
  | "running"
  | "stopping"
  | "paused"
  | "done"
  | "failed";

export type TimeBasedCostRun = {
  modelId: string;
  status: TimeCostRunStatus;
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

export type TimeBasedCostWorkerEvent = {
  worker: true;
  job: {
    kind: "time-based-cost-tick";
    modelId: string;
    runToken: string;
  };
};

export function isTimeBasedCostWorkerEvent(
  event: unknown,
): event is TimeBasedCostWorkerEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  if (e.worker !== true || !e.job || typeof e.job !== "object") return false;
  const job = e.job as Record<string, unknown>;
  return (
    job.kind === "time-based-cost-tick" &&
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

export async function loadTimeBasedCostRun(
  modelId: string,
): Promise<(TimeBasedCostRun & { runToken?: string }) | null> {
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
    status: (item.status as TimeCostRunStatus) || "idle",
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
  run: TimeBasedCostRun & { runToken: string },
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
    }),
  );
}

async function enqueueTick(params: {
  modelId: string;
  runToken: string;
}): Promise<void> {
  const name = process.env.AWS_LAMBDA_FUNCTION_NAME?.trim();
  if (!name) throw new Error("AWS_LAMBDA_FUNCTION_NAME is not set");
  const payload: TimeBasedCostWorkerEvent = {
    worker: true,
    job: {
      kind: "time-based-cost-tick",
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

export async function startTimeBasedCostRun(params: {
  modelId: string;
  restart?: boolean;
}): Promise<TimeBasedCostRun> {
  const modelId = coerceClaudeModel(params.modelId);
  const prev = await loadDeliveryProfileRecord();
  const briefs = singleCallCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    prev.scriptGeneration.calibrationBriefCount,
    activeCalibrationBriefs(prev.scriptGeneration).length,
  );
  const work = singleCallWorkItems(briefs);
  const restart = params.restart !== false;

  if (restart) {
    await clearTimeBasedCalibrationForModel(modelId);
  }

  const cells = restart
    ? []
    : (await loadTimeBasedCalibrationCells(modelId)).filter(
        (c) => c.briefIndex < briefCount,
      );
  const done = new Set(
    cells.map((c) =>
      calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
    ),
  );
  const completedCount = work.filter((w) =>
    done.has(calibrationCellKey(w.delivery, w.minutes, w.briefIndex)),
  ).length;
  const now = new Date().toISOString();
  const runToken = newRunToken();

  if (completedCount >= work.length && work.length > 0) {
    const run: TimeBasedCostRun & { runToken: string } = {
      modelId,
      runToken,
      status: "done",
      total: work.length,
      completedCount,
      currentKey: null,
      currentLabel: `Done · ${completedCount} cells`,
      error: null,
      startedAt: now,
      updatedAt: now,
      finishedAt: now,
      stopRequested: false,
      briefCount,
    };
    await saveRun(run);
    return run;
  }

  const run: TimeBasedCostRun & { runToken: string } = {
    modelId,
    runToken,
    status: "running",
    total: work.length,
    completedCount,
    currentKey: null,
    currentLabel:
      completedCount > 0
        ? `Resuming · ${completedCount} of ${work.length} (n=${briefCount})`
        : `Starting · 0 of ${work.length} (n=${briefCount} briefs)`,
    error: null,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    stopRequested: false,
    briefCount,
  };
  await saveRun(run);
  await enqueueTick({ modelId, runToken });
  return run;
}

export async function stopTimeBasedCostRun(
  modelId: string,
): Promise<TimeBasedCostRun | null> {
  const existing = await loadTimeBasedCostRun(modelId);
  if (!existing) return null;
  if (existing.status !== "running") return existing;
  const token = existing.runToken || newRunToken();
  const now = new Date().toISOString();
  const run: TimeBasedCostRun & { runToken: string } = {
    modelId: existing.modelId,
    runToken: token,
    status: "stopping",
    total: existing.total,
    completedCount: existing.completedCount,
    currentKey: existing.currentKey,
    currentLabel: "Stop requested — finishing current cell…",
    error: null,
    startedAt: existing.startedAt,
    updatedAt: now,
    finishedAt: null,
    stopRequested: true,
    briefCount: existing.briefCount,
  };
  await saveRun(run);
  return run;
}

export async function processTimeBasedCostTick(params: {
  modelId: string;
  runToken: string;
}): Promise<void> {
  const modelId = coerceClaudeModel(params.modelId);
  const existing = await loadTimeBasedCostRun(modelId);
  if (!existing || existing.runToken !== params.runToken) {
    console.log("time-cost tick stale — exit", {
      modelId,
      expected: params.runToken,
      actual: existing?.runToken,
    });
    return;
  }

  if (existing.stopRequested) {
    const now = new Date().toISOString();
    await saveRun({
      modelId,
      runToken: params.runToken,
      status: "paused",
      total: existing.total,
      completedCount: existing.completedCount,
      currentKey: null,
      currentLabel: `Paused · ${existing.completedCount} of ${existing.total}`,
      error: null,
      startedAt: existing.startedAt,
      updatedAt: now,
      finishedAt: null,
      stopRequested: false,
      briefCount: existing.briefCount,
    });
    return;
  }

  const prev = await loadDeliveryProfileRecord();
  const briefs = singleCallCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    existing.briefCount ?? prev.scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  const work = singleCallWorkItems(briefs.slice(0, briefCount));
  const cells = (await loadTimeBasedCalibrationCells(modelId)).filter(
    (c) => c.briefIndex < briefCount,
  );
  const done = new Set(
    cells.map((c) => calibrationCellKey(c.delivery, c.minutes, c.briefIndex)),
  );
  const next = work.find(
    (w) => !done.has(calibrationCellKey(w.delivery, w.minutes, w.briefIndex)),
  );

  if (!next) {
    const now = new Date().toISOString();
    await saveRun({
      modelId,
      runToken: params.runToken,
      status: "done",
      total: work.length,
      completedCount: work.length,
      currentKey: null,
      currentLabel: `Done · ${work.length} cells`,
      error: null,
      startedAt: existing.startedAt,
      updatedAt: now,
      finishedAt: now,
      stopRequested: false,
      briefCount,
    });
    return;
  }

  const key = calibrationCellKey(next.delivery, next.minutes, next.briefIndex);
  const label = `${next.delivery} · ${next.minutes} min · brief ${next.briefIndex + 1}`;
  await saveRun({
    modelId,
    runToken: params.runToken,
    status: "running",
    total: work.length,
    completedCount: done.size,
    currentKey: key,
    currentLabel: label,
    error: null,
    startedAt: existing.startedAt,
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    stopRequested: false,
    briefCount,
  });

  try {
    const result = await runTimeBasedScriptCell({
      modelId,
      delivery: next.delivery,
      minutes: next.minutes,
      briefIndex: next.briefIndex,
      brief: briefs[next.briefIndex]!,
      trimModelId: prev.scriptGeneration.styleInferModelId,
    });
    await saveTimeBasedCalibrationCell({ modelId, cell: result });
    try {
      await refreshTimeWordsPerSentenceFromCells(modelId);
    } catch (e) {
      console.warn("time WPS refresh failed", e);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("time-cost cell failed", label, msg);
    // Persist an error cell so the run can advance.
    await saveTimeBasedCalibrationCell({
      modelId,
      cell: {
        delivery: next.delivery,
        minutes: next.minutes,
        briefIndex: next.briefIndex,
        brief: briefs[next.briefIndex]!,
        path: "time",
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

  const after = (await loadTimeBasedCalibrationCells(modelId)).filter(
    (c) => c.briefIndex < briefCount,
  );
  const completedCount = after.filter((c) =>
    work.some(
      (w) =>
        w.delivery === c.delivery &&
        w.minutes === c.minutes &&
        w.briefIndex === c.briefIndex,
    ),
  ).length;

  const still = await loadTimeBasedCostRun(modelId);
  if (!still || still.runToken !== params.runToken) return;

  if (still.stopRequested) {
    const now = new Date().toISOString();
    await saveRun({
      modelId,
      runToken: params.runToken,
      status: "paused",
      total: work.length,
      completedCount,
      currentKey: null,
      currentLabel: `Paused · ${completedCount} of ${work.length}`,
      error: null,
      startedAt: existing.startedAt,
      updatedAt: now,
      finishedAt: null,
      stopRequested: false,
      briefCount,
    });
    return;
  }

  if (completedCount >= work.length) {
    const now = new Date().toISOString();
    await saveRun({
      modelId,
      runToken: params.runToken,
      status: "done",
      total: work.length,
      completedCount,
      currentKey: null,
      currentLabel: `Done · ${completedCount} cells`,
      error: null,
      startedAt: existing.startedAt,
      updatedAt: now,
      finishedAt: now,
      stopRequested: false,
      briefCount,
    });
    return;
  }

  await saveRun({
    modelId,
    runToken: params.runToken,
    status: "running",
    total: work.length,
    completedCount,
    currentKey: null,
    currentLabel: `${completedCount} of ${work.length} saved`,
    error: null,
    startedAt: existing.startedAt,
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    stopRequested: false,
    briefCount,
  });
  await enqueueTick({ modelId, runToken: params.runToken });
}
