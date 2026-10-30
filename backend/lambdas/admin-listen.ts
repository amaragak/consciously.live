/**
 * Admin Listen curator:
 *   GET  /admin/listen              — settings + resolved slot previews
 *   POST /admin/listen { action }
 *        resolve | save | pin | unpin | move
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  countCuratorMeditations,
  getListenCuratorSettings,
  LISTEN_CURATOR_MAX_MEDITATIONS,
  newListenCuratorSlot,
  putListenCuratorSettings,
  type ListenCuratorSlot,
} from "./_shared/listen-curator";
import type { ConsciouslyAuthUser } from "./_shared/consciously-auth-http";
import {
  LISTEN_PATH_PK,
  LISTEN_SLUG_PK,
  coverUrlFromRow,
  parseListenShare,
  styleFromMeditationRow,
  type ListenShareKind,
} from "./_shared/listen-share";
import { meditationUserPk } from "./_shared/meditation-user-pk";
import { meditationPlaybackS3Key } from "./_shared/playback-keys";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(
  statusCode: number,
  payload: Record<string, unknown>,
  event?: APIGatewayProxyEventV2,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload, event);
}

function analyticsTable(): string {
  const n = process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim();
  if (!n) throw new Error("MEDITATION_ANALYTICS_TABLE_NAME is not set");
  return n;
}

function jobsTable(): string | null {
  return process.env.MEDITATION_JOBS_TABLE_NAME?.trim() || null;
}

export type ListenCuratorPreview = {
  slotId: string;
  ownerPk: string;
  ownerSk: string;
  kind: ListenShareKind;
  sort: number;
  published: boolean;
  title: string;
  description: string;
  /** Hand-written “Made from” line for /listen. */
  promptLine: string | null;
  /** Who this example was for (e.g. Meditation for Bob). */
  exampleFor: string | null;
  style: string | null;
  durationSec: number | null;
  coverImageUrl: string | null;
  audioUrl: string | null;
  listenSlug: string | null;
  href: string | null;
  missing: boolean;
};

function normalizeRefInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?consciously\.live\/listen\//i, "")
    .replace(/^.*\/listen\//i, "")
    .replace(/\/+$/, "");
}

async function getRow(
  pk: string,
  sk: string,
): Promise<Record<string, unknown> | null> {
  const got = await ddb.send(
    new GetCommand({
      TableName: analyticsTable(),
      Key: { pk, sk },
    }),
  );
  return got.Item ? (got.Item as Record<string, unknown>) : null;
}

async function resolveViaListenPath(
  rawPath: string,
): Promise<{ ownerPk: string; ownerSk: string } | null> {
  const slash = rawPath.indexOf("/");
  if (slash <= 0) return null;
  const username = rawPath.slice(0, slash).toLowerCase();
  const pathKey = rawPath.slice(slash + 1);
  const pathReg = await ddb.send(
    new GetCommand({
      TableName: analyticsTable(),
      Key: { pk: LISTEN_PATH_PK, sk: `${username}/${pathKey}` },
    }),
  );
  if (
    pathReg.Item?.status === "active" &&
    typeof pathReg.Item.ownerPk === "string" &&
    typeof pathReg.Item.ownerSk === "string"
  ) {
    return {
      ownerPk: pathReg.Item.ownerPk,
      ownerSk: pathReg.Item.ownerSk,
    };
  }
  return null;
}

async function resolveViaLegacySlug(
  slug: string,
): Promise<{ ownerPk: string; ownerSk: string } | null> {
  const reg = await ddb.send(
    new GetCommand({
      TableName: analyticsTable(),
      Key: { pk: LISTEN_SLUG_PK, sk: slug },
    }),
  );
  if (
    reg.Item?.status === "active" &&
    typeof reg.Item.ownerPk === "string" &&
    typeof reg.Item.ownerSk === "string"
  ) {
    return { ownerPk: reg.Item.ownerPk, ownerSk: reg.Item.ownerSk };
  }
  const q = await ddb.send(
    new QueryCommand({
      TableName: analyticsTable(),
      IndexName: "listenSlugIndex",
      KeyConditionExpression: "listenSlug = :s",
      ExpressionAttributeValues: { ":s": slug },
      Limit: 1,
    }),
  );
  const item = q.Items?.[0] as Record<string, unknown> | undefined;
  if (
    item &&
    typeof item.pk === "string" &&
    typeof item.sk === "string"
  ) {
    return { ownerPk: item.pk, ownerSk: item.sk };
  }
  return null;
}

async function resolveViaJobId(
  jobId: string,
): Promise<{ ownerPk: string; ownerSk: string } | null> {
  const table = jobsTable();
  if (!table) return null;
  const got = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { jobId },
    }),
  );
  const item = got.Item as Record<string, unknown> | undefined;
  if (!item) return null;
  const sk =
    typeof item.meditationSk === "string" && item.meditationSk.trim()
      ? item.meditationSk.trim()
      : typeof item.sk === "string" && item.sk.trim()
        ? item.sk.trim()
        : typeof item.librarySk === "string" && item.librarySk.trim()
          ? item.librarySk.trim()
          : "";
  const pkFromJob =
    typeof item.meditationPk === "string" && item.meditationPk.trim()
      ? item.meditationPk.trim()
      : "";
  if (pkFromJob && sk) {
    const row = await getRow(pkFromJob, sk);
    if (row) return { ownerPk: pkFromJob, ownerSk: sk };
  }

  // Fallback: find the library row that stamped this jobId (works before
  // meditationPk/Sk were written onto the job).
  const userId =
    typeof item.userId === "string" && item.userId.trim()
      ? item.userId.trim()
      : "";
  if (!userId) return null;
  const ownerPk = meditationUserPk(userId);
  let lek: Record<string, unknown> | undefined;
  do {
    const q = await ddb.send(
      new QueryCommand({
        TableName: analyticsTable(),
        KeyConditionExpression: "pk = :pk",
        FilterExpression: "jobId = :j",
        ExpressionAttributeValues: { ":pk": ownerPk, ":j": jobId },
        ExclusiveStartKey: lek,
      }),
    );
    const hit = (q.Items ?? [])[0] as Record<string, unknown> | undefined;
    if (hit && typeof hit.sk === "string" && hit.sk.trim()) {
      return { ownerPk, ownerSk: hit.sk.trim() };
    }
    lek = q.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lek);
  return null;
}

/**
 * Resolve a paste: Listen URL/slug, `email|sk` / `email sk`, or job UUID.
 */
async function resolveMeditationRef(raw: unknown): Promise<{
  ownerPk: string;
  ownerSk: string;
  row: Record<string, unknown>;
} | null> {
  const input = normalizeRefInput(raw);
  if (!input) return null;

  // email|sk or email/sk (sk often contains #)
  const pipe = input.indexOf("|");
  if (pipe > 0) {
    const ownerPk = input.slice(0, pipe).trim().toLowerCase();
    const ownerSk = input.slice(pipe + 1).trim();
    if (ownerPk && ownerSk) {
      const row = await getRow(ownerPk, ownerSk);
      if (row) return { ownerPk, ownerSk, row };
    }
  }

  const space = input.indexOf(" ");
  if (space > 0 && input.includes("@")) {
    const ownerPk = input.slice(0, space).trim().toLowerCase();
    const ownerSk = input.slice(space + 1).trim();
    if (ownerPk && ownerSk) {
      const row = await getRow(ownerPk, ownerSk);
      if (row) return { ownerPk, ownerSk, row };
    }
  }

  const viaPath = await resolveViaListenPath(input.toLowerCase());
  if (viaPath) {
    const row = await getRow(viaPath.ownerPk, viaPath.ownerSk);
    if (row) return { ...viaPath, row };
  }

  const slug = input.toLowerCase().replace(/^\/+/, "");
  if (slug && !slug.includes(" ") && !slug.includes("|")) {
    const viaSlug = await resolveViaLegacySlug(slug.includes("/") ? slug.split("/").pop()! : slug);
    if (viaSlug) {
      const row = await getRow(viaSlug.ownerPk, viaSlug.ownerSk);
      if (row) return { ...viaSlug, row };
    }
  }

  // UUID-ish job id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) {
    const viaJob = await resolveViaJobId(input);
    if (viaJob) {
      const row = await getRow(viaJob.ownerPk, viaJob.ownerSk);
      if (row) return { ...viaJob, row };
    }
  }

  return null;
}

function previewFromRow(
  slot: ListenCuratorSlot,
  row: Record<string, unknown> | null,
  cfDomain: string | undefined,
): ListenCuratorPreview {
  if (!row) {
    return {
      slotId: slot.id,
      ownerPk: slot.ownerPk,
      ownerSk: slot.ownerSk,
      kind: slot.kind,
      sort: slot.sort,
      published: slot.published,
      title: slot.title || "(missing meditation)",
      description: slot.description || "",
      promptLine: slot.promptLine,
      exampleFor: slot.exampleFor,
      style: null,
      durationSec: null,
      coverImageUrl: null,
      audioUrl: null,
      listenSlug: null,
      href: null,
      missing: true,
    };
  }
  const share = parseListenShare(row.listenShare);
  const kind: ListenShareKind =
    share?.kind === "story" || slot.kind === "story" ? "story" : "meditation";
  const title =
    slot.title ||
    share?.title ||
    (typeof row.title === "string" ? row.title : "") ||
    "Untitled";
  const description =
    slot.description ||
    share?.description ||
    (typeof row.description === "string" ? row.description : "") ||
    "";
  const rawKey = typeof row.s3Key === "string" ? row.s3Key.trim() : "";
  const s3Key = rawKey ? meditationPlaybackS3Key(rawKey) : "";
  const audioUrl =
    s3Key && cfDomain ? `https://${cfDomain}/${s3Key}` : null;
  const durationSec =
    typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
      ? row.durationSec
      : typeof row.durationSeconds === "number" &&
          Number.isFinite(row.durationSeconds)
        ? row.durationSeconds
        : null;
  const listenSlug =
    typeof row.listenSlug === "string" && row.listenSlug.trim()
      ? row.listenSlug.trim()
      : null;
  const username =
    typeof row.listenUsername === "string" && row.listenUsername.trim()
      ? row.listenUsername.trim()
      : null;
  const pathSlug =
    typeof row.listenPathSlug === "string" && row.listenPathSlug.trim()
      ? row.listenPathSlug.trim()
      : null;
  const href =
    username && pathSlug
      ? `/listen/${encodeURIComponent(username)}/${encodeURIComponent(pathSlug)}`
      : listenSlug
        ? `/listen/${encodeURIComponent(listenSlug)}`
        : null;

  return {
    slotId: slot.id,
    ownerPk: slot.ownerPk,
    ownerSk: slot.ownerSk,
    kind,
    sort: slot.sort,
    published: slot.published,
    title,
    description,
    promptLine: slot.promptLine,
    exampleFor: slot.exampleFor,
    style: styleFromMeditationRow(row),
    durationSec,
    coverImageUrl: coverUrlFromRow(row, cfDomain),
    audioUrl,
    listenSlug,
    href,
    missing: false,
  };
}

/** Resolve a library row the admin owns (or house), from sk + optional s3Key. */
async function resolveLibrarySkForAdmin(
  auth: ConsciouslyAuthUser,
  body: Record<string, unknown>,
): Promise<{
  ownerPk: string;
  ownerSk: string;
  row: Record<string, unknown>;
} | null> {
  const sk = typeof body.sk === "string" ? body.sk.trim() : "";
  if (!sk) return null;

  const tryPk = async (pk: string) => {
    const row = await getRow(pk, sk);
    return row ? { ownerPk: pk, ownerSk: sk, row } : null;
  };

  if (auth.sub && auth.sub !== "admin-open") {
    const hit = await tryPk(meditationUserPk(auth.sub));
    if (hit) return hit;
  }

  if (body.asHouse === true || body.as === "consciously") {
    const { ensureHouseAccount } = await import("./_shared/username-registry");
    const house = await ensureHouseAccount();
    const hit = await tryPk(meditationUserPk(house.userId));
    if (hit) return hit;
  }

  const s3Key = typeof body.s3Key === "string" ? body.s3Key.trim() : "";
  const fromKey = /^meditations\/([^/]+)\//.exec(s3Key);
  if (fromKey?.[1]) {
    const hit = await tryPk(meditationUserPk(fromKey[1]));
    if (hit) return hit;
  }

  // Last resort: paste-style ref already supports pk|sk.
  if (typeof body.ref === "string" && body.ref.trim()) {
    return resolveMeditationRef(body.ref);
  }
  return null;
}

async function resolveSlots(
  slots: ListenCuratorSlot[],
): Promise<ListenCuratorPreview[]> {
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  const out: ListenCuratorPreview[] = [];
  for (const slot of slots) {
    const row = await getRow(slot.ownerPk, slot.ownerSk);
    out.push(previewFromRow(slot, row, cfDomain));
  }
  return out;
}

function kindFromBody(body: Record<string, unknown>, fallback: ListenShareKind): ListenShareKind {
  if (body.kind === "story") return "story";
  if (body.kind === "meditation") return "meditation";
  return fallback;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {}, event);

  const auth = await requireAdminJson(event);
  if ("statusCode" in auth) return auth;

  try {
    if (method === "GET") {
      const settings = await getListenCuratorSettings();
      const previews = await resolveSlots(settings.slots);
      return json(
        200,
        {
          includeCommunity: settings.includeCommunity,
          slots: settings.slots,
          previews,
        },
        event,
      );
    }

    if (method !== "POST") {
      return json(405, { error: "Method not allowed" }, event);
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(event.body || "{}") as Record<string, unknown>;
    } catch {
      return json(400, { error: "Invalid JSON" }, event);
    }
    const action = String(body.action ?? "").trim();

    if (action === "resolve") {
      const found = await resolveMeditationRef(body.ref ?? body.id ?? body.sk);
      if (!found) {
        return json(
          404,
          {
            error:
              "Could not find that meditation. Paste a Listen URL/slug, job id, or email|sk.",
          },
          event,
        );
      }
      const share = parseListenShare(found.row.listenShare);
      const kind: ListenShareKind =
        share?.kind === "story" ? "story" : "meditation";
      const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
      const preview = previewFromRow(
        newListenCuratorSlot({
          ownerPk: found.ownerPk,
          ownerSk: found.ownerSk,
          kind,
          sort: 0,
        }),
        found.row,
        cfDomain,
      );
      return json(
        200,
        {
          ownerPk: found.ownerPk,
          ownerSk: found.ownerSk,
          kind,
          preview,
        },
        event,
      );
    }

    if (action === "save") {
      const patch: {
        includeCommunity?: boolean;
        slots?: unknown;
      } = {};
      if (typeof body.includeCommunity === "boolean") {
        patch.includeCommunity = body.includeCommunity;
      }
      if (body.slots !== undefined) patch.slots = body.slots;
      const settings = await putListenCuratorSettings(patch);
      const previews = await resolveSlots(settings.slots);
      return json(
        200,
        {
          includeCommunity: settings.includeCommunity,
          slots: settings.slots,
          previews,
        },
        event,
      );
    }

    if (action === "pin") {
      const found = await resolveMeditationRef(body.ref ?? body.id ?? body.sk);
      if (!found) {
        return json(
          404,
          {
            error:
              "Could not find that meditation. Paste a Listen URL/slug, job id, or email|sk.",
          },
          event,
        );
      }
      const share = parseListenShare(found.row.listenShare);
      const inferred: ListenShareKind =
        share?.kind === "story" ? "story" : "meditation";
      const kind = kindFromBody(body, inferred);
      const settings = await getListenCuratorSettings();
      const dup = settings.slots.find(
        (s) =>
          s.ownerPk === found.ownerPk && s.ownerSk === found.ownerSk,
      );
      if (dup) {
        return json(
          400,
          { error: "That meditation is already on the Listen curator." },
          event,
        );
      }
      if (
        kind === "meditation" &&
        countCuratorMeditations(settings.slots) >= LISTEN_CURATOR_MAX_MEDITATIONS
      ) {
        return json(
          400,
          {
            error: `At most ${LISTEN_CURATOR_MAX_MEDITATIONS} meditation examples. Remove one in Admin › Listen first.`,
          },
          event,
        );
      }
      const slot = newListenCuratorSlot({
        ownerPk: found.ownerPk,
        ownerSk: found.ownerSk,
        kind,
        sort: settings.slots.length,
        title: typeof body.title === "string" ? body.title : null,
        description:
          typeof body.description === "string" ? body.description : null,
        promptLine:
          typeof body.promptLine === "string" ? body.promptLine : null,
        exampleFor:
          typeof body.exampleFor === "string" ? body.exampleFor : null,
        published: body.published !== false,
      });
      const next = await putListenCuratorSettings({
        slots: [...settings.slots, slot],
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
          pinned: slot,
        },
        event,
      );
    }

    if (action === "setAsExample" || action === "unsetAsExample") {
      const found = await resolveLibrarySkForAdmin(auth, body);
      if (!found) {
        return json(
          404,
          { error: "Could not find that library meditation." },
          event,
        );
      }
      const share = parseListenShare(found.row.listenShare);
      const inferred: ListenShareKind =
        share?.kind === "story" ||
        (typeof found.row.meditationType === "string" &&
          found.row.meditationType.trim().toLowerCase() === "story") ||
        (typeof found.row.meditationStyle === "string" &&
          found.row.meditationStyle.trim().toLowerCase() === "story")
          ? "story"
          : "meditation";
      const kind = kindFromBody(body, inferred);
      const settings = await getListenCuratorSettings();
      const existing = settings.slots.find(
        (s) =>
          s.ownerPk === found.ownerPk && s.ownerSk === found.ownerSk,
      );

      if (action === "unsetAsExample") {
        if (!existing) {
          const previews = await resolveSlots(settings.slots);
          return json(
            200,
            {
              includeCommunity: settings.includeCommunity,
              slots: settings.slots,
              previews,
              isExample: false,
            },
            event,
          );
        }
        const next = await putListenCuratorSettings({
          slots: settings.slots
            .filter((s) => s.id !== existing.id)
            .map((s, i) => ({ ...s, sort: i })),
        });
        const previews = await resolveSlots(next.slots);
        return json(
          200,
          {
            includeCommunity: next.includeCommunity,
            slots: next.slots,
            previews,
            isExample: false,
          },
          event,
        );
      }

      if (existing) {
        const previews = await resolveSlots(settings.slots);
        return json(
          200,
          {
            includeCommunity: settings.includeCommunity,
            slots: settings.slots,
            previews,
            isExample: true,
            pinned: existing,
          },
          event,
        );
      }
      if (
        kind === "meditation" &&
        countCuratorMeditations(settings.slots) >= LISTEN_CURATOR_MAX_MEDITATIONS
      ) {
        return json(
          400,
          {
            error: `At most ${LISTEN_CURATOR_MAX_MEDITATIONS} meditation examples. Remove one in Admin › Listen first.`,
          },
          event,
        );
      }
      const slot = newListenCuratorSlot({
        ownerPk: found.ownerPk,
        ownerSk: found.ownerSk,
        kind,
        sort: settings.slots.length,
        published: true,
      });
      const next = await putListenCuratorSettings({
        slots: [...settings.slots, slot],
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
          isExample: true,
          pinned: slot,
        },
        event,
      );
    }

    if (action === "setPromptLine") {
      const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
      if (!slotId) return json(400, { error: "slotId is required" }, event);
      const promptLine =
        typeof body.promptLine === "string"
          ? body.promptLine.trim().slice(0, 500) || null
          : null;
      const settings = await getListenCuratorSettings();
      if (!settings.slots.some((s) => s.id === slotId)) {
        return json(404, { error: "Slot not found" }, event);
      }
      const next = await putListenCuratorSettings({
        slots: settings.slots.map((s) =>
          s.id === slotId ? { ...s, promptLine } : s,
        ),
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
        },
        event,
      );
    }

    if (action === "setExampleFor") {
      const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
      if (!slotId) return json(400, { error: "slotId is required" }, event);
      const exampleFor =
        typeof body.exampleFor === "string"
          ? body.exampleFor.trim().slice(0, 120) || null
          : null;
      const settings = await getListenCuratorSettings();
      if (!settings.slots.some((s) => s.id === slotId)) {
        return json(404, { error: "Slot not found" }, event);
      }
      const next = await putListenCuratorSettings({
        slots: settings.slots.map((s) =>
          s.id === slotId ? { ...s, exampleFor } : s,
        ),
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
        },
        event,
      );
    }

    if (action === "unpin") {
      const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
      if (!slotId) return json(400, { error: "slotId is required" }, event);
      const settings = await getListenCuratorSettings();
      const next = await putListenCuratorSettings({
        slots: settings.slots
          .filter((s) => s.id !== slotId)
          .map((s, i) => ({ ...s, sort: i })),
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
        },
        event,
      );
    }

    if (action === "move") {
      const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
      const dir = body.dir === "up" || body.dir === -1 ? -1 : 1;
      if (!slotId) return json(400, { error: "slotId is required" }, event);
      const settings = await getListenCuratorSettings();
      const slots = settings.slots.slice().sort((a, b) => a.sort - b.sort);
      const target = slots.find((s) => s.id === slotId);
      if (!target) return json(404, { error: "Slot not found" }, event);
      // Reorder only within the same kind so Meditations / Stories lists stay independent.
      const kindSlots = slots.filter((s) => s.kind === target.kind);
      const kindIdx = kindSlots.findIndex((s) => s.id === slotId);
      const swapIdx = kindIdx + dir;
      if (kindIdx < 0 || swapIdx < 0 || swapIdx >= kindSlots.length) {
        return json(
          200,
          {
            includeCommunity: settings.includeCommunity,
            slots: settings.slots,
            previews: await resolveSlots(settings.slots),
          },
          event,
        );
      }
      const a = kindSlots[kindIdx]!;
      const b = kindSlots[swapIdx]!;
      const sortA = a.sort;
      const nextSlots = slots.map((s) => {
        if (s.id === a.id) return { ...s, sort: b.sort };
        if (s.id === b.id) return { ...s, sort: sortA };
        return s;
      });
      const next = await putListenCuratorSettings({
        slots: nextSlots
          .slice()
          .sort((x, y) => x.sort - y.sort)
          .map((s, i) => ({ ...s, sort: i })),
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
        },
        event,
      );
    }

    if (action === "setPublished") {
      const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
      if (!slotId) return json(400, { error: "slotId is required" }, event);
      const published = body.published !== false;
      const settings = await getListenCuratorSettings();
      const next = await putListenCuratorSettings({
        slots: settings.slots.map((s) =>
          s.id === slotId ? { ...s, published } : s,
        ),
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
        },
        event,
      );
    }

    if (action === "setIncludeCommunity") {
      const next = await putListenCuratorSettings({
        includeCommunity: body.includeCommunity === true,
      });
      const previews = await resolveSlots(next.slots);
      return json(
        200,
        {
          includeCommunity: next.includeCommunity,
          slots: next.slots,
          previews,
        },
        event,
      );
    }

    return json(400, { error: `Unknown action: ${action}` }, event);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin Listen failed";
    console.error("admin-listen", msg);
    return json(500, { error: msg }, event);
  }
}
