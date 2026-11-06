/**
 * Live transcription for journal / onboarding voice notes that also record
 * with MediaRecorder.
 *
 * Native: Capgo is intentionally not started alongside MediaRecorder (dual
 * mic ownership hard-crashes iOS). Server Whisper/gpt-transcribe runs on Done.
 * Web: browser SpeechRecognition when available; else server on Done.
 */

import { isNativeApp } from "@/lib/native/native-bridge";

export type OnDeviceSpeechHandle = {
  /** Best live / final transcript so far. */
  getText: () => string;
  stop: () => Promise<void>;
  /** True when this session used a local recognizer (not cloud). */
  usedOnDevice: boolean;
};

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
  // Capitalise sentence starts.
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) =>
    `${a}${b.toUpperCase()}`,
  );
  if (/^[a-z]/.test(s)) s = s[0]!.toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  return s;
}

/**
 * Capgo speech while MediaRecorder also owns the mic has hard-crashed iOS
 * (AVAudioSession). Journal clips need the recorded file, so on native we
 * skip live Capgo here and use server transcription after Done. Dictation
 * that does not also MediaRecorder (see use-native-dictation) can still use
 * Capgo alone.
 */
async function startNativeOnDevice(
  _onPartial: (text: string) => void,
): Promise<OnDeviceSpeechHandle | null> {
  if (!isNativeApp()) return null;
  return null;
}

function startBrowserSpeech(
  onPartial: (text: string) => void,
): OnDeviceSpeechHandle | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) return null;
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
      onPartial(latest);
    };
    rec.onerror = () => {
      /* server fallback on Done */
    };
    rec.onend = () => {
      /* keep last text */
    };
    rec.start();
    return {
      // Browser engines are local enough for “on-device first” on Chrome/Safari.
      usedOnDevice: true,
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
  } catch {
    return null;
  }
}

/**
 * Start the best available local speech engine. Returns null → use server
 * fallback (no live text).
 */
export async function startOnDeviceSpeech(
  onPartial: (text: string) => void,
): Promise<OnDeviceSpeechHandle | null> {
  const native = await startNativeOnDevice(onPartial);
  if (native) return native;
  if (isNativeApp()) {
    // Native without on-device model → server fallback (no live text).
    return null;
  }
  return startBrowserSpeech(onPartial);
}

/** True when this client expects to hit the OpenAI fallback (show allowance). */
export async function willUseServerVoiceFallback(): Promise<boolean> {
  if (isNativeApp()) {
    // Journal native path records via MediaRecorder and transcribes on server
    // (Capgo + recorder dual-mic is unsafe). Always show allowance on native.
    return true;
  }
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return !(w.SpeechRecognition || w.webkitSpeechRecognition);
}
