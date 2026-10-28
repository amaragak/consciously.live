import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { callAnthropicMessages } from "./_shared/anthropic-messages";
import { CLAUDE_HAIKU_55_MODEL_ID } from "./_shared/anthropic-pricing";
import { optionalUserJson } from "./_shared/consciously-auth-http";

const MAX_BYTES = 4_500_000;

type OcrWord = { text: string; confidence: number | null };

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(payload),
  };
}

function options(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    },
    body: "",
  };
}

function decodeImage(raw: string): { bytes: Buffer; mediaType: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(raw.trim());
  const mediaType = m?.[1] ?? "image/jpeg";
  const trimmed = raw.trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (!trimmed) return null;
  try {
    const bytes = Buffer.from(trimmed, "base64");
    return bytes.length ? { bytes, mediaType } : null;
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

async function runHaiku(
  bytes: Buffer,
  mediaType: string,
  userId: string | null,
): Promise<{ text: string; words: OcrWord[]; date: string | null }> {
  const imageB64 = bytes.toString("base64");
  const mime =
    mediaType === "image/png" ||
    mediaType === "image/gif" ||
    mediaType === "image/webp"
      ? mediaType
      : "image/jpeg";

  const result = await callAnthropicMessages({
    feature: "journal_import_ocr",
    model: CLAUDE_HAIKU_55_MODEL_ID,
    maxTokens: 4096,
    userId,
    system:
      "You transcribe handwritten and scanned journal pages for import. " +
      "Read the page carefully. Preserve line breaks where they matter for meaning. " +
      "Do not invent text that is not on the page. " +
      "If the page itself states a date (letterhead, diary line, etc.), return it as date " +
      "in YYYY-MM-DD; otherwise date is null. Prefer the written date over any guess. " +
      "Reply with JSON only: " +
      "{\"text\": \"full transcription\", \"date\": \"YYYY-MM-DD\"|null, \"uncertain\": [\"word\", ...]} " +
      "where uncertain lists words or short phrases you are unsure about (empty if confident).",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mime,
              data: imageB64,
            },
          },
          {
            type: "text",
            text: "Transcribe this journal page and extract any written date.",
          },
        ],
      },
    ],
    extra: {
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
    },
  });

  if (!result.ok) {
    let detail = result.rawText.slice(0, 800);
    try {
      const err = JSON.parse(result.rawText) as { error?: { message?: string } };
      if (err.error?.message) detail = err.error.message;
    } catch {
      /* keep slice */
    }
    throw new Error(detail || `Claude HTTP ${result.status}`);
  }

  const parsed = extractJsonObject(result.text || result.rawText);
  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  const dateRaw = typeof parsed.date === "string" ? parsed.date.trim() : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  const uncertainRaw = Array.isArray(parsed.uncertain) ? parsed.uncertain : [];
  const uncertain = new Set(
    uncertainRaw
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  const words: OcrWord[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const clean = token.replace(/^[^A-Za-z0-9'’]+|[^A-Za-z0-9'’]+$/g, "");
    const low =
      clean &&
      [...uncertain].some(
        (u) =>
          clean.toLowerCase() === u ||
          clean.toLowerCase().includes(u) ||
          u.includes(clean.toLowerCase()),
      );
    words.push({
      text: token,
      confidence: low ? 40 : 95,
    });
  }

  return { text, words, date };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method.toUpperCase();
  if (method === "OPTIONS") return options();
  if (method !== "POST") return json(405, { error: "Method not allowed" });

  let body: {
    imageBase64?: unknown;
    sessionToken?: string;
  };
  try {
    body = JSON.parse(event.body || "{}") as {
      imageBase64?: unknown;
      sessionToken?: string;
    };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const user = await optionalUserJson(
    event,
    typeof body.sessionToken === "string" ? body.sessionToken : null,
  );
  const userId = user?.sub ?? null;

  if (typeof body.imageBase64 !== "string") {
    return json(400, { error: "Field `imageBase64` is required" });
  }
  const decoded = decodeImage(body.imageBase64);
  if (!decoded) return json(400, { error: "Could not read that image." });
  if (decoded.bytes.length > MAX_BYTES) {
    return json(413, {
      error: "That photo is too large to read in one go. Try a closer crop.",
    });
  }

  try {
    const { text, words, date } = await runHaiku(
      decoded.bytes,
      decoded.mediaType,
      userId,
    );
    return json(200, { engine: "haiku", text, words, date });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OCR failed";
    return json(502, {
      error: "Could not read that photo.",
      detail: msg.slice(0, 800),
    });
  }
}
