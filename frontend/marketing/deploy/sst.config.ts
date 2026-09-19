/// <reference path="./.sst/platform/config.d.ts" />
// Ion-style config (SST v3+ / v4). Deploys:
//   - frontend/marketing → consciously.live (Next.js / OpenNext)
//   - frontend/webapp → app.consciously.live (Vite SPA StaticSite)
//
// Deploy: `./frontend/marketing/deploy/deploy-web [--stage …] [--profile name]`
// Stage ids are only `dev` or `prod` (deploy-web accepts production/development as aliases).
//
// Selective deploys (MEDIMADE_SST_ONLY=marketing|app) must not construct the other
// site: sst.aws.Nextjs always loads .open-next/open-next.output.json, so an
// app-only deploy would fail even with `sst deploy --target LoggedInSpa`.
// Pair selective construction with deploy-web’s `--target` so the omitted site
// is not removed from the stack.

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

/** Public + server-only env for the marketing Next.js OpenNext site. */
function nextEnvFromProcess(): Record<string, string> {
  const out = nextPublicEnvFromProcess();
  const revalidate = process.env.BLOG_REVALIDATE_SECRET?.trim();
  if (revalidate) out.BLOG_REVALIDATE_SECRET = revalidate;
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

/** `all` | `marketing` | `app` — set by deploy-web for selective deploys. */
function deployOnly(): "all" | "marketing" | "app" {
  const raw = (process.env.MEDIMADE_SST_ONLY || "all").trim().toLowerCase();
  if (raw === "marketing" || raw === "web" || raw === "next") return "marketing";
  if (raw === "app" || raw === "spa" || raw === "loggedinspa") return "app";
  return "all";
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
    const only = deployOnly();
    const deployMarketing = only === "all" || only === "marketing";
    const deployApp = only === "all" || only === "app";

    // Custom domain + ACM must stay attached on the CloudFront distribution that
    // DNS points at. Detaching (MEDIMADE_SST_ATTACH_DOMAIN=0) previously left
    // consciously.live on a cert-less distribution → HTTPS name mismatch.
    const attachDomain = process.env.MEDIMADE_SST_ATTACH_DOMAIN !== "0";
    // Apex + www only (live marketing CF today).
    const marketingCertArn =
      "arn:aws:acm:us-east-1:382309212161:certificate/de288d1f-a1f7-436b-ae16-3f79de3d5d98";
    // Includes app.consciously.live (Issued).
    const spaCertArn =
      "arn:aws:acm:us-east-1:382309212161:certificate/d1efcdd8-63ad-4e0c-88ed-ed177338b440";

    const marketing = deployMarketing
      ? new sst.aws.Nextjs("Web", {
          path: "..",
          environment: nextEnvFromProcess(),
          ...(attachDomain
            ? {
                domain: {
                  name: "consciously.live",
                  aliases: ["www.consciously.live"],
                  // DNS in Cloudflare (not Route 53); CNAME apex+www → this CF domain.
                  dns: false,
                  cert: marketingCertArn,
                },
              }
            : {}),
        })
      : undefined;

    // SPA custom domain. Cloudflare CNAME app → dyaxvhlmage80.cloudfront.net
    // (DNS-only, same pattern as www). Default on; set MEDIMADE_SPA_ATTACH_DOMAIN=0
    // only for temporary cloudfront.net previews.
    const attachSpaDomain =
      attachDomain && process.env.MEDIMADE_SPA_ATTACH_DOMAIN !== "0";
    const spa = deployApp
      ? new sst.aws.StaticSite("LoggedInSpa", {
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
                  cert: spaCertArn,
                },
              }
            : {}),
        })
      : undefined;

    return {
      url: marketing?.url,
      marketingUrl: marketing?.url,
      appUrl: spa?.url,
    };
  },
});
