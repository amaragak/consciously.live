import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

export type ConsciouslyMediaNestedStackProps = cdk.NestedStackProps & {
  ffmpegLayer: lambda.ILayerVersion;
  soundCatalogTable: dynamodb.ITable;
};

/**
 * Media S3 bucket + CloudFront + bg-audio normalize (S3 trigger stays in this
 * nest so Media does not depend on Api* nests).
 */
export class ConsciouslyMediaNestedStack extends cdk.NestedStack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly oai: cloudfront.OriginAccessIdentity;

  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyMediaNestedStackProps,
  ) {
    super(scope, id, props);

    const { ffmpegLayer, soundCatalogTable } = props;

    this.bucket = new s3.Bucket(this, "MediaBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // RETAIN until cutover/restore tooling is proven; flip later if desired.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag", "etag"],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: cdk.Duration.days(2) },
      ],
    });

    this.oai = new cloudfront.OriginAccessIdentity(this, "MediaOAI");
    this.bucket.grantRead(this.oai);

    this.distribution = new cloudfront.Distribution(this, "MediaDistribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity: this.oai,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
      },
    });

    const normalizeRole = new iam.Role(this, "BgAudioNormalizeRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    this.bucket.grantReadWrite(normalizeRole);
    soundCatalogTable.grantReadWriteData(normalizeRole);

    /** Normalize failures land here after retries so nothing disappears silently. */
    const bgAudioNormalizeDlq = new sqs.Queue(this, "BgAudioNormalizeDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });

    // Hour-long compositions decode to multi-GB intermediates, so this function
    // is sized for the worst case rather than the median sample.
    const bgAudioNormalize = new lambda_nodejs.NodejsFunction(
      this,
      "BgAudioNormalizeFunction",
      {
        entry: path.join(__dirname, "../../lambdas/bg-audio-normalize.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.minutes(15),
        memorySize: 3008,
        ephemeralStorageSize: cdk.Size.mebibytes(10240),
        retryAttempts: 1,
        deadLetterQueue: bgAudioNormalizeDlq,
        layers: [ffmpegLayer],
        role: normalizeRole,
        environment: {
          MEDIA_BUCKET_NAME: this.bucket.bucketName,
          SOUND_CATALOG_TABLE_NAME: soundCatalogTable.tableName,
        },
      },
    );
    this.bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(bgAudioNormalize),
      { prefix: "background-audio-raw/" },
    );
  }
}
