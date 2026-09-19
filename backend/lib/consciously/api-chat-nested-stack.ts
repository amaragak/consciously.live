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

export type ConsciouslyApiChatNestedStackProps = cdk.NestedStackProps & {
  httpApi: apigwv2.HttpApi;
  config: ConsciouslyConfigNestedStack;
  database: ConsciouslyDatabaseNestedStack;
};

/**
 * Claude coach + assistant chat (Function URLs) and assistant chat store.
 * One shared IAM execution role for all Lambdas in this nest.
 */
export class ConsciouslyApiChatNestedStack extends cdk.NestedStack {
  readonly medimadeChatUrl: lambda.FunctionUrl;
  readonly assistantChatUrl: lambda.FunctionUrl;

  constructor(
    scope: Construct,
    id: string,
    props: ConsciouslyApiChatNestedStackProps,
  ) {
    super(scope, id, props);

    const { httpApi } = props;
    const claudeApiKeySecret = props.config.claudeApiKey;
    const authJwtSecret = props.config.authJwtSecret;
    const assistantChatTable = props.database.assistantChat;

    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    claudeApiKeySecret.grantRead(role);
    assistantChatTable.grantReadWriteData(role);
    authJwtSecret.grantRead(role);

    const claudeChat = new lambda_nodejs.NodejsFunction(this, "ClaudeChatFunction", {
      entry: path.join(__dirname, "../../lambdas/claude-chat.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(120),
      memorySize: 512,
      role,
      environment: {
        CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
      },
    });

    this.medimadeChatUrl = claudeChat.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: ["*"],
        // Lambda URL CORS AllowMethods must be GET|PUT|HEAD|POST|PATCH|DELETE|* — not OPTIONS.
        // Preflight OPTIONS is still answered by Lambda when CORS is configured.
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ["content-type"],
      },
    });

    // addFunctionUrl only adds lambda:InvokeFunctionUrl. Since Oct 2025, public URLs also require
    // lambda:InvokeFunction with InvokedViaFunctionUrl or browsers get 403 Forbidden.
    const chatUrlInvokeFn = new lambda.CfnPermission(
      this,
      "ClaudeChatPublicInvokeFunction",
      {
        action: "lambda:InvokeFunction",
        functionName: claudeChat.functionName,
        principal: "*",
      },
    );
    chatUrlInvokeFn.addPropertyOverride("InvokedViaFunctionUrl", true);

    const assistantChat = new lambda_nodejs.NodejsFunction(
      this,
      "AssistantChatFunction",
      {
        entry: path.join(__dirname, "../../lambdas/assistant-chat.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(120),
        memorySize: 512,
        role,
        environment: {
          CLAUDE_SECRET_ARN: claudeApiKeySecret.secretArn,
        },
      },
    );

    this.assistantChatUrl = assistantChat.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ["content-type"],
      },
    });

    const assistantChatUrlInvokeFn = new lambda.CfnPermission(
      this,
      "AssistantChatPublicInvokeFunction",
      {
        action: "lambda:InvokeFunction",
        functionName: assistantChat.functionName,
        principal: "*",
      },
    );
    assistantChatUrlInvokeFn.addPropertyOverride("InvokedViaFunctionUrl", true);

    const assistantChatStore = new lambda_nodejs.NodejsFunction(
      this,
      "AssistantChatStoreFunction",
      {
        entry: path.join(__dirname, "../../lambdas/assistant-chat-store.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        role,
        environment: {
          ASSISTANT_CHAT_TABLE_NAME: assistantChatTable.tableName,
          AUTH_JWT_SECRET_ARN: authJwtSecret.secretArn,
        },
      },
    );

    addNestHttpRoutes(this, httpApi, {
      id: "AssistantChatStoreRoute",
      path: "/assistant-chat/store",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.OPTIONS,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "AssistantChatStoreIntegration",
        assistantChatStore,
      ),
    });
  }
}
