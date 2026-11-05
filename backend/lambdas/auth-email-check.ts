/**
 * POST /auth/email-check { email, deviceId? }
 *
 * Email-first sign-in: tells the client which step comes next for an email.
 * Same response shape and (padded) timing whether or not the account exists;
 * rate-limited per IP and per device so it can't be used to test many addresses.
 *
 *   { next: "signin" | "signup", hasPassword, providers: ("apple"|"google")[], hasPasskey }
 *
 * - hasPassword: a Cognito user exists for the email.
 * - providers: Apple / Google recorded by /auth/social on the Users row.
 * - next is "signup" when there's no password and no known provider; creating a
 *   password then links to any existing Users row for that email.
 */
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { optionsAuth } from "./_shared/consciously-auth-http";
import { corsHeadersForEvent } from "./_shared/consciously-auth-tokens";
import { rateLimited } from "./_shared/rate-limit";

const cognito = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MIN_RESPONSE_MS = 700;
const IP_WINDOW_SEC = 60 * 60;
const IP_MAX_PER_WINDOW = 30;
const DEVICE_WINDOW_SEC = 60 * 60;
const DEVICE_MAX_PER_WINDOW = 15;

type Provider = "apple" | "google";
type CheckResult = {
  next: "signin" | "signup";
  hasPassword: boolean;
  providers: Provider[];
  hasPasskey: boolean;
};

const NEW_ACCOUNT: CheckResult = {
  next: "signup",
  hasPassword: false,
  providers: [],
  hasPasskey: false,
};

function json(
  event: APIGatewayProxyEventV2,
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeadersForEvent(event) },
    body: JSON.stringify(payload),
  };
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (!e || e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function normalizeDeviceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const d = raw.trim();
  return /^[A-Za-z0-9-]{8,64}$/.test(d) ? d : null;
}

function attr(user: UserType, name: string): string {
  return user.Attributes?.find((a) => a.Name === name)?.Value?.trim() ?? "";
}

async function findCognitoUser(userPoolId: string, email: string): Promise<UserType | undefined> {
  const out = await cognito.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, "")}"`,
      Limit: 5,
    }),
  );
  return out.Users?.find((u) => attr(u, "email").toLowerCase() === email);
}

async function recordedProviders(email: string): Promise<Provider[]> {
  const got = await ddb.send(
    new GetCommand({
      TableName: process.env.USERS_TABLE_NAME!,
      Key: { email },
      ProjectionExpression: "authProviders",
    }),
  );
  const raw = got.Item?.authProviders as Set<string> | string[] | undefined;
  const list = raw ? Array.from(raw) : [];
  return (["apple", "google"] as const).filter((p) => list.includes(p));
}

/**
 * USER_AUTH without a preferred challenge returns SELECT_CHALLENGE listing the
 * factors the user can use; WEB_AUTHN is present only when a passkey is registered.
 */
async function userHasPasskey(region: string, clientId: string, username: string): Promise<boolean> {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      ClientId: clientId,
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: username },
    }),
  });
  if (!res.ok) return false;
  const body = (await res.json().catch(() => ({}))) as { AvailableChallenges?: string[] };
  return Array.isArray(body.AvailableChallenges) && body.AvailableChallenges.includes("WEB_AUTHN");
}

async function check(email: string): Promise<CheckResult> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.COGNITO_CLIENT_ID?.trim();
  const region = process.env.COGNITO_REGION?.trim();
  if (!userPoolId || !clientId || !region) throw new Error("Cognito is not configured");

  const [cognitoUser, providers] = await Promise.all([
    findCognitoUser(userPoolId, email),
    recordedProviders(email),
  ]);
  const hasPassword = Boolean(cognitoUser);
  if (!hasPassword && providers.length === 0) return NEW_ACCOUNT;

  const hasPasskey =
    cognitoUser?.UserStatus === "CONFIRMED" && cognitoUser.Username
      ? await userHasPasskey(region, clientId, cognitoUser.Username).catch(() => false)
      : false;
  return { next: "signin", hasPassword, providers, hasPasskey };
}

async function padTo(startedAt: number): Promise<void> {
  const wait = MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") {
    return json(event, 405, { error: "Method not allowed" });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body ?? "{}";
    body = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return json(event, 400, { error: "Invalid JSON" });
  }
  const email = normalizeEmail(body.email);
  if (!email) return json(event, 400, { error: "Enter a valid email address." });

  const startedAt = Date.now();
  const table = process.env.MAGIC_LINK_TABLE_NAME?.trim();
  if (table) {
    const ip = event.requestContext.http.sourceIp?.trim() || "unknown";
    const deviceId = normalizeDeviceId(body.deviceId);
    const [ipLimited, deviceLimited] = await Promise.all([
      rateLimited(table, `rl:email-check:ip:${ip}`, IP_WINDOW_SEC, IP_MAX_PER_WINDOW),
      deviceId
        ? rateLimited(table, `rl:email-check:device:${deviceId}`, DEVICE_WINDOW_SEC, DEVICE_MAX_PER_WINDOW)
        : Promise.resolve(false),
    ]);
    if (ipLimited || deviceLimited) {
      await padTo(startedAt);
      return json(event, 429, { error: "Too many attempts. Try again in a little while." });
    }
  }

  try {
    const result = await check(email);
    await padTo(startedAt);
    return json(event, 200, result);
  } catch (e) {
    console.error("auth-email-check", e instanceof Error ? e.message : e);
    await padTo(startedAt);
    return json(event, 500, { error: "Couldn't check that email. Try again." });
  }
}
