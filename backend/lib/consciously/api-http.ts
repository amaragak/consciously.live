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
] as const;

export function resolveAuthWebappOrigin(scope: Construct): string {
  return (
    (scope.node.tryGetContext("authWebappOrigin") as string | undefined)?.trim() ||
    "https://consciously.live"
  );
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
