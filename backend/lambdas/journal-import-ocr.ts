import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { callAnthropicMessages } from "./_shared/anthropic-messages";
import { CLAUDE_HAIKU_55_MODEL_ID } from "./_shared/anthropic-pricing";
import { optionalUserJson } from "./_shared/consciously-auth-http";

const MAX_BYTES = 4_500_000;
const MAX_TEXT_CHARS = 24_000;

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

function ymdOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function titleOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ").slice(0, 80);
  return t || null;
}

async function runHaikuVision(
  bytes: Buffer,
  mediaType: string,
  userId: string | null,
): Promise<{ text: string; words: OcrWord[]; date: string | null; title: string | null }> {
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
      "If the page itself states a calendar date (letterhead, diary line, etc.), return it as date " +
      "in YYYY-MM-DD; otherwise date is null. Prefer the written date over any guess. " +
      "Also suggest a short title (a few words) capturing what the page is about — not the date alone. " +
      "Reply with JSON only: " +
      "{\"text\": \"full transcription\", \"date\": \"YYYY-MM-DD\"|null, \"title\": \"short title\"|null, \"uncertain\": [\"word\", ...]} " +
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
            text: "Transcribe this journal page, extract any written date, and suggest a short title.",
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
  const date = ymdOrNull(parsed.date);
  const title = titleOrNull(parsed.title);
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

  return { text, words, date, title };
}

/** Date + title from already-extracted journal text (typed PDF, markdown, txt). */
async function runHaikuTextEnrich(
  text: string,
  userId: string | null,
): Promise<{ date: string | null; title: string | null }> {
  const sample = text.trim().slice(0, MAX_TEXT_CHARS);
  if (!sample) return { date: null, title: null };

  const result = await callAnthropicMessages({
    feature: "journal_import_enrich",
    model: CLAUDE_HAIKU_55_MODEL_ID,
    maxTokens: 400,
    userId,
    system:
      "You help import personal journal entries. From the entry text only: " +
      "(1) If the entry itself states or clearly implies a calendar date for when it was written " +
      "(letterhead, diary header, “today is…”, dated salutation), return date as YYYY-MM-DD. " +
      "Do not invent a date from file metadata or vague relative phrases alone. " +
      "If unsure, date is null. " +
      "(2) Suggest a short title (a few words) for the entry — not just the date. " +
      "Reply with JSON only: {\"date\": \"YYYY-MM-DD\"|null, \"title\": \"short title\"|null}",
    messages: [
      {
        role: "user",
        content: `Journal entry text:\n\n${sample}`,
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
      /* keep */
    }
    throw new Error(detail || `Claude HTTP ${result.status}`);
  }

  const parsed = extractJsonObject(result.text || result.rawText);
  return {
    date: ymdOrNull(parsed.date),
    title: titleOrNull(parsed.title),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method.toUpperCase();
  if (method === "OPTIONS") return options();
  if (method !== "POST") return json(405, { error: "Method not allowed" });

  let body: {
    imageBase64?: unknown;
    text?: unknown;
    sessionToken?: string;
  };
  try {
    body = JSON.parse(event.body || "{}") as {
      imageBase64?: unknown;
      text?: unknown;
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

  const textIn =
    typeof body.text === "string" && body.text.trim() ? body.text.trim() : null;
  const hasImage = typeof body.imageBase64 === "string";

  if (textIn && !hasImage) {
    try {
      const { date, title } = await runHaikuTextEnrich(textIn, userId);
      return json(200, { engine: "haiku", date, title });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Enrich failed";
      return json(502, {
        error: "Could not date that entry.",
        detail: msg.slice(0, 800),
      });
    }
  }

  if (!hasImage) {
    return json(400, { error: "Field `imageBase64` or `text` is required" });
  }
  const decoded = decodeImage(body.imageBase64 as string);
  if (!decoded) return json(400, { error: "Could not read that image." });
  if (decoded.bytes.length > MAX_BYTES) {
    return json(413, {
      error: "That photo is too large to read in one go. Try a closer crop.",
    });
  }

  try {
    const { text, words, date, title } = await runHaikuVision(
      decoded.bytes,
      decoded.mediaType,
      userId,
    );
    return json(200, { engine: "haiku", text, words, date, title });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OCR failed";
    return json(502, {
      error: "Could not read that photo.",
      detail: msg.slice(0, 800),
    });
  }
}
