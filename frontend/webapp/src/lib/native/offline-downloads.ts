/**
 * Native-only offline catalog: meditations (voice + beds) and soundscapes.
 * Files live via offline-audio.ts; this index holds product metadata.
 */
import { isNativeApp } from "@/lib/native/native-bridge";
import {
  deleteOfflineAudio,
  downloadOfflineAudio,
  formatBytes,
  offlineAudioEntry,
  offlineAudioUri,
  type OfflineAudioEntry,
} from "@/lib/native/offline-audio";

const CATALOG_KEY = "cl_offline_downloads_v1";
const EVENT = "cl-offline-downloads-changed";

export type OfflineMeditationDownload = {
  kind: "meditation";
  id: string;
  title: string;
  voiceUrl: string;
  /** Bed remote URLs downloaded with the meditation (soundscape baked for offline play). */
  bedUrls: string[];
  /** Soundscape / mix fingerprint — when online mix changes, mark stale. */
  mixFingerprint: string;
  soundscapeName: string | null;
  coverImageUrl: string | null;
  speakerName: string | null;
  bytes: number;
  savedAt: string;
  /** True when current online mix no longer matches the download. */
  stale?: boolean;
};

export type OfflineSoundscapeDownload = {
  kind: "soundscape";
  id: string;
  title: string;
  url: string;
  coverImageUrl: string | null;
  bytes: number;
  savedAt: string;
};

export type OfflineCatalog = {
  meditations: Record<string, OfflineMeditationDownload>;
  soundscapes: Record<string, OfflineSoundscapeDownload>;
};

type ProgressFn = (done: number, total: number) => void;

function emptyCatalog(): OfflineCatalog {
  return { meditations: {}, soundscapes: {} };
}

function readCatalog(): OfflineCatalog {
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return emptyCatalog();
    const o = parsed as Partial<OfflineCatalog>;
    return {
      meditations:
        o.meditations && typeof o.meditations === "object" ? o.meditations : {},
      soundscapes:
        o.soundscapes && typeof o.soundscapes === "object" ? o.soundscapes : {},
    };
  } catch {
    return emptyCatalog();
  }
}

function writeCatalog(next: OfflineCatalog): void {
  window.localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function offlineDownloadsEnabled(): boolean {
  return isNativeApp();
}

export function getOfflineCatalog(): OfflineCatalog {
  return readCatalog();
}

export function subscribeOfflineDownloads(cb: () => void): () => void {
  const on = () => cb();
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener("storage", on);
  };
}

export function meditationDownloadId(sk: string): string {
  return sk.trim();
}

export function soundscapeDownloadId(key: string): string {
  return key.trim();
}

export function getMeditationDownload(
  sk: string,
): OfflineMeditationDownload | null {
  return readCatalog().meditations[meditationDownloadId(sk)] ?? null;
}

export function getSoundscapeDownload(
  key: string,
): OfflineSoundscapeDownload | null {
  return readCatalog().soundscapes[soundscapeDownloadId(key)] ?? null;
}

export function offlineDownloadsSummary(): {
  count: number;
  bytes: number;
  label: string;
} {
  const cat = readCatalog();
  const meds = Object.values(cat.meditations);
  const scapes = Object.values(cat.soundscapes);
  const bytes =
    meds.reduce((s, m) => s + (m.bytes || 0), 0) +
    scapes.reduce((s, m) => s + (m.bytes || 0), 0);
  const count = meds.length + scapes.length;
  return {
    count,
    bytes,
    label: `${count} downloaded · ${formatBytes(bytes)} · plays offline`,
  };
}

export function meditationMixFingerprint(params: {
  voiceUrl: string;
  bedUrls: string[];
  musicKey?: string | null;
  natureKey?: string | null;
  drumsKey?: string | null;
  noiseKey?: string | null;
  musicGain?: number | null;
  natureGain?: number | null;
  drumsGain?: number | null;
  noiseGain?: number | null;
}): string {
  return [
    params.voiceUrl,
    ...(params.bedUrls ?? []),
    params.musicKey ?? "",
    params.natureKey ?? "",
    params.drumsKey ?? "",
    params.noiseKey ?? "",
    params.musicGain ?? "",
    params.natureGain ?? "",
    params.drumsGain ?? "",
    params.noiseGain ?? "",
  ].join("|");
}

async function downloadUrls(
  urls: string[],
  onProgress?: ProgressFn,
): Promise<OfflineAudioEntry[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const out: OfflineAudioEntry[] = [];
  let done = 0;
  const total = unique.length;
  for (const url of unique) {
    const existing = offlineAudioEntry(url);
    if (existing) {
      out.push(existing);
      done += 1;
      onProgress?.(done, total);
      continue;
    }
    const entry = await downloadOfflineAudio(url, (bytes, length) => {
      if (length > 0 && onProgress) {
        onProgress(done + bytes / length, total);
      }
    });
    out.push(entry);
    done += 1;
    onProgress?.(done, total);
  }
  return out;
}

export async function downloadMeditationOffline(params: {
  sk: string;
  title: string;
  voiceUrl: string;
  bedUrls: string[];
  mixFingerprint: string;
  soundscapeName: string | null;
  coverImageUrl: string | null;
  speakerName: string | null;
  onProgress?: ProgressFn;
}): Promise<OfflineMeditationDownload> {
  if (!offlineDownloadsEnabled()) {
    throw new Error("Downloads are only available in the app");
  }
  const urls = [params.voiceUrl, ...params.bedUrls];
  let entries: OfflineAudioEntry[] = [];
  try {
    entries = await downloadUrls(urls, params.onProgress);
  } catch (e) {
    // Never leave a half-marked download.
    for (const url of urls) {
      if (!offlineAudioEntry(url)) continue;
      // Only delete newly attempted files that aren't shared — keep existing.
    }
    throw e;
  }
  const bytes = entries.reduce((s, e) => s + (e.bytes || 0), 0);
  const row: OfflineMeditationDownload = {
    kind: "meditation",
    id: meditationDownloadId(params.sk),
    title: params.title,
    voiceUrl: params.voiceUrl,
    bedUrls: params.bedUrls.filter(Boolean),
    mixFingerprint: params.mixFingerprint,
    soundscapeName: params.soundscapeName,
    coverImageUrl: params.coverImageUrl,
    speakerName: params.speakerName,
    bytes,
    savedAt: new Date().toISOString(),
    stale: false,
  };
  const cat = readCatalog();
  cat.meditations[row.id] = row;
  writeCatalog(cat);
  return row;
}

export async function removeMeditationDownload(sk: string): Promise<void> {
  const cat = readCatalog();
  const id = meditationDownloadId(sk);
  const row = cat.meditations[id];
  if (!row) return;
  const urls = [row.voiceUrl, ...row.bedUrls];
  delete cat.meditations[id];
  writeCatalog(cat);
  // Delete files only if no other catalog entry still needs them.
  const stillNeeded = new Set<string>();
  for (const m of Object.values(cat.meditations)) {
    stillNeeded.add(m.voiceUrl);
    for (const u of m.bedUrls) stillNeeded.add(u);
  }
  for (const s of Object.values(cat.soundscapes)) stillNeeded.add(s.url);
  for (const url of urls) {
    if (stillNeeded.has(url)) continue;
    await deleteOfflineAudio(url).catch(() => undefined);
  }
}

export async function downloadSoundscapeOffline(params: {
  key: string;
  title: string;
  url: string;
  coverImageUrl: string | null;
  onProgress?: ProgressFn;
}): Promise<OfflineSoundscapeDownload> {
  if (!offlineDownloadsEnabled()) {
    throw new Error("Downloads are only available in the app");
  }
  const entry = await downloadOfflineAudio(params.url, (bytes, length) => {
    if (length > 0) params.onProgress?.(bytes / length, 1);
    else params.onProgress?.(0, 1);
  });
  const row: OfflineSoundscapeDownload = {
    kind: "soundscape",
    id: soundscapeDownloadId(params.key),
    title: params.title,
    url: params.url,
    coverImageUrl: params.coverImageUrl,
    bytes: entry.bytes,
    savedAt: new Date().toISOString(),
  };
  const cat = readCatalog();
  cat.soundscapes[row.id] = row;
  writeCatalog(cat);
  params.onProgress?.(1, 1);
  return row;
}

export async function removeSoundscapeDownload(key: string): Promise<void> {
  const cat = readCatalog();
  const id = soundscapeDownloadId(key);
  const row = cat.soundscapes[id];
  if (!row) return;
  delete cat.soundscapes[id];
  writeCatalog(cat);
  const stillNeeded = new Set<string>();
  for (const m of Object.values(cat.meditations)) {
    stillNeeded.add(m.voiceUrl);
    for (const u of m.bedUrls) stillNeeded.add(u);
  }
  for (const s of Object.values(cat.soundscapes)) stillNeeded.add(s.url);
  if (!stillNeeded.has(row.url)) {
    await deleteOfflineAudio(row.url).catch(() => undefined);
  }
}

export function markMeditationStaleIfMixChanged(
  sk: string,
  currentFingerprint: string,
): void {
  const cat = readCatalog();
  const id = meditationDownloadId(sk);
  const row = cat.meditations[id];
  if (!row) return;
  const stale = row.mixFingerprint !== currentFingerprint;
  if (Boolean(row.stale) === stale) return;
  cat.meditations[id] = { ...row, stale };
  writeCatalog(cat);
}

export async function clearAllOfflineDownloads(): Promise<void> {
  const cat = readCatalog();
  const urls = new Set<string>();
  for (const m of Object.values(cat.meditations)) {
    urls.add(m.voiceUrl);
    for (const u of m.bedUrls) urls.add(u);
  }
  for (const s of Object.values(cat.soundscapes)) urls.add(s.url);
  writeCatalog(emptyCatalog());
  for (const url of urls) {
    await deleteOfflineAudio(url).catch(() => undefined);
  }
}

export { formatBytes, offlineAudioUri };

export function estimateMeditationDownloadBytes(params: {
  voiceBytes?: number | null;
  bedBytes?: number[];
}): number {
  const voice = Math.max(0, params.voiceBytes ?? 0);
  const beds = (params.bedBytes ?? []).reduce((s, n) => s + Math.max(0, n), 0);
  // Prefer known sizes; otherwise a coarse ~1.2 MB/min voice estimate is unused
  // until we have duration — callers pass known sizes when available.
  return voice + beds;
}
