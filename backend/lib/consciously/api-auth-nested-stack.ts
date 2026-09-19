import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { ConsciouslyAuthNestedStack } from "./auth-nested-stack";
import type { ConsciouslyConfigNestedStack } from "./config-nested-stack";
import type { ConsciouslyDatabaseNestedStack } from "./database-nested-stack";
import {
  resolveAuthEmailFrom,
  resolveAuthWebappOrigin,
  addNestHttpRoutes,
} from "./api-http";

import { BREVO_SECRET_NAME } from "./secret-names";

export type ConsciouslyApiAuthNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  config: ConsciouslyConfigNestedStack;
  auth: ConsciouslyAuthNestedStack;
  database: ConsciouslyDatabaseNestedStack;
};

/**
 * Auth HTTP routes: magic link, guest, refresh, handoff, logout, profile, Cognito.
 * One shared IAM execution role for all Lambdas in this nest.
 */
export class ConsciouslyApiAuthNestedStack extends cdk.NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyApiAuthNestedStackProps,
  ) {
    super(scope, id, props);

    const { httpApi } = props;
    const authJwtSecret = props.config.authJwtSecret;
    const brevoApiKeySecret = props.config.brevoApiKey;
    const usersTable = props.database.users;
    const magicLinkTable = props.database.magicLink;
    const refreshTable = props.database.refresh;
    const userPool = props.auth.userPool;
    const userPoolClient = props.auth.userPoolClient;
    const userPoolDomain = props.auth.userPoolDomain;

    const authWebappOrigin = resolveAuthWebappOrigin(this);
    const authEmailFrom = resolveAuthEmailFrom(this);

    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    magicLinkTable.grantReadWriteData(role);
    usersTable.grantReadWriteData(role);
    refreshTable.grantReadWriteData(role);
    authJwtSecret.grantRead(role);
    brevoApiKeySecret.grantRead(role);

    const authMagicRequest = new lambda_nodejs.NodejsFunction(
      this,
      "AuthMagicRequestFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-magic-request.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          MAGIC_LINK_TABLE_NAME: magicLinkTable.tableName,
          AUTH_EMAIL_FROM: authEmailFrom,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
          BREVO_SECRET_NAME: BREVO_SECRET_NAME,
        },
      },
    );

    const authMagicVerify = new lambda_nodejs.NodejsFunction(
      this,
      "AuthMagicVerifyFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-magic-verify.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          MAGIC_LINK_TABLE_NAME: magicLinkTable.tableName,
          USERS_TABLE_NAME: usersTable.tableName,
          REFRESH_TABLE_NAME: refreshTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        },
      },
    );

    const authGuest = new lambda_nodejs.NodejsFunction(this, "AuthGuestFunction", {
      entry: path.join(__dirname, "../../lambdas/auth-guest.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role,
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        REFRESH_TABLE_NAME: refreshTable.tableName,
        AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        AUTH_WEBAPP_ORIGIN: authWebappOrigin,
      },
    });

    const authRefresh = new lambda_nodejs.NodejsFunction(
      this,
      "AuthRefreshFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-refresh.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          REFRESH_TABLE_NAME: refreshTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        },
      },
    );

    const authHandoff = new lambda_nodejs.NodejsFunction(
      this,
      "AuthHandoffFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-handoff.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          MAGIC_LINK_TABLE_NAME: magicLinkTable.tableName,
          USERS_TABLE_NAME: usersTable.tableName,
          REFRESH_TABLE_NAME: refreshTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        },
      },
    );

    const authLogout = new lambda_nodejs.NodejsFunction(
      this,
      "AuthLogoutFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-logout.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          REFRESH_TABLE_NAME: refreshTable.tableName,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        },
      },
    );

    const authProfileDisplayName = new lambda_nodejs.NodejsFunction(
      this,
      "AuthProfileDisplayNameFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-profile-display-name.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          REFRESH_TABLE_NAME: refreshTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        },
      },
    );

    const authCognitoConfig = new lambda_nodejs.NodejsFunction(
      this,
      "AuthCognitoConfigFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-cognito-config.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        role,
        environment: {
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_REGION: cdk.Stack.of(this).region,
          COGNITO_DOMAIN: userPoolDomain.domainName,
        },
      },
    );

    const authCognitoExchange = new lambda_nodejs.NodejsFunction(
      this,
      "AuthCognitoExchangeFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-cognito-exchange.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          REFRESH_TABLE_NAME: refreshTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "AuthMagicRequestRoute",
      path: "/auth/magic-link",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthMagicRequestIntegration",
        authMagicRequest,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthMagicVerifyRoute",
      path: "/auth/magic-link/verify",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthMagicVerifyIntegration",
        authMagicVerify,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthGuestRoute",
      path: "/auth/guest",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthGuestIntegration",
        authGuest,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthRefreshRoute",
      path: "/auth/refresh",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthRefreshIntegration",
        authRefresh,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthHandoffCreateRoute",
      path: "/auth/handoff/create",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthHandoffCreateIntegration",
        authHandoff,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthHandoffRedeemRoute",
      path: "/auth/handoff/redeem",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthHandoffRedeemIntegration",
        authHandoff,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthLogoutRoute",
      path: "/auth/logout",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthLogoutIntegration",
        authLogout,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthProfileDisplayNameRoute",
      path: "/auth/profile/display-name",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthProfileDisplayNameIntegration",
        authProfileDisplayName,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthCognitoConfigRoute",
      path: "/auth/cognito/config",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "AuthCognitoConfigIntegration",
        authCognitoConfig,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthCognitoExchangeRoute",
      path: "/auth/cognito/exchange",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "AuthCognitoExchangeIntegration",
        authCognitoExchange,
      ),
    });
  }
}
