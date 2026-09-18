/**
 * App adapter: re-exports shared strip and injects SPA media base + sidebar layout.
 */
import {
  LibraryAudioStrip as SharedLibraryAudioStrip,
  liveMixTrack,
  trackFromLibraryItem,
  trackFromFocusMix,
  isSoundscapeKey,
  mediaFileUrl,
  FOCUS_AMBIENT_S3_PREFIX,
  type LibraryActiveTrack,
  type LibraryBedVolumeApi,
  type BedVolumeChannel,
  type BackgroundAudioItem,
} from "@consciously/common";
import type { MutableRefObject } from "react";
import { getMedimadeMediaBaseUrl } from "@/lib/medimade-api";

export type { LibraryActiveTrack, LibraryBedVolumeApi, BedVolumeChannel };
export {
  liveMixTrack,
  trackFromLibraryItem,
  trackFromFocusMix,
  isSoundscapeKey,
  mediaFileUrl,
  FOCUS_AMBIENT_S3_PREFIX,
};

/** Used until the strip measures itself — keeps Focus chrome lifting in the same frame as play. */
export const PLAYER_STRIP_HEIGHT_ESTIMATE_PX = 80;

/** SPA always sits in signed-in app chrome with a sidebar. */
export function LibraryAudioStrip(
  props: {
    track: LibraryActiveTrack | null;
    musicItems: BackgroundAudioItem[];
    compositionItems: BackgroundAudioItem[];
    onDismiss: () => void;
    playbackToggleNonce: number;
    bedVolumeApiRef?: MutableRefObject<LibraryBedVolumeApi | null>;
    onPlayingChange?: (s3Key: string, playing: boolean) => void;
    onPlaybackTimeChange?: (s3Key: string, timeSeconds: number) => void;
    onHeightChange?: (heightPx: number) => void;
  },
) {
  return (
    <SharedLibraryAudioStrip
      {...props}
      mediaBase={getMedimadeMediaBaseUrl()}
      besideSidebar
    />
  );
}
