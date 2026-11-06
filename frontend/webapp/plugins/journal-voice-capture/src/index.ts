import { registerPlugin } from "@capacitor/core";
import type { JournalVoiceCapturePlugin } from "./definitions";

const JournalVoiceCapture = registerPlugin<JournalVoiceCapturePlugin>(
  "JournalVoiceCapture",
  {
    web: () =>
      import("./web").then((m) => new m.JournalVoiceCaptureWeb()),
  },
);

export * from "./definitions";
export { JournalVoiceCapture };
