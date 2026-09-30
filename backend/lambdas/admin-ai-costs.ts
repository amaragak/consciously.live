/**
 * GET /admin/ai-costs — pricing catalog, ledger spend totals, credit balances.
 * POST /admin/ai-costs — { action: "set-credits", provider, remainingUsd?, note? }
 *
 * Tracked spend comes from the AI usage ledger (written at call time), not from
 * reconstructing library / catalog tables.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  loadAiCreditBalances,
  saveAiCreditBalances,
} from "./_shared/ai-credit-balances";
import {
  AI_PROVIDER_CATALOG,
  type AiProviderId,
} from "./_shared/ai-provider-pricing";
import { loadAiUsageTotals } from "./_shared/ai-usage";

const secrets = new SecretsManagerClient({});

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

async function secretString(arnEnv: string): Promise<string | null> {
  const arn = process.env[arnEnv]?.trim();
  if (!arn) return null;
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = out.SecretString?.trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    for (const k of ["apiKey", "API_KEY", "key", "FISH_AUDIO_API_KEY"]) {
      if (typeof j[k] === "string" && j[k].trim()) return j[k].trim();
    }
  } catch {
    /* plain string secret */
  }
  return raw;
}

async function fetchFishCreditUsd(): Promise<{
  remainingUsd: number | null;
  raw: Record<string, unknown> | null;
  error: string | null;
}> {
  try {
    const key = await secretString("FISH_AUDIO_SECRET_ARN");
    if (!key) return { remainingUsd: null, raw: null, error: "Fish secret missing" };
    const res = await fetch("https://api.fish.audio/wallet/self/api-credit", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        remainingUsd: null,
        raw: null,
        error: `Fish wallet ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = JSON.parse(text) as Record<string, unknown>;
    const creditRaw = data.credit;
    const n =
      typeof creditRaw === "number"
        ? creditRaw
        : typeof creditRaw === "string"
          ? Number(creditRaw)
          : NaN;
    return {
      remainingUsd: Number.isFinite(n) ? n : null,
      raw: data,
      error: null,
    };
  } catch (e) {
    return {
      remainingUsd: null,
      raw: null,
      error: e instanceof Error ? e.message : "Fish wallet failed",
    };
  }
}

function trackedDetailFor(
  provider: AiProviderId,
  t: {
    callCount: number;
    quantity: number;
    inputTokens: number;
    outputTokens: number;
    updatedAt: string | null;
  },
): string {
  if (t.callCount <= 0) {
    return "No metered calls yet (ledger starts from deploy)";
  }
  if (provider === "anthropic") {
    return `${t.callCount.toLocaleString()} calls · ${t.inputTokens.toLocaleString()} in / ${t.outputTokens.toLocaleString()} out tokens`;
  }
  if (provider === "fish") {
    return `${t.callCount.toLocaleString()} calls · ${t.quantity.toLocaleString()} UTF-8 bytes`;
  }
  if (provider === "speechify") {
    return `${t.callCount.toLocaleString()} calls · ${t.quantity.toLocaleString()} chars`;
  }
  if (provider === "openai" || provider === "google") {
    return `${t.callCount.toLocaleString()} calls · ${t.quantity.toLocaleString()} images`;
  }
  return `${t.callCount.toLocaleString()} calls`;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  try {
    if (method === "GET") {
      const providerIds = AI_PROVIDER_CATALOG.map((p) => p.id);
      const [balances, fishLive, totals] = await Promise.all([
        loadAiCreditBalances(),
        fetchFishCreditUsd(),
        loadAiUsageTotals(providerIds),
      ]);
      const totalsById = new Map(totals.map((t) => [t.provider, t]));

      const providers = AI_PROVIDER_CATALOG.map((p) => {
        const manual = balances[p.id];
        const liveUsd = p.id === "fish" ? fishLive.remainingUsd : null;
        const remainingUsd =
          liveUsd != null
            ? liveUsd
            : manual.remainingUsd != null
              ? manual.remainingUsd
              : null;
        const t = totalsById.get(p.id) ?? {
          provider: p.id,
          callCount: 0,
          usd: 0,
          quantity: 0,
          inputTokens: 0,
          outputTokens: 0,
          updatedAt: null,
        };
        return {
          ...p,
          remainingUsd,
          remainingSource:
            liveUsd != null
              ? "live"
              : manual.remainingUsd != null
                ? "manual"
                : "unknown",
          manualNote: manual.note,
          manualUpdatedAt: manual.updatedAt,
          trackedSpendUsd: t.usd,
          trackedDetail: trackedDetailFor(p.id, t),
          callCount: t.callCount,
          ledgerUpdatedAt: t.updatedAt,
          fishLiveError: p.id === "fish" ? fishLive.error : null,
        };
      });

      const trackedTotalUsd = providers.reduce(
        (a, p) => a + (p.trackedSpendUsd || 0),
        0,
      );

      return json(200, {
        generatedAt: new Date().toISOString(),
        providers,
        trackedTotalUsd,
        notes: [
          "Tracked spend is written to the AI usage ledger at call time (O(1) totals read — no table scans).",
          "Historical usage from before the ledger was deployed is not included.",
          "Fish remaining credit is live from the wallet API.",
          "Set manual remaining balances for Anthropic / OpenAI / Google / Speechify until Admin billing keys are wired.",
        ],
      });
    }

    if (method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body || "{}") as Record<string, unknown>;
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const action = String(body.action ?? "").trim();
      if (action !== "set-credits") {
        return json(400, { error: "Unknown action" });
      }
      const provider = String(body.provider ?? "").trim() as AiProviderId;
      if (!AI_PROVIDER_CATALOG.some((p) => p.id === provider)) {
        return json(400, { error: "Unknown provider" });
      }
      let remainingUsd: number | null = null;
      if (body.remainingUsd !== undefined && body.remainingUsd !== null) {
        const n = Number(body.remainingUsd);
        if (!Number.isFinite(n)) {
          return json(400, { error: "remainingUsd must be a number" });
        }
        remainingUsd = n;
      }
      const note =
        typeof body.note === "string" ? body.note.trim().slice(0, 280) : "";
      const next = await saveAiCreditBalances({
        [provider]: {
          remainingUsd,
          note,
          updatedAt: new Date().toISOString(),
        },
      });
      return json(200, { ok: true, balances: next });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI costs failed";
    console.error("admin-ai-costs", msg);
    return json(500, { error: msg });
  }
}
