import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SOUND_CARD_COVER_ASPECT } from "@/lib/medimade-api";

/**
 * Drag a 4:1 window over the full cover — same aspect as Create · Sound card.
 * `value` / `onChange` are CSS object-position Y percentages (0–100).
 */
export function CompositionCoverWideCropper({
  imageUrl,
  value,
  onChange,
  disabled,
}: {
  imageUrl: string;
  value: number;
  onChange: (y: number) => void;
  disabled?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const clampY = useCallback((n: number) => Math.min(100, Math.max(0, Math.round(n))), []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, startValue: value };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !stageRef.current) return;
    const stageH = stageRef.current.getBoundingClientRect().height;
    if (!(stageH > 0)) return;
    // Full travel of the window ≈ image height; map px → 0–100.
    const deltaPct = ((e.clientY - dragRef.current.startY) / stageH) * 100;
    onChange(clampY(dragRef.current.startValue + deltaPct));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const aspectLabel = `${SOUND_CARD_COVER_ASPECT}:1`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          Widescreen crop for Create · Sound ({aspectLabel}) — drag the band
        </span>
        <span className="tabular-nums">{clampY(value)}%</span>
      </div>
      <div
        ref={stageRef}
        className="relative mx-auto w-full max-w-xl overflow-hidden rounded-xl bg-black/80 select-none"
        style={{
          aspectRatio: natural
            ? `${natural.w} / ${natural.h}`
            : "1 / 1",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        {/* Dim outside the 4:1 band; band uses object-position math via overlay height. */}
        <WideCropOverlay value={clampY(value)} natural={natural} />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Sound card preview
        </p>
        <div
          className="relative mx-3 mb-3 mt-1 overflow-hidden rounded-lg bg-accent-soft"
          style={{ aspectRatio: `${SOUND_CARD_COVER_ASPECT} / 1` }}
        >
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `center ${clampY(value)}%` }}
          />
          <span className="absolute inset-0 bg-gradient-to-b from-foreground/5 to-foreground/45" />
          <p className="absolute left-3 top-2.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-white">
            Sound
          </p>
        </div>
      </div>
    </div>
  );
}

function WideCropOverlay({
  value,
  natural,
}: {
  value: number;
  natural: { w: number; h: number } | null;
}) {
  // Band height as % of image height when width is filled (object-fit cover in 4:1).
  const bandHPct = natural
    ? Math.min(100, (natural.w / SOUND_CARD_COVER_ASPECT / natural.h) * 100)
    : 100 / SOUND_CARD_COVER_ASPECT;
  // object-position Y%: 0 aligns top, 100 aligns bottom of overflow.
  // Visible band top = value * (1 - bandH/100) as % of image.
  const travel = 100 - bandHPct;
  const topPct = (value / 100) * travel;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-black/55"
        style={{ height: `${topPct}%` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55"
        style={{ height: `${Math.max(0, 100 - topPct - bandHPct)}%` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 border-y-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
        style={{
          top: `${topPct}%`,
          height: `${bandHPct}%`,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
        }}
      >
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            Drag · {SOUND_CARD_COVER_ASPECT}:1
          </span>
        </div>
      </div>
    </>
  );
}
