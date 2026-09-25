/**
 * POST /billing/checkout-session — create a Stripe Checkout session for Create/Pro.
 * Auth required. Body: { priceKey: "create"|"pro", successUrl?, cancelUrl? }
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  jsonAuth,
  optionsAuth,
  requireUserJson,
} from "./_shared/consciously-auth-http";
import {
  coerceBillingPriceKey,
  planForBillingPriceKey,
} from "./_shared/consciously-privileges";
import {
  getStripe,
  isAllowedCheckoutReturnUrl,
  listPublicBillingPrices,
  stripePriceIdForKey,
} from "./_shared/stripe-billing";

function defaultOrigin(event: APIGatewayProxyEventV2): string {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  if (origin && isAllowedCheckoutReturnUrl(origin)) return origin.replace(/\/$/, "");
  return (
    process.env.AUTH_WEBAPP_ORIGIN?.trim().replace(/\/$/, "") ||
    "https://consciously.live"
  );
}

function resolveReturnUrl(
  raw: unknown,
  fallbackPath: string,
  origin: string,
): string | null {
  if (typeof raw === "string" && raw.trim()) {
    const u = raw.trim();
    if (!isAllowedCheckoutReturnUrl(u)) return null;
    return u;
  }
  return `${origin}${fallbackPath}`;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method === "OPTIONS") {
    return optionsAuth(event);
  }
  if (event.requestContext.http.method !== "POST") {
    return jsonAuth(405, { error: "Method not allowed" }, event);
  }

  const auth = await requireUserJson(event);
  if ("statusCode" in auth) return auth;
  const user = auth as import("./_shared/consciously-auth-http").ConsciouslyAuthUser;

  if (!user.email?.trim()) {
    return jsonAuth(
      400,
      { error: "A verified email is required to upgrade" },
      event,
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body || "{}") as Record<string, unknown>;
  } catch {
    return jsonAuth(400, { error: "Invalid JSON body" }, event);
  }

  const priceKey = coerceBillingPriceKey(body.priceKey);
  if (!priceKey) {
    return jsonAuth(
      400,
      {
        error: "priceKey must be create or pro",
        prices: await listPublicBillingPrices(),
      },
      event,
    );
  }

  const priceId = await stripePriceIdForKey(priceKey);
  if (!priceId) {
    return jsonAuth(
      503,
      {
        error: `Stripe price for ${priceKey} is not configured yet`,
        detail:
          "Set STRIPE_PRICE_CREATE / STRIPE_PRICE_PRO on the billing Lambda (CDK context stripePriceCreate / stripePricePro).",
      },
      event,
    );
  }

  const origin = defaultOrigin(event);
  const successUrl = resolveReturnUrl(
    body.successUrl,
    `/pricing/success?plan=${priceKey}`,
    origin,
  );
  const cancelUrl = resolveReturnUrl(
    body.cancelUrl,
    `/pricing?cancelled=1&plan=${priceKey}`,
    origin,
  );
  if (!successUrl || !cancelUrl) {
    return jsonAuth(
      400,
      { error: "successUrl / cancelUrl must be on an allowed Consciously origin" },
      event,
    );
  }

  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email.trim().toLowerCase(),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl.includes("{CHECKOUT_SESSION_ID}")
        ? successUrl
        : `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      client_reference_id: user.sub,
      metadata: {
        userId: user.sub,
        email: user.email.trim().toLowerCase(),
        priceKey,
        plan: planForBillingPriceKey(priceKey),
      },
      subscription_data: {
        metadata: {
          userId: user.sub,
          email: user.email.trim().toLowerCase(),
          priceKey,
          plan: planForBillingPriceKey(priceKey),
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return jsonAuth(500, { error: "Stripe did not return a checkout URL" }, event);
    }

    return jsonAuth(
      200,
      {
        ok: true,
        url: session.url,
        sessionId: session.id,
        priceKey,
        plan: planForBillingPriceKey(priceKey),
      },
      event,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("checkout session failed", msg);
    return jsonAuth(500, { error: "Could not start checkout", detail: msg }, event);
  }
}
