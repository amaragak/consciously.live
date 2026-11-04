import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as ses from "aws-cdk-lib/aws-ses";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import { EMAIL_DOMAIN, SES_CONFIGURATION_SET_NAME } from "./api-http";

/**
 * Amazon SES for transactional email from hello@consciously.live.
 * DNS lives in Cloudflare (not in code): the DKIM, MAIL FROM and DMARC records
 * are printed as stack outputs and listed in frontend/webapp/NATIVE.md › Your steps.
 */
export class ConsciouslyEmailNestedStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    const configurationSet = new ses.ConfigurationSet(this, "ConfigurationSet", {
      configurationSetName: SES_CONFIGURATION_SET_NAME,
      // Never retry addresses that hard-bounced or complained.
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      reputationMetrics: true,
    });

    const mailFromDomain = `mail.${EMAIL_DOMAIN}`;
    const identity = new ses.EmailIdentity(this, "DomainIdentity", {
      identity: ses.Identity.domain(EMAIL_DOMAIN),
      mailFromDomain,
      configurationSet,
    });

    const events = new sns.Topic(this, "EmailEventsTopic", {
      displayName: "Consciously SES bounces and complaints",
    });
    configurationSet.addEventDestination("Sns", {
      destination: ses.EventDestination.snsTopic(events),
      events: [
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.REJECT,
        ses.EmailSendingEvent.DELIVERY_DELAY,
      ],
    });

    const logger = new lambda_nodejs.NodejsFunction(this, "EmailEventsFunction", {
      entry: path.join(__dirname, "../../lambdas/email-events.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });
    events.addSubscription(new subs.LambdaSubscription(logger));

    identity.dkimRecords.forEach((record, i) => {
      new cdk.CfnOutput(this, `DkimRecord${i + 1}`, {
        description: `CNAME for Cloudflare (DNS only, not proxied)`,
        value: `${record.name} CNAME ${record.value}`,
      });
    });
    new cdk.CfnOutput(this, "MailFromMx", {
      value: `${mailFromDomain} MX 10 feedback-smtp.${this.region}.amazonses.com`,
    });
    new cdk.CfnOutput(this, "MailFromSpf", {
      value: `${mailFromDomain} TXT "v=spf1 include:amazonses.com ~all"`,
    });
  }
}
