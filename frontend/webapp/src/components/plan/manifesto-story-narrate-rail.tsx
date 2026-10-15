/**
 * State B rail: Narrate (Create Sound pickers), Every night reminder, Versions.
 */

import * as Switch from "@radix-ui/react-switch";
import {
  Check,
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
import { createPortal } from "react-dom";
import {
  CreateSoundStep,
  type CreateSoundStepHandle,
} from "@/components/create-sound-step";
import { useMinWidth } from "@/hooks/use-min-width";
import { buildMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";
import { VOICE_PACING_MIN } from "@/lib/create-sound-picks";
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
  restoreStoryVersion,
  versionChangedSinceNarrated,
  type ManifestoStoryStoreV1,
  type StoryVersion,
} from "@/lib/manifesto-story";
import { buildStoryNarrationScript } from "@/lib/manifesto-story-settle-in";
import { appendPendingLibraryGeneration } from "@/lib/pending-library-generations";
import { ensurePendingMeditationJobPoller } from "@/lib/poll-pending-meditation-jobs";

const LABEL =
  "text-[10px] font-semibold uppercase tracking-[1.4px] text-muted";
const CARD =
  "rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgba(15,27,45,0.04)]";
const BTN_PRIMARY =
  "accent-fill-gradient inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_OUTLINE =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent-soft/30 disabled:cursor-not-allowed disabled:opacity-40";
const SWITCH =
  "relative h-5 w-[34px] shrink-0 cursor-pointer rounded-full border border-border bg-muted transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent";

function coerceTargetMinutes(words: number): MeditationTargetMinutes {
  const mins = listeningMinutes(words) || 10;
  if (mins <= 3) return 2;
  if (mins <= 7) return 5;
  if (mins <= 15) return 10;
  return 20;
}

function formatVersionDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    if (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    ) {
      return "Today";
    }
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
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
}: {
  store: ManifestoStoryStoreV1;
  version: StoryVersion;
  firstName: string;
  onStoreChange: (
    fn: (s: ManifestoStoryStoreV1) => ManifestoStoryStoreV1,
  ) => void;
}) {
  const wide = useMinWidth(768);
  const soundRef = useRef<CreateSoundStepHandle>(null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundFocus, setSoundFocus] = useState<"voice" | "sound" | "pace">(
    "voice",
  );
  const [voiceLabel, setVoiceLabel] = useState("Choose voice");
  const [soundLabel, setSoundLabel] = useState("Choose sound");
  const [narrating, setNarrating] = useState(false);
  const [narrateError, setNarrateError] = useState<string | null>(null);
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState(false);

  const words = version.wordCount || countWords(version.thirdPersonText);
  const aboutMin = listeningMinutes(words) || 1;
  const settleExtra = store.settleInFirst ? 2 : 0;
  const narrateMin = aboutMin + settleExtra;
  const changed = versionChangedSinceNarrated(version);
  const hasNarrated = Boolean(version.narratedAt && version.audioId);
  const pending = Boolean(version.pendingJobId) || narrating;

  const browseVersion =
    browseId != null
      ? (store.versions.find((v) => v.id === browseId) ?? null)
      : null;

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

  useEffect(() => {
    if (soundOpen) return;
    void (async () => {
      try {
        const extras = await soundRef.current?.getJobExtras();
        if (extras?.speakerName) setVoiceLabel(extras.speakerName);
      } catch {
        /* ignore */
      }
    })();
  }, [soundOpen]);

  async function onNarrate() {
    if (pending) return;
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
        leadInSeconds: extras.leadInSeconds,
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

  const soundHost =
    typeof document !== "undefined"
      ? createPortal(
          <div
            className={
              soundOpen
                ? "fixed inset-0 z-[80] flex items-end justify-center md:items-center"
                : "pointer-events-none fixed left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0"
            }
            aria-hidden={!soundOpen}
          >
            {soundOpen ? (
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0 bg-overlay/60"
                onClick={() => setSoundOpen(false)}
              />
            ) : null}
            <div
              className={
                soundOpen
                  ? `relative z-[1] flex max-h-[90vh] w-full flex-col overflow-hidden bg-background shadow-xl md:max-w-2xl md:rounded-2xl ${
                      wide ? "rounded-2xl" : "rounded-t-2xl"
                    }`
                  : "h-auto w-[720px]"
              }
            >
              {soundOpen ? (
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">
                    {soundFocus === "voice"
                      ? "Voice"
                      : soundFocus === "sound"
                        ? "Sound"
                        : "Pace"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSoundOpen(false)}
                    className={`${BTN_OUTLINE} h-9 px-3`}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Done
                  </button>
                </div>
              ) : null}
              <div
                className={
                  soundOpen
                    ? "min-h-0 flex-1 overflow-y-auto px-3 py-3"
                    : "p-2"
                }
              >
                <CreateSoundStep
                  ref={soundRef}
                  meditationStyle="Story"
                  initialPacingPercent={VOICE_PACING_MIN}
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const narrateCard = (
    <div className={`${CARD} flex flex-col gap-1 p-[18px]`}>
      <span className={`${LABEL} pb-1.5`}>Narrate</span>
      <RowButton
        label="Voice"
        value={voiceLabel}
        onClick={() => {
          setSoundFocus("voice");
          setSoundOpen(true);
        }}
      />
      <RowButton
        label="Sound"
        value={soundLabel}
        onClick={() => {
          setSoundFocus("sound");
          setSoundOpen(true);
        }}
      />
      <RowButton
        label="Pace"
        value="Slow"
        onClick={() => {
          setSoundFocus("pace");
          setSoundOpen(true);
        }}
      />
      <div className="flex items-center gap-2.5 border-t border-border py-2.5">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm text-foreground">Settle in first</span>
          <span className="text-xs text-muted">
            2 min of breath before the story
          </span>
        </span>
        <Switch.Root
          checked={store.settleInFirst}
          onCheckedChange={(v) =>
            onStoreChange((s) => ({ ...s, settleInFirst: Boolean(v) }))
          }
          className={SWITCH}
          aria-label="Settle in first"
        >
          <Switch.Thumb className="block h-4 w-4 translate-x-[2px] rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-[16px]" />
        </Switch.Root>
      </div>
      <div className="flex items-center gap-2.5 border-t border-border py-2.5 pb-3.5">
        <span className="flex-1 text-sm text-foreground">Fade out at the end</span>
        <Switch.Root
          checked={store.fadeOutAtEnd}
          onCheckedChange={(v) =>
            onStoreChange((s) => ({ ...s, fadeOutAtEnd: Boolean(v) }))
          }
          className={SWITCH}
          aria-label="Fade out at the end"
        >
          <Switch.Thumb className="block h-4 w-4 translate-x-[2px] rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-[16px]" />
        </Switch.Root>
      </div>
      {changed ? (
        <p className="pb-1 text-xs font-medium text-accent-link">
          Changed since narrated
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending || words < 20}
        onClick={() => void onNarrate()}
        className={BTN_PRIMARY}
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

  const versionsCard = (
    <div className={`${CARD} flex flex-col gap-1 p-4 px-[18px]`}>
      <span className={`${LABEL} pb-1.5`}>Versions</span>
      {store.versions.map((v) => {
        const current = v.id === store.activeVersionId;
        const label = v.audioId
          ? `v${v.number} · narrated`
          : `v${v.number} · draft`;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => setBrowseId(v.id)}
            className="flex w-full cursor-pointer items-center justify-between border-t border-border py-[7px] text-left text-[13px] transition-colors hover:text-accent-link"
          >
            <span
              className={
                current ? "font-semibold text-foreground" : "text-foreground"
              }
            >
              {label}
            </span>
            <span className="text-muted">{formatVersionDate(v.createdAt)}</span>
          </button>
        );
      })}
    </div>
  );

  const browseSheet =
    browseVersion && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-overlay/60"
              onClick={() => setBrowseId(null)}
            />
            <div className="relative z-[1] flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card shadow-xl md:rounded-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold">
                  v{browseVersion.number}
                  {browseVersion.audioId ? " · narrated" : " · draft"}
                </span>
                <button
                  type="button"
                  className="text-sm text-muted"
                  onClick={() => setBrowseId(null)}
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="whitespace-pre-wrap font-display text-[16px] leading-[1.7] text-foreground">
                  {browseVersion.thirdPersonText}
                </p>
              </div>
              {browseVersion.id !== store.activeVersionId ? (
                <div className="border-t border-border p-3">
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    onClick={() => {
                      onStoreChange((s) =>
                        restoreStoryVersion(s, browseVersion.id),
                      );
                      setBrowseId(null);
                    }}
                  >
                    Restore
                  </button>
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {soundHost}
      {browseSheet}
      <aside className="flex w-full flex-col gap-[14px] md:w-[320px] md:shrink-0">
        {narrateCard}
        {nightCard}
        {versionsCard}
      </aside>
    </>
  );
}
