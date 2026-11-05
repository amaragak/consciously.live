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
import type { ConsciouslyMediaNestedStack } from "./media-nested-stack";
import {
  CONSCIOUSLY_IOS_BUNDLE_ID,
  grantSesSend,
  resolveAdminEmails,
  resolveAuthEmailFrom,
  resolveEmailEnv,
  resolveMagicCodeInEmail,
  resolveAuthWebappOrigin,
  resolveSocialAuthConfig,
  addNestHttpRoutes,
} from "./api-http";

import { BREVO_SECRET_NAME } from "./secret-names";

export type ConsciouslyApiAuthNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  config: ConsciouslyConfigNestedStack;
  auth: ConsciouslyAuthNestedStack;
  database: ConsciouslyDatabaseNestedStack;
  media: ConsciouslyMediaNestedStack;
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
    const social = resolveSocialAuthConfig(this);
    const emailEnv = resolveEmailEnv(this);
    const magicCodeInEmail = resolveMagicCodeInEmail(this);

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
    props.database.waitlist.grantReadWriteData(role);
    props.database.meditationAnalytics.grantReadWriteData(role);
    authJwtSecret.grantRead(role);
    brevoApiKeySecret.grantRead(role);
    grantSesSend(this, role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminResendConfirmationCode",
        ],
        resources: [userPool.userPoolArn],
      }),
    );

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
          ...emailEnv,
          MAGIC_CODE_IN_EMAIL: magicCodeInEmail,
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
          WAITLIST_TABLE_NAME: props.database.waitlist.tableName,
          MEDITATION_ANALYTICS_TABLE_NAME:
            props.database.meditationAnalytics.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
          REVIEW_ACCOUNT_EMAIL: social.reviewAccountEmail,
          REVIEW_ACCOUNT_CODE: social.reviewAccountCode,
        },
      },
    );

    const authSocial = new lambda_nodejs.NodejsFunction(this, "AuthSocialFunction", {
      entry: path.join(__dirname, "../../lambdas/auth-social.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role,
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
        REFRESH_TABLE_NAME: refreshTable.tableName,
        WAITLIST_TABLE_NAME: props.database.waitlist.tableName,
        MEDITATION_ANALYTICS_TABLE_NAME:
          props.database.meditationAnalytics.tableName,
        AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        APPLE_AUDIENCES: [CONSCIOUSLY_IOS_BUNDLE_ID, social.appleServicesId]
          .filter(Boolean)
          .join(","),
        GOOGLE_AUDIENCES: [social.googleWebClientId, social.googleIosClientId]
          .filter(Boolean)
          .join(","),
      },
    });

    const accountDeleteRole = new iam.Role(this, "AccountDeleteRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    const userDataTables = [
      usersTable,
      refreshTable,
      props.database.meditationAnalytics,
      props.database.meditationListenerMix,
      props.database.journal,
      props.database.assistantChat,
      props.database.ideate,
      props.database.habits,
      props.database.journalInsights,
    ];
    for (const t of userDataTables) t.grantReadWriteData(accountDeleteRole);
    props.media.bucket.grantRead(accountDeleteRole);
    props.media.bucket.grantDelete(accountDeleteRole);
    authJwtSecret.grantRead(accountDeleteRole);
    accountDeleteRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:ListUsers", "cognito-idp:AdminDeleteUser"],
        resources: [userPool.userPoolArn],
      }),
    );
    const authAccountDelete = new lambda_nodejs.NodejsFunction(
      this,
      "AuthAccountDeleteFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-account-delete.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.minutes(2),
        memorySize: 512,
        role: accountDeleteRole,
        environment: {
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
          USERS_TABLE_NAME: usersTable.tableName,
          REFRESH_TABLE_NAME: refreshTable.tableName,
          MEDITATION_ANALYTICS_TABLE_NAME:
            props.database.meditationAnalytics.tableName,
          MEDITATION_LISTENER_MIX_TABLE_NAME:
            props.database.meditationListenerMix.tableName,
          JOURNAL_TABLE_NAME: props.database.journal.tableName,
          ASSISTANT_CHAT_TABLE_NAME: props.database.assistantChat.tableName,
          IDEATE_TABLE_NAME: props.database.ideate.tableName,
          HABITS_TABLE_NAME: props.database.habits.tableName,
          JOURNAL_INSIGHTS_TABLE_NAME: props.database.journalInsights.tableName,
          MEDIA_BUCKET_NAME: props.media.bucket.bucketName,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
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
        MEDITATION_ANALYTICS_TABLE_NAME:
          props.database.meditationAnalytics.tableName,
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
          WAITLIST_TABLE_NAME: props.database.waitlist.tableName,
          MEDITATION_ANALYTICS_TABLE_NAME:
            props.database.meditationAnalytics.tableName,
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
          WAITLIST_TABLE_NAME: props.database.waitlist.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        },
      },
    );

    const userSettings = new lambda_nodejs.NodejsFunction(
      this,
      "UserSettingsFunction",
      {
        entry: path.join(__dirname, "../../lambdas/user-settings.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
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
          COGNITO_DOMAIN: cdk.Fn.select(
            2,
            cdk.Fn.split("/", userPoolDomain.baseUrl()),
          ),
          MAGIC_CODE_IN_EMAIL: magicCodeInEmail,
          APPLE_SERVICES_ID: social.appleServicesId,
          GOOGLE_WEB_CLIENT_ID: social.googleWebClientId,
          GOOGLE_IOS_CLIENT_ID: social.googleIosClientId,
        },
      },
    );

    const authCognitoResend = new lambda_nodejs.NodejsFunction(
      this,
      "AuthCognitoResendFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-cognito-resend.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
          COGNITO_REGION: cdk.Stack.of(this).region,
        },
      },
    );

    const authEmailCheck = new lambda_nodejs.NodejsFunction(this, "AuthEmailCheckFunction", {
      entry: path.join(__dirname, "../../lambdas/auth-email-check.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role,
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_REGION: cdk.Stack.of(this).region,
        USERS_TABLE_NAME: usersTable.tableName,
        MAGIC_LINK_TABLE_NAME: magicLinkTable.tableName,
      },
    });

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
          WAITLIST_TABLE_NAME: props.database.waitlist.tableName,
          MEDITATION_ANALYTICS_TABLE_NAME:
            props.database.meditationAnalytics.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: authWebappOrigin,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        },
      },
    );

    const usernameApi = new lambda_nodejs.NodejsFunction(
      this,
      "UsernameApiFunction",
      {
        entry: path.join(__dirname, "../../lambdas/username-api.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          MEDITATION_ANALYTICS_TABLE_NAME:
            props.database.meditationAnalytics.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
        bundling: {
          nodeModules: ["bad-words"],
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "UsernameMeRoute",
      path: "/me/username",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PATCH,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "UsernameMeIntegration",
        usernameApi,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "UsernameCheckRoute",
      path: "/me/username/check",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "UsernameCheckIntegration",
        usernameApi,
      ),
    });

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
    const adminEmailTest = new lambda_nodejs.NodejsFunction(this, "AdminEmailTestFunction", {
      entry: path.join(__dirname, "../../lambdas/admin-email-test.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role,
      environment: {
        AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        AUTH_WEBAPP_ORIGIN: authWebappOrigin,
        ADMIN_EMAILS: resolveAdminEmails(this, authEmailFrom),
        AUTH_EMAIL_FROM: authEmailFrom,
        BREVO_SECRET_NAME: BREVO_SECRET_NAME,
        ...emailEnv,
      },
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AdminEmailTestRoute",
      path: "/admin/email-test",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AdminEmailTestIntegration",
        adminEmailTest,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthSocialRoute",
      path: "/auth/social",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthSocialIntegration",
        authSocial,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthAccountDeleteRoute",
      path: "/auth/account/delete",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthAccountDeleteIntegration",
        authAccountDelete,
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
      id: "UserSettingsRoute",
      path: "/settings",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PATCH,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "UserSettingsIntegration",
        userSettings,
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
    addNestHttpRoutes(this, httpApi, {
      id: "AuthCognitoResendRoute",
      path: "/auth/cognito/resend",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthCognitoResendIntegration",
        authCognitoResend,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "AuthEmailCheckRoute",
      path: "/auth/email-check",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "AuthEmailCheckIntegration",
        authEmailCheck,
      ),
    });

    const waitlistJoin = new lambda_nodejs.NodejsFunction(this, "WaitlistJoinFunction", {
      entry: path.join(__dirname, "../../lambdas/waitlist-join.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        WAITLIST_TABLE_NAME: props.database.waitlist.tableName,
      },
    });
    props.database.waitlist.grantReadWriteData(waitlistJoin);
    addNestHttpRoutes(this, httpApi, {
      id: "WaitlistJoinRoute",
      path: "/waitlist",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "WaitlistJoinIntegration",
        waitlistJoin,
      ),
    });
  }
}
