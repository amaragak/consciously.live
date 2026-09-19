/**
 * Case-insensitive confirmation resend. Looks up the Cognito user by email
 * and calls AdminResendConfirmationCode with their real username.
 */
import {
  AdminResendConfirmationCodeCommand,
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

function ok(event: APIGatewayProxyEventV2) {
  return json(event, 200, { ok: true });
}

function attr(user: UserType, name: string): string {
  return (
    user.Attributes?.find((a) => a.Name === name)?.Value?.trim() ?? ""
  );
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

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method === "OPTIONS") {
    return optionsAuth(event);
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.COGNITO_CLIENT_ID?.trim();
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
    const username = user?.Username?.trim();
    if (username && user?.UserStatus === "UNCONFIRMED") {
      await cognito.send(
        new AdminResendConfirmationCodeCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          Username: username,
        }),
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not resend";
    console.error("cognito resend", msg);
    return json(event, 502, { error: "Could not resend the code." });
  }

  return ok(event);
}
