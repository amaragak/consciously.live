import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { addNestHttpRoutes } from "./api-http";
import type { ConsciouslyConfigNestedStack } from "./config-nested-stack";
import type { ConsciouslyDatabaseNestedStack } from "./database-nested-stack";
import type { ConsciouslyMediaNestedStack } from "./media-nested-stack";

export type ConsciouslyApiJournalNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  config: ConsciouslyConfigNestedStack;
  database: ConsciouslyDatabaseNestedStack;
  media: ConsciouslyMediaNestedStack;
};

/**
 * Journal store / transcribe / voice / insights / weekly / import OCR+PDF.
 * One shared IAM execution role for all Lambdas in this nest.
 */
export class ConsciouslyApiJournalNestedStack extends cdk.NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyApiJournalNestedStackProps,
  ) {
    super(scope, id, props);

    const { httpApi } = props;
    const openAiApiKeySecret = props.config.openAiApiKey;
    const claudeApiKeySecret = props.config.claudeApiKey;
    const authJwtSecret = props.config.authJwtSecret;
    const algoliaSecret = props.config.algolia;
    const mediaBucket = props.media.bucket;
    const mediaDistribution = props.media.distribution;
    const journalTable = props.database.journal;
    const journalInsightsTable = props.database.journalInsights;
    const meditationAnalyticsTable = props.database.meditationAnalytics;
    const meditationJobsTable = props.database.meditationJobs;

    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    journalTable.grantReadWriteData(role);
    journalInsightsTable.grantReadWriteData(role);
    mediaBucket.grantReadWrite(role);
    authJwtSecret.grantRead(role);
    openAiApiKeySecret.grantRead(role);
    claudeApiKeySecret.grantRead(role);
    algoliaSecret.grantRead(role);
    meditationAnalyticsTable.grantReadData(role);
    meditationJobsTable.grantReadData(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["textract:DetectDocumentText"],
        resources: ["*"],
      }),
    );

    const journalTranscribe = new lambda_nodejs.NodejsFunction(
      this,
      "JournalTranscribeFunction",
      {
        entry: path.join(__dirname, "../../lambdas/journal-transcribe.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(120),
        memorySize: 512,
        role,
        environment: {
          OPENAI_SECRET_ARN: openAiApiKeySecret.secretArn,
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "JournalTranscribeRoute",
      path: "/journal/transcribe",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "JournalTranscribeIntegration",
        journalTranscribe,
      ),
    });

    const journalStore = new lambda_nodejs.NodejsFunction(
      this,
      "JournalStoreFunction",
      {
        entry: path.join(__dirname, "../../lambdas/journal-store.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        role,
        environment: {
          JOURNAL_TABLE_NAME: journalTable.tableName,
          /** Legacy `journal/stores/{ownerId}.json` — read + delete on first GET after DDB migration. */
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          ALGOLIA_SECRET_ARN: algoliaSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "JournalStoreRoute",
      path: "/journal/store",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "JournalStoreIntegration",
        journalStore,
      ),
    });

    const journalVoiceUpload = new lambda_nodejs.NodejsFunction(
      this,
      "JournalVoiceUploadFunction",
      {
        entry: path.join(__dirname, "../../lambdas/journal-voice-upload.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        role,
        environment: {
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "JournalVoiceUploadRoute",
      path: "/journal/voice",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "JournalVoiceUploadIntegration",
        journalVoiceUpload,
      ),
    });

    const journalInsights = new lambda_nodejs.NodejsFunction(
      this,
      "JournalInsightsFunction",
      {
        entry: path.join(__dirname, "../../lambdas/journal-insights.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(60),
        memorySize: 1024,
        role,
        environment: {
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
          JOURNAL_TABLE_NAME: journalTable.tableName,
          JOURNAL_INSIGHTS_TABLE_NAME: journalInsightsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "JournalInsightsRoute",
      path: "/journal/insights",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "JournalInsightsIntegration",
        journalInsights,
      ),
    });

    const journalWeeklyReflection = new lambda_nodejs.NodejsFunction(
      this,
      "JournalWeeklyReflectionFunction",
      {
        entry: path.join(__dirname, "../../lambdas/journal-weekly-reflection.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(60),
        memorySize: 1024,
        role,
        environment: {
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
          JOURNAL_TABLE_NAME: journalTable.tableName,
          JOURNAL_INSIGHTS_TABLE_NAME: journalInsightsTable.tableName,
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          MEDITATION_JOBS_TABLE_NAME: meditationJobsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "JournalWeeklyReflectionRoute",
      path: "/journal/weekly-reflection",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "JournalWeeklyReflectionIntegration",
        journalWeeklyReflection,
      ),
    });

    const journalImportPdf = new lambda_nodejs.NodejsFunction(
      this,
      "JournalImportPdfFunction",
      {
        entry: path.join(__dirname, "../../lambdas/journal-import-pdf.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(90),
        memorySize: 512,
        role,
        environment: {
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "JournalImportPdfRoute",
      path: "/journal/import/pdf",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "JournalImportPdfIntegration",
        journalImportPdf,
      ),
    });

    const journalImportOcr = new lambda_nodejs.NodejsFunction(
      this,
      "JournalImportOcrFunction",
      {
        entry: path.join(__dirname, "../../lambdas/journal-import-ocr.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        role,
        environment: {
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "JournalImportOcrRoute",
      path: "/journal/import/ocr",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "JournalImportOcrIntegration",
        journalImportOcr,
      ),
    });
  }
}
