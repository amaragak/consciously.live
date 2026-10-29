/**
 * CloudFormation Provider onEvent handler: ensure DynamoDB GSIs exist one at a time.
 *
 * CloudFormation cannot create or delete more than one GSI in a single
 * UpdateTable. This handler creates missing indexes sequentially and waits for
 * each to become ACTIVE before starting the next — so a greenfield (or catch-up)
 * deploy can add several GSIs in one stack update.
 *
 * Delete is a no-op — indexes stay with the (usually RETAIN) table.
 */

import type { CloudFormationCustomResourceEvent } from "aws-lambda";
import {
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
  type AttributeDefinition,
  type GlobalSecondaryIndexUpdate,
  type KeySchemaElement,
  type ScalarAttributeType,
} from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({});

export type GsiKeyAttr = {
  name: string;
  type: ScalarAttributeType;
};

export type GsiSpec = {
  indexName: string;
  partitionKey: GsiKeyAttr;
  sortKey?: GsiKeyAttr;
  projectionType: "ALL" | "KEYS_ONLY";
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIndexes(raw: unknown): GsiSpec[] {
  if (typeof raw === "string") {
    try {
      return parseIndexes(JSON.parse(raw));
    } catch {
      throw new Error("Indexes must be a JSON array");
    }
  }
  if (!Array.isArray(raw)) {
    throw new Error("Indexes must be an array");
  }
  // Empty is valid during cutover while CDK still declares every GSI.
  if (raw.length === 0) return [];
  return raw.map((row, i) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Indexes[${i}] must be an object`);
    }
    const o = row as Record<string, unknown>;
    const indexName = typeof o.indexName === "string" ? o.indexName.trim() : "";
    if (!indexName) throw new Error(`Indexes[${i}].indexName is required`);
    const pk = o.partitionKey as Record<string, unknown> | undefined;
    const pkName = typeof pk?.name === "string" ? pk.name.trim() : "";
    const pkType = pk?.type === "S" || pk?.type === "N" || pk?.type === "B" ? pk.type : null;
    if (!pkName || !pkType) {
      throw new Error(`Indexes[${i}].partitionKey { name, type } is required`);
    }
    let sortKey: GsiKeyAttr | undefined;
    if (o.sortKey && typeof o.sortKey === "object") {
      const sk = o.sortKey as Record<string, unknown>;
      const skName = typeof sk.name === "string" ? sk.name.trim() : "";
      const skType =
        sk.type === "S" || sk.type === "N" || sk.type === "B" ? sk.type : null;
      if (!skName || !skType) {
        throw new Error(`Indexes[${i}].sortKey must include name and type`);
      }
      sortKey = { name: skName, type: skType };
    }
    const projectionType = o.projectionType === "KEYS_ONLY" ? "KEYS_ONLY" : "ALL";
    return {
      indexName,
      partitionKey: { name: pkName, type: pkType },
      ...(sortKey ? { sortKey } : {}),
      projectionType,
    };
  });
}

async function describe(tableName: string) {
  const out = await ddb.send(new DescribeTableCommand({ TableName: tableName }));
  if (!out.Table) throw new Error(`Table ${tableName} not found`);
  return out.Table;
}

/** Wait until the table is ACTIVE and no GSI is mid create/delete/update. */
async function waitTableQuiet(tableName: string): Promise<void> {
  for (let i = 0; i < 180; i += 1) {
    const table = await describe(tableName);
    const tableOk = table.TableStatus === "ACTIVE";
    const gsiBusy = (table.GlobalSecondaryIndexes ?? []).some((g) => {
      const s = g.IndexStatus;
      return s === "CREATING" || s === "DELETING" || s === "UPDATING";
    });
    if (tableOk && !gsiBusy) return;
    await sleep(10_000);
  }
  throw new Error(`Timed out waiting for ${tableName} to be quiet`);
}

async function waitIndexActive(
  tableName: string,
  indexName: string,
): Promise<void> {
  for (let i = 0; i < 180; i += 1) {
    const table = await describe(tableName);
    const gsi = (table.GlobalSecondaryIndexes ?? []).find(
      (g) => g.IndexName === indexName,
    );
    if (gsi?.IndexStatus === "ACTIVE") return;
    if (!gsi) {
      throw new Error(`Index ${indexName} missing while waiting on ${tableName}`);
    }
    await sleep(10_000);
  }
  throw new Error(`Timed out waiting for ${indexName} on ${tableName}`);
}

function keySchema(spec: GsiSpec): KeySchemaElement[] {
  const keys: KeySchemaElement[] = [
    { AttributeName: spec.partitionKey.name, KeyType: "HASH" },
  ];
  if (spec.sortKey) {
    keys.push({ AttributeName: spec.sortKey.name, KeyType: "RANGE" });
  }
  return keys;
}

function attributeDefinitions(spec: GsiSpec): AttributeDefinition[] {
  const attrs: AttributeDefinition[] = [
    {
      AttributeName: spec.partitionKey.name,
      AttributeType: spec.partitionKey.type,
    },
  ];
  if (spec.sortKey) {
    attrs.push({
      AttributeName: spec.sortKey.name,
      AttributeType: spec.sortKey.type,
    });
  }
  return attrs;
}

async function ensureIndex(tableName: string, spec: GsiSpec): Promise<void> {
  await waitTableQuiet(tableName);
  const table = await describe(tableName);
  const existing = (table.GlobalSecondaryIndexes ?? []).find(
    (g) => g.IndexName === spec.indexName,
  );
  if (existing) {
    if (existing.IndexStatus === "ACTIVE") return;
    await waitIndexActive(tableName, spec.indexName);
    return;
  }

  const update: GlobalSecondaryIndexUpdate = {
    Create: {
      IndexName: spec.indexName,
      KeySchema: keySchema(spec),
      Projection: { ProjectionType: spec.projectionType },
    },
  };

  await ddb.send(
    new UpdateTableCommand({
      TableName: tableName,
      AttributeDefinitions: attributeDefinitions(spec),
      GlobalSecondaryIndexUpdates: [update],
    }),
  );
  await waitIndexActive(tableName, spec.indexName);
}

async function ensureAll(tableName: string, indexes: GsiSpec[]): Promise<void> {
  for (const spec of indexes) {
    console.log(
      JSON.stringify({ msg: "ensure_gsi", tableName, index: spec.indexName }),
    );
    await ensureIndex(tableName, spec);
  }
}

function physicalId(tableName: string): string {
  return `ensure-gsi:${tableName}`;
}

export async function handler(
  event: CloudFormationCustomResourceEvent,
): Promise<{ PhysicalResourceId: string; Data?: Record<string, string> }> {
  const props = event.ResourceProperties as {
    TableName?: string;
    Indexes?: unknown;
  };
  const tableName = props.TableName?.trim();
  if (!tableName) throw new Error("TableName is required");
  const id =
    ("PhysicalResourceId" in event && event.PhysicalResourceId) ||
    physicalId(tableName);

  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: id };
  }

  const indexes = parseIndexes(props.Indexes);
  await ensureAll(tableName, indexes);
  return {
    PhysicalResourceId: id,
    Data: {
      TableName: tableName,
      IndexCount: String(indexes.length),
    },
  };
}
