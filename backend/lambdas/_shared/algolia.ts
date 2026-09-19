/**
 * Algolia user-content search — index + query by email userId.
 * Guest Continuations use GUEST_ACCOUNT_EMAIL (alexmaragakis@hotmail.co.uk).
 *
 * Secret `medimade/ALGOLIA` (JSON string):
 *   { "appId", "adminApiKey", "searchApiKey", "indexName?" }
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

/** Keep in sync with `lambdas/auth-guest.ts` — avoid importing the lambda entry. */
export const ALGOLIA_GUEST_USER_ID = "alexmaragakis@hotmail.co.uk";

const secrets = new SecretsManagerClient({});

export type AlgoliaCreds = {
  appId: string;
  adminApiKey: string;
  searchApiKey: string;
  indexName: string;
};

export type AlgoliaRecordType =
  | "gratitude"
  | "journal"
  | "meditation"
  | "life_area"
  | "goal"
  | "todo"
  | "value"
  | "regret"
  | "quote"
  | "manifesto"
  | "vision"
  | "resistance";

export type AlgoliaUserRecord = {
  objectID: string;
  userId: string;
  type: AlgoliaRecordType;
  title: string;
  body: string;
  href: string;
  updatedAt: number;
};

let cachedCreds: AlgoliaCreds | null | undefined;
let settingsEnsured = false;

export function algoliaUserIdFromEmail(email: string | undefined | null): string {
  const e = (email ?? "").trim().toLowerCase();
  return e || ALGOLIA_GUEST_USER_ID;
}

export async function getAlgoliaCreds(): Promise<AlgoliaCreds | null> {
  if (cachedCreds !== undefined) return cachedCreds;
  const arn = process.env.ALGOLIA_SECRET_ARN?.trim();
  const name = process.env.ALGOLIA_SECRET_NAME?.trim() || "medimade/ALGOLIA";
  if (!arn && !name) {
    cachedCreds = null;
    return null;
  }
  try {
    const out = await secrets.send(
      new GetSecretValueCommand({ SecretId: arn || name }),
    );
    const raw = out.SecretString?.trim();
    if (!raw) {
      cachedCreds = null;
      return null;
    }
    const j = JSON.parse(raw) as Record<string, unknown>;
    const appId = typeof j.appId === "string" ? j.appId.trim() : "";
    const adminApiKey =
      typeof j.adminApiKey === "string" ? j.adminApiKey.trim() : "";
    const searchApiKey =
      typeof j.searchApiKey === "string" ? j.searchApiKey.trim() : "";
    const indexName =
      typeof j.indexName === "string" && j.indexName.trim()
        ? j.indexName.trim()
        : "consciously";
    if (!appId || !adminApiKey) {
      cachedCreds = null;
      return null;
    }
    cachedCreds = {
      appId,
      adminApiKey,
      searchApiKey: searchApiKey || adminApiKey,
      indexName,
    };
    return cachedCreds;
  } catch {
    cachedCreds = null;
    return null;
  }
}

function host(appId: string): string {
  return `https://${appId}-dsn.algolia.net`;
}

async function algoliaFetch(
  creds: AlgoliaCreds,
  path: string,
  init: RequestInit & { admin?: boolean },
): Promise<Response> {
  const key = init.admin === false ? creds.searchApiKey : creds.adminApiKey;
  const { admin: _a, ...rest } = init;
  return fetch(`${host(creds.appId)}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "X-Algolia-Application-Id": creds.appId,
      "X-Algolia-API-Key": key,
      ...(rest.headers ?? {}),
    },
  });
}

async function ensureIndexSettings(creds: AlgoliaCreds): Promise<void> {
  if (settingsEnsured) return;
  try {
    await algoliaFetch(creds, `/1/indexes/${encodeURIComponent(creds.indexName)}/settings`, {
      method: "PUT",
      admin: true,
      body: JSON.stringify({
        searchableAttributes: ["title", "body", "type"],
        attributesForFaceting: ["filterOnly(userId)", "type"],
        attributesToRetrieve: [
          "objectID",
          "userId",
          "type",
          "title",
          "body",
          "href",
          "updatedAt",
        ],
        hitsPerPage: 20,
      }),
    });
    settingsEnsured = true;
  } catch {
    /* non-fatal */
  }
}

export function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|br)\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function replaceUserRecords(opts: {
  userId: string;
  types: AlgoliaRecordType[];
  records: AlgoliaUserRecord[];
}): Promise<void> {
  const creds = await getAlgoliaCreds();
  if (!creds) return;
  await ensureIndexSettings(creds);
  const userId = opts.userId.trim().toLowerCase();
  if (!userId) return;

  const typeFilter = opts.types.map((t) => `type:${t}`).join(" OR ");
  const filters = `userId:${JSON.stringify(userId)} AND (${typeFilter})`;

  try {
    await algoliaFetch(
      creds,
      `/1/indexes/${encodeURIComponent(creds.indexName)}/deleteByQuery`,
      {
        method: "POST",
        admin: true,
        body: JSON.stringify({ filters }),
      },
    );
  } catch {
    /* continue — save still useful */
  }

  if (!opts.records.length) return;

  const chunk = 100;
  for (let i = 0; i < opts.records.length; i += chunk) {
    const slice = opts.records.slice(i, i + chunk);
    const requests = slice.map((r) => ({
      action: "updateObject",
      body: { ...r, userId },
    }));
    await algoliaFetch(
      creds,
      `/1/indexes/${encodeURIComponent(creds.indexName)}/batch`,
      {
        method: "POST",
        admin: true,
        body: JSON.stringify({ requests }),
      },
    );
  }
}

export async function upsertRecords(records: AlgoliaUserRecord[]): Promise<void> {
  const creds = await getAlgoliaCreds();
  if (!creds || !records.length) return;
  await ensureIndexSettings(creds);
  const chunk = 100;
  for (let i = 0; i < records.length; i += chunk) {
    const slice = records.slice(i, i + chunk);
    const requests = slice.map((r) => ({
      action: "updateObject",
      body: r,
    }));
    await algoliaFetch(
      creds,
      `/1/indexes/${encodeURIComponent(creds.indexName)}/batch`,
      {
        method: "POST",
        admin: true,
        body: JSON.stringify({ requests }),
      },
    );
  }
}

export type AlgoliaHit = {
  objectID: string;
  type: AlgoliaRecordType;
  title: string;
  body: string;
  href: string;
  updatedAt?: number;
};

export async function searchUserContent(opts: {
  userId: string;
  query: string;
  types?: AlgoliaRecordType[];
  hitsPerPage?: number;
}): Promise<AlgoliaHit[]> {
  const creds = await getAlgoliaCreds();
  if (!creds) return [];
  const userId = opts.userId.trim().toLowerCase();
  const q = opts.query.trim();
  if (!userId || !q) return [];

  let filters = `userId:${JSON.stringify(userId)}`;
  if (opts.types?.length) {
    filters += ` AND (${opts.types.map((t) => `type:${t}`).join(" OR ")})`;
  }

  const res = await algoliaFetch(
    creds,
    `/1/indexes/${encodeURIComponent(creds.indexName)}/query`,
    {
      method: "POST",
      admin: false,
      body: JSON.stringify({
        query: q,
        filters,
        hitsPerPage: Math.min(40, Math.max(1, opts.hitsPerPage ?? 20)),
      }),
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    hits?: Array<Record<string, unknown>>;
  };
  return (data.hits ?? []).map((h) => ({
    objectID: String(h.objectID ?? ""),
    type: String(h.type ?? "journal") as AlgoliaRecordType,
    title: typeof h.title === "string" ? h.title : "",
    body: typeof h.body === "string" ? h.body : "",
    href: typeof h.href === "string" ? h.href : "/",
    updatedAt: typeof h.updatedAt === "number" ? h.updatedAt : undefined,
  }));
}

/** Fire-and-forget; never throw into request handlers. */
export function scheduleAlgolia(work: () => Promise<void>): void {
  void work().catch(() => {
    /* indexing must not fail user writes */
  });
}
