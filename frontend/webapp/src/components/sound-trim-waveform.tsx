import { useCallback, useEffect, useRef, useState } from "react";
import { light } from "@/lib/theme-colors";

const BAR_COUNT = 900;
const HANDLE_PX = 10;

function waveformSrc(url: string): string {
  // Decode the URL as given — archived masters may be WAV-only (no lame MP3).
  return url;
}

function peaksFromBuffer(buffer: AudioBuffer, bars: number): Float32Array {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const peaks = new Float32Array(bars);
  const n = ch0.length;
  const samplesPerBar = Math.max(1, Math.floor(n / bars));
  const stride = Math.max(1, Math.floor(samplesPerBar / 48));
  for (let i = 0; i < bars; i += 1) {
    const start = i * samplesPerBar;
    const end = i === bars - 1 ? n : Math.min(n, start + samplesPerBar);
    let max = 0;
    for (let j = start; j < end; j += stride) {
      let v = Math.abs(ch0[j] ?? 0);
      if (ch1) v = Math.max(v, Math.abs(ch1[j] ?? 0));
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

type DragKind = "start" | "end" | "region" | null;

export function SoundTrimWaveform({
  src,
  startSec,
  endSec,
  duration,
  currentTime,
  onChange,
  onSeek,
  readOnly = false,
  label,
  fadeInSec = 0,
  fadeOutSec = 0,
}: {
  src: string;
  startSec: number;
  endSec: number | null;
  duration: number | null;
  currentTime?: number;
  onChange?: (start: number, end: number | null) => void;
  onSeek?: (sec: number) => void;
  /** Seek-only — no trim handles (used for the streaming AAC A/B strip). */
  readOnly?: boolean;
  label?: string;
  /** Fade-in length from the start marker (master) or file start (streaming). */
  fadeInSec?: number;
  /** Fade-out length into the end marker (master) or file end (streaming). */
  fadeOutSec?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const dragRef = useRef<{ kind: DragKind; grabOffset?: number }>({ kind: null });
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const dur = duration && duration > 0 ? duration : 0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue("--accent").trim() || light.accent;
    const muted = styles.getPropertyValue("--muted").trim() || light.muted;
    const border = styles.getPropertyValue("--border").trim() || light.border;
    const fg = styles.getPropertyValue("--foreground").trim() || light.foreground;

    ctx.fillStyle = border;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    const startX = dur > 0 ? (startSec / dur) * w : 0;
    const endX = dur > 0 ? ((endSec ?? dur) / dur) * w : w;

    if (peaks && peaks.length > 0) {
      let peakMax = 0.001;
      for (let i = 0; i < peaks.length; i += 1) peakMax = Math.max(peakMax, peaks[i] ?? 0);
      const mid = h / 2;
      const barW = w / peaks.length;
      for (let i = 0; i < peaks.length; i += 1) {
        const x = i * barW;
        const amp = ((peaks[i] ?? 0) / peakMax) * (h * 0.42);
        const inSel = readOnly
          ? true
          : x + barW * 0.5 >= startX && x + barW * 0.5 <= endX;
        ctx.fillStyle = inSel ? accent : muted;
        ctx.globalAlpha = inSel ? 0.9 : 0.28;
        ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
      }
      ctx.globalAlpha = 1;
    }

    if (!readOnly) {
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(0, 0, startX, h);
      ctx.fillRect(endX, 0, w - endX, h);
      ctx.globalAlpha = 1;
    }

    // Fade regions are anchored to the trim markers: in from start, out into end.
    const selStart = readOnly ? 0 : startSec;
    const selEnd = readOnly ? dur : (endSec ?? dur);
    const selLen = Math.max(0, selEnd - selStart);
    const fi = Math.min(Math.max(0, fadeInSec), selLen / 4);
    const fo = Math.min(Math.max(0, fadeOutSec), selLen / 4);
    if (dur > 0 && (fi > 0 || fo > 0)) {
      if (fi > 0) {
        const x0 = (selStart / dur) * w;
        const x1 = ((selStart + fi) / dur) * w;
        const grad = ctx.createLinearGradient(x0, 0, x1, 0);
        grad.addColorStop(0, "rgba(0,0,0,0.45)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      }
      if (fo > 0) {
        const x0 = ((selEnd - fo) / dur) * w;
        const x1 = (selEnd / dur) * w;
        const grad = ctx.createLinearGradient(x0, 0, x1, 0);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = grad;
        ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      }
    }

    if (!readOnly) {
      ctx.fillStyle = accent;
      ctx.fillRect(startX - 1 * dpr, 0, 2 * dpr, h);
      ctx.fillRect(endX - 1 * dpr, 0, 2 * dpr, h);
      ctx.beginPath();
      ctx.arc(startX, h / 2, HANDLE_PX * 0.45 * dpr, 0, Math.PI * 2);
      ctx.arc(endX, h / 2, HANDLE_PX * 0.45 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    if (dur > 0 && currentTime != null && Number.isFinite(currentTime)) {
      const px = (currentTime / dur) * w;
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [currentTime, dur, endSec, fadeInSec, fadeOutSec, readOnly, startSec]);

  useEffect(() => {
    draw();
  }, [draw, status]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !src) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (cancelled) return;
        setStatus("loading");
        setError(null);
        const url = waveformSrc(src);
        void (async () => {
          const tryDecode = async (fetchUrl: string) => {
            const res = await fetch(fetchUrl, { mode: "cors" });
            if (!res.ok) throw new Error(`Could not load audio (${res.status})`);
            const buf = await res.arrayBuffer();
            const ctx = new AudioContext();
            try {
              return await ctx.decodeAudioData(buf.slice(0));
            } finally {
              await ctx.close().catch(() => undefined);
            }
          };
          try {
            const decoded = await tryDecode(url);
            if (cancelled) return;
            peaksRef.current = peaksFromBuffer(decoded, BAR_COUNT);
            setStatus("ready");
          } catch (e) {
            if (cancelled) return;
            setStatus("error");
            setError(
              e instanceof Error
                ? e.message
                : "Could not decode waveform. A backend deploy is needed for CDN CORS.",
            );
          }
        })();
      },
      { rootMargin: "80px", threshold: 0.05 },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [src]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  function secFromClientX(clientX: number): number {
    const canvas = canvasRef.current;
    if (!canvas || dur <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    const t = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.min(dur, Math.max(0, t * dur));
  }

  function kindAt(clientX: number): DragKind {
    const canvas = canvasRef.current;
    if (!canvas || dur <= 0) return "start";
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const startX = (startSec / dur) * rect.width;
    const endX = ((endSec ?? dur) / dur) * rect.width;
    if (Math.abs(x - startX) <= HANDLE_PX + 4) return "start";
    if (Math.abs(x - endX) <= HANDLE_PX + 4) return "end";
    if (x > startX && x < endX) return "region";
    return x < startX ? "start" : "end";
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dur <= 0 || readOnly || !onChange) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const kind = kindAt(e.clientX);
    const t = secFromClientX(e.clientX);
    if (kind === "region") {
      dragRef.current = { kind, grabOffset: t - startSec };
    } else {
      dragRef.current = { kind };
      if (kind === "start") onChange(Math.min(t, (endSec ?? dur) - 0.05), endSec);
      else onChange(startSec, Math.max(t, startSec + 0.05));
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly || !onChange) return;
    const { kind, grabOffset } = dragRef.current;
    if (!kind || dur <= 0) return;
    const t = secFromClientX(e.clientX);
    const end = endSec ?? dur;
    if (kind === "start") {
      onChange(Math.min(Math.max(0, t), end - 0.05), endSec);
    } else if (kind === "end") {
      onChange(startSec, Math.max(t, startSec + 0.05));
    } else if (kind === "region") {
      const len = end - startSec;
      let nextStart = t - (grabOffset ?? 0);
      nextStart = Math.min(Math.max(0, nextStart), dur - len);
      const nextEnd = nextStart + len;
      onChange(nextStart, nextEnd >= dur - 0.02 ? null : nextEnd);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { kind: null };
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onSeek || dur <= 0) return;
    if (readOnly || e.detail >= 2) {
      onSeek(secFromClientX(e.clientX));
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (readOnly || !onSeek || dur <= 0) return;
    onSeek(secFromClientX(e.clientX));
  }

  return (
    <div ref={wrapRef} className="mt-3">
      {label ? (
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
      ) : null}
      <div className="relative overflow-hidden rounded-xl border border-border bg-background">
        <canvas
          ref={canvasRef}
          className={`block h-24 w-full touch-none sm:h-28 ${
            readOnly ? "cursor-pointer" : "cursor-ew-resize"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onCanvasClick}
          onDoubleClick={onDoubleClick}
        />
        {status === "loading" || status === "idle" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
            Reading waveform…
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
        <span>{readOnly ? formatTime(currentTime ?? 0) : formatTime(startSec)}</span>
        <span>
          {readOnly
            ? dur > 0
              ? formatTime(dur)
              : ""
            : `${formatTime(endSec ?? dur)}${dur > 0 ? ` · ${formatTime(dur)}` : ""}`}
        </span>
      </div>
      {error ? <p className="mt-1 text-[11px] text-foreground">{error}</p> : null}
      <p className="mt-1 text-[11px] text-muted">
        {readOnly
          ? "Click to seek. This is the AAC customers hear after trim/EQ."
          : "Drag the handles to trim. Fade in starts at the left marker; fade out ends at the right marker. Double-click to seek."}
      </p>
    </div>
  );
}
