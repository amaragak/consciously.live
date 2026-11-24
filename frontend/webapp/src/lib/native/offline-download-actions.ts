import { mediaFileUrl, voiceStemPlaybackUrl } from "@consciously/common";
import {
  backgroundAudioPlaybackKey,
  type BackgroundAudioItem,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import {
  downloadMeditationOffline,
  downloadSoundscapeOffline,
  formatBytes,
  meditationMixFingerprint,
  removeMeditationDownload,
  removeSoundscapeDownload,
} from "@/lib/native/offline-downloads";

export type MeditationBedCatalog = {
  nature: BackgroundAudioItem[];
  music: BackgroundAudioItem[];
  drums: BackgroundAudioItem[];
  noise: BackgroundAudioItem[];
  compositions: BackgroundAudioItem[];
};

function bedUrl(
  mediaBase: string,
  key: string | null | undefined,
  cacheBust?: string | null,
): string | null {
  const k = (key ?? "").trim();
  if (!k || !mediaBase.trim()) return null;
  return mediaFileUrl(
    mediaBase,
    backgroundAudioPlaybackKey(k),
    cacheBust,
  );
}

function findBed(
  list: BackgroundAudioItem[],
  key: string | null | undefined,
): BackgroundAudioItem | null {
  const k = (key ?? "").trim();
  if (!k) return null;
  return list.find((x) => x.key === k) ?? null;
}

export function meditationOfflineBedUrls(
  m: Pick<
    LibraryMeditationItem,
    | "backgroundMusicKey"
    | "backgroundNatureKey"
    | "backgroundDrumsKey"
    | "backgroundNoiseKey"
  >,
  mediaBase: string,
  catalog: MeditationBedCatalog,
): { urls: string[]; soundscapeName: string | null; bytesHint: number } {
  const musicKey = m.backgroundMusicKey ?? "";
  const natureKey = m.backgroundNatureKey ?? "";
  const drumsKey = m.backgroundDrumsKey ?? "";
  const noiseKey = m.backgroundNoiseKey ?? "";
  const music =
    findBed(catalog.compositions, musicKey) ??
    findBed(catalog.music, musicKey);
  const nature = findBed(catalog.nature, natureKey);
  const drums = findBed(catalog.drums, drumsKey);
  const noise = findBed(catalog.noise, noiseKey);
  const urls: string[] = [];
  const push = (key: string | null | undefined, item: BackgroundAudioItem | null) => {
    const u = bedUrl(mediaBase, key, item?.updatedAt);
    if (u) urls.push(u);
  };
  push(musicKey, music);
  push(natureKey, nature);
  push(drumsKey, drums);
  push(noiseKey, noise);
  const soundscapeName =
    music?.name?.trim() ||
    nature?.name?.trim() ||
    drums?.name?.trim() ||
    noise?.name?.trim() ||
    null;
  const bytesHint =
    (music?.size ?? 0) +
    (nature?.size ?? 0) +
    (drums?.size ?? 0) +
    (noise?.size ?? 0);
  return { urls, soundscapeName, bytesHint };
}

export function meditationOfflineFingerprint(
  m: Pick<
    LibraryMeditationItem,
    | "audioUrl"
    | "backgroundMusicKey"
    | "backgroundNatureKey"
    | "backgroundDrumsKey"
    | "backgroundNoiseKey"
    | "backgroundMusicGain"
    | "backgroundNatureGain"
    | "backgroundDrumsGain"
    | "backgroundNoiseGain"
  >,
  mediaBase: string,
  catalog: MeditationBedCatalog,
): string {
  const voiceUrl = voiceStemPlaybackUrl(m.audioUrl);
  const { urls } = meditationOfflineBedUrls(m, mediaBase, catalog);
  return meditationMixFingerprint({
    voiceUrl,
    bedUrls: urls,
    musicKey: m.backgroundMusicKey,
    natureKey: m.backgroundNatureKey,
    drumsKey: m.backgroundDrumsKey,
    noiseKey: m.backgroundNoiseKey,
    musicGain: m.backgroundMusicGain,
    natureGain: m.backgroundNatureGain,
    drumsGain: m.backgroundDrumsGain,
    noiseGain: m.backgroundNoiseGain,
  });
}

export async function saveMeditationForOffline(params: {
  sk: string;
  item: LibraryMeditationItem;
  mediaBase: string;
  catalog: MeditationBedCatalog;
  onProgress?: (done: number, total: number) => void;
}) {
  const voiceUrl = voiceStemPlaybackUrl(params.item.audioUrl);
  const { urls, soundscapeName, bytesHint } = meditationOfflineBedUrls(
    params.item,
    params.mediaBase,
    params.catalog,
  );
  const mixFingerprint = meditationOfflineFingerprint(
    params.item,
    params.mediaBase,
    params.catalog,
  );
  return downloadMeditationOffline({
    sk: params.sk,
    title: params.item.title,
    voiceUrl,
    bedUrls: urls,
    mixFingerprint,
    soundscapeName,
    coverImageUrl: params.item.coverImageUrl ?? null,
    speakerName: params.item.speakerName ?? null,
    onProgress: params.onProgress,
  }).then((row) => ({
    row,
    /** Rough size hint before/without download (beds only when catalog has size). */
    sizeHintLabel: formatBytes(
      Math.max(row.bytes, bytesHint || estimateVoiceBytes(params.item.durationSeconds)),
    ),
  }));
}

function estimateVoiceBytes(durationSeconds: number | null | undefined): number {
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return 0;
  }
  // ~16 KB/s rough AAC voice estimate
  return Math.round(durationSeconds * 16_000);
}

export function meditationDownloadSizeLabel(params: {
  durationSeconds?: number | null;
  bedBytesHint?: number;
}): string {
  const bytes =
    estimateVoiceBytes(params.durationSeconds) + (params.bedBytesHint ?? 0);
  return bytes > 0 ? formatBytes(bytes) : "—";
}

export async function saveSoundscapeForOffline(params: {
  key: string;
  title: string;
  url: string;
  coverImageUrl: string | null;
  onProgress?: (done: number, total: number) => void;
}) {
  return downloadSoundscapeOffline(params);
}

export { removeMeditationDownload, removeSoundscapeDownload, formatBytes };
