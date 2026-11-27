/**
 * Admin › Pre-prompts: recent Create generations with their conformance score,
 * read from the length log (createOpenSitsVerification.conformance), plus the
 * average score per style. Read-only.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { meditationTypeForHarvesterKey } from "./preprompts/preprompt-registry";
import { requireTable } from "./preprompts/preprompt-store";
import type { ConformanceRecord } from "./script-conformance";
import { VOICE_LENGTH_PK } from "./voice-calibration-store";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type ConformanceGeneration = {
  at: string;
  jobId: string;
  style: string;
  meditationType: string;
  requestedMinutes: number | null;
  skeletonSourceId: string | null;
  prepromptVersions?: Record<string, number>;
  datasetVersions?: Record<string, number>;
  conformance: ConformanceRecord;
};

export type ConformanceStyleAverage = {
  style: string;
  meditationType: string;
  count: number;
  averageScore: number;
  /** Share of generations with no foreign phrase family. */
  noForeignShare: number;
  /** Share of expected opening + closing moves present, over all generations. */
  movesPresentShare: number | null;
};

export async function loadRecentConformance(params?: {
  days?: number;
  limit?: number;
  tableName?: string;
}): Promise<{
  generations: ConformanceGeneration[];
  byStyle: ConformanceStyleAverage[];
}> {
  const table = requireTable(params?.tableName);
  const days = Math.min(365, Math.max(1, params?.days ?? 60));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows: ConformanceGeneration[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND sk >= :since",
        ExpressionAttributeValues: { ":pk": VOICE_LENGTH_PK, ":since": since },
        ProjectionExpression: "#at, jobId, requestedMinutes, createOpenSitsVerification",
        ExpressionAttributeNames: { "#at": "at" },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      const v = item.createOpenSitsVerification as
        | {
            conformance?: ConformanceRecord;
            skeleton?: { sourceId?: string | null };
            prepromptVersions?: Record<string, number>;
            datasetVersions?: Record<string, number>;
          }
        | undefined;
      const c = v?.conformance;
      if (!c || typeof c.score !== "number") continue;
      rows.push({
        at: String(item.at ?? ""),
        jobId: String(item.jobId ?? ""),
        style: c.style,
        meditationType: meditationTypeForHarvesterKey(c.style) ?? c.style,
        requestedMinutes:
          typeof item.requestedMinutes === "number" ? item.requestedMinutes : null,
        skeletonSourceId: v?.skeleton?.sourceId ?? null,
        ...(v?.prepromptVersions ? { prepromptVersions: v.prepromptVersions } : {}),
        ...(v?.datasetVersions ? { datasetVersions: v.datasetVersions } : {}),
        conformance: c,
      });
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  const groups = new Map<string, ConformanceGeneration[]>();
  for (const r of rows) {
    groups.set(r.style, [...(groups.get(r.style) ?? []), r]);
  }
  const byStyle: ConformanceStyleAverage[] = [...groups.entries()]
    .map(([style, list]) => {
      let exp = 0;
      let got = 0;
      for (const r of list) {
        const m = r.conformance.moves;
        if (!m) continue;
        exp += m.opening.expected.length + m.closing.expected.length;
        got += m.opening.present.length + m.closing.present.length;
      }
      return {
        style,
        meditationType: list[0]!.meditationType,
        count: list.length,
        averageScore:
          Math.round((list.reduce((s, r) => s + r.conformance.score, 0) / list.length) * 10) /
          10,
        noForeignShare:
          Math.round(
            (list.filter((r) => r.conformance.foreign.families === 0).length / list.length) *
              1000,
          ) / 1000,
        movesPresentShare: exp > 0 ? Math.round((got / exp) * 1000) / 1000 : null,
      };
    })
    .sort((a, b) => a.meditationType.localeCompare(b.meditationType));

  return {
    generations: rows.slice(0, Math.max(1, params?.limit ?? 200)),
    byStyle,
  };
}
