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

export type ConsciouslyApiManifestNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  config: ConsciouslyConfigNestedStack;
  database: ConsciouslyDatabaseNestedStack;
  media: ConsciouslyMediaNestedStack;
};

/**
 * Ideate / vision / famous quotes / dashboard daily status.
 * One shared IAM execution role for all Lambdas in this nest.
 */
export class ConsciouslyApiManifestNestedStack extends cdk.NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyApiManifestNestedStackProps,
  ) {
    super(scope, id, props);

    const { httpApi } = props;
    const googleAiApiKeySecret = props.config.googleAiApiKey;
    const claudeApiKeySecret = props.config.claudeApiKey;
    const authJwtSecret = props.config.authJwtSecret;
    const algoliaSecret = props.config.algolia;
    const mediaBucket = props.media.bucket;
    const mediaDistribution = props.media.distribution;
    const ideateTable = props.database.ideate;
    const habitsTable = props.database.habits;
    const famousQuotesTable = props.database.famousQuotes;
    const journalTable = props.database.journal;

    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    ideateTable.grantReadWriteData(role);
    famousQuotesTable.grantReadWriteData(role);
    habitsTable.grantReadWriteData(role);
    journalTable.grantReadData(role);
    mediaBucket.grantReadWrite(role);
    authJwtSecret.grantRead(role);
    googleAiApiKeySecret.grantRead(role);
    claudeApiKeySecret.grantRead(role);
    algoliaSecret.grantRead(role);

    const visionGenerate = new lambda_nodejs.NodejsFunction(
      this,
      "VisionGenerateFunction",
      {
        entry: path.join(__dirname, "../../lambdas/vision-generate.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(180),
        memorySize: 1024,
        role,
        environment: {
          GOOGLE_AI_SECRET_ARN: googleAiApiKeySecret.secretArn,
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          VISION_IMAGE_MODEL: "gemini-3-pro-image",
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "VisionGenerateRoute",
      path: "/ideate/vision/generate",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "VisionGenerateIntegration",
        visionGenerate,
      ),
    });

    const visionMediaUpload = new lambda_nodejs.NodejsFunction(
      this,
      "VisionMediaUploadFunction",
      {
        entry: path.join(__dirname, "../../lambdas/vision-media-upload.ts"),
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
      id: "VisionMediaUploadRoute",
      path: "/ideate/vision/media",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "VisionMediaUploadIntegration",
        visionMediaUpload,
      ),
    });

    const ideateStore = new lambda_nodejs.NodejsFunction(
      this,
      "IdeateStoreFunction",
      {
        entry: path.join(__dirname, "../../lambdas/ideate-store.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        role,
        environment: {
          IDEATE_TABLE_NAME: ideateTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          ALGOLIA_SECRET_ARN: algoliaSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "IdeateStoreRoute",
      path: "/ideate/store",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "IdeateStoreIntegration",
        ideateStore,
      ),
    });

    const dashboardDailyStatus = new lambda_nodejs.NodejsFunction(
      this,
      "DashboardDailyStatusFunction",
      {
        entry: path.join(__dirname, "../../lambdas/dashboard-daily-status.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        role,
        environment: {
          HABITS_TABLE_NAME: habitsTable.tableName,
          JOURNAL_TABLE_NAME: journalTable.tableName,
          IDEATE_TABLE_NAME: ideateTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    const dailyStatusIntegration = new integrations.HttpLambdaIntegration(
      "DashboardDailyStatusIntegration",
      dashboardDailyStatus,
    );
    const dailyStatusApiIntegration = new integrations.HttpLambdaIntegration(
      "DashboardDailyStatusApiIntegration",
      dashboardDailyStatus,
    );
    addNestHttpRoutes(this, httpApi, {
      id: "DashboardDailyStatusRoute",
      path: "/dashboard/daily-status",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: dailyStatusIntegration,
    });
    addNestHttpRoutes(this, httpApi, {
      id: "DashboardDailyStatusApiRoute",
      path: "/api/dashboard/daily-status",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: dailyStatusApiIntegration,
    });
    addNestHttpRoutes(this, httpApi, {
      id: "DashboardPlayEventsRoute",
      path: "/dashboard/play-events",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "DashboardPlayEventsIntegration",
        dashboardDailyStatus,
      ),
    });

    const ideateFamousQuotes = new lambda_nodejs.NodejsFunction(
      this,
      "IdeateFamousQuotesFunction",
      {
        entry: path.join(__dirname, "../../lambdas/ideate-famous-quotes.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(60),
        memorySize: 512,
        role,
        environment: {
          FAMOUS_QUOTES_TABLE_NAME: famousQuotesTable.tableName,
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "IdeateFamousQuotesRoute",
      path: "/ideate/famous-quotes",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "IdeateFamousQuotesIntegration",
        ideateFamousQuotes,
      ),
    });
  }
}
