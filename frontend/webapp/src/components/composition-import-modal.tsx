import { useEffect, useRef, useState } from "react";
import {
  COMPOSITION_COMPOSERS,
  DEFAULT_COMPOSITION_COMPOSER,
  type AdminCompositionTagType,
  type CompositionComposer,
} from "@/lib/medimade-api";

export type CompositionImportDraft = {
  filename: string;
  name: string;
  composer: CompositionComposer;
  customPackName: string | null;
  tags: string[];
  binauralHz: string;
};

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 32);
}

/**
 * Post-upload metadata for a new composition. No backdrop blur.
 */
export function CompositionImportModal({
  open,
  filename,
  initialName,
  packNames,
  tagTypes,
  saving,
  error,
  onSave,
  onSkip,
}: {
  open: boolean;
  filename: string;
  initialName: string;
  packNames: string[];
  tagTypes: AdminCompositionTagType[];
  saving: boolean;
  error: string | null;
  onSave: (draft: CompositionImportDraft) => void;
  onSkip: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [composer, setComposer] = useState<CompositionComposer>(
    DEFAULT_COMPOSITION_COMPOSER,
  );
  const [customPackName, setCustomPackName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [binauralHz, setBinauralHz] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setComposer(DEFAULT_COMPOSITION_COMPOSER);
    setCustomPackName("");
    setTags([]);
    setTagDraft("");
    setBinauralHz("");
    const t = window.setTimeout(() => nameRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, initialName, filename]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onSkip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onSkip]);

  if (!open) return null;

  function addTag(raw: string) {
    const t = normalizeTag(raw);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 24 ? prev : [...prev, t]));
    setTagDraft("");
  }

  const quickTags = tagTypes.flatMap((type) =>
    (type.tags ?? []).map((tag) => ({ type: type.label, tag })),
  );

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-foreground/15 p-4 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!saving) onSkip();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="composition-import-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[0_16px_40px_rgb(15_27_45_/_0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="composition-import-title"
          className="font-display text-xl font-medium tracking-tight text-foreground"
        >
          New composition
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Uploaded as{" "}
          <span className="break-all font-mono text-[12px] text-foreground">
            {filename}
          </span>
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Name
            <input
              ref={nameRef}
              type="text"
              value={name}
              disabled={saving}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Composer
            <select
              value={composer}
              disabled={saving}
              onChange={(e) =>
                setComposer(e.target.value as CompositionComposer)
              }
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
            >
              {COMPOSITION_COMPOSERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Custom pack
              <select
                value={customPackName}
                disabled={saving}
                onChange={(e) => setCustomPackName(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
              >
                <option value="">No pack</option>
                {packNames.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Binaural Hz
              <input
                type="number"
                inputMode="decimal"
                min={0.1}
                max={1000}
                step="any"
                placeholder="optional"
                value={binauralHz}
                disabled={saving}
                onChange={(e) => setBinauralHz(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Tags</span>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-[12px] text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={`Remove ${tag}`}
                      onClick={() =>
                        setTags((prev) => prev.filter((t) => t !== tag))
                      }
                      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <input
              type="text"
              value={tagDraft}
              disabled={saving || tags.length >= 24}
              placeholder="Type a tag, Enter to add"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }}
              onBlur={() => {
                if (tagDraft.trim()) addTag(tagDraft);
              }}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
            />
            {quickTags.length > 0 ? (
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto pt-0.5">
                {quickTags.map(({ tag, type }) => {
                  const on = tags.includes(tag);
                  return (
                    <button
                      key={`${type}:${tag}`}
                      type="button"
                      disabled={saving}
                      title={type}
                      onClick={() =>
                        setTags((prev) =>
                          on
                            ? prev.filter((t) => t !== tag)
                            : prev.length >= 24
                              ? prev
                              : [...prev, tag],
                        )
                      }
                      className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                        on
                          ? "border border-accent bg-accent-soft/50 font-semibold text-foreground"
                          : "border border-border bg-background text-muted hover:text-foreground"
                      } disabled:opacity-50`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-danger">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={onSkip}
            className="cursor-pointer rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() =>
              onSave({
                filename,
                name: name.trim(),
                composer,
                customPackName: customPackName.trim() || null,
                tags,
                binauralHz,
              })
            }
            className="cursor-pointer rounded-xl accent-fill-gradient px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save details"}
          </button>
        </div>
      </div>
    </div>
  );
}
