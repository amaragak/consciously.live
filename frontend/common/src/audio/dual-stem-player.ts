import { voiceFxDialGains } from "./voice-fx-dial";
import { voiceStemPlaybackUrl } from "./voice-stem-keys";

const bufferCache = new Map<string, AudioBuffer>();
const BUFFER_CACHE_MAX = 24;

/**
 * Dry + FX on one AudioContext clock. Both BufferSources start at the same
 * `when`. Dial only changes gain — a stem at 0 is silent, not stopped.
 * If stems cannot be decoded, library playback uses the baked voice file.
 */
export class DualStemPlayer {
  private ctx: AudioContext | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private drySrc: AudioBufferSourceNode | null = null;
  private wetSrc: AudioBufferSourceNode | null = null;
  private dryBuf: AudioBuffer | null = null;
  private wetBuf: AudioBuffer | null = null;
  private bakedEl: HTMLAudioElement | null = null;
  private mode: "locked" | "baked" | "none" = "none";
  private hasWet = false;
  private playing = false;
  private ignoreEnded = false;
  private endTimer: number | null = null;
  private dial = 100;
  private loadKey = "";
  private dryUrl = "";
  private wetUrl = "";
  private bakedUrl = "";
  private offset = 0;
  private playStartedAt = 0;
  private playOffset = 0;
  private dryEnded = false;
  private wetEnded = false;
  private inFlight: Promise<void> | null = null;
  /** Bumped on pause/stop so in-flight play()/start() cannot restart audio after pause. */
  private playEpoch = 0;
  private durationWaiters: Array<(n: number) => void> = [];
  onEnded: (() => void) | null = null;

  get isPlaying(): boolean {
    return this.playing;
  }

  get duration(): number {
    if (this.mode === "baked" && this.bakedEl) {
      return finiteDuration(this.bakedEl);
    }
    return Math.max(
      this.dryBuf?.duration ?? 0,
      this.wetBuf?.duration ?? 0,
    );
  }

  get currentTime(): number {
    if (this.mode === "baked" && this.bakedEl) {
      const t = this.bakedEl.currentTime;
      if (typeof t === "number" && Number.isFinite(t)) return t;
      return this.offset;
    }
    if (this.playing && this.ctx) {
      return this.playOffset + Math.max(0, this.ctx.currentTime - this.playStartedAt);
    }
    return this.offset;
  }

  setDial(dial: number) {
    this.dial = dial;
    this.applyGains();
  }

  whenDuration(timeoutMs = 8000): Promise<number> {
    if (this.duration > 0) return Promise.resolve(this.duration);
    return new Promise((resolve) => {
      const t = window.setTimeout(() => {
        this.durationWaiters = this.durationWaiters.filter((w) => w !== done);
        resolve(this.duration);
      }, timeoutMs);
      const done = (n: number) => {
        window.clearTimeout(t);
        resolve(n);
      };
      this.durationWaiters.push(done);
    });
  }

  async load(
    dryUrl: string,
    wetUrl: string | null,
    dial = 100,
    bakedUrl: string | null = null,
  ): Promise<void> {
    const dry = voiceStemPlaybackUrl(dryUrl);
    const wet = wetUrl ? voiceStemPlaybackUrl(wetUrl) : "";
    const baked = (bakedUrl ?? "").trim();
    const key = `${dry}\n${wet}\n${baked}`;
    this.dial = dial;
    this.bakedUrl = baked;
    if (key === this.loadKey && this.inFlight) {
      await this.inFlight;
      this.applyGains();
      return;
    }
    if (key === this.loadKey && (this.dryBuf || this.mode === "baked")) {
      this.applyGains();
      return;
    }
    this.stopSources();
    this.loadKey = key;
    this.dryUrl = dry;
    this.wetUrl = wet;
    this.offset = 0;
    this.hasWet = Boolean(wet);
    this.dryBuf = null;
    this.wetBuf = null;
    this.mode = "none";
    this.applyGains();

    const ctx = this.ensureCtx();
    this.inFlight = (async () => {
      try {
        const [dryBuf, wetBuf] = await Promise.all([
          decodeStem(ctx, dry),
          wet ? decodeStem(ctx, wet) : Promise.resolve(null),
        ]);
        if (this.loadKey !== key) return;
        this.dryBuf = dryBuf;
        this.wetBuf = wetBuf;
        this.mode = "locked";
        this.notifyDuration();
      } catch {
        if (this.loadKey !== key) return;
        if (!baked) throw new Error("voice stems could not be locked");
        this.mode = "baked";
        this.prepareBaked();
      }
    })();
    try {
      await this.inFlight;
    } finally {
      if (this.loadKey === key) this.inFlight = null;
    }
  }

  /** Resume the context in the click, then decode and start together. */
  start(
    dryUrl: string,
    wetUrl: string | null,
    dial = 100,
    bakedUrl: string | null = null,
  ): Promise<void> {
    void this.ensureCtx().resume();
    const epoch = this.playEpoch;
    return this.load(dryUrl, wetUrl, dial, bakedUrl).then(() => {
      if (epoch !== this.playEpoch) return;
      return this.play();
    });
  }

  async play(): Promise<void> {
    const epoch = this.playEpoch;
    const ctx = this.ensureCtx();
    void ctx.resume();
    if (this.mode === "none" && this.loadKey) {
      await this.load(this.dryUrl, this.wetUrl || null, this.dial, this.bakedUrl || null);
    }
    if (epoch !== this.playEpoch) return;
    if (this.mode === "baked") {
      this.playBaked();
      return;
    }
    if (!this.dryBuf) return;
    this.offset = Math.min(this.offset, this.duration || this.offset);
    this.spawnLockedSources();
  }

  pause() {
    if (this.playing) {
      this.offset = this.currentTime;
    }
    // Always stop sources — `playing` can be false while BufferSources / baked
    // audio are still audible (stale async play, or finishNatural without stop).
    this.playEpoch += 1;
    this.stopSources();
    this.playing = false;
  }

  stop() {
    this.playEpoch += 1;
    this.offset = 0;
    this.stopSources();
    this.playing = false;
    if (this.mode === "baked" && this.bakedEl) {
      try {
        this.bakedEl.currentTime = 0;
      } catch {
        /* */
      }
    }
  }

  seek(seconds: number) {
    const next = Math.min(this.duration || seconds, Math.max(0, seconds));
    this.offset = next;
    if (this.mode === "baked" && this.bakedEl) {
      try {
        this.bakedEl.currentTime = next;
      } catch {
        /* */
      }
      if (this.playing) void this.bakedEl.play().catch(() => {});
      return;
    }
    if (this.playing) this.spawnLockedSources();
  }

  dispose() {
    this.stop();
    this.loadKey = "";
    this.onEnded = null;
    this.durationWaiters = [];
    this.dryBuf = null;
    this.wetBuf = null;
    if (this.bakedEl) {
      this.bakedEl.remove();
      this.bakedEl = null;
    }
    if (this.ctx) {
      this.dryGain?.disconnect();
      this.wetGain?.disconnect();
      void this.ctx.close();
      this.ctx = null;
      this.dryGain = null;
      this.wetGain = null;
    }
  }

  private ensureCtx(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();
    this.dryGain.connect(this.ctx.destination);
    this.wetGain.connect(this.ctx.destination);
    this.applyGains();
    return this.ctx;
  }

  private spawnLockedSources() {
    const ctx = this.ensureCtx();
    this.stopSources();
    this.ignoreEnded = false;
    this.dryEnded = false;
    this.wetEnded = !this.hasWet;
    const off = Math.min(this.offset, this.duration || this.offset);
    const when = ctx.currentTime;
    if (this.dryBuf && off < this.dryBuf.duration - 0.005) {
      const src = ctx.createBufferSource();
      src.buffer = this.dryBuf;
      src.connect(this.dryGain!);
      src.onended = () => {
        if (this.drySrc !== src) return;
        this.dryEnded = true;
        this.onSourceEnded();
      };
      src.start(when, off);
      this.drySrc = src;
    } else {
      this.dryEnded = true;
    }
    if (this.wetBuf && off < this.wetBuf.duration - 0.005) {
      const src = ctx.createBufferSource();
      src.buffer = this.wetBuf;
      src.connect(this.wetGain!);
      src.onended = () => {
        if (this.wetSrc !== src) return;
        this.wetEnded = true;
        this.onSourceEnded();
      };
      src.start(when, off);
      this.wetSrc = src;
    } else if (this.hasWet) {
      this.wetEnded = true;
    }
    this.playStartedAt = when;
    this.playOffset = off;
    this.playing = true;
    this.armEndTimer();
  }

  private prepareBaked() {
    const el = this.ensureBakedEl();
    if (el.src !== this.bakedUrl) el.src = this.bakedUrl;
    this.notifyDuration();
  }

  private playBaked() {
    const el = this.ensureBakedEl();
    const epoch = this.playEpoch;
    this.stopSources();
    if (epoch !== this.playEpoch) return;
    this.ignoreEnded = false;
    if (el.src !== this.bakedUrl) el.src = this.bakedUrl;
    try {
      el.currentTime = this.offset;
    } catch {
      /* */
    }
    this.playing = true;
    void el
      .play()
      .then(() => {
        if (epoch !== this.playEpoch) {
          el.pause();
          this.playing = false;
        }
      })
      .catch(() => {
        if (epoch === this.playEpoch) this.playing = false;
      });
    this.armEndTimer();
  }

  private ensureBakedEl(): HTMLAudioElement {
    if (this.bakedEl) return this.bakedEl;
    const el = document.createElement("audio");
    el.preload = "auto";
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.style.display = "none";
    el.addEventListener("ended", () => this.finishNatural());
    el.addEventListener("loadedmetadata", () => this.notifyDuration());
    document.body.appendChild(el);
    this.bakedEl = el;
    return el;
  }

  private applyGains() {
    const { dry, wet } = voiceFxDialGains(this.dial);
    const now = this.ctx?.currentTime ?? 0;
    if (this.dryGain) this.dryGain.gain.setValueAtTime(dry, now);
    if (this.wetGain) this.wetGain.gain.setValueAtTime(this.hasWet ? wet : 0, now);
  }

  private notifyDuration() {
    const d = this.duration;
    if (!(d > 0)) return;
    const waiters = this.durationWaiters;
    this.durationWaiters = [];
    for (const w of waiters) w(d);
    if (this.playing) this.armEndTimer();
  }

  private onSourceEnded() {
    if (this.ignoreEnded || !this.playing) return;
    if (this.dryEnded && this.wetEnded) this.finishNatural();
  }

  private armEndTimer() {
    this.clearEndTimer();
    const remaining = this.duration - this.currentTime;
    if (!(remaining > 0.05)) return;
    this.endTimer = window.setTimeout(
      () => this.finishNatural(),
      remaining * 1000 + 25,
    );
  }

  private finishNatural() {
    if (this.ignoreEnded || !this.playing) return;
    this.clearEndTimer();
    this.stopSources();
    this.playing = false;
    this.offset = 0;
    this.onEnded?.();
  }

  private clearEndTimer() {
    if (this.endTimer == null) return;
    window.clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private stopSources() {
    this.clearEndTimer();
    this.ignoreEnded = true;
    if (this.drySrc) {
      try {
        this.drySrc.stop();
      } catch {
        /* */
      }
      this.drySrc.disconnect();
      this.drySrc = null;
    }
    if (this.wetSrc) {
      try {
        this.wetSrc.stop();
      } catch {
        /* */
      }
      this.wetSrc.disconnect();
      this.wetSrc = null;
    }
    if (this.bakedEl) {
      this.bakedEl.pause();
    }
  }
}

function finiteDuration(el: HTMLAudioElement): number {
  const d = el.duration;
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : 0;
}

async function decodeStem(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const hit = bufferCache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`stem HTTP ${res.status}`);
  const raw = await res.arrayBuffer();
  const copy = raw.slice(0);
  const buf = await ctx.decodeAudioData(copy);
  if (bufferCache.size >= BUFFER_CACHE_MAX) {
    const first = bufferCache.keys().next().value;
    if (first) bufferCache.delete(first);
  }
  bufferCache.set(url, buf);
  return buf;
}

let libraryVoice: DualStemPlayer | null = null;

export function getLibraryVoicePlayer(): DualStemPlayer {
  if (!libraryVoice) libraryVoice = new DualStemPlayer();
  return libraryVoice;
}

/** Call from the card click — AudioContext.resume() must run in the user gesture. */
export function startLibraryVoicePlayback(track: {
  dryUrl?: string;
  wetUrl?: string;
  voiceFxDial?: number;
  url?: string;
}): void {
  const dry = (track.dryUrl ?? "").trim();
  const baked = (track.url ?? "").trim();
  if (!dry && !baked) return;
  const player = getLibraryVoicePlayer();
  if (dry) {
    void player
      .start(dry, track.wetUrl ?? null, track.voiceFxDial ?? 100, baked || null)
      .catch(() => {});
    return;
  }
  void player.start(baked, null, 100, baked).catch(() => {});
}

export function stopLibraryVoicePlayback(): void {
  libraryVoice?.stop();
}
