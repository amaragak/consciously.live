import { useCallback, useEffect, useRef, useState } from "react";
import {
  polishTranscript,
  startOnDeviceSpeech,
  type OnDeviceSpeechHandle,
} from "@/lib/journal-on-device-speech";
import { transcribeJournalAudio } from "@/lib/medimade-api";

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = typeof r.result === "string" ? r.result : "";
      const i = s.indexOf(",");
      resolve(i === -1 ? s : s.slice(i + 1));
    };
    r.onerror = () => reject(r.error ?? new Error("Could not read recording"));
    r.readAsDataURL(blob);
  });
}

export function appendSpokenText(existing: string, spoken: string): string {
  const piece = spoken.trim();
  if (!piece) return existing;
  if (!existing) return piece;
  if (/\s$/.test(existing)) return `${existing}${piece}`;
  return `${existing} ${piece}`;
}

export function useWhisperDictation() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Smoothed 0–1 input level while recording (for waveforms). */
  const [level, setLevel] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const smoothLevelRef = useRef(0);
  const onDeviceRef = useRef<OnDeviceSpeechHandle | null>(null);
  const durationSecRef = useRef(0);
  const durationTimerRef = useRef<number | null>(null);

  const stopLevelMeter = useCallback(() => {
    if (levelRafRef.current != null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    analyserRef.current = null;
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* */
    }
    audioCtxRef.current = null;
    smoothLevelRef.current = 0;
    setLevel(0);
  }, []);

  const startLevelMeter = useCallback(
    (stream: MediaStream) => {
      stopLevelMeter();
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          const a = analyserRef.current;
          if (!a) return;
          a.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const target = Math.min(1, rms * 3.2);
          smoothLevelRef.current =
            smoothLevelRef.current * 0.72 + target * 0.28;
          setLevel(smoothLevelRef.current);
          levelRafRef.current = requestAnimationFrame(tick);
        };
        levelRafRef.current = requestAnimationFrame(tick);
      } catch {
        /* level optional */
      }
    },
    [stopLevelMeter],
  );

  const releaseStream = useCallback(() => {
    stopLevelMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopLevelMeter]);

  const collectBlob = useCallback(async (): Promise<Blob | null> => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") {
      releaseStream();
      return null;
    }
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    recRef.current = null;
    releaseStream();
    const parts = chunksRef.current;
    chunksRef.current = [];
    if (!parts.length) return null;
    return new Blob(parts, { type: (parts[0] as Blob).type || "audio/webm" });
  }, [releaseStream]);

  useEffect(() => {
    return () => {
      if (recRef.current?.state === "recording") recRef.current.stop();
      recRef.current = null;
      chunksRef.current = [];
      stopLevelMeter();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [stopLevelMeter]);

  const start = useCallback(async () => {
    setError(null);
    if (busy) return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.start(200);
      startLevelMeter(stream);
      durationSecRef.current = 0;
      if (durationTimerRef.current != null) {
        window.clearInterval(durationTimerRef.current);
      }
      durationTimerRef.current = window.setInterval(() => {
        durationSecRef.current += 1;
        // Onboarding talk server cap: 20 minutes.
        if (durationSecRef.current >= 20 * 60) {
          /* caller should stop; keep recording until stopAndTranscribe */
        }
      }, 1000);
      void startOnDeviceSpeech(() => {
        /* live text optional for onboarding fields */
      }).then((h) => {
        onDeviceRef.current = h;
      });
      setRecording(true);
    } catch (e) {
      releaseStream();
      setError(e instanceof Error ? e.message : "Could not access microphone");
    }
  }, [busy, releaseStream, startLevelMeter]);

  const cancel = useCallback(async () => {
    setRecording(false);
    setError(null);
    if (durationTimerRef.current != null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    const od = onDeviceRef.current;
    onDeviceRef.current = null;
    if (od) void od.stop();
    await collectBlob();
  }, [collectBlob]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (busy) return null;
    setError(null);
    setBusy(true);
    setRecording(false);
    if (durationTimerRef.current != null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    const od = onDeviceRef.current;
    onDeviceRef.current = null;
    const live = polishTranscript(od?.getText() ?? "");
    if (od) await od.stop();
    try {
      const blob = await collectBlob();
      if (!blob) {
        setError("No audio captured.");
        return null;
      }
      if (blob.size < 256) {
        setError("Recording too short.");
        return null;
      }
      if (live && od?.usedOnDevice) {
        return live;
      }
      const audioBase64 = await blobToBase64(blob);
      const { text, deferred } = await transcribeJournalAudio({
        audioBase64,
        mimeType: blob.type || "audio/webm",
        durationSec: durationSecRef.current,
        feature: "onboarding-transcribe",
      });
      if (deferred) {
        setError("Voice allowance used up for this month.");
        return null;
      }
      const spoken = polishTranscript(text || "");
      if (!spoken) {
        setError("No speech detected.");
        return null;
      }
      return spoken;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy, collectBlob]);

  return { recording, busy, error, level, start, cancel, stopAndTranscribe };
}
