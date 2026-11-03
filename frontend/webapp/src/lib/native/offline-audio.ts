import { FileTransfer } from "@capacitor/file-transfer";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { nativeAudioLog } from "./native-audio-log";

/**
 * Downloaded copies of remote audio, keyed by the remote URL. Files live in
 * app data (`offline-audio/`); the index is in localStorage.
 */

const INDEX_KEY = "cl_offline_audio_v1";
const DIR = "offline-audio";

export type OfflineAudioEntry = {
  url: string;
  path: string;
  uri: string;
  bytes: number;
  savedAt: string;
};

type Index = Record<string, OfflineAudioEntry>;

function readIndex(): Index {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Index) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: Index): void {
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function fileNameFor(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  let ext = "m4a";
  try {
    const m = /\.([a-z0-9]{2,4})$/i.exec(new URL(url).pathname);
    if (m?.[1]) ext = m[1].toLowerCase();
  } catch {
    /* keep default */
  }
  return `${(h >>> 0).toString(16)}-${url.length}.${ext}`;
}

export function offlineAudioEntry(url: string): OfflineAudioEntry | null {
  return readIndex()[url] ?? null;
}

/** `file://` URI of the local copy (re-resolved: the iOS container path moves between installs). */
export async function offlineAudioUri(url: string): Promise<string | null> {
  const entry = offlineAudioEntry(url);
  if (!entry) return null;
  try {
    await Filesystem.stat({ path: entry.path, directory: Directory.Data });
    const { uri } = await Filesystem.getUri({ path: entry.path, directory: Directory.Data });
    return uri;
  } catch {
    const index = readIndex();
    delete index[url];
    writeIndex(index);
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function downloadOfflineAudio(
  url: string,
  onProgress?: (bytes: number, total: number) => void,
): Promise<OfflineAudioEntry> {
  const path = `${DIR}/${fileNameFor(url)}`;
  nativeAudioLog("download", `start ${url}`);
  try {
    await Filesystem.mkdir({ path: DIR, directory: Directory.Data, recursive: true });
  } catch {
    /* exists */
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  const listener = await FileTransfer.addListener("progress", (p) => {
    if (p.type !== "download" || p.url !== url) return;
    onProgress?.(p.bytes, p.lengthComputable ? p.contentLength : 0);
  });
  try {
    await FileTransfer.downloadFile({ url, path: uri, progress: true });
    const stat = await Filesystem.stat({ path, directory: Directory.Data });
    const entry: OfflineAudioEntry = {
      url,
      path,
      uri,
      bytes: stat.size,
      savedAt: new Date().toISOString(),
    };
    writeIndex({ ...readIndex(), [url]: entry });
    nativeAudioLog("download", `done ${formatBytes(stat.size)} → ${uri}`);
    return entry;
  } catch (e) {
    nativeAudioLog("error", `download failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  } finally {
    await listener.remove();
  }
}

export async function deleteOfflineAudio(url: string): Promise<void> {
  const index = readIndex();
  const entry = index[url];
  if (!entry) return;
  try {
    await Filesystem.deleteFile({ path: entry.path, directory: Directory.Data });
  } catch {
    /* already gone */
  }
  delete index[url];
  writeIndex(index);
  nativeAudioLog("download", `deleted ${url}`);
}
