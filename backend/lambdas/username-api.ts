/**
 * Username API (authenticated):
 *   GET  /me/username          — current username + availability meta
 *   GET  /me/username/check?u= — live availability for a candidate
 *   PATCH /me/username         — { username } claim / change
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { optionalUserJson, jsonAuth } from "./_shared/consciously-auth-http";
import {
  ensureDefaultUsername,
  ensureHouseAccount,
  getUserUsernameFields,
  setChosenUsername,
  getUsernameRegistry,
} from "./_shared/username-registry";
import {
  HOUSE_EMAIL,
  USERNAME_UNAVAILABLE_MESSAGE,
  usernameChangeAllowed,
  usernamePrefillFromDisplayName,
  validateChosenUsername,
} from "./_shared/usernames";

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const auth = await optionalUserJson(event, null);
  if (!auth?.sub || !auth.email) {
    return json(401, { error: "Sign in required" });
  }
  const isAdmin = auth.role === "admin";

  try {
    if (method === "GET") {
      const path = event.rawPath || "";
      if (path.endsWith("/check")) {
        const raw =
          event.queryStringParameters?.u ??
          event.queryStringParameters?.username ??
          "";
        const validated = validateChosenUsername(raw, {
          allowReserved: isAdmin,
        });
        if (!validated.ok) {
          return json(200, { available: false, error: validated.error });
        }
        const reg = await getUsernameRegistry(validated.username);
        if (reg?.status === "active" && reg.email === auth.email) {
          return json(200, { available: true, username: validated.username });
        }
        // Admins may adopt the synthetic house username.
        if (
          isAdmin &&
          reg?.status === "active" &&
          reg.email === HOUSE_EMAIL
        ) {
          return json(200, { available: true, username: validated.username });
        }
        if (reg && reg.status === "active") {
          return json(200, {
            available: false,
            error: USERNAME_UNAVAILABLE_MESSAGE,
          });
        }
        return json(200, { available: true, username: validated.username });
      }

      // Keep house account bootstrapped so Listen examples resolve.
      try {
        await ensureHouseAccount();
      } catch (err) {
        console.error("ensureHouseAccount", err);
      }

      let fields = await getUserUsernameFields(auth.email);
      if (!fields.username) {
        const ensured = await ensureDefaultUsername({
          email: auth.email,
          userId: auth.sub,
        });
        fields = {
          username: ensured.username,
          isDefault: ensured.isDefault,
          chosen: ensured.chosen,
          changedAt: null,
        };
      }
      const gate = usernameChangeAllowed(fields.changedAt);
      return json(200, {
        username: fields.username,
        isDefault: fields.isDefault,
        chosen: fields.chosen,
        changedAt: fields.changedAt,
        canChange: !fields.chosen || gate.ok,
        nextAllowedAt: gate.nextAllowedAt,
        prefill: usernamePrefillFromDisplayName(auth.name ?? null),
        helper:
          "Your public links use this: consciously.live/listen/<username>. You can change it in Settings.",
      });
    }

    if (method === "PATCH") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body || "{}") as Record<string, unknown>;
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const desired =
        typeof body.username === "string" ? body.username : "";
      const result = await setChosenUsername({
        email: auth.email,
        userId: auth.sub,
        desired,
        isAdmin,
      });
      if (!result.ok) {
        return json(400, {
          error: result.error,
          nextAllowedAt: result.nextAllowedAt ?? null,
        });
      }
      return json(200, {
        username: result.username,
        isDefault: false,
        chosen: true,
        nextAllowedAt: result.nextAllowedAt,
        helper:
          "Your public links use this: consciously.live/listen/<username>. You can change it in Settings.",
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Username failed";
    console.error("username-api", msg);
    return json(500, { error: msg });
  }
}
