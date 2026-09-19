import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export type ConsciouslyCognitoAuthNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  usersTable: dynamodb.ITable;
  refreshTable: dynamodb.ITable;
  authJwtSecret: secretsmanager.ISecret;
  authWebappOrigin: string;
};

/**
 * Cognito User Pool + Hosted UI domain + config/exchange API routes.
 * Nested so the parent MedimadeBackend stack stays under the CFN 500-resource limit.
 *
 * Destination is Cognito-first (password / passkey / social). Magic-link stays
 * available during migration; clients exchange a Cognito ID token for a Consciously JWT.
 */
export class ConsciouslyCognitoAuthNestedStack extends cdk.NestedStack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolDomain: cognito.UserPoolDomain;
  readonly issuer: string;

  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyCognitoAuthNestedStackProps,
  ) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "ConsciouslyUserPool", {
      userPoolName: "medimade-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
          passkey: true,
        },
      },
      // Hosted UI / Managed Login passkeys use this RP ID. Custom auth.consciously.live
      // domain can be attached later without recreating the pool.
      passkeyRelyingPartyId: "consciously.live",
      passkeyUserVerification: cognito.PasskeyUserVerification.PREFERRED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient("ConsciouslyWebClient", {
      userPoolClientName: "consciously-web",
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: true,
        user: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          "https://consciously.live/auth/cognito/callback",
          "https://www.consciously.live/auth/cognito/callback",
          "https://app.consciously.live/auth/cognito/callback",
          "http://localhost:3000/auth/cognito/callback",
          "http://localhost:5173/auth/cognito/callback",
        ],
        logoutUrls: [
          "https://consciously.live/",
          "https://www.consciously.live/",
          "https://app.consciously.live/",
          "http://localhost:3000/",
          "http://localhost:5173/",
        ],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    // Must be globally unique; only [a-z0-9-]. Avoid embedding cdk.Stack.account
    // unless it is a concrete 12-digit id (Tokens stringify with invalid chars).
    const accountId = cdk.Stack.of(this).account;
    const defaultCognitoPrefix = /^\d{12}$/.test(accountId)
      ? `consciously-${accountId}`
      : "consciously-auth";
    const rawCognitoPrefix =
      (this.node.tryGetContext("cognitoDomainPrefix") as string | undefined)?.trim() ||
      process.env.CONSCIOUSLY_COGNITO_DOMAIN_PREFIX?.trim() ||
      defaultCognitoPrefix;
    const cognitoDomainPrefix = rawCognitoPrefix
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 63);
    if (!cognitoDomainPrefix) {
      throw new Error(
        "Cognito domain prefix is empty after sanitization (set cognitoDomainPrefix or CONSCIOUSLY_COGNITO_DOMAIN_PREFIX)",
      );
    }
    this.userPoolDomain = this.userPool.addDomain("ConsciouslyAuthDomain", {
      cognitoDomain: {
        domainPrefix: cognitoDomainPrefix,
      },
      // Passkeys require Managed Login (not classic Hosted UI).
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // Default Cognito branding so Managed Login pages render without the designer.
    new cognito.CfnManagedLoginBranding(this, "ConsciouslyManagedLoginBranding", {
      userPoolId: this.userPool.userPoolId,
      clientId: this.userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    this.issuer = `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`;

    const authCognitoConfig = new lambda_nodejs.NodejsFunction(
      this,
      "AuthCognitoConfigFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-cognito-config.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          COGNITO_USER_POOL_ID: this.userPool.userPoolId,
          COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
          COGNITO_REGION: cdk.Stack.of(this).region,
          COGNITO_DOMAIN: cdk.Fn.select(
            2,
            cdk.Fn.split("/", this.userPoolDomain.baseUrl()),
          ),
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
        environment: {
          USERS_TABLE_NAME: props.usersTable.tableName,
          REFRESH_TABLE_NAME: props.refreshTable.tableName,
          AUTH_JWT_SECRET_ARN: props.authJwtSecret.secretArn,
          AUTH_WEBAPP_ORIGIN: props.authWebappOrigin,
          COGNITO_USER_POOL_ID: this.userPool.userPoolId,
          COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
        },
      },
    );
    props.usersTable.grantReadWriteData(authCognitoExchange);
    props.refreshTable.grantReadWriteData(authCognitoExchange);
    props.authJwtSecret.grantRead(authCognitoExchange);

    props.httpApi.addRoutes({
      path: "/auth/cognito/config",
      // CORS preflight is handled by HttpApi corsPreflight — no OPTIONS route needed.
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "AuthCognitoConfigIntegration",
        authCognitoConfig,
      ),
    });
    props.httpApi.addRoutes({
      path: "/auth/cognito/exchange",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "AuthCognitoExchangeIntegration",
        authCognitoExchange,
      ),
    });
  }
}
