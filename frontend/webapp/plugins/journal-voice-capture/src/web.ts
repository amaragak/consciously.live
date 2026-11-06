import { WebPlugin } from "@capacitor/core";
import type {
  JournalVoiceCaptureAvailableResult,
  JournalVoiceCapturePlugin,
  JournalVoiceCaptureStartOptions,
  JournalVoiceCaptureStopResult,
  JournalVoiceTranscribeFileOptions,
  JournalVoiceTranscribeFileResult,
} from "./definitions";

/** Web stub — journal uses MediaRecorder + server / browser speech on web. */
export class JournalVoiceCaptureWeb
  extends WebPlugin
  implements JournalVoiceCapturePlugin
{
  async available(): Promise<JournalVoiceCaptureAvailableResult> {
    return { available: false, onDevice: false };
  }

  async start(_options?: JournalVoiceCaptureStartOptions): Promise<void> {
    throw this.unavailable("JournalVoiceCapture is native-only");
  }

  async stop(): Promise<JournalVoiceCaptureStopResult> {
    throw this.unavailable("JournalVoiceCapture is native-only");
  }

  async transcribeFile(
    _options: JournalVoiceTranscribeFileOptions,
  ): Promise<JournalVoiceTranscribeFileResult> {
    throw this.unavailable("JournalVoiceCapture.transcribeFile is native-only");
  }
}
