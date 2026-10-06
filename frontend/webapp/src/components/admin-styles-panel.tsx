import { useEffect, useMemo, useRef, useState } from "react";
import { SpeechifySpeakerSelect } from "@/components/speechify-speaker-select";
import { VoicePreferredTraitFields } from "@/components/voice-trait-radios";
import {
  coercePreferredSpeakers,
  coerceVoicePrefs,
  emptyVoicePrefs,
  getMedimadeMediaBaseUrl,
  listAdminVoice,
  patchAdminVoice,
  PREFERRED_SPEAKER_SLOT_COUNT,
  type AdminVoiceSpeaker,
  type VoicePreferredTraits,
} from "@/lib/medimade-api";
import { MEDITATION_STYLE_LABELS } from "@/lib/meditation-style-intake";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  speakerPreviewLoudFxSampleKey,
  withSpeakerSampleCacheBust,
} from "@/lib/speaker-sample-speed";

function mediaFileUrl(base: string, key: string): string {
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${b}/${path}`;
}

function speakerSlots(prefs: VoicePreferredTraits): string[] {
  const slots = [...prefs.speakers];
  while (slots.length < PREFERRED_SPEAKER_SLOT_COUNT) slots.push("");
  return slots.slice(0, PREFERRED_SPEAKER_SLOT_COUNT);
}

export function AdminStylesPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, VoicePreferredTraits>>({});
  const [speakers, setSpeakers] = useState<AdminVoiceSpeaker[]>([]);
  const [mediaBaseUrl, setMediaBaseUrl] = useState<string | null>(null);
  const [busyStyle, setBusyStyle] = useState<string | null>(null);
  const [playingSpeakerId, setPlayingSpeakerId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intendedPlayIdRef = useRef<string | null>(null);

  async function reload() {
    const data = await listAdminVoice();
    setPrefs(data.styleVoicePrefs);
    setSpeakers(data.speakers ?? []);
    setMediaBaseUrl(data.baseUrl?.trim() || getMedimadeMediaBaseUrl());
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await reload();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load styles");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, []);

  const speakerOptions = useMemo(() => {
    return [...speakers]
      .filter((s) => !s.hidden && s.brand === "speechify")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [speakers]);

  function stopPreview() {
    intendedPlayIdRef.current = null;
    audioRef.current?.pause();
    setPlayingSpeakerId(null);
  }

  async function toggleSpeakerPreview(modelId: string) {
    const id = modelId.trim();
    const el = audioRef.current;
    if (!el || !id) return;
    if (intendedPlayIdRef.current === id && !el.paused) {
      stopPreview();
      return;
    }
    const speaker = speakers.find((s) => s.modelId === id);
    const constructed =
      mediaBaseUrl &&
      withSpeakerSampleCacheBust(
        mediaFileUrl(
          mediaBaseUrl,
          speakerPreviewLoudFxSampleKey(
            id,
            FIXED_SPEECH_PREVIEW_SPEED,
            speaker?.brand,
          ),
        ),
        null,
      );
    const next = speaker?.sampleUrl?.trim() || constructed;
    if (!next) return;
    intendedPlayIdRef.current = id;
    if (el.src !== next) {
      el.src = next;
      void el.load();
    }
    try {
      await el.play();
      setPlayingSpeakerId(id);
    } catch {
      intendedPlayIdRef.current = null;
      setPlayingSpeakerId(null);
    }
  }

  async function saveStyle(style: string, next: VoicePreferredTraits) {
    setBusyStyle(style);
    setError(null);
    const saved: VoicePreferredTraits = {
      ...next,
      speakers: coercePreferredSpeakers(next.speakers),
    };
    setPrefs((cur) => ({ ...cur, [style]: saved }));
    try {
      const data = await patchAdminVoice({
        styleVoicePrefs: { [style]: saved },
      });
      if (data.styleVoicePrefs) setPrefs(data.styleVoicePrefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save style");
      try {
        await reload();
      } catch {
        /* keep optimistic */
      }
    } finally {
      setBusyStyle(null);
    }
  }

  function traitsFor(style: string): VoicePreferredTraits {
    return coerceVoicePrefs(prefs[style] ?? emptyVoicePrefs());
  }

  function setSpeakerSlot(style: string, slot: number, modelId: string) {
    const t = traitsFor(style);
    const slots = speakerSlots(t);
    slots[slot] = modelId;
    void saveStyle(style, {
      ...t,
      speakers: coercePreferredSpeakers(slots),
    });
    if (playingSpeakerId && playingSpeakerId === t.speakers[slot]) {
      stopPreview();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl text-foreground">Meditation styles</h1>
        <p className="mt-1 text-sm text-muted">
          Preferred speakers (up to three, in order) plus energy, pitch, gender,
          and accent. Create Sound uses the first listed speaker when present,
          then ranks the rest by closest trait match.
        </p>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => {
          intendedPlayIdRef.current = null;
          setPlayingSpeakerId(null);
        }}
        onPause={() => {
          if (intendedPlayIdRef.current == null) setPlayingSpeakerId(null);
        }}
      />
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {MEDITATION_STYLE_LABELS.map((style) => {
            const t = traitsFor(style);
            const busy = busyStyle === style;
            const slots = speakerSlots(t);
            const taken = new Set(slots.filter(Boolean));
            return (
              <li
                key={style}
                className="rounded-2xl border border-border bg-background p-3 sm:p-4"
              >
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  {style}
                </h2>
                <div className="mb-4">
                  <p className="mb-1.5 text-xs font-medium text-muted">
                    Preferred voices
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {slots.map((modelId, i) => {
                      const options = speakerOptions.filter(
                        (s) => s.modelId === modelId || !taken.has(s.modelId),
                      );
                      if (
                        modelId &&
                        !options.some((s) => s.modelId === modelId)
                      ) {
                        const extra = speakers.find((s) => s.modelId === modelId);
                        if (extra) options.unshift(extra);
                      }
                      return (
                        <div key={`${style}-voice-${i}`} className="min-w-0">
                          <span className="mb-1 block text-[11px] text-muted">
                            Voice {i + 1}
                          </span>
                          <SpeechifySpeakerSelect
                            value={modelId}
                            disabled={busy}
                            playingId={playingSpeakerId}
                            options={options.map((s) => ({
                              modelId: s.modelId,
                              name: s.name,
                              brand: s.brand,
                              canPlay: Boolean(s.sampleUrl || mediaBaseUrl),
                            }))}
                            onChange={(next) => setSpeakerSlot(style, i, next)}
                            onTogglePlay={(id) => void toggleSpeakerPreview(id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <VoicePreferredTraitFields
                  id={style}
                  energy={t.energy}
                  pitch={t.pitch}
                  gender={t.gender}
                  accent={t.accent}
                  disabled={busy}
                  onEnergy={(energy) => void saveStyle(style, { ...t, energy })}
                  onPitch={(pitch) => void saveStyle(style, { ...t, pitch })}
                  onGender={(gender) => void saveStyle(style, { ...t, gender })}
                  onAccent={(accent) => void saveStyle(style, { ...t, accent })}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
