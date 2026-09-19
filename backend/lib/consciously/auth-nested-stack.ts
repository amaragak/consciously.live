import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { resolveAuthEmailFrom } from "./api-http";
import { BREVO_SECRET_NAME } from "./secret-names";

/**
 * Cognito User Pool + Hosted UI domain only.
 * Auth HTTP routes / exchange Lambdas live in the API nested stack (avoids Auth ↔ API cycles).
 *
 * Pool name is `consciously-users`. MedimadeBackend keeps a separate `medimade-users`
 * pool. Domain prefix stays `consciously-v2-{account}` so it does not collide with
 * the Medimade Hosted UI domain.
 */
export class ConsciouslyAuthNestedStack extends cdk.NestedStack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolDomain: cognito.UserPoolDomain;
  readonly issuer: string;
  readonly domainPrefix: string;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    const brevoApiKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "BrevoApiKey",
      BREVO_SECRET_NAME,
    );
    const emailKmsKey = new kms.Key(this, "CustomEmailSenderKey", {
      description: "Cognito custom email sender (Brevo)",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const customEmailSender = new lambda_nodejs.NodejsFunction(
      this,
      "CustomEmailSenderFunction",
      {
        entry: path.join(__dirname, "../../lambdas/auth-cognito-email.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        bundling: {
          nodeModules: ["@aws-crypto/client-node"],
        },
        environment: {
          AUTH_EMAIL_FROM: resolveAuthEmailFrom(this),
          BREVO_SECRET_NAME: BREVO_SECRET_NAME,
          COGNITO_EMAIL_KMS_KEY_ARN: emailKmsKey.keyArn,
        },
      },
    );
    brevoApiKey.grantRead(customEmailSender);
    emailKmsKey.grantDecrypt(customEmailSender);

    const preSignUp = new lambda_nodejs.NodejsFunction(this, "PreSignUpFunction", {
      entry: path.join(__dirname, "../../lambdas/auth-cognito-presignup.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
    });

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "consciously-users",
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
      passkeyRelyingPartyId: "consciously.live",
      passkeyUserVerification: cognito.PasskeyUserVerification.PREFERRED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
      customSenderKmsKey: emailKmsKey,
      lambdaTriggers: {
        customEmailSender,
        preSignUp,
      },
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: "consciously-web-v2",
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

    const accountId = cdk.Stack.of(this).account;
    const defaultPrefix = /^\d{12}$/.test(accountId)
      ? `consciously-v2-${accountId}`
      : "consciously-v2-auth";
    const rawPrefix =
      (this.node.tryGetContext("cognitoDomainPrefix") as string | undefined)?.trim() ||
      process.env.CONSCIOUSLY_COGNITO_DOMAIN_PREFIX?.trim() ||
      defaultPrefix;
    this.domainPrefix = rawPrefix
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 63);
    if (!this.domainPrefix) {
      throw new Error(
        "Cognito domain prefix is empty after sanitization (set cognitoDomainPrefix or CONSCIOUSLY_COGNITO_DOMAIN_PREFIX)",
      );
    }

    this.userPoolDomain = this.userPool.addDomain("AuthDomain", {
      cognitoDomain: {
        domainPrefix: this.domainPrefix,
      },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    new cognito.CfnManagedLoginBranding(this, "ManagedLoginBranding", {
      userPoolId: this.userPool.userPoolId,
      clientId: this.userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    this.issuer = `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`;
  }
}
