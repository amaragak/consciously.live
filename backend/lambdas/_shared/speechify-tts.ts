import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { recordSpeechifyTtsUsage } from "./ai-usage";
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

/**
 * After each sentence-ending `.` (period + space/end), insert a Speechify SSML break.
 * Runs on already-escaped text so break tags are not escaped.
 * Skips decimals like `3.14` (digit before the period).
 */
export function insertSpeechifyBreaksAfterPeriods(
  escapedText: string,
  breakMs: number,
): string {
  const ms = Math.round(breakMs);
  if (!Number.isFinite(ms) || ms <= 0) return escapedText;
  const tag = `<break time="${ms}ms"/>`;
  // Period not preceded by a digit, followed by whitespace or end of string.
  return escapedText.replace(/(?<!\d)\.(?=\s|$)/g, `.${tag}`);
}

/** Speechify `<speechify:style emotion="…">` values we send. */
export type SpeechifyEmotionTag = "warm" | "calm";

/** Speechify emotion for meditation renders (supported tag; not `neutral`). */
export const MEDITATION_SPEECHIFY_EMOTION: SpeechifyEmotionTag = "calm";

/**
 * Wrap spoken text + admin rate. Pause markers are stripped (ffmpeg silence).
 * Emotion uses `<speechify:style>` as the **outer** wrap around `<prosody>`
 * (Speechify: unrecognised emotions are ignored; meditation uses `calm`).
 * Optional `sentenceBreakMs`: after chunking, insert `<break time="Nms"/>` after
 * each `.` inside this chunk (meditation path uses 777).
 */
export function scriptToSpeechifySsml(
  script: string,
  opts?: {
    rate?: string;
    emotion?: SpeechifyEmotionTag | null;
    sentenceBreakMs?: number;
  },
): string {
  let inner = escapeSsmlText(stripPauseMarkersForSpeechify(script));
  if (
    typeof opts?.sentenceBreakMs === "number" &&
    Number.isFinite(opts.sentenceBreakMs) &&
    opts.sentenceBreakMs > 0
  ) {
    inner = insertSpeechifyBreaksAfterPeriods(inner, opts.sentenceBreakMs);
  }
  const rate = opts?.rate?.trim();
  if (rate) {
    inner = `<prosody rate="${escapeSsmlText(rate)}">${inner}</prosody>`;
  }
  const emotion = opts?.emotion?.trim().toLowerCase();
  if (emotion === "warm" || emotion === "calm") {
    inner = `<speechify:style emotion="${emotion}">${inner}</speechify:style>`;
  }
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

export type SpeechifyTtsParams = {
  apiKey: string;
  text: string;
  voiceId?: string;
  /**
   * SSML rate like `-7%`. When provided, overrides admin voice rate.
   * When omitted, uses the admin rate for this voice (Speechify default if unset).
   */
  rate?: string;
  /** When set, wraps `<prosody>` in `<speechify:style emotion="…">`. */
  emotion?: SpeechifyEmotionTag | null;
  /**
   * When false, disables Speechify’s ~−14 LUFS loudness_normalization
   * (dev A/B for raw volume). Default true.
   */
  loudnessNormalization?: boolean;
  /**
   * When set, after the spoken chunk is prepared, insert
   * `<break time="{n}ms"/>` after each sentence-ending `.`.
   */
  sentenceBreakMs?: number;
};

async function speechifyTtsStream(
  params: SpeechifyTtsParams,
  opts: {
    outputFormat: "aac_24000" | "pcm_24000";
    accept: "audio/aac" | "audio/pcm";
  },
): Promise<Buffer> {
  const voiceId = params.voiceId || speechifyVoiceId();
  const rate =
    typeof params.rate === "string"
      ? params.rate.trim() || undefined
      : await speechifyRateSsmlForVoice(voiceId);
  const ssml = scriptToSpeechifySsml(params.text, {
    rate,
    emotion: params.emotion,
    sentenceBreakMs: params.sentenceBreakMs,
  });
  const loudnessNormalization = params.loudnessNormalization !== false;
  const body = JSON.stringify({
    input: ssml,
    voice_id: voiceId,
    model: speechifyTtsModel(),
    output_format: opts.outputFormat,
    options: {
      loudness_normalization: loudnessNormalization,
      text_normalization: true,
    },
  });
  const maxAttempts = 5;
  let lastErr = "Speechify TTS failed";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const upstream = await fetch(SPEECHIFY_STREAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        Accept: opts.accept,
      },
      body,
    });
    if (upstream.ok) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      const chars = Buffer.byteLength(params.text ?? "", "utf8");
      void recordSpeechifyTtsUsage({
        chars,
        model: speechifyTtsModel(),
        feature: "speechify-tts",
      });
      return buf;
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
      outputFormat: opts.outputFormat,
      backoffMs,
    });
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw new Error(lastErr);
}

/**
 * Speechify stream → AAC-LC ADTS (`aac_24000`).
 * (Kept name `speechifyTtsMp3` for call-site compatibility.)
 */
export async function speechifyTtsMp3(
  params: SpeechifyTtsParams,
): Promise<Buffer> {
  return speechifyTtsStream(params, {
    outputFormat: "aac_24000",
    accept: "audio/aac",
  });
}

/**
 * Speechify stream → raw 16-bit LE mono PCM @ 24 kHz (`pcm_24000`).
 * Used for per-segment FX + overlap-add before AAC encode.
 */
export async function speechifyTtsPcm24k(
  params: SpeechifyTtsParams,
): Promise<Buffer> {
  return speechifyTtsStream(params, {
    outputFormat: "pcm_24000",
    accept: "audio/pcm",
  });
}
