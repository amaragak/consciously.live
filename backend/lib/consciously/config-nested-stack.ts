import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import {
  ALGOLIA_SECRET_NAME,
  BREVO_SECRET_NAME,
  CLAUDE_SECRET_NAME,
  FISH_AUDIO_SECRET_NAME,
  GOOGLE_AI_SECRET_NAME,
  OPENAI_SECRET_NAME,
  RUNPODS_SECRET_NAME,
  RUNPODS_URL_SECRET_NAME,
} from "./secret-names";

/**
 * Secrets for ConsciouslyBackend.
 * Account-owned API keys are looked up by name; JWT + blog revalidate are created here.
 */
export class ConsciouslyConfigNestedStack extends cdk.NestedStack {
  readonly fishApiKey: secretsmanager.ISecret;
  readonly claudeApiKey: secretsmanager.ISecret;
  readonly openAiApiKey: secretsmanager.ISecret;
  readonly googleAiApiKey: secretsmanager.ISecret;
  readonly brevoApiKey: secretsmanager.ISecret;
  readonly runpodsApiKey: secretsmanager.ISecret;
  readonly runpodsUrl: secretsmanager.ISecret;
  readonly algolia: secretsmanager.ISecret;
  /** HS256 secret for session JWTs. */
  readonly authJwtSecret: secretsmanager.ISecret;
  /** Shared secret: admin-blog → marketing `POST /api/revalidate-blog`. */
  readonly blogRevalidateSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    this.fishApiKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "FishAudioApiKey",
      FISH_AUDIO_SECRET_NAME,
    );
    this.claudeApiKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "ClaudeApiKey",
      CLAUDE_SECRET_NAME,
    );
    this.openAiApiKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "OpenAiApiKey",
      OPENAI_SECRET_NAME,
    );
    this.googleAiApiKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "GoogleAiApiKey",
      GOOGLE_AI_SECRET_NAME,
    );
    this.brevoApiKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "BrevoApiKey",
      BREVO_SECRET_NAME,
    );
    this.runpodsApiKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "RunpodsApiKey",
      RUNPODS_SECRET_NAME,
    );
    this.runpodsUrl = secretsmanager.Secret.fromSecretNameV2(
      this,
      "RunpodsUrl",
      RUNPODS_URL_SECRET_NAME,
    );
    this.algolia = secretsmanager.Secret.fromSecretNameV2(
      this,
      "AlgoliaCreds",
      ALGOLIA_SECRET_NAME,
    );

    this.authJwtSecret = new secretsmanager.Secret(this, "AuthJwtSecret", {
      description: "Consciously user session JWT signing secret",
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    this.blogRevalidateSecret = new secretsmanager.Secret(
      this,
      "BlogRevalidateSecret",
      {
        description:
          "On-demand revalidation secret for consciously.live /read cache",
        generateSecretString: {
          passwordLength: 48,
          excludePunctuation: true,
        },
      },
    );
  }
}
