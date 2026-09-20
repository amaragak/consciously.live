import { voiceFxDialGains } from "./voice-fx-dial";

/**
 * Sample-locked dry ↔ full mixer-bounce blend on one AudioContext.
 * Dial 100 plays only the effected stem (same file as before the split).
 */
export class DualStemPlayer {
  private ctx: AudioContext | null = null;
  private dryBuf: AudioBuffer | null = null;
  private wetBuf: AudioBuffer | null = null;
  private drySrc: AudioBufferSourceNode | null = null;
  private wetSrc: AudioBufferSourceNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private playing = false;
  private ignoreEnded = false;
  private endTimer: number | null = null;
  private dial = 100;
  private loadKey = "";
  onEnded: (() => void) | null = null;

  get isPlaying(): boolean {
    return this.playing;
  }

  get duration(): number {
    const d = this.dryBuf?.duration ?? 0;
    const w = this.wetBuf?.duration ?? 0;
    return Math.max(d, w);
  }

  get currentTime(): number {
    if (!this.ctx || !this.playing) return this.offset;
    return Math.min(this.duration, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  setDial(dial: number) {
    this.dial = dial;
    this.applyGains();
  }

  async load(dryUrl: string, wetUrl: string | null, dial = 100): Promise<void> {
    const key = `${dryUrl}\n${wetUrl ?? ""}`;
    this.dial = dial;
    if (key === this.loadKey && this.dryBuf) {
      this.applyGains();
      return;
    }
    this.stopSources(false);
    this.dryBuf = null;
    this.wetBuf = null;
    this.loadKey = key;
    this.offset = 0;
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const dryP = fetchDecode(ctx, dryUrl);
    const wetP = wetUrl ? fetchDecode(ctx, wetUrl).catch(() => null) : Promise.resolve(null);
    const [dry, wet] = await Promise.all([dryP, wetP]);
    if (this.loadKey !== key) return;
    const locked = await lockStemPair(ctx, dry, wet);
    if (this.loadKey !== key) return;
    this.dryBuf = locked.dry;
    this.wetBuf = locked.wet;
    this.applyGains();
  }

  async play(): Promise<void> {
    if (!this.dryBuf) return;
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") await ctx.resume();
    this.stopSources(false);
    this.ignoreEnded = false;
    const t = ctx.currentTime;
    this.startedAt = t;
    const offset = Math.min(this.offset, this.dryBuf.duration);
    this.offset = offset;
    const { dry, wet } = this.ensureGains();
    const onEnd = () => this.finishNatural();
    this.drySrc = ctx.createBufferSource();
    this.drySrc.buffer = this.dryBuf;
    this.drySrc.connect(dry);
    this.drySrc.onended = onEnd;
    this.drySrc.start(t, offset);
    if (this.wetBuf) {
      this.wetSrc = ctx.createBufferSource();
      this.wetSrc.buffer = this.wetBuf;
      this.wetSrc.connect(wet);
      this.wetSrc.onended = onEnd;
      const wetOffset = Math.min(offset, this.wetBuf.duration);
      this.wetSrc.start(t, wetOffset);
    }
    this.playing = true;
    // Dial 100 zeros the dry gain; some browsers skip onended on a silent
    // source. Time the longer stem so the 3s preview gap starts after FX.
    const remainingMs = Math.max(0, this.duration - offset) * 1000;
    this.endTimer = window.setTimeout(onEnd, remainingMs + 25);
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.currentTime;
    this.stopSources(false);
    this.playing = false;
  }

  stop() {
    this.offset = 0;
    this.stopSources(false);
    this.playing = false;
  }

  seek(seconds: number) {
    const next = Math.min(this.duration, Math.max(0, seconds));
    this.offset = next;
    if (this.playing) void this.play();
  }

  dispose() {
    this.stop();
    this.dryBuf = null;
    this.wetBuf = null;
    this.loadKey = "";
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
      this.dryGain = null;
      this.wetGain = null;
    }
    return this.ctx;
  }

  private ensureGains(): { dry: GainNode; wet: GainNode } {
    const ctx = this.ensureCtx();
    if (!this.dryGain) {
      this.dryGain = ctx.createGain();
      this.dryGain.connect(ctx.destination);
    }
    if (!this.wetGain) {
      this.wetGain = ctx.createGain();
      this.wetGain.connect(ctx.destination);
    }
    this.applyGains();
    return { dry: this.dryGain, wet: this.wetGain };
  }

  private applyGains() {
    const { dry, wet } = voiceFxDialGains(this.dial);
    if (this.dryGain) this.dryGain.gain.value = dry;
    if (this.wetGain) this.wetGain.gain.value = this.wetBuf ? wet : 0;
  }

  private finishNatural() {
    if (this.ignoreEnded || !this.playing) return;
    this.clearEndTimer();
    this.playing = false;
    this.offset = 0;
    this.onEnded?.();
  }

  private clearEndTimer() {
    if (this.endTimer == null) return;
    window.clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private stopSources(resetOffset: boolean) {
    this.clearEndTimer();
    this.ignoreEnded = true;
    if (this.drySrc) this.drySrc.onended = null;
    if (this.wetSrc) this.wetSrc.onended = null;
    try {
      this.drySrc?.stop();
    } catch {
      /* */
    }
    try {
      this.wetSrc?.stop();
    } catch {
      /* */
    }
    this.drySrc = null;
    this.wetSrc = null;
    if (resetOffset) this.offset = 0;
  }
}

async function fetchDecode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stem ${res.status}`);
  const raw = await res.arrayBuffer();
  return ctx.decodeAudioData(raw.slice(0));
}

/** Same sample rate + frame count so start(t, offset) is sample-identical. */
async function lockStemPair(
  ctx: AudioContext,
  dry: AudioBuffer,
  wet: AudioBuffer | null,
): Promise<{ dry: AudioBuffer; wet: AudioBuffer | null }> {
  const sr = ctx.sampleRate;
  const dryM = await resampleTo(ctx, dry, sr);
  if (!wet) return { dry: dryM, wet: null };
  const wetM = await resampleTo(ctx, wet, sr);
  const n = Math.max(dryM.length, wetM.length);
  return { dry: padFrames(ctx, dryM, n), wet: padFrames(ctx, wetM, n) };
}

async function resampleTo(
  ctx: AudioContext,
  buf: AudioBuffer,
  sampleRate: number,
): Promise<AudioBuffer> {
  if (buf.sampleRate === sampleRate) return buf;
  const frames = Math.max(1, Math.ceil(buf.duration * sampleRate));
  const offline = new OfflineAudioContext(buf.numberOfChannels, frames, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buf;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

function padFrames(ctx: AudioContext, buf: AudioBuffer, frames: number): AudioBuffer {
  if (buf.length === frames && buf.sampleRate === ctx.sampleRate) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, frames, ctx.sampleRate);
  const copy = Math.min(buf.length, frames);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.copyToChannel(buf.getChannelData(c).subarray(0, copy), c);
  }
  return out;
}
