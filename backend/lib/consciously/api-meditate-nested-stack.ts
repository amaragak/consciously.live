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

export type ConsciouslyApiMeditateNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  config: ConsciouslyConfigNestedStack;
  database: ConsciouslyDatabaseNestedStack;
  media: ConsciouslyMediaNestedStack;
  ffmpegLayer: lambda.ILayerVersion;
  /** Voice FX (Pedalboard) lives in ApiAdmin; worker invokes it by name. */
  voiceFxFunction: lambda.IFunction;
};

/**
 * Library, meditation jobs/worker, ratings, share/public, mix, analytics, background audio list.
 * One shared IAM execution role for all Lambdas in this nest.
 */
export class ConsciouslyApiMeditateNestedStack extends cdk.NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyApiMeditateNestedStackProps,
  ) {
    super(scope, id, props);

    const { httpApi, ffmpegLayer, voiceFxFunction } = props;
    const fishApiKeySecret = props.config.fishApiKey;
    const speechifyApiKeySecret = props.config.speechifyApiKey;
    const claudeApiKeySecret = props.config.claudeApiKey;
    const openAiApiKeySecret = props.config.openAiApiKey;
    const runpodsApiKeySecret = props.config.runpodsApiKey;
    const runpodsUrlSecret = props.config.runpodsUrl;
    const authJwtSecret = props.config.authJwtSecret;
    const algoliaSecret = props.config.algolia;
    const mediaBucket = props.media.bucket;
    const mediaDistribution = props.media.distribution;
    const meditationAnalyticsTable = props.database.meditationAnalytics;
    const meditationListenerMixTable = props.database.meditationListenerMix;
    const meditationJobsTable = props.database.meditationJobs;
    const soundCatalogTable = props.database.soundCatalog;
    const voiceAdminTable = props.database.voiceAdmin;

    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    meditationAnalyticsTable.grantReadWriteData(role);
    meditationJobsTable.grantReadWriteData(role);
    meditationListenerMixTable.grantReadWriteData(role);
    soundCatalogTable.grantReadData(role);
    voiceAdminTable.grantReadData(role);
    mediaBucket.grantReadWrite(role);
    authJwtSecret.grantRead(role);
    fishApiKeySecret.grantRead(role);
    claudeApiKeySecret.grantRead(role);
    openAiApiKeySecret.grantRead(role);
    runpodsApiKeySecret.grantRead(role);
    runpodsUrlSecret.grantRead(role);
    algoliaSecret.grantRead(role);
    const workerRole = new iam.Role(this, "MeditationAudioWorkerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    meditationAnalyticsTable.grantReadWriteData(workerRole);
    meditationJobsTable.grantReadWriteData(workerRole);
    soundCatalogTable.grantReadData(workerRole);
    voiceAdminTable.grantReadData(workerRole);
    mediaBucket.grantReadWrite(workerRole);
    fishApiKeySecret.grantRead(workerRole);
    speechifyApiKeySecret.grantRead(workerRole);
    claudeApiKeySecret.grantRead(workerRole);
    openAiApiKeySecret.grantRead(workerRole);
    runpodsApiKeySecret.grantRead(workerRole);
    runpodsUrlSecret.grantRead(workerRole);
    algoliaSecret.grantRead(workerRole);
    workerRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [voiceFxFunction.functionArn],
      }),
    );

    const meditationAudioWorker = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationAudioWorkerFunction",
      {
        entry: path.join(__dirname, "../../lambdas/generate-meditation-audio.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(900),
        // A 20-minute meditation is a ~100 MB WAV through the FX round trip;
        // 1024 MB ran out of memory on a 153-section script.
        memorySize: 2048,
        layers: [ffmpegLayer],
        role: workerRole,
        environment: {
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
          OPENAI_SECRET_ARN: openAiApiKeySecret.secretArn,
          FISH_AUDIO_SECRET_ARN: fishApiKeySecret.secretArn,
          SPEECHIFY_SECRET_ARN: speechifyApiKeySecret.secretArn,
          SPEECHIFY_TTS_MODEL: "simba-3.2",
          RUNPODS_SECRET_ARN: runpodsApiKeySecret.secretArn,
          RUNPODS_URL_SECRET_ARN: runpodsUrlSecret.secretArn,
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
          CONSCIOUSLY_API_URL: httpApi.apiEndpoint,
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          MEDITATION_JOBS_TABLE_NAME: meditationJobsTable.tableName,
          FISH_TTS_MODEL: "s2.1-pro-free",
          VOICE_ADMIN_TABLE_NAME: voiceAdminTable.tableName,
          VOICE_FX_FUNCTION_NAME: voiceFxFunction.functionName,
        },
      },
    );
    // createMeditationJob (shared nest role) invokes the worker — separate roles avoid CFN cycles.
    meditationAudioWorker.grantInvoke(role);

    const createMeditationJob = new lambda_nodejs.NodejsFunction(
      this,
      "CreateMeditationJobFunction",
      {
        entry: path.join(__dirname, "../../lambdas/create-meditation-job.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_JOBS_TABLE_NAME: meditationJobsTable.tableName,
          WORKER_FUNCTION_NAME: meditationAudioWorker.functionName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    const getMeditationJob = new lambda_nodejs.NodejsFunction(
      this,
      "GetMeditationJobFunction",
      {
        entry: path.join(__dirname, "../../lambdas/get-meditation-job.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_JOBS_TABLE_NAME: meditationJobsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "CreateMeditationJobRoute",
      path: "/meditation/audio/jobs",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "CreateMeditationJobIntegration",
        createMeditationJob,
      ),
    });
    addNestHttpRoutes(this, httpApi, {
      id: "GetMeditationJobRoute",
      path: "/meditation/audio/jobs/{jobId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "GetMeditationJobIntegration",
        getMeditationJob,
      ),
    });

    const analyticsList = new lambda_nodejs.NodejsFunction(
      this,
      "AnalyticsListFunction",
      {
        entry: path.join(__dirname, "../../lambdas/analytics-list.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "AnalyticsMeditationsListRoute",
      path: "/analytics/meditations",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "AnalyticsMeditationsListIntegration",
        analyticsList,
      ),
    });

    const libraryList = new lambda_nodejs.NodejsFunction(
      this,
      "LibraryListFunction",
      {
        entry: path.join(__dirname, "../../lambdas/library-list.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          MEDITATION_LISTENER_MIX_TABLE_NAME: meditationListenerMixTable.tableName,
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          VOICE_ADMIN_TABLE_NAME: voiceAdminTable.tableName,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "LibraryListRoute",
      path: "/library/meditations",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "LibraryListIntegration",
        libraryList,
      ),
    });

    const libraryPrograms = new lambda_nodejs.NodejsFunction(
      this,
      "LibraryProgramsFunction",
      {
        entry: path.join(__dirname, "../../lambdas/library-programs.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          VOICE_ADMIN_TABLE_NAME: voiceAdminTable.tableName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "LibraryProgramsRoute",
      path: "/library/programs",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.OPTIONS],
      integration: new integrations.HttpLambdaIntegration(
        "LibraryProgramsIntegration",
        libraryPrograms,
      ),
    });

    const libraryDraft = new lambda_nodejs.NodejsFunction(
      this,
      "LibraryDraftFunction",
      {
        entry: path.join(__dirname, "../../lambdas/library-draft.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(15),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          ALGOLIA_SECRET_ARN: algoliaSecret.secretArn,
        },
      },
    );

    const libraryDraftIntegration = new integrations.HttpLambdaIntegration(
      "LibraryDraftIntegration",
      libraryDraft,
    );
    addNestHttpRoutes(this, httpApi, {
      id: "libraryDraftRoute",
      path: "/library/meditations/draft",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: libraryDraftIntegration,
    });

    const meditationRating = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationRatingFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-rating.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationRatingRoute",
      path: "/library/meditations/rating",
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationRatingIntegration",
        meditationRating,
      ),
    });

    const meditationFavourite = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationFavouriteFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-favourite.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationFavouriteRoute",
      path: "/library/meditations/favourite",
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationFavouriteIntegration",
        meditationFavourite,
      ),
    });

    const meditationArchive = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationArchiveFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-archive.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationArchiveRoute",
      path: "/library/meditations/archive",
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationArchiveIntegration",
        meditationArchive,
      ),
    });

    const meditationPublic = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationPublicFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-public.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationPublicRoute",
      path: "/library/meditations/public",
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationPublicIntegration",
        meditationPublic,
      ),
    });

    const meditationShare = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationShareFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-share.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationShareRoute",
      path: "/library/meditations/share",
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationShareIntegration",
        meditationShare,
      ),
    });

    const meditationByShareToken = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationByShareTokenFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-by-share-token.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationByShareTokenRoute",
      path: "/public/meditations/by-token/{token}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationByShareTokenIntegration",
        meditationByShareToken,
      ),
    });

    const meditationByPublicId = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationByPublicIdFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-by-public-id.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(20),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationByPublicIdRoute",
      path: "/public/meditations/by-id/{id}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationByPublicIdIntegration",
        meditationByPublicId,
      ),
    });

    const meditationMix = new lambda_nodejs.NodejsFunction(
      this,
      "MeditationMixFunction",
      {
        entry: path.join(__dirname, "../../lambdas/meditation-mix.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          MEDITATION_LISTENER_MIX_TABLE_NAME: meditationListenerMixTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "MeditationMixRoute",
      path: "/library/meditations/mix",
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        "MeditationMixIntegration",
        meditationMix,
      ),
    });

    const libraryMeditationDevRefresh = new lambda_nodejs.NodejsFunction(
      this,
      "LibraryMeditationDevRefreshFunction",
      {
        entry: path.join(
          __dirname,
          "../../lambdas/library-meditation-dev-refresh.ts",
        ),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(60),
        memorySize: 512,
        role,
        environment: {
          MEDITATION_ANALYTICS_TABLE_NAME: meditationAnalyticsTable.tableName,
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
          OPENAI_SECRET_ARN: openAiApiKeySecret.secretArn,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "LibraryMeditationDevRefreshRoute",
      path: "/library/meditations/dev-refresh",
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        "LibraryMeditationDevRefreshIntegration",
        libraryMeditationDevRefresh,
      ),
    });

    const listBackgroundAudio = new lambda_nodejs.NodejsFunction(
      this,
      "ListBackgroundAudioFunction",
      {
        entry: path.join(__dirname, "../../lambdas/list-background-audio.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        role,
        environment: {
          MEDIA_BUCKET_NAME: mediaBucket.bucketName,
          MEDIA_CLOUDFRONT_DOMAIN: mediaDistribution.domainName,
          SOUND_CATALOG_TABLE_NAME: soundCatalogTable.tableName,
        },
      },
    );
    addNestHttpRoutes(this, httpApi, {
      id: "ListBackgroundAudioRoute",
      path: "/media/background-audio",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "ListBackgroundAudioIntegration",
        listBackgroundAudio,
      ),
    });
  }
}
