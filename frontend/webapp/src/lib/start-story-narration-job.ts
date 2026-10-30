/**
 * Shared Manifesto Story / Admin Listen story narration job starter.
 * Title is spoken by the generate worker (`withSpokenMeditationTitleIntro`);
 * script body is third-person narration only — no meditation settle-in.
 */

import { buildMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";
import {
  coerceMeditationTargetMinutes,
  createMeditationAudioJob,
  type MeditationTargetMinutes,
} from "@/lib/medimade-api";
import { countWords, listeningMinutes } from "@/lib/manifesto-story";
import { buildStoryNarrationScript } from "@/lib/manifesto-story-settle-in";

/** Bed-only seconds before voice (story is not a meditation settle-in). */
export const STORY_LEAD_IN_SECONDS = 2;

export function storyLibraryTitle(firstName: string): string {
  const name = firstName.trim();
  return name ? `${name}'s life vision` : "My life vision";
}

function coerceTargetMinutes(words: number): MeditationTargetMinutes {
  const mins = listeningMinutes(words, { fadeOut: true }) || 10;
  return coerceMeditationTargetMinutes(
    mins <= 3 ? 2 : mins <= 7 ? 5 : mins <= 15 ? 10 : 20,
  );
}

/** Subset of CreateSoundStep job extras used for story jobs. */
export type StoryNarrationJobExtras = {
  reference_id: string;
  speakerName?: string | null;
  speakerPortraitUrl?: string | null;
  voiceFxPreset?: string | null;
  voiceFxDial?: number;
  speed?: number;
  speechifyRate?: number;
  longerBreaks?: boolean;
  backgroundNatureKey?: string | null;
  backgroundNatureGain?: number;
  backgroundMusicKey?: string | null;
  backgroundMusicGain?: number;
  backgroundDrumsKey?: string | null;
  backgroundDrumsGain?: number;
  backgroundNoiseKey?: string | null;
  backgroundNoiseGain?: number;
};

export async function startStoryNarrationJob(params: {
  thirdPersonText: string;
  firstName: string;
  extras: StoryNarrationJobExtras;
  /** Admin Listen examples under the Consciously house account. */
  asHouse?: boolean;
  /** Override spoken + library title (defaults to "{Name}'s life vision"). */
  title?: string;
}): Promise<{ jobId: string; title: string; script: string }> {
  const script = buildStoryNarrationScript({
    thirdPersonText: params.thirdPersonText,
  });
  if (!script.trim()) throw new Error("Nothing to narrate yet");
  if (!params.extras.reference_id?.trim()) {
    throw new Error("Choose a voice first");
  }

  const title =
    (params.title?.trim() || storyLibraryTitle(params.firstName)).trim() ||
    "My life vision";
  const provenance = buildMeditationCreationProvenance({
    creationPath: "oneShot",
    meditationStyle: "Story",
    directPrompt: params.asHouse
      ? "Admin Listen — example story"
      : "Manifesto Story — narrated life vision",
  });

  const extras = params.extras;
  const { jobId } = await createMeditationAudioJob({
    meditationStyle: "Story",
    meditationTargetMinutes: coerceTargetMinutes(countWords(script)),
    transcript: script,
    scriptText: script,
    title,
    reference_id: extras.reference_id,
    ttsProvider: "speechify",
    fishTtsModel: "s2.1-pro-free",
    creationProvenance: provenance,
    voiceFxPreset: extras.voiceFxPreset,
    voiceFxDial: extras.voiceFxDial,
    leadInSeconds: STORY_LEAD_IN_SECONDS,
    fadeOut: true,
    speed: extras.speed,
    ...(typeof extras.speechifyRate === "number"
      ? { speechifyRate: extras.speechifyRate }
      : {}),
    ...(extras.longerBreaks ? { longerBreaks: true } : {}),
    ...(params.asHouse ? { asHouse: true } : {}),
    ...(extras.backgroundNatureKey
      ? {
          backgroundNatureKey: extras.backgroundNatureKey,
          backgroundNatureGain: extras.backgroundNatureGain,
        }
      : {}),
    ...(extras.backgroundMusicKey
      ? {
          backgroundMusicKey: extras.backgroundMusicKey,
          backgroundMusicGain: extras.backgroundMusicGain,
        }
      : {}),
    ...(extras.backgroundDrumsKey
      ? {
          backgroundDrumsKey: extras.backgroundDrumsKey,
          backgroundDrumsGain: extras.backgroundDrumsGain,
        }
      : {}),
    ...(extras.backgroundNoiseKey
      ? {
          backgroundNoiseKey: extras.backgroundNoiseKey,
          backgroundNoiseGain: extras.backgroundNoiseGain,
        }
      : {}),
  });

  return { jobId, title, script };
}
