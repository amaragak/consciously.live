import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { ConsciouslyConfigNestedStack } from "./config-nested-stack";
import type { ConsciouslyDatabaseNestedStack } from "./database-nested-stack";
import { addNestHttpRoutes, resolveAuthWebappOrigin } from "./api-http";
import {
  STRIPE_SECRET_NAME,
  STRIPE_WEBHOOK_SECRET_NAME,
  STRIPE_PRICES_SECRET_NAME,
} from "./secret-names";

export type ConsciouslyApiBillingNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  config: ConsciouslyConfigNestedStack;
  database: ConsciouslyDatabaseNestedStack;
};

/**
 * Stripe Checkout + webhook.
 * Price IDs from Secrets Manager `medimade/STRIPE_PRICES` (JSON).
 */
export class ConsciouslyApiBillingNestedStack extends cdk.NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyApiBillingNestedStackProps,
  ) {
    super(scope, id, props);

    const { httpApi } = props;
    const usersTable = props.database.users;
    const authJwtSecret = props.config.authJwtSecret;
    const stripeSecret = props.config.stripeSecretKey;
    const stripeWebhookSecret = props.config.stripeWebhookSecret;
    const stripePrices = props.config.stripePrices;
    const authWebappOrigin = resolveAuthWebappOrigin(this);

    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    usersTable.grantReadWriteData(role);
    authJwtSecret.grantRead(role);
    stripeSecret.grantRead(role);
    stripeWebhookSecret.grantRead(role);
    stripePrices.grantRead(role);

    const sharedEnv: Record<string, string> = {
      USERS_TABLE_NAME: usersTable.tableName,
      AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
      AUTH_WEBAPP_ORIGIN: authWebappOrigin,
      STRIPE_SECRET_NAME: STRIPE_SECRET_NAME,
      STRIPE_WEBHOOK_SECRET_NAME: STRIPE_WEBHOOK_SECRET_NAME,
      STRIPE_PRICES_SECRET_NAME: STRIPE_PRICES_SECRET_NAME,
    };

    const bundling: lambda_nodejs.BundlingOptions = {
      minify: true,
      sourceMap: true,
      target: "node20",
      // stripe ships its own deps; keep external only if needed
    };

    const checkoutFn = new lambda_nodejs.NodejsFunction(
      this,
      "BillingCheckoutSessionFunction",
      {
        entry: path.join(__dirname, "../../lambdas/billing-checkout-session.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(20),
        memorySize: 256,
        role,
        environment: sharedEnv,
        bundling,
      },
    );

    const pricesFn = new lambda_nodejs.NodejsFunction(
      this,
      "BillingPricesFunction",
      {
        entry: path.join(__dirname, "../../lambdas/billing-prices.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        role,
        environment: sharedEnv,
        bundling,
      },
    );

    const webhookFn = new lambda_nodejs.NodejsFunction(
      this,
      "BillingStripeWebhookFunction",
      {
        entry: path.join(__dirname, "../../lambdas/billing-stripe-webhook.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(20),
        memorySize: 256,
        role,
        environment: sharedEnv,
        bundling,
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "BillingCheckoutSession",
      path: "/billing/checkout-session",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "BillingCheckoutSessionIntegration",
        checkoutFn,
      ),
    });

    addNestHttpRoutes(this, httpApi, {
      id: "BillingPrices",
      path: "/billing/prices",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "BillingPricesIntegration",
        pricesFn,
      ),
    });

    addNestHttpRoutes(this, httpApi, {
      id: "BillingStripeWebhook",
      path: "/billing/stripe/webhook",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "BillingStripeWebhookIntegration",
        webhookFn,
      ),
    });
  }
}
