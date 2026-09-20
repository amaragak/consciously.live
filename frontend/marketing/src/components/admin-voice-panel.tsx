"use client";

import { useEffect, useRef, useState } from "react";
import {
  type AdminVoiceSpeaker,
  deleteAdminVoiceSpeaker,
  generateAdminVoiceSample,
  listAdminVoice,
  patchAdminVoice,
  type VoiceGender,
  type VoiceSpeakerBrand,
} from "@/lib/medimade-api";

const ICON_BTN =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:bg-card disabled:cursor-not-allowed disabled:opacity-40";

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M8 5.14v13.72L19 12 8 5.14z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

export function AdminVoicePanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<AdminVoiceSpeaker[]>([]);
  const [newName, setNewName] = useState("");
  const [newModelId, setNewModelId] = useState("");
  const [newBrand, setNewBrand] = useState<VoiceSpeakerBrand>("fish");
  const [newRate, setNewRate] = useState("-7");
  const [addBusy, setAddBusy] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleProgress, setSampleProgress] = useState<string | null>(null);

  async function load() {
    setError(null);
    const data = await listAdminVoice();
    setSpeakers(data.speakers);
  }

  useEffect(() => {
    void load()
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load voice admin"))
      .finally(() => setLoading(false));
  }, []);

  async function addSpeaker() {
    const name = newName.trim();
    const modelId = newModelId.trim();
    if (!name || !modelId) {
      setError("Name and model id are required");
      return;
    }
    setAddBusy(true);
    setError(null);
    try {
      await patchAdminVoice({
        speaker: {
          name,
          modelId,
          brand: newBrand,
          speechifyRate:
            newBrand === "speechify" ? parseSpeechifyRate(newRate) : null,
          hidden: false,
          sort: speakers.length,
        },
      });
      setNewName("");
      setNewModelId("");
      setNewBrand("fish");
      setNewRate("-7");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add speaker");
    } finally {
      setAddBusy(false);
    }
  }

  async function generateAllSamples() {
    if (speakers.length === 0) return;
    setSampleBusy(true);
    setError(null);
    try {
      for (let i = 0; i < speakers.length; i++) {
        const s = speakers[i];
        setSampleProgress(`${i + 1}/${speakers.length} ${s.name}`);
        await generateAdminVoiceSample(s.modelId);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate samples");
      await load().catch(() => undefined);
    } finally {
      setSampleBusy(false);
      setSampleProgress(null);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      ) : null}
      {loading ? <p className="text-sm text-muted">Loading…</p> : null}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Speakers</h2>
            <p className="mt-1 text-xs text-muted">
              Fish Audio or Speechify. Hidden speakers stay off the Create picker. Generate
              all skips voices that already have dry + FX stems; missing FX-only wet files
              are bounced without re-synthesizing. Use Generate sample on a speaker to
              rebuild the clip.
            </p>
          </div>
          <button
            type="button"
            disabled={sampleBusy || speakers.length === 0}
            onClick={() => void generateAllSamples()}
            className="shrink-0 rounded-xl accent-fill-gradient px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
          >
            {sampleBusy
              ? sampleProgress
                ? `Generating ${sampleProgress}…`
                : "Generating…"
              : "Generate samples"}
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={newBrand}
            onChange={(e) =>
              setNewBrand(e.target.value === "speechify" ? "speechify" : "fish")
            }
            aria-label="Brand"
          >
            <option value="fish">Fish</option>
            <option value="speechify">Speechify</option>
          </select>
          <input
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Speaker name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="min-w-0 flex-[1.4] rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm"
            placeholder={
              newBrand === "speechify" ? "Speechify voice id" : "Fish model id"
            }
            value={newModelId}
            onChange={(e) => setNewModelId(e.target.value)}
          />
          {newBrand === "speechify" ? (
            <input
              className="w-24 rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm"
              type="number"
              min={-50}
              max={50}
              step={1}
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              aria-label="Speechify rate"
              title="Rate percent vs Speechify default"
              placeholder="-7"
            />
          ) : null}
          <button
            type="button"
            disabled={addBusy}
            onClick={() => void addSpeaker()}
            className="rounded-xl accent-fill-gradient px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
          >
            {addBusy ? "Adding…" : "Add speaker"}
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {speakers.map((s) => (
            <SpeakerRow
              key={s.modelId}
              speaker={s}
              generateDisabled={sampleBusy}
              onError={setError}
              onChanged={() => void load()}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function parseSpeechifyRate(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(-50, Math.min(50, Math.round(n)));
}

function joinGoodFor(tags: string[] | undefined): string {
  return (tags ?? []).join(", ");
}

/** Free text in, tags out — no taxonomy is enforced on these. */
function splitGoodFor(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function SpeakerRow({
  speaker,
  generateDisabled,
  onError,
  onChanged,
}: {
  speaker: AdminVoiceSpeaker;
  generateDisabled?: boolean;
  onError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [name, setName] = useState(speaker.name);
  const [modelId, setModelId] = useState(speaker.modelId);
  const [brand, setBrand] = useState<VoiceSpeakerBrand>(
    speaker.brand === "speechify" ? "speechify" : "fish",
  );
  const [description, setDescription] = useState(speaker.description ?? "");
  /** Edited as free text; only split on commas when it is sent. */
  const [goodFor, setGoodFor] = useState(joinGoodFor(speaker.goodFor));
  const [gender, setGender] = useState<VoiceGender | null>(speaker.gender ?? null);
  const [speechifyRate, setSpeechifyRate] = useState(
    speaker.speechifyRate != null ? String(speaker.speechifyRate) : "-7",
  );
  const [hidden, setHidden] = useState(speaker.hidden);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const savedGoodFor = joinGoodFor(speaker.goodFor);

  useEffect(() => {
    setName(speaker.name);
    setModelId(speaker.modelId);
    setBrand(speaker.brand === "speechify" ? "speechify" : "fish");
    setDescription(speaker.description ?? "");
    setGoodFor(savedGoodFor);
    setGender(speaker.gender ?? null);
    setSpeechifyRate(
      speaker.speechifyRate != null ? String(speaker.speechifyRate) : "-7",
    );
    setHidden(speaker.hidden);
  }, [
    speaker.modelId,
    speaker.name,
    speaker.brand,
    speaker.description,
    savedGoodFor,
    speaker.gender,
    speaker.speechifyRate,
    speaker.hidden,
  ]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [speaker.sampleUrl]);

  /** `next` lets a control save the value it just set, ahead of the re-render. */
  async function save(next?: {
    gender?: VoiceGender | null;
    brand?: VoiceSpeakerBrand;
    speechifyRate?: number | null;
    modelId?: string;
    name?: string;
  }) {
    setBusy("save");
    onError(null);
    try {
      await patchAdminVoice({
        speaker: {
          previousModelId: speaker.modelId,
          modelId: (next?.modelId ?? modelId).trim() || speaker.modelId,
          name: (next?.name ?? name).trim() || speaker.name,
          brand: next?.brand ?? brand,
          hidden,
          sort: speaker.sort,
          description,
          goodFor: splitGoodFor(goodFor),
          gender: next?.gender !== undefined ? next.gender : gender,
          speechifyRate:
            next?.speechifyRate !== undefined
              ? next.speechifyRate
              : parseSpeechifyRate(speechifyRate),
        },
      });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save speaker");
    } finally {
      setBusy(null);
    }
  }

  async function generateSample() {
    setBusy("sample");
    onError(null);
    try {
      await generateAdminVoiceSample(speaker.modelId, { force: true });
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not generate sample");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${speaker.name}?`)) return;
    setBusy("delete");
    onError(null);
    try {
      await deleteAdminVoiceSpeaker(speaker.modelId);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete speaker");
    } finally {
      setBusy(null);
    }
  }

  const canPlay = Boolean(speaker.sampleUrl);

  return (
    <li className="rounded-2xl border border-border bg-background p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <input
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium"
            value={name}
            disabled={busy !== null}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== speaker.name) void save({ name: next });
            }}
            aria-label="Speaker name"
          />
          <input
            className="w-full break-all rounded-xl border border-border bg-card px-3 py-2 font-mono text-[11px] text-foreground"
            value={modelId}
            disabled={busy !== null}
            onChange={(e) => setModelId(e.target.value)}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (!next) {
                setModelId(speaker.modelId);
                return;
              }
              setModelId(next);
              if (next !== speaker.modelId) void save({ modelId: next });
            }}
            aria-label="Model id"
            spellCheck={false}
          />
          <label className="block text-xs font-medium text-muted">
            Brand
            <select
              className="mt-1 w-full max-w-xs rounded-xl border border-border bg-card px-3 py-2 text-sm font-normal text-foreground"
              value={brand}
              disabled={busy !== null}
              onChange={(e) => {
                const next =
                  e.target.value === "speechify" ? "speechify" : "fish";
                setBrand(next);
                void save({ brand: next });
              }}
              aria-label="Brand"
            >
              <option value="fish">Fish</option>
              <option value="speechify">Speechify</option>
            </select>
          </label>
          {brand === "speechify" ? (
            <label className="block text-xs font-medium text-muted">
              Rate
              <input
                className="mt-1 w-full max-w-xs rounded-xl border border-border bg-card px-3 py-2 font-mono text-sm font-normal text-foreground"
                type="number"
                min={-50}
                max={50}
                step={1}
                value={speechifyRate}
                disabled={busy !== null}
                onChange={(e) => setSpeechifyRate(e.target.value)}
                onBlur={() => {
                  const next = parseSpeechifyRate(speechifyRate);
                  if (next !== (speaker.speechifyRate ?? null)) {
                    void save({ speechifyRate: next });
                  }
                }}
                aria-label="Speechify rate"
              />
              <span className="mt-1 block text-[11px] font-normal text-muted">
                Percent vs Speechify default. Negative is slower (−7 is a light
                slowdown). Save, then generate the sample.
              </span>
            </label>
          ) : null}
          <label className="block text-xs font-medium text-muted">
            How this voice sounds
            <textarea
              className="mt-1 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm font-normal text-foreground"
              rows={2}
              maxLength={800}
              placeholder="Warm, unhurried, slight rasp — like a late-night radio host."
              value={description}
              disabled={busy !== null}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                const next = description.trim();
                const prev = (speaker.description ?? "").trim();
                if (next !== prev) void save();
              }}
              aria-label="How this voice sounds"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Good for
            <input
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-normal text-foreground"
              maxLength={300}
              placeholder="stories, body scan, sleep"
              value={goodFor}
              disabled={busy !== null}
              onChange={(e) => setGoodFor(e.target.value)}
              onBlur={() => {
                if (goodFor.trim() !== savedGoodFor) void save();
              }}
              aria-label="Meditation types this voice is good for"
            />
            <span className="mt-1 block text-[11px] font-normal text-muted">
              Comma separated. Shown as tag pills; any wording is fine.
            </span>
          </label>
          <fieldset className="text-xs font-medium text-muted">
            <legend>Voice gender</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {(
                [
                  ["male", "Male"],
                  ["female", "Female"],
                  ["", "Not specified"],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={label}
                  className="flex cursor-pointer items-center gap-1.5 font-normal text-foreground"
                >
                  <input
                    type="radio"
                    name={`gender-${speaker.modelId}`}
                    checked={(gender ?? "") === val}
                    disabled={busy !== null}
                    onChange={() => {
                      const next = val === "" ? null : val;
                      setGender(next);
                      void save({ gender: next });
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={hidden}
              disabled={busy !== null}
              onChange={(e) => {
                const next = e.target.checked;
                setHidden(next);
                void patchAdminVoice({
                  speaker: {
                    previousModelId: speaker.modelId,
                    modelId: modelId.trim() || speaker.modelId,
                    name: name.trim() || speaker.name,
                    brand,
                    hidden: next,
                    sort: speaker.sort,
                    description,
                    goodFor: splitGoodFor(goodFor),
                    gender,
                    speechifyRate: parseSpeechifyRate(speechifyRate),
                  },
                })
                  .then(() => onChanged())
                  .catch((err) =>
                    onError(err instanceof Error ? err.message : "Could not update"),
                  );
              }}
            />
            Hide from picker
          </label>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {speaker.sampleUrl ? (
              <audio ref={audioRef} src={speaker.sampleUrl} className="hidden" preload="none" />
            ) : null}
            <button
              type="button"
              className={ICON_BTN}
              disabled={!canPlay}
              aria-label={playing ? "Pause sample" : "Play sample"}
              title={canPlay ? (playing ? "Pause" : "Play") : "No sample yet"}
              onClick={() => {
                const el = audioRef.current;
                if (!el) return;
                if (el.paused) void el.play();
                else el.pause();
              }}
            >
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void remove()}
              aria-label={`Remove ${speaker.name}`}
              title="Remove"
              className={`${ICON_BTN} border-danger/40 text-danger hover:bg-danger-soft dark:border-danger/40 dark:text-danger dark:hover:bg-danger-soft`}
            >
              <IconTrash />
            </button>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void save()}
            className="rounded-lg accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={busy !== null || generateDisabled}
            onClick={() => void generateSample()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card disabled:opacity-50"
          >
            {busy === "sample"
              ? "Generating…"
              : speaker.sampleUrl
                ? "Regenerate sample"
                : "Generate sample"}
          </button>
        </div>
      </div>
    </li>
  );
}
