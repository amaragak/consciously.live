import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";

export type SpeechifySpeakerOption = {
  modelId: string;
  name: string;
  brand?: string | null;
  /** When false, play is disabled for this row. */
  canPlay?: boolean;
};

function IconPlay({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5.14v13.72L19 12 8 5.14z" />
    </svg>
  );
}

function IconPause({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}


/**
 * Custom speaker picker: native &lt;select&gt; cannot put play controls on options.
 * Opens a list where each Speechify voice has its own play/pause.
 */
export function SpeechifySpeakerSelect({
  value,
  options,
  playingId,
  disabled,
  placeholder = "Select speaker…",
  emptyLabel = "No Speechify speakers",
  allowClear = true,
  onChange,
  onTogglePlay,
}: {
  value: string;
  options: SpeechifySpeakerOption[];
  playingId: string | null;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  allowClear?: boolean;
  onChange: (modelId: string) => void;
  onTogglePlay: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((s) => s.modelId === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerLabel = selected
    ? selected.brand && selected.brand !== "speechify"
      ? `${selected.name} (not Speechify)`
      : selected.name
    : value
      ? "Current speaker"
      : placeholder;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-background px-2.5 text-left text-sm text-foreground outline-none hover:bg-card focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={`min-w-0 truncate ${selected || value ? "" : "text-muted"}`}
        >
          {triggerLabel}
        </span>
        <SelectChevron open={open} />
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Speechify speakers"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {allowClear ? (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              disabled={disabled}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-background ${
                !value ? "font-semibold text-foreground" : "text-muted"
              }`}
            >
              <span className="h-7 w-7 shrink-0" aria-hidden />
              {placeholder}
            </button>
          ) : null}
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted">{emptyLabel}</p>
          ) : (
            options.map((s) => {
              const selectedRow = s.modelId === value;
              const playing = playingId === s.modelId;
              const canPlay = s.canPlay !== false && Boolean(s.modelId);
              return (
                <div
                  key={s.modelId}
                  role="option"
                  aria-selected={selectedRow}
                  className={`flex items-center gap-1 px-1.5 py-0.5 ${
                    selectedRow ? "bg-accent-soft/50" : ""
                  }`}
                >
                  <button
                    type="button"
                    disabled={disabled || !canPlay}
                    aria-label={
                      playing ? `Pause ${s.name}` : `Play ${s.name} sample`
                    }
                    title={playing ? "Pause sample" : "Play sample"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePlay(s.modelId);
                    }}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {playing ? <IconPause /> : <IconPlay />}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(s.modelId);
                      setOpen(false);
                    }}
                    className={`min-w-0 flex-1 cursor-pointer rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-background ${
                      selectedRow
                        ? "font-semibold text-foreground"
                        : "text-foreground"
                    }`}
                  >
                    <span className="block truncate">
                      {s.brand && s.brand !== "speechify"
                        ? `${s.name} (not Speechify)`
                        : s.name}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
