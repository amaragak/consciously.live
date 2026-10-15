/**
 * State B rail: Narrate (Create Sound pickers) + Every night reminder.
 */

import * as Switch from "@radix-ui/react-switch";
import {
  ChevronRight,
  Mic,
  Moon,
  Loader2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CreateSoundStep,
  type CreateSoundStepHandle,
} from "@/components/create-sound-step";
import { buildMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";
import { onMeditationGenerationReady } from "@/lib/library-generation-surface";
import {
  createMeditationAudioJob,
  type MeditationTargetMinutes,
} from "@/lib/medimade-api";
import {
  countWords,
  listeningMinutes,
  markVersionNarrated,
  markVersionNarrationPending,
  versionChangedSinceNarrated,
  type ManifestoStoryStoreV1,
  type StoryVersion,
} from "@/lib/manifesto-story";
import { appendPendingLibraryGeneration } from "@/lib/pending-library-generations";
import { ensurePendingMeditationJobPoller } from "@/lib/poll-pending-meditation-jobs";

/** Bed-only seconds before voice starts (story is not a meditation settle-in). */
const STORY_LEAD_IN_SECONDS = 2;

const LABEL =
  "text-[10px] font-semibold uppercase tracking-[1.4px] text-muted";
const CARD =
  "rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgba(15,27,45,0.04)]";
const BTN_PRIMARY =
  "accent-fill-gradient inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const SWITCH =
  "relative h-5 w-[34px] shrink-0 cursor-pointer rounded-full border border-border bg-muted transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent";

function coerceTargetMinutes(words: number): MeditationTargetMinutes {
  const mins = listeningMinutes(words) || 10;
  if (mins <= 3) return 2;
  if (mins <= 7) return 5;
  if (mins <= 15) return 10;
  return 20;
}

function RowButton({
  label,
  value,
  onClick,
}: {
  label: string;
  value: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-2 border-t border-border py-2.5 text-left text-sm transition-colors hover:text-foreground"
    >
      <span className="text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
        <span className="truncate">{value}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </span>
    </button>
  );
}

export function ManifestoStoryNarrateRail({
  store,
  version,
  firstName,
  onStoreChange,
  changedCount = 0,
  onUpdateFirst,
}: {
  store: ManifestoStoryStoreV1;
  version: StoryVersion;
  firstName: string;
  onStoreChange: (
    fn: (s: ManifestoStoryStoreV1) => ManifestoStoryStoreV1,
  ) => void;
  /** Draft sections out of date vs this version — triggers Narrate confirm. */
  changedCount?: number;
  /** Runs the same update-narration flow, then caller may re-open Narrate. */
  onUpdateFirst?: () => void | Promise<void>;
}) {
  const soundRef = useRef<CreateSoundStepHandle>(null);
  const [voiceLabel, setVoiceLabel] = useState("Choose voice");
  const [soundLabel, setSoundLabel] = useState("Choose sound");
  const [narrating, setNarrating] = useState(false);
  const [narrateError, setNarrateError] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);

  const words = version.wordCount || countWords(version.thirdPersonText);
  const narrateMin = listeningMinutes(words) || 1;
  const changed = versionChangedSinceNarrated(version);
  const hasNarrated = Boolean(version.narratedAt && version.audioId);
  const pending = Boolean(version.pendingJobId) || narrating;

  useEffect(() => {
    return onMeditationGenerationReady((detail) => {
      onStoreChange((prev) => {
        const match = prev.versions.find(
          (v) => v.pendingJobId === detail.jobId,
        );
        if (!match) return prev;
        return markVersionNarrated(prev, match.id, {
          audioId: detail.audioKey,
          text: match.thirdPersonText,
        });
      });
      setNarrating(false);
    });
  }, [onStoreChange]);

  async function onNarrate() {
    if (pending) return;
    if (changedCount > 0) {
      const n = changedCount;
      // OK → Update first; Cancel → Narrate anyway.
      const updateFirst = window.confirm(
        `${n} section${n === 1 ? "" : "s"} changed in your draft since you last prepared it.\n\n` +
          `OK = Update first\nCancel = Narrate anyway`,
      );
      if (updateFirst) {
        await onUpdateFirst?.();
        return;
      }
    }
    setNarrateError(null);
    setNarrating(true);
    try {
      soundRef.current?.stopPreviews();
      const extras = await soundRef.current?.getJobExtras();
      if (!extras?.reference_id) throw new Error("Choose a voice first");

      const script = version.thirdPersonText.trim();
      if (!script) throw new Error("Nothing to narrate yet");

      const title = firstName.trim()
        ? `${firstName.trim()}'s life vision`
        : "My life vision";
      const provenance = buildMeditationCreationProvenance({
        creationPath: "oneShot",
        meditationStyle: "Story",
        directPrompt: "Manifesto Story — narrated life vision",
      });

      const { jobId } = await createMeditationAudioJob({
        meditationStyle: "Story",
        journalMode: true,
        meditationTargetMinutes: coerceTargetMinutes(
          countWords(script),
        ),
        transcript: script,
        scriptText: script,
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

      onStoreChange((s) =>
        markVersionNarrationPending(s, version.id, jobId),
      );
      appendPendingLibraryGeneration({
        jobId,
        createdAt: new Date().toISOString(),
        title,
        description: null,
        meditationStyle: "Story",
        speakerName: extras.speakerName,
        speakerModelId: extras.reference_id,
        speakerPortraitUrl: extras.speakerPortraitUrl,
      });
      ensurePendingMeditationJobPoller();
      if (extras.speakerName) setVoiceLabel(extras.speakerName);
    } catch (e) {
      setNarrateError(e instanceof Error ? e.message : "Narration failed");
      setNarrating(false);
    }
  }

  const soundHost = (
    <CreateSoundStep
      ref={soundRef}
      meditationStyle="Story"
      pickerHost="viewport"
      hideMainUi
      freshOurPickSound
      onPickLabelsChange={({ voice, sound }) => {
        setVoiceLabel(voice);
        setSoundLabel(sound);
      }}
    />
  );

  const narrateCard = (
    <div className={`${CARD} flex flex-col gap-1 p-[18px]`}>
      <span className={`${LABEL} pb-1.5`}>Narrate</span>
      <RowButton
        label="Voice"
        value={voiceLabel}
        onClick={() => soundRef.current?.openVoicePicker()}
      />
      <RowButton
        label="Sound"
        value={soundLabel}
        onClick={() => soundRef.current?.openSoundPicker()}
      />
      {changed ? (
        <p className="border-t border-border pb-1 pt-2.5 text-xs font-medium text-accent-link">
          Changed since narrated
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending || words < 20}
        onClick={() => void onNarrate()}
        className={`${BTN_PRIMARY} mt-2.5`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Mic className="h-4 w-4" aria-hidden />
        )}
        {pending
          ? "Narrating…"
          : hasNarrated || changed
            ? "Narrate again"
            : `Narrate · about ${narrateMin} min`}
      </button>
      <p className="pt-1.5 text-center text-xs text-muted">
        Saved to Library as a Story
      </p>
      {narrateError ? (
        <p className="text-xs text-danger" role="alert">
          {narrateError}
        </p>
      ) : null}
    </div>
  );

  const nightCard = (
    <div className={`${CARD} flex flex-col gap-2.5 p-4 px-[18px]`}>
      <span className={LABEL}>Every night</span>
      <div className="flex items-center gap-2.5">
        <Moon className="h-4 w-4 shrink-0 text-accent-link" aria-hidden />
        <span className="flex flex-1 flex-wrap items-center gap-1 text-sm text-foreground">
          Remind me at{" "}
          {editingTime ? (
            <input
              type="time"
              value={store.reminderTime}
              onChange={(e) =>
                onStoreChange((s) => ({
                  ...s,
                  reminderTime: e.target.value || "22:30",
                }))
              }
              onBlur={() => setEditingTime(false)}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-sm"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTime(true)}
              className="cursor-pointer font-semibold text-accent-link underline-offset-2 hover:underline"
            >
              {store.reminderTime}
            </button>
          )}
        </span>
        <Switch.Root
          checked={store.reminderEnabled}
          onCheckedChange={(v) =>
            onStoreChange((s) => ({ ...s, reminderEnabled: Boolean(v) }))
          }
          className={SWITCH}
          aria-label="Remind me every night"
        >
          <Switch.Thumb className="block h-4 w-4 translate-x-[2px] rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-[16px]" />
        </Switch.Root>
      </div>
      <p className="text-xs text-muted">
        Listened {store.listenCount} time{store.listenCount === 1 ? "" : "s"}
      </p>
    </div>
  );

  return (
    <>
      {soundHost}
      <aside className="flex w-full flex-col gap-[14px] md:w-[320px] md:shrink-0">
        {narrateCard}
        {nightCard}
      </aside>
    </>
  );
}
