import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

/**
 * Media S3 bucket + CloudFront.
 * S3 → Lambda notifications are attached from the API nested stack (avoids Media ↔ API cycles).
 */
export class ConsciouslyMediaNestedStack extends cdk.NestedStack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly oai: cloudfront.OriginAccessIdentity;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

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
  }
}
