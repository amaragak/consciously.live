import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import type { Construct } from "constructs";

/**
 * Register routes on a parent HttpApi from a nested stack scope.
 * Prefer this over `httpApi.addRoutes()` — addRoutes creates Route/Integration
 * resources as children of the HttpApi (parent stack), which defeats nest splitting.
 */
export function addNestHttpRoutes(
  scope: Construct,
  httpApi: apigwv2.IHttpApi,
  options: {
    id: string;
    path: string;
    methods: apigwv2.HttpMethod[];
    integration: apigwv2.HttpRouteIntegration;
  },
): void {
  for (const method of options.methods) {
    new apigwv2.HttpRoute(scope, `${options.id}${method}`, {
      httpApi,
      routeKey: apigwv2.HttpRouteKey.with(options.path, method),
      integration: options.integration,
    });
  }
}

/** CORS allowOrigins for Consciously HttpApi (must stay in sync across nests). */
export const CONSCIOUSLY_HTTP_API_CORS_ORIGINS = [
  "https://consciously.live",
  "https://www.consciously.live",
  "https://app.consciously.live",
  "https://dyaxvhlmage80.cloudfront.net",
  "https://d2nu9q5wynnhfv.cloudfront.net",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  // Capacitor Android web view. API Gateway rejects non-http(s) origins, so the
  // iOS shell (capacitor://localhost) calls the API through native HTTP instead.
  "https://localhost",
] as const;

export function resolveAuthWebappOrigin(scope: Construct): string {
  return (
    (scope.node.tryGetContext("authWebappOrigin") as string | undefined)?.trim() ||
    "https://consciously.live"
  );
}

function contextOrEnv(scope: Construct, key: string, env: string): string {
  const fromContext = scope.node.tryGetContext(key) as string | undefined;
  return (fromContext ?? process.env[env] ?? "").trim();
}

/** iOS bundle ID; native Sign in with Apple tokens carry it as the audience. */
export const CONSCIOUSLY_IOS_BUNDLE_ID = "live.consciously.app";

/**
 * Direct (non-Cognito) social sign-in and the App Review account. Public IDs
 * live in cdk.json context or deploy env; unset providers stay off.
 */
export function resolveSocialAuthConfig(scope: Construct): {
  appleServicesId: string;
  googleWebClientId: string;
  googleIosClientId: string;
  reviewAccountEmail: string;
  reviewAccountCode: string;
} {
  return {
    appleServicesId: contextOrEnv(scope, "appleServicesId", "CONSCIOUSLY_APPLE_SERVICES_ID"),
    googleWebClientId: contextOrEnv(scope, "googleWebClientId", "CONSCIOUSLY_GOOGLE_WEB_CLIENT_ID"),
    googleIosClientId: contextOrEnv(scope, "googleIosClientId", "CONSCIOUSLY_GOOGLE_IOS_CLIENT_ID"),
    reviewAccountEmail: contextOrEnv(scope, "reviewAccountEmail", "CONSCIOUSLY_REVIEW_ACCOUNT_EMAIL").toLowerCase(),
    reviewAccountCode: contextOrEnv(scope, "reviewAccountCode", "CONSCIOUSLY_REVIEW_ACCOUNT_CODE"),
  };
}

export const EMAIL_DOMAIN = "consciously.live";
export const SES_CONFIGURATION_SET_NAME = "consciously-transactional";

/**
 * Env for Lambdas that send email (`lambdas/_shared/consciously-email.ts`).
 * `CONSCIOUSLY_EMAIL_PROVIDER=ses` switches every sender from Brevo to SES.
 */
export function resolveEmailEnv(scope: Construct): Record<string, string> {
  return {
    EMAIL_PROVIDER:
      contextOrEnv(scope, "emailProvider", "CONSCIOUSLY_EMAIL_PROVIDER").toLowerCase() === "ses"
        ? "ses"
        : "brevo",
    EMAIL_FROM: contextOrEnv(scope, "emailFrom", "CONSCIOUSLY_EMAIL_FROM") || `hello@${EMAIL_DOMAIN}`,
    EMAIL_FROM_NAME: "Consciously",
    SES_CONFIGURATION_SET: SES_CONFIGURATION_SET_NAME,
  };
}

/** Allow sending through SES (any verified identity; sandbox also checks recipients). */
export function grantSesSend(scope: Construct, grantee: iam.IGrantable): void {
  const stack = cdk.Stack.of(scope);
  grantee.grantPrincipal.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: [
        `arn:aws:ses:${stack.region}:${stack.account}:identity/*`,
        `arn:aws:ses:${stack.region}:${stack.account}:configuration-set/${SES_CONFIGURATION_SET_NAME}`,
      ],
    }),
  );
}

/** 6-digit code in the sign-in email. Off until web sign-in has a code field. */
export function resolveMagicCodeInEmail(scope: Construct): "1" | "0" {
  return contextOrEnv(scope, "magicCodeInEmail", "CONSCIOUSLY_MAGIC_CODE_IN_EMAIL") === "1"
    ? "1"
    : "0";
}

export function resolveAuthEmailFrom(scope: Construct): string {
  return (
    (scope.node.tryGetContext("authEmailFrom") as string | undefined)?.trim() ||
    process.env.CONSCIOUSLY_AUTH_EMAIL_FROM?.trim() ||
    process.env.AUTH_EMAIL_FROM?.trim() ||
    // Must be a Brevo-verified sender on the account that owns medimade/BREVO_API_KEY.
    "alexjm1234567@gmail.com"
  );
}

export function resolveAdminEmails(
  scope: Construct,
  authEmailFrom: string,
): string {
  return (
    (scope.node.tryGetContext("adminEmails") as string | undefined)?.trim() ||
    process.env.ADMIN_EMAILS?.trim() ||
    authEmailFrom
  );
}
