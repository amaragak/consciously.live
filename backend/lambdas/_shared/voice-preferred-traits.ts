import type {
  VoiceAccent,
  VoiceEnergy,
  VoiceGender,
  VoicePitch,
} from "./fish-speakers";
import { VOICE_ENERGY_VALUES } from "./fish-speakers";

export const PREFERRED_SPEAKER_SLOT_COUNT = 3;

export type VoicePreferredTraits = {
  energy: VoiceEnergy[];
  pitch: VoicePitch | null;
  gender: VoiceGender | null;
  accent: VoiceAccent | null;
  /** Ordered speaker model IDs (up to 3). Empty slots omitted. */
  speakers: string[];
};

export function emptyVoicePrefs(): VoicePreferredTraits {
  return {
    energy: [],
    pitch: null,
    gender: null,
    accent: null,
    speakers: [],
  };
}

export function coercePreferredSpeakers(raw: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) return ids;
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= PREFERRED_SPEAKER_SLOT_COUNT) break;
  }
  return ids;
}

export function coerceEnergy(raw: unknown): VoiceEnergy | null {
  if (typeof raw !== "string") return null;
  return (VOICE_ENERGY_VALUES as readonly string[]).includes(raw)
    ? (raw as VoiceEnergy)
    : null;
}

/** Accepts a legacy single string or an array. Empty = unspecified. */
export function coerceEnergies(raw: unknown): VoiceEnergy[] {
  const found = new Set<VoiceEnergy>();
  const add = (v: unknown) => {
    const e = coerceEnergy(v);
    if (e) found.add(e);
  };
  if (Array.isArray(raw)) {
    for (const v of raw) add(v);
  } else {
    add(raw);
  }
  return VOICE_ENERGY_VALUES.filter((e) => found.has(e));
}

export function coercePitch(raw: unknown): VoicePitch | null {
  return raw === "low" || raw === "mid" || raw === "high" ? raw : null;
}

export function coerceGender(raw: unknown): VoiceGender | null {
  return raw === "male" || raw === "female" ? raw : null;
}

export function coerceAccent(raw: unknown): VoiceAccent | null {
  if (typeof raw !== "string") return null;
  const n = raw.trim().toLowerCase();
  if (n === "uk") return "UK";
  if (n === "us") return "US";
  if (n === "african") return "African";
  return null;
}

export function coerceVoicePrefs(raw: unknown): VoicePreferredTraits {
  if (!raw || typeof raw !== "object") return emptyVoicePrefs();
  const o = raw as Record<string, unknown>;
  return {
    energy: coerceEnergies(o.energy),
    pitch: coercePitch(o.pitch),
    gender: coerceGender(o.gender),
    accent: coerceAccent(o.accent),
    speakers: coercePreferredSpeakers(o.speakers),
  };
}

export function hasVoicePrefs(prefs: VoicePreferredTraits | null | undefined): boolean {
  if (!prefs) return false;
  return Boolean(
    prefs.energy.length > 0 ||
      prefs.pitch ||
      prefs.gender ||
      prefs.accent ||
      (prefs.speakers && prefs.speakers.length > 0),
  );
}
