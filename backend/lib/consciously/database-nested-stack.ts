import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

/**
 * All DynamoDB tables for ConsciouslyBackend.
 * Empty shell tables mirror MedimadeBackend schemas; data restore is a later step.
 */
export class ConsciouslyDatabaseNestedStack extends cdk.NestedStack {
  readonly meditationAnalytics: dynamodb.Table;
  readonly journal: dynamodb.Table;
  readonly assistantChat: dynamodb.Table;
  readonly ideate: dynamodb.Table;
  readonly habits: dynamodb.Table;
  readonly famousQuotes: dynamodb.Table;
  readonly journalInsights: dynamodb.Table;
  readonly soundCatalog: dynamodb.Table;
  readonly voiceAdmin: dynamodb.Table;
  readonly meditationListenerMix: dynamodb.Table;
  readonly users: dynamodb.Table;
  readonly magicLink: dynamodb.Table;
  readonly refresh: dynamodb.Table;
  readonly meditationJobs: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    const payPerRequest = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    } as const;

    const pkSk = {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      ...payPerRequest,
    };

    this.meditationAnalytics = new dynamodb.Table(
      this,
      "MeditationAnalyticsTable",
      pkSk,
    );
    this.meditationAnalytics.addGlobalSecondaryIndex({
      indexName: "shareTokenIndex",
      partitionKey: { name: "shareToken", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.journal = new dynamodb.Table(this, "JournalTable", pkSk);
    this.assistantChat = new dynamodb.Table(this, "AssistantChatTable", pkSk);
    this.ideate = new dynamodb.Table(this, "IdeateTable", pkSk);
    this.habits = new dynamodb.Table(this, "HabitsTable", pkSk);
    this.famousQuotes = new dynamodb.Table(this, "IdeateFamousQuotesTable", pkSk);
    this.journalInsights = new dynamodb.Table(this, "JournalInsightsTable", pkSk);
    this.soundCatalog = new dynamodb.Table(this, "SoundCatalogTable", pkSk);
    this.voiceAdmin = new dynamodb.Table(this, "VoiceAdminTable", pkSk);
    this.meditationListenerMix = new dynamodb.Table(
      this,
      "MeditationListenerMixTable",
      pkSk,
    );

    this.users = new dynamodb.Table(this, "UsersTable", {
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      ...payPerRequest,
    });

    this.magicLink = new dynamodb.Table(this, "MagicLinkTable", {
      partitionKey: { name: "token", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      ...payPerRequest,
    });

    this.refresh = new dynamodb.Table(this, "RefreshTable", {
      partitionKey: { name: "tokenHash", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      ...payPerRequest,
    });

    this.meditationJobs = new dynamodb.Table(this, "MeditationJobsTable", {
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      ...payPerRequest,
    });
  }
}
