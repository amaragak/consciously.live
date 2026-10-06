/** Parametric EQ bands for admin sound EQ (ffmpeg commit). */

export const SOUND_EQ_BAND_TYPES = [
  "peaking",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
] as const;

export type SoundEqBandType = (typeof SOUND_EQ_BAND_TYPES)[number];

export type SoundEqBand = {
  type: SoundEqBandType;
  frequency: number;
  Q: number;
  gain: number;
  enabled: boolean;
};

export function coerceSoundEqBands(raw: unknown): SoundEqBand[] {
  if (!Array.isArray(raw)) return [];
  const out: SoundEqBand[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const type = String(o.type ?? "").trim() as SoundEqBandType;
    if (!SOUND_EQ_BAND_TYPES.includes(type)) continue;
    const frequency = Number(o.frequency);
    const Q = Number(o.Q ?? o.q);
    const gain = Number(o.gain ?? 0);
    if (!Number.isFinite(frequency) || frequency < 20 || frequency > 20000) {
      continue;
    }
    if (!Number.isFinite(Q) || Q <= 0 || Q > 40) continue;
    if (!Number.isFinite(gain) || gain < -24 || gain > 24) continue;
    const enabled = o.enabled !== false;
    if (!enabled) continue;
    if (type !== "lowpass" && type !== "highpass" && gain === 0) continue;
    out.push({
      type,
      frequency: Math.round(frequency * 10) / 10,
      Q: Math.round(Q * 100) / 100,
      gain: Math.round(gain * 10) / 10,
      enabled: true,
    });
    if (out.length >= 12) break;
  }
  return out;
}

/** ffmpeg af filter chain matching Web Audio Biquad peaking/shelf/pass. */
export function ffmpegEqFilter(bands: SoundEqBand[]): string | null {
  const parts: string[] = [];
  for (const b of bands) {
    const f = b.frequency;
    const q = b.Q;
    const g = b.gain;
    switch (b.type) {
      case "peaking":
        parts.push(`equalizer=f=${f}:t=q:w=${q}:g=${g}`);
        break;
      case "lowshelf":
        parts.push(`lowshelf=f=${f}:t=q:w=${q}:g=${g}`);
        break;
      case "highshelf":
        parts.push(`highshelf=f=${f}:t=q:w=${q}:g=${g}`);
        break;
      case "lowpass":
        parts.push(`lowpass=f=${f}:t=q:w=${q}`);
        break;
      case "highpass":
        parts.push(`highpass=f=${f}:t=q:w=${q}`);
        break;
      default:
        break;
    }
  }
  return parts.length > 0 ? parts.join(",") : null;
}
