/**
 * Fish Audio TTS helpers.
 * Meditation FX path uses pcm @ 24 kHz (same as Speechify pcm_24000).
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { recordFishTtsUsage } from "./ai-usage";
import { VOICE_FX_PCM_SR } from "./voice-fx-ffmpeg-chain";

const secrets = new SecretsManagerClient({});
export const FISH_TTS_URL = "https://api.fish.audio/v1/tts";

export function fishTtsModel(): string {
  return (process.env.FISH_TTS_MODEL || "s2.1-pro-free").trim() || "s2.1-pro-free";
}

let cachedApiKey: string | undefined;

export async function getFishApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const arn = process.env.FISH_AUDIO_SECRET_ARN?.trim();
  if (!arn) throw new Error("FISH_AUDIO_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Fish Audio API key secret is empty");
  cachedApiKey = s;
  return cachedApiKey;
}

export type FishTtsParams = {
  apiKey: string;
  text: string;
  referenceId: string;
  /** Prosody speed (1 = default). */
  speed?: number;
  model?: string;
  feature?: string;
};

async function fishTtsRequest(
  params: FishTtsParams,
  opts: {
    format: "mp3" | "pcm";
    sampleRate?: number;
  },
): Promise<Buffer> {
  const model =
    typeof params.model === "string" && params.model.trim()
      ? params.model.trim()
      : fishTtsModel();
  const speed =
    typeof params.speed === "number" && Number.isFinite(params.speed)
      ? params.speed
      : 1;
  const maxAttempts = 5;
  let lastErr = "Fish TTS failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body: Record<string, unknown> = {
        text: params.text,
        reference_id: params.referenceId,
        format: opts.format,
        latency: "normal",
        normalize: true,
        prosody: { speed, normalize_loudness: true },
      };
      if (opts.sampleRate != null) {
        body.sample_rate = opts.sampleRate;
      }
      const upstream = await fetch(FISH_TTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
          model,
        },
        body: JSON.stringify(body),
      });
      if (!upstream.ok) {
        const detail = await upstream.text();
        lastErr = `Fish TTS failed (${upstream.status}): ${detail.slice(0, 500)}`;
        if (
          [429, 502, 503, 504].includes(upstream.status) &&
          attempt < maxAttempts
        ) {
          const retryAfter = upstream.headers.get("retry-after");
          const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
          const backoffMsBase = Number.isFinite(retryAfterMs)
            ? retryAfterMs
            : 750 * attempt * attempt;
          const backoffMs =
            Math.min(15_000, Math.max(250, backoffMsBase)) +
            Math.floor(Math.random() * 250);
          console.warn("Fish transient failure, retrying", {
            attempt,
            status: upstream.status,
            format: opts.format,
            backoffMs,
          });
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw new Error(lastErr);
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      void recordFishTtsUsage({
        utf8Bytes: Buffer.byteLength(params.text, "utf8"),
        model,
        feature: params.feature ?? "fish-tts",
      });
      return buf;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) {
        const backoffMs =
          Math.min(15_000, 750 * attempt * attempt) +
          Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
    }
  }
  throw new Error(lastErr);
}

/** Fish stream → raw 16-bit LE mono PCM @ 24 kHz (matches Speechify pcm_24000). */
export async function fishTtsPcm24k(params: FishTtsParams): Promise<Buffer> {
  const buf = await fishTtsRequest(params, {
    format: "pcm",
    sampleRate: VOICE_FX_PCM_SR,
  });
  if (buf.byteLength % 2 !== 0) {
    throw new Error("Fish PCM length is not s16le-aligned");
  }
  return buf;
}

/** Fish stream → MP3 (legacy paths: letter/blog/proxy). */
export async function fishTtsMp3(params: FishTtsParams): Promise<Buffer> {
  return fishTtsRequest(params, { format: "mp3" });
}
