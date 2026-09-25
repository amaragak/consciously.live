/**
 * POST /billing/stripe/webhook — Stripe → elevate/demote Users.plan.
 * No JWT. Verifies stripe-signature with medimade/STRIPE_WEBHOOK_SECRET.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import type Stripe from "stripe";
import {
  findUserEmailByStripeCustomerId,
  updateUserPlan,
} from "./_shared/consciously-users";
import {
  billingKeyForStripePriceId,
  getStripe,
  getStripeWebhookSecret,
  planFromCheckoutMetadata,
} from "./_shared/stripe-billing";
import type { ConsciouslyPlan } from "./_shared/consciously-privileges";

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

function rawBody(event: APIGatewayProxyEventV2): string {
  const body = event.body ?? "";
  if (event.isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }
  return body;
}

function emailFromMeta(meta: Stripe.Metadata | null | undefined): string | null {
  const e = meta?.email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

async function resolveEmail(params: {
  meta?: Stripe.Metadata | null;
  customerId?: string | null;
  customerEmail?: string | null;
}): Promise<string | null> {
  const fromMeta = emailFromMeta(params.meta);
  if (fromMeta) return fromMeta;
  const fromCustomer = params.customerEmail?.trim().toLowerCase();
  if (fromCustomer && fromCustomer.includes("@")) return fromCustomer;
  if (params.customerId) {
    return findUserEmailByStripeCustomerId(params.customerId);
  }
  return null;
}

async function planFromSubscription(
  sub: Stripe.Subscription,
): Promise<ConsciouslyPlan> {
  if (sub.metadata?.priceKey || sub.metadata?.plan) {
    return planFromCheckoutMetadata(sub.metadata);
  }
  const priceId = sub.items.data[0]?.price?.id;
  if (priceId) {
    const key = await billingKeyForStripePriceId(priceId);
    if (key) return key;
  }
  return "pro";
}

async function applyPaid(
  email: string,
  plan: ConsciouslyPlan,
  customerId: string | null,
  subscriptionId: string | null,
): Promise<void> {
  await updateUserPlan(email, plan, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
  console.log("billing plan updated", { email, plan, customerId, subscriptionId });
}

async function applyFree(
  email: string,
  customerId: string | null,
): Promise<void> {
  await updateUserPlan(email, "free", {
    stripeCustomerId: customerId,
    stripeSubscriptionId: null,
  });
  console.log("billing plan cleared", { email, customerId });
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const sig =
    event.headers?.["stripe-signature"] ||
    event.headers?.["Stripe-Signature"];
  if (!sig) {
    return json(400, { error: "Missing stripe-signature" });
  }

  let stripeEvent: Stripe.Event;
  try {
    const stripe = await getStripe();
    const secret = await getStripeWebhookSecret();
    stripeEvent = stripe.webhooks.constructEvent(rawBody(event), sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("stripe webhook verify failed", msg);
    return json(400, { error: "Invalid signature", detail: msg });
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const email = await resolveEmail({
          meta: session.metadata,
          customerId:
            typeof session.customer === "string" ? session.customer : null,
          customerEmail: session.customer_details?.email ?? session.customer_email,
        });
        if (!email) {
          console.warn("checkout.session.completed missing email", session.id);
          break;
        }
        const plan = planFromCheckoutMetadata(session.metadata ?? {});
        await applyPaid(
          email,
          plan,
          typeof session.customer === "string" ? session.customer : null,
          typeof session.subscription === "string" ? session.subscription : null,
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        const email = await resolveEmail({
          meta: sub.metadata,
          customerId: typeof sub.customer === "string" ? sub.customer : null,
        });
        if (!email) break;
        const status = sub.status;
        if (
          status === "active" ||
          status === "trialing" ||
          status === "past_due"
        ) {
          await applyPaid(
            email,
            await planFromSubscription(sub),
            typeof sub.customer === "string" ? sub.customer : null,
            sub.id,
          );
        } else if (
          status === "canceled" ||
          status === "unpaid" ||
          status === "incomplete_expired"
        ) {
          await applyFree(
            email,
            typeof sub.customer === "string" ? sub.customer : null,
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        const email = await resolveEmail({
          meta: sub.metadata,
          customerId: typeof sub.customer === "string" ? sub.customer : null,
        });
        if (!email) break;
        await applyFree(
          email,
          typeof sub.customer === "string" ? sub.customer : null,
        );
        break;
      }
      default:
        break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("stripe webhook handler error", stripeEvent.type, msg);
    return json(500, { error: "Webhook handler failed", detail: msg });
  }

  return json(200, { received: true });
}
