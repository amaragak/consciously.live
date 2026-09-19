/**
 * Case-insensitive confirmation resend.
 * Looks up the user by email, then calls Cognito ResendConfirmationCode with
 * the stored address (avoids a broken Admin SDK export in the bundle).
 */
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { optionsAuth } from "./_shared/consciously-auth-http";
import { corsHeadersForEvent } from "./_shared/consciously-auth-tokens";

const cognito = new CognitoIdentityProviderClient({});

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

function ok(
  event: APIGatewayProxyEventV2,
  extra?: { pendingVerification?: boolean },
) {
  return json(event, 200, { ok: true, ...extra });
}

function attr(user: UserType, name: string): string {
  return user.Attributes?.find((a) => a.Name === name)?.Value?.trim() ?? "";
}

async function findUserByEmail(
  userPoolId: string,
  email: string,
): Promise<UserType | undefined> {
  const local = email.split("@")[0] ?? email;
  const out = await cognito.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email ^= "${local.replace(/"/g, "")}"`,
      Limit: 60,
    }),
  );
  return out.Users?.find(
    (user) => attr(user, "email").toLowerCase() === email,
  );
}

async function resendConfirmationCode(
  region: string,
  clientId: string,
  username: string,
): Promise<void> {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.ResendConfirmationCode",
    },
    body: JSON.stringify({
      ClientId: clientId,
      Username: username,
    }),
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as {
    __type?: string;
    message?: string;
  };
  throw new Error(body.message || body.__type || `Resend failed (${res.status})`);
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method === "OPTIONS") {
    return optionsAuth(event);
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.COGNITO_CLIENT_ID?.trim();
  const region = process.env.COGNITO_REGION?.trim() || "eu-west-2";
  if (!userPoolId || !clientId) {
    return json(event, 500, { error: "Cognito is not configured" });
  }

  let body: { email?: unknown } = {};
  try {
    body = JSON.parse(event.body || "{}") as { email?: unknown };
  } catch {
    return ok(event);
  }
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return json(event, 400, { error: "Valid `email` is required" });
  }

  try {
    const user = await findUserByEmail(userPoolId, email);
    const pendingVerification = user?.UserStatus === "UNCONFIRMED";
    const username = user
      ? (attr(user, "email") || user.Username || "").trim()
      : "";
    if (username && pendingVerification) {
      await resendConfirmationCode(region, clientId, username);
    }
    return ok(event, { pendingVerification: Boolean(pendingVerification) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not resend";
    console.error("cognito resend", msg);
    return json(event, 502, { error: "Could not resend the code." });
  }
}
