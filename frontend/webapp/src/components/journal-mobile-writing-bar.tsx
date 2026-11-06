"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import {
  APP_MOBILE_TAB_BAR_H_PX,
  APP_MOBILE_TAB_PILL_INSET_PX,
  mobileTabContentClearancePx,
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
 * Floating writing tools pill — same slot as the tab bar. Stays visible and
 * rides above the keyboard (native overlay + visualViewport). While the
 * keyboard is open, appends a hide-keyboard control on the far right.
 */
export function JournalMobileWritingBar({ children }: Props) {
  const [bottomPx, setBottomPx] = useState(readMobileTabPillBottomOffsetPx());
  const [keyboardOpen, setKeyboardOpen] = useState(readViewportKeyboardOpen);

  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      const occluded =
        vv != null
          ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
          : 0;
      const open =
        (isNativeApp() && isNativeKeyboardOpen()) || occluded > 80;
      setKeyboardOpen(open);
      if (occluded > 80) {
        const bottom = Math.max(8, occluded + 8);
        setBottomPx(bottom);
        setAppMobileTabBarState({
          visible: true,
          offsetPx: APP_MOBILE_TAB_BAR_H_PX + bottom + 8,
          bottomOffsetPx: bottom,
        });
        return;
      }
      if (isNativeApp() && isNativeKeyboardOpen()) {
        /* native event handler sets bottom from keyboard height */
        return;
      }
      const bottomOffsetPx = readMobileTabPillBottomOffsetPx();
      setBottomPx(bottomOffsetPx);
      setAppMobileTabBarState({
        visible: true,
        offsetPx: mobileTabContentClearancePx(),
        bottomOffsetPx,
      });
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    const onNative = (e: Event) => {
      const detail = (e as CustomEvent<NativeKeyboardDetail>).detail;
      setKeyboardOpen(detail.open);
      if (detail.open) {
        const h = detail.heightPx ?? 0;
        setBottomPx(Math.max(8, h + 8));
        setAppMobileTabBarState({
          visible: true,
          offsetPx: APP_MOBILE_TAB_BAR_H_PX + Math.max(8, h + 8) + 8,
          bottomOffsetPx: Math.max(8, h + 8),
        });
      } else {
        sync();
      }
    };
    if (isNativeApp()) {
      if (isNativeKeyboardOpen()) {
        /* sync() already ran; native event will refine */
      }
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
  }, []);

  const pill = (
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
            aria-label="Hide keyboard"
            title="Hide keyboard"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-accent/40 hover:text-foreground"
            onMouseDown={(e) => {
              // Keep caret/selection in the editor; don't steal focus first.
              e.preventDefault();
            }}
            onClick={() => hideSoftwareKeyboard()}
          >
            <ChevronDown aria-hidden className="size-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(pill, document.body)
    : pill;
}
