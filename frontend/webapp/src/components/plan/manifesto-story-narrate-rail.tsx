/**
 * State B rail: Narrate / Narration card + Every night reminder.
 */

import * as Switch from "@radix-ui/react-switch";
import {
  Check,
  ChevronRight,
  Loader2,
  Mic,
  Moon,
  RefreshCw,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CreateSoundStep,
  type CreateSoundStepHandle,
} from "@/components/create-sound-step";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { buildMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";
import {
  onMeditationGenerationFailed,
  onMeditationGenerationReady,
} from "@/lib/library-generation-surface";
import {
  createMeditationAudioJob,
  getMeditationAudioJobStatus,
  listLibraryMeditations,
  type LibraryMeditationItem,
  type MeditationTargetMinutes,
} from "@/lib/medimade-api";
import {
  clearVersionNarrationPending,
  countWords,
  diffStoryNarrationSettings,
  listeningMinutes,
  listeningSeconds,
  markVersionNarrated,
  STORY_LISTEN_FADE_OUT_SECONDS,
  markVersionNarrationPending,
  storyPaceLabel,
  storyTextHash,
  type ManifestoStoryStoreV1,
  type StoryNarrationSettings,
  type StoryVersion,
} from "@/lib/manifesto-story";
import { buildStoryNarrationScript } from "@/lib/manifesto-story-settle-in";
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

const WAVE_HEIGHTS = [
  8, 14, 10, 18, 12, 20, 9, 16, 11, 7, 15, 10, 19, 12, 8, 14, 17, 9, 13, 18, 10,
  6, 14, 11,
];

function coerceTargetMinutes(words: number): MeditationTargetMinutes {
  const mins = listeningMinutes(words) || 10;
  if (mins <= 3) return 2;
  if (mins <= 7) return 5;
  if (mins <= 15) return 10;
  return 20;
}

function formatNarratedDate(iso: string | undefined): string {
  if (!iso) return "recently";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "recently";
  }
}

function storyTitlePossessive(firstName: string): string {
  const name = firstName.trim();
  if (!name) return "Your story";
  return `${name}’s story`;
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

function StaticWaveform({ playedBars = 9 }: { playedBars?: number }) {
  return (
    <span className="flex h-5 items-center gap-0.5" aria-hidden>
      {WAVE_HEIGHTS.map((h, i) => (
        <i
          key={i}
          className={`block w-[3px] rounded-sm ${
            i < playedBars ? "bg-accent" : "bg-[color:var(--card-warm-border)]"
          }`}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

function VoiceAvatar({ name }: { name: string }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_35%,var(--muted))] text-[11px] font-semibold text-on-accent"
      aria-hidden
    >
      {initial}
    </span>
  );
}

export type NarrationCardState = 1 | 2 | 3 | 4;

export function ManifestoStoryNarrateRail({
  store,
  version,
  firstName,
  onStoreChange,
  changedCount = 0,
  onUpdateFirst,
  onCardStateChange,
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
  onCardStateChange?: (state: NarrationCardState) => void;
}) {
  const { playItem } = useLibraryPlayer();
  const soundRef = useRef<CreateSoundStepHandle>(null);
  const pendingSettingsRef = useRef<StoryNarrationSettings | null>(null);
  const [voiceLabel, setVoiceLabel] = useState("Choose voice");
  const [soundLabel, setSoundLabel] = useState("Choose sound");
  const [paceLabel, setPaceLabel] = useState("Natural");
  const [pacingPercent, setPacingPercent] = useState(0);
  const [voiceId, setVoiceId] = useState("");
  const [soundKey, setSoundKey] = useState("");
  const [narrating, setNarrating] = useState(false);
  const [narrateError, setNarrateError] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [libraryItem, setLibraryItem] = useState<LibraryMeditationItem | null>(
    null,
  );

  const words = version.wordCount || countWords(version.thirdPersonText);
  const spokenWords =
    countWords(
      buildStoryNarrationScript({
        thirdPersonText: version.thirdPersonText,
        settleInFirst: store.settleInFirst,
      }),
    ) || words;
  const narrateMin =
    listeningMinutes(spokenWords, { fadeOut: store.fadeOutAtEnd }) || 1;
  // A fresh prepare is a new version with no audio. The recording still lives
  // on the version that was narrated.
  const recording =
    version.narratedAt && version.audioId
      ? version
      : (store.versions.find((v) => v.narratedAt && v.audioId) ?? null);
  const hasNarrated = Boolean(recording);
  const textChanged = recording
    ? storyTextHash(version.thirdPersonText) !==
      (recording.narratedTextHash || storyTextHash(recording.thirdPersonText))
    : false;
  const pending = Boolean(version.pendingJobId) || narrating;

  const currentSettings: StoryNarrationSettings = useMemo(
    () => ({
      voiceId,
      voiceName: voiceLabel === "Choose voice" ? "" : voiceLabel,
      soundKey,
      soundName: soundLabel === "Choose sound" ? "" : soundLabel,
      pace: pacingPercent,
      paceLabel: paceLabel || storyPaceLabel(pacingPercent),
      settleIn: store.settleInFirst,
      fadeOut: store.fadeOutAtEnd,
    }),
    [
      voiceId,
      voiceLabel,
      soundKey,
      soundLabel,
      pacingPercent,
      paceLabel,
      store.settleInFirst,
      store.fadeOutAtEnd,
    ],
  );

  const settingsDiff = diffStoryNarrationSettings(
    recording?.narrationSettings,
    currentSettings,
  );
  const settingsChanged =
    hasNarrated && (settingsDiff.voice || settingsDiff.sound);
  const settingsNames = [
    settingsDiff.voice ? "Voice" : null,
    settingsDiff.sound ? "Sound" : null,
  ].filter((name): name is string => Boolean(name));
  const settingsNote =
    settingsNames.length === 0
      ? null
      : settingsNames.length === 1
        ? `${settingsNames[0]} changed since this narration`
        : "Settings changed since this narration";

  const cardState: NarrationCardState = !hasNarrated
    ? 1
    : textChanged
      ? 4
      : settingsChanged
        ? 3
        : 2;

  useEffect(() => {
    onCardStateChange?.(cardState);
  }, [cardState, onCardStateChange]);

  useEffect(() => {
    if (cardState === 3) setSettingsExpanded(true);
    if (cardState === 2) setSettingsExpanded(false);
  }, [cardState]);

  const listenFooter = `Listened ${store.listenCount} time${
    store.listenCount === 1 ? "" : "s"
  }`;

  useEffect(() => {
    const audioId = recording?.audioId?.trim();
    if (!audioId) {
      setLibraryItem(null);
      return;
    }
    let cancelled = false;
    void listLibraryMeditations()
      .then((items) => {
        if (cancelled) return;
        setLibraryItem(
          items.find((m) => m.s3Key === audioId || m.sk === audioId) ?? null,
        );
      })
      .catch(() => {
        if (!cancelled) setLibraryItem(null);
      });
    return () => {
      cancelled = true;
    };
  }, [recording?.audioId]);

  function applyNarrated(
    prev: ManifestoStoryStoreV1,
    versionId: string,
    audioKey: string,
    text: string,
  ) {
    const settings = pendingSettingsRef.current;
    pendingSettingsRef.current = null;
    const durationSec =
      typeof libraryItem?.durationSeconds === "number" &&
      libraryItem.durationSeconds > 0
        ? libraryItem.durationSeconds
        : listeningSeconds(countWords(text), { fadeOut: false });
    return markVersionNarrated(prev, versionId, {
      audioId: audioKey,
      text,
      ...(settings ? { settings } : {}),
      durationSec,
    });
  }

  useEffect(() => {
    const offReady = onMeditationGenerationReady((detail) => {
      onStoreChange((prev) => {
        const match = prev.versions.find(
          (v) => v.pendingJobId === detail.jobId,
        );
        if (!match) return prev;
        return applyNarrated(
          prev,
          match.id,
          detail.audioKey,
          match.thirdPersonText,
        );
      });
      setNarrating(false);
      setSettingsExpanded(false);
    });
    const offFailed = onMeditationGenerationFailed((detail) => {
      onStoreChange((prev) => {
        const match = prev.versions.find(
          (v) => v.pendingJobId === detail.jobId,
        );
        if (!match) return prev;
        return clearVersionNarrationPending(prev, match.id);
      });
      pendingSettingsRef.current = null;
      setNarrateError(detail.error || "Narration failed");
      setNarrating(false);
    });
    return () => {
      offReady();
      offFailed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyNarrated closes over latest libraryItem
  }, [onStoreChange, libraryItem?.durationSeconds]);

  useEffect(() => {
    const jobId = version.pendingJobId?.trim();
    if (!jobId) return;
    let cancelled = false;
    void (async () => {
      try {
        const st = await getMeditationAudioJobStatus(jobId);
        if (cancelled) return;
        if (st.status === "completed") {
          const audioKey = (st.audioKey ?? "").trim();
          if (!audioKey) return;
          onStoreChange((prev) =>
            applyNarrated(prev, version.id, audioKey, version.thirdPersonText),
          );
          setNarrating(false);
          setSettingsExpanded(false);
          return;
        }
        if (st.status === "failed") {
          onStoreChange((prev) =>
            clearVersionNarrationPending(prev, version.id),
          );
          pendingSettingsRef.current = null;
          setNarrateError(st.error ?? "Narration failed");
          setNarrating(false);
        }
      } catch {
        /* keep pending; poller may still resolve */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    version.pendingJobId,
    version.id,
    version.thirdPersonText,
    onStoreChange,
  ]);

  async function onNarrate() {
    if (pending) return;
    if (changedCount > 0) {
      const n = changedCount;
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

      const script = buildStoryNarrationScript({
        thirdPersonText: version.thirdPersonText,
        settleInFirst: store.settleInFirst,
      });
      if (!script.trim()) throw new Error("Nothing to narrate yet");

      const settingsSnapshot: StoryNarrationSettings = {
        voiceId: extras.reference_id,
        voiceName: extras.speakerName?.trim() || voiceLabel,
        soundKey:
          extras.backgroundMusicKey?.trim() ||
          extras.backgroundNatureKey?.trim() ||
          soundKey,
        soundName: soundLabel === "Choose sound" ? "" : soundLabel,
        pace: pacingPercent,
        paceLabel: paceLabel || storyPaceLabel(pacingPercent),
        settleIn: store.settleInFirst,
        fadeOut: store.fadeOutAtEnd,
      };
      pendingSettingsRef.current = settingsSnapshot;

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
        meditationTargetMinutes: coerceTargetMinutes(countWords(script)),
        transcript: script,
        scriptText: script,
        reference_id: extras.reference_id,
        ttsProvider: "speechify",
        fishTtsModel: "s2.1-pro-free",
        creationProvenance: provenance,
        voiceFxPreset: extras.voiceFxPreset,
        voiceFxDial: extras.voiceFxDial,
        leadInSeconds: STORY_LEAD_IN_SECONDS,
        fadeOut: store.fadeOutAtEnd,
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

      onStoreChange((s) => markVersionNarrationPending(s, version.id, jobId));
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
      setNarrating(false);
    } catch (e) {
      pendingSettingsRef.current = null;
      setNarrateError(e instanceof Error ? e.message : "Narration failed");
      setNarrating(false);
    }
  }

  function playRecording() {
    if (libraryItem) {
      playItem(libraryItem);
      return;
    }
    const key = recording?.audioId?.trim();
    if (!key) return;
    // Fallback until library row resolves — strip still needs a URL.
    void listLibraryMeditations().then((items) => {
      const hit = items.find((m) => m.s3Key === key || m.sk === key);
      if (hit) playItem(hit);
    });
  }

  const soundHost = (
    <CreateSoundStep
      ref={soundRef}
      meditationStyle="Story"
      pickerHost="viewport"
      hideMainUi
      freshOurPickSound
      onPickLabelsChange={({
        voice,
        sound,
        pace,
        pacingPercent: pct,
        voiceId: vid,
        soundKey: sk,
      }) => {
        setVoiceLabel(voice);
        setSoundLabel(sound);
        setPaceLabel(pace);
        setPacingPercent(pct);
        setVoiceId(vid);
        setSoundKey(sk);
      }}
    />
  );

  const showFullSettings =
    cardState === 1 || cardState === 3 || settingsExpanded;

  const settingsRows = (
    <>
      <RowButton
        label="Voice"
        value={
          <span className="inline-flex items-center gap-1.5">
            <VoiceAvatar name={voiceLabel} />
            {voiceLabel}
          </span>
        }
        onClick={() => soundRef.current?.openVoicePicker()}
      />
      <RowButton
        label="Sound"
        value={soundLabel}
        onClick={() => soundRef.current?.openSoundPicker()}
      />
    </>
  );

  const recorded = recording?.narrationSettings;
  const collapsedVoice = recorded?.voiceName || voiceLabel;
  const collapsedLine = [
    collapsedVoice === "Choose voice" ? null : collapsedVoice,
    recorded?.soundName ||
      (soundLabel === "Choose sound" ? null : soundLabel),
    recorded?.paceLabel || paceLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const fadeOn =
    (recording?.narrationSettings?.fadeOut ?? store.fadeOutAtEnd) !== false;
  const voiceSec =
    recording?.narrationDurationSec && recording.narrationDurationSec > 0
      ? recording.narrationDurationSec
      : libraryItem?.durationSeconds && libraryItem.durationSeconds > 0
        ? libraryItem.durationSeconds
        : 0;
  const durationMin =
    voiceSec > 0
      ? Math.max(
          1,
          Math.round(
            (voiceSec + (fadeOn ? STORY_LISTEN_FADE_OUT_SECONDS : 0)) / 60,
          ),
        )
      : narrateMin;

  const recordingBlock =
    hasNarrated ? (
      <div
        className={`flex items-center gap-3 rounded-[14px] p-3 ${
          cardState === 4
            ? "border border-border bg-[color-mix(in_srgb,var(--border)_50%,transparent)]"
            : "border border-[color:var(--card-warm-border)] bg-[color:var(--card-warm-bg)]"
        }`}
      >
        <PrimaryCreateButton
          variant="compact"
          leadingPlus={false}
          aria-label="Play your story"
          onClick={playRecording}
          className="!rounded-full"
          style={{ width: 44, height: 44, borderRadius: 9999 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </PrimaryCreateButton>
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          {cardState === 4 ? (
            <span className="inline-flex self-start rounded-full bg-border px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
              Previous version
            </span>
          ) : null}
          <span className="font-display text-base text-foreground">
            {storyTitlePossessive(firstName)}
          </span>
          <span className="text-xs text-muted">
            {cardState === 4
              ? `Narrated ${formatNarratedDate(recording?.narratedAt)} · before your latest edits`
              : `Narrated ${formatNarratedDate(recording?.narratedAt)} · ${durationMin} min`}
          </span>
          <StaticWaveform />
        </div>
      </div>
    ) : null;

  const collapsedSettings = (
    <button
      type="button"
      onClick={() => setSettingsExpanded(true)}
      className="flex w-full cursor-pointer items-center gap-2 border-t border-border py-2.5 text-left text-[13px] text-foreground/80"
    >
      <VoiceAvatar name={collapsedVoice} />
      <span className="min-w-0 flex-1 truncate">{collapsedLine || "Settings"}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-accent-link">
        Change
        <ChevronRight className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden />
      </span>
    </button>
  );

  const narrateCard = (
    <div className={`${CARD} flex flex-col gap-1 p-[18px]`}>
      <span className={`${LABEL} pb-1.5`}>
        {cardState === 1 ? "Narrate" : "Narration"}
      </span>

      {recordingBlock}

      {cardState === 4 ? (
        <div className="my-1 flex items-start gap-2.5 rounded-xl border border-[color:var(--card-warm-border)] bg-[color:var(--card-warm-bg)] px-3 py-2.5">
          <RefreshCw
            className="mt-0.5 h-[15px] w-[15px] shrink-0 text-accent-link"
            strokeWidth={1.8}
            aria-hidden
          />
          <span className="text-[13px] leading-snug text-foreground">
            Your narration text has changed since this was recorded.
          </span>
        </div>
      ) : null}

      {showFullSettings ? settingsRows : collapsedSettings}

      {cardState === 3 && settingsNote ? (
        <p className="pb-2 text-xs text-accent-link">{settingsNote}</p>
      ) : null}

      {cardState === 2 ? (
        <span className="flex items-center gap-1.5 pt-1 text-xs text-muted">
          <Check className="h-[13px] w-[13px] text-accent" strokeWidth={2.2} aria-hidden />
          Up to date with your narration text
        </span>
      ) : null}

      {cardState !== 2 ? (
        <button
          type="button"
          disabled={pending || words < 20}
          onClick={() => void onNarrate()}
          className={`${BTN_PRIMARY} mt-1`}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Mic className="h-4 w-4" aria-hidden />
          )}
          {pending
            ? "Narrating…"
            : cardState === 1
              ? `Narrate · about ${narrateMin} min`
              : `Narrate again · about ${narrateMin} min`}
        </button>
      ) : null}

      {cardState === 1 ? (
        <p className="pt-1.5 text-center text-xs text-muted">
          Saved to Library as a Story
        </p>
      ) : null}
      {cardState === 4 ? (
        <p className="pt-1.5 text-center text-xs text-muted">
          The previous version stays in Versions
        </p>
      ) : null}

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
      <p className="text-xs text-muted">{listenFooter}</p>
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
