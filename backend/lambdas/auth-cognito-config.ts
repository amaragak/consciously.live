import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { optionsAuth } from "../lib/medimade-auth-http";
import { corsHeadersForEvent } from "../lib/medimade-auth-tokens";

/**
 * Public Cognito client config for SPA / marketing (no secrets).
 * Cognito-first destination: password / passkey / social via Cognito, then
 * POST /auth/cognito/exchange → Medimade JWT. Magic-link remains during migration.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "GET") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        ...corsHeadersForEvent(event),
      },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim() || "";
  const clientId = process.env.COGNITO_CLIENT_ID?.trim() || "";
  const region = process.env.COGNITO_REGION?.trim() || "";
  const domain = process.env.COGNITO_DOMAIN?.trim() || "";
  const enabled = Boolean(userPoolId && clientId);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      ...corsHeadersForEvent(event),
    },
    body: JSON.stringify({
      enabled,
      userPoolId: enabled ? userPoolId : null,
      clientId: enabled ? clientId : null,
      region: enabled ? region : null,
      /** Cognito Hosted UI / Managed Login prefix domain (no https). */
      domain: enabled && domain ? domain : null,
      /** Issuer for ID token verification (informational). */
      issuer:
        enabled && region && userPoolId
          ? `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
          : null,
      /** Auth methods enabled on the app client / pool. */
      methods: {
        password: true,
        passkey: true,
        /** Social IdPs are added later (Google/Apple) — Hosted UI ready. */
        social: false,
      },
    }),
  };
}
