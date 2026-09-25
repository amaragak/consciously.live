import { randomUUID } from "crypto";
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { coerceMeditationTargetMinutes } from "./meditation-target-minutes";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const PROGRAM_PK = "PROGRAM";

export type ProgramDayStatus = "draft" | "generating" | "ready" | "failed";

export type ProgramDay = {
  id: string;
  /** 1-based order within the program. */
  dayNumber: number;
  title: string;
  /** One-shot prompt used to generate the script. */
  prompt: string;
  /** Optional listener-facing blurb; LLM-filled when short/empty at generate time. */
  description: string;
  /**
   * Details the By Program create chat should gather to customise this session
   * (admin-authored intake outline for the coach).
   */
  customizationIntake: string;
  speakerModelId: string;
  /** Composition / soundscape streaming key (music slot alone). */
  compositionKey: string;
  targetMinutes: number;
  status: ProgramDayStatus;
  jobId: string | null;
  audioUrl: string | null;
  audioKey: string | null;
  /** Measured MP3 length when audio was generated. */
  durationSeconds: number | null;
  errorMessage: string | null;
  generatedAt: string | null;
  /** Snapshot of inputs used for the last successful audio (staleness). */
  generatedPrompt: string | null;
  generatedSpeakerModelId: string | null;
  generatedTargetMinutes: number | null;
  /** Cover art S3 key (under media bucket). */
  coverImageKey: string | null;
  /** CloudFront URL for cover art. */
  coverImageUrl: string | null;
};

export type ProgramPublic = {
  id: string;
  title: string;
  description: string;
  /** When true, eligible for the Library Programs shelf. */
  published: boolean;
  /** Fish speaker for every lesson in this program. */
  speakerModelId: string;
  sort: number;
  days: ProgramDay[];
  createdAt: string;
  updatedAt: string;
  coverImageKey: string | null;
  coverImageUrl: string | null;
};

type ProgramRow = ProgramPublic & {
  pk: typeof PROGRAM_PK;
  sk: string;
};

function tableName(): string {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!n) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  return n;
}

function coerceStatus(raw: unknown): ProgramDayStatus {
  if (raw === "generating" || raw === "ready" || raw === "failed") return raw;
  return "draft";
}

function coerceCoverKey(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function coerceCoverUrl(raw: unknown, key: string | null): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (!key) return null;
  const cf = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  return cf ? `https://${cf}/${key}` : null;
}

function coerceDay(raw: unknown, fallbackIndex: number): ProgramDay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id =
    (typeof o.id === "string" && o.id.trim()) ||
    `day-${randomUUID().slice(0, 8)}`;
  const dayNumber =
    typeof o.dayNumber === "number" && Number.isFinite(o.dayNumber)
      ? Math.max(1, Math.floor(o.dayNumber))
      : fallbackIndex + 1;
  const coverImageKey = coerceCoverKey(o.coverImageKey);
  return {
    id,
    dayNumber,
    title:
      typeof o.title === "string" && o.title.trim()
        ? o.title.trim().slice(0, 120)
        : `Day ${dayNumber}`,
    prompt: typeof o.prompt === "string" ? o.prompt.trim().slice(0, 4000) : "",
    description:
      typeof o.description === "string"
        ? o.description.trim().slice(0, 600)
        : "",
    customizationIntake:
      typeof o.customizationIntake === "string"
        ? o.customizationIntake.trim().slice(0, 4000)
        : "",
    speakerModelId:
      typeof o.speakerModelId === "string" ? o.speakerModelId.trim() : "",
    compositionKey:
      typeof o.compositionKey === "string" ? o.compositionKey.trim() : "",
    targetMinutes: coerceMeditationTargetMinutes(o.targetMinutes),
    status: coerceStatus(o.status),
    jobId: typeof o.jobId === "string" && o.jobId.trim() ? o.jobId.trim() : null,
    audioUrl:
      typeof o.audioUrl === "string" && o.audioUrl.trim()
        ? o.audioUrl.trim()
        : null,
    audioKey:
      typeof o.audioKey === "string" && o.audioKey.trim()
        ? o.audioKey.trim()
        : null,
    durationSeconds:
      typeof o.durationSeconds === "number" &&
      Number.isFinite(o.durationSeconds) &&
      o.durationSeconds > 0
        ? o.durationSeconds
        : null,
    errorMessage:
      typeof o.errorMessage === "string" && o.errorMessage.trim()
        ? o.errorMessage.trim().slice(0, 500)
        : null,
    generatedAt:
      typeof o.generatedAt === "string" && o.generatedAt.trim()
        ? o.generatedAt.trim()
        : null,
    generatedPrompt:
      typeof o.generatedPrompt === "string" ? o.generatedPrompt : null,
    generatedSpeakerModelId:
      typeof o.generatedSpeakerModelId === "string" &&
      o.generatedSpeakerModelId.trim()
        ? o.generatedSpeakerModelId.trim()
        : null,
    generatedTargetMinutes:
      typeof o.generatedTargetMinutes === "number" &&
      Number.isFinite(o.generatedTargetMinutes)
        ? coerceMeditationTargetMinutes(o.generatedTargetMinutes)
        : null,
    coverImageKey,
    coverImageUrl: coerceCoverUrl(o.coverImageUrl, coverImageKey),
  };
}

export function normalizeProgram(raw: unknown): ProgramPublic | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id =
    (typeof o.id === "string" && o.id.trim()) ||
    (typeof o.sk === "string" && o.sk.trim()) ||
    "";
  if (!id) return null;
  const daysRaw = Array.isArray(o.days) ? o.days : [];
  const days = daysRaw
    .map((d, i) => coerceDay(d, i))
    .filter((d): d is ProgramDay => Boolean(d))
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d, i) => ({ ...d, dayNumber: i + 1 }));
  const createdAt =
    typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString();
  const updatedAt =
    typeof o.updatedAt === "string" ? o.updatedAt : createdAt;
  const sort =
    typeof o.sort === "number" && Number.isFinite(o.sort) ? o.sort : 0;
  let speakerModelId =
    typeof o.speakerModelId === "string" ? o.speakerModelId.trim() : "";
  // Legacy: older programs only stored speaker per day.
  if (!speakerModelId) {
    for (const d of days) {
      if (d.speakerModelId.trim()) {
        speakerModelId = d.speakerModelId.trim();
        break;
      }
    }
  }
  const coverImageKey = coerceCoverKey(o.coverImageKey);
  return {
    id,
    title:
      typeof o.title === "string" && o.title.trim()
        ? o.title.trim().slice(0, 120)
        : "Untitled program",
    description:
      typeof o.description === "string"
        ? o.description.trim().slice(0, 500)
        : "",
    published: o.published === true,
    speakerModelId,
    sort,
    days: days.map((d) =>
      speakerModelId ? { ...d, speakerModelId } : d,
    ),
    createdAt,
    updatedAt,
    coverImageKey,
    coverImageUrl: coerceCoverUrl(o.coverImageUrl, coverImageKey),
  };
}

export async function listPrograms(): Promise<ProgramPublic[]> {
  const items: ProgramPublic[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": PROGRAM_PK },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const row of out.Items ?? []) {
      const p = normalizeProgram(row);
      if (p) items.push(p);
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  items.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  return items;
}

/** Shelf-facing day: ready audio only, no prompt / generation internals. */
export type LibraryProgramDay = {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  /** Details By Program chat should gather to customise this session. */
  customizationIntake: string;
  targetMinutes: number;
  /** Measured voice-stem length; prefer over targetMinutes for display. */
  durationSeconds: number | null;
  audioUrl: string;
  audioKey: string;
  /** Music / composition bed mixed live under the voice stem. */
  backgroundMusicKey: string;
  coverImageUrl: string | null;
};

export type LibraryProgram = {
  id: string;
  title: string;
  description: string;
  sort: number;
  days: LibraryProgramDay[];
  coverImageUrl: string | null;
};

export function toLibraryProgram(p: ProgramPublic): LibraryProgram | null {
  if (!p.published) return null;
  const days: LibraryProgramDay[] = p.days
    .filter(
      (d) =>
        d.status === "ready" &&
        typeof d.audioUrl === "string" &&
        d.audioUrl.trim() &&
        typeof d.audioKey === "string" &&
        d.audioKey.trim(),
    )
    .map((d) => ({
      id: d.id,
      dayNumber: d.dayNumber,
      title: d.title,
      description: d.description,
      customizationIntake: d.customizationIntake,
      targetMinutes: d.targetMinutes,
      durationSeconds: d.durationSeconds,
      audioUrl: d.audioUrl!.trim(),
      audioKey: d.audioKey!.trim(),
      backgroundMusicKey: d.compositionKey.trim(),
      coverImageUrl: d.coverImageUrl,
    }))
    .sort((a, b) => a.dayNumber - b.dayNumber);

  // First lesson titled "Introduction" reuses the program cover.
  const programCover = p.coverImageUrl?.trim() || null;
  if (programCover && days[0]?.title.trim().toLowerCase() === "introduction") {
    days[0] = { ...days[0], coverImageUrl: programCover };
  }

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    sort: p.sort,
    days,
    coverImageUrl: p.coverImageUrl,
  };
}

export async function listPublishedLibraryPrograms(): Promise<LibraryProgram[]> {
  const all = await listPrograms();
  return all
    .map(toLibraryProgram)
    .filter((p): p is LibraryProgram => Boolean(p));
}

/** S3 keys owned by any program day — keep these off My Creations. */
export async function listProgramOwnedAudioKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const programs = await listPrograms();
  for (const p of programs) {
    for (const d of p.days) {
      const k = d.audioKey?.trim();
      if (k) keys.add(k);
    }
  }
  return keys;
}

export async function getProgram(id: string): Promise<ProgramPublic | null> {
  const sk = id.trim();
  if (!sk) return null;
  const out = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: PROGRAM_PK, sk },
    }),
  );
  return normalizeProgram(out.Item);
}

export async function putProgram(
  input: unknown,
  opts?: {
    /** Fail if the stored `updatedAt` does not match (optimistic lock). */
    expectedUpdatedAt?: string;
    /**
     * Cover slots that may be written as null. Keys are day ids, or "" for the
     * program-level cover. Without this, incoming null/empty never wipes an
     * existing cover — required for concurrent lesson cover generation.
     */
    allowClearCoverKeys?: ReadonlySet<string>;
  },
): Promise<ProgramPublic> {
  const existingId =
    input && typeof input === "object" && typeof (input as { id?: unknown }).id === "string"
      ? (input as { id: string }).id.trim()
      : "";
  const existing = existingId ? await getProgram(existingId) : null;
  const now = new Date().toISOString();
  const mergedInput =
    typeof input === "object" && input
      ? { ...(input as Record<string, unknown>) }
      : {};
  const allowClear = opts?.allowClearCoverKeys;

  const mergeCover = (
    slotKey: string,
    prevKey: string | null,
    prevUrl: string | null,
    hasKey: boolean,
    hasUrl: boolean,
    incomingKey: unknown,
    incomingUrl: unknown,
  ): { coverImageKey: string | null; coverImageUrl: string | null } => {
    if (!hasKey && !hasUrl) {
      return { coverImageKey: prevKey, coverImageUrl: prevUrl };
    }
    const nextKeyRaw = hasKey ? incomingKey : prevKey;
    const nextUrlRaw = hasUrl ? incomingUrl : prevUrl;
    const nextKey =
      typeof nextKeyRaw === "string" && nextKeyRaw.trim()
        ? nextKeyRaw.trim()
        : null;
    const nextUrl =
      typeof nextUrlRaw === "string" && nextUrlRaw.trim()
        ? nextUrlRaw.trim()
        : null;
    const clearing = nextKey == null;
    if (clearing && prevKey && !allowClear?.has(slotKey)) {
      // Stale concurrent puts often re-send null for other lessons — keep theirs.
      return { coverImageKey: prevKey, coverImageUrl: prevUrl };
    }
    return {
      coverImageKey: nextKey,
      coverImageUrl: nextKey ? nextUrl : null,
    };
  };

  // Preserve day covers when the client omits cover fields on save — and never
  // let a null from a stale concurrent cover gen wipe another lesson's art.
  if (existing && Array.isArray(mergedInput.days)) {
    const byId = new Map(existing.days.map((d) => [d.id, d]));
    mergedInput.days = (mergedInput.days as unknown[]).map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const o = raw as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      const prev = id ? byId.get(id) : undefined;
      if (!prev) return raw;
      const hasKey = Object.prototype.hasOwnProperty.call(o, "coverImageKey");
      const hasUrl = Object.prototype.hasOwnProperty.call(o, "coverImageUrl");
      const merged = mergeCover(
        id,
        prev.coverImageKey,
        prev.coverImageUrl,
        hasKey,
        hasUrl,
        o.coverImageKey,
        o.coverImageUrl,
      );
      return { ...o, ...merged };
    });
  }
  if (existing) {
    const hasKey = Object.prototype.hasOwnProperty.call(
      mergedInput,
      "coverImageKey",
    );
    const hasUrl = Object.prototype.hasOwnProperty.call(
      mergedInput,
      "coverImageUrl",
    );
    const merged = mergeCover(
      "",
      existing.coverImageKey,
      existing.coverImageUrl,
      hasKey,
      hasUrl,
      mergedInput.coverImageKey,
      mergedInput.coverImageUrl,
    );
    mergedInput.coverImageKey = merged.coverImageKey;
    mergedInput.coverImageUrl = merged.coverImageUrl;
  }
  const next = normalizeProgram({
    ...(existing ?? {}),
    ...mergedInput,
    id: existingId || randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sort:
      typeof input === "object" &&
      input &&
      typeof (input as { sort?: unknown }).sort === "number" &&
      Number.isFinite((input as { sort: number }).sort)
        ? (input as { sort: number }).sort
        : (existing?.sort ?? Date.now() % 1_000_000),
  });
  if (!next) throw new Error("Invalid program");
  const row: ProgramRow = {
    ...next,
    pk: PROGRAM_PK,
    sk: next.id,
  };
  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName(),
        Item: row,
        ...(opts?.expectedUpdatedAt
          ? {
              ConditionExpression: "updatedAt = :u",
              ExpressionAttributeValues: { ":u": opts.expectedUpdatedAt },
            }
          : {}),
      }),
    );
  } catch (e) {
    if (opts?.expectedUpdatedAt && isOptimisticLockError(e)) throw e;
    throw e;
  }
  return next;
}

export function isOptimisticLockError(e: unknown): boolean {
  return (
    e instanceof ConditionalCheckFailedException ||
    (Boolean(e) &&
      typeof e === "object" &&
      (e as { name?: string }).name === "ConditionalCheckFailedException")
  );
}

export async function deleteProgram(id: string): Promise<void> {
  const sk = id.trim();
  if (!sk) return;
  await ddb.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: PROGRAM_PK, sk },
    }),
  );
}
