/**
 * Journal VoiceNote (v7) — single-capture plugin wrapper.
 * Old Capgo / MediaRecorder / JournalVoiceCapture live paths stay in place
 * but are commented out of the editor in favour of this API.
 */

import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/native/native-bridge";

export type VoiceNoteSession = {
  stop: () => Promise<{
    filePath: string;
    localUrl: string;
    blob: Blob;
    mimeType: string;
    durationMs: number;
    transcript: string;
    waveform: number[];
    reason?: string;
  }>;
  cancel: () => Promise<void>;
};

export type VoiceNoteStartOpts = {
  language?: string;
  onPartial?: (text: string) => void;
  onLevel?: (level: number) => void;
};

async function filePathToBlob(
  filePath: string,
  mimeType: string,
): Promise<{ blob: Blob; localUrl: string }> {
  // Web plugin already returns a blob: URL as filePath.
  if (filePath.startsWith("blob:")) {
    const res = await fetch(filePath);
    return { blob: await res.blob(), localUrl: filePath };
  }
  const path = filePath.replace(/^file:\/\//, "");
  const src = Capacitor.convertFileSrc(
    path.startsWith("/") ? `file://${path}` : filePath,
  );
  const res = await fetch(src);
  let blob = await res.blob();
  if (!blob.type) {
    blob = new Blob([await blob.arrayBuffer()], { type: mimeType });
  }
  return { blob, localUrl: URL.createObjectURL(blob) };
}

export async function isVoiceNoteOnDeviceAvailable(
  language?: string,
): Promise<{ available: boolean; onDevice: boolean }> {
  const { VoiceNote } = await import("@consciously/voice-note");
  return VoiceNote.isOnDeviceAvailable({ language });
}

export async function startVoiceNoteSession(
  opts: VoiceNoteStartOpts = {},
): Promise<VoiceNoteSession> {
  const { VoiceNote } = await import("@consciously/voice-note");
  const handles: Array<{ remove: () => Promise<void> }> = [];

  if (opts.onPartial) {
    handles.push(
      await VoiceNote.addListener("partial", (e) => {
        opts.onPartial?.(e.text || "");
      }),
    );
  }
  if (opts.onLevel) {
    handles.push(
      await VoiceNote.addListener("level", (e) => {
        opts.onLevel?.(typeof e.level === "number" ? e.level : 0);
      }),
    );
  }

  await VoiceNote.start({ language: opts.language });

  const cleanupListeners = async () => {
    for (const h of handles) {
      try {
        await h.remove();
      } catch {
        /* */
      }
    }
  };

  return {
    stop: async () => {
      try {
        const stopped = await VoiceNote.stop();
        const mimeType = "audio/mp4";
        const { blob, localUrl } = await filePathToBlob(
          stopped.filePath,
          mimeType,
        );
        return {
          filePath: stopped.filePath,
          localUrl,
          blob,
          mimeType: blob.type || mimeType,
          durationMs: Math.max(1, stopped.durationMs || 1),
          transcript: (stopped.transcript || "").trim(),
          waveform: Array.isArray(stopped.waveform) ? stopped.waveform : [],
          reason: stopped.reason,
        };
      } finally {
        await cleanupListeners();
      }
    },
    cancel: async () => {
      try {
        await VoiceNote.cancel();
      } finally {
        await cleanupListeners();
      }
    },
  };
}

export function voiceNotePlatformLabel(): string {
  if (!isNativeApp()) return "web";
  return Capacitor.getPlatform();
}
