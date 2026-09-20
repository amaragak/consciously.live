import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const secrets = new SecretsManagerClient({});
const SPEECHIFY_STREAM_URL = "https://api.speechify.ai/v1/audio/stream";
/** Speechify stream input cap. Split on paragraph pauses only if over this. */
const SPEECHIFY_PACK_CHARS = 20_000;

export type BlogTtsProvider = "fish" | "speechify";

export function coerceBlogTtsProvider(raw: unknown): BlogTtsProvider {
  return raw === "fish" ? "fish" : "speechify";
}

export function speechifyVoiceId(): string {
  return (process.env.SPEECHIFY_VOICE_ID || "geffen_32").trim() || "geffen_32";
}

export function speechifyTtsModel(): string {
  return (process.env.SPEECHIFY_TTS_MODEL || "simba-3.2").trim() || "simba-3.2";
}

let cachedApiKey: string | undefined;

export async function getSpeechifyApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const arn = process.env.SPEECHIFY_SECRET_ARN?.trim();
  if (!arn) throw new Error("SPEECHIFY_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Speechify API key secret is empty");
  cachedApiKey = s;
  return cachedApiKey;
}

function escapeSsmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Turn Fish-style pause tags into Speechify SSML breaks. */
export function scriptToSpeechifySsml(script: string): string {
  const parts = script.split(/(\[(?:short|long) pause\])/i);
  const body = parts
    .map((part) => {
      if (/^\[short pause\]$/i.test(part)) return `<break time="700ms"/>`;
      if (/^\[long pause\]$/i.test(part)) return `<break time="1.2s"/>`;
      return escapeSsmlText(part);
    })
    .join("");
  return `<speak>${body}</speak>`;
}

function paragraphUnits(script: string): string[] {
  const tokens = script.split(/\s*(\[(?:short|long) pause\])\s*/i);
  const paragraphs: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = (tokens[i] ?? "").trim();
    if (!tok) continue;
    if (/^\[(?:short|long) pause\]$/i.test(tok)) {
      const next = (tokens[i + 1] ?? "").trim();
      paragraphs.push(next ? `${tok} ${next}` : tok);
      i += 1;
      continue;
    }
    paragraphs.push(tok);
  }
  return paragraphs;
}

export function chunkSpeechifyScript(script: string): string[] {
  const trimmed = script.trim();
  if (!trimmed) return [];
  if (trimmed.length <= SPEECHIFY_PACK_CHARS) return [trimmed];
  const paragraphs = paragraphUnits(trimmed);
  const chunks: string[] = [];
  let buf = "";
  for (const para of paragraphs) {
    const next = buf ? `${buf} ${para}` : para;
    if (buf && next.length > SPEECHIFY_PACK_CHARS) {
      chunks.push(buf.trim());
      buf = para;
      continue;
    }
    buf = next;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [trimmed];
}

export async function speechifyTtsMp3(params: {
  apiKey: string;
  text: string;
  voiceId?: string;
}): Promise<Buffer> {
  const ssml = scriptToSpeechifySsml(params.text);
  const upstream = await fetch(SPEECHIFY_STREAM_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      input: ssml,
      voice_id: params.voiceId || speechifyVoiceId(),
      model: speechifyTtsModel(),
      output_format: "mp3_24000_128",
      text_normalization: true,
    }),
  });
  if (!upstream.ok) {
    const err = await upstream.text();
    throw new Error(`Speechify TTS failed: ${err.slice(0, 500)}`);
  }
  return Buffer.from(await upstream.arrayBuffer());
}
