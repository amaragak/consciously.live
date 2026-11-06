/**
 * Monthly server-transcription minute allowance (on-device is free / unmetered).
 * Stored on AI_USAGE_TABLE: pk=VOICE#{userId} sk=MONTH#YYYY-MM
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  isPaidPlan,
  type ConsciouslyPlan,
} from "./consciously-privileges";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

function tableName(): string | null {
  return process.env.AI_USAGE_TABLE_NAME?.trim() || null;
}

export function voiceAllowanceMinutes(plan: ConsciouslyPlan | undefined): number {
  const paidRaw = process.env.VOICE_SERVER_MINUTES_PAID?.trim();
  const freeRaw = process.env.VOICE_SERVER_MINUTES_FREE?.trim();
  const paid = paidRaw ? Number(paidRaw) : 300;
  const free = freeRaw ? Number(freeRaw) : 60;
  if (isPaidPlan(plan)) {
    return Number.isFinite(paid) && paid > 0 ? paid : 300;
  }
  return Number.isFinite(free) && free > 0 ? free : 60;
}

export function currentVoiceMonthKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `MONTH#${y}-${m}`;
}

/** ISO date of the 1st of next UTC month. */
export function nextVoiceResetIso(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const next = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  return next.toISOString();
}

export type VoiceUsageSnapshot = {
  usedMinutes: number;
  allowanceMinutes: number;
  remainingMinutes: number;
  resetsAt: string;
  month: string;
};

export async function getVoiceServerUsage(
  userId: string,
  plan: ConsciouslyPlan | undefined,
): Promise<VoiceUsageSnapshot> {
  const allowance = voiceAllowanceMinutes(plan);
  const month = currentVoiceMonthKey();
  const resetsAt = nextVoiceResetIso();
  const table = tableName();
  if (!table || !userId || userId === "guest") {
    return {
      usedMinutes: 0,
      allowanceMinutes: allowance,
      remainingMinutes: allowance,
      resetsAt,
      month: month.replace(/^MONTH#/, ""),
    };
  }
  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `VOICE#${userId}`, sk: month },
      }),
    );
    const used = Number(out.Item?.usedMinutes ?? 0);
    const usedMinutes = Number.isFinite(used) && used > 0 ? used : 0;
    return {
      usedMinutes,
      allowanceMinutes: allowance,
      remainingMinutes: Math.max(0, allowance - usedMinutes),
      resetsAt,
      month: month.replace(/^MONTH#/, ""),
    };
  } catch (e) {
    console.error("getVoiceServerUsage", e);
    return {
      usedMinutes: 0,
      allowanceMinutes: allowance,
      remainingMinutes: allowance,
      resetsAt,
      month: month.replace(/^MONTH#/, ""),
    };
  }
}

/** Add spoken minutes (ceil to 0.1). Failures are logged, not thrown. */
export async function addVoiceServerMinutes(
  userId: string,
  minutes: number,
): Promise<void> {
  const table = tableName();
  if (!table || !userId || userId === "guest") return;
  const add = Math.max(0, Math.ceil(minutes * 10) / 10);
  if (add <= 0) return;
  const month = currentVoiceMonthKey();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: `VOICE#${userId}`, sk: month },
        UpdateExpression:
          "ADD usedMinutes :m SET updatedAt = :u",
        ExpressionAttributeValues: {
          ":m": add,
          ":u": new Date().toISOString(),
        },
      }),
    );
  } catch (e) {
    console.error("addVoiceServerMinutes", e);
  }
}
