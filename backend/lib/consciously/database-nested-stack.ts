import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
import { EnsureDynamoDbGsis } from "./ensure-dynamodb-gsis";

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
  /** Lifetime + daily AI spend ledger (events + aggregates). */
  readonly aiUsage: dynamodb.Table;
  /** Homepage pre-release sign-ups. Rate-limit rows use a ttl; sign-ups do not. */
  readonly waitlist: dynamodb.Table;

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
    // MeditationAnalytics GSIs: DynamoDB allows only one GSI create/delete per
    // UpdateTable. EnsureDynamoDbGsis creates missing indexes sequentially.
    //
    // Default (no context): keep all three on the Table resource — safe for the
    // live eu-west-2 stack / CI, which already declare them in CFN.
    // Greenfield / post-cutover: `-c analyticsGsisViaCr=1` (CR owns all).
    // Cutover: `-c analyticsCdkGsis=name1,name2` shrinking allow-list (one
    // drop per deploy); CR recreates each dropped index after the Table update.
    const analyticsGsis: Array<{
      indexName: string;
      partitionKey: { name: string; type: dynamodb.AttributeType };
      sortKey?: { name: string; type: dynamodb.AttributeType };
      projectionType: dynamodb.ProjectionType;
    }> = [
      {
        indexName: "shareTokenIndex",
        partitionKey: {
          name: "shareToken",
          type: dynamodb.AttributeType.STRING,
        },
        projectionType: dynamodb.ProjectionType.ALL,
      },
      {
        indexName: "listenSlugIndex",
        partitionKey: {
          name: "listenSlug",
          type: dynamodb.AttributeType.STRING,
        },
        projectionType: dynamodb.ProjectionType.ALL,
      },
      {
        indexName: "listenListedIndex",
        partitionKey: {
          name: "listenListed",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "listenListedAt",
          type: dynamodb.AttributeType.STRING,
        },
        projectionType: dynamodb.ProjectionType.ALL,
      },
    ];

    const allAnalyticsGsiNames = analyticsGsis.map((g) => g.indexName);
    const cdkGsiCsv = this.node.tryGetContext("analyticsCdkGsis");
    const viaCrRaw = this.node.tryGetContext("analyticsGsisViaCr");
    const viaCr =
      viaCrRaw === true ||
      viaCrRaw === 1 ||
      viaCrRaw === "1" ||
      viaCrRaw === "true";
    const cdkGsiNames =
      typeof cdkGsiCsv === "string"
        ? new Set(
            cdkGsiCsv
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean),
          )
        : viaCr
          ? new Set<string>()
          : new Set(allAnalyticsGsiNames);

    for (const gsi of analyticsGsis) {
      if (!cdkGsiNames.has(gsi.indexName)) continue;
      this.meditationAnalytics.addGlobalSecondaryIndex({
        indexName: gsi.indexName,
        partitionKey: gsi.partitionKey,
        ...(gsi.sortKey ? { sortKey: gsi.sortKey } : {}),
        projectionType: gsi.projectionType,
      });
    }

    // CR owns only indexes not still declared on the Table. Dropping a name
    // from analyticsCdkGsis changes IndexFingerprint so CFN re-invokes the
    // handler after the Table update (which deletes that GSI) and recreates it.
    new EnsureDynamoDbGsis(this, "MeditationAnalyticsGsis", {
      table: this.meditationAnalytics,
      indexes: analyticsGsis.filter((gsi) => !cdkGsiNames.has(gsi.indexName)),
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

    this.aiUsage = new dynamodb.Table(this, "AiUsageTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      ...payPerRequest,
    });

    this.waitlist = new dynamodb.Table(this, "WaitlistTable", {
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      ...payPerRequest,
    });
  }
}
