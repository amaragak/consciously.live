import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import type { Construct } from "constructs";
import { ConsciouslyApiAdminNestedStack } from "./consciously/api-admin-nested-stack";
import { ConsciouslyApiAuthNestedStack } from "./consciously/api-auth-nested-stack";
import { ConsciouslyApiChatNestedStack } from "./consciously/api-chat-nested-stack";
import { ConsciouslyApiJournalNestedStack } from "./consciously/api-journal-nested-stack";
import { ConsciouslyApiManifestNestedStack } from "./consciously/api-manifest-nested-stack";
import { ConsciouslyApiMeditateNestedStack } from "./consciously/api-meditate-nested-stack";
import { CONSCIOUSLY_HTTP_API_CORS_ORIGINS } from "./consciously/api-http";
import { ConsciouslyAuthNestedStack } from "./consciously/auth-nested-stack";
import { ConsciouslyConfigNestedStack } from "./consciously/config-nested-stack";
import { ConsciouslyDatabaseNestedStack } from "./consciously/database-nested-stack";
import { createConsciouslyLayers } from "./consciously/layers";
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
 *   Config → Auth → Database → layers → Media(with normalize) → HttpApi → Api*
 *
 * HttpApi + layers live on this parent; domain routes/Lambdas live in Api* nests.
 * Media owns bg-audio normalize + S3 notification (avoids Media ↔ ApiAdmin cycles).
 */
export class ConsciouslyStack extends cdk.Stack {
  readonly config: ConsciouslyConfigNestedStack;
  readonly auth: ConsciouslyAuthNestedStack;
  readonly database: ConsciouslyDatabaseNestedStack;
  readonly media: ConsciouslyMediaNestedStack;
  readonly httpApi: apigwv2.HttpApi;
  readonly apiAuth: ConsciouslyApiAuthNestedStack;
  readonly apiAdmin: ConsciouslyApiAdminNestedStack;
  readonly apiMeditate: ConsciouslyApiMeditateNestedStack;
  readonly apiManifest: ConsciouslyApiManifestNestedStack;
  readonly apiJournal: ConsciouslyApiJournalNestedStack;
  readonly apiChat: ConsciouslyApiChatNestedStack;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.config = new ConsciouslyConfigNestedStack(this, "Config");
    this.auth = new ConsciouslyAuthNestedStack(this, "Auth");
    this.database = new ConsciouslyDatabaseNestedStack(this, "Database");

    const layers = createConsciouslyLayers(this);

    this.media = new ConsciouslyMediaNestedStack(this, "Media", {
      ffmpegLayer: layers.ffmpegLayer,
      soundCatalogTable: this.database.soundCatalog,
    });

    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "consciously-api",
      corsPreflight: {
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Medimade-Authorization",
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [...CONSCIOUSLY_HTTP_API_CORS_ORIGINS],
        allowCredentials: true,
        maxAge: cdk.Duration.days(1),
      },
    });

    this.apiAuth = new ConsciouslyApiAuthNestedStack(this, "ApiAuth", {
      httpApi: this.httpApi,
      config: this.config,
      auth: this.auth,
      database: this.database,
    });

    // Admin before Meditate so voice-fx can be passed without a cycle.
    this.apiAdmin = new ConsciouslyApiAdminNestedStack(this, "ApiAdmin", {
      httpApi: this.httpApi,
      config: this.config,
      database: this.database,
      media: this.media,
      ffmpegLayer: layers.ffmpegLayer,
      fastembedLayer: layers.fastembedLayer,
      pedalboardLayer: layers.pedalboardLayer,
    });

    this.apiMeditate = new ConsciouslyApiMeditateNestedStack(this, "ApiMeditate", {
      httpApi: this.httpApi,
      config: this.config,
      database: this.database,
      media: this.media,
      ffmpegLayer: layers.ffmpegLayer,
      voiceFxFunction: this.apiAdmin.voiceFxFunction,
    });

    this.apiManifest = new ConsciouslyApiManifestNestedStack(this, "ApiManifest", {
      httpApi: this.httpApi,
      config: this.config,
      database: this.database,
      media: this.media,
    });

    this.apiJournal = new ConsciouslyApiJournalNestedStack(this, "ApiJournal", {
      httpApi: this.httpApi,
      config: this.config,
      database: this.database,
      media: this.media,
    });

    this.apiChat = new ConsciouslyApiChatNestedStack(this, "ApiChat", {
      httpApi: this.httpApi,
      config: this.config,
      database: this.database,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.httpApi.apiEndpoint,
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
      value: `${this.httpApi.apiEndpoint}/fish/tts`,
    });
    new cdk.CfnOutput(this, "OrpheusTtsUrl", {
      description:
        "Orpheus TTS (OpenAI-compatible). POST /v1/audio/speech or /orpheus/tts",
      value: `${this.httpApi.apiEndpoint}/v1/audio/speech`,
    });
    new cdk.CfnOutput(this, "VoiceFxUrl", {
      description: "Pedalboard voice FX (POST audio + effect chain)",
      value: `${this.httpApi.apiEndpoint}/audio/voice-fx`,
    });
    new cdk.CfnOutput(this, "MedimadeChatUrl", {
      description:
        "Meditation coach Claude chat (Function URL, RESPONSE_STREAM)",
      value: this.apiChat.medimadeChatUrl.url,
    });
    new cdk.CfnOutput(this, "AssistantChatUrl", {
      description:
        "App-control Consciously Chat (Function URL, RESPONSE_STREAM)",
      value: this.apiChat.assistantChatUrl.url,
    });
    new cdk.CfnOutput(this, "AdminScriptLabUrl", {
      description:
        "Admin Script Lab (Function URL — long generate/TTS jobs; use instead of API Gateway)",
      value: this.apiAdmin.adminScriptLabUrl.url,
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
