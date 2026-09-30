/**
 * List prices for AI providers we call from Consciously.
 * Verify periodically against vendor docs — rates drift.
 */

import {
  CLAUDE_HAIKU_45_MODEL_ID,
  CLAUDE_HAIKU_45_DATED_MODEL_ID,
  CLAUDE_SONNET_45_MODEL_ID,
  CLAUDE_SONNET_46_MODEL_ID,
  CLAUDE_MODEL_RATES,
  claudeUsdFromTokens,
} from "./anthropic-pricing";

export {
  CLAUDE_HAIKU_45_MODEL_ID,
  CLAUDE_SONNET_45_MODEL_ID,
  CLAUDE_SONNET_46_MODEL_ID,
  claudeUsdFromTokens,
};

/** Fish Audio TTS — USD per 1M UTF-8 bytes of script. */
export const FISH_S21_USD_PER_MILLION = 15;
export const FISH_S1_USD_PER_MILLION = 10;

export function fishUsdFromBillableBytes(
  bytes: number,
  model?: string | null,
): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  const m = (model ?? "").trim().toLowerCase();
  const perM = m === "s1" ? FISH_S1_USD_PER_MILLION : FISH_S21_USD_PER_MILLION;
  return (bytes / 1_000_000) * perM;
}

/** gpt-image-1-mini — 1024² low quality (our meditation/admin cover default). */
export const GPT_IMAGE_1_MINI_LOW_1024_USD = 0.005;

/** Gemini 3 Pro Image (Nano Banana Pro) — 1K square (~1120 image output tokens). */
export const NANO_BANANA_PRO_1K_USD = 0.134;

/**
 * Speechify TTS overage-ish rate we use for estimates (Starter tier list).
 * Included plan allowance is not modeled — treat as ~$10 / 1M characters.
 */
export const SPEECHIFY_USD_PER_MILLION_CHARS = 10;

export type AiProviderId =
  | "anthropic"
  | "fish"
  | "openai"
  | "google"
  | "speechify";

export type AiProviderCatalogEntry = {
  id: AiProviderId;
  label: string;
  /** Short description of what we use it for. */
  uses: string;
  /** Human-readable rate lines for the admin UI. */
  rateLines: string[];
  /** How remaining credit is obtained. */
  creditSource: "live" | "manual" | "none";
  creditNote: string;
};

export const AI_PROVIDER_CATALOG: AiProviderCatalogEntry[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    uses: "Create scripts, chat coach, journal insights, Script Lab, metadata",
    rateLines: [
      CLAUDE_HAIKU_45_MODEL_ID,
      CLAUDE_SONNET_45_MODEL_ID,
      CLAUDE_SONNET_46_MODEL_ID,
    ].map((id) => {
      const r = CLAUDE_MODEL_RATES[id]!;
      return `${r.label}: $${(r.usdPerInputToken * 1_000_000).toFixed(2)} / $${(r.usdPerOutputToken * 1_000_000).toFixed(2)} per 1M in/out tokens`;
    }),
    creditSource: "manual",
    creditNote:
      "Pay-as-you-go. Remaining balance needs an Anthropic Admin API key (sk-ant-admin…) or a manual snapshot.",
  },
  {
    id: "fish",
    label: "Fish Audio",
    uses: "Meditation TTS, voice previews, Script Lab custom lines",
    rateLines: [
      `S2.1 / S2 Pro: $${FISH_S21_USD_PER_MILLION} / 1M UTF-8 bytes`,
      `S1: $${FISH_S1_USD_PER_MILLION} / 1M UTF-8 bytes`,
    ],
    creditSource: "live",
    creditNote: "Live wallet balance from Fish API.",
  },
  {
    id: "openai",
    label: "OpenAI",
    uses: "gpt-image-1-mini covers, Whisper transcription",
    rateLines: [
      `gpt-image-1-mini 1024² low: ~$${GPT_IMAGE_1_MINI_LOW_1024_USD.toFixed(3)} / image`,
      "Whisper: see OpenAI audio pricing (usage not aggregated here yet)",
    ],
    creditSource: "manual",
    creditNote:
      "No remaining-credit API on standard keys. Set a manual balance or use an OpenAI Admin key later.",
  },
  {
    id: "google",
    label: "Google AI (Gemini)",
    uses: "Nano Banana Pro composition / category / program covers",
    rateLines: [
      `gemini-3-pro-image 1K: ~$${NANO_BANANA_PRO_1K_USD.toFixed(3)} / image`,
    ],
    creditSource: "manual",
    creditNote: "AI Studio prepaid has no public balance API — enter a manual snapshot.",
  },
  {
    id: "speechify",
    label: "Speechify",
    uses: "Default meditation TTS, blog narration",
    rateLines: [
      `Estimate ~$${SPEECHIFY_USD_PER_MILLION_CHARS} / 1M characters (Starter overage)`,
    ],
    creditSource: "manual",
    creditNote: "No balance endpoint wired — enter remaining prepaid / plan credits manually.",
  },
];

export function claudeUsdFromStoredLibraryTokens(row: {
  claudeHaiku45WorkerInputTokens?: number | null;
  claudeHaiku45WorkerOutputTokens?: number | null;
  claudeHaiku45ChatEstInputTokens?: number | null;
  claudeHaiku45ChatEstOutputTokens?: number | null;
  claudeModel?: string | null;
}): number {
  const model =
    typeof row.claudeModel === "string" && row.claudeModel.trim()
      ? row.claudeModel.trim()
      : CLAUDE_HAIKU_45_MODEL_ID;
  // Dated haiku id prices the same.
  const priced =
    model === CLAUDE_HAIKU_45_DATED_MODEL_ID ? CLAUDE_HAIKU_45_MODEL_ID : model;
  const wi = Number(row.claudeHaiku45WorkerInputTokens) || 0;
  const wo = Number(row.claudeHaiku45WorkerOutputTokens) || 0;
  const ci = Number(row.claudeHaiku45ChatEstInputTokens) || 0;
  const co = Number(row.claudeHaiku45ChatEstOutputTokens) || 0;
  return (
    claudeUsdFromTokens(priced, wi, wo) + claudeUsdFromTokens(priced, ci, co)
  );
}
