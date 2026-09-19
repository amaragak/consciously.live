/**
 * Cognito Custom Email Sender — decrypt the verification code and send via Brevo.
 * Uses the same AUTH_EMAIL_FROM sender as magic-link mail.
 */
import { KmsKeyringNode, buildClient, CommitmentPolicy } from "@aws-crypto/client-node";
import { sendEmailBrevo } from "./_shared/consciously-email";

const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);

type CustomEmailSenderEvent = {
  triggerSource?: string;
  userName?: string;
  request?: {
    code?: string;
    userAttributes?: Record<string, string>;
  };
};

async function decryptCode(code: string): Promise<string> {
  const keyArn = process.env.COGNITO_EMAIL_KMS_KEY_ARN?.trim();
  if (!keyArn) throw new Error("COGNITO_EMAIL_KMS_KEY_ARN is not set");
  const keyring = new KmsKeyringNode({ keyIds: [keyArn] });
  const { plaintext } = await decrypt(keyring, Buffer.from(code, "base64"));
  return Buffer.from(plaintext).toString("utf8");
}

function copyFor(
  trigger: string,
  code: string,
): { subject: string; text: string } {
  switch (trigger) {
    case "CustomEmailSender_ForgotPassword":
      return {
        subject: "Reset your Consciously password",
        text: `Your password reset code is ${code}.\n\nIt expires in 24 hours.\n\nIf you did not request this, you can ignore this email.`,
      };
    case "CustomEmailSender_AdminCreateUser":
      return {
        subject: "Your Consciously account",
        text: `Your temporary password is:\n\n${code}\n\nSign in and choose a new password.`,
      };
    case "CustomEmailSender_UpdateUserAttribute":
    case "CustomEmailSender_VerifyUserAttribute":
      return {
        subject: "Verify your Consciously email",
        text: `Your verification code is ${code}.\n\nIt expires in 24 hours.`,
      };
    default:
      return {
        subject: "Your Consciously confirmation code",
        text: `Your confirmation code is ${code}.\n\nIt expires in 24 hours.\n\nIf you did not create an account, you can ignore this email.`,
      };
  }
}

export async function handler(event: CustomEmailSenderEvent): Promise<void> {
  const attrs = event.request?.userAttributes ?? {};
  const to = (attrs.email ?? event.userName ?? "").trim();
  if (!to.includes("@")) {
    console.warn("custom email sender: no email", event.triggerSource);
    return;
  }

  const encrypted = event.request?.code?.trim();
  if (!encrypted) {
    console.warn("custom email sender: no code", event.triggerSource);
    return;
  }

  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!from) throw new Error("AUTH_EMAIL_FROM is not set");

  const code = await decryptCode(encrypted);
  const { subject, text } = copyFor(event.triggerSource ?? "", code);
  const toEmail = to.toLowerCase();
  console.info("custom email sender", event.triggerSource, toEmail);
  await sendEmailBrevo({
    fromEmail: from,
    fromName: "Consciously",
    toEmail,
    subject,
    text,
  });
}
