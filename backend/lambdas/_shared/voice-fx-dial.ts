/**
 * FX dial blends the dry stem with the full mixer bounce (same Pedalboard
 * `mixer` file as before the split). 0 = dry; 100 = effected.
 * out(t) = (1-t)*dry + t*mixer(dry)
 */

export const VOICE_FX_DIAL_DEFAULT = 100;
export const VOICE_FX_WET_PRESET = "mixer";

export function clampVoiceFxDial(n: unknown, fallback = VOICE_FX_DIAL_DEFAULT): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function voiceFxDialGains(dial: number): { dry: number; wet: number } {
  const t = clampVoiceFxDial(dial) / 100;
  return { dry: 1 - t, wet: t };
}
