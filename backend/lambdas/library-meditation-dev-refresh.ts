/**
 * Dev-only library refresh: regenerate cover art and/or re-derive title+description.
 * UI is gated by libraryDevFlyout on localhost; endpoint still requires auth + ownership.
 *
 * PATCH /library/meditations/dev-refresh
 * body: { sk: string, action: "cover" | "metadata" }
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { S3Client } from "@aws-sdk/client-s3";
import { requireUserJson } from "./_shared/consciously-auth-http";
import { updateMeditationRowFirstMatchingPartition } from "./_shared/meditation-library-update";
import {
  LEGACY_MEDITATION_PARTITION_PK,
  meditationGlobalUserPk,
  meditationUserPk,
} from "./_shared/meditation-user-pk";
import {
  createPromptFromProvenance,
  generateAndStoreMeditationCover,
} from "./_shared/meditation-cover";
import {
  deriveLibraryMetadataFromClaude,
  fallbackLibraryMetadata,
} from "./_shared/meditation-library-metadata";
import { coerceClaudeModel } from "./_shared/anthropic-pricing";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});
let cachedClaudeKey: string | undefined;

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

async function getClaudeApiKey(): Promise<string> {
  if (cachedClaudeKey) return cachedClaudeKey;
  const arn = process.env.CLAUDE_SECRET_ARN?.trim();
  if (!arn) throw new Error("CLAUDE_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Claude API key secret is empty");
  cachedClaudeKey = s;
  return cachedClaudeKey;
}

async function getMeditationRow(params: {
  tableName: string;
  partitionKeys: string[];
  sk: string;
}): Promise<Record<string, unknown> | null> {
  for (const pk of params.partitionKeys) {
    const out = await ddb.send(
      new GetCommand({
        TableName: params.tableName,
        Key: { pk, sk: params.sk },
      }),
    );
    if (out.Item && typeof out.Item.s3Key === "string" && out.Item.s3Key.trim()) {
      return out.Item as Record<string, unknown>;
    }
  }
  return null;
}

function userIdFromPk(pk: unknown): string {
  if (typeof pk !== "string") return "";
  if (pk.startsWith("USER#")) return pk.slice(5);
  return "";
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method !== "PATCH") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireUserJson(event);
  if ("statusCode" in auth) return auth;
  const sub = (auth as { sub: string }).sub;
  const partitionKeys = [
    meditationUserPk(sub),
    meditationGlobalUserPk(),
    LEGACY_MEDITATION_PARTITION_PK,
  ];

  const tableName = process.env.MEDITATION_ANALYTICS_TABLE_NAME;
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!tableName) {
    return json(500, { error: "MEDITATION_ANALYTICS_TABLE_NAME is not set" });
  }

  let body: { sk?: unknown; action?: unknown };
  try {
    body = JSON.parse(event.body ?? "{}") as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const sk = typeof body.sk === "string" ? body.sk.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!sk) return json(400, { error: "`sk` is required" });
  if (action !== "cover" && action !== "metadata") {
    return json(400, { error: '`action` must be "cover" or "metadata"' });
  }

  const row = await getMeditationRow({ tableName, partitionKeys, sk });
  if (!row) return json(404, { error: "Meditation not found" });

  const id =
    typeof row.id === "string" && row.id.trim()
      ? row.id.trim()
      : sk.includes("#")
        ? sk.slice(sk.lastIndexOf("#") + 1)
        : sk;
  const ownerId = userIdFromPk(row.pk) || sub;

  if (action === "cover") {
    if (!bucket) return json(500, { error: "MEDIA_BUCKET_NAME is not set" });
    const title =
      (typeof row.title === "string" && row.title.trim()) || "Meditation";
    const description =
      typeof row.description === "string" ? row.description.trim() : null;
    const meditationStyle =
      typeof row.meditationStyle === "string"
        ? row.meditationStyle.trim()
        : null;
    const meditationType =
      typeof row.meditationType === "string"
        ? row.meditationType.trim()
        : null;
    const createPrompt = createPromptFromProvenance(
      row.creationProvenance as Record<string, unknown> | undefined,
    );
    const coverImageKey = await generateAndStoreMeditationCover({
      s3,
      bucket,
      userId: ownerId,
      meditationId: id,
      input: {
        title,
        description,
        meditationStyle,
        meditationType,
        createPrompt,
      },
    });
    if (!coverImageKey) {
      return json(502, { error: "Cover generation failed" });
    }
    const ok = await updateMeditationRowFirstMatchingPartition({
      ddb,
      tableName,
      partitionKeys,
      sk,
      update: {
        UpdateExpression: "SET coverImageKey = :k",
        ExpressionAttributeValues: { ":k": coverImageKey },
        ConditionExpression: "attribute_exists(s3Key)",
      },
    });
    if (!ok) return json(404, { error: "Meditation not found" });
    const coverImageUrl = cfDomain
      ? `https://${cfDomain}/${coverImageKey}`
      : null;
    return json(200, { ok: true, coverImageKey, coverImageUrl });
  }

  // metadata
  const style =
    typeof row.meditationStyle === "string" ? row.meditationStyle : "";
  const styleTrimmed = style.trim();
  const journalMode =
    !styleTrimmed || styleTrimmed.toLowerCase() === "general";
  const transcript =
    typeof row.transcript === "string"
      ? row.transcript
      : typeof row.creationTranscript === "string"
        ? row.creationTranscript
        : "";
  // Prefer script on the row; fall back to empty (Claude still has create intent).
  const scriptPreview =
    typeof row.scriptText === "string" ? row.scriptText : "";
  const createIntent = createPromptFromProvenance(
    row.creationProvenance as Record<string, unknown> | undefined,
  );
  const claudeModel = coerceClaudeModel(row.claudeModel);

  let title: string;
  let description: string;
  let meditationType: string;
  try {
    const apiKey = await getClaudeApiKey();
    const derived = await deriveLibraryMetadataFromClaude({
      apiKey,
      model: claudeModel,
      meditationStyle: style,
      transcript,
      scriptPreview,
      journalMode,
      createIntent,
    });
    title = derived.title;
    description = derived.description;
    meditationType = derived.meditationType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "metadata derive failed";
    console.warn("dev metadata derive failed, using fallback", { msg });
    const fb = fallbackLibraryMetadata({
      meditationStyle: style,
      transcript,
      scriptPreview,
      journalMode,
      createIntent,
    });
    title = fb.title;
    description = fb.description;
    meditationType = fb.meditationType;
  }

  const ok = await updateMeditationRowFirstMatchingPartition({
    ddb,
    tableName,
    partitionKeys,
    sk,
    update: {
      UpdateExpression:
        "SET title = :t, description = :d, meditationType = :mt",
      ExpressionAttributeValues: {
        ":t": title,
        ":d": description,
        ":mt": meditationType,
      },
      ConditionExpression: "attribute_exists(s3Key)",
    },
  });
  if (!ok) return json(404, { error: "Meditation not found" });

  return json(200, {
    ok: true,
    title,
    description,
    meditationType,
  });
}
