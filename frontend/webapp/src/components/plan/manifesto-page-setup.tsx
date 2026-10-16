/**
 * Page card for the manifesto poster: paged or pageless, and paper size.
 */

import { ChevronRight, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  MANIFESTO_PAGE_SPEC,
  primaryPageSizes,
  type ManifestoPageMode,
  type ManifestoPageSize,
} from "@/lib/manifesto-print";

const LABEL =
  "text-[10px] font-semibold uppercase tracking-[1.4px] text-muted";

function PageOutline({
  size,
  selected,
}: {
  size: ManifestoPageSize;
  selected: boolean;
}) {
  const spec = MANIFESTO_PAGE_SPEC[size];
  const ratio = spec.logicalW / spec.logicalH;
  const tall = ratio < 1;
  const width = tall ? Math.round(34 * ratio) : 22;
  const height = tall ? 34 : Math.round(22 / ratio);
  return (
    <span className="flex h-[34px] items-center justify-center">
      <span
        aria-hidden
        className={selected ? "border-accent-link bg-accent-soft" : "border-muted bg-card"}
        style={{
          width,
          height,
          borderWidth: 1.5,
          borderStyle: "solid",
          borderRadius: 2,
        }}
      />
    </span>
  );
}

export function PageSetupControls({
  mode,
  size,
  locale,
  doesntFit,
  onMode,
  onSize,
}: {
  mode: ManifestoPageMode;
  size: ManifestoPageSize;
  locale?: string;
  doesntFit?: boolean;
  onMode: (mode: ManifestoPageMode) => void;
  onSize: (size: ManifestoPageSize) => void;
}) {
  const primary = primaryPageSizes(locale);
  const hiddenSelected = !primary.includes(size);
  const [more, setMore] = useState(hiddenSelected);
  const shown = more || hiddenSelected
    ? (["a", "letter", "tabloid", "phone"] as const)
    : primary;

  return (
    <div className="flex flex-col gap-3">
      <span className={LABEL}>Page</span>
      <div
        role="radiogroup"
        aria-label="Page format"
        className="flex rounded-full bg-surface-2 p-[3px]"
      >
        {(
          [
            ["paged", "Paged"],
            ["pageless", "Pageless"],
          ] as const
        ).map(([id, label]) => {
          const on = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onMode(id)}
              className={`h-8 min-w-0 flex-1 cursor-pointer rounded-full text-[13px] font-semibold ${
                on
                  ? "bg-card text-foreground shadow-[0_1px_3px_rgba(15,27,45,0.16)]"
                  : "text-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {mode === "paged" ? (
        <>
          <span className="text-xs font-semibold text-muted">Size</span>
          <div
            role="radiogroup"
            aria-label="Page size"
            className="flex gap-1.5"
          >
            {shown.map((id) => {
              const spec = MANIFESTO_PAGE_SPEC[id];
              const on = size === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onSize(id)}
                  className={`flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-xl px-1 pb-2 pt-2.5 text-center ${
                    on
                      ? "border-[1.5px] border-accent bg-accent-soft"
                      : "border border-border bg-card"
                  }`}
                >
                  <PageOutline size={id} selected={on} />
                  <span className="text-xs font-semibold leading-tight text-foreground">
                    {spec.label}
                  </span>
                  <span className="text-[11px] leading-tight text-muted">
                    {spec.sub}
                  </span>
                </button>
              );
            })}
          </div>
          {hiddenSelected ? null : (
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-0.5 self-start text-xs font-semibold text-accent-link"
            >
              {more ? "Fewer sizes" : "More sizes"}
              <ChevronRight
                className={`h-3.5 w-3.5 ${more ? "rotate-90" : ""}`}
                strokeWidth={1.8}
                aria-hidden
              />
            </button>
          )}
          {doesntFit ? (
            <p className="text-xs leading-snug text-accent-link">
              Doesn’t fit on one page. Hide sections in Arrangement, or use
              Pageless.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-xs leading-snug text-muted">
          One continuous sheet that fits your screen. Saves as a single tall
          image.
        </p>
      )}
    </div>
  );
}

export function PageSetupCard(props: {
  mode: ManifestoPageMode;
  size: ManifestoPageSize;
  locale?: string;
  doesntFit?: boolean;
  onMode: (mode: ManifestoPageMode) => void;
  onSize: (size: ManifestoPageSize) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5">
      <PageSetupControls {...props} />
    </div>
  );
}

/** Full-screen paged viewer: pinch, drag, double-tap between fit and 100%. */
export function ManifestoPageViewer({
  children,
  logicalW,
  logicalH,
  onClose,
}: {
  children: ReactNode;
  logicalW: number;
  logicalH: number;
  onClose: () => void;
}) {
  const fit = () => {
    const w = window.innerWidth - 24;
    const h = window.innerHeight - 24;
    return Math.min(w / logicalW, h / logicalH);
  };
  const [scale, setScale] = useState(fit);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pct, setPct] = useState<number | null>(null);
  const hidePct = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    scale: number;
    dist: number;
    pan: { x: number; y: number };
    x: number;
    y: number;
  } | null>(null);

  function showPct(next: number) {
    setPct(Math.round(next * 100));
    if (hidePct.current) window.clearTimeout(hidePct.current);
    hidePct.current = window.setTimeout(() => setPct(null), 1000);
  }

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const state = history.state as { manifestoPageViewer?: number } | null;
      if (state?.manifestoPageViewer) history.back();
      onCloseRef.current();
    };
    history.pushState({ manifestoPageViewer: 1 }, "");
    const onPop = () => onCloseRef.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  function close() {
    if (history.state && (history.state as { manifestoPageViewer?: number }).manifestoPageViewer) {
      history.back();
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 touch-none bg-marketing-ink"
      onDoubleClick={() => {
        const fitted = fit();
        const next = Math.abs(scale - fitted) < 0.04 ? 1 : fitted;
        setScale(next);
        setPan({ x: 0, y: 0 });
        showPct(next);
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...pointers.current.values()];
        gesture.current = {
          scale,
          dist:
            pts.length >= 2
              ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y)
              : 0,
          pan,
          x: e.clientX,
          y: e.clientY,
        };
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !gesture.current) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...pointers.current.values()];
        if (pts.length >= 2 && gesture.current.dist > 0) {
          const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
          const next = Math.min(
            4,
            Math.max(fit(), (gesture.current.scale * dist) / gesture.current.dist),
          );
          setScale(next);
          showPct(next);
          return;
        }
        setPan({
          x: gesture.current.pan.x + (e.clientX - gesture.current.x),
          y: gesture.current.pan.y + (e.clientY - gesture.current.y),
        });
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) gesture.current = null;
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute left-3.5 top-3.5 z-10 flex size-[38px] cursor-pointer items-center justify-center rounded-full text-white"
        style={{ background: "color-mix(in srgb, var(--marketing-ink) 70%, transparent)" }}
      >
        <X className="size-4" strokeWidth={1.8} aria-hidden />
      </button>
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: logicalW,
          height: logicalH,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        }}
      >
        {children}
      </div>
      {pct != null ? (
        <div
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
          style={{ background: "color-mix(in srgb, var(--marketing-ink) 70%, transparent)" }}
        >
          {pct}%
        </div>
      ) : null}
    </div>
  );
}

export function PageZoomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="View full screen"
      onClick={onClick}
      className="absolute bottom-2.5 right-2.5 z-10 flex size-[34px] cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-[0_2px_8px_rgba(15,27,45,0.12)]"
    >
      <ZoomIn className="size-4" strokeWidth={1.8} aria-hidden />
    </button>
  );
}
