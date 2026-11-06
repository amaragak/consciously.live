"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  APP_MOBILE_TAB_BAR_H_PX,
  APP_MOBILE_TAB_PILL_INSET_PX,
  readMobileTabPillBottomOffsetPx,
  setAppMobileTabBarState,
} from "@/lib/app-mobile-tab-bar";
import {
  NATIVE_KEYBOARD_EVENT,
  hideSoftwareKeyboard,
  isNativeApp,
  isNativeKeyboardOpen,
  type NativeKeyboardDetail,
} from "@/lib/native/native-bridge";

type Props = {
  children: ReactNode;
  /**
   * When true (journal entry with Keyboard.resize native), the pill docks to
   * the bottom of the resized web view — do not also lift by keyboard height.
   */
  nativeResize?: boolean;
  /** Notify parent when the software keyboard is open (for Done / Prompts). */
  onKeyboardOpenChange?: (open: boolean) => void;
};

function readViewportKeyboardOpen(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp() && isNativeKeyboardOpen()) return true;
  const vv = window.visualViewport;
  if (!vv) return false;
  const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  return occluded > 80;
}

/**
 * Floating writing tools pill — same slot as the tab bar. Stays visible above
 * the keyboard. While the keyboard is open, shows a clear Done control.
 */
export function JournalMobileWritingBar({
  children,
  nativeResize = false,
  onKeyboardOpenChange,
}: Props) {
  const [bottomPx, setBottomPx] = useState(readMobileTabPillBottomOffsetPx());
  const [keyboardOpen, setKeyboardOpen] = useState(readViewportKeyboardOpen);

  useEffect(() => {
    onKeyboardOpenChange?.(keyboardOpen);
  }, [keyboardOpen, onKeyboardOpenChange]);

  useEffect(() => {
    // offsetPx: 0 — do not reserve solid main padding behind the pill; the
    // entry card scrolls underneath with only a soft fade (see veil below).
    const dockBottom = () => {
      const bottomOffsetPx = readMobileTabPillBottomOffsetPx();
      setBottomPx(bottomOffsetPx);
      setAppMobileTabBarState({
        visible: true,
        offsetPx: 0,
        bottomOffsetPx,
      });
    };

    const sync = () => {
      const vv = window.visualViewport;
      const occluded =
        vv != null
          ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
          : 0;
      const open =
        (isNativeApp() && isNativeKeyboardOpen()) || occluded > 80;
      setKeyboardOpen(open);

      // Native resize / Android adjustResize: web view already ends above the
      // keyboard — keep the pill at the viewport bottom.
      if (nativeResize && isNativeApp()) {
        dockBottom();
        return;
      }

      if (occluded > 80) {
        const bottom = Math.max(8, occluded + 8);
        setBottomPx(bottom);
        setAppMobileTabBarState({
          visible: true,
          offsetPx: 0,
          bottomOffsetPx: bottom,
        });
        return;
      }
      if (isNativeApp() && isNativeKeyboardOpen()) {
        /* native event handler sets bottom from keyboard height when overlaying */
        return;
      }
      dockBottom();
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    const onNative = (e: Event) => {
      const detail = (e as CustomEvent<NativeKeyboardDetail>).detail;
      setKeyboardOpen(detail.open);
      if (nativeResize && isNativeApp()) {
        dockBottom();
        return;
      }
      if (detail.open) {
        const h = detail.heightPx ?? 0;
        setBottomPx(Math.max(8, h + 8));
        setAppMobileTabBarState({
          visible: true,
          offsetPx: 0,
          bottomOffsetPx: Math.max(8, h + 8),
        });
      } else {
        sync();
      }
    };
    if (isNativeApp()) {
      window.addEventListener(NATIVE_KEYBOARD_EVENT, onNative);
    }

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener(NATIVE_KEYBOARD_EVENT, onNative);
      setAppMobileTabBarState({
        visible: false,
        offsetPx: 0,
        bottomOffsetPx: 0,
      });
    };
  }, [nativeResize]);

  const chrome = (
    <>
      {/* Soft fade only — entry text stays visible under / around the pill. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 z-[119] md:hidden"
        style={{
          bottom: bottomPx,
          height: APP_MOBILE_TAB_BAR_H_PX + 24,
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--background) 42%, transparent), transparent 70%)",
        }}
      />
      <div
        className="fixed z-[120] border border-border bg-card shadow-[0_10px_28px_-12px_rgb(0_0_0_/_0.35)] md:hidden"
        style={{
          left: APP_MOBILE_TAB_PILL_INSET_PX,
          right: APP_MOBILE_TAB_PILL_INSET_PX,
          bottom: bottomPx,
          height: APP_MOBILE_TAB_BAR_H_PX,
          borderRadius: 9999,
        }}
        role="toolbar"
        aria-label="Writing tools"
      >
        <div className="flex h-full w-full items-center gap-1 px-2">
          {children}
          {keyboardOpen ? (
            <button
              type="button"
              aria-label="Done"
              title="Done"
              className="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-accent/40"
              onMouseDown={(e) => {
                // Keep caret/selection in the editor; don't steal focus first.
                e.preventDefault();
              }}
              onClick={() => hideSoftwareKeyboard()}
            >
              Done
            </button>
          ) : null}
        </div>
      </div>
    </>
  );

  return typeof document !== "undefined"
    ? createPortal(chrome, document.body)
    : chrome;
}
