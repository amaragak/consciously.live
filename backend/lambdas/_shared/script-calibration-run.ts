/**
 * Server-side script calibration run.
 * Client starts / stops / restarts and polls; a self-chaining Lambda tick
 * writes one cell at a time (avoids API Gateway 30s limits).
 *
 * AdminVoice must have RecursiveLoop=Allow — AWS otherwise silently drops the
 * 16th self-invoke (run sticks at 15/90 with status still "running").
 */
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { coerceClaudeModel } from "./anthropic-pricing";
import {
  applyFactorsToSettings,
  calibrationWorkItems,
  cellsForActiveBriefs,
  diversionsFromCells,
  factorsFromCalibrationCells,
  runCalibrationCell,
  type StoredCalibrationBatch,
} from "./script-calibration-batch";
import {
  activeCalibrationBriefs,
  coerceCalibrationBriefCount,
} from "./script-generation-settings";
import { VOICE_SETTINGS_PK } from "./voice-admin";
import {
  calibrationCellKey,
  loadDeliveryProfileRecord,
  loadScriptCalibrationCells,
  saveDeliveryProfileRecord,
  saveScriptCalibrationBatch,
  saveScriptCalibrationCell,
  clearScriptCalibrationForModel,
} from "./voice-calibration-store";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const lambda = new LambdaClient({});

const RUN_SK_PREFIX = "script-calibration-run#";

export type CalibrationRunStatus =
  | "idle"
  | "running"
  | "stopping"
  | "paused"
  | "finalizing"
  | "done"
  | "failed";

export type ScriptCalibrationRun = {
  modelId: string;
  status: CalibrationRunStatus;
  total: number;
  completedCount: number;
  currentKey: string | null;
  currentLabel: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
  /** When true, worker stops after the in-flight cell. */
  stopRequested: boolean;
  /** Briefs used for this run (n). Results are per-run. */
  briefCount?: number;
};

export type ScriptCalibrationWorkerEvent = {
  worker: true;
  job: {
    kind: "script-calibration-tick";
    modelId: string;
    /** Bumps when a new run starts so stale ticks exit. */
    runToken: string;
  };
};

export function isScriptCalibrationWorkerEvent(
  event: unknown,
): event is ScriptCalibrationWorkerEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  if (e.worker !== true || !e.job || typeof e.job !== "object") return false;
  const job = e.job as Record<string, unknown>;
  return (
    job.kind === "script-calibration-tick" &&
    typeof job.modelId === "string" &&
    typeof job.runToken === "string"
  );
}

function runSk(modelId: string): string {
  return `${RUN_SK_PREFIX}${coerceClaudeModel(modelId)}`;
}

export async function loadScriptCalibrationRun(
  modelId: string,
): Promise<ScriptCalibrationRun | null> {
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
    status: (item.status as CalibrationRunStatus) || "idle",
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
  };
}

async function saveRun(
  run: ScriptCalibrationRun & { runToken: string },
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

async function loadRunToken(modelId: string): Promise<string | null> {
  const table = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!table) return null;
  const res = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: runSk(coerceClaudeModel(modelId)) },
    }),
  );
  return typeof res.Item?.runToken === "string" ? res.Item.runToken : null;
}

export async function enqueueScriptCalibrationTick(params: {
  modelId: string;
  runToken: string;
}): Promise<void> {
  const name = process.env.AWS_LAMBDA_FUNCTION_NAME?.trim();
  if (!name) throw new Error("AWS_LAMBDA_FUNCTION_NAME is not set");
  const payload: ScriptCalibrationWorkerEvent = {
    worker: true,
    job: {
      kind: "script-calibration-tick",
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

function newRunToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function startScriptCalibrationRun(params: {
  modelId: string;
  /** Wipe cells and start from script 1. */
  restart: boolean;
  by?: string;
}): Promise<ScriptCalibrationRun> {
  const modelId = coerceClaudeModel(params.modelId);
  const prev = await loadDeliveryProfileRecord();
  const briefs = activeCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    prev.scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  const work = calibrationWorkItems(briefs);
  const existingRun = await loadScriptCalibrationRun(modelId);
  let cells = await loadScriptCalibrationCells(modelId);
  const activeCells = cellsForActiveBriefs(cells, briefCount);
  const doneKeys = new Set(
    activeCells.map((c) =>
      calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
    ),
  );
  const completedForWork = work.filter((w) =>
    doneKeys.has(calibrationCellKey(w.delivery, w.minutes, w.briefIndex)),
  ).length;
  const incomplete = completedForWork < work.length;
  const briefCountChanged =
    existingRun?.briefCount != null && existingRun.briefCount !== briefCount;
  const hasOrphans = cells.some((c) => c.briefIndex >= briefCount);
  // Per-run: clear when restarting, n changed, orphans from a larger n, or
  // starting a new run after the previous one finished (don't merge batches).
  const previousFinished =
    existingRun?.status === "done" ||
    existingRun?.status === "failed" ||
    existingRun?.status === "idle" ||
    !existingRun;
  const shouldClear =
    params.restart ||
    briefCountChanged ||
    hasOrphans ||
    (previousFinished && !incomplete) ||
    (previousFinished && completedForWork === 0);

  if (shouldClear) {
    await clearScriptCalibrationForModel(modelId);
    cells = [];
  }

  const cellsAfter = shouldClear
    ? []
    : cellsForActiveBriefs(
        await loadScriptCalibrationCells(modelId),
        briefCount,
      );
  const done = new Set(
    cellsAfter.map((c) =>
      calibrationCellKey(c.delivery, c.minutes, c.briefIndex),
    ),
  );
  const completedCount = work.filter((w) =>
    done.has(calibrationCellKey(w.delivery, w.minutes, w.briefIndex)),
  ).length;
  const now = new Date().toISOString();
  const runToken = newRunToken();

  if (completedCount >= work.length && work.length > 0) {
    // All cells present — finalize only.
    const run: ScriptCalibrationRun & { runToken: string } = {
      modelId,
      runToken,
      status: "finalizing",
      total: work.length,
      completedCount,
      currentKey: null,
      currentLabel: "Finalizing factors…",
      error: null,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      stopRequested: false,
      briefCount,
    };
    await saveRun(run);
    await enqueueScriptCalibrationTick({ modelId, runToken });
    return run;
  }

  const run: ScriptCalibrationRun & { runToken: string } = {
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
  await enqueueScriptCalibrationTick({ modelId, runToken });
  return run;
}

export async function stopScriptCalibrationRun(
  modelId: string,
): Promise<ScriptCalibrationRun | null> {
  const id = coerceClaudeModel(modelId);
  const existing = await loadScriptCalibrationRun(id);
  if (!existing) return null;
  if (existing.status !== "running" && existing.status !== "finalizing") {
    return existing;
  }
  const token = (await loadRunToken(id)) || newRunToken();
  const now = new Date().toISOString();
  const run: ScriptCalibrationRun & { runToken: string } = {
    ...existing,
    runToken: token,
    status: "stopping",
    stopRequested: true,
    updatedAt: now,
    currentLabel: "Stop requested — finishing current script…",
  };
  await saveRun(run);
  return run;
}

async function finalizeCalibrationRun(params: {
  modelId: string;
  by: string;
}): Promise<{
  diversions: ReturnType<typeof diversionsFromCells>;
  failures: Array<{ error: string }>;
  ranAt: string;
}> {
  const modelId = coerceClaudeModel(params.modelId);
  const prev = await loadDeliveryProfileRecord();
  const briefs = activeCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    prev.scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  const cells = cellsForActiveBriefs(
    await loadScriptCalibrationCells(modelId),
    briefCount,
  );
  if (!cells.length) throw new Error("No calibration cells to finalize");
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
    briefCount,
    briefs,
    medianWpm: 138.7 * 0.8,
    cells,
    factors,
    failures,
    diversions,
  };
  await saveScriptCalibrationBatch(batch);
  const scriptGeneration = applyFactorsToSettings(
    { ...prev.scriptGeneration, scriptModelId: modelId },
    modelId,
    factors,
  );
  await saveDeliveryProfileRecord({
    profiles: prev.profiles,
    scriptGeneration,
    by: params.by,
    note: `Calibration batch ${modelId}: ${cells.length - failures.length}/${cells.length} scripts · ${diversions.length} brief diversions`,
  });
  return { diversions, failures, ranAt };
}

/**
 * One tick: write the next missing cell (or finalize), then chain another tick.
 */
export async function processScriptCalibrationTick(params: {
  modelId: string;
  runToken: string;
}): Promise<void> {
  const modelId = coerceClaudeModel(params.modelId);
  const tokenNow = await loadRunToken(modelId);
  if (!tokenNow || tokenNow !== params.runToken) {
    console.log("calibration tick stale — exit", {
      modelId,
      expected: params.runToken,
      actual: tokenNow,
    });
    return;
  }
  const run = await loadScriptCalibrationRun(modelId);
  if (!run) return;

  if (run.stopRequested && run.status !== "finalizing") {
    const now = new Date().toISOString();
    await saveRun({
      ...run,
      runToken: params.runToken,
      status: "paused",
      stopRequested: false,
      updatedAt: now,
      currentLabel: `Paused · ${run.completedCount} of ${run.total} saved`,
      currentKey: null,
    });
    return;
  }

  const prev = await loadDeliveryProfileRecord();
  const briefs = activeCalibrationBriefs(prev.scriptGeneration);
  const briefCount = coerceCalibrationBriefCount(
    run.briefCount ?? prev.scriptGeneration.calibrationBriefCount,
    briefs.length,
  );
  const work = calibrationWorkItems(briefs.slice(0, briefCount));
  const cells = cellsForActiveBriefs(
    await loadScriptCalibrationCells(modelId),
    briefCount,
  );
  const done = new Set(
    cells.map((c) => calibrationCellKey(c.delivery, c.minutes, c.briefIndex)),
  );
  const next = work.find(
    (w) => !done.has(calibrationCellKey(w.delivery, w.minutes, w.briefIndex)),
  );

  if (!next) {
    // Finalize
    try {
      await saveRun({
        ...run,
        runToken: params.runToken,
        status: "finalizing",
        completedCount: work.length,
        currentKey: null,
        currentLabel: "Saving factors…",
        updatedAt: new Date().toISOString(),
        stopRequested: false,
      });
      const finalized = await finalizeCalibrationRun({
        modelId,
        by: "calibration-worker",
      });
      const now = new Date().toISOString();
      await saveRun({
        ...run,
        runToken: params.runToken,
        status: "done",
        completedCount: work.length,
        currentKey: null,
        currentLabel: `Done · ${finalized.failures.length} failed · ${finalized.diversions.length} diversion(s)`,
        error: null,
        updatedAt: now,
        finishedAt: now,
        stopRequested: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Finalize failed";
      console.error("calibration finalize", msg);
      await saveRun({
        ...run,
        runToken: params.runToken,
        status: "failed",
        error: msg,
        updatedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        currentLabel: msg,
        stopRequested: false,
      });
    }
    return;
  }

  const key = calibrationCellKey(next.delivery, next.minutes, next.briefIndex);
  const label = `${next.delivery} · ${next.minutes} min · brief ${next.briefIndex + 1}`;
  await saveRun({
    ...run,
    runToken: params.runToken,
    status: "running",
    completedCount: done.size,
    currentKey: key,
    currentLabel: label,
    updatedAt: new Date().toISOString(),
    error: null,
  });

  try {
    const result = await runCalibrationCell({
      modelId,
      delivery: next.delivery,
      minutes: next.minutes,
      briefIndex: next.briefIndex,
      brief: next.brief,
      styleInferModelId: prev.scriptGeneration.styleInferModelId,
    });
    await saveScriptCalibrationCell({
      modelId,
      cell: result,
      runId: params.runToken,
    });
    done.add(key);
    const completedCount = done.size;
    // Re-check stop / token before chaining.
    const tokenAfter = await loadRunToken(modelId);
    if (tokenAfter !== params.runToken) return;
    const runAfter = await loadScriptCalibrationRun(modelId);
    if (runAfter?.stopRequested) {
      await saveRun({
        ...(runAfter ?? run),
        runToken: params.runToken,
        status: "paused",
        completedCount,
        currentKey: null,
        currentLabel: `Paused · ${completedCount} of ${work.length} saved`,
        updatedAt: new Date().toISOString(),
        stopRequested: false,
      });
      return;
    }
    await saveRun({
      ...run,
      runToken: params.runToken,
      status: "running",
      completedCount,
      currentKey: null,
      currentLabel: `${completedCount} of ${work.length} saved`,
      updatedAt: new Date().toISOString(),
      stopRequested: false,
    });
    await enqueueScriptCalibrationTick({
      modelId,
      runToken: params.runToken,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cell failed";
    console.error("calibration cell tick", { key, msg });
    // Soft-fail: mark run failed but keep cells; client can resume.
    await saveRun({
      ...run,
      runToken: params.runToken,
      status: "failed",
      error: msg,
      currentKey: key,
      currentLabel: `Failed on ${label}: ${msg}`,
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      completedCount: done.size,
      stopRequested: false,
    });
  }
}

/** Optional cleanup when clearing a model batch. */
export async function deleteScriptCalibrationRun(
  modelId: string,
): Promise<void> {
  const table = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!table) return;
  await ddb.send(
    new DeleteCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: runSk(coerceClaudeModel(modelId)) },
    }),
  );
}
