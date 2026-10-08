import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type MarqueeSyncValue = {
  maxCycle: number;
  reportCycle: (key: string, cyclePx: number) => void;
};

const MarqueeSyncContext = createContext<MarqueeSyncValue | null>(null);

/** Hold at start before the shared one-way cycle. */
const HOLD_START = 0.12;
/** Scroll left through one full loop (same speed for every title). */
const SCROLL = 0.76;

const SCROLL_PX_PER_MS = 0.035;
const MIN_SCROLL_MS = 2800;
const HOLD_START_MS = 1400;
const HOLD_END_MS = 1200;
/** Gap between duplicated titles in the seamless loop. */
const LOOP_GAP_PX = 28;

function cycleMsForMaxCycle(maxCycle: number): number {
  if (maxCycle <= 0) return 8000;
  const scrollMs = Math.max(MIN_SCROLL_MS, maxCycle / SCROLL_PX_PER_MS);
  return HOLD_START_MS + scrollMs + HOLD_END_MS;
}

/**
 * Shared one-way marquee timeline. Each title loops left (duplicated text) at
 * the same speed; shorter cycles finish early and wait at the start until the
 * longest completes, then all restart together.
 *
 * List changes (filters) are handled by mount/unmount reports — do not wipe the
 * map on resetKey or surviving titles never re-register and animation dies.
 */
export function SyncedMarqueeProvider({
  children,
  className,
}: {
  children: ReactNode;
  /** @deprecated Unused; kept so call sites need not change. */
  resetKey?: string | number;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cyclesRef = useRef(new Map<string, number>());
  const [maxCycle, setMaxCycle] = useState(0);

  const reportCycle = useCallback((key: string, cyclePx: number) => {
    const prev = cyclesRef.current.get(key);
    const next = Math.max(0, Math.round(cyclePx));
    if (prev === next) return;
    if (next <= 0) cyclesRef.current.delete(key);
    else cyclesRef.current.set(key, next);
    let max = 0;
    for (const v of cyclesRef.current.values()) max = Math.max(max, v);
    setMaxCycle((m) => (m === max ? m : max));
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || maxCycle <= 0) {
      root?.style.setProperty("--marquee-p", "0");
      return;
    }
    const cycleMs = cycleMsForMaxCycle(maxCycle);
    let raf = 0;
    const tick = () => {
      const t = (Date.now() % cycleMs) / cycleMs;
      let p = 0;
      if (t < HOLD_START) p = 0;
      else if (t < HOLD_START + SCROLL) p = (t - HOLD_START) / SCROLL;
      else p = 1;
      root.style.setProperty("--marquee-p", p.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [maxCycle]);

  const value = useMemo(
    () => ({ maxCycle, reportCycle }),
    [maxCycle, reportCycle],
  );

  return (
    <MarqueeSyncContext.Provider value={value}>
      <div ref={rootRef} className={className} data-synced-marquee="">
        {children}
      </div>
    </MarqueeSyncContext.Provider>
  );
}

export function SyncedMarqueeTitle({
  id,
  text,
  className = "",
}: {
  id: string;
  text: string;
  className?: string;
}) {
  const sync = useContext(MarqueeSyncContext);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const firstRef = useRef<HTMLSpanElement | null>(null);
  const [cyclePx, setCyclePx] = useState(0);
  const reportCycle = sync?.reportCycle;
  const maxCycle = sync?.maxCycle ?? 0;

  // Always keep the duplicated track in the DOM so filter remounts / measure
  // flips never tear down refs mid-cycle. Truncation is visual via overflow.
  useLayoutEffect(() => {
    if (!reportCycle) return;
    const wrap = wrapRef.current;
    const first = firstRef.current;
    if (!wrap || !first) return;

    const measure = () => {
      const textW = first.scrollWidth;
      const o = Math.max(0, textW - wrap.clientWidth);
      const cycle = o > 1 ? textW + LOOP_GAP_PX : 0;
      setCyclePx(cycle);
      reportCycle(id, cycle);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(first);
    return () => {
      ro.disconnect();
      reportCycle(id, 0);
    };
  }, [id, text, reportCycle]);

  const active = cyclePx > 1 && maxCycle > 1;

  useEffect(() => {
    if (!active) {
      if (trackRef.current) trackRef.current.style.transform = "translateX(0px)";
      return;
    }
    const wrap = wrapRef.current;
    const root = wrap?.closest("[data-synced-marquee]") as HTMLElement | null;
    const track = trackRef.current;
    if (!root || !track) return;

    let raf = 0;
    const tick = () => {
      const p = Number.parseFloat(
        root.style.getPropertyValue("--marquee-p") || "0",
      );
      const distance = p * maxCycle;
      const x = distance < cyclePx ? distance : 0;
      track.style.transform = `translateX(${(-x).toFixed(2)}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, cyclePx, maxCycle]);

  return (
    <span
      ref={wrapRef}
      className={`block w-full min-w-0 overflow-hidden ${
        active ? "" : "truncate"
      } ${className}`}
      title={text}
    >
      <span
        ref={trackRef}
        className="inline-flex max-w-none items-baseline whitespace-nowrap will-change-transform"
      >
        <span ref={firstRef} className="inline-block whitespace-nowrap">
          {text}
        </span>
        {cyclePx > 1 ? (
          <>
            <span
              className="inline-block shrink-0"
              style={{ width: LOOP_GAP_PX }}
              aria-hidden
            />
            <span className="inline-block whitespace-nowrap" aria-hidden>
              {text}
            </span>
          </>
        ) : null}
      </span>
    </span>
  );
}
