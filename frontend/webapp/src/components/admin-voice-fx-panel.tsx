import { useEffect, useRef, useState } from "react";
import {
  commitAdminVoiceFx,
  listAdminVoiceFx,
  patchAdminVoiceFx,
  previewAdminVoiceFx,
  type AdminVoiceFxSettings,
} from "@/lib/medimade-api";

type Field = {
  id: keyof AdminVoiceFxSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
};

const PRIMARY_FIELDS: Field[] = [
  {
    id: "delayMs",
    label: "Delay (ms)",
    min: 20,
    max: 2000,
    step: 10,
    hint: "First echo tap (dry is kept; then IR on the whole signal)",
  },
  {
    id: "delayMs2",
    label: "Delay 2 (ms)",
    min: 40,
    max: 4000,
    step: 10,
    hint: "Second echo tap",
  },
  {
    id: "delayMs3",
    label: "Delay 3 (ms)",
    min: 60,
    max: 6000,
    step: 10,
    hint: "Third echo tap",
  },
  {
    id: "delayDecay",
    label: "Delay decay",
    min: 0.05,
    max: 1,
    step: 0.05,
  },
  {
    id: "delayDecay2",
    label: "Delay 2 decay",
    min: 0.05,
    max: 1,
    step: 0.05,
  },
  {
    id: "delayDecay3",
    label: "Delay 3 decay",
    min: 0.05,
    max: 1,
    step: 0.05,
  },
  {
    id: "irLengthSec",
    label: "IR length (s)",
    min: 0.25,
    max: 8,
    step: 0.25,
    hint: "Regenerates the reverb impulse when changed",
  },
  {
    id: "soxPredelayMs",
    label: "IR pre-delay (ms)",
    min: 0,
    max: 500,
    step: 5,
    hint: "Silence before reverb onset in the IR (not the echo taps)",
  },
  {
    id: "wetGain",
    label: "Wet mix",
    min: 0.05,
    max: 1,
    step: 0.05,
    hint: "Echo recommended. FX stem / Echo at Wet = 1.5× this (capped at 1)",
  },
];

const SOX_FIELDS: Field[] = [
  { id: "soxReverberance", label: "Reverberance", min: 0, max: 100, step: 1 },
  { id: "soxHfDamping", label: "HF damping", min: 0, max: 100, step: 1 },
  { id: "soxRoomScale", label: "Room scale", min: 0, max: 100, step: 1 },
  { id: "soxStereoDepth", label: "Stereo depth", min: 0, max: 100, step: 1 },
  { id: "soxWetGain", label: "IR wet gain (dB)", min: -24, max: 12, step: 1 },
  { id: "tailPadSec", label: "Tail pad (s)", min: 0, max: 4, step: 0.1 },
];

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function AdminVoiceFxPanel() {
  const [draft, setDraft] = useState<AdminVoiceFxSettings | null>(null);
  const [committed, setCommitted] = useState<AdminVoiceFxSettings | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "preview" | "commit" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [wetOnlyUrl, setWetOnlyUrl] = useState<string | null>(null);
  const [showSox, setShowSox] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void listAdminVoiceFx()
      .then((data) => {
        setDraft(data.draft);
        setCommitted(data.committed);
        setDraftDirty(data.draftDirty);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load FX settings"),
      );
  }, []);

  function setField(id: keyof AdminVoiceFxSettings, value: number) {
    setDraft((d) => (d ? { ...d, [id]: value } : d));
    setDraftDirty(true);
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy("save");
    setError(null);
    setStatus(null);
    try {
      const res = await patchAdminVoiceFx(draft);
      setDraft(res.draft);
      setStatus(
        res.irRegenerated
          ? "Draft saved — SoX IR regenerated"
          : "Draft saved",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    if (!draft) return;
    setBusy("preview");
    setError(null);
    setStatus(null);
    try {
      // Apply current form values for this listen only — does not save draft or commit.
      const res = await previewAdminVoiceFx(draft);
      setPreviewUrl(res.previewUrl);
      setWetOnlyUrl(res.wetOnlyUrl);
      setStatus(
        res.timings
          ? `Preview applied (${Math.round(res.timings.totalMs ?? 0)} ms) — not saved`
          : "Preview applied — not saved",
      );
      if (res.previewUrl && audioRef.current) {
        audioRef.current.src = `${res.previewUrl}${res.previewUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
        void audioRef.current.play().catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function runCommit() {
    if (!draft) return;
    const ok = window.confirm(
      "Commit these FX settings? Speaker FX samples will be rebuilt from their dry stems (dry samples are not overwritten). New meditation gens will use this chain when FX is on.",
    );
    if (!ok) return;
    setBusy("commit");
    setError(null);
    setStatus(null);
    try {
      const res = await commitAdminVoiceFx(draft);
      setCommitted(res.committed);
      setDraft(res.committed);
      setDraftDirty(false);
      const failNote =
        res.failed.length > 0 ? ` (${res.failed.length} failed)` : "";
      setStatus(
        `Committed — rebuilt ${res.samplesRebuilt} FX sample(s)${failNote}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-display text-lg font-medium">Voice FX</h2>
      <p className="mt-1 max-w-2xl text-xs text-muted">
        Echo taps → reverb IR → ffmpeg convolution.{" "}
        <strong className="font-medium text-foreground">Apply preview</strong>{" "}
        renders Beatrice with the knobs below (tmp only — does not save). Save
        draft / Commit persist settings; Commit also rebuilds speaker FX stems.
      </p>

      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p className="mt-2 text-xs text-muted">{status}</p> : null}

      {!draft ? (
        <p className="mt-4 text-sm text-muted">Loading FX settings…</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRIMARY_FIELDS.map((f) => (
              <label key={f.id} className="block text-xs font-medium text-muted">
                {f.label}
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={num(draft[f.id], f.min)}
                  onChange={(e) => setField(f.id, Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                {f.hint ? (
                  <span className="mt-1 block font-normal text-[11px] opacity-80">
                    {f.hint}
                  </span>
                ) : null}
              </label>
            ))}
          </div>

          <button
            type="button"
            className="mt-4 text-xs font-medium text-accent-link"
            onClick={() => setShowSox((v) => !v)}
          >
            {showSox ? "Hide" : "Show"} IR advanced
          </button>
          {showSox ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SOX_FIELDS.map((f) => (
                <label
                  key={f.id}
                  className="block text-xs font-medium text-muted"
                >
                  {f.label}
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={num(draft[f.id], f.min)}
                    onChange={(e) => setField(f.id, Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void saveDraft()}
              className="cursor-pointer rounded-full border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void runPreview()}
              className="cursor-pointer rounded-full bg-accent-soft px-4 py-2 text-xs font-semibold text-accent-link disabled:opacity-50"
            >
              {busy === "preview" ? "Rendering…" : "Apply preview"}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void runCommit()}
              className="cursor-pointer rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50"
            >
              {busy === "commit" ? "Committing…" : "Commit settings"}
            </button>
          </div>

          {draftDirty ? (
            <p className="mt-2 text-[11px] text-muted">
              Draft differs from committed — preview uses draft; gens use
              committed until you commit.
            </p>
          ) : null}

          <audio ref={audioRef} controls className="mt-4 w-full max-w-xl" />
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent-link underline"
              >
                Full FX preview
              </a>
            ) : null}
            {wetOnlyUrl ? (
              <a
                href={wetOnlyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent-link underline"
              >
                Wet-only stem
              </a>
            ) : null}
          </div>

          {committed ? (
            <p className="mt-4 text-[11px] text-muted">
              Committed {committed.updatedAt ?? "—"} · delay {committed.delayMs}/
              {committed.delayMs2}/{committed.delayMs3 ?? "—"} ms · IR{" "}
              {committed.irLengthSec}s · wet {committed.wetGain}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
