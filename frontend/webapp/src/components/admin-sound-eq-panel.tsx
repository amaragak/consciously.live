import { useEffect, useMemo, useRef, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import {
  SOUNDSCAPE_ELEMENT_VOLUME,
  SPEECH_ELEMENT_VOLUME,
} from "@/lib/bed-volume";
import {
  activeSoundEqBands,
  blankSoundEqBand,
  coerceSoundEqBands,
  heavyPresenceCutPresetBands,
  lightPresenceCutPresetBands,
  toBiquadType,
  type SoundEqBand,
  type SoundEqBandType,
} from "@/lib/sound-eq-bands";
import {
  applyAdminSoundEq,
  listAdminVoice,
  type AdminVoiceSpeaker,
} from "@/lib/medimade-api";
import { speechifySpeakersForPicker } from "@/lib/fish-speakers";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  speakerPreviewLoudFxSampleKey,
  withSpeakerSampleCacheBust,
} from "@/lib/speaker-sample-speed";

type Props = {
  soundKey: string;
  /** CDN URL for streaming AAC (.m4a) — Web Audio preview decodes this. */
  soundUrl: string;
  mediaBaseUrl?: string;
  disabled?: boolean;
  /** Previously applied bands from the catalog (if any). */
  initialBands?: SoundEqBand[] | null;
  onApplied: (meta: {
    streamingEditedAt: string | null;
    bands: SoundEqBand[];
  }) => void;
  /** Pause the card's HTML audio so Web Audio preview is clean. */
  onPreviewStart?: () => void;
  /**
   * If AAC is missing, bake from the WAV master (keeps trim/EQ markers) and
   * return a cache-busted .m4a URL.
   */
  ensureStreamingAacUrl?: () => Promise<string>;
};

function bandsFromInitial(
  initial: SoundEqBand[] | null | undefined,
): SoundEqBand[] {
  const restored = coerceSoundEqBands(initial ?? []);
  return restored.length > 0 ? restored : lightPresenceCutPresetBands();
}

function mediaUrl(base: string | undefined, key: string): string {
  if (!base || !key) return "";
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${b}/${path}`;
}

/** Beds stream as AAC — map accidental WAV/MP3 URLs to the .m4a sibling. */
function aacDecodeUrl(url: string): string {
  return url
    .replace(/\.wav(\?|$)/i, ".m4a$1")
    .replace(/\.mp3(\?|$)/i, ".m4a$1");
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
  initialBands,
  onApplied,
  onPreviewStart,
  ensureStreamingAacUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [bands, setBands] = useState<SoundEqBand[]>(() =>
    bandsFromInitial(initialBands),
  );
  const [bypass, setBypass] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedNote, setAppliedNote] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<AdminVoiceSpeaker[]>([]);
  const [speakerId, setSpeakerId] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bedSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const filterNodesRef = useRef<BiquadFilterNode[]>([]);
  const bedGainRef = useRef<GainNode | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  /** All live sources — stop must kill orphans from overlapping starts. */
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveGainsRef = useRef<Set<GainNode>>(new Set());
  const bedBufferRef = useRef<AudioBuffer | null>(null);
  const voiceBufferRef = useRef<AudioBuffer | null>(null);
  const voiceBufferSpeakerRef = useRef<string>("");
  const previewGenRef = useRef(0);
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
        // Fish lives only on admin /voice — EQ preview is Speechify only.
        const list = speechifySpeakersForPicker(state.speakers).filter(
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

  const initialBandsKey = JSON.stringify(
    (initialBands ?? []).map((b) => [
      b.type,
      b.frequency,
      b.Q,
      b.gain,
      b.enabled !== false,
    ]),
  );
  // Re-hydrate when catalog bands change (e.g. after reload) while closed.
  useEffect(() => {
    if (open) return;
    setBands(bandsFromInitial(initialBands));
  }, [initialBands, initialBandsKey, open, soundKey]);

  useEffect(() => {
    return () => {
      stopPreviewNodes();
    };
  }, []);

  // New bed URL → drop cached decode (WAV→MP3 swap, re-bake bust, etc.).
  useEffect(() => {
    bedBufferRef.current = null;
  }, [soundUrl]);

  const curve = useMemo(() => curvePath(bands, 320, 88), [bands]);

  function ensureCtx(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  async function decodeFetchedUrl(url: string): Promise<AudioBuffer> {
    const ctx = ensureCtx();
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`Could not load audio (${res.status})`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 64) throw new Error("Audio response was empty");
    return ctx.decodeAudioData(buf.slice(0));
  }

  async function decodeBedForPreview(url: string): Promise<AudioBuffer> {
    const target = aacDecodeUrl(url);
    try {
      return await decodeFetchedUrl(target);
    } catch (first) {
      if (!ensureStreamingAacUrl) throw first;
      const bakedUrl = (await ensureStreamingAacUrl()).trim();
      if (!bakedUrl) throw first;
      return decodeFetchedUrl(aacDecodeUrl(bakedUrl));
    }
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

  function stopNode(node: AudioNode | null | undefined) {
    if (!node) return;
    try {
      if ("stop" in node && typeof (node as AudioBufferSourceNode).stop === "function") {
        (node as AudioBufferSourceNode).stop();
      }
    } catch {
      /* already stopped */
    }
    try {
      node.disconnect();
    } catch {
      /* ignore */
    }
  }

  function stopPreviewNodes() {
    for (const src of liveSourcesRef.current) stopNode(src);
    liveSourcesRef.current.clear();
    for (const g of liveGainsRef.current) stopNode(g);
    liveGainsRef.current.clear();
    stopNode(bedSourceRef.current);
    stopNode(voiceSourceRef.current);
    stopNode(bedGainRef.current);
    stopNode(voiceGainRef.current);
    bedSourceRef.current = null;
    voiceSourceRef.current = null;
    bedGainRef.current = null;
    voiceGainRef.current = null;
    for (const n of filterNodesRef.current) stopNode(n);
    filterNodesRef.current = [];
  }

  function stopPreview() {
    previewGenRef.current += 1;
    stopPreviewNodes();
    setPreviewing(false);
  }

  async function startPreview(speakerIdOverride?: string) {
    setError(null);
    if (!soundUrl) {
      setError("No playable audio URL");
      return;
    }
    const activeSpeakerId = (speakerIdOverride ?? speakerId).trim();
    if (!activeSpeakerId) {
      setError("Pick a speaker to preview against");
      return;
    }
    const speaker = speakers.find((s) => s.modelId === activeSpeakerId);
    if (!speaker) {
      setError("Speaker sample not available yet — wait a moment and try again");
      return;
    }

    const gen = ++previewGenRef.current;
    stopPreviewNodes();
    onPreviewStart?.();
    const ctx = ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    if (gen !== previewGenRef.current) return;

    try {
      if (!bedBufferRef.current) {
        bedBufferRef.current = await decodeBedForPreview(soundUrl);
      }
    } catch (e) {
      if (gen !== previewGenRef.current) return;
      bedBufferRef.current = null;
      setError(
        e instanceof Error ? e.message : "Could not decode streaming AAC for EQ preview",
      );
      setPreviewing(false);
      return;
    }
    if (gen !== previewGenRef.current) return;

    // Wet (FX) stem only — dry+wet together comb-filters / phases.
    let voiceBuf = voiceBufferRef.current;
    if (!voiceBuf || voiceBufferSpeakerRef.current !== activeSpeakerId) {
      try {
        const key = speakerPreviewLoudFxSampleKey(
          speaker.modelId,
          FIXED_SPEECH_PREVIEW_SPEED,
          speaker.brand,
        );
        const rawUrl = mediaUrl(mediaBaseUrl, key);
        if (!rawUrl) throw new Error("No media base URL for speaker samples");
        const url = withSpeakerSampleCacheBust(rawUrl) || rawUrl;
        voiceBuf = await decodeFetchedUrl(url);
        if (gen !== previewGenRef.current) return;
        voiceBufferRef.current = voiceBuf;
        voiceBufferSpeakerRef.current = activeSpeakerId;
      } catch (e) {
        if (gen !== previewGenRef.current) return;
        voiceBuf = null;
        voiceBufferRef.current = null;
        voiceBufferSpeakerRef.current = "";
        setError(
          e instanceof Error
            ? e.message
            : "Could not load wet speaker sample (loud-fx)",
        );
        setPreviewing(false);
        return;
      }
    }
    if (gen !== previewGenRef.current) return;

    const bedGain = ctx.createGain();
    bedGain.gain.value = SOUNDSCAPE_ELEMENT_VOLUME;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = SPEECH_ELEMENT_VOLUME;
    const bedSrc = ctx.createBufferSource();
    bedSrc.buffer = bedBufferRef.current;
    bedSrc.loop = true;
    const voiceSrc = ctx.createBufferSource();
    voiceSrc.buffer = voiceBuf;
    voiceSrc.loop = true;

    // Final race check immediately before connecting/starting.
    if (gen !== previewGenRef.current) return;

    liveGainsRef.current.add(bedGain);
    liveGainsRef.current.add(voiceGain);
    liveSourcesRef.current.add(bedSrc);
    liveSourcesRef.current.add(voiceSrc);
    bedGainRef.current = bedGain;
    voiceGainRef.current = voiceGain;
    bedSourceRef.current = bedSrc;
    voiceSourceRef.current = voiceSrc;

    wireFilters(bedSrc, bedGain, !bypassRef.current);
    bedGain.connect(ctx.destination);
    voiceSrc.connect(voiceGain);
    voiceGain.connect(ctx.destination);
    bedSrc.start();
    voiceSrc.start();

    if (gen !== previewGenRef.current) {
      stopPreviewNodes();
      return;
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
        "Apply this EQ to the AAC streaming file (.m4a)? The WAV master is left unchanged so you can re-EQ from it.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setAppliedNote(null);
    stopPreview();
    try {
      const result = await applyAdminSoundEq({
        key: soundKey,
        bands: active,
      });
      bedBufferRef.current = null;
      const restored = coerceSoundEqBands(result.bands);
      if (restored.length > 0) setBands(restored);
      onApplied({
        streamingEditedAt: result.streamingEditedAt,
        bands: restored.length > 0 ? restored : active,
      });
      setAppliedNote("EQ baked into streaming AAC.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "EQ apply failed";
      setError(
        /out of memory|runtime\.outofmemory/i.test(msg)
          ? "EQ bake ran out of memory on a large master — try Bake streaming AAC, or retry."
          : msg,
      );
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
          className="inline-flex items-center gap-1.5 text-left text-sm font-semibold text-foreground"
        >
          EQ
          <SelectChevron direction="right" open={open} />
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
                  const next = e.target.value;
                  setSpeakerId(next);
                  voiceBufferRef.current = null;
                  voiceBufferSpeakerRef.current = "";
                  if (previewing || liveSourcesRef.current.size > 0) {
                    void startPreview(next);
                  }
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
                if (previewing || liveSourcesRef.current.size > 0) {
                  stopPreview();
                } else {
                  void startPreview();
                }
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
              onClick={() => setBands(lightPresenceCutPresetBands())}
              className="h-9 rounded-xl border border-border px-3 text-sm hover:bg-card disabled:opacity-50"
              title="3 kHz peaking, −3 dB"
            >
              Light presence cut
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setBands(heavyPresenceCutPresetBands())}
              className="h-9 rounded-xl border border-border px-3 text-sm hover:bg-card disabled:opacity-50"
              title="3 kHz peaking, −7 dB"
            >
              Heavy presence cut
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
              {busy ? "Applying EQ…" : "Apply EQ to AAC"}
            </button>
            <span className="text-[11px] text-muted">
              Soundscape at default listen level · wet speaker loop on top ·
              Apply writes .m4a only (WAV untouched)
            </span>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {appliedNote ? (
            <p className="text-sm text-foreground">{appliedNote}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
