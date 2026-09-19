import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { ConsciouslyApiNestedStack } from "./consciously/api-nested-stack";
import { ConsciouslyAuthNestedStack } from "./consciously/auth-nested-stack";
import { ConsciouslyConfigNestedStack } from "./consciously/config-nested-stack";
import { ConsciouslyDatabaseNestedStack } from "./consciously/database-nested-stack";
import { ConsciouslyMediaNestedStack } from "./consciously/media-nested-stack";
import {
  ALGOLIA_SECRET_NAME,
  BREVO_SECRET_NAME,
  CLAUDE_SECRET_NAME,
  FISH_AUDIO_SECRET_NAME,
  GOOGLE_AI_SECRET_NAME,
  OPENAI_SECRET_NAME,
  RUNPODS_SECRET_NAME,
  RUNPODS_URL_SECRET_NAME,
} from "./consciously/secret-names";

/**
 * New Consciously backend root stack (parallel to MedimadeBackend).
 *
 * Nested declaration order (dependency direction):
 *   Config → Auth → Database → Media → API
 *
 * Outputs live on this parent; Lambdas/routes/layers/notifications live in Api.
 */
export class ConsciouslyStack extends cdk.Stack {
  readonly config: ConsciouslyConfigNestedStack;
  readonly auth: ConsciouslyAuthNestedStack;
  readonly database: ConsciouslyDatabaseNestedStack;
  readonly media: ConsciouslyMediaNestedStack;
  readonly api: ConsciouslyApiNestedStack;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.config = new ConsciouslyConfigNestedStack(this, "Config");
    this.auth = new ConsciouslyAuthNestedStack(this, "Auth");
    this.database = new ConsciouslyDatabaseNestedStack(this, "Database");
    this.media = new ConsciouslyMediaNestedStack(this, "Media");
    this.api = new ConsciouslyApiNestedStack(this, "Api", {
      config: this.config,
      auth: this.auth,
      database: this.database,
      media: this.media,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.api.httpApi.apiEndpoint,
    });
    new cdk.CfnOutput(this, "CognitoUserPoolId", {
      value: this.auth.userPool.userPoolId,
    });
    new cdk.CfnOutput(this, "CognitoClientId", {
      value: this.auth.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "CognitoDomain", {
      value: this.auth.domainPrefix,
    });
    new cdk.CfnOutput(this, "CognitoIssuer", {
      value: this.auth.issuer,
    });
    new cdk.CfnOutput(this, "FishTtsUrl", {
      value: `${this.api.httpApi.apiEndpoint}/fish/tts`,
    });
    new cdk.CfnOutput(this, "OrpheusTtsUrl", {
      description:
        "Orpheus TTS (OpenAI-compatible). POST /v1/audio/speech or /orpheus/tts",
      value: `${this.api.httpApi.apiEndpoint}/v1/audio/speech`,
    });
    new cdk.CfnOutput(this, "VoiceFxUrl", {
      description: "Pedalboard voice FX (POST audio + effect chain)",
      value: `${this.api.httpApi.apiEndpoint}/audio/voice-fx`,
    });
    new cdk.CfnOutput(this, "MedimadeChatUrl", {
      description:
        "Meditation coach Claude chat (Function URL, RESPONSE_STREAM)",
      value: this.api.medimadeChatUrl.url,
    });
    new cdk.CfnOutput(this, "AssistantChatUrl", {
      description:
        "App-control Consciously Chat (Function URL, RESPONSE_STREAM)",
      value: this.api.assistantChatUrl.url,
    });
    new cdk.CfnOutput(this, "AdminScriptLabUrl", {
      description:
        "Admin Script Lab (Function URL — long generate/TTS jobs; use instead of API Gateway)",
      value: this.api.adminScriptLabUrl.url,
    });
    new cdk.CfnOutput(this, "FishAudioSecretName", {
      value: FISH_AUDIO_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "RunpodsSecretName", {
      value: RUNPODS_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "RunpodsUrlSecretName", {
      value: RUNPODS_URL_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "ClaudeSecretName", {
      value: CLAUDE_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "OpenAiSecretName", {
      value: OPENAI_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "GoogleAiSecretName", {
      value: GOOGLE_AI_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "BrevoSecretName", {
      value: BREVO_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "AlgoliaSecretName", {
      value: ALGOLIA_SECRET_NAME,
    });
    new cdk.CfnOutput(this, "MediaCloudFrontDomain", {
      value: this.media.distribution.domainName,
    });
    new cdk.CfnOutput(this, "MediaBucketName", {
      description:
        "S3 bucket that stores generated meditations and background audio",
      value: this.media.bucket.bucketName,
      // Distinct from MedimadeBackend's MediaBucketName until cutover.
      exportName: "ConsciouslyMediaBucketName",
    });
    new cdk.CfnOutput(this, "BlogRevalidateSecretArn", {
      description:
        "Secrets Manager ARN for BLOG_REVALIDATE_SECRET (marketing /read on-demand purge)",
      value: this.config.blogRevalidateSecret.secretArn,
    });
    new cdk.CfnOutput(this, "AuthJwtSecretArn", {
      description: "Secrets Manager ARN for Consciously session JWT signing",
      value: this.config.authJwtSecret.secretArn,
    });
  }
}
