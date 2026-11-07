/**
 * Client-side meditation credit estimate (mirrors server defaults).
 * Server remains source of truth at create time; this drives the Sound step pill.
 */

import type { MeditationDelivery } from "@/lib/meditation-delivery";

/** Spoken share of total length by delivery (defaults until measured). */
export const DEFAULT_SPOKEN_SHARE: Record<MeditationDelivery, number> = {
  casual: 0.92,
  guided: 0.55,
  open_sits: 0.22,
};

/** Default WPM until a voice is measured. */
export const DEFAULT_VOICE_WPM = 140;

/** Average characters per spoken word (estimate). */
export const AVG_CHARS_PER_WORD = 5.2;

/** Base script-generation cost in credits. */
export const DEFAULT_SCRIPT_BASE_CREDITS = 1;

/** Characters per credit for Standard (Speechify) voices. */
export const DEFAULT_CHARS_PER_CREDIT_STANDARD = 1800;

/** Pro (Fish) multiplier — server-configurable; default 2×. */
export const DEFAULT_PRO_VOICE_MULTIPLIER = 2;

export type MeditationCreditEstimateInput = {
  lengthMinutes: number;
  delivery: MeditationDelivery;
  isProVoice: boolean;
  /** Measured WPM for this voice × delivery; falls back to default. */
  voiceWpm?: number | null;
  /** Measured spoken share for this delivery; falls back to default. */
  spokenShare?: number | null;
  proMultiplier?: number;
  scriptBaseCredits?: number;
  charsPerCreditStandard?: number;
};

export type MeditationCreditEstimate = {
  credits: number;
  spokenMinutes: number;
  estimatedCharacters: number;
  scriptCredits: number;
  voiceCredits: number;
  proMultiplier: number;
  isProVoice: boolean;
  delivery: MeditationDelivery;
  lengthMinutes: number;
};

export function estimateMeditationCredits(
  input: MeditationCreditEstimateInput,
): MeditationCreditEstimate {
  const lengthMinutes = Math.max(1, Math.min(120, input.lengthMinutes || 10));
  const delivery = input.delivery;
  const spokenShare =
    typeof input.spokenShare === "number" && Number.isFinite(input.spokenShare)
      ? Math.min(1, Math.max(0.05, input.spokenShare))
      : DEFAULT_SPOKEN_SHARE[delivery];
  const wpm =
    typeof input.voiceWpm === "number" && input.voiceWpm > 0
      ? input.voiceWpm
      : DEFAULT_VOICE_WPM;
  const proMultiplier = Math.max(
    1,
    input.proMultiplier ?? DEFAULT_PRO_VOICE_MULTIPLIER,
  );
  const scriptBase = Math.max(
    0,
    input.scriptBaseCredits ?? DEFAULT_SCRIPT_BASE_CREDITS,
  );
  const charsPerCredit = Math.max(
    200,
    input.charsPerCreditStandard ?? DEFAULT_CHARS_PER_CREDIT_STANDARD,
  );

  const spokenMinutes = lengthMinutes * spokenShare;
  const estimatedCharacters = Math.round(
    spokenMinutes * wpm * AVG_CHARS_PER_WORD,
  );
  const tierRate = input.isProVoice ? proMultiplier : 1;
  const voiceCreditsRaw = (estimatedCharacters / charsPerCredit) * tierRate;
  const voiceCredits = Math.max(0, voiceCreditsRaw);
  const total = Math.max(1, Math.ceil(scriptBase + voiceCredits));

  return {
    credits: total,
    spokenMinutes: Math.round(spokenMinutes * 10) / 10,
    estimatedCharacters,
    scriptCredits: scriptBase,
    voiceCredits: Math.round(voiceCredits * 10) / 10,
    proMultiplier: tierRate,
    isProVoice: input.isProVoice,
    delivery,
    lengthMinutes,
  };
}
