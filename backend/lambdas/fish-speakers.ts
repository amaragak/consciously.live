import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  listPickerFishSpeakers,
  loadStyleVoicePrefs,
} from "./_shared/voice-admin";
import {
  defaultWpmFor,
  speechShareFromPauseRules as creditSpeechShare,
} from "./_shared/delivery-profiles";
import { loadDeliveryProfileRecord } from "./_shared/voice-calibration-store";
import { loadDevUiSettings } from "./_shared/dev-ui-settings";

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const [allSpeakers, styleVoicePrefs, profileRecord, appSettings] =
    await Promise.all([
      listPickerFishSpeakers(),
      loadStyleVoicePrefs(),
      loadDeliveryProfileRecord(),
      loadDevUiSettings(),
    ]);
  const includeAll = event.queryStringParameters?.all === "1";
  const speakers =
    appSettings.hideFishVoices && !includeAll
      ? allSpeakers.filter((s) => (s.brand ?? "fish") !== "fish")
      : allSpeakers;
  const profiles = profileRecord.profiles;
  return json(200, {
    speakers,
    hideFishVoices: appSettings.hideFishVoices,
    styleVoicePrefs,
    deliveryShares: {
      // Credit estimate only. Script length uses the per-delivery silence share.
      casual: creditSpeechShare(profiles, "casual"),
      guided: creditSpeechShare(profiles, "guided"),
      open_sits: creditSpeechShare(profiles, "open_sits"),
    },
    defaultWpm: {
      casual: defaultWpmFor(profiles, "casual"),
      guided: defaultWpmFor(profiles, "guided"),
      open_sits: defaultWpmFor(profiles, "open_sits"),
    },
    charsPerWord: profiles.shared.charsPerWord,
  });
}

