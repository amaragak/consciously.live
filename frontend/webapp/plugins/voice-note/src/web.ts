import { WebPlugin } from "@capacitor/core";
import type {
  VoiceNoteAvailableResult,
  VoiceNotePlugin,
  VoiceNoteStartOptions,
  VoiceNoteStopResult,
} from "./definitions";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>;
  }) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

/**
 * Web: MediaRecorder for the file + browser SpeechRecognition for partials
 * when available (Stage 1 interface parity).
 */
export class VoiceNoteWeb extends WebPlugin implements VoiceNotePlugin {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private levels: number[] = [];
  private levelRaf = 0;
  private speech: BrowserSpeechRecognition | null = null;
  private transcript = "";
  private reason: string | undefined;
  private mime = "audio/webm";

  async isOnDeviceAvailable(): Promise<VoiceNoteAvailableResult> {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    const available = Boolean(
      w.SpeechRecognition || w.webkitSpeechRecognition,
    );
    return { available, onDevice: available };
  }

  async start(options?: VoiceNoteStartOptions): Promise<void> {
    if (this.recorder) throw this.unavailable("Already recording");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw this.unavailable("getUserMedia unavailable");
    }
    this.chunks = [];
    this.levels = [];
    this.transcript = "";
    this.reason = undefined;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    const mime =
      candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    this.mime = mime || "audio/webm";
    this.recorder = mime
      ? new MediaRecorder(this.stream, { mimeType: mime })
      : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.recorder.start(200);
    this.startedAt = Date.now();
    this.startMeter(this.stream);
    this.startSpeech(options?.language);
  }

  async stop(): Promise<VoiceNoteStopResult> {
    if (!this.recorder) throw this.unavailable("Not recording");
    const rec = this.recorder;
    this.recorder = null;
    this.stopMeter();
    this.stopSpeech();
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const blob = new Blob(this.chunks, { type: this.mime });
    this.chunks = [];
    const filePath = URL.createObjectURL(blob);
    const durationMs = Math.max(1, Date.now() - this.startedAt);
    const waveform = downsample(this.levels, 60);
    this.levels = [];
    return {
      filePath,
      durationMs,
      transcript: this.transcript.trim(),
      waveform,
      reason: this.reason,
    };
  }

  async cancel(): Promise<void> {
    if (!this.recorder) return;
    this.stopMeter();
    this.stopSpeech();
    try {
      this.recorder.stop();
    } catch {
      /* */
    }
    this.recorder = null;
    this.chunks = [];
    this.levels = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private startMeter(stream: MediaStream) {
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
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastEmit = 0;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
        const level = Math.min(1, (sum / (data.length * 255)) * 2.2);
        this.levels.push(level);
        const now = performance.now();
        if (now - lastEmit >= 50) {
          lastEmit = now;
          void this.notifyListeners("level", { level });
        }
        this.levelRaf = requestAnimationFrame(tick);
      };
      this.levelRaf = requestAnimationFrame(tick);
      void ctx;
    } catch {
      /* */
    }
  }

  private stopMeter() {
    if (this.levelRaf) cancelAnimationFrame(this.levelRaf);
    this.levelRaf = 0;
  }

  private startSpeech(language?: string) {
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      this.reason = "browser-speech-unavailable";
      return;
    }
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = language || navigator.language || "en-US";
      let finalAcc = "";
      rec.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const piece = r?.[0]?.transcript ?? "";
          if (r?.isFinal) finalAcc = `${finalAcc} ${piece}`.trim();
          else interim += piece;
        }
        this.transcript = `${finalAcc} ${interim}`.trim();
        void this.notifyListeners("partial", { text: this.transcript });
      };
      rec.onerror = () => {
        this.reason = this.reason || "browser-speech-error";
      };
      rec.onend = () => {
        /* keep last */
      };
      rec.start();
      this.speech = rec;
    } catch {
      this.reason = "browser-speech-failed";
    }
  }

  private stopSpeech() {
    const rec = this.speech;
    this.speech = null;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        /* */
      }
    }
  }
}

function downsample(levels: number[], n: number): number[] {
  if (!levels.length) return Array.from({ length: n }, () => 0.12);
  if (levels.length <= n) return levels.slice();
  const out: number[] = [];
  const step = levels.length / n;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, levels[j] ?? 0);
    out.push(peak);
  }
  return out;
}
