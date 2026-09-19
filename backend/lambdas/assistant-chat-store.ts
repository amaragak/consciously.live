import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { optionalUserJson, requireUserJson } from "./_shared/consciously-auth-http";

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const SK_META = "META";
const threadSk = (id: string) => `THREAD#${id}`;

const MAX_REQUEST_BODY_BYTES = 6 * 1024 * 1024;
const MAX_THREAD_JSON_BYTES = 350 * 1024;
const MAX_THREADS = 40;
const MAX_TITLE_BYTES = 4096;

type UiMessage = {
  role: "user" | "assistant";
  text: string;
  actionResults?: unknown;
};

type ApiTurn = { role: "user" | "assistant"; content: string };

type Thread = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  titleManual?: boolean;
  messages: UiMessage[];
  apiThread: ApiTurn[];
  mode?: { type: "life_area_ideate"; lifeAreaId: string };
};

type StoreV1 = {
  version: 1;
  activeThreadId: string | null;
  threads: Thread[];
};

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(payload),
  };
}

function options(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    },
    body: "",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isUiMessage(x: unknown): x is UiMessage {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    (o.role === "user" || o.role === "assistant") &&
    typeof o.text === "string"
  );
}

function isApiTurn(x: unknown): x is ApiTurn {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    (o.role === "user" || o.role === "assistant") &&
    typeof o.content === "string"
  );
}

function normalizeThread(raw: unknown): Thread | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.createdAt !== "string" ||
    typeof o.updatedAt !== "string" ||
    typeof o.title !== "string"
  ) {
    return null;
  }
  const messages = Array.isArray(o.messages)
    ? o.messages.filter(isUiMessage).slice(-80)
    : [];
  const apiThread = Array.isArray(o.apiThread)
    ? o.apiThread.filter(isApiTurn).slice(-160)
    : [];
  let mode: Thread["mode"];
  if (o.mode && typeof o.mode === "object") {
    const m = o.mode as Record<string, unknown>;
    if (
      m.type === "life_area_ideate" &&
      typeof m.lifeAreaId === "string" &&
      m.lifeAreaId.trim()
    ) {
      mode = { type: "life_area_ideate", lifeAreaId: m.lifeAreaId.trim() };
    }
  }
  return {
    id: o.id.slice(0, 80),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    title: o.title.trim().slice(0, 120) || "New chat",
    ...(o.titleManual === true ? { titleManual: true } : {}),
    messages,
    apiThread,
    ...(mode ? { mode } : {}),
  };
}

function isStoreV1(x: unknown): x is StoreV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.threads)) return false;
  if (o.activeThreadId != null && typeof o.activeThreadId !== "string") {
    return false;
  }
  return true;
}

function normalizeStore(raw: unknown): StoreV1 {
  if (!isStoreV1(raw)) {
    return { version: 1, activeThreadId: null, threads: [] };
  }
  const threads = raw.threads
    .map(normalizeThread)
    .filter((t): t is Thread => Boolean(t))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, MAX_THREADS);
  let activeThreadId = raw.activeThreadId;
  if (activeThreadId && !threads.some((t) => t.id === activeThreadId)) {
    activeThreadId = threads[0]?.id ?? null;
  }
  return { version: 1, activeThreadId, threads };
}

async function queryAllKeys(
  table: string,
  ownerId: string,
): Promise<Array<{ pk: string; sk: string }>> {
  const keys: Array<{ pk: string; sk: string }> = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :p",
        ExpressionAttributeValues: { ":p": ownerId },
        ProjectionExpression: "pk, sk",
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const it of r.Items ?? []) {
      const pk = typeof it.pk === "string" ? it.pk : "";
      const sk = typeof it.sk === "string" ? it.sk : "";
      if (pk && sk) keys.push({ pk, sk });
    }
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return keys;
}

async function queryAllItems(
  table: string,
  ownerId: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :p",
        ExpressionAttributeValues: { ":p": ownerId },
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const it of r.Items ?? []) items.push(it as Record<string, unknown>);
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

type BatchOp =
  | { op: "put"; item: Record<string, unknown> }
  | { op: "del"; pk: string; sk: string };

async function batchWriteAll(table: string, ops: BatchOp[]): Promise<void> {
  const chunkSize = 25;
  for (let i = 0; i < ops.length; i += chunkSize) {
    const slice = ops.slice(i, i + chunkSize);
    let requests = slice.map((op) =>
      op.op === "del"
        ? { DeleteRequest: { Key: { pk: op.pk, sk: op.sk } } }
        : { PutRequest: { Item: op.item } },
    );
    let attempt = 0;
    while (requests.length) {
      const res = await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [table]: requests },
        }),
      );
      const un = res.UnprocessedItems?.[table];
      if (!un?.length) break;
      requests = un as typeof requests;
      attempt += 1;
      if (attempt > 12) {
        throw new Error("DynamoDB BatchWrite still has unprocessed items");
      }
      await sleep(Math.min(800, 40 * 2 ** attempt));
    }
  }
}

function ddbItemsToStore(items: Record<string, unknown>[]): StoreV1 {
  let activeThreadId: string | null = null;
  type Row = { thread: Thread; pos: number };
  const rows: Row[] = [];
  for (const item of items) {
    const sk = item.sk;
    if (sk === SK_META) {
      const ae = item.activeThreadId;
      activeThreadId =
        ae === null || typeof ae === "string" ? (ae as string | null) : null;
      continue;
    }
    if (typeof sk !== "string" || !sk.startsWith("THREAD#")) continue;
    const id =
      typeof item.id === "string" ? item.id : sk.slice("THREAD#".length);
    const thread = normalizeThread({
      id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      title: item.title,
      titleManual: item.titleManual,
      messages: item.messages,
      apiThread: item.apiThread,
      mode: item.mode,
    });
    if (!thread) continue;
    const listPosition =
      typeof item.listPosition === "number" && Number.isFinite(item.listPosition)
        ? item.listPosition
        : 1e9;
    rows.push({ pos: listPosition, thread });
  }
  rows.sort((a, b) => a.pos - b.pos);
  const threads = rows.map((r) => r.thread);
  if (activeThreadId && !threads.some((t) => t.id === activeThreadId)) {
    activeThreadId = threads[0]?.id ?? null;
  }
  return { version: 1, activeThreadId, threads };
}

function validateStoreForWrite(store: StoreV1): string | null {
  if (store.threads.length > MAX_THREADS) {
    return `Too many threads (max ${MAX_THREADS})`;
  }
  const ids = new Set<string>();
  for (const t of store.threads) {
    if (ids.has(t.id)) return `Duplicate thread id: ${t.id}`;
    ids.add(t.id);
    if (Buffer.byteLength(t.title, "utf-8") > MAX_TITLE_BYTES) {
      return `Thread ${t.id} title too long`;
    }
    const payload = JSON.stringify({
      messages: t.messages,
      apiThread: t.apiThread,
    });
    if (Buffer.byteLength(payload, "utf-8") > MAX_THREAD_JSON_BYTES) {
      return `Thread ${t.id} transcript exceeds size limit`;
    }
  }
  if (
    store.activeThreadId != null &&
    !store.threads.some((x) => x.id === store.activeThreadId)
  ) {
    return "`activeThreadId` must refer to a thread in `threads` or be null";
  }
  return null;
}

async function persistStoreToDdb(
  table: string,
  ownerId: string,
  store: StoreV1,
): Promise<void> {
  const err = validateStoreForWrite(store);
  if (err) throw new Error(err);

  const existing = await queryAllKeys(table, ownerId);
  const incomingIds = new Set(store.threads.map((t) => t.id));
  const ops: BatchOp[] = [];

  for (const { pk, sk } of existing) {
    if (sk === SK_META) continue;
    if (sk.startsWith("THREAD#")) {
      const id = sk.slice("THREAD#".length);
      if (!incomingIds.has(id)) {
        ops.push({ op: "del", pk, sk });
      }
    }
  }

  store.threads.forEach((t, listPosition) => {
    ops.push({
      op: "put",
      item: {
        pk: ownerId,
        sk: threadSk(t.id),
        id: t.id,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        title: t.title,
        messages: t.messages,
        apiThread: t.apiThread,
        listPosition,
        ...(t.titleManual ? { titleManual: true } : {}),
        ...(t.mode ? { mode: t.mode } : {}),
      },
    });
  });

  ops.push({
    op: "put",
    item: {
      pk: ownerId,
      sk: SK_META,
      activeThreadId: store.activeThreadId,
    },
  });

  await batchWriteAll(table, ops);
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return options();

  const table = process.env.ASSISTANT_CHAT_TABLE_NAME?.trim();
  if (!table) {
    return json(500, { error: "ASSISTANT_CHAT_TABLE_NAME is not set" });
  }

  if (method === "GET") {
    const user = await optionalUserJson(event);
    if (!user) return json(401, { error: "Unauthorized" });
    const ownerId = user.sub;
    try {
      const items = await queryAllItems(table, ownerId);
      const store = ddbItemsToStore(items);
      return json(200, { store: store.threads.length ? store : null });
    } catch (e) {
      console.error("assistant-chat-store GET", e);
      return json(500, { error: "Failed to load chat store" });
    }
  }

  if (method !== "PUT") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireUserJson(event);
  if ("statusCode" in auth) return auth;
  const ownerId = (auth as { sub: string }).sub;

  const bodyRaw = event.body ?? "";
  const decoded =
    event.isBase64Encoded
      ? Buffer.from(bodyRaw, "base64").toString("utf-8")
      : bodyRaw;
  if (Buffer.byteLength(decoded, "utf-8") > MAX_REQUEST_BODY_BYTES) {
    return json(413, { error: "Request body too large" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed || typeof parsed !== "object") {
    return json(400, { error: "Expected object body" });
  }
  const body = parsed as { store?: unknown };
  const store = normalizeStore(body.store);
  try {
    await persistStoreToDdb(table, ownerId, store);
    return json(200, { ok: true, store });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save chat store";
    console.error("assistant-chat-store PUT", e);
    return json(400, { error: msg });
  }
}
