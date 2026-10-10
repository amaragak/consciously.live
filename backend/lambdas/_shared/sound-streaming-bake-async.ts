/**
 * API Gateway (~29s) cannot wait for long AAC bakes. Enqueue a self-invoke
 * (InvocationType=Event) and let the client poll catalog `processing`.
 */

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  getSoundRow,
  putSoundRow,
  soundEnabledFromStatus,
  updateSoundProcessing,
  type SoundCatalogRow,
} from "./sound-catalog";
import { parseBgAudioKey } from "./background-audio-keys";

const lambda = new LambdaClient({});

export const STREAMING_BAKE_DETAIL_EQ = "streaming-aac-eq";
export const STREAMING_BAKE_DETAIL_TRIM = "streaming-aac-trim";
/** Mass stereo re-encode; re-applies catalog EQ/trim when present. */
export const STREAMING_BAKE_DETAIL_REBAKE = "streaming-aac-stereo-rebake";

export type StreamingBakeWorkerEvent = {
  worker: true;
  job: Record<string, unknown>;
};

export function isStreamingBakeWorkerEvent(
  event: unknown,
): event is StreamingBakeWorkerEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  return e.worker === true && e.job != null && typeof e.job === "object";
}

export async function enqueueStreamingBakeWorker(
  job: Record<string, unknown>,
): Promise<void> {
  const name = process.env.AWS_LAMBDA_FUNCTION_NAME?.trim();
  if (!name) throw new Error("AWS_LAMBDA_FUNCTION_NAME is not set");
  const payload: StreamingBakeWorkerEvent = { worker: true, job };
  await lambda.send(
    new InvokeCommand({
      FunctionName: name,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
}

/** Mark catalog row as baking before the async worker runs. */
export async function markStreamingBakeStarted(
  mp3Key: string,
  detail: string,
  existing: SoundCatalogRow | null,
): Promise<string> {
  const now = new Date().toISOString();
  const parsed = parseBgAudioKey(mp3Key);
  const base: SoundCatalogRow = existing
    ? {
        ...existing,
        enabled: soundEnabledFromStatus(existing.status),
        processing: {
          stage: "encoding",
          detail,
          updatedAt: now,
        },
        updatedAt: now,
      }
    : {
        pk: "SOUND",
        sk: mp3Key,
        name: parsed?.name ?? mp3Key,
        category: parsed?.category ?? "music",
        tags: [],
        status: "categorised",
        enabled: true,
        processing: {
          stage: "encoding",
          detail,
          updatedAt: now,
        },
        updatedAt: now,
      };
  await putSoundRow(base);
  return now;
}

export async function markStreamingBakeFailed(
  mp3Key: string,
  detail: string,
  error: string,
): Promise<void> {
  await updateSoundProcessing(mp3Key, {
    stage: "failed",
    detail,
    error: error.slice(0, 3000),
  });
}

export async function markStreamingBakeDone(
  mp3Key: string,
  detail: string,
): Promise<void> {
  // Prefer clearing via row write in the success path; this is a safety net.
  const row = await getSoundRow(mp3Key);
  if (!row) return;
  await updateSoundProcessing(mp3Key, { stage: "done", detail });
}
