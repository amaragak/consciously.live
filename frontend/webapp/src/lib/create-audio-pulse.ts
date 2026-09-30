/** Keep in sync with `.create-audio-selected-pulse` duration in `index.css`. */
export const CREATE_AUDIO_PULSE_MS = 1700;

/**
 * Wall-clock phase so separately mounted selected voice / soundscape cards
 * pulse in sync (negative delay = already this far into the cycle).
 */
export function createAudioPulseDelayMs(): string {
  return `-${performance.now() % CREATE_AUDIO_PULSE_MS}ms`;
}
