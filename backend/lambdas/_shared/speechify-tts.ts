import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { getVoiceSpeaker } from "./voice-admin";

const secrets = new SecretsManagerClient({});
const SPEECHIFY_STREAM_URL = "https://api.speechify.ai/v1/audio/stream";

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

/** Drop pause markers — silence is our ffmpeg chunks, not Speechify `<break>`. */
function stripPauseMarkersForSpeechify(script: string): string {
  return script
    .replace(/\[\[PAUSE\s+[^\]]+\]\]/gi, " ")
    .replace(/\[(?:short pause|long pause|long-break|break)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Wrap spoken text + admin rate. Pause tags are stripped, not turned into SSML breaks. */
export function scriptToSpeechifySsml(
  script: string,
  opts?: { rate?: string },
): string {
  const body = escapeSsmlText(stripPauseMarkersForSpeechify(script));
  const rate = opts?.rate?.trim();
  const inner = rate
    ? `<prosody rate="${escapeSsmlText(rate)}">${body}</prosody>`
    : body;
  return `<speak>${inner}</speak>`;
}

/** Admin percent like -7 → SSML `rate="-7%"`. Unset means Speechify default (no wrap). */
export function speechifyRateToSsml(
  rate: number | null | undefined,
): string | undefined {
  if (rate == null || !Number.isFinite(rate)) return undefined;
  const n = Math.round(rate);
  return n > 0 ? `+${n}%` : `${n}%`;
}

export async function speechifyRateSsmlForVoice(
  voiceId: string | null | undefined,
): Promise<string | undefined> {
  const id = (voiceId || "").trim() || speechifyVoiceId();
  const speaker = await getVoiceSpeaker(id);
  return speechifyRateToSsml(speaker?.speechifyRate);
}

function isSpeechifyRateLimited(status: number, body: string): boolean {
  if (status === 429) return true;
  return /rate_limited|rate limit/i.test(body);
}

function speechifyRetryDelayMs(res: Response, attempt: number): number {
  const seconds = Number(res.headers.get("retry-after"));
  const headerMs =
    Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : NaN;
  const base = Number.isFinite(headerMs) ? headerMs : 400 + attempt * 250;
  return Math.min(3_000, Math.max(250, base)) + Math.floor(Math.random() * 150);
}

export async function speechifyTtsMp3(params: {
  apiKey: string;
  text: string;
  voiceId?: string;
  /** Fallback only when this voice has no admin rate stored. */
  rate?: string;
}): Promise<Buffer> {
  const voiceId = params.voiceId || speechifyVoiceId();
  const storedRate = await speechifyRateSsmlForVoice(voiceId);
  const rate = storedRate ?? params.rate?.trim();
  const ssml = scriptToSpeechifySsml(params.text, { rate });
  const body = JSON.stringify({
    input: ssml,
    voice_id: voiceId,
    model: speechifyTtsModel(),
    output_format: "mp3_24000_128",
    text_normalization: true,
  });
  const maxAttempts = 5;
  let lastErr = "Speechify TTS failed";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const upstream = await fetch(SPEECHIFY_STREAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body,
    });
    if (upstream.ok) {
      return Buffer.from(await upstream.arrayBuffer());
    }
    const err = await upstream.text();
    lastErr = `Speechify TTS failed: ${err.slice(0, 500)}`;
    const retryable =
      isSpeechifyRateLimited(upstream.status, err) ||
      [502, 503, 504].includes(upstream.status);
    if (!retryable || attempt >= maxAttempts) break;
    const backoffMs = speechifyRetryDelayMs(upstream, attempt);
    console.warn("Speechify transient failure, retrying", {
      attempt,
      status: upstream.status,
      backoffMs,
    });
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw new Error(lastErr);
}
