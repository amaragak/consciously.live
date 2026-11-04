/**
 * SES bounce / complaint / reject / delay events (via SNS). SES's account
 * suppression list already stops sends to hard bounces and complaints; this logs
 * each event so they show in CloudWatch (`/aws/lambda/…EmailEventsFunction…`).
 */
import type { SNSEvent } from "aws-lambda";

type SesEvent = {
  eventType?: string;
  mail?: { destination?: string[]; messageId?: string; commonHeaders?: { subject?: string } };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    complaintFeedbackType?: string;
    complainedRecipients?: { emailAddress?: string }[];
  };
  reject?: { reason?: string };
  deliveryDelay?: { delayType?: string };
};

export async function handler(event: SNSEvent): Promise<void> {
  for (const record of event.Records) {
    let msg: SesEvent;
    try {
      msg = JSON.parse(record.Sns.Message) as SesEvent;
    } catch {
      console.warn("ses event: unparseable", record.Sns.MessageId);
      continue;
    }
    const base = {
      type: msg.eventType,
      messageId: msg.mail?.messageId,
      subject: msg.mail?.commonHeaders?.subject,
    };
    if (msg.eventType === "Bounce") {
      const permanent = msg.bounce?.bounceType === "Permanent";
      const log = permanent ? console.error : console.warn;
      log("ses bounce", {
        ...base,
        bounceType: msg.bounce?.bounceType,
        bounceSubType: msg.bounce?.bounceSubType,
        recipients: msg.bounce?.bouncedRecipients?.map((r) => ({
          email: r.emailAddress,
          diagnostic: r.diagnosticCode,
        })),
        suppressed: permanent,
      });
    } else if (msg.eventType === "Complaint") {
      console.error("ses complaint", {
        ...base,
        feedbackType: msg.complaint?.complaintFeedbackType,
        recipients: msg.complaint?.complainedRecipients?.map((r) => r.emailAddress),
        suppressed: true,
      });
    } else {
      console.warn("ses event", {
        ...base,
        recipients: msg.mail?.destination,
        reject: msg.reject?.reason,
        delay: msg.deliveryDelay?.delayType,
      });
    }
  }
}
