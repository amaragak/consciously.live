/**
 * Live transcription for journal / onboarding voice notes.
 *
 * Native: Capgo SpeechRecognition alone (no MediaRecorder — dual mic ownership
 * hard-crashes iOS). audioLevel drives the waveform. Clips get audio from a
 * separate MediaRecorder path only when Capgo cannot start.
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
  onPartial: (text: string) => void;
  /** Native Capgo mic level 0..1 for the recording waveform. */
  onLevel?: (level: number) => void;
};

/**
 * Capgo alone owns the mic on native. Do not also start MediaRecorder while
 * this handle is live — that dual-client path hard-crashes iOS.
 */
async function startNativeOnDevice(
  opts: StartOnDeviceSpeechOpts,
): Promise<OnDeviceSpeechHandle | null> {
  if (!isNativeApp()) return null;
  try {
    const { SpeechRecognition } = await import(
      "@capgo/capacitor-speech-recognition"
    );
    const { available } = await SpeechRecognition.available();
    if (!available) {
      writeTranscriptionEngineDiag("server", "Speech recognition unavailable");
      return null;
    }

    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== "granted") {
      perm = await SpeechRecognition.requestPermissions();
    }
    if (perm.speechRecognition !== "granted") {
      writeTranscriptionEngineDiag(
        "server",
        "Speech Recognition permission denied",
      );
      return null;
    }

    const lang = language();
    // Prefer legacy SFSpeechRecognizer + requiresOnDeviceRecognition — more
    // reliable for continuous partials than SpeechAnalyzer on some iOS 26 builds.
    const preferLegacy = true;
    let useOnDevice = false;
    try {
      const check = await SpeechRecognition.isOnDeviceRecognitionAvailable({
        language: lang,
        preferLegacyRecognizer: preferLegacy,
      });
      useOnDevice = check?.available === true;
    } catch {
      useOnDevice = false;
    }
    if (!useOnDevice) {
      writeTranscriptionEngineDiag(
        "server",
        `On-device unavailable for ${lang}`,
      );
      return null;
    }

    let text = "";
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const partial = await SpeechRecognition.addListener(
      "partialResults",
      (e) => {
        const next =
          (e as { accumulatedText?: string }).accumulatedText?.trim() ||
          e.matches?.[0]?.trim() ||
          "";
        if (!next) return;
        text = next;
        opts.onPartial(text);
      },
    );
    handles.push(partial);

    if (opts.onLevel) {
      const level = await SpeechRecognition.addListener("audioLevel", (e) => {
        const n = typeof e.level === "number" ? e.level : 0;
        opts.onLevel?.(Math.max(0, Math.min(1, n)));
      });
      handles.push(level);
    }

    const err = await SpeechRecognition.addListener("error", (e) => {
      writeTranscriptionEngineDiag(
        "server",
        `Capgo error: ${e.code || e.message || "unknown"}`,
      );
    });
    handles.push(err);

    await SpeechRecognition.start({
      language: lang,
      partialResults: true,
      popup: false,
      useOnDeviceRecognition: true,
      preferLegacyRecognizer: preferLegacy,
      addPunctuation: true,
      allowForSilence: 2000,
      muteRecognizerBeep: true,
    } as Parameters<typeof SpeechRecognition.start>[0]);

    writeTranscriptionEngineDiag(
      "on-device",
      `Capgo SFSpeechRecognizer on-device (${lang})`,
    );

    return {
      usedOnDevice: true,
      getText: () => text,
      stop: async () => {
        try {
          await SpeechRecognition.stop();
        } catch {
          /* */
        }
        for (const h of handles) {
          try {
            await h.remove();
          } catch {
            /* */
          }
        }
      },
    };
  } catch (e) {
    writeTranscriptionEngineDiag(
      "server",
      e instanceof Error ? e.message : "Capgo failed to start",
    );
    return null;
  }
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
      onPartial(latest);
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
 * Start the best available local speech engine. Returns null → use server
 * fallback (no live text). On native, Capgo owns the mic — do not also
 * MediaRecorder until this handle has been stopped.
 */
export async function startOnDeviceSpeech(
  onPartialOrOpts: ((text: string) => void) | StartOnDeviceSpeechOpts,
): Promise<OnDeviceSpeechHandle | null> {
  const opts: StartOnDeviceSpeechOpts =
    typeof onPartialOrOpts === "function"
      ? { onPartial: onPartialOrOpts }
      : onPartialOrOpts;
  const native = await startNativeOnDevice(opts);
  if (native) return native;
  if (isNativeApp()) {
    return null;
  }
  return startBrowserSpeech(opts.onPartial);
}

/** True when this client expects to hit the OpenAI fallback (show allowance). */
export async function willUseServerVoiceFallback(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const { SpeechRecognition } = await import(
        "@capgo/capacitor-speech-recognition"
      );
      const { available } = await SpeechRecognition.available();
      if (!available) return true;
      const lang = language();
      const check = await SpeechRecognition.isOnDeviceRecognitionAvailable({
        language: lang,
        preferLegacyRecognizer: true,
      });
      return check?.available !== true;
    } catch {
      return true;
    }
  }
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return !(w.SpeechRecognition || w.webkitSpeechRecognition);
}
