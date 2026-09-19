import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";

/**
 * Cognito User Pool + Hosted UI domain only.
 * Auth HTTP routes / exchange Lambdas live in the API nested stack (avoids Auth ↔ API cycles).
 *
 * Domain prefix defaults to `consciously-v2-{account}` so this can synth/deploy alongside
 * the live MedimadeBackend pool (`consciously-{account}`) until cutover.
 */
export class ConsciouslyAuthNestedStack extends cdk.NestedStack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolDomain: cognito.UserPoolDomain;
  readonly issuer: string;
  readonly domainPrefix: string;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "consciously-users-v2",
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
