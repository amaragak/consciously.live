import { useEffect, useState } from "react";
import { VoicePreferredTraitFields } from "@/components/voice-trait-radios";
import {
  coerceVoicePrefs,
  emptyVoicePrefs,
  listAdminVoice,
  patchAdminVoice,
  type VoicePreferredTraits,
} from "@/lib/medimade-api";
import { MEDITATION_STYLE_LABELS } from "@/lib/meditation-style-intake";

export function AdminStylesPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, VoicePreferredTraits>>({});
  const [busyStyle, setBusyStyle] = useState<string | null>(null);

  async function reload() {
    const data = await listAdminVoice();
    setPrefs(data.styleVoicePrefs);
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
    };
  }, []);

  async function saveStyle(style: string, next: VoicePreferredTraits) {
    setBusyStyle(style);
    setError(null);
    setPrefs((cur) => ({ ...cur, [style]: next }));
    try {
      const data = await patchAdminVoice({
        styleVoicePrefs: { [style]: next },
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl text-foreground">Meditation styles</h1>
        <p className="mt-1 text-sm text-muted">
          Preferred voice energy, pitch, gender, and accent. Create Sound ranks
          voices by closest match when this style is the format.
        </p>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {MEDITATION_STYLE_LABELS.map((style) => {
            const t = traitsFor(style);
            const busy = busyStyle === style;
            return (
              <li
                key={style}
                className="rounded-2xl border border-border bg-background p-3 sm:p-4"
              >
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  {style}
                </h2>
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
