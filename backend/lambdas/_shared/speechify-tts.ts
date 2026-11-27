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
  return (process.env.SPEECHIFY_TTS_MODEL || "simba-3.5").trim() || "simba-3.5";
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
 * Meditation Speechify punctuation breaks (built-in `<break>` tags).
 * Custom `[[PAUSE …]]` markers are stripped here and rendered as ffmpeg
 * silence on the segmented path — unchanged.
 */
/** Target band ~400–700ms after commas. */
export const SPEECHIFY_COMMA_BREAK_MS = 550;
/** Fallback sentence break (1s). */
export const SPEECHIFY_PERIOD_BREAK_MS = 1000;
/** Provider max for a single Speechify SSML break (not an admin setting). */
export const SPEECHIFY_MAX_BREAK_SECONDS = 10;

/**
 * After each comma + following space, insert a Speechify SSML break.
 * Runs on already-escaped text so break tags are not escaped.
 */
export function insertSpeechifyBreaksAfterCommas(
  escapedText: string,
  breakMs: number,
): string {
  const ms = Math.round(breakMs);
  if (!Number.isFinite(ms) || ms <= 0) return escapedText;
  const tag = `<break time="${ms}ms"/>`;
  // Comma followed by whitespace (list / clause), not thousands separators.
  return escapedText.replace(/,(?=\s)/g, `,${tag}`);
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

/** After `.`, `?`, or `!`, insert a Speechify SSML break. Skips decimals like `3.14`. */
export function insertSpeechifyBreaksAfterSentenceEnds(
  escapedText: string,
  breakMs: number,
): string {
  const ms = Math.round(breakMs);
  if (!Number.isFinite(ms) || ms <= 0) return escapedText;
  const tag = `<break time="${ms}ms"/>`;
  return escapedText.replace(/(?<!\d)[.!?](?=\s|$)/g, (mark) => `${mark}${tag}`);
}
export type SpeechifyEmotionTag = "warm" | "calm";

/** Speechify emotion for meditation renders (supported tag; not `neutral`). */
export const MEDITATION_SPEECHIFY_EMOTION: SpeechifyEmotionTag = "calm";

/**
 * Wrap spoken text + admin rate. Pause markers are stripped (ffmpeg silence).
 * Emotion uses `<speechify:style>` as the **outer** wrap around `<prosody>`
 * (Speechify: unrecognised emotions are ignored; meditation uses `calm`).
 * Optional `sentenceBreakMs` / `commaBreakMs`: Speechify `<break>` after `.` / `,`
 * inside this chunk (meditation uses ~1.5s / ~550ms).
 */
export function scriptToSpeechifySsml(
  script: string,
  opts?: {
    rate?: string;
    emotion?: SpeechifyEmotionTag | null;
    sentenceBreakMs?: number;
    /** When set with sentenceBreakMs, the break follows `.`, `?`, and `!`. */
    breakAllSentenceEnds?: boolean;
    commaBreakMs?: number;
  },
): string {
  let inner = escapeSsmlText(stripPauseMarkersForSpeechify(script));
  if (
    typeof opts?.commaBreakMs === "number" &&
    Number.isFinite(opts.commaBreakMs) &&
    opts.commaBreakMs > 0
  ) {
    inner = insertSpeechifyBreaksAfterCommas(inner, opts.commaBreakMs);
  }
  if (
    typeof opts?.sentenceBreakMs === "number" &&
    Number.isFinite(opts.sentenceBreakMs) &&
    opts.sentenceBreakMs > 0
  ) {
    inner = opts.breakAllSentenceEnds
      ? insertSpeechifyBreaksAfterSentenceEnds(inner, opts.sentenceBreakMs)
      : insertSpeechifyBreaksAfterPeriods(inner, opts.sentenceBreakMs);
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

/** Admin percent like -7 → SSML `rate="-7%"`. 0 / unset = Speechify default (no wrap). */
export function speechifyRateToSsml(
  rate: number | null | undefined,
): string | undefined {
  if (rate == null || !Number.isFinite(rate)) return undefined;
  const n = Math.round(rate);
  if (n === 0) return undefined;
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

/**
 * Speechify 429 Retry-After (seconds). Free = 1 rps / 3 concurrent;
 * Starter+ is much higher — always prefer the header over guessing.
 * https://docs.speechify.ai/build/api-reference/get-started/api-limits
 */
function speechifyRetryDelayMs(res: Response, attempt: number): number {
  const seconds = Number(res.headers.get("retry-after"));
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(5_000, Math.max(200, seconds * 1000)) +
      Math.floor(Math.random() * 100);
  }
  // No header: short backoff so parallel siblings can land without a long stall.
  return Math.min(2_000, 250 * attempt) + Math.floor(Math.random() * 100);
}

/**
 * Free plan = 3 concurrent / 1 rps (burst 10). Starter = 15 / 20.
 * Override via SPEECHIFY_TTS_CONCURRENCY / SPEECHIFY_TTS_RPS on paid plans.
 * https://docs.speechify.ai/build/api-reference/get-started/api-limits
 */
export function speechifyTtsConcurrency(): number {
  const raw = Number(process.env.SPEECHIFY_TTS_CONCURRENCY);
  if (Number.isFinite(raw) && raw >= 1) return Math.min(30, Math.floor(raw));
  return 3;
}

/** Sustained request starts per second (Free = 1). Burst is server-side. */
export function speechifyTtsRps(): number {
  const raw = Number(process.env.SPEECHIFY_TTS_RPS);
  if (Number.isFinite(raw) && raw > 0) return Math.min(150, raw);
  return 1;
}

/** Process-wide in-flight + start-rate so parallel chunks stay under Free limits. */
let speechifyInFlight = 0;
const speechifyWaiters: Array<() => void> = [];
let speechifyLastStartMs = 0;
let speechifyClaimChain: Promise<void> = Promise.resolve();

async function acquireSpeechifySlot(): Promise<void> {
  const max = speechifyTtsConcurrency();
  const gapMs = Math.max(50, Math.round(1000 / speechifyTtsRps()));
  for (;;) {
    while (speechifyInFlight >= max) {
      await new Promise<void>((r) => speechifyWaiters.push(r));
    }
    let acquired = false;
    await new Promise<void>((resolve, reject) => {
      speechifyClaimChain = speechifyClaimChain
        .then(async () => {
          if (speechifyInFlight >= max) {
            resolve();
            return;
          }
          const wait = Math.max(0, speechifyLastStartMs + gapMs - Date.now());
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          if (speechifyInFlight >= max) {
            resolve();
            return;
          }
          speechifyLastStartMs = Date.now();
          speechifyInFlight += 1;
          acquired = true;
          resolve();
        })
        .catch(reject);
    });
    if (acquired) return;
  }
}

function releaseSpeechifySlot(): void {
  speechifyInFlight = Math.max(0, speechifyInFlight - 1);
  const next = speechifyWaiters.shift();
  if (next) next();
}

async function withSpeechifyConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSpeechifySlot();
  try {
    return await fn();
  } finally {
    releaseSpeechifySlot();
  }
}

export function isSpeechifyRetryablePairError(
  error: string | null | undefined,
): boolean {
  if (!error) return false;
  return /rate_limited|rate limit|concurrency_limit/i.test(error);
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
  /** When set, insert `<break time="{n}ms"/>` after each sentence-ending `.`. */
  sentenceBreakMs?: number;
  /** With sentenceBreakMs, also break after `?` and `!`. Measurement uses this. */
  breakAllSentenceEnds?: boolean;
  /** When set, insert `<break time="{n}ms"/>` after each comma. */
  commaBreakMs?: number;
};

async function speechifyTtsStream(
  params: SpeechifyTtsParams,
  opts: {
    outputFormat: "aac_24000" | "pcm_24000" | "pcm_44100";
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
    breakAllSentenceEnds: params.breakAllSentenceEnds,
    commaBreakMs: params.commaBreakMs,
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
  // Free sustained 1 rps — paced starts + generous 429 retries on that request.
  const maxAttempts = 12;
  let lastErr = "Speechify TTS failed";
  return withSpeechifyConcurrency(async () => {
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
      const rateLimited = isSpeechifyRateLimited(upstream.status, err);
      const retryable =
        rateLimited || [502, 503, 504].includes(upstream.status);
      if (!retryable || attempt >= maxAttempts) break;
      const backoffMs = speechifyRetryDelayMs(upstream, attempt);
      console.warn("Speechify transient failure, retrying", {
        attempt,
        status: upstream.status,
        rateLimited,
        outputFormat: opts.outputFormat,
        backoffMs,
        retryAfter: upstream.headers.get("retry-after"),
      });
      // Free the slot while waiting so sibling chunks keep synthesizing.
      releaseSpeechifySlot();
      try {
        await new Promise((r) => setTimeout(r, backoffMs));
      } finally {
        await acquireSpeechifySlot();
      }
    }
    throw new Error(lastErr);
  });
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
 * Speechify stream → raw 16-bit LE mono PCM @ 44.1 kHz (`pcm_44100`).
 * Used for per-segment FX + overlap-add before AAC encode.
 * (Name keeps `24k` for call-site stability; rate is VOICE_FX_PCM_SR.)
 */
export async function speechifyTtsPcm24k(
  params: SpeechifyTtsParams,
): Promise<Buffer> {
  return speechifyTtsStream(params, {
    outputFormat: "pcm_44100",
    accept: "audio/pcm",
  });
}
