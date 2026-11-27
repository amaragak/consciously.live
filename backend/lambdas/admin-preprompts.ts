import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireAdminJson } from "./_shared/admin-auth";
import type { ConsciouslyAuthUser } from "./_shared/consciously-auth-http";
import { defaultDeliveryProfiles } from "./_shared/delivery-profiles";
import {
  PREPROMPT_ID,
  PREPROMPT_SAMPLE_PLACEHOLDERS,
  fillPrepromptPlaceholders,
  getRegistryEntry,
  isDatasetId,
  missingRequiredPlaceholders,
  normalizePrepromptText,
} from "./_shared/preprompts/preprompt-registry";
import {
  getDatasetView,
  importHarvesterBundle,
  type HarvesterBundle,
} from "./_shared/preprompts/harvester-datasets";
import { loadRecentConformance } from "./_shared/script-conformance-log";
import { planSkeletonForCreate } from "./_shared/script-skeleton-plan";
import {
  buildSkeletonScriptPrompt,
  type SkeletonPrepromptTexts,
} from "./_shared/script-skeleton-prompt";
import {
  PrepromptError,
  getPrepromptEntry,
  getPrepromptVersion,
  listPrepromptEntries,
  listPrepromptVersions,
  restorePrepromptVersion,
  saveManualPrepromptVersion,
  setPreferred,
} from "./_shared/preprompts/preprompt-store";
import { PREPROMPT_DEFAULTS } from "./_shared/preprompts/preprompt-defaults-data";
import {
  buildSilenceWordsScriptPrompt,
  type SilenceWordsPrepromptTexts,
} from "./_shared/script-silence-words-prompt";

// Was (read-only Claude catalog): GET /admin/preprompts only, CLAUDE_PREPROMPT rows.
// Now: versioned SCRIPT_PREPROMPT entries (see _shared/preprompts/preprompt-store.ts).
// The old CLAUDE_PREPROMPT seed code still exists but the Pre-prompts UI uses SCRIPT_PREPROMPT.

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

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw new PrepromptError(400, "Invalid JSON body");
  }
}

type Route =
  | { kind: "list" }
  | { kind: "import" }
  | { kind: "conformance" }
  | { kind: "entry"; id: string }
  | { kind: "versions"; id: string }
  | { kind: "version"; id: string; n: number }
  | { kind: "prefer"; id: string; n: number }
  | { kind: "restore"; id: string; n: number }
  | { kind: "preview"; id: string }
  | { kind: "dataset"; id: string };

function parseRoute(event: APIGatewayProxyEventV2): Route | null {
  const path = event.rawPath ?? "";
  const m = /\/admin\/preprompts(?:\/([^/]+))?(?:\/(versions|preview|dataset))?(?:\/(\d+))?(?:\/(prefer|restore))?\/?$/.exec(
    path,
  );
  if (!m) return null;
  const id = m[1] ? decodeURIComponent(m[1]) : "";
  const seg = m[2];
  const n = m[3] ? Number(m[3]) : null;
  const action = m[4];
  if (!id) return { kind: "list" };
  if (id === "import") return !seg && n == null && !action ? { kind: "import" } : null;
  if (id === "conformance") {
    return !seg && n == null && !action ? { kind: "conformance" } : null;
  }
  if (!seg) return n == null && !action ? { kind: "entry", id } : null;
  if (seg === "preview") return n == null ? { kind: "preview", id } : null;
  if (seg === "dataset") return n == null && !action ? { kind: "dataset", id } : null;
  if (n == null) return action ? null : { kind: "versions", id };
  if (action === "prefer") return { kind: "prefer", id, n };
  if (action === "restore") return { kind: "restore", id, n };
  return action ? null : { kind: "version", id, n };
}

/** Which prompt-builder field an entry overrides in the preview. */
const PREVIEW_FIELD: Record<string, keyof SilenceWordsPrepromptTexts> = {
  [PREPROMPT_ID.systemPrefix]: "systemPrefix",
  [PREPROMPT_ID.personalization]: "personalization",
  [PREPROMPT_ID.gender]: "gender",
  [PREPROMPT_ID.pauseRules]: "pauseRules",
  [PREPROMPT_ID.openSitsOptionDescription]: "openSitsOptionDescription",
};

const SKELETON_PREVIEW_FIELD: Record<string, keyof SkeletonPrepromptTexts> = {
  [PREPROMPT_ID.systemPrefix]: "systemPrefix",
  [PREPROMPT_ID.personalization]: "personalization",
  [PREPROMPT_ID.gender]: "gender",
  [PREPROMPT_ID.pauseRules]: "pauseRules",
  [PREPROMPT_ID.skeletonTask]: "skeletonTask",
};

/**
 * Full Create prompt with sample values; `text` replaces this entry. No model
 * call. Create now writes into a skeleton, so every entry Create reads previews
 * with a sample skeleton (built from a default pacing profile, no Dynamo read).
 */
function buildPreview(id: string, text: string) {
  const reg = getRegistryEntry(id)!;
  if (id !== PREPROMPT_ID.openSitsOptionDescription) {
    const style =
      reg.group === "style_guide" ? reg.meditationType! : "Visualization";
    const plan = planSkeletonForCreate({
      style: "visualization",
      skeletons: null,
      profile: null,
      targetSessionSeconds: 600,
      scriptTimeSeconds: 560,
      wpm: 105,
    });
    const field = SKELETON_PREVIEW_FIELD[id];
    const prompt = buildSkeletonScriptPrompt({
      transcript:
        "User: I want a calm ten minute sit about slowing down after a busy week.",
      meditationStyle: style,
      skeletonMeditationType: style,
      plan,
      ...(field ? { preprompts: { [field]: text } } : {}),
      ...(reg.group === "style_guide" ? { styleGuideMarkdown: text } : {}),
    });
    return {
      systemStable: prompt.systemStable,
      meditationContext: prompt.meditationContext,
      taskContent: prompt.taskContent,
    };
  }
  // Legacy silence-words open-sit prompt (entry no longer read by Create).
  const field = PREVIEW_FIELD[id];
  const prompt = buildSilenceWordsScriptPrompt({
    transcript:
      "User: I want a calm ten minute sit about slowing down after a busy week.",
    meditationStyle:
      reg.group === "style_guide" ? reg.meditationType : "Visualization",
    option: "open_sits",
    profiles: defaultDeliveryProfiles(),
    scriptTimeSeconds: 600,
    speakingShare: 0.35,
    speakingBandMin: 0.25,
    speakingBandMax: 0.45,
    totalWordBudget: 520,
    minLongPauses: 3,
    longestSingleSilenceSeconds: 120,
    ...(field ? { preprompts: { [field]: text } } : {}),
    ...(reg.group === "style_guide" ? { styleGuideMarkdown: text } : {}),
  });
  return {
    systemStable: prompt.systemStable,
    meditationContext: prompt.meditationContext,
    taskContent: prompt.taskContent,
  };
}

/**
 * Admin Pre-prompts (script-generation prompts + style guides), versioned in Dynamo.
 *
 * GET  /admin/preprompts
 * GET  /admin/preprompts/{id}
 * GET  /admin/preprompts/{id}/versions
 * GET  /admin/preprompts/{id}/versions/{n}
 * POST /admin/preprompts/{id}/versions            { text, note? }
 * POST /admin/preprompts/{id}/versions/{n}/prefer { preferred, label? }
 * POST /admin/preprompts/{id}/versions/{n}/restore { note? }
 * POST /admin/preprompts/{id}/preview             { text? }
 * POST /admin/preprompts/import                   { bundle } (consciously-import.json)
 * GET  /admin/preprompts/{id}/dataset?version=&style=&skeleton=   (datasets, read-only)
 * GET  /admin/preprompts/conformance?days=        (Create conformance scores, read-only)
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;
  const user = admin as ConsciouslyAuthUser;
  const authorEmail = user.email?.trim() || user.sub;

  try {
    const route = parseRoute(event);
    if (!route) return json(404, { error: "Not found" });

    if ("id" in route && !getRegistryEntry(route.id)) {
      return json(404, { error: `Unknown pre-prompt: ${route.id}` });
    }

    if (route.kind === "import") {
      if (method !== "POST") return json(405, { error: "Method not allowed" });
      const body = parseBody(event);
      const bundle = (
        body.bundle && typeof body.bundle === "object" ? body.bundle : body
      ) as HarvesterBundle;
      const summary = await importHarvesterBundle({
        bundle,
        importedVia: "admin",
        authorEmail,
      });
      return json(200, { summary });
    }

    if (route.kind === "conformance") {
      if (method !== "GET") return json(405, { error: "Method not allowed" });
      const q = event.queryStringParameters ?? {};
      const days = q.days ? Number(q.days) : undefined;
      const out = await loadRecentConformance({
        ...(days && Number.isFinite(days) ? { days } : {}),
      });
      return json(200, out);
    }

    if (route.kind === "dataset") {
      if (method !== "GET") return json(405, { error: "Method not allowed" });
      if (!isDatasetId(route.id)) {
        return json(400, { error: "Not a dataset entry" });
      }
      const q = event.queryStringParameters ?? {};
      const version = q.version ? Number(q.version) : undefined;
      const view = await getDatasetView({
        id: route.id,
        ...(version && Number.isFinite(version) ? { version } : {}),
        ...(q.style ? { style: q.style } : {}),
        ...(q.skeleton ? { skeletonId: q.skeleton } : {}),
      });
      return json(200, { view });
    }

    if (method === "GET") {
      if (route.kind === "list") {
        const { entries, meta } = await listPrepromptEntries();
        return json(200, { entries, meta });
      }
      if (route.kind === "entry") {
        const found = await getPrepromptEntry(route.id);
        if (!found) return json(404, { error: "Not found" });
        const versions = await listPrepromptVersions(route.id);
        const reg = getRegistryEntry(route.id)!;
        return json(200, {
          entry: found.entry,
          latest: found.latest,
          versions,
          defaultText: normalizePrepromptText(PREPROMPT_DEFAULTS[route.id] ?? ""),
          sampleValues: PREPROMPT_SAMPLE_PLACEHOLDERS,
          repoFileName:
            reg.group === "dataset"
              ? `${route.id}.json`
              : (reg.repoRelativePath.split("/").pop() ?? route.id),
        });
      }
      if (route.kind === "versions") {
        return json(200, { versions: await listPrepromptVersions(route.id) });
      }
      if (route.kind === "version") {
        const v = await getPrepromptVersion(route.id, route.n);
        if (!v) return json(404, { error: "Version not found" });
        return json(200, { version: v });
      }
      return json(405, { error: "Method not allowed" });
    }

    if (method === "POST") {
      const body = parseBody(event);
      if (route.kind === "versions") {
        const text = typeof body.text === "string" ? body.text : "";
        const note = typeof body.note === "string" ? body.note : undefined;
        const version = await saveManualPrepromptVersion({
          id: route.id,
          text,
          note,
          authorEmail,
        });
        return json(200, { version });
      }
      if (route.kind === "prefer") {
        const preferred = body.preferred !== false;
        const label = typeof body.label === "string" ? body.label : undefined;
        const out = await setPreferred({
          id: route.id,
          version: route.n,
          preferred,
          label,
        });
        return json(200, out);
      }
      if (route.kind === "restore") {
        const note = typeof body.note === "string" ? body.note : undefined;
        const version = await restorePrepromptVersion({
          id: route.id,
          version: route.n,
          authorEmail,
          note,
        });
        return json(200, { version });
      }
      if (route.kind === "preview") {
        const reg = getRegistryEntry(route.id)!;
        if (reg.group === "dataset") {
          return json(400, { error: "Datasets have no prompt preview." });
        }
        let text = typeof body.text === "string" ? body.text : "";
        if (!text.trim()) {
          const found = await getPrepromptEntry(route.id);
          text = found?.latest?.text ?? PREPROMPT_DEFAULTS[route.id] ?? "";
        }
        text = normalizePrepromptText(text);
        return json(200, {
          missingPlaceholders: missingRequiredPlaceholders(reg, text),
          sampleValues: PREPROMPT_SAMPLE_PLACEHOLDERS,
          filledText: fillPrepromptPlaceholders(
            text,
            PREPROMPT_SAMPLE_PLACEHOLDERS,
          ),
          assembled: buildPreview(route.id, text),
        });
      }
      return json(405, { error: "Method not allowed" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    if (e instanceof PrepromptError) {
      return json(e.statusCode, { error: e.message });
    }
    const msg = e instanceof Error ? e.message : "Pre-prompts request failed";
    console.error("admin-preprompts", e);
    return json(500, { error: msg });
  }
}
