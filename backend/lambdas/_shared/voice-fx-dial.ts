/**
 * Echo dial blends dry stem ↔ FX stem.
 * Admin wet mix = Echo recommended; FX stem is baked at 1.5× that so Wet (100) is hotter.
 * out(t) = (1-t)*dry + t*stem(dry)  where stem uses voiceFxStemWetGain(adminWetMix).
 */

/** FX stem wetGain multiplier vs admin wet mix (Echo at Wet = this × mix). */
export const VOICE_FX_STEM_WET_MULT = 1.5;

/** Echo recommended — admin wet mix lands here when the stem is 1.5×. */
export const VOICE_FX_DIAL_DEFAULT = Math.round(100 / VOICE_FX_STEM_WET_MULT);

export const VOICE_FX_WET_PRESET = "mixer";

export function clampVoiceFxDial(
  n: unknown,
  fallback = VOICE_FX_DIAL_DEFAULT,
): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function voiceFxDialGains(dial: number): { dry: number; wet: number } {
  const t = clampVoiceFxDial(dial) / 100;
  return { dry: 1 - t, wet: t };
}

/** Wet amount baked into the FX stem (capped at 1). */
export function voiceFxStemWetGain(adminWetMix: number): number {
  const w = Math.min(1, Math.max(0, adminWetMix));
  return Math.min(1, w * VOICE_FX_STEM_WET_MULT);
}
