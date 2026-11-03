import { AudioPlayer } from "@mediagrid/capacitor-native-audio";
import { nativeAudioLog } from "./native-audio-log";

/**
 * One native playback: a notification source (voice, soundscape, or a silent
 * carrier for bed-only mixes) plus looping bed followers.
 *
 * The patched plugin keeps followers in step natively — play/pause with the
 * notification source (lock screen, interruptions), soundscape seeks, and the
 * post-voice hold + fade — because the web view is suspended in the background.
 */

export type NativeBedSpec = {
  channel: string;
  url: string;
  volume: number;
  loop: boolean;
  /** Soundscapes are locked to the voice clock. */
  followSeek: boolean;
};

export type NativeMixSpec = {
  primary: {
    url: string;
    volume: number;
    loop: boolean;
    seekable: boolean;
    title: string;
    artist: string;
    artwork: string;
  };
  beds: NativeBedSpec[];
  outroHoldSeconds: number;
  outroFadeSeconds: number;
};

export type NativeMixHandlers = {
  onStatus: (status: "playing" | "paused" | "stopped") => void;
  onEnd: () => void;
};

let nextSessionId = 1;
/** Plugin state is global: never let two sessions overlap create/destroy. */
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.split("/").pop() || url;
  } catch {
    return url.slice(-48);
  }
}

export class NativeMixSession {
  private readonly primaryId: string;
  private readonly bedIds = new Map<string, string>();
  private destroyed = false;

  private constructor(
    private readonly spec: NativeMixSpec,
    sessionId: number,
  ) {
    this.primaryId = `cl-${sessionId}-primary`;
    for (const bed of spec.beds) this.bedIds.set(bed.channel, `cl-${sessionId}-${bed.channel}`);
  }

  static create(spec: NativeMixSpec, handlers: NativeMixHandlers): Promise<NativeMixSession> {
    return serial(async () => {
      const session = new NativeMixSession(spec, nextSessionId++);
      try {
        await session.setup(handlers);
      } catch (e) {
        nativeAudioLog("error", `create failed: ${e instanceof Error ? e.message : String(e)}`);
        await session.teardown();
        throw e;
      }
      return session;
    });
  }

  private async setup(handlers: NativeMixHandlers): Promise<void> {
    const { primary } = this.spec;
    await AudioPlayer.create({
      audioId: this.primaryId,
      audioSource: primary.url,
      friendlyTitle: primary.title,
      artistName: primary.artist,
      albumTitle: primary.artist,
      artworkSource: primary.artwork,
      useForNotification: true,
      isBackgroundMusic: false,
      loop: primary.loop,
      showSeekBackward: primary.seekable,
      showSeekForward: primary.seekable,
      seekBackwardTime: 10,
      seekForwardTime: 10,
      ...({
        outroHoldSeconds: this.spec.outroHoldSeconds,
        outroFadeSeconds: this.spec.outroFadeSeconds,
      } as object),
    });
    for (const bed of this.spec.beds) {
      await AudioPlayer.create({
        audioId: this.bedIds.get(bed.channel)!,
        audioSource: bed.url,
        friendlyTitle: bed.channel,
        useForNotification: false,
        isBackgroundMusic: true,
        loop: bed.loop,
        ...({ followPrimary: true, followPrimarySeek: bed.followSeek } as object),
      });
    }

    // iOS only observes end-of-item once `onAudioReady` is registered.
    await AudioPlayer.onAudioReady({ audioId: this.primaryId }, () => {
      nativeAudioLog("session", `ready: ${shortUrl(primary.url)}`);
    });
    await AudioPlayer.onAudioEnd({ audioId: this.primaryId }, () => {
      if (this.destroyed) return;
      nativeAudioLog("end", `voice ended: ${primary.title}`);
      handlers.onEnd();
    });
    await AudioPlayer.onPlaybackStatusChange({ audioId: this.primaryId }, ({ status }) => {
      if (this.destroyed) return;
      nativeAudioLog(status === "playing" ? "play" : "pause", `native status: ${status}`);
      handlers.onStatus(status);
    });
    await AudioPlayer.onAppLosesFocus({ audioId: this.primaryId }, () => {
      nativeAudioLog("app", "lost focus (background)");
    });
    await AudioPlayer.onAppGainsFocus({ audioId: this.primaryId }, () => {
      nativeAudioLog("app", "gained focus (foreground)");
    });

    await AudioPlayer.initialize({ audioId: this.primaryId });
    await AudioPlayer.setVolume({ audioId: this.primaryId, volume: primary.volume });
    for (const bed of this.spec.beds) {
      const audioId = this.bedIds.get(bed.channel)!;
      await AudioPlayer.initialize({ audioId });
      await AudioPlayer.setVolume({ audioId, volume: bed.volume });
    }
    nativeAudioLog(
      "session",
      `created: ${primary.title} (${this.spec.beds.map((b) => b.channel).join(", ") || "no beds"})`,
    );
  }

  get hasBeds(): boolean {
    return this.spec.beds.length > 0;
  }

  /** Lead-in: beds alone, before the voice starts. */
  async playBedsOnly(): Promise<void> {
    if (this.destroyed) return;
    for (const audioId of this.bedIds.values()) {
      await AudioPlayer.play({ audioId });
    }
    nativeAudioLog("play", "beds (lead-in)");
  }

  async play(opts?: { restartSoundscape?: boolean }): Promise<void> {
    if (this.destroyed) return;
    if (opts?.restartSoundscape) {
      for (const bed of this.spec.beds) {
        if (!bed.followSeek) continue;
        await AudioPlayer.seek({ audioId: this.bedIds.get(bed.channel)!, timeInSeconds: 0 });
      }
    }
    await AudioPlayer.play({ audioId: this.primaryId });
    nativeAudioLog("play", this.spec.primary.title);
  }

  async pause(): Promise<void> {
    if (this.destroyed) return;
    await AudioPlayer.pause({ audioId: this.primaryId });
    // Covers the lead-in, when followers run without the notification source.
    for (const audioId of this.bedIds.values()) {
      await AudioPlayer.pause({ audioId });
    }
    nativeAudioLog("pause", this.spec.primary.title);
  }

  async seek(timeSeconds: number): Promise<void> {
    if (this.destroyed || !this.spec.primary.seekable) return;
    const t = Math.max(0, Math.round(timeSeconds));
    await AudioPlayer.seek({ audioId: this.primaryId, timeInSeconds: t });
    nativeAudioLog("seek", `${t}s`);
  }

  async currentTime(): Promise<number> {
    if (this.destroyed) return 0;
    const { currentTime } = await AudioPlayer.getCurrentTime({ audioId: this.primaryId });
    return Number.isFinite(currentTime) ? currentTime : 0;
  }

  async duration(): Promise<number> {
    if (this.destroyed) return 0;
    const { duration } = await AudioPlayer.getDuration({ audioId: this.primaryId });
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  async isPlaying(): Promise<boolean> {
    if (this.destroyed) return false;
    const { isPlaying } = await AudioPlayer.isPlaying({ audioId: this.primaryId });
    return isPlaying;
  }

  async setBedVolume(channel: string, volume: number): Promise<void> {
    const audioId = this.bedIds.get(channel);
    if (this.destroyed || !audioId) return;
    await AudioPlayer.setVolume({ audioId, volume });
  }

  async setPrimaryVolume(volume: number): Promise<void> {
    if (this.destroyed) return;
    await AudioPlayer.setVolume({ audioId: this.primaryId, volume });
  }

  destroy(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.destroyed = true;
    return serial(() => this.teardown());
  }

  /** Followers first — the plugin refuses to drop the notification source while others exist. */
  private async teardown(): Promise<void> {
    this.destroyed = true;
    for (const audioId of this.bedIds.values()) {
      await AudioPlayer.destroy({ audioId }).catch(() => {});
    }
    await AudioPlayer.destroy({ audioId: this.primaryId }).catch(() => {});
    nativeAudioLog("session", `destroyed: ${this.spec.primary.title}`);
  }
}
