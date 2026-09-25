/**
 * GET /billing/prices — public list of Create/Pro checkout products (no secrets).
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { jsonAuth, optionsAuth } from "./_shared/consciously-auth-http";
import { listPublicBillingPrices } from "./_shared/stripe-billing";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method === "OPTIONS") {
    return optionsAuth(event);
  }
  if (event.requestContext.http.method !== "GET") {
    return jsonAuth(405, { error: "Method not allowed" }, event);
  }

  const prices = await listPublicBillingPrices();
  const checkoutReady = prices.some((p) => p.configured);
  return jsonAuth(
    200,
    {
      prices,
      checkoutReady,
      defaultPlan: "free",
    },
    event,
  );
}
