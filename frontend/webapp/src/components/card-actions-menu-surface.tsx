import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const MOBILE_MQ = "(max-width: 639px)";

function useIsMobileSheet(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_MQ).matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}

type Pos = { top: number; left: number; minWidth: number };

/**
 * Card ⋯ menu surface: bottom sheet on narrow layouts (above tab bar + audio
 * strip), flip-to-fit flyout on desktop. Portaled to document.body.
 */
export function CardActionsMenuSurface({
  open,
  onClose,
  title,
  anchorRef,
  desktopAnchorRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Shown at the top of the mobile sheet so it's clear which card it is for. */
  title: string;
  /** Trigger used for outside-click ignore + desktop placement (or when desktopAnchorRef omitted). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Optional desktop trigger when mobile and desktop ⋯ buttons differ. */
  desktopAnchorRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const mobile = useIsMobileSheet();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!open || mobile) {
      setPos(null);
      return;
    }
    const place = () => {
      const panel = panelRef.current;
      const anchor =
        desktopAnchorRef?.current ?? anchorRef.current;
      if (!panel || !anchor) return;
      const r = anchor.getBoundingClientRect();
      const h = panel.offsetHeight;
      const w = Math.max(panel.offsetWidth, 200);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 6;
      let top = r.bottom + gap;
      if (top + h > vh - 8) {
        top = Math.max(8, r.top - h - gap);
      }
      // Prefer right-aligned to the trigger; flip left if it would clip.
      let left = r.right - w;
      if (left < 8) left = Math.min(r.left, vw - w - 8);
      left = Math.max(8, Math.min(left, vw - w - 8));
      setPos({ top, left, minWidth: w });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, mobile, anchorRef, desktopAnchorRef, children]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (mobile) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (
        panelRef.current?.contains(t) ||
        anchorRef.current?.contains(t) ||
        desktopAnchorRef?.current?.contains(t)
      ) {
        return;
      }
      onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDown, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobile, onClose, anchorRef, desktopAnchorRef]);

  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  if (mobile) {
    return createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Dismiss"
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative z-[1] flex max-h-[min(85dvh,640px)] w-full flex-col rounded-t-2xl border border-border bg-card shadow-[0_-12px_40px_rgba(15,27,45,0.18)]"
          style={{
            transform: `translateY(${dragY}px)`,
            transition:
              dragStartY.current == null ? "transform 180ms ease-out" : "none",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2 active:cursor-grabbing"
            onTouchStart={(e) => {
              dragStartY.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchMove={(e) => {
              const start = dragStartY.current;
              const y = e.touches[0]?.clientY;
              if (start == null || y == null) return;
              setDragY(Math.max(0, y - start));
            }}
            onTouchEnd={() => {
              const y = dragY;
              dragStartY.current = null;
              if (y > 80) onClose();
              else setDragY(0);
            }}
            onTouchCancel={() => {
              dragStartY.current = null;
              setDragY(0);
            }}
          >
            <span
              aria-hidden
              className="mb-2 h-1 w-10 rounded-full bg-border"
            />
            <p className="w-full truncate px-4 pb-2 text-center text-[13px] font-semibold text-foreground">
              {title}
            </p>
          </div>
          <div
            role="menu"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1"
          >
            {children}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className="fixed z-[200] max-h-[min(80vh,520px)] overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card py-1 shadow-xl isolate"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        minWidth: pos?.minWidth ?? 200,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Full-width touch rows for the mobile sheet (≥48px). */
export const CARD_MENU_SHEET_ITEM_CLASS =
  "flex w-full min-h-12 cursor-pointer items-center gap-2.5 px-4 py-3 text-left text-[15px] text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-40";

/** Compact desktop flyout rows. */
export const CARD_MENU_FLYOUT_ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-40";
