import { useEffect, useState } from "react";
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
                  Create audio settings — model / pause / FX
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Header toggles on Create → Audio (Claude Haiku/Sonnet, pause
                  render path, voice FX on/off).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.createAudioDevControls}
                disabled={busy}
                onClick={() =>
                  void save({
                    createAudioDevControls: !settings.createAudioDevControls,
                  })
                }
                className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 ${
                  settings.createAudioDevControls
                    ? "bg-accent"
                    : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                    settings.createAudioDevControls
                      ? "translate-x-5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
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
              <button
                type="button"
                role="switch"
                aria-checked={settings.libraryDevFlyout}
                disabled={busy}
                onClick={() =>
                  void save({
                    libraryDevFlyout: !settings.libraryDevFlyout,
                  })
                }
                className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 ${
                  settings.libraryDevFlyout ? "bg-accent" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                    settings.libraryDevFlyout
                      ? "translate-x-5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}
