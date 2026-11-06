import { useCallback, useRef, useState } from "react";
import {
  isVoiceNoteOnDeviceAvailable,
  startVoiceNoteSession,
  voiceNotePlatformLabel,
  type VoiceNoteSession,
} from "@/lib/voice-note";

/**
 * Dev / native Diagnostics → Voice test (Stage 1).
 * Start / Stop / Cancel, live partial, level bar, then play + transcript.
 */
export function VoiceNoteDiagnosticsPanel() {
  const sessionRef = useRef<VoiceNoteSession | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [avail, setAvail] = useState<string>("—");
  const [result, setResult] = useState<{
    localUrl: string;
    durationMs: number;
    transcript: string;
    reason?: string;
    waveform: number[];
  } | null>(null);

  const refreshAvail = useCallback(async () => {
    try {
      const a = await isVoiceNoteOnDeviceAvailable();
      setAvail(
        `${voiceNotePlatformLabel()}: available=${a.available} onDevice=${a.onDevice}`,
      );
    } catch (e) {
      setAvail(e instanceof Error ? e.message : "unavailable");
    }
  }, []);

  const onStart = useCallback(async () => {
    setError(null);
    setResult(null);
    setPartial("");
    setLevel(0);
    setBusy(true);
    try {
      await refreshAvail();
      const session = await startVoiceNoteSession({
        onPartial: setPartial,
        onLevel: setLevel,
      });
      sessionRef.current = session;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }, [refreshAvail]);

  const onStop = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    setBusy(true);
    setRecording(false);
    try {
      const stopped = await session.stop();
      setResult({
        localUrl: stopped.localUrl,
        durationMs: stopped.durationMs,
        transcript: stopped.transcript,
        reason: stopped.reason,
        waveform: stopped.waveform,
      });
      setPartial(stopped.transcript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stop");
    } finally {
      setBusy(false);
      setLevel(0);
    }
  }, []);

  const onCancel = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setRecording(false);
    setPartial("");
    setLevel(0);
    setResult(null);
    if (!session) return;
    try {
      await session.cancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    }
  }, []);

  return (
    <div className="w-full max-w-[min(100%,20rem)] space-y-2 text-left">
      <p className="font-mono text-[11px] leading-snug text-muted">{avail}</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy || recording}
          onClick={() => void onStart()}
          className="h-8 rounded-full border border-border bg-[#FFFDF8] px-3 text-[12px] font-semibold disabled:opacity-50"
        >
          Start
        </button>
        <button
          type="button"
          disabled={busy || !recording}
          onClick={() => void onStop()}
          className="h-8 rounded-full border border-border bg-[#FFFDF8] px-3 text-[12px] font-semibold disabled:opacity-50"
        >
          Stop
        </button>
        <button
          type="button"
          disabled={busy || !recording}
          onClick={() => void onCancel()}
          className="h-8 rounded-full border border-border bg-[#FFFDF8] px-3 text-[12px] font-semibold disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refreshAvail()}
          className="h-8 rounded-full border border-border bg-[#FFFDF8] px-3 text-[12px] font-semibold disabled:opacity-50"
        >
          Check
        </button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-75"
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
      {partial ? (
        <p className="text-[13px] italic leading-snug text-muted">{partial}</p>
      ) : (
        <p className="text-[12px] text-muted/70">Partial text…</p>
      )}
      {result ? (
        <div className="space-y-1.5 rounded-xl border border-border bg-card/80 p-2">
          <audio controls src={result.localUrl} className="w-full" />
          <p className="font-mono text-[11px] text-muted">
            {(result.durationMs / 1000).toFixed(1)}s · wave {result.waveform.length}
            {result.reason ? ` · ${result.reason}` : ""}
          </p>
          <p className="text-[13px] leading-snug text-foreground">
            {result.transcript || "(empty transcript)"}
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
