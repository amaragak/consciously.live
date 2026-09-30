import { useEffect, useRef, useState, type MouseEvent } from "react";
import { trackFromBlogNarration } from "@consciously/common";
import { useLibraryPlayer } from "@/components/library-player-provider";
import {
  generateJournalLetterAudioRemote,
  pollJournalLetterAudioUntilSettled,
  type JournalInsightPeriodType,
  type JournalWeeklyReflection,
} from "@/lib/medimade-api";
import { setCachedWeeklyReflection } from "@/lib/journal-remote-cache";

type Props = {
  reflection: JournalWeeklyReflection;
  title: string;
  weekKey: string;
  onReflectionUpdate: (next: JournalWeeklyReflection) => void;
};

function dateYmd(value: string | undefined): string {
  const t = value?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return "";
}

/**
 * Standard circular play control for Beatrice letter narration
 * (opted in at generate). Lives on the letter section header row.
 */
export function LetterNarrationButton({
  reflection,
  title,
  weekKey,
  onReflectionUpdate,
}: Props) {
  const { playTrack, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollGen = useRef(0);

  const startDate =
    dateYmd(reflection.startDate) || dateYmd(reflection.weekStart);
  const endDate = dateYmd(reflection.endDate) || dateYmd(reflection.weekEnd);
  const periodType = reflection.periodType as
    | JournalInsightPeriodType
    | undefined;
  const status = reflection.letterAudioStatus;
  const audioUrl = reflection.letterAudioUrl?.trim() ?? "";
  const generating = busy || status === "generating";
  const ready = Boolean(audioUrl) && status === "ready";
  const failed = status === "failed";
  const listenTrack = audioUrl
    ? trackFromBlogNarration(audioUrl, title || "Your letter")
    : null;
  const listening =
    listenTrack != null &&
    nowPlaying?.s3Key === listenTrack.s3Key &&
    playingS3Key === listenTrack.s3Key;

  useEffect(() => {
    if (status !== "generating" || !startDate || !endDate) return;
    const gen = ++pollGen.current;
    let cancelled = false;
    void (async () => {
      try {
        const settled = await pollJournalLetterAudioUntilSettled({
          startDate,
          endDate,
          periodType,
          onUpdate: (next) => {
            if (cancelled || gen !== pollGen.current) return;
            onReflectionUpdate(next);
            setCachedWeeklyReflection(weekKey || "__current__", {
              reflection: next,
              weekKey: next.weekKey || weekKey,
              weekStart: next.weekStart,
              weekEnd: next.weekEnd,
            });
          },
        });
        if (cancelled || gen !== pollGen.current) return;
        if (settled) {
          onReflectionUpdate(settled);
          setCachedWeeklyReflection(weekKey || "__current__", {
            reflection: settled,
            weekKey: settled.weekKey || weekKey,
            weekStart: settled.weekStart,
            weekEnd: settled.weekEnd,
          });
          if (settled.letterAudioStatus === "failed") {
            setError(
              settled.letterAudioError?.trim() ||
                "Narration failed. Try again.",
            );
          }
        }
        setBusy(false);
      } catch (e) {
        if (cancelled || gen !== pollGen.current) return;
        setBusy(false);
        setError(e instanceof Error ? e.message : "Narration failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, startDate, endDate, periodType, weekKey, onReflectionUpdate]);

  async function onPlayClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    if (listenTrack && ready) {
      if (nowPlaying?.s3Key === listenTrack.s3Key) {
        toggleCurrent();
      } else {
        playTrack(listenTrack);
      }
      return;
    }
    if (!failed || !startDate || !endDate || generating) return;
    setBusy(true);
    try {
      const started = await generateJournalLetterAudioRemote({
        startDate,
        endDate,
        periodType,
        ...(reflection.letterAudioVoiceId?.trim()
          ? { voiceId: reflection.letterAudioVoiceId.trim() }
          : {}),
      });
      if (started.reflection) {
        onReflectionUpdate(started.reflection);
        setCachedWeeklyReflection(weekKey || "__current__", {
          reflection: started.reflection,
          weekKey: started.weekKey || weekKey,
          weekStart: started.weekStart,
          weekEnd: started.weekEnd,
        });
      }
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not start narration");
    }
  }

  if (!startDate || !endDate) return null;
  if (!generating && !ready && !failed) return null;

  const label = listening
    ? "Pause letter narration"
    : generating
      ? "Generating letter narration"
      : failed
        ? "Retry letter narration"
        : "Play letter narration";
  const hint =
    error ||
    (failed
      ? reflection.letterAudioError?.trim() || "Narration failed — tap to retry"
      : generating
        ? reflection.letterAudioProgress?.trim() || "Generating narration…"
        : undefined);

  return (
    <button
      type="button"
      disabled={generating && !ready}
      onClick={(e) => void onPlayClick(e)}
      aria-label={label}
      title={hint || label}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent disabled:cursor-wait disabled:opacity-70 sm:h-9 sm:w-9"
    >
      {generating && !listening ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent"
          aria-hidden
        />
      ) : listening ? (
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden
          className="translate-x-[1px]"
        >
          <path d="M8 5v14l11-7L8 5z" />
        </svg>
      )}
    </button>
  );
}
