import { registerPlugin } from "@capacitor/core";
import type { VoiceNotePlugin } from "./definitions";

const VoiceNote = registerPlugin<VoiceNotePlugin>("VoiceNote", {
  web: () => import("./web").then((m) => new m.VoiceNoteWeb()),
});

export * from "./definitions";
export { VoiceNote };
