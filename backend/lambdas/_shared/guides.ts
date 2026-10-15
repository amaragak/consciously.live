import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const GUIDE_PK = "GUIDE";

export const GUIDE_AREAS = ["meditate", "journal", "manifest"] as const;
export type GuideArea = (typeof GUIDE_AREAS)[number];

/** Practice-card action for `manifest` guides (ignored for other areas). */
export const GUIDE_PRACTICE_ACTIONS = ["lifeArea", "create"] as const;
export type GuidePracticeAction = (typeof GUIDE_PRACTICE_ACTIONS)[number];

export function isGuidePracticeAction(raw: unknown): raw is GuidePracticeAction {
  return raw === "lifeArea" || raw === "create";
}
export type GuideStatus = "draft" | "published";

export type Guide = {
  id: string;
  area: GuideArea;
  title: string;
  /** Unique per area. */
  slug: string;
  summary: string;
  category: string;
  coverImageUrl: string | null;
  /** Markdown body. */
  body: string;
  /** Short brief that seeds the “practice this” flow. */
  practiceBrief: string;
  /** Manifest only: what the practice card does. Null for other areas. */
  practiceAction: GuidePracticeAction | null;
  status: GuideStatus;
  /** Ascending sort key (0..n). */
  order: number;
  readMinutes: number;
  createdAt: string;
  updatedAt: string;
  helpfulYes: number;
  helpfulNo: number;
};

/** Payload accepted by `seedGuidesIfEmpty` / upsert (all but area+title optional). */
export type GuideSeed = {
  id?: string;
  area: GuideArea;
  title: string;
  slug?: string;
  summary?: string;
  category?: string;
  coverImageUrl?: string | null;
  body?: string;
  practiceBrief?: string;
  practiceAction?: GuidePracticeAction | null;
  status?: GuideStatus;
  order?: number;
};

type GuideRow = Guide & {
  pk: typeof GUIDE_PK;
  sk: string;
};

const MAX_TITLE = 200;
const MAX_SLUG = 100;
const MAX_SUMMARY = 600;
const MAX_CATEGORY = 80;
const MAX_BODY = 100_000;
const MAX_PRACTICE_BRIEF = 2_000;

function tableName(): string {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  if (!n) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  return n;
}

function skForId(id: string): string {
  return `GUIDE#${id}`;
}

export function isGuideArea(raw: unknown): raw is GuideArea {
  return raw === "meditate" || raw === "journal" || raw === "manifest";
}

export function slugifyGuideTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `guide-${randomUUID().slice(0, 8)}`;
}

function cleanSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG);
}

/** Words ÷ 200, rounded up, minimum 1. */
export function computeGuideReadMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function num(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function coerceGuide(raw: Record<string, unknown>): Guide | null {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
  if (!id || !isGuideArea(raw.area)) return null;
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, MAX_TITLE)
      : "Untitled";
  const slug =
    (typeof raw.slug === "string" ? cleanSlug(raw.slug) : "") ||
    slugifyGuideTitle(title);
  const body = typeof raw.body === "string" ? raw.body.slice(0, MAX_BODY) : "";
  const now = new Date().toISOString();
  return {
    id,
    area: raw.area,
    title,
    slug,
    summary:
      typeof raw.summary === "string"
        ? raw.summary.trim().slice(0, MAX_SUMMARY)
        : "",
    category:
      typeof raw.category === "string"
        ? raw.category.trim().slice(0, MAX_CATEGORY)
        : "",
    coverImageUrl:
      typeof raw.coverImageUrl === "string" && raw.coverImageUrl.trim()
        ? raw.coverImageUrl.trim().slice(0, 2048)
        : null,
    body,
    practiceBrief:
      typeof raw.practiceBrief === "string"
        ? raw.practiceBrief.trim().slice(0, MAX_PRACTICE_BRIEF)
        : "",
    practiceAction:
      raw.area === "manifest"
        ? isGuidePracticeAction(raw.practiceAction)
          ? raw.practiceAction
          : "lifeArea"
        : null,
    status: raw.status === "published" ? "published" : "draft",
    order: Math.max(0, Math.round(num(raw.order, 0))),
    readMinutes: computeGuideReadMinutes(body),
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt.trim()
        : now,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt.trim()
        : now,
    helpfulYes: Math.max(0, Math.round(num(raw.helpfulYes, 0))),
    helpfulNo: Math.max(0, Math.round(num(raw.helpfulNo, 0))),
  };
}

function compareGuides(a: Guide, b: Guide): number {
  if (a.order !== b.order) return a.order - b.order;
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}

export async function listGuides(): Promise<Guide[]> {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": GUIDE_PK,
          ":prefix": "GUIDE#",
        },
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of res.Items ?? []) {
      items.push(item as Record<string, unknown>);
    }
    exclusiveStartKey = res.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  const guides = items
    .map((item) => coerceGuide(item))
    .filter((g): g is Guide => Boolean(g));
  guides.sort(compareGuides);
  return guides;
}

export async function listPublishedGuides(area?: GuideArea): Promise<Guide[]> {
  const all = await listGuides();
  return all
    .filter((g) => g.status === "published" && (!area || g.area === area))
    .sort(compareGuides);
}

export async function getGuideById(id: string): Promise<Guide | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: GUIDE_PK, sk: skForId(id) },
      ConsistentRead: true,
    }),
  );
  if (!res.Item) return null;
  return coerceGuide(res.Item as Record<string, unknown>);
}

export async function getGuideByAreaSlug(
  area: GuideArea,
  slug: string,
  opts?: { publishedOnly?: boolean },
): Promise<Guide | null> {
  const needle = slug.trim().toLowerCase();
  if (!needle) return null;
  const all = await listGuides();
  const guide = all.find((g) => g.area === area && g.slug === needle) ?? null;
  if (!guide) return null;
  if (opts?.publishedOnly && guide.status !== "published") return null;
  return guide;
}

async function writeGuide(guide: Guide): Promise<void> {
  const row: GuideRow = { pk: GUIDE_PK, sk: skForId(guide.id), ...guide };
  await ddb.send(new PutCommand({ TableName: tableName(), Item: row }));
}

function has(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export async function putGuide(input: Record<string, unknown>): Promise<Guide> {
  const now = new Date().toISOString();
  const existingId =
    typeof input.id === "string" && input.id.trim() ? input.id.trim() : "";
  const existing = existingId ? await getGuideById(existingId) : null;

  const area = isGuideArea(input.area) ? input.area : existing?.area;
  if (!area) throw new Error("`area` must be 'meditate', 'journal' or 'manifest'");

  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim().slice(0, MAX_TITLE)
      : existing?.title || "Untitled";

  const slugRaw =
    typeof input.slug === "string" && input.slug.trim()
      ? cleanSlug(input.slug)
      : existing?.slug || "";
  const baseSlug = slugRaw || slugifyGuideTitle(title);

  const all = await listGuides();
  const id = existingId || randomUUID();
  let slug = baseSlug;
  if (all.some((g) => g.area === area && g.slug === slug && g.id !== id)) {
    slug = `${baseSlug.slice(0, MAX_SLUG - 7)}-${randomUUID().slice(0, 6)}`;
  }

  const body = has(input, "body")
    ? typeof input.body === "string"
      ? input.body.slice(0, MAX_BODY)
      : ""
    : (existing?.body ?? "");

  let order: number;
  if (has(input, "order") && Number.isFinite(Number(input.order))) {
    order = Math.max(0, Math.round(Number(input.order)));
  } else if (existing) {
    order = existing.order;
  } else {
    const inArea = all.filter((g) => g.area === area);
    order = inArea.length ? Math.max(...inArea.map((g) => g.order)) + 1 : 0;
  }

  const guide: Guide = {
    id,
    area,
    title,
    slug,
    summary: has(input, "summary")
      ? typeof input.summary === "string"
        ? input.summary.trim().slice(0, MAX_SUMMARY)
        : ""
      : (existing?.summary ?? ""),
    category: has(input, "category")
      ? typeof input.category === "string"
        ? input.category.trim().slice(0, MAX_CATEGORY)
        : ""
      : (existing?.category ?? ""),
    coverImageUrl: has(input, "coverImageUrl")
      ? typeof input.coverImageUrl === "string" && input.coverImageUrl.trim()
        ? input.coverImageUrl.trim().slice(0, 2048)
        : null
      : (existing?.coverImageUrl ?? null),
    body,
    practiceBrief: has(input, "practiceBrief")
      ? typeof input.practiceBrief === "string"
        ? input.practiceBrief.trim().slice(0, MAX_PRACTICE_BRIEF)
        : ""
      : (existing?.practiceBrief ?? ""),
    practiceAction:
      area !== "manifest"
        ? null
        : has(input, "practiceAction") && isGuidePracticeAction(input.practiceAction)
          ? input.practiceAction
          : (existing?.practiceAction ?? "lifeArea"),
    status:
      input.status === "published" || input.status === "draft"
        ? input.status
        : (existing?.status ?? "draft"),
    order,
    readMinutes: computeGuideReadMinutes(body),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    // Counters are only changed via incrementGuideHelpful.
    helpfulYes: existing?.helpfulYes ?? 0,
    helpfulNo: existing?.helpfulNo ?? 0,
  };

  await writeGuide(guide);
  return guide;
}

export async function deleteGuide(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: GUIDE_PK, sk: skForId(id) },
    }),
  );
}

/** Atomic counter bump. Returns null if the guide doesn't exist. */
export async function incrementGuideHelpful(
  id: string,
  vote: "yes" | "no",
): Promise<Guide | null> {
  const attr = vote === "yes" ? "helpfulYes" : "helpfulNo";
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { pk: GUIDE_PK, sk: skForId(id) },
        UpdateExpression: "ADD #c :one",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: { "#c": attr },
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "ALL_NEW",
      }),
    );
    return res.Attributes
      ? coerceGuide(res.Attributes as Record<string, unknown>)
      : null;
  } catch (e) {
    if (e instanceof Error && e.name === "ConditionalCheckFailedException") {
      return null;
    }
    throw e;
  }
}

/** Sets `order` to the index within `orderedIds` (0..n); unknown ids are skipped. */
export async function reorderGuides(orderedIds: string[]): Promise<Guide[]> {
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const ids = orderedIds.filter((raw) => {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const existing = new Set((await listGuides()).map((g) => g.id));
  let index = 0;
  for (const rawId of ids) {
    const id = rawId.trim();
    if (!existing.has(id)) continue;
    await ddb.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { pk: GUIDE_PK, sk: skForId(id) },
        UpdateExpression: "SET #o = :o, updatedAt = :u",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: { "#o": "order" },
        ExpressionAttributeValues: { ":o": index, ":u": now },
      }),
    );
    index += 1;
  }
  return listGuides();
}

function seedToInput(seed: GuideSeed): Record<string, unknown> {
  return { ...seed } as Record<string, unknown>;
}

/**
 * If no guides exist yet, put each seed (order defaults to array position per area).
 * Returns the number of guides written (0 if table already had guides).
 */
export async function seedGuidesIfEmpty(
  staticGuides: GuideSeed[],
): Promise<number> {
  const existing = await listGuides();
  if (existing.length > 0) return 0;
  const counters: Record<GuideArea, number> = { meditate: 0, journal: 0, manifest: 0 };
  let written = 0;
  for (const seed of staticGuides) {
    if (!seed || !isGuideArea(seed.area)) continue;
    const order =
      typeof seed.order === "number" && Number.isFinite(seed.order)
        ? seed.order
        : counters[seed.area];
    counters[seed.area] = order + 1;
    await putGuide({ ...seedToInput(seed), order });
    written += 1;
  }
  return written;
}

/** Upsert seeds by area+slug (keeps id, createdAt, and helpful counts of matches). */
export async function upsertGuidesByAreaSlug(
  staticGuides: GuideSeed[],
): Promise<number> {
  const existing = await listGuides();
  const counters: Record<GuideArea, number> = { meditate: 0, journal: 0, manifest: 0 };
  let written = 0;
  for (const seed of staticGuides) {
    if (!seed || !isGuideArea(seed.area)) continue;
    const slug =
      (typeof seed.slug === "string" ? cleanSlug(seed.slug) : "") ||
      slugifyGuideTitle(seed.title ?? "");
    const match = existing.find((g) => g.area === seed.area && g.slug === slug);
    const order =
      typeof seed.order === "number" && Number.isFinite(seed.order)
        ? seed.order
        : counters[seed.area];
    counters[seed.area] = order + 1;
    await putGuide({
      ...seedToInput(seed),
      slug,
      order,
      ...(match ? { id: match.id } : {}),
    });
    written += 1;
  }
  return written;
}
