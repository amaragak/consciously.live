/**
 * Ideate → Focus preflight: kick off a 2‑min Visualization meditation in the
 * background (no Create chat), then the caller navigates to Focus.
 */

import {
  backgroundAudioStreamingKey,
  createMeditationAudioJob,
  listBackgroundAudio,
  VOICE_FX_PRESET_MEDITATION_MIXER,
  type BackgroundAudioItem,
} from "@/lib/medimade-api";
import { loadHomepageFishSpeakers } from "@/lib/homepage-one-shot-handoff";
import { readCreateSession } from "@/lib/create-session-storage";
import { appendPendingLibraryGeneration } from "@/lib/pending-library-generations";
import { FIXED_SPEECH_PREVIEW_SPEED } from "@/lib/speaker-sample-speed";
import type { PlanResistanceThemeHandoff } from "@/lib/plan-create-handoff";

/** Matches Create soundscape tab — composition rides the music slot alone. */
const SOUNDSCAPE_GAIN = 100;

function pickRandom<T>(items: readonly T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

async function pickRandomComposition(): Promise<BackgroundAudioItem | null> {
  try {
    const beds = await listBackgroundAudio();
    const pool = (beds.compositions ?? []).filter((c) => Boolean(c?.key?.trim()));
    return pickRandom(pool);
  } catch {
    return null;
  }
}

export type FocusPreflightMeditationInput = {
  goalTitle: string;
  visionText: string;
  dreamText?: string;
  obstacleText?: string;
  lifeAreaId?: string;
  focusTaskContext?: string;
  activeResistanceThemes?: PlanResistanceThemeHandoff[];
};

/** Scoped material for the worker — success mindset + tasks − blockers. */
export function buildFocusPreflightMeditationMaterial(
  input: FocusPreflightMeditationInput,
): string {
  const lines: string[] = [
    "Create a short (~2 minute) Visualization / manifestation meditation to set a success mindset before a focus session.",
    "",
    "Intent:",
    "— Visualise succeeding in this life area with a calm, capable, energised mindset.",
    "— Encourage the listener’s ability to complete the focus tasks below smoothly.",
    "— If blockers, resistance, or obstacles are listed, gently dissolve them so they do not get in the way of finishing the work — without dwelling on the problem.",
    "— Keep the script brief, spoken, and concrete. Do not ask questions.",
    "",
    `Life area / goal: ${input.goalTitle.trim() || "Untitled"}`,
    "",
    "Vision (future moment to feel):",
    input.visionText.trim() || "(not written yet)",
  ];
  if (input.dreamText?.trim()) {
    lines.push("", "The dream (free-form):", input.dreamText.trim());
  }
  if (input.obstacleText?.trim()) {
    lines.push("", "What feels in the way (dissolve gently):", input.obstacleText.trim());
  }
  if (input.focusTaskContext?.trim()) {
    lines.push(
      "",
      "Focus session tasks (weave as capability / ease of completing):",
      input.focusTaskContext.trim(),
    );
  }
  const themes = input.activeResistanceThemes ?? [];
  if (themes.length) {
    lines.push("", "Recurring resistance themes (dissolve, do not amplify):");
    for (const t of themes) {
      lines.push(
        `— [${t.level}] ${t.category} (${t.occurrences}×): ${t.sampleText.slice(0, 200)}`,
      );
    }
  }
  return lines.join("\n");
}

function packageFocusPreflightPrompt(material: string): string {
  return (
    "Please write a complete guided Visualization meditation script from this pre-focus request. " +
    "Use a calm, warm, energising tone suitable for spoken guidance just before focused work. " +
    "Interpret the material generously — do not ask clarifying questions. Aim for about 2 minutes when spoken.\n\n" +
    `Request:\n${material.trim()}`
  );
}

/**
 * Starts audio generation and registers a Library pending row.
 * Does not wait for completion — Focus opens immediately; the poller notifies.
 */
export async function startFocusPreflightMeditationGeneration(
  input: FocusPreflightMeditationInput,
): Promise<{ jobId: string }> {
  const material = buildFocusPreflightMeditationMaterial(input);
  if (!material.trim()) {
    throw new Error("Missing life-area context for the pre-focus meditation.");
  }

  const speakers = await loadHomepageFishSpeakers();
  const lastVoiceId = readCreateSession()?.speakerModelId?.trim() || "";
  const lastSpeaker = lastVoiceId
    ? speakers.find((s) => s.modelId === lastVoiceId)
    : null;
  const speaker = lastSpeaker ?? pickRandom(speakers);
  const speakerModelId = speaker?.modelId?.trim() || "";
  if (!speakerModelId) {
    throw new Error("No speaker available. Try again in a moment.");
  }

  const composition = await pickRandomComposition();
  if (!composition?.key?.trim()) {
    throw new Error("No soundscapes available. Try again in a moment.");
  }
  const compositionKey = backgroundAudioStreamingKey(composition.key);

  const packaged = packageFocusPreflightPrompt(material);
  const transcript = `User: ${packaged}`;
  const goal = input.goalTitle.trim() || "Focus";
  const provisionalTitle = `Pre-focus · ${goal}`.slice(0, 80);

  const { jobId } = await createMeditationAudioJob({
    meditationStyle: "Visualization",
    journalMode: false,
    meditationTargetMinutes: 2,
    transcript,
    scriptText: "",
    reference_id: speakerModelId,
    ttsProvider: "fish",
    speed: FIXED_SPEECH_PREVIEW_SPEED,
    voiceFxPreset: VOICE_FX_PRESET_MEDITATION_MIXER,
    ...(input.lifeAreaId?.trim()
      ? { lifeAreaId: input.lifeAreaId.trim() }
      : {}),
    // Soundscape mode: composition alone on the music slot (same as Create).
    backgroundMusicKey: compositionKey,
    backgroundMusicGain: SOUNDSCAPE_GAIN,
  });

  appendPendingLibraryGeneration({
    jobId,
    createdAt: new Date().toISOString(),
    title: provisionalTitle,
    description:
      "2‑minute pre-focus visualisation — generating in the background.",
    meditationStyle: "Visualization",
    speakerName: speaker?.name ?? null,
    speakerModelId,
    lifeAreaId: input.lifeAreaId?.trim() || null,
  });

  return { jobId };
}
