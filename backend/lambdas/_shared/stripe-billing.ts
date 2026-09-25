/**
 * Stripe client + price-id resolution for Consciously billing.
 * Secrets Manager:
 *   medimade/STRIPE_SECRET_KEY
 *   medimade/STRIPE_WEBHOOK_SECRET
 *   medimade/STRIPE_PRICES — JSON {"create":"price_…","pro":"price_…","essentials":"price_…"}
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";
import {
  coerceBillingPriceKey,
  planForBillingPriceKey,
  type BillingPriceKey,
  type ConsciouslyPlan,
} from "./consciously-privileges";

const secrets = new SecretsManagerClient({});
let cachedStripe: Stripe | undefined;
let cachedWebhookSecret: string | undefined;
let cachedPrices: Partial<Record<BillingPriceKey | "essentials", string>> | undefined;
let pricesLoadPromise: Promise<void> | undefined;

async function readSecretString(nameOrArn: string): Promise<string> {
  const out = await secrets.send(
    new GetSecretValueCommand({ SecretId: nameOrArn }),
  );
  const s = out.SecretString?.trim();
  if (!s) throw new Error(`Secret ${nameOrArn} is empty`);
  return s;
}

export async function getStripe(): Promise<Stripe> {
  if (cachedStripe) return cachedStripe;
  const inline = process.env.STRIPE_SECRET_KEY?.trim();
  const name =
    process.env.STRIPE_SECRET_NAME?.trim() ||
    process.env.STRIPE_SECRET_ARN?.trim();
  const key = inline || (name ? await readSecretString(name) : "");
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY / STRIPE_SECRET_NAME is not set");
  }
  cachedStripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return cachedStripe;
}

export async function getStripeWebhookSecret(): Promise<string> {
  if (cachedWebhookSecret) return cachedWebhookSecret;
  const inline = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const name =
    process.env.STRIPE_WEBHOOK_SECRET_NAME?.trim() ||
    process.env.STRIPE_WEBHOOK_SECRET_ARN?.trim();
  const s = inline || (name ? await readSecretString(name) : "");
  if (!s) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET_NAME is not set",
    );
  }
  cachedWebhookSecret = s;
  return cachedWebhookSecret;
}

async function ensureStripePricesLoaded(): Promise<void> {
  if (cachedPrices) return;
  if (pricesLoadPromise) {
    await pricesLoadPromise;
    return;
  }
  pricesLoadPromise = (async () => {
    const fromEnv: Partial<Record<BillingPriceKey | "essentials", string>> = {};
    const createEnv = process.env.STRIPE_PRICE_CREATE?.trim();
    const proEnv = process.env.STRIPE_PRICE_PRO?.trim();
    const essentialsEnv = process.env.STRIPE_PRICE_ESSENTIALS?.trim();
    if (createEnv) fromEnv.create = createEnv;
    if (proEnv) fromEnv.pro = proEnv;
    if (essentialsEnv) fromEnv.essentials = essentialsEnv;

    const name =
      process.env.STRIPE_PRICES_SECRET_NAME?.trim() ||
      process.env.STRIPE_PRICES_SECRET_ARN?.trim();
    if (name) {
      try {
        const raw = await readSecretString(name);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const pick = (k: string): string | undefined => {
          const v = parsed[k];
          return typeof v === "string" && v.trim() ? v.trim() : undefined;
        };
        cachedPrices = {
          ...fromEnv,
          ...(pick("create") ? { create: pick("create") } : {}),
          ...(pick("pro") ? { pro: pick("pro") } : {}),
          ...(pick("essentials") ? { essentials: pick("essentials") } : {}),
        };
        return;
      } catch (e) {
        console.warn("stripe prices secret load failed", e);
      }
    }
    cachedPrices = fromEnv;
  })();
  try {
    await pricesLoadPromise;
  } finally {
    pricesLoadPromise = undefined;
  }
}

export async function stripePriceIdForKey(
  key: BillingPriceKey,
): Promise<string | null> {
  await ensureStripePricesLoaded();
  const id = cachedPrices?.[key]?.trim();
  return id || null;
}

export async function billingKeyForStripePriceId(
  priceId: string,
): Promise<BillingPriceKey | null> {
  await ensureStripePricesLoaded();
  if (cachedPrices?.create && priceId === cachedPrices.create) return "create";
  if (cachedPrices?.pro && priceId === cachedPrices.pro) return "pro";
  return null;
}

export function planFromCheckoutMetadata(meta: {
  priceKey?: unknown;
  plan?: unknown;
}): ConsciouslyPlan {
  const key = coerceBillingPriceKey(meta.priceKey);
  if (key) return planForBillingPriceKey(key);
  if (meta.plan === "pro" || meta.plan === "create") return meta.plan;
  return "pro";
}

/** Origins allowed for Checkout success/cancel redirects. */
export function isAllowedCheckoutReturnUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === "consciously.live" || host === "www.consciously.live") {
    return true;
  }
  if (host === "app.consciously.live") return true;
  if (host.endsWith(".cloudfront.net")) return true;
  return false;
}

export type PublicBillingPrice = {
  key: BillingPriceKey;
  plan: ConsciouslyPlan;
  configured: boolean;
  label: string;
  blurb: string;
};

export async function listPublicBillingPrices(): Promise<PublicBillingPrice[]> {
  await ensureStripePricesLoaded();
  return [
    {
      key: "create",
      plan: "create",
      configured: Boolean(cachedPrices?.create),
      label: "Create",
      blurb: "Personal meditation generation and your private library.",
    },
    {
      key: "pro",
      plan: "pro",
      configured: Boolean(cachedPrices?.pro),
      label: "Pro",
      blurb: "Everything in Create, plus Chat and higher generation limits.",
    },
  ];
}
