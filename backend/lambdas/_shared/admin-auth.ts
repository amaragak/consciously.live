import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  jsonAuth,
  requireUserJson,
  type ConsciouslyAuthUser,
} from "./consciously-auth-http";
import {
  isPaidPlan,
  parseAdminEmails,
} from "./consciously-privileges";

export { parseAdminEmails };

export async function requireAdminJson(
  event: APIGatewayProxyEventV2,
): Promise<ConsciouslyAuthUser | APIGatewayProxyStructuredResultV2> {
  /** Temporary: admin UI/API is open until ADMIN_REQUIRE_AUTH=1 is set. */
  if (process.env.ADMIN_REQUIRE_AUTH !== "1") {
    return {
      sub: "admin-open",
      role: "admin",
      plan: "pro",
    };
  }
  const auth = await requireUserJson(event);
  if ("statusCode" in auth) return auth;
  const user = auth as ConsciouslyAuthUser;

  if (user.role === "admin") return user;

  const allowed = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (allowed.length === 0) {
    return jsonAuth(403, { error: "Admin access is not configured" }, event);
  }
  if (allowed.includes("*")) return user;
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email || !allowed.includes(email)) {
    return jsonAuth(
      403,
      {
        error: "Admin access required",
        detail: email
          ? `Signed in as ${email}. Set Users.role=admin or deploy with -c adminEmails=${email}.`
          : "Signed-in email missing from session.",
      },
      event,
    );
  }
  return user;
}

/** Gate paid features (plan=pro on JWT / Users). */
export async function requirePaidJson(
  event: APIGatewayProxyEventV2,
): Promise<ConsciouslyAuthUser | APIGatewayProxyStructuredResultV2> {
  const auth = await requireUserJson(event);
  if ("statusCode" in auth) return auth;
  const user = auth as ConsciouslyAuthUser;
  if (user.role === "admin" || isPaidPlan(user.plan)) return user;
  return jsonAuth(
    403,
    {
      error: "Pro plan required",
      plan: user.plan,
    },
    event,
  );
}
