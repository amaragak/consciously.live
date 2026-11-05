/**
 * Sign in with Apple / Google using the provider's ID token directly (native
 * app plugins and Apple JS on the web), then mint a Consciously session.
 *
 * Accounts are keyed by email, so a verified provider email that matches an
 * existing account signs into it. Apple private relay addresses
 * (`…@privaterelay.appleid.com`) are real, stable inboxes and are treated like
 * any other email.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "crypto";
import { JwtRsaVerifier } from "aws-jwt-verify";
import { optionsAuth } from "./_shared/consciously-auth-http";
import { corsHeadersForEvent } from "./_shared/consciously-auth-tokens";
import { issueConsciouslySession } from "./_shared/consciously-session";
import { getOrCreateUserByEmail } from "./_shared/consciously-users";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Provider = "apple" | "google";

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

function csv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const appleAudiences = csv(process.env.APPLE_AUDIENCES);
const googleAudiences = csv(process.env.GOOGLE_AUDIENCES);

const appleVerifier = appleAudiences.length
  ? JwtRsaVerifier.create({
      issuer: "https://appleid.apple.com",
      audience: appleAudiences,
      jwksUri: "https://appleid.apple.com/auth/keys",
    })
  : null;

// Google issues both issuer spellings.
const googleVerifier = googleAudiences.length
  ? JwtRsaVerifier.create([
      {
        issuer: "https://accounts.google.com",
        audience: googleAudiences,
        jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
      },
      {
        issuer: "accounts.google.com",
        audience: googleAudiences,
        jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
      },
    ])
  : null;

function claimTrue(v: unknown): boolean {
  return v === true || v === "true";
}

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  return t && t.length <= 80 ? t : null;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") return json(event, 405, { error: "Method not allowed" });

  let body: { provider?: unknown; idToken?: unknown; nonce?: unknown; name?: unknown };
  try {
    body = JSON.parse(event.body || "{}") as typeof body;
  } catch {
    return json(event, 400, { error: "Invalid JSON body" });
  }
  const provider = body.provider === "apple" || body.provider === "google"
    ? (body.provider as Provider)
    : null;
  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
  if (!provider || !idToken) {
    return json(event, 400, { error: "`provider` (apple | google) and `idToken` are required" });
  }

  const verifier = provider === "apple" ? appleVerifier : googleVerifier;
  if (!verifier) {
    return json(event, 503, { error: `${provider === "apple" ? "Apple" : "Google"} sign-in isn’t set up yet.` });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await verifier.verify(idToken)) as unknown as Record<string, unknown>;
  } catch {
    return json(event, 401, { error: "Could not verify that sign-in. Try again." });
  }

  // Apple: the client hashes its raw nonce into the request; check when sent.
  if (typeof body.nonce === "string" && body.nonce && provider === "apple") {
    const expected = createHash("sha256").update(body.nonce).digest("hex");
    if (payload.nonce !== expected && payload.nonce !== body.nonce) {
      return json(event, 401, { error: "Sign-in check failed. Try again." });
    }
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return json(event, 400, {
      error: "Your account didn’t share an email address. Try another sign-in method.",
    });
  }
  if (!claimTrue(payload.email_verified)) {
    return json(event, 400, { error: "That email address isn’t verified yet." });
  }

  try {
    const user = await getOrCreateUserByEmail(email);
    // Read by /auth/email-check to offer the right provider to password-less accounts.
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.USERS_TABLE_NAME!,
        Key: { email: user.email },
        UpdateExpression: "ADD #ap :p",
        ExpressionAttributeNames: { "#ap": "authProviders" },
        ExpressionAttributeValues: { ":p": new Set([provider]) },
      }),
    );
    // Apple sends the name only on the first sign-in (from the client, not the token).
    const providedName =
      normalizeName(body.name) ?? (provider === "google" ? normalizeName(payload.name) : null);
    let displayName = user.displayName?.trim() || null;
    if (!displayName && providedName) {
      await ddb.send(
        new UpdateCommand({
          TableName: process.env.USERS_TABLE_NAME!,
          Key: { email: user.email },
          UpdateExpression: "SET #dn = :dn, #ua = :ua",
          ExpressionAttributeNames: { "#dn": "displayName", "#ua": "updatedAt" },
          ExpressionAttributeValues: { ":dn": providedName, ":ua": new Date().toISOString() },
        }),
      );
      displayName = providedName;
    }
    return await issueConsciouslySession({
      event,
      userId: user.userId,
      email: user.email,
      displayName,
      needsProfileName: !displayName,
      role: user.role,
      plan: user.plan,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not mint session";
    return json(event, 500, { error: msg });
  }
}
