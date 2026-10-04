import { useEffect, useState } from "react";
import { SettingsSwitch } from "@/components/settings/settings-primitives";
import {
  defaultDevUiSettings,
  fetchDevUiSettings,
  patchDevUiSettings,
  type DevUiSettings,
} from "@/lib/medimade-api";

export function AdminDevUiPanel() {
  const [settings, setSettings] = useState<DevUiSettings>(defaultDevUiSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDevUiSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load settings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: Partial<DevUiSettings>) {
    setBusy(true);
    setError(null);
    setSavedAt(null);
    try {
      const next = await patchDevUiSettings(patch);
      setSettings(next);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Dev UI
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Gates for localhost-only tooling. Off = never shown. On = shown only on
          local/dev hosts (not production).
        </p>
      </header>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {savedAt ? (
        <p className="text-xs text-muted" role="status">
          Saved {savedAt}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="font-display text-lg font-medium">Controls</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="mt-4 space-y-4">
            <li className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Create audio — model / pause / FX
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Dev strip on Create → Sound (Claude Haiku/Sonnet, pause render
                  path, voice FX on/off, emotion/rate/skip-FX checkboxes, and
                  the soundscape volume fader).
                </p>
              </div>
              <SettingsSwitch
                aria-label="Create audio settings — model / pause / FX"
                checked={settings.createAudioDevControls}
                disabled={busy}
                onCheckedChange={(next) =>
                  void save({ createAudioDevControls: next })
                }
              />
            </li>
            <li className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Library — cost flyout
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Dev overlay on library cards showing estimated Fish TTS cost
                  and UTF-8 byte size.
                </p>
              </div>
              <SettingsSwitch
                aria-label="Library — cost flyout"
                checked={settings.libraryDevFlyout}
                disabled={busy}
                onCheckedChange={(next) =>
                  void save({ libraryDevFlyout: next })
                }
              />
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}
