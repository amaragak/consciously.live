/**
 * Sound-step pick logic (v1). Swap this module for a model later.
 * Voices, soundscapes, reasons, and three alternatives.
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import type {
  BackgroundAudioItem,
  FishSpeaker,
  VoiceAccent,
  VoiceEnergy,
  VoiceGender,
  VoicePitch,
  VoicePreferredTraits,
} from "@/lib/medimade-api";
import { coerceEnergies, hasVoicePrefs, VOICE_ENERGY_VALUES } from "@/lib/medimade-api";
import { pickDefaultSpeechifySpeaker } from "@/lib/fish-speakers";
import { MEDITATION_STYLE_LABELS } from "@/lib/meditation-style-intake";

export const LAST_VOICE_STORAGE_KEY = "mm_last_fish_voice_v1";
const LAST_SOUND_BY_STYLE_KEY = "mm_last_soundscape_by_style_v1";
const RECENT_SOUND_KEYS = "mm_recent_soundscapes_v1";

export const SILENCE_SOUND_ID = "";

export type VoicePickMeta = {
  description: string;
  gender: "male" | "female" | null;
  accent: string;
  energy: VoiceEnergy[];
  pitch: VoicePitch;
  /** True when description/accent were filled in locally, not from admin. */
  placeholder: boolean;
};

export type SoundPicks = {
  voiceId: string;
  voiceReason: string;
  voiceAlts: string[];
  soundId: string;
  soundReason: string;
  soundAlts: string[];
};

/** Style → composition subcategory ids (soundscape folders). */
export const STYLE_SOUND_SUBCATEGORIES: Record<string, string[]> = {
  "Body scan": ["nature", "pads-drones"],
  Visualization: ["pads-drones", "spaces"],
  "Breath-led": ["nature", "pads-drones"],
  Manifestation: ["pads-drones", "instruments"],
  "Affirmation loop": ["pads-drones", "voices"],
  Story: ["instruments", "pads-drones"],
  Reflection: ["nature", "spaces"],
  Sleep: ["pads-drones", "nature"],
  "Loving-kindness": ["pads-drones", "voices"],
  "Anxiety relief": ["nature", "pads-drones"],
  "Movement meditation": ["drums", "nature"],
  "Open awareness": ["nature", "spaces"],
};

for (const style of MEDITATION_STYLE_LABELS) {
  if (!STYLE_SOUND_SUBCATEGORIES[style]) {
    STYLE_SOUND_SUBCATEGORIES[style] = ["pads-drones", "nature"];
  }
}

/**
 * Placeholder energy · pitch · accent when admin has not set them.
 * Marked in the UI via `placeholder`.
 */
const VOICE_PLACEHOLDERS: Record<
  string,
  {
    energy: VoiceEnergy;
    pitch: VoicePitch;
    gender: VoiceGender | null;
    accent: VoiceAccent;
  }
> = {
  Beatrice: { energy: "calm", pitch: "mid", gender: "female", accent: "UK" },
  "Alan Watts": { energy: "calm", pitch: "low", gender: "male", accent: "UK" },
  Emily: { energy: "steady", pitch: "mid", gender: "female", accent: "US" },
  Alex: { energy: "calm", pitch: "mid", gender: "male", accent: "US" },
  Dina: { energy: "calm", pitch: "mid", gender: "female", accent: "US" },
  Fairy: { energy: "bright", pitch: "high", gender: "female", accent: "US" },
  "Brit Monk": { energy: "steady", pitch: "low", gender: "male", accent: "UK" },
  "Deep Soothing": {
    energy: "calm",
    pitch: "low",
    gender: "male",
    accent: "US",
  },
  Novelist: { energy: "steady", pitch: "mid", gender: "male", accent: "US" },
};

function titleCaseTrait(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function voiceDisplayMeta(speaker: FishSpeaker): VoicePickMeta {
  const ph = VOICE_PLACEHOLDERS[speaker.name];
  const liveEnergies = coerceEnergies(speaker.energy);
  const energy =
    liveEnergies.length > 0
      ? liveEnergies
      : ph
        ? [ph.energy]
        : (["calm"] as VoiceEnergy[]);
  const pitch = speaker.pitch ?? ph?.pitch ?? "mid";
  const accent = speaker.accent ?? ph?.accent ?? "US";
  const gender = speaker.gender ?? ph?.gender ?? null;
  const live =
    liveEnergies.length > 0 && Boolean(speaker.pitch) && Boolean(speaker.accent);
  const energyLabel = energy.map(titleCaseTrait).join(", ");
  return {
    description: `${energyLabel} energy · ${titleCaseTrait(pitch)} pitch · ${accent} accent`,
    gender,
    accent,
    energy,
    pitch,
    placeholder: !live,
  };
}

const ENERGY_ORDER: VoiceEnergy[] = [...VOICE_ENERGY_VALUES];
const PITCH_ORDER: VoicePitch[] = ["low", "mid", "high"];

function ordinalDistance<T extends string>(
  value: T,
  preferred: T | null,
  order: readonly T[],
): number {
  if (!preferred) return 0;
  const a = order.indexOf(value);
  const b = order.indexOf(preferred);
  if (a < 0 || b < 0) return 1;
  return Math.abs(a - b);
}

function minOrdinalDistance<T extends string>(
  values: readonly T[],
  preferred: readonly T[],
  order: readonly T[],
): number {
  if (!preferred.length) return 0;
  if (!values.length) return 1;
  let min = Infinity;
  for (const value of values) {
    for (const pref of preferred) {
      min = Math.min(min, ordinalDistance(value, pref, order));
    }
  }
  return Number.isFinite(min) ? min : 1;
}

export function voiceMatchDistance(
  speaker: FishSpeaker,
  prefs: VoicePreferredTraits | null | undefined,
): number {
  if (!hasVoicePrefs(prefs)) return 100;
  const t = voiceDisplayMeta(speaker);
  let d = 0;
  if (prefs!.energy.length > 0) {
    d += minOrdinalDistance(t.energy, prefs!.energy, ENERGY_ORDER) * 2;
  }
  if (prefs!.pitch) d += ordinalDistance(t.pitch, prefs!.pitch, PITCH_ORDER) * 2;
  if (prefs!.gender) d += t.gender === prefs!.gender ? 0 : 3;
  if (prefs!.accent) d += t.accent === prefs!.accent ? 0 : 2;
  return d;
}

function preferredSpeakerIndex(
  modelId: string,
  prefs: VoicePreferredTraits | null | undefined,
): number {
  const list = prefs?.speakers ?? [];
  const i = list.findIndex((id) => id === modelId);
  return i >= 0 ? i : 999;
}

export function rankVoicesByPrefs(
  speakers: FishSpeaker[],
  prefs: VoicePreferredTraits | null | undefined,
  opts?: {
    pinModelId?: string | null;
    favoriteIds?: ReadonlySet<string>;
  },
): FishSpeaker[] {
  const pin = opts?.pinModelId?.trim() || "";
  const favs = opts?.favoriteIds;
  return [...speakers].sort((a, b) => {
    const aPin = pin && a.modelId === pin ? 0 : 1;
    const bPin = pin && b.modelId === pin ? 0 : 1;
    if (aPin !== bPin) return aPin - bPin;
    const aPref = preferredSpeakerIndex(a.modelId, prefs);
    const bPref = preferredSpeakerIndex(b.modelId, prefs);
    if (aPref !== bPref) return aPref - bPref;
    const da = voiceMatchDistance(a, prefs);
    const db = voiceMatchDistance(b, prefs);
    if (da !== db) return da - db;
    const aFav = favs?.has(a.modelId) ? 0 : 1;
    const bFav = favs?.has(b.modelId) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return a.name.localeCompare(b.name);
  });
}

export function readLastVoiceId(): string | null {
  try {
    return readAccountLocalStorage(LAST_VOICE_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function writeLastVoiceId(modelId: string): void {
  if (!modelId.trim()) return;
  writeAccountLocalStorage(LAST_VOICE_STORAGE_KEY, modelId);
}

export function readLastSoundByStyle(): Record<string, string> {
  try {
    const raw = readAccountLocalStorage(LAST_SOUND_BY_STYLE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeLastSoundForStyle(style: string, soundId: string): void {
  const next = { ...readLastSoundByStyle(), [style || "_general"]: soundId };
  writeAccountLocalStorage(LAST_SOUND_BY_STYLE_KEY, JSON.stringify(next));
  rememberRecentSound(soundId);
}

export function readRecentSoundIds(): string[] {
  try {
    const raw = readAccountLocalStorage(RECENT_SOUND_KEYS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function rememberRecentSound(soundId: string): void {
  const ids = [
    soundId,
    ...readRecentSoundIds().filter((id) => id !== soundId),
  ].slice(0, 24);
  writeAccountLocalStorage(RECENT_SOUND_KEYS, JSON.stringify(ids));
}

function voiceFilterValues(speakers: FishSpeaker[]): {
  genders: string[];
  accents: string[];
} {
  const genders = new Set<string>();
  const accents = new Set<string>();
  for (const s of speakers) {
    const m = voiceDisplayMeta(s);
    if (m.gender) genders.add(m.gender);
    if (m.accent && m.accent !== "unspecified") accents.add(m.accent);
  }
  return {
    genders: [...genders].sort(),
    accents: [...accents].sort(),
  };
}

export function voiceFilterChips(speakers: FishSpeaker[]): string[] {
  const { genders, accents } = voiceFilterValues(speakers);
  return ["Favourites", ...genders, ...accents];
}

const VOICE_GENDER_FILTERS = new Set(["male", "female"]);

/**
 * Multi-select voice filters. Empty = all voices.
 * Favourites is AND; genders OR among themselves; accents OR among themselves;
 * gender × accent × favourites are AND across groups (e.g. male + UK).
 */
export function voiceMatchesFilter(
  speaker: FishSpeaker,
  filters: ReadonlySet<string> | readonly string[],
  favoriteIds?: ReadonlySet<string>,
): boolean {
  const active =
    filters instanceof Set
      ? filters
      : new Set(
          filters
            .map((f) => f.trim())
            .filter((f) => f && f !== "All"),
        );
  if (active.size === 0) return true;

  if (active.has("Favourites") && favoriteIds?.has(speaker.modelId) !== true) {
    return false;
  }

  const m = voiceDisplayMeta(speaker);
  const genderSelected: string[] = [];
  const accentSelected: string[] = [];
  for (const f of active) {
    if (f === "Favourites") continue;
    if (VOICE_GENDER_FILTERS.has(f)) genderSelected.push(f);
    else accentSelected.push(f);
  }

  if (genderSelected.length > 0 && !genderSelected.includes(m.gender ?? "")) {
    return false;
  }
  if (accentSelected.length > 0 && !accentSelected.includes(m.accent ?? "")) {
    return false;
  }
  return true;
}

function inCategory(item: BackgroundAudioItem, subIds: string[]): boolean {
  const sub = (item.subcategory ?? "").toLowerCase();
  if (!sub) return false;
  return subIds.some((id) => sub === id.toLowerCase());
}

export function pickSoundscapeForStyle(
  items: BackgroundAudioItem[],
  style: string | null | undefined,
): BackgroundAudioItem | null {
  if (items.length === 0) return null;
  const cats = STYLE_SOUND_SUBCATEGORIES[style ?? ""] ?? ["pads-drones", "nature"];
  const hit = items.find((it) => inCategory(it, cats));
  return hit ?? items[0] ?? null;
}

export function computeSoundPicks(opts: {
  speakers: FishSpeaker[];
  soundscapes: BackgroundAudioItem[];
  style?: string | null;
  /** Already chosen in this flow — skip a fresh suggestion. */
  lockedVoiceId?: string | null;
  lockedSoundId?: string | null;
  voicePrefs?: VoicePreferredTraits | null;
  programSpeakerId?: string | null;
  favoriteVoiceIds?: ReadonlySet<string>;
}): SoundPicks {
  const { speakers, soundscapes, style } = opts;
  const styleKey = style?.trim() || "_general";
  const lastVoice = readLastVoiceId();
  const lastSoundMap = readLastSoundByStyle();
  const lastSound = lastSoundMap[styleKey] ?? lastSoundMap._general;
  const ranked = rankVoicesByPrefs(speakers, opts.voicePrefs, {
    pinModelId: opts.programSpeakerId,
    favoriteIds: opts.favoriteVoiceIds,
  });
  const programSpeaker = opts.programSpeakerId?.trim() || "";

  let voiceId = opts.lockedVoiceId?.trim() || "";
  let voiceReason = "";
  if (!voiceId || !speakers.some((s) => s.modelId === voiceId)) {
    if (programSpeaker && speakers.some((s) => s.modelId === programSpeaker)) {
      voiceId = programSpeaker;
      voiceReason = "This program's speaker";
    } else if (hasVoicePrefs(opts.voicePrefs) && ranked[0]) {
      voiceId = ranked[0].modelId;
      const preferred = opts.voicePrefs?.speakers ?? [];
      voiceReason =
        preferred[0] === voiceId
          ? style
            ? `Preferred voice for ${style}`
            : "Preferred voice for this practice"
          : style
            ? `Closest match for ${style}`
            : "Closest match for this practice";
    } else if (lastVoice && speakers.some((s) => s.modelId === lastVoice)) {
      voiceId = lastVoice;
      voiceReason = "Your usual voice";
    } else {
      const def = pickDefaultSpeechifySpeaker(speakers);
      voiceId =
        def?.modelId ?? ranked[0]?.modelId ?? speakers[0]?.modelId ?? "";
      voiceReason =
        def && voiceId === def.modelId
          ? "Suggested voice"
          : style
            ? `A good fit for ${style}`
            : "A good fit for this practice";
    }
  } else if (programSpeaker && voiceId === programSpeaker) {
    voiceReason = "This program's speaker";
  } else if (lastVoice && voiceId === lastVoice) {
    voiceReason = "Your usual voice";
  } else if (style) {
    voiceReason = hasVoicePrefs(opts.voicePrefs)
      ? `Closest match for ${style}`
      : `A good fit for ${style}`;
  }

  const usedVoiceRank = [
    programSpeaker,
    ...ranked.map((s) => s.modelId),
    lastVoice,
    ...speakers.map((s) => s.modelId),
  ].filter((id): id is string => Boolean(id));
  const voiceAlts: string[] = [];
  for (const id of usedVoiceRank) {
    if (id === voiceId) continue;
    if (voiceAlts.includes(id)) continue;
    if (!speakers.some((s) => s.modelId === id)) continue;
    voiceAlts.push(id);
    if (voiceAlts.length >= 3) break;
  }

  let soundId =
    opts.lockedSoundId !== undefined && opts.lockedSoundId !== null
      ? opts.lockedSoundId
      : "";
  const soundExists =
    soundId === SILENCE_SOUND_ID ||
    soundscapes.some((s) => s.key === soundId);

  if (opts.lockedSoundId == null || !soundExists) {
    if (
      lastSound &&
      lastSound !== SILENCE_SOUND_ID &&
      soundscapes.some((s) => s.key === lastSound)
    ) {
      soundId = lastSound;
    } else {
      const ourPicks = soundscapes.filter((s) => s.adminFavourite);
      const pool = ourPicks.length > 0 ? ourPicks : soundscapes;
      const shuffled = shuffleInPlace([...pool]);
      // Never default to silence when any soundscape exists.
      soundId = shuffled[0]?.key ?? (soundscapes[0]?.key ?? SILENCE_SOUND_ID);
    }
  }
  // Initial pick only — cleared in UI when the user switches sound.
  const soundReason = "Suggested";

  const ourPicks = soundscapes.filter(
    (s) => s.adminFavourite && s.key !== soundId,
  );
  const restPool = soundscapes.filter(
    (s) => s.key !== soundId && !ourPicks.some((x) => x.key === s.key),
  );
  const soundAlts: string[] = [];
  for (const it of shuffleInPlace([...ourPicks])) {
    soundAlts.push(it.key);
    if (soundAlts.length >= 2) break;
  }
  for (const it of shuffleInPlace([...restPool])) {
    if (soundAlts.length >= 2) break;
    soundAlts.push(it.key);
  }
  while (soundAlts.length < 3) {
    const extra = soundscapes.find(
      (s) => s.key !== soundId && !soundAlts.includes(s.key),
    );
    if (!extra) break;
    soundAlts.push(extra.key);
  }

  return {
    voiceId,
    voiceReason,
      voiceAlts: voiceAlts.slice(0, 3),
    soundId,
    soundReason,
    soundAlts: soundAlts.slice(0, 3),
  };
}

export function swapAlt(current: string, alts: string[], picked: string): {
  current: string;
  alts: string[];
} {
  if (picked === current) return { current, alts };
  return {
    current: picked,
    alts: alts.map((id) => (id === picked ? current : id)),
  };
}

export function soundscapeCategoryLabel(item: BackgroundAudioItem | null): string {
  if (!item) return "Voice only";
  const pack = item.customPackName?.trim();
  if (pack) return pack;
  // Composer credit when no custom pack is assigned (e.g. Consciously Originals).
  if (item.composer?.trim() === "Consciously Originals") {
    return "Consciously Original";
  }
  return "Soundscape";
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Consumer-facing label for a composition catalog tag (id stays lowercase slug). */
const COMPOSITION_TAG_LABELS: Record<string, string> = {
  "nature-led": "nature heavy",
};

export function compositionTagLabel(tag: string): string {
  const key = tag.trim().toLowerCase();
  return COMPOSITION_TAG_LABELS[key] ?? tag;
}

/**
 * Sound-card volume fader (0–100 ↔ axis 0–1).
 * Recommended default is always 67 (0.67) — not restored from prior sessions.
 */
export const SOUND_VOLUME_RECOMMENDED = 67;

/** Voice-card pacing fader: Speechify admin rate ± integer (−5…+5). Center = admin rate. */
export const VOICE_PACING_MIN = -5;
export const VOICE_PACING_MAX = 5;
export const VOICE_PACING_RECOMMENDED = 0;

/** Map Volume 0–100 onto bed gain (100 = full catalog gain). */
export function musicLevelToBedGain(
  musicLevel: number,
  todayGain = 100,
): number {
  const n = Math.min(100, Math.max(0, musicLevel));
  return Math.min(100, Math.max(0, Math.round((todayGain * n) / 100)));
}
