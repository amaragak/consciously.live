/** Parametric EQ band shared by admin preview (Web Audio) and ffmpeg commit. */

export const SOUND_EQ_BAND_TYPES = [
  "peaking",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
] as const;

export type SoundEqBandType = (typeof SOUND_EQ_BAND_TYPES)[number];

export type SoundEqBand = {
  id: string;
  type: SoundEqBandType;
  /** Center / corner frequency in Hz. */
  frequency: number;
  /** Q / resonance (Web Audio + ffmpeg q width). */
  Q: number;
  /** Gain in dB (peaking / shelf). Ignored for pass filters. */
  gain: number;
  enabled: boolean;
};

export function newSoundEqBandId(): string {
  return `eq-${Math.random().toString(36).slice(2, 9)}`;
}

export function blankSoundEqBand(
  partial?: Partial<Omit<SoundEqBand, "id">> & { id?: string },
): SoundEqBand {
  return {
    id: partial?.id ?? newSoundEqBandId(),
    type: partial?.type ?? "peaking",
    frequency: partial?.frequency ?? 1000,
    Q: partial?.Q ?? 1,
    gain: partial?.gain ?? 0,
    enabled: partial?.enabled ?? true,
  };
}

/** Presence peaking band (~3 kHz) — shared shape for light / heavy cuts. */
function presenceCutBand(gainDb: number): SoundEqBand {
  return blankSoundEqBand({
    type: "peaking",
    frequency: 3000,
    Q: 1.2,
    gain: gainDb,
    enabled: true,
  });
}

/** Mild presence cut (~3 dB) — soft harshness / “forward” reduction. */
export function lightPresenceCutPresetBands(): SoundEqBand[] {
  return [presenceCutBand(-3)];
}

/** Stronger presence cut (~7 dB) — more assertive mid reduction. */
export function heavyPresenceCutPresetBands(): SoundEqBand[] {
  return [presenceCutBand(-7)];
}

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
    out.push({
      id:
        typeof o.id === "string" && o.id.trim()
          ? o.id.trim().slice(0, 40)
          : newSoundEqBandId(),
      type,
      frequency: Math.round(frequency * 10) / 10,
      Q: Math.round(Q * 100) / 100,
      gain: Math.round(gain * 10) / 10,
      enabled: o.enabled !== false,
    });
    if (out.length >= 12) break;
  }
  return out;
}

export function activeSoundEqBands(bands: SoundEqBand[]): SoundEqBand[] {
  return bands.filter((b) => b.enabled && (b.type === "lowpass" || b.type === "highpass" || b.gain !== 0));
}

/** Map band → Web Audio BiquadFilterType. */
export function toBiquadType(type: SoundEqBandType): BiquadFilterType {
  return type;
}
