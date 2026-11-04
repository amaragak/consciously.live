/**
 * POST /admin/email-test { to } — send a test email through the live provider
 * (e.g. to an @privaterelay.appleid.com address to confirm relay delivery).
 * Always requires a signed-in admin, even while the rest of the admin API is open.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  jsonAuth,
  optionsAuth,
  requireUserJson,
} from "./_shared/consciously-auth-http";
import { parseAdminEmails } from "./_shared/consciously-privileges";
import { emailProvider, sendTransactionalEmail } from "./_shared/consciously-email";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") return jsonAuth(405, { error: "Method not allowed" }, event);

  const user = await requireUserJson(event);
  if (!("sub" in user)) return user;
  const email = user.email?.trim().toLowerCase() ?? "";
  const admins = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (user.role !== "admin" && !(email && admins.includes(email))) {
    return jsonAuth(403, { error: "Admin access required" }, event);
  }

  let to = "";
  try {
    const body = JSON.parse(event.body || "{}") as { to?: unknown };
    to = typeof body.to === "string" ? body.to.trim() : "";
  } catch {
    return jsonAuth(400, { error: "Invalid JSON body" }, event);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
    return jsonAuth(400, { error: "Enter a valid email address" }, event);
  }

  const provider = emailProvider();
  const sender = provider === "ses" ? process.env.EMAIL_FROM : process.env.AUTH_EMAIL_FROM;
  try {
    const out = await sendTransactionalEmail({
      toEmail: to,
      subject: "Consciously test email",
      text: `This is a test email from Consciously.\n\nProvider: ${provider}\nSender: ${sender ?? "?"}\nRequested by: ${email || user.sub}\nSent: ${new Date().toISOString()}\n\nIf you can read this, delivery to this address works.`,
    });
    console.info("admin email test", { to, provider, by: email, messageId: out.messageId });
    return jsonAuth(200, { ok: true, provider, sender, messageId: out.messageId ?? null }, event);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("admin email test failed", { to, provider, detail });
    return jsonAuth(502, { error: "Send failed", provider, sender, detail: detail.slice(0, 800) }, event);
  }
}
