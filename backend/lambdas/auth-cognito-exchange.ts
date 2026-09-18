import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { optionsAuth } from "../lib/medimade-auth-http";
import { corsHeadersForEvent } from "../lib/medimade-auth-tokens";
import { issueMedimadeSession } from "../lib/medimade-session";
import { getOrCreateUserByEmail } from "../lib/medimade-users";

function json(
  event: APIGatewayProxyEventV2,
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeadersForEvent(event),
    },
    body: JSON.stringify(payload),
  };
}

type Verifier = ReturnType<typeof CognitoJwtVerifier.create>;
let verifier: Verifier | null = null;

function getVerifier(): Verifier {
  if (verifier) return verifier;
  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.COGNITO_CLIENT_ID?.trim();
  if (!userPoolId || !clientId) {
    throw new Error("COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID are not set");
  }
  verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "id",
    clientId,
  });
  return verifier;
}

/**
 * Exchange a Cognito ID token for a Medimade session (same JWT as magic-link).
 * Body: `{ idToken: string }`
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") return json(event, 405, { error: "Method not allowed" });

  if (!process.env.USERS_TABLE_NAME?.trim()) {
    return json(event, 500, { error: "USERS_TABLE_NAME is not set" });
  }

  let body: { idToken?: unknown };
  try {
    body = JSON.parse(event.body || "{}") as { idToken?: unknown };
  } catch {
    return json(event, 400, { error: "Invalid JSON body" });
  }
  const idToken =
    typeof body.idToken === "string" && body.idToken.trim()
      ? body.idToken.trim()
      : null;
  if (!idToken) {
    return json(event, 400, { error: "`idToken` is required" });
  }

  try {
    const payload = await getVerifier().verify(idToken);
    const emailRaw =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!emailRaw || !emailRaw.includes("@")) {
      return json(event, 400, {
        error: "Cognito token is missing a verified email",
      });
    }
    if (payload.email_verified === false) {
      return json(event, 403, { error: "Email is not verified" });
    }

    const cognitoSub =
      typeof payload.sub === "string" && payload.sub.trim()
        ? payload.sub.trim()
        : null;
    const nameFromToken =
      (typeof payload.name === "string" && payload.name.trim()) ||
      (typeof payload["cognito:username"] === "string" &&
        payload["cognito:username"].trim()) ||
      null;

    const user = await getOrCreateUserByEmail(emailRaw, { cognitoSub });
    const displayName = user.displayName || nameFromToken;
    const needsProfileName = !Boolean(displayName?.trim());

    return issueMedimadeSession({
      event,
      userId: user.userId,
      email: user.email,
      displayName,
      needsProfileName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cognito exchange failed";
    console.error("auth-cognito-exchange", msg);
    return json(event, 401, { error: "Invalid Cognito token", detail: msg });
  }
}
