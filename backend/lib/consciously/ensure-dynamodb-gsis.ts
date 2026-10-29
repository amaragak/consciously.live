import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import * as path from "node:path";

export type EnsureDynamoGsiKey = {
  name: string;
  type: dynamodb.AttributeType;
};

export type EnsureDynamoGsiSpec = {
  indexName: string;
  partitionKey: EnsureDynamoGsiKey;
  sortKey?: EnsureDynamoGsiKey;
  projectionType?: dynamodb.ProjectionType;
};

export type EnsureDynamoDbGsisProps = {
  table: dynamodb.ITable;
  /**
   * Indexes this custom resource should create if missing.
   * Empty is allowed (cutover: CDK still owns every GSI) so the resource
   * exists and later deploys can Update when indexes move here.
   */
  indexes: EnsureDynamoGsiSpec[];
};

function attrType(t: dynamodb.AttributeType): "S" | "N" | "B" {
  if (t === dynamodb.AttributeType.NUMBER) return "N";
  if (t === dynamodb.AttributeType.BINARY) return "B";
  return "S";
}

/**
 * Create / catch up multiple DynamoDB GSIs in one stack deploy.
 * Vanilla `Table.addGlobalSecondaryIndex` can only add or remove one GSI per
 * UpdateTable; this custom resource creates missing indexes one-by-one and
 * waits for ACTIVE between each.
 */
export class EnsureDynamoDbGsis extends Construct {
  constructor(scope: Construct, id: string, props: EnsureDynamoDbGsisProps) {
    super(scope, id);

    const onEvent = new lambda_nodejs.NodejsFunction(this, "OnEvent", {
      entry: path.join(__dirname, "../../lambdas/ensure-dynamodb-gsis.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      // Empty tables are quick; leave headroom for larger region restores.
      timeout: cdk.Duration.minutes(15),
      memorySize: 256,
      description: "Ensure DynamoDB GSIs one-at-a-time (CFN custom resource)",
    });

    onEvent.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:DescribeTable", "dynamodb:UpdateTable"],
        resources: [props.table.tableArn],
      }),
    );

    const provider = new cr.Provider(this, "Provider", {
      onEventHandler: onEvent,
    });

    const indexesJson = props.indexes.map((idx) => ({
      indexName: idx.indexName,
      partitionKey: {
        name: idx.partitionKey.name,
        type: attrType(idx.partitionKey.type),
      },
      ...(idx.sortKey
        ? {
            sortKey: {
              name: idx.sortKey.name,
              type: attrType(idx.sortKey.type),
            },
          }
        : {}),
      projectionType:
        idx.projectionType === dynamodb.ProjectionType.KEYS_ONLY
          ? "KEYS_ONLY"
          : "ALL",
    }));

    const resource = new cdk.CustomResource(this, "Resource", {
      serviceToken: provider.serviceToken,
      properties: {
        TableName: props.table.tableName,
        // Synth-time JSON so CFN diffs stay stable and the Lambda always gets
        // a parseable blob (nested CFN arrays are awkward).
        Indexes: JSON.stringify(indexesJson),
        // Bump when index *set* changes so Update re-runs the handler.
        IndexFingerprint: indexesJson.map((i) => i.indexName).join(","),
      },
    });
    resource.node.addDependency(props.table);
  }
}
