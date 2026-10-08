/**
 * Ready-made soundscapes are a whole produced bed rather than one mixer
 * channel. Tuned via the reductive dev fader at 67% of the prior 0.75 peak
 * (speech stays at 1.0).
 */
export const SOUNDSCAPE_ELEMENT_VOLUME = 0.75 * 0.67;

/**
 * Mixer fader 100% (music and every other bed channel) maps to the same
 * level as a ready-made soundscape at default listen volume.
 */
export const BED_GAIN_PEAK_VOLUME = SOUNDSCAPE_ELEMENT_VOLUME;

/** Narration / voice sample level — always full scale in preview and bake. */
export const SPEECH_ELEMENT_VOLUME = 1;

/** Bed-only lead-in before speech starts (live mix and baked mix). */
export const BED_VOICE_INTRO_SECONDS = 1.5;

/**
 * After the voice stem ends: hold beds at level, then fade them out before
 * dismissing the player. Music (and other live beds) otherwise cut or run on.
 */
export const BED_OUTRO_HOLD_SECONDS = 10;
export const BED_OUTRO_FADE_SECONDS = 10;

export function bedElementVolume(gain: number): number {
  const g = Math.min(100, Math.max(0, Number.isFinite(gain) ? gain : 0));
  return (g / 100) * BED_GAIN_PEAK_VOLUME;
}

/**
 * Dev listen trim for ready-made soundscapes.
 * 100% = current production playback (`SOUNDSCAPE_ELEMENT_VOLUME`); only reductive.
 */
export function soundscapeListenVolume(faderPercent = 100): number {
  const f = Math.min(
    100,
    Math.max(0, Number.isFinite(faderPercent) ? faderPercent : 100),
  );
  return SOUNDSCAPE_ELEMENT_VOLUME * (f / 100);
}

/** Apply after src/load — browsers reset HTMLMediaElement.volume to 1 on load(). */
export function applyBedElementVolume(
  el: HTMLMediaElement | null,
  gain: number,
): void {
  if (!el) return;
  el.volume = bedElementVolume(gain);
}

/** Apply after src/load so voice previews stay at full scale. */
export function applySpeechElementVolume(el: HTMLMediaElement | null): void {
  if (!el) return;
  el.volume = SPEECH_ELEMENT_VOLUME;
}
