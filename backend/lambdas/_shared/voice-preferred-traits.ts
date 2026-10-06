import type {
  VoiceAccent,
  VoiceEnergy,
  VoiceGender,
  VoicePitch,
} from "./fish-speakers";

export type VoicePreferredTraits = {
  energy: VoiceEnergy | null;
  pitch: VoicePitch | null;
  gender: VoiceGender | null;
  accent: VoiceAccent | null;
};

export function emptyVoicePrefs(): VoicePreferredTraits {
  return { energy: null, pitch: null, gender: null, accent: null };
}

export function coerceEnergy(raw: unknown): VoiceEnergy | null {
  return raw === "calm" || raw === "steady" || raw === "bright" ? raw : null;
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
    energy: coerceEnergy(o.energy),
    pitch: coercePitch(o.pitch),
    gender: coerceGender(o.gender),
    accent: coerceAccent(o.accent),
  };
}

export function hasVoicePrefs(prefs: VoicePreferredTraits | null | undefined): boolean {
  if (!prefs) return false;
  return Boolean(prefs.energy || prefs.pitch || prefs.gender || prefs.accent);
}
