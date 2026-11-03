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
  unlockLibraryVoicePlayback,
  startLibraryVoicePlayback,
  stopLibraryVoicePlayback,
  type LibraryActiveTrack,
  type LibraryBedVolumeApi,
  type BedVolumeChannel,
  type BackgroundAudioItem,
} from "@consciously/common";
import { lazy, Suspense, type MutableRefObject } from "react";
import { getMedimadeMediaBaseUrl } from "@/lib/medimade-api";
import { isNativeApp } from "@/lib/native/native-bridge";

const NativeLibraryAudioStrip = __NATIVE_BUILD__
  ? lazy(() => import("./native-library-audio-strip"))
  : null;

/**
 * Native shell: the native audio plugin owns playback (background, lock screen).
 * Create · Sound auditions stay on the web strip — they are foreground-only and
 * bridge to the create step's own voice transport.
 */
export function usesNativePlayback(track: Pick<LibraryActiveTrack, "s3Key">): boolean {
  return __NATIVE_BUILD__ && isNativeApp() && !track.s3Key.startsWith("create:sound:");
}

export type { LibraryActiveTrack, LibraryBedVolumeApi, BedVolumeChannel };
export {
  liveMixTrack,
  trackFromLibraryItem,
  trackFromFocusMix,
  isSoundscapeKey,
  mediaFileUrl,
  FOCUS_AMBIENT_S3_PREFIX,
  unlockLibraryVoicePlayback,
  startLibraryVoicePlayback,
  stopLibraryVoicePlayback,
};

/** Used until the strip measures itself — keeps Focus chrome lifting in the same frame as play. */
export const PLAYER_STRIP_HEIGHT_ESTIMATE_PX = 96;

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
    autoplay?: boolean;
    placement?: "fixed" | "inline";
    /** Lift fixed strip above the phone tab bar (0 when bar hidden). */
    bottomOffsetPx?: number;
    externalPlaying?: boolean | null;
    onExternalTransportToggle?: (() => void) | null;
    onReflect?: (() => void) | null;
    reflectActive?: boolean;
  },
) {
  const inline = props.placement === "inline";
  if (NativeLibraryAudioStrip && props.track && usesNativePlayback(props.track)) {
    return (
      <Suspense fallback={null}>
        <NativeLibraryAudioStrip
          {...props}
          track={props.track}
          mediaBase={getMedimadeMediaBaseUrl()}
          besideSidebar={!inline}
          placement={props.placement ?? "fixed"}
        />
      </Suspense>
    );
  }
  return (
    <SharedLibraryAudioStrip
      {...props}
      mediaBase={getMedimadeMediaBaseUrl()}
      besideSidebar={!inline}
      placement={props.placement ?? "fixed"}
    />
  );
}
