export type VoiceNoteStartOptions = {
  language?: string;
};

export type VoiceNoteStopResult = {
  filePath: string;
  durationMs: number;
  transcript: string;
  /** ~60 level samples 0–1 for the clip waveform. */
  waveform: number[];
  /** Empty when speech worked; set when speech denied / on-device unavailable. */
  reason?: string;
};

export type VoiceNoteAvailableResult = {
  available: boolean;
  onDevice: boolean;
};

export type VoiceNotePartialEvent = {
  /** Full hypothesis so far (not a delta). */
  text: string;
};

export type VoiceNoteLevelEvent = {
  level: number;
};

export interface VoiceNotePlugin {
  isOnDeviceAvailable(options?: {
    language?: string;
  }): Promise<VoiceNoteAvailableResult>;
  start(options?: VoiceNoteStartOptions): Promise<void>;
  stop(): Promise<VoiceNoteStopResult>;
  /** Stops and deletes the in-progress file. */
  cancel(): Promise<void>;
  addListener(
    eventName: "partial",
    listenerFunc: (event: VoiceNotePartialEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "level",
    listenerFunc: (event: VoiceNoteLevelEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}
