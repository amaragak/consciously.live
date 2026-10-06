import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  listPickerFishSpeakers,
  loadStyleVoicePrefs,
} from "./_shared/voice-admin";

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

  const [speakers, styleVoicePrefs] = await Promise.all([
    listPickerFishSpeakers(),
    loadStyleVoicePrefs(),
  ]);
  return json(200, { speakers, styleVoicePrefs });
}

