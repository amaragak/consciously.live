/**
 * Client-side meditation credit estimate for Create › Sound.
 * Single source for the cost number and the breakdown popover.
 *
 * Credits = length [× Pro voice]. Create is open sits only (×1 delivery), so
 * the Delivery row is omitted. Pro (Fish) still multiplies by
 * {@link DEFAULT_PRO_VOICE_MULTIPLIER} (default 2×).
 * Server remains source of truth at charge time; this drives the UI.
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

/** Average characters per spoken word (estimate). Fixed — not an admin setting. */
export const AVG_CHARS_PER_WORD = 5.7;

/** Base script-generation cost in credits. */
export const DEFAULT_SCRIPT_BASE_CREDITS = 1;

/** Characters per credit for Standard (Speechify) voices. */
export const DEFAULT_CHARS_PER_CREDIT_STANDARD = 1800;

/** Pro (Fish) multiplier — server-configurable; default 2×. */
export const DEFAULT_PRO_VOICE_MULTIPLIER = 2;

/** Length factor: 5→×1, 10→×2, 15→×3, 20→×4 (and proportional for other lengths). */
export function lengthCreditMultiplier(lengthMinutes: number): number {
  const m = Math.max(1, Math.round(lengthMinutes || 10));
  return Math.max(1, Math.round(m / 5));
}

/** Delivery factor: Casual ×3, Guided ×2, Open sits ×1. Kept for non-Create callers. */
export function deliveryCreditMultiplier(delivery: MeditationDelivery): number {
  if (delivery === "casual") return 3;
  if (delivery === "open_sits") return 1;
  return 2;
}

export type MeditationCreditFactor = {
  key: string;
  label: string;
  detail: string;
  multiplier: number;
};

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
  /** Ordered factors that multiply to `credits` (before ceil/min-1). */
  factors: MeditationCreditFactor[];
  spokenMinutes: number;
  estimatedCharacters: number;
  scriptCredits: number;
  voiceCredits: number;
  proMultiplier: number;
  isProVoice: boolean;
  delivery: MeditationDelivery;
  lengthMinutes: number;
};

/**
 * Build the factor list for the current choices. Add future factors (e.g. pro
 * voice) here so the popover grows a row without a redesign.
 */
export function meditationCreditFactors(
  input: Pick<
    MeditationCreditEstimateInput,
    "lengthMinutes" | "delivery" | "isProVoice" | "proMultiplier"
  >,
): MeditationCreditFactor[] {
  const lengthMinutes = Math.max(1, Math.min(120, input.lengthMinutes || 10));
  const delivery = input.delivery;
  const factors: MeditationCreditFactor[] = [
    {
      key: "length",
      label: "Length",
      detail: `${lengthMinutes} min`,
      multiplier: lengthCreditMultiplier(lengthMinutes),
    },
  ];
  // Was: Delivery row (Casual ×3 / Guided ×2 / Open sits ×1). Create is open
  // sits only — delivery multiplier is always ×1, so the row was removed.
  void delivery;
  // Pro (Fish) voices: ×2 (or `proMultiplier` when set).
  if (input.isProVoice) {
    const pro = Math.max(
      1,
      input.proMultiplier ?? DEFAULT_PRO_VOICE_MULTIPLIER,
    );
    if (pro !== 1) {
      factors.push({
        key: "pro_voice",
        label: "Pro voice",
        detail: "Pro",
        multiplier: pro,
      });
    }
  }
  return factors;
}

export function estimateMeditationCredits(
  input: MeditationCreditEstimateInput,
): MeditationCreditEstimate {
  const lengthMinutes = Math.max(1, Math.min(120, input.lengthMinutes || 10));
  const delivery = input.delivery;
  const factors = meditationCreditFactors(input);
  const product = factors.reduce((acc, f) => acc * f.multiplier, 1);
  const credits = Math.max(1, Math.round(product));

  /* Previous speech/character-based estimate kept for calibration reference:
   * spokenShare × wpm × charsPerWord / charsPerCredit + scriptBase.
   * Create UI now uses length × delivery factors so the number and breakdown
   * always agree.
   */
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
  const aroundMinutes =
    (SEEDED.shared.sessionLeadInSeconds +
      SEEDED.shared.sessionFadeOutSeconds +
      SEEDED.shared.titleLeadPauseSeconds +
      SEEDED.shared.titleTrailPauseSeconds +
      2) /
    60;
  const scriptMinutes = Math.max(0.5, lengthMinutes - aroundMinutes);
  const spokenMinutes = scriptMinutes * spokenShare;
  const estimatedCharacters = Math.round(
    spokenMinutes * wpm * charsPerWord,
  );

  return {
    credits,
    factors,
    spokenMinutes: Math.round(spokenMinutes * 10) / 10,
    estimatedCharacters,
    scriptCredits: DEFAULT_SCRIPT_BASE_CREDITS,
    voiceCredits: credits,
    proMultiplier: input.isProVoice
      ? Math.max(1, input.proMultiplier ?? DEFAULT_PRO_VOICE_MULTIPLIER)
      : 1,
    isProVoice: input.isProVoice,
    delivery,
    lengthMinutes,
  };
}
