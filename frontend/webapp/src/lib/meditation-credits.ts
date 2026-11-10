/**
 * Client-side meditation credit estimate (mirrors server defaults).
 * Server remains source of truth at create time; this drives the Sound step pill.
 */

import type { MeditationDelivery } from "@/lib/meditation-delivery";
import {
  defaultDeliveryProfiles,
  defaultWpmFor,
  speechShareFromPauseRules as creditSpeechShare,
} from "@/lib/delivery-profiles";

const SEEDED = defaultDeliveryProfiles();

/** Spoken share of total length by delivery (defaults until measured). */
export const DEFAULT_SPOKEN_SHARE: Record<MeditationDelivery, number> = {
  casual: creditSpeechShare(SEEDED, "casual"),
  guided: creditSpeechShare(SEEDED, "guided"),
  open_sits: creditSpeechShare(SEEDED, "open_sits"),
};

/** Fallback WPM by delivery when a voice has no Live measurement. */
export const DEFAULT_WPM_BY_DELIVERY: Record<MeditationDelivery, number> = {
  casual: defaultWpmFor(SEEDED, "casual"),
  guided: defaultWpmFor(SEEDED, "guided"),
  open_sits: defaultWpmFor(SEEDED, "open_sits"),
};

/** Default WPM until a voice is measured. Casual rate, used when delivery is unknown. */
export const DEFAULT_VOICE_WPM = DEFAULT_WPM_BY_DELIVERY.casual;

/** Average characters per spoken word (estimate). */
export const AVG_CHARS_PER_WORD = SEEDED.shared.charsPerWord;

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
  /** Characters per spoken word. Falls back to the shared profile default. */
  charsPerWord?: number | null;
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
      : DEFAULT_WPM_BY_DELIVERY[delivery];
  const charsPerWord =
    typeof input.charsPerWord === "number" && input.charsPerWord > 0
      ? input.charsPerWord
      : AVG_CHARS_PER_WORD;
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
    spokenMinutes * wpm * charsPerWord,
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
