export type JournalVoiceCaptureStartOptions = {
  language?: string;
};

export type JournalVoiceCaptureStopResult = {
  path: string;
  uri: string;
  mimeType: string;
  durationSec: number;
  peaks: number[];
  transcript: string;
};

export type JournalVoiceCaptureAvailableResult = {
  available: boolean;
  onDevice: boolean;
};

export type JournalVoiceTranscribeFileOptions = {
  /** Raw base64 (no data: prefix). */
  base64: string;
  mimeType?: string;
  language?: string;
};

export type JournalVoiceTranscribeFileResult = {
  transcript: string;
  onDevice: boolean;
};

export type JournalVoicePartialEvent = {
  matches?: string[];
  isFinal?: boolean;
};

export type JournalVoiceLevelEvent = {
  level: number;
};

export interface JournalVoiceCapturePlugin {
  available(options?: { language?: string }): Promise<JournalVoiceCaptureAvailableResult>;
  start(options?: JournalVoiceCaptureStartOptions): Promise<void>;
  stop(): Promise<JournalVoiceCaptureStopResult>;
  /**
   * Transcribe a saved audio file on-device after recording.
   * iOS: SFSpeechURLRecognitionRequest + requiresOnDeviceRecognition.
   * Android: SpeechRecognizer with EXTRA_AUDIO_SOURCE when available.
   */
  transcribeFile(
    options: JournalVoiceTranscribeFileOptions,
  ): Promise<JournalVoiceTranscribeFileResult>;
  addListener(
    eventName: "partialResults",
    listenerFunc: (event: JournalVoicePartialEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "audioLevel",
    listenerFunc: (event: JournalVoiceLevelEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}
