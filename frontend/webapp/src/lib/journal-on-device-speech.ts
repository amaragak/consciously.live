/**
 * Journal voice transcription helpers.
 *
 * Recording uses the browser/WKWebView MediaRecorder (working clip path).
 * Live on-device recognition during recording is paused — it competed for the
 * mic and broke clip audio. After Done, we transcribe the saved file on-device
 * (iOS SFSpeechURLRecognitionRequest / Android file recogniser) with server
 * Whisper as fallback.
 */

import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/native/native-bridge";

export type NativeVoiceCaptureResult = {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  peaks: number[];
  transcript: string;
};

export type OnDeviceSpeechHandle = {
  /** Best live / final transcript so far. */
  getText: () => string;
  /**
   * Stop recognition (and recording when capturesAudio). When capturesAudio,
   * resolves with the written clip + transcript.
   */
  stop: () => Promise<NativeVoiceCaptureResult | void>;
  /** True when this session used a local recognizer (not cloud). */
  usedOnDevice: boolean;
  /** True when stop() returns a real audio file (not a silent placeholder). */
  capturesAudio: boolean;
};

export type TranscriptionEngineDiag = {
  engine: "on-device" | "server" | "none";
  reason: string;
  at: string;
};

const DIAG_KEY = "mm_journal_transcription_engine";

export function readTranscriptionEngineDiag(): TranscriptionEngineDiag | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TranscriptionEngineDiag;
  } catch {
    return null;
  }
}

export function writeTranscriptionEngineDiag(
  engine: TranscriptionEngineDiag["engine"],
  reason: string,
): void {
  if (typeof window === "undefined") return;
  const next: TranscriptionEngineDiag = {
    engine,
    reason,
    at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  try {
    console.info("[journal-voice]", engine, reason);
  } catch {
    /* */
  }
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
};

function language(): string {
  return (
    (typeof navigator !== "undefined" && navigator.language) || "en-US"
  );
}

/** Light punctuation / capitalisation when the engine returns raw tokens. */
export function polishTranscript(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) =>
    `${a}${b.toUpperCase()}`,
  );
  if (/^[a-z]/.test(s)) s = s[0]!.toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  return s;
}

export type StartOnDeviceSpeechOpts = {
  /**
   * Full hypothesis for the *current* recognition segment (replace, never append).
   * When the engine restarts after silence, a new segment begins from "".
   */
  onPartial: (text: string) => void;
  /** Mic level 0..1 for the recording waveform. */
  onLevel?: (level: number) => void;
  /**
   * Fired when a recognition segment ends (silence / restart / stop) so the
   * caller can commit the last partial into an in-memory buffer.
   */
  onSegmentEnd?: () => void;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = typeof r.result === "string" ? r.result : "";
      const i = dataUrl.indexOf(",");
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    r.onerror = () => reject(r.error ?? new Error("Could not read audio"));
    r.readAsDataURL(blob);
  });
}

/**
 * Transcribe a saved recording on-device. Returns null when native / on-device
 * file recognition is unavailable so the caller can use server Whisper.
 */
export async function transcribeAudioBlobOnDevice(
  blob: Blob,
  mimeType: string,
): Promise<string | null> {
  if (!isNativeApp() || !blob || blob.size < 32) return null;
  try {
    const { JournalVoiceCapture } = await import(
      "@consciously/journal-voice-capture"
    );
    const avail = await JournalVoiceCapture.available({ language: language() });
    if (!avail.available || !avail.onDevice) {
      writeTranscriptionEngineDiag(
        "server",
        "On-device file transcription unavailable",
      );
      return null;
    }
    const base64 = await blobToBase64(blob);
    const result = await JournalVoiceCapture.transcribeFile({
      base64,
      mimeType: mimeType || blob.type || "audio/mp4",
      language: language(),
    });
    const text = (result.transcript || "").trim();
    writeTranscriptionEngineDiag(
      "on-device",
      `File transcription (${Capacitor.getPlatform()}, ${language()})`,
    );
    return text || null;
  } catch (e) {
    writeTranscriptionEngineDiag(
      "server",
      e instanceof Error ? e.message : "On-device file transcription failed",
    );
    return null;
  }
}

/*
 * Live on-device recognition during recording is commented out for now.
 * It owned the mic (Capgo / AVAudioEngine) so MediaRecorder got no audio and
 * clips were missing; the live italic preview was also left in the editor.
 *
 * Prefer: MediaRecorder while recording → transcribeAudioBlobOnDevice on Done.
 *
 * Kept below for a future single-engine restore; do not call from the journal
 * editor until clip + live text are proven together again.
 */

async function startNativeVoiceCapture(
  _opts: StartOnDeviceSpeechOpts,
): Promise<OnDeviceSpeechHandle | null> {
  // Live JournalVoiceCapture during record — disabled (mic contention).
  return null;
  /*
  if (!isNativeApp()) return null;
  try {
    const { JournalVoiceCapture } = await import(
      "@consciously/journal-voice-capture"
    );
    ...
  } catch {
    return null;
  }
  */
}

async function startCapgoTextOnly(
  _opts: StartOnDeviceSpeechOpts,
): Promise<OnDeviceSpeechHandle | null> {
  // Capgo live recognition during record — disabled (owned mic, no clip bytes).
  return null;
  /*
  if (!isNativeApp()) return null;
  try {
    const { SpeechRecognition } = await import(
      "@capgo/capacitor-speech-recognition"
    );
    ...
  } catch {
    return null;
  }
  */
}

function startBrowserSpeech(
  onPartial: (text: string) => void,
): OnDeviceSpeechHandle | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) {
    writeTranscriptionEngineDiag("server", "Browser SpeechRecognition missing");
    return null;
  }
  try {
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = language();
    let finalAcc = "";
    let latest = "";
    rec.onresult = (ev: BrowserSpeechRecognitionEvent) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const piece = r?.[0]?.transcript ?? "";
        if (r?.isFinal) finalAcc = `${finalAcc} ${piece}`.trim();
        else interim += piece;
      }
      latest = `${finalAcc} ${interim}`.trim();
      onPartial(interim.trim() ? `${finalAcc} ${interim}`.trim() : finalAcc);
    };
    rec.onerror = () => {
      /* server fallback on Done */
    };
    rec.onend = () => {
      /* keep last text */
    };
    rec.start();
    writeTranscriptionEngineDiag("on-device", "Browser SpeechRecognition");
    return {
      usedOnDevice: true,
      capturesAudio: false,
      getText: () => latest,
      stop: async () => {
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
      },
    };
  } catch (e) {
    writeTranscriptionEngineDiag(
      "server",
      e instanceof Error ? e.message : "Browser speech failed",
    );
    return null;
  }
}

/**
 * @deprecated Live recognition during recording is disabled on native.
 * Web may still use browser SpeechRecognition; journal editor currently
 * skips this entirely (timer + waveform only while recording).
 */
export async function startOnDeviceSpeech(
  onPartialOrOpts: ((text: string) => void) | StartOnDeviceSpeechOpts,
): Promise<OnDeviceSpeechHandle | null> {
  const opts: StartOnDeviceSpeechOpts =
    typeof onPartialOrOpts === "function"
      ? { onPartial: onPartialOrOpts }
      : onPartialOrOpts;
  // Native live path intentionally disabled — see comment block above.
  const capture = await startNativeVoiceCapture(opts);
  if (capture) return capture;
  const capgo = await startCapgoTextOnly(opts);
  if (capgo) return capgo;
  if (isNativeApp()) {
    return null;
  }
  return startBrowserSpeech(opts.onPartial);
}

/** True when this client expects to hit the OpenAI fallback (show allowance). */
export async function willUseServerVoiceFallback(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const { JournalVoiceCapture } = await import(
        "@consciously/journal-voice-capture"
      );
      const avail = await JournalVoiceCapture.available({
        language: language(),
      });
      // File transcription after Done uses the same on-device availability.
      if (avail.available && avail.onDevice) return false;
    } catch {
      /* */
    }
    return true;
  }
  // Web always uses server Whisper after Done (no live browser speech for now).
  return true;
}
