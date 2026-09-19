/**
 * Ask the marketing Next.js app to purge tagged /read caches after admin writes.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const secrets = new SecretsManagerClient({});
let cachedSecret: string | undefined;

async function revalidateSecret(): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const arn = process.env.BLOG_REVALIDATE_SECRET_ARN?.trim();
  if (!arn) return null;
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) return null;
  cachedSecret = s;
  return cachedSecret;
}

export async function invalidateBlogCache(opts: {
  /** Purge /read index (list + intro/photo). */
  index?: boolean;
  /** Purge specific post pages by slug. */
  slugs?: string[];
}): Promise<void> {
  const origin = (
    process.env.MARKETING_ORIGIN ||
    process.env.AUTH_WEBAPP_ORIGIN ||
    "https://consciously.live"
  )
    .trim()
    .replace(/\/$/, "");
  const secret = await revalidateSecret();
  if (!secret) {
    console.warn(
      "blog-revalidate: BLOG_REVALIDATE_SECRET_ARN missing — skip cache purge",
    );
    return;
  }

  const slugs = (opts.slugs ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const index = opts.index === true;
  if (!index && slugs.length === 0) return;

  const url = `${origin}/api/revalidate-blog`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-blog-revalidate-secret": secret,
      },
      body: JSON.stringify({ secret, index, slugs }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `blog-revalidate: ${res.status} from ${url}`,
        text.slice(0, 200),
      );
    }
  } catch (e) {
    console.warn("blog-revalidate: request failed", e);
  }
}
