/** Voice preview samples: S3 keys `speaker-samples/<modelId>/…`.
 * Fish filenames include the prosody speed stem (`0.9-loud.mp3`).
 * Speechify filenames include the SSML rate stem (`r-20-loud.mp3`) for admin
 * rate ± pacing offsets (−5…+5). Legacy unstemmed `loud*.wav` = admin rate (offset 0).
 */

export type SpeakerSampleBrand = "fish" | "speechify";

function isSpeechifySampleBrand(
  brand?: SpeakerSampleBrand | string | null,
): boolean {
  return brand === "speechify";
}

export const SPEAKER_SAMPLE_SPEED_MIN = 0.75;
export const SPEAKER_SAMPLE_SPEED_MAX = 1;
export const SPEAKER_SAMPLE_SPEED_STEP = 0.05;

/** Speeds we generate and upload in the speaker-samples script. */
export const SPEAKER_PREVIEW_SPEEDS: readonly number[] = [
  0.75, 0.8, 0.85, 0.9, 0.95, 1,
];

/** Integer pacing offsets on Create Sound (Speechify: added to admin rate). */
export const SPEECHIFY_RATE_PACING_OFFSETS = [
  -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5,
] as const;

export function snapSpeakerSampleSpeed(n: number): number {
  const k = Math.round(
    (n - SPEAKER_SAMPLE_SPEED_MIN) / SPEAKER_SAMPLE_SPEED_STEP,
  );
  let v = SPEAKER_SAMPLE_SPEED_MIN + k * SPEAKER_SAMPLE_SPEED_STEP;
  v = Math.min(
    SPEAKER_SAMPLE_SPEED_MAX,
    Math.max(SPEAKER_SAMPLE_SPEED_MIN, v),
  );
  return Math.round(v * 100) / 100;
}

/** Fish TTS prosody speed for previews and final render (single fixed value). */
export const FIXED_SPEECH_PREVIEW_SPEED = snapSpeakerSampleSpeed(0.9);

/** Filename stem before `.mp3`, e.g. `0.75`, `0.9`, `1.0`. */
export function speechSpeedToSampleStem(speed: number): string {
  const n = snapSpeakerSampleSpeed(speed);
  const s = n.toFixed(2);
  if (/^\d+\.00$/.test(s)) return `${Math.trunc(n)}.0`;
  if (s.endsWith("0") && s.includes(".")) return s.slice(0, -1);
  return s;
}

export function clampSpeechifyRate(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(-50, Math.min(50, Math.round(n)));
}

/** S3 stem for a Speechify rate, e.g. `r-20`, `r0`, `r5`. */
export function speechifyRateToSampleStem(rate: number): string {
  return `r${clampSpeechifyRate(rate)}`;
}

/** Admin rate + Create Sound pacing offset (−5…+5). */
export function effectiveSpeechifyRate(
  adminRate: number | null | undefined,
  pacingOffset: number,
): number {
  const base = clampSpeechifyRate(adminRate ?? 0);
  const off =
    typeof pacingOffset === "number" && Number.isFinite(pacingOffset)
      ? Math.round(pacingOffset)
      : 0;
  return clampSpeechifyRate(base + off);
}

/**
 * Value embedded in preview S3 keys: Speechify absolute rate (admin ± pacing),
 * Fish fixed prosody speed.
 */
export function speakerSampleSpeedOrRate(
  brand: SpeakerSampleBrand | string | null | undefined,
  speechifyRate: number | null | undefined,
  pacingOffset = 0,
): number {
  if (isSpeechifySampleBrand(brand)) {
    return effectiveSpeechifyRate(speechifyRate, pacingOffset);
  }
  return FIXED_SPEECH_PREVIEW_SPEED;
}

/**
 * For Speechify, `speedOrRate` is the absolute SSML rate percent (e.g. −20).
 * For Fish, it is prosody speed (e.g. 0.9).
 */
export function speakerPreviewSampleKey(
  modelId: string,
  speedOrRate: number,
  brand?: SpeakerSampleBrand | string | null,
): string {
  if (isSpeechifySampleBrand(brand)) {
    return `speaker-samples/${modelId}/${speechifyRateToSampleStem(speedOrRate)}.mp3`;
  }
  return `speaker-samples/${modelId}/${speechSpeedToSampleStem(speedOrRate)}.mp3`;
}

/** Loudness-normalized preview MP3 (~-16 LUFS integrated). */
export function speakerPreviewLoudSampleKey(
  modelId: string,
  speedOrRate: number,
  brand?: SpeakerSampleBrand | string | null,
): string {
  if (isSpeechifySampleBrand(brand)) {
    return `speaker-samples/${modelId}/${speechifyRateToSampleStem(speedOrRate)}-loud.mp3`;
  }
  return `speaker-samples/${modelId}/${speechSpeedToSampleStem(speedOrRate)}-loud.mp3`;
}

/** Processed preview (Pedalboard preset `mixer`) for the sound mixer; WAV on CDN. */
export function speakerPreviewFxSampleKey(
  modelId: string,
  speed: number,
): string {
  return `speaker-samples/${modelId}/${speechSpeedToSampleStem(speed)}-fx.wav`;
}

/** Pedalboard-decoded dry WAV (same PCM the mixer bounce was built from). */
export function speakerPreviewLoudDrySampleKey(
  modelId: string,
  speedOrRate: number,
  brand?: SpeakerSampleBrand | string | null,
): string {
  if (isSpeechifySampleBrand(brand)) {
    return `speaker-samples/${modelId}/${speechifyRateToSampleStem(speedOrRate)}-loud-dry.wav`;
  }
  return `speaker-samples/${modelId}/${speechSpeedToSampleStem(speedOrRate)}-loud-dry.wav`;
}

/** FX preview derived from the loudness-normalized MP3 input. */
export function speakerPreviewLoudFxSampleKey(
  modelId: string,
  speedOrRate: number,
  brand?: SpeakerSampleBrand | string | null,
): string {
  if (isSpeechifySampleBrand(brand)) {
    return `speaker-samples/${modelId}/${speechifyRateToSampleStem(speedOrRate)}-loud-fx.wav`;
  }
  return `speaker-samples/${modelId}/${speechSpeedToSampleStem(speedOrRate)}-loud-fx.wav`;
}

/** Full mixer bounce used as the effected stem (same chain as loud-fx). */
export function speakerPreviewLoudWetSampleKey(
  modelId: string,
  speedOrRate: number,
  brand?: SpeakerSampleBrand | string | null,
): string {
  if (isSpeechifySampleBrand(brand)) {
    return `speaker-samples/${modelId}/${speechifyRateToSampleStem(speedOrRate)}-loud-wet.wav`;
  }
  return `speaker-samples/${modelId}/${speechSpeedToSampleStem(speedOrRate)}-loud-wet.wav`;
}

/**
 * Single-play letter-narration audition (Speechify only).
 * Script: `Hey I'm <name>. I'll narrate your personal insights letter`
 */
export function speakerLetterIntroSampleKey(modelId: string): string {
  return `speaker-samples/${modelId}/letter-intro.mp3`;
}

/** Speechify emotion audition clips (admin): neutral / warm / calm. */
export const SPEECHIFY_EMOTION_SAMPLE_TAGS = [
  "neutral",
  "warm",
  "calm",
] as const;

export type SpeechifyEmotionSampleTag =
  (typeof SPEECHIFY_EMOTION_SAMPLE_TAGS)[number];

export function coerceSpeechifyEmotionSampleTag(
  raw: unknown,
): SpeechifyEmotionSampleTag | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "neutral" || s === "warm" || s === "calm") return s;
  return null;
}

export function speakerEmotionSampleKey(
  modelId: string,
  tag: SpeechifyEmotionSampleTag,
): string {
  return `speaker-samples/${modelId}/emotion-${tag}.mp3`;
}

/** Orpheus preview samples: S3 keys `orpheus-speaker-samples/<voiceId>/<stem>.mp3`. */
export function orpheusSpeakerPreviewSampleKey(
  voiceId: string,
  speed: number,
): string {
  return `orpheus-speaker-samples/${voiceId}/${speechSpeedToSampleStem(speed)}.mp3`;
}

export function orpheusSpeakerPreviewLoudSampleKey(
  voiceId: string,
  speed: number,
): string {
  return `orpheus-speaker-samples/${voiceId}/${speechSpeedToSampleStem(speed)}-loud.mp3`;
}

export function orpheusSpeakerPreviewLoudFxSampleKey(
  voiceId: string,
  speed: number,
): string {
  return `orpheus-speaker-samples/${voiceId}/${speechSpeedToSampleStem(speed)}-loud-fx.wav`;
}
