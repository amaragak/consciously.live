import { useEffect, useMemo, useRef, useState } from "react";
import {
  SOUNDSCAPE_ELEMENT_VOLUME,
  SPEECH_ELEMENT_VOLUME,
} from "@/lib/bed-volume";
import {
  activeSoundEqBands,
  blankSoundEqBand,
  presenceCutPresetBands,
  toBiquadType,
  type SoundEqBand,
  type SoundEqBandType,
} from "@/lib/sound-eq-bands";
import {
  applyAdminSoundEq,
  listAdminVoice,
  type AdminVoiceSpeaker,
} from "@/lib/medimade-api";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  speakerPreviewLoudDrySampleKey,
} from "@/lib/speaker-sample-speed";

type Props = {
  soundKey: string;
  /** CDN URL for the public / original audition file. */
  soundUrl: string;
  mediaBaseUrl?: string;
  disabled?: boolean;
  onApplied: () => void;
  /** Pause the card's HTML audio so Web Audio preview is clean. */
  onPreviewStart?: () => void;
};

function mediaUrl(base: string | undefined, key: string): string {
  if (!base || !key) return "";
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${b}/${path}`;
}

function buildLogFreqs(n = 128): Float32Array {
  const out = new Float32Array(n);
  const min = Math.log10(20);
  const max = Math.log10(20000);
  for (let i = 0; i < n; i += 1) {
    out[i] = 10 ** (min + ((max - min) * i) / (n - 1));
  }
  return out;
}

function curvePath(bands: SoundEqBand[], width: number, height: number): string {
  if (typeof OfflineAudioContext === "undefined") return "";
  const freqs = buildLogFreqs(160);
  const mags = new Float32Array(freqs.length);
  mags.fill(1);
  const phase = new Float32Array(freqs.length);
  const ctx = new OfflineAudioContext(1, 128, 44100);
  for (const band of activeSoundEqBands(bands)) {
    const f = ctx.createBiquadFilter();
    f.type = toBiquadType(band.type);
    f.frequency.value = band.frequency;
    f.Q.value = band.Q;
    if (band.type !== "lowpass" && band.type !== "highpass") {
      f.gain.value = band.gain;
    }
    const mag = new Float32Array(freqs.length);
    f.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < mags.length; i += 1) mags[i]! *= mag[i]!;
  }
  const db = Array.from(mags, (m) => 20 * Math.log10(Math.max(m, 1e-6)));
  const minDb = -18;
  const maxDb = 12;
  const pts: string[] = [];
  for (let i = 0; i < freqs.length; i += 1) {
    const x =
      (Math.log10(freqs[i]!) - Math.log10(20)) /
      (Math.log10(20000) - Math.log10(20));
    const y = 1 - (db[i]! - minDb) / (maxDb - minDb);
    const px = x * width;
    const py = Math.min(height - 1, Math.max(0, y * height));
    pts.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return pts.join(" ");
}

export function AdminSoundEqPanel({
  soundKey,
  soundUrl,
  mediaBaseUrl,
  disabled = false,
  onApplied,
  onPreviewStart,
}: Props) {
  const [open, setOpen] = useState(false);
  const [bands, setBands] = useState<SoundEqBand[]>(() => presenceCutPresetBands());
  const [bypass, setBypass] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<AdminVoiceSpeaker[]>([]);
  const [speakerId, setSpeakerId] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bedSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const filterNodesRef = useRef<BiquadFilterNode[]>([]);
  const bedGainRef = useRef<GainNode | null>(null);
  const bedBufferRef = useRef<AudioBuffer | null>(null);
  const voiceBufferRef = useRef<AudioBuffer | null>(null);
  const voiceBufferSpeakerRef = useRef<string>("");
  const bandsRef = useRef(bands);
  const bypassRef = useRef(bypass);
  bandsRef.current = bands;
  bypassRef.current = bypass;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listAdminVoice()
      .then((state) => {
        if (cancelled) return;
        const list = state.speakers.filter(
          (s) => !s.hidden && (s.hasSample || s.sampleUrl),
        );
        setSpeakers(list);
        setSpeakerId((prev) => {
          if (prev && list.some((s) => s.modelId === prev)) return prev;
          return list[0]?.modelId ?? "";
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      stopPreviewNodes();
    };
  }, []);

  const curve = useMemo(() => curvePath(bands, 320, 88), [bands]);

  function ensureCtx(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  async function decodeUrl(url: string): Promise<AudioBuffer> {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`Could not load audio (${res.status})`);
    const buf = await res.arrayBuffer();
    const ctx = ensureCtx();
    return ctx.decodeAudioData(buf.slice(0));
  }

  function wireFilters(from: AudioNode, to: AudioNode, useEq: boolean) {
    for (const n of filterNodesRef.current) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    filterNodesRef.current = [];
    if (!useEq) {
      from.connect(to);
      return;
    }
    const ctx = ensureCtx();
    const active = activeSoundEqBands(bandsRef.current);
    if (active.length === 0) {
      from.connect(to);
      return;
    }
    let prev: AudioNode = from;
    for (const band of active) {
      const f = ctx.createBiquadFilter();
      f.type = toBiquadType(band.type);
      f.frequency.value = band.frequency;
      f.Q.value = band.Q;
      if (band.type !== "lowpass" && band.type !== "highpass") {
        f.gain.value = band.gain;
      }
      prev.connect(f);
      filterNodesRef.current.push(f);
      prev = f;
    }
    prev.connect(to);
  }

  function stopPreviewNodes() {
    try {
      bedSourceRef.current?.stop();
    } catch {
      /* ignore */
    }
    try {
      voiceSourceRef.current?.stop();
    } catch {
      /* ignore */
    }
    bedSourceRef.current = null;
    voiceSourceRef.current = null;
    for (const n of filterNodesRef.current) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    filterNodesRef.current = [];
  }

  function stopPreview() {
    stopPreviewNodes();
    setPreviewing(false);
  }

  async function startPreview() {
    setError(null);
    if (!soundUrl) {
      setError("No playable audio URL");
      return;
    }
    stopPreviewNodes();
    onPreviewStart?.();
    const ctx = ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();

    try {
      if (!bedBufferRef.current) {
        bedBufferRef.current = await decodeUrl(soundUrl);
      }
    } catch (e) {
      bedBufferRef.current = null;
      setError(e instanceof Error ? e.message : "Could not decode soundscape");
      setPreviewing(false);
      return;
    }

    const speaker = speakers.find((s) => s.modelId === speakerId);
    let voiceBuf = voiceBufferRef.current;
    if (
      speaker &&
      (!voiceBuf || voiceBufferSpeakerRef.current !== speakerId)
    ) {
      try {
        const key = speakerPreviewLoudDrySampleKey(
          speaker.modelId,
          FIXED_SPEECH_PREVIEW_SPEED,
          speaker.brand,
        );
        const url = speaker.sampleUrl?.trim() || mediaUrl(mediaBaseUrl, key);
        voiceBuf = await decodeUrl(url);
        voiceBufferRef.current = voiceBuf;
        voiceBufferSpeakerRef.current = speakerId;
      } catch {
        voiceBuf = null;
        voiceBufferRef.current = null;
        voiceBufferSpeakerRef.current = "";
      }
    }

    const bedGain = ctx.createGain();
    bedGain.gain.value = SOUNDSCAPE_ELEMENT_VOLUME;
    bedGainRef.current = bedGain;

    const bedSrc = ctx.createBufferSource();
    bedSrc.buffer = bedBufferRef.current;
    bedSrc.loop = true;
    wireFilters(bedSrc, bedGain, !bypassRef.current);
    bedGain.connect(ctx.destination);
    bedSrc.start();
    bedSourceRef.current = bedSrc;

    if (voiceBuf) {
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = SPEECH_ELEMENT_VOLUME;
      const voiceSrc = ctx.createBufferSource();
      voiceSrc.buffer = voiceBuf;
      voiceSrc.loop = true;
      voiceSrc.connect(voiceGain);
      voiceGain.connect(ctx.destination);
      voiceSrc.start();
      voiceSourceRef.current = voiceSrc;
    }

    setPreviewing(true);
  }

  // Live-update filters while previewing when bands / bypass change.
  useEffect(() => {
    if (!previewing || !bedSourceRef.current || !bedGainRef.current) return;
    try {
      bedSourceRef.current.disconnect();
    } catch {
      /* ignore */
    }
    wireFilters(bedSourceRef.current, bedGainRef.current, !bypass);
  }, [bands, bypass, previewing]);

  function updateBand(id: string, patch: Partial<SoundEqBand>) {
    setBands((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  async function onApply() {
    const active = activeSoundEqBands(bands);
    if (active.length === 0) {
      setError("Enable at least one band with a non-zero change");
      return;
    }
    if (
      !window.confirm(
        "Apply this EQ to the sound file? This rewrites the public audio (original archive is kept).",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    stopPreview();
    try {
      await applyAdminSoundEq({
        key: soundKey,
        bands: active,
      });
      bedBufferRef.current = null;
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "EQ apply failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (open) stopPreview();
            setOpen((v) => !v);
          }}
          className="text-left text-sm font-semibold text-foreground"
        >
          EQ {open ? "▾" : "▸"}
        </button>
        <span className="text-[11px] text-muted">
          Preview with a looping speaker before committing
        </span>
      </div>
      {open ? (
        <div className="mt-3 space-y-3">
          <svg
            viewBox="0 0 320 88"
            className="h-24 w-full rounded-lg border border-border bg-card"
            role="img"
            aria-label="EQ frequency response"
          >
            <line
              x1="0"
              y1="58.7"
              x2="320"
              y2="58.7"
              stroke="currentColor"
              className="text-border"
              strokeWidth="1"
            />
            <path
              d={curve}
              fill="none"
              stroke="currentColor"
              className="text-accent-link"
              strokeWidth="1.5"
            />
            <text x="4" y="12" className="fill-muted text-[8px]">
              +12 dB
            </text>
            <text x="4" y="62" className="fill-muted text-[8px]">
              0
            </text>
            <text x="4" y="84" className="fill-muted text-[8px]">
              −18
            </text>
            <text x="280" y="84" className="fill-muted text-[8px]">
              20k
            </text>
          </svg>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Speaker loop
              <select
                value={speakerId}
                disabled={disabled || busy || speakers.length === 0}
                onChange={(e) => {
                  setSpeakerId(e.target.value);
                  voiceBufferRef.current = null;
                  voiceBufferSpeakerRef.current = "";
                  if (previewing) void startPreview();
                }}
                className="h-9 rounded-xl border border-border bg-card px-2 text-sm text-foreground outline-none"
              >
                {speakers.length === 0 ? (
                  <option value="">No samples</option>
                ) : (
                  speakers.map((s) => (
                    <option key={s.modelId} value={s.modelId}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              disabled={disabled || busy || !soundUrl}
              onClick={() => {
                if (previewing) stopPreview();
                else void startPreview();
              }}
              className="h-9 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-card disabled:opacity-50"
            >
              {previewing ? "Stop preview" : "Preview EQ"}
            </button>
            <label className="flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm">
              <input
                type="checkbox"
                checked={bypass}
                onChange={(e) => setBypass(e.target.checked)}
                className="accent-[var(--accent-button)]"
              />
              Bypass EQ
            </label>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setBands(presenceCutPresetBands())}
              className="h-9 rounded-xl border border-border px-3 text-sm hover:bg-card disabled:opacity-50"
            >
              Presence cut
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() =>
                setBands((prev) => [...prev, blankSoundEqBand()])
              }
              className="h-9 rounded-xl border border-border px-3 text-sm hover:bg-card disabled:opacity-50"
            >
              Add band
            </button>
          </div>

          <ul className="space-y-2">
            {bands.map((band) => (
              <li
                key={band.id}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-2"
              >
                <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={band.enabled}
                    onChange={(e) =>
                      updateBand(band.id, { enabled: e.target.checked })
                    }
                    className="accent-[var(--accent-button)]"
                  />
                  On
                </label>
                <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
                  Type
                  <select
                    value={band.type}
                    onChange={(e) =>
                      updateBand(band.id, {
                        type: e.target.value as SoundEqBandType,
                      })
                    }
                    className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="peaking">Peaking</option>
                    <option value="lowshelf">Low shelf</option>
                    <option value="highshelf">High shelf</option>
                    <option value="highpass">High-pass</option>
                    <option value="lowpass">Low-pass</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
                  Hz
                  <input
                    type="number"
                    min={20}
                    max={20000}
                    step={1}
                    value={band.frequency}
                    onChange={(e) =>
                      updateBand(band.id, {
                        frequency: Number(e.target.value) || 20,
                      })
                    }
                    className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
                  Q
                  <input
                    type="number"
                    min={0.1}
                    max={40}
                    step={0.1}
                    value={band.Q}
                    onChange={(e) =>
                      updateBand(band.id, { Q: Number(e.target.value) || 0.1 })
                    }
                    className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                </label>
                {band.type !== "lowpass" && band.type !== "highpass" ? (
                  <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
                    Gain dB
                    <input
                      type="number"
                      min={-24}
                      max={24}
                      step={0.5}
                      value={band.gain}
                      onChange={(e) =>
                        updateBand(band.id, {
                          gain: Number(e.target.value) || 0,
                        })
                      }
                      className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-sm"
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setBands((prev) => prev.filter((b) => b.id !== band.id))
                  }
                  className="h-8 rounded-lg border border-border px-2 text-xs text-muted hover:text-foreground"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                disabled || busy || activeSoundEqBands(bands).length === 0
              }
              onClick={() => void onApply()}
              className="rounded-xl accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {busy ? "Applying EQ…" : "Apply EQ to file"}
            </button>
            <span className="text-[11px] text-muted">
              Soundscape at default listen level · speaker dry loop on top ·
              nothing written until Apply
            </span>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
