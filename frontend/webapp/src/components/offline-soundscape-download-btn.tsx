import { useState, type MouseEvent } from "react";
import { useOfflineDownloads } from "@/lib/native/use-offline-downloads";
import {
  formatBytes,
  removeSoundscapeDownload,
  saveSoundscapeForOffline,
} from "@/lib/native/offline-download-actions";

type Props = {
  soundKey: string;
  title: string;
  url: string | null;
  coverImageUrl: string | null;
  sizeBytes?: number | null;
};

export function OfflineSoundscapeDownloadBtn({
  soundKey,
  title,
  url,
  coverImageUrl,
  sizeBytes,
}: Props) {
  const { enabled, soundscape } = useOfflineDownloads();
  const saved = soundscape(soundKey);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  if (!enabled || !url) return null;

  const ring = progress != null && progress > 0 && progress < 1;

  async function onClick(e: MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (saved) {
      setBusy(true);
      try {
        await removeSoundscapeDownload(soundKey);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      await saveSoundscapeForOffline({
        key: soundKey,
        title,
        url: url!,
        coverImageUrl,
        onProgress: (done, total) => {
          setProgress(total > 0 ? done / total : 0);
        },
      });
    } catch {
      /* leave as not downloaded */
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const label = saved
    ? `Remove download of ${title}`
    : ring
      ? `Downloading ${title}`
      : `Download ${title}${
          typeof sizeBytes === "number" && sizeBytes > 0
            ? ` (${formatBytes(sizeBytes)})`
            : ""
        }`;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={busy && !saved}
      onClick={onClick}
      className={`absolute bottom-2 right-2 z-[1] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full shadow-sm ${
        saved
          ? "bg-[color-mix(in_srgb,var(--success,#067647)_14%,white)] text-[color:var(--success,#067647)]"
          : "border border-border bg-card text-foreground"
      }`}
    >
      {ring ? (
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="2.5"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(4, (progress ?? 0) * 56)} 56`}
            transform="rotate(-90 12 12)"
          />
        </svg>
      ) : saved ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.8 2.8L16 10" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 4v11" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      )}
    </button>
  );
}
