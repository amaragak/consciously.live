/**
 * AI usage ledger — every billable provider call should record through here.
 *
 * Table layout (AI_USAGE_TABLE_NAME):
 *   pk = AI#{provider}   sk = TOTAL              → lifetime counters (ADD)
 *   pk = AI#{provider}   sk = DAY#YYYY-MM-DD    → daily counters (ADD)
 *   pk = AI#{provider}   sk = EVT#{iso}#{id}    → per-call event (TTL ~120d)
 *
 * Claude EVT fields (in addition to shared): source, reason, cache* tokens,
 * thinkingTokens, usd priced via claudeUsdFromUsage (cache write/read rates).
 *
 * Writes use TransactWriteItems (event Put + TOTAL Update + DAY Update).
 * Failures are logged and never throw — generation must not break on metering.
 */

import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  CLAUDE_HAIKU_45_MODEL_ID,
  GPT_IMAGE_1_MINI_LOW_1024_USD,
  NANO_BANANA_PRO_1K_USD,
  SPEECHIFY_USD_PER_MILLION_CHARS,
  claudeUsdFromTokens,
  fishUsdFromBillableBytes,
  type AiProviderId,
} from "./ai-provider-pricing";
import {
  claudeUsdFromUsage,
  parseAnthropicMessageUsage,
  type AnthropicMessageUsage,
} from "./anthropic-pricing";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Event retention (~4 months). */
const EVENT_TTL_SECONDS = 120 * 24 * 60 * 60;

export type AiUsageUnit = "tokens" | "bytes" | "chars" | "images";

/** Who triggered the call. */
export type AiUsageSource = "admin" | "user" | "system";

export type RecordAiUsageParams = {
  provider: AiProviderId;
  /** Vendor model id when known. */
  model?: string | null;
  /** App feature tag, e.g. meditation-tts, claude-coach, composition-cover. */
  feature: string;
  unit: AiUsageUnit;
  /** Primary quantity in `unit` (for tokens: input+output unless split fields set). */
  quantity: number;
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
  /** Override priced USD; otherwise derived from catalog rates. */
  usd?: number;
  userId?: string | null;
  /** admin | user | system */
  source?: AiUsageSource | null;
  /** Short why, e.g. script-calibration-plan, style-infer, claude-coach */
  reason?: string | null;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export type AiUsageTotals = {
  provider: AiProviderId;
  callCount: number;
  usd: number;
  quantity: number;
  inputTokens: number;
  outputTokens: number;
  updatedAt: string | null;
};

export type AiUsageEvent = {
  createdAt: string;
  provider: AiProviderId;
  feature: string;
  model: string | null;
  source: AiUsageSource | null;
  reason: string | null;
  userId: string | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  usd: number;
  unit: AiUsageUnit;
  quantity: number;
  meta: Record<string, string | number | boolean> | null;
};

function tableName(): string | null {
  const n = process.env.AI_USAGE_TABLE_NAME?.trim();
  return n || null;
}

function providerPk(provider: AiProviderId): string {
  return `AI#${provider}`;
}

function daySk(iso = new Date()): string {
  return `DAY#${iso.toISOString().slice(0, 10)}`;
}

function usdToMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * 1_000_000);
}

function microsToUsd(micros: number): number {
  if (!Number.isFinite(micros) || micros <= 0) return 0;
  return micros / 1_000_000;
}

function coerceSource(raw: unknown): AiUsageSource | null {
  return raw === "admin" || raw === "user" || raw === "system" ? raw : null;
}

export function priceAiUsageUsd(params: {
  provider: AiProviderId;
  model?: string | null;
  unit: AiUsageUnit;
  quantity: number;
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
}): number {
  const model = (params.model ?? "").trim();
  if (params.provider === "anthropic") {
    const hasCache =
      (params.cacheCreationTokens ?? 0) > 0 ||
      (params.cacheReadTokens ?? 0) > 0 ||
      (params.cacheCreation5mTokens ?? 0) > 0 ||
      (params.cacheCreation1hTokens ?? 0) > 0 ||
      (params.thinkingTokens ?? 0) > 0;
    if (hasCache) {
      return claudeUsdFromUsage(model || CLAUDE_HAIKU_45_MODEL_ID, {
        input_tokens: Math.max(0, params.inputTokens ?? 0),
        output_tokens: Math.max(0, params.outputTokens ?? 0),
        thinking_tokens: Math.max(0, params.thinkingTokens ?? 0),
        cache_creation_input_tokens: Math.max(
          0,
          params.cacheCreationTokens ?? 0,
        ),
        cache_read_input_tokens: Math.max(0, params.cacheReadTokens ?? 0),
        cache_creation_5m_input_tokens: Math.max(
          0,
          params.cacheCreation5mTokens ?? 0,
        ),
        cache_creation_1h_input_tokens: Math.max(
          0,
          params.cacheCreation1hTokens ?? 0,
        ),
      });
    }
    const inn =
      typeof params.inputTokens === "number"
        ? params.inputTokens
        : params.unit === "tokens"
          ? params.quantity
          : 0;
    const out = typeof params.outputTokens === "number" ? params.outputTokens : 0;
    return claudeUsdFromTokens(model || CLAUDE_HAIKU_45_MODEL_ID, inn, out);
  }
  if (params.provider === "fish") {
    return fishUsdFromBillableBytes(params.quantity, model || null);
  }
  if (params.provider === "speechify") {
    if (!Number.isFinite(params.quantity) || params.quantity <= 0) return 0;
    return (params.quantity / 1_000_000) * SPEECHIFY_USD_PER_MILLION_CHARS;
  }
  if (params.provider === "openai") {
    return Math.max(0, params.quantity) * GPT_IMAGE_1_MINI_LOW_1024_USD;
  }
  if (params.provider === "google") {
    return Math.max(0, params.quantity) * NANO_BANANA_PRO_1K_USD;
  }
  return 0;
}

/**
 * Record one billable AI call. Soft-fails (logs) if the table is missing or
 * DynamoDB rejects the write — never throws to callers.
 */
export async function recordAiUsage(
  params: RecordAiUsageParams,
): Promise<void> {
  try {
    const table = tableName();
    if (!table) return;

    const quantity = Math.max(0, Number(params.quantity) || 0);
    const inputTokens = Math.max(0, Number(params.inputTokens) || 0);
    const outputTokens = Math.max(0, Number(params.outputTokens) || 0);
    const thinkingTokens = Math.max(0, Number(params.thinkingTokens) || 0);
    const cacheCreationTokens = Math.max(
      0,
      Number(params.cacheCreationTokens) || 0,
    );
    const cacheReadTokens = Math.max(0, Number(params.cacheReadTokens) || 0);
    const cacheCreation5mTokens = Math.max(
      0,
      Number(params.cacheCreation5mTokens) || 0,
    );
    const cacheCreation1hTokens = Math.max(
      0,
      Number(params.cacheCreation1hTokens) || 0,
    );
    const usd =
      typeof params.usd === "number" && Number.isFinite(params.usd)
        ? Math.max(0, params.usd)
        : priceAiUsageUsd({
            provider: params.provider,
            model: params.model,
            unit: params.unit,
            quantity,
            inputTokens,
            outputTokens,
            thinkingTokens,
            cacheCreationTokens,
            cacheReadTokens,
            cacheCreation5mTokens,
            cacheCreation1hTokens,
          });
    const usdMicros = usdToMicros(usd);
    if (
      usdMicros <= 0 &&
      quantity <= 0 &&
      inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens <= 0
    ) {
      return;
    }

    const now = new Date();
    const iso = now.toISOString();
    const pk = providerPk(params.provider);
    const evtSk = `EVT#${iso}#${randomUUID()}`;
    const feature = params.feature.trim().slice(0, 80) || "unknown";
    const model = (params.model ?? "").trim().slice(0, 120) || null;
    const userId = params.userId?.trim().slice(0, 128) || null;
    const source = coerceSource(params.source);
    const reason =
      typeof params.reason === "string" && params.reason.trim()
        ? params.reason.trim().slice(0, 120)
        : null;

    const meta: Record<string, string | number | boolean> = {};
    if (params.meta) {
      for (const [k, v] of Object.entries(params.meta)) {
        if (v == null) continue;
        meta[k.slice(0, 40)] = v as string | number | boolean;
      }
    }

    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: {
                pk,
                sk: evtSk,
                provider: params.provider,
                feature,
                model,
                unit: params.unit,
                quantity,
                inputTokens,
                outputTokens,
                thinkingTokens,
                cacheCreationTokens,
                cacheReadTokens,
                cacheCreation5mTokens,
                cacheCreation1hTokens,
                usdMicros,
                userId,
                source,
                reason,
                meta: Object.keys(meta).length ? meta : undefined,
                createdAt: iso,
                ttl: Math.floor(now.getTime() / 1000) + EVENT_TTL_SECONDS,
              },
            },
          },
          {
            Update: {
              TableName: table,
              Key: { pk, sk: "TOTAL" },
              UpdateExpression:
                "ADD callCount :c, quantity :q, usdMicros :u, inputTokens :in, outputTokens :out SET updatedAt = :now, provider = if_not_exists(provider, :prov)",
              ExpressionAttributeValues: {
                ":c": 1,
                ":q": quantity,
                ":u": usdMicros,
                ":in": inputTokens,
                ":out": outputTokens,
                ":now": iso,
                ":prov": params.provider,
              },
            },
          },
          {
            Update: {
              TableName: table,
              Key: { pk, sk: daySk(now) },
              UpdateExpression:
                "ADD callCount :c, quantity :q, usdMicros :u, inputTokens :in, outputTokens :out SET updatedAt = :now, provider = if_not_exists(provider, :prov), #day = :day",
              ExpressionAttributeNames: { "#day": "day" },
              ExpressionAttributeValues: {
                ":c": 1,
                ":q": quantity,
                ":u": usdMicros,
                ":in": inputTokens,
                ":out": outputTokens,
                ":now": iso,
                ":prov": params.provider,
                ":day": iso.slice(0, 10),
              },
            },
          },
        ],
      }),
    );
  } catch (e) {
    console.warn(
      "recordAiUsage failed",
      params.provider,
      params.feature,
      e instanceof Error ? e.message : e,
    );
  }
}

/** Convenience: Anthropic Messages usage → ledger (cache-aware pricing). */
export async function recordClaudeUsage(params: {
  model: string;
  feature: string;
  source?: AiUsageSource | null;
  reason?: string | null;
  userId?: string | null;
  /** Prefer full usage when available (correct cache pricing). */
  usage?: AnthropicMessageUsage | null;
  /** Legacy path when only raw in/out are known. */
  inputTokens?: number;
  outputTokens?: number;
  meta?: RecordAiUsageParams["meta"];
}): Promise<void> {
  const u = params.usage;
  if (u) {
    const inn = Math.max(0, u.input_tokens || 0);
    const out = Math.max(0, u.output_tokens || 0);
    const cacheW = Math.max(0, u.cache_creation_input_tokens ?? 0);
    const cacheR = Math.max(0, u.cache_read_input_tokens ?? 0);
    await recordAiUsage({
      provider: "anthropic",
      model: params.model,
      feature: params.feature,
      unit: "tokens",
      quantity: inn + out + cacheW + cacheR,
      inputTokens: inn,
      outputTokens: out,
      thinkingTokens: u.thinking_tokens ?? 0,
      cacheCreationTokens: cacheW,
      cacheReadTokens: cacheR,
      cacheCreation5mTokens: u.cache_creation_5m_input_tokens ?? 0,
      cacheCreation1hTokens: u.cache_creation_1h_input_tokens ?? 0,
      usd: claudeUsdFromUsage(params.model, u),
      userId: params.userId,
      source: params.source,
      reason: params.reason,
      meta: params.meta,
    });
    return;
  }
  const inn = Math.max(0, params.inputTokens || 0);
  const out = Math.max(0, params.outputTokens || 0);
  await recordAiUsage({
    provider: "anthropic",
    model: params.model,
    feature: params.feature,
    unit: "tokens",
    quantity: inn + out,
    inputTokens: inn,
    outputTokens: out,
    userId: params.userId,
    source: params.source,
    reason: params.reason,
    meta: params.meta,
  });
}

/** Parse Anthropic `/v1/messages` JSON and record usage when present. */
export async function recordClaudeUsageFromResponseText(params: {
  responseText: string;
  model: string;
  feature: string;
  source?: AiUsageSource | null;
  reason?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    const usage = parseAnthropicMessageUsage(params.responseText);
    if (!usage) return;
    await recordClaudeUsage({
      model: params.model,
      feature: params.feature,
      source: params.source,
      reason: params.reason,
      userId: params.userId,
      usage,
    });
  } catch {
    /* ignore parse errors */
  }
}

export async function recordFishTtsUsage(params: {
  utf8Bytes: number;
  model?: string | null;
  feature: string;
  userId?: string | null;
  source?: AiUsageSource | null;
  reason?: string | null;
}): Promise<void> {
  await recordAiUsage({
    provider: "fish",
    model: params.model,
    feature: params.feature,
    unit: "bytes",
    quantity: params.utf8Bytes,
    userId: params.userId,
    source: params.source,
    reason: params.reason,
  });
}

export async function recordSpeechifyTtsUsage(params: {
  chars: number;
  model?: string | null;
  feature: string;
  userId?: string | null;
  source?: AiUsageSource | null;
  reason?: string | null;
}): Promise<void> {
  await recordAiUsage({
    provider: "speechify",
    model: params.model,
    feature: params.feature,
    unit: "chars",
    quantity: params.chars,
    userId: params.userId,
    source: params.source,
    reason: params.reason,
  });
}

export async function recordOpenAiImageUsage(params: {
  images?: number;
  model?: string | null;
  feature: string;
  userId?: string | null;
  source?: AiUsageSource | null;
  reason?: string | null;
}): Promise<void> {
  await recordAiUsage({
    provider: "openai",
    model: params.model ?? "gpt-image-2.5-flare",
    feature: params.feature,
    unit: "images",
    quantity: params.images ?? 1,
    userId: params.userId,
    source: params.source,
    reason: params.reason,
  });
}

export async function recordGoogleImageUsage(params: {
  images?: number;
  model?: string | null;
  feature: string;
  userId?: string | null;
  source?: AiUsageSource | null;
  reason?: string | null;
}): Promise<void> {
  await recordAiUsage({
    provider: "google",
    model: params.model ?? "gemini-3-pro-image",
    feature: params.feature,
    unit: "images",
    quantity: params.images ?? 1,
    userId: params.userId,
    source: params.source,
    reason: params.reason,
  });
}

function totalsFromItem(
  provider: AiProviderId,
  item: Record<string, unknown> | undefined,
): AiUsageTotals {
  return {
    provider,
    callCount: Number(item?.callCount) || 0,
    usd: microsToUsd(Number(item?.usdMicros) || 0),
    quantity: Number(item?.quantity) || 0,
    inputTokens: Number(item?.inputTokens) || 0,
    outputTokens: Number(item?.outputTokens) || 0,
    updatedAt:
      typeof item?.updatedAt === "string" ? item.updatedAt : null,
  };
}

/** O(providers) Gets — no table scans. */
export async function loadAiUsageTotals(
  providers: AiProviderId[],
): Promise<AiUsageTotals[]> {
  const table = tableName();
  if (!table) {
    return providers.map((p) => totalsFromItem(p, undefined));
  }
  const out: AiUsageTotals[] = [];
  for (const provider of providers) {
    try {
      const res = await ddb.send(
        new GetCommand({
          TableName: table,
          Key: { pk: providerPk(provider), sk: "TOTAL" },
          ConsistentRead: true,
        }),
      );
      out.push(totalsFromItem(provider, res.Item as Record<string, unknown> | undefined));
    } catch (e) {
      console.warn(
        "loadAiUsageTotals failed",
        provider,
        e instanceof Error ? e.message : e,
      );
      out.push(totalsFromItem(provider, undefined));
    }
  }
  return out;
}

function eventFromItem(item: Record<string, unknown>): AiUsageEvent | null {
  const createdAt =
    typeof item.createdAt === "string"
      ? item.createdAt
      : typeof item.sk === "string" && item.sk.startsWith("EVT#")
        ? item.sk.slice(4, 28)
        : "";
  if (!createdAt) return null;
  const provider = item.provider as AiProviderId;
  if (
    provider !== "anthropic" &&
    provider !== "fish" &&
    provider !== "speechify" &&
    provider !== "openai" &&
    provider !== "google"
  ) {
    return null;
  }
  const metaRaw = item.meta;
  const meta =
    metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
      ? (metaRaw as Record<string, string | number | boolean>)
      : null;
  return {
    createdAt,
    provider,
    feature: typeof item.feature === "string" ? item.feature : "unknown",
    model: typeof item.model === "string" ? item.model : null,
    source: coerceSource(item.source),
    reason: typeof item.reason === "string" ? item.reason : null,
    userId: typeof item.userId === "string" ? item.userId : null,
    inputTokens: Number(item.inputTokens) || 0,
    outputTokens: Number(item.outputTokens) || 0,
    thinkingTokens: Number(item.thinkingTokens) || 0,
    cacheCreationTokens: Number(item.cacheCreationTokens) || 0,
    cacheReadTokens: Number(item.cacheReadTokens) || 0,
    usd: microsToUsd(Number(item.usdMicros) || 0),
    unit: (item.unit as AiUsageUnit) || "tokens",
    quantity: Number(item.quantity) || 0,
    meta,
  };
}

/**
 * Recent per-call events for a provider on a UTC day (newest first).
 * Uses pk=AI#{provider} + sk begins_with EVT#{day}.
 */
export async function listAiUsageEvents(params: {
  provider: AiProviderId;
  /** YYYY-MM-DD UTC; default today. */
  day?: string;
  limit?: number;
}): Promise<AiUsageEvent[]> {
  const table = tableName();
  if (!table) return [];
  const day =
    params.day?.trim() || new Date().toISOString().slice(0, 10);
  const limit = Math.max(1, Math.min(500, params.limit ?? 100));
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": providerPk(params.provider),
          ":sk": `EVT#${day}`,
        },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    const out: AiUsageEvent[] = [];
    for (const raw of res.Items ?? []) {
      const ev = eventFromItem(raw as Record<string, unknown>);
      if (ev) out.push(ev);
    }
    return out;
  } catch (e) {
    console.warn(
      "listAiUsageEvents failed",
      params.provider,
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}
