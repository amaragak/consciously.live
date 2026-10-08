"use client";

/**
 * App adapter: re-exports shared strip and injects media base.
 * Marketing / Next has no SPA sidebar — full-bleed dock + dark tone.
 */
import {
  LibraryAudioStrip as SharedLibraryAudioStrip,
  liveMixTrack,
  trackFromLibraryItem,
  trackFromFocusMix,
  isSoundscapeKey,
  mediaFileUrl,
  FOCUS_AMBIENT_S3_PREFIX,
  startLibraryVoicePlayback,
  stopLibraryVoicePlayback,
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
  startLibraryVoicePlayback,
  stopLibraryVoicePlayback,
};

export const PLAYER_STRIP_HEIGHT_ESTIMATE_PX = 96;

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
    autoplay?: boolean;
    placement?: "fixed" | "inline";
    externalPlaying?: boolean | null;
    onExternalTransportToggle?: (() => void) | null;
  },
) {
  return (
    <SharedLibraryAudioStrip
      {...props}
      mediaBase={getMedimadeMediaBaseUrl()}
      besideSidebar={false}
      tone="dark"
      placement={props.placement ?? "fixed"}
    />
  );
}
