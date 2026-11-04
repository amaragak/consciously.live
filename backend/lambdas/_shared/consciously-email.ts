/**
 * Transactional email. `EMAIL_PROVIDER` picks the path:
 * - `ses` (target): Amazon SES from `EMAIL_FROM` (hello@consciously.live), configuration set
 *   `SES_CONFIGURATION_SET` (bounce / complaint events, account suppression list).
 * - `brevo` (default until SES is confirmed): legacy Gmail sender `AUTH_EMAIL_FROM` via Brevo.
 *   Remove this path once SES is confirmed in production.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const secrets = new SecretsManagerClient({});
const ses = new SESv2Client({});

export type EmailProvider = "ses" | "brevo";

export function emailProvider(): EmailProvider {
  return process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "ses" ? "ses" : "brevo";
}

/** Send from the configured provider and sender. Throws on failure. */
export async function sendTransactionalEmail(params: {
  toEmail: string;
  subject: string;
  text: string;
}): Promise<{ provider: EmailProvider; messageId?: string }> {
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "Consciously";
  if (emailProvider() === "ses") {
    const fromEmail = process.env.EMAIL_FROM?.trim();
    if (!fromEmail) throw new Error("EMAIL_FROM is not set");
    const out = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: `${fromName} <${fromEmail}>`,
        Destination: { ToAddresses: [params.toEmail.trim()] },
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET?.trim() || undefined,
        Content: {
          Simple: {
            Subject: { Data: params.subject, Charset: "UTF-8" },
            Body: { Text: { Data: params.text, Charset: "UTF-8" } },
          },
        },
      }),
    );
    return { provider: "ses", messageId: out.MessageId };
  }
  const fromEmail = process.env.AUTH_EMAIL_FROM?.trim();
  if (!fromEmail) throw new Error("AUTH_EMAIL_FROM is not set");
  await sendEmailBrevo({ fromEmail, fromName, toEmail: params.toEmail, subject: params.subject, text: params.text });
  return { provider: "brevo" };
}
let cachedBrevoKey: string | undefined;

async function getBrevoApiKey(): Promise<string> {
  if (cachedBrevoKey) return cachedBrevoKey;
  const secretName = process.env.BREVO_SECRET_NAME?.trim();
  if (!secretName) throw new Error("BREVO_SECRET_NAME is not set");
  const out = await secrets.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Brevo API key secret is empty");
  cachedBrevoKey = s;
  return cachedBrevoKey;
}

export async function sendEmailBrevo(params: {
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = await getBrevoApiKey();
  const fromEmail = params.fromEmail.trim();
  const toEmail = params.toEmail.trim();
  if (!fromEmail) throw new Error("fromEmail is required");
  if (!toEmail) throw new Error("toEmail is required");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: fromEmail,
        ...(params.fromName?.trim() ? { name: params.fromName.trim() } : {}),
      },
      to: [{ email: toEmail }],
      subject: params.subject,
      textContent: params.text,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 2000);
    throw new Error(`Brevo send failed (${res.status}): ${detail || res.statusText}`);
  }
}

