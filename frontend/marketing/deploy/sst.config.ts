/// <reference path="./.sst/platform/config.d.ts" />
// Ion-style config (SST v3+ / v4). Deploys:
//   - frontend/marketing → consciously.live (Next.js / OpenNext)
//   - frontend/webapp → app.consciously.live (Vite SPA StaticSite)
//
// Deploy: `./frontend/marketing/deploy/deploy-web [--stage …] [--profile name]`
// Stage ids are only `dev` or `prod` (deploy-web accepts production/development as aliases).

function nextPublicEnvFromProcess(): Record<string, string> {
  const keys = [
    "NEXT_PUBLIC_MEDIMADE_API_URL",
    "NEXT_PUBLIC_MEDIMADE_CHAT_URL",
    "NEXT_PUBLIC_ASSISTANT_CHAT_URL",
    "NEXT_PUBLIC_MEDIMADE_MEDIA_BASE_URL",
    "NEXT_PUBLIC_MEDIMADE_SCRIPT_LAB_URL",
    "NEXT_PUBLIC_APP_ORIGIN",
  ] as const;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) out[k] = v;
  }
  if (!out.NEXT_PUBLIC_MEDIMADE_API_URL) {
    throw new Error(
      "NEXT_PUBLIC_MEDIMADE_API_URL is missing — refuse to deploy a webapp that cannot call the API",
    );
  }
  if (!out.NEXT_PUBLIC_APP_ORIGIN) {
    out.NEXT_PUBLIC_APP_ORIGIN = "https://app.consciously.live";
  }
  return out;
}

function viteEnvFromProcess(): Record<string, string> {
  const api =
    process.env.VITE_MEDIMADE_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_MEDIMADE_API_URL?.trim() ||
    "";
  if (!api) {
    throw new Error(
      "VITE_MEDIMADE_API_URL / NEXT_PUBLIC_MEDIMADE_API_URL missing — SPA cannot call the API",
    );
  }
  const out: Record<string, string> = {
    VITE_MEDIMADE_API_URL: api,
    VITE_MARKETING_ORIGIN:
      process.env.VITE_MARKETING_ORIGIN?.trim() || "https://consciously.live",
  };
  const media =
    process.env.VITE_MEDIMADE_MEDIA_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_MEDIMADE_MEDIA_BASE_URL?.trim();
  if (media) out.VITE_MEDIMADE_MEDIA_BASE_URL = media;
  const chat =
    process.env.VITE_MEDIMADE_CHAT_URL?.trim() ||
    process.env.NEXT_PUBLIC_MEDIMADE_CHAT_URL?.trim();
  if (chat) out.VITE_MEDIMADE_CHAT_URL = chat;
  const assistant =
    process.env.VITE_ASSISTANT_CHAT_URL?.trim() ||
    process.env.NEXT_PUBLIC_ASSISTANT_CHAT_URL?.trim();
  if (assistant) out.VITE_ASSISTANT_CHAT_URL = assistant;
  return out;
}

export default $config({
  app(input) {
    return {
      name: "medimade-webapp",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // Custom domain + ACM must stay attached on the CloudFront distribution that
    // DNS points at. Detaching (MEDIMADE_SST_ATTACH_DOMAIN=0) previously left
    // consciously.live on a cert-less distribution → HTTPS name mismatch.
    const attachDomain = process.env.MEDIMADE_SST_ATTACH_DOMAIN !== "0";
    // ACM must include consciously.live + www + app.consciously.live (or use a
    // wildcard). Same cert ARN as before until a dedicated app cert is issued.
    const certArn =
      "arn:aws:acm:us-east-1:382309212161:certificate/de288d1f-a1f7-436b-ae16-3f79de3d5d98";

    const marketing = new sst.aws.Nextjs("Web", {
      path: "..",
      environment: nextPublicEnvFromProcess(),
      ...(attachDomain
        ? {
            domain: {
              name: "consciously.live",
              aliases: ["www.consciously.live"],
              // DNS in Cloudflare (not Route 53); CNAME apex+www → this CF domain.
              dns: false,
              cert: certArn,
            },
          }
        : {}),
    });

    // New SPA site. Custom domain needs an ACM cert that includes
    // app.consciously.live (current consciously.live cert does not).
    // Set MEDIMADE_SPA_ATTACH_DOMAIN=1 once that SAN/cert exists + Cloudflare CNAME.
    const attachSpaDomain =
      attachDomain && process.env.MEDIMADE_SPA_ATTACH_DOMAIN === "1";
    const spa = new sst.aws.StaticSite("LoggedInSpa", {
      path: "../../webapp",
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: viteEnvFromProcess(),
      ...(attachSpaDomain
        ? {
            domain: {
              name: "app.consciously.live",
              dns: false,
              cert: certArn,
            },
          }
        : {}),
    });

    return { url: marketing.url, marketingUrl: marketing.url, appUrl: spa.url };
  },
});
