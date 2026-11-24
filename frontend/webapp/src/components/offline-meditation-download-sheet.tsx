import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  soundscapeName: string | null;
  sizeLabel: string;
  busy?: boolean;
  mode: "download" | "update";
  onConfirm: () => void;
  onClose: () => void;
};

export function OfflineMeditationDownloadSheet({
  open,
  title,
  soundscapeName,
  sizeLabel,
  busy,
  mode,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const scape = soundscapeName?.trim() || "current soundscape";

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/35"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-dl-title"
        className="relative z-[1] w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl"
      >
        <h2
          id="offline-dl-title"
          className="font-display text-lg font-medium text-foreground"
        >
          {mode === "update" ? "Update download" : "Download"}
        </h2>
        <p className="mt-1 text-sm text-muted">{title}</p>
        <div className="mt-4 rounded-xl bg-background px-3.5 py-3 text-[13px] leading-relaxed text-muted">
          The soundscape (<span className="font-semibold text-foreground">{scape}</span>)
          is mixed into the download. To change it, switch soundscape while online,
          then download again.
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 cursor-pointer rounded-full border border-accent-button bg-accent-button px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {busy
              ? "Downloading…"
              : mode === "update"
                ? `Update · ${sizeLabel}`
                : `Download · ${sizeLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
