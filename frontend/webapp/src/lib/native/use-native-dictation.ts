/**
 * On-device dictation for signed-out native screens (server Whisper needs a
 * session). Uses the OS speech recognizer via @capgo/capacitor-speech-recognition.
 */
import { SpeechRecognition } from "@capgo/capacitor-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";

export function useNativeDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const partial = SpeechRecognition.addListener("partialResults", (e) => {
      const text = e.matches?.[0]?.trim();
      if (text) onTextRef.current(text);
    });
    const state = SpeechRecognition.addListener("listeningState", (e) => {
      if (e.state === "stopped") setListening(false);
      if (e.state === "started") setListening(true);
    });
    return () => {
      void partial.then((h) => h.remove());
      void state.then((h) => h.remove());
      void SpeechRecognition.stop().catch(() => undefined);
    };
  }, []);

  const toggle = useCallback(async () => {
    setError(null);
    if (listening) {
      await SpeechRecognition.stop().catch(() => undefined);
      setListening(false);
      return;
    }
    try {
      const { available } = await SpeechRecognition.available();
      if (!available) {
        setError("Dictation isn’t available on this device.");
        return;
      }
      let perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== "granted") {
        perm = await SpeechRecognition.requestPermissions();
      }
      if (perm.speechRecognition !== "granted") {
        setError("Allow microphone and speech recognition in Settings to dictate.");
        return;
      }
      setListening(true);
      await SpeechRecognition.start({
        language: navigator.language || "en-GB",
        partialResults: true,
        popup: false,
      });
    } catch {
      setListening(false);
      setError("Couldn’t start dictation.");
    }
  }, [listening]);

  return { listening, error, toggle };
}
