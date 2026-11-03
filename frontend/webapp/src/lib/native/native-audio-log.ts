/**
 * In-memory event log for native playback (play/pause, interruptions,
 * background/foreground, session errors). `/dev/audio` renders it; nothing is
 * persisted or sent anywhere.
 */

export type NativeAudioLogKind =
  | "app"
  | "play"
  | "pause"
  | "seek"
  | "end"
  | "remote"
  | "interruption"
  | "session"
  | "download"
  | "error";

export type NativeAudioLogEntry = {
  id: number;
  at: number;
  kind: NativeAudioLogKind;
  message: string;
};

const MAX_ENTRIES = 400;
const entries: NativeAudioLogEntry[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

export function nativeAudioLog(kind: NativeAudioLogKind, message: string): void {
  entries.push({ id: nextId++, at: Date.now(), kind, message });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  for (const fn of listeners) fn();
}

export function nativeAudioLogEntries(): readonly NativeAudioLogEntry[] {
  return entries;
}

export function subscribeNativeAudioLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearNativeAudioLog(): void {
  entries.length = 0;
  for (const fn of listeners) fn();
}

export function formatNativeAudioLogTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function nativeAudioLogText(): string {
  return entries
    .map((e) => `${formatNativeAudioLogTime(e.at)}  ${e.kind.padEnd(12)} ${e.message}`)
    .join("\n");
}
