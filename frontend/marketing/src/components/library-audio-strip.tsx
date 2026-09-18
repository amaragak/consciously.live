"use client";

/**
 * App adapter: re-exports shared strip and injects media base + sidebar layout
 * from the marketing session / preview state.
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
import { useEffect, useState, type MutableRefObject } from "react";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import { isMarketingPreviewMode } from "@/lib/marketing-preview";
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

export const PLAYER_STRIP_HEIGHT_ESTIMATE_PX = 80;

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
  const [besideSidebar, setBesideSidebar] = useState(false);
  useEffect(() => {
    const sync = () => {
      setBesideSidebar(
        isMedimadeSessionActive() && !isMarketingPreviewMode(),
      );
    };
    sync();
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  return (
    <SharedLibraryAudioStrip
      {...props}
      mediaBase={getMedimadeMediaBaseUrl()}
      besideSidebar={besideSidebar}
    />
  );
}
