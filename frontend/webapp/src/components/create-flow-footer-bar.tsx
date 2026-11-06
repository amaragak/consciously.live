import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { setChatFabFooterInset } from "@/lib/assistant-chat-fab-footer-inset";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  APP_MOBILE_TAB_BAR_GAP_PX,
  APP_MOBILE_TAB_BAR_H_PX,
  APP_MOBILE_TAB_PILL_INSET_PX,
  mobileTabContentClearancePx,
  readMobileTabPillBottomOffsetPx,
  setAppMobileTabBarState,
} from "@/lib/app-mobile-tab-bar";
import {
  NATIVE_KEYBOARD_EVENT,
  isNativeApp,
  isNativeKeyboardOpen,
  type NativeKeyboardDetail,
} from "@/lib/native/native-bridge";

type Props = {
  children: ReactNode;
  /** Extra classes on the outer bar (rarely needed). */
  className?: string;
  /**
   * One-flow mobile: float as the tab-bar replacement pill.
   * Legacy create-workspace keeps the sticky length nav.
   */
  mobileFloating?: boolean;
};

function useKeyboardOccludes(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) {
        setOpen(false);
        return;
      }
      setOpen(window.innerHeight - vv.height > 150);
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    const onNativeKeyboard = (e: Event) => {
      setOpen((e as CustomEvent<NativeKeyboardDetail>).detail.open);
    };
    if (isNativeApp()) {
      setOpen(isNativeKeyboardOpen());
      window.addEventListener(NATIVE_KEYBOARD_EVENT, onNativeKeyboard);
    }

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener(NATIVE_KEYBOARD_EVENT, onNativeKeyboard);
    };
  }, []);
  return open;
}

/**
 * Shared create-flow bottom bar.
 *
 * Desktop: sticky length-nav chrome under the page.
 * Mobile (consciously-mobile-floating-nav): floating pill in the same slot as
 * the tab bar — Back + Next / Create meditation. Reports the same CSS offset
 * vars so page content clears it.
 *
 * Hosts the now-playing strip above the bar when a track plays (desktop /
 * docked create previews).
 */
export function CreateFlowFooterBar({
  children,
  className,
  mobileFloating = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stripHostRef = useRef<HTMLDivElement | null>(null);
  const { setPlayerStripDockHost } = useLibraryPlayer();
  const mdUp = useMinWidth(768);
  const keyboardOpen = useKeyboardOccludes();
  const floatMobile = mobileFloating && !mdUp;

  useLayoutEffect(() => {
    // Mobile create uses in-card / in-row previews — never the mini-player dock.
    if (floatMobile) {
      setPlayerStripDockHost(null);
      return;
    }
    setPlayerStripDockHost(stripHostRef.current);
    return () => setPlayerStripDockHost(null);
  }, [setPlayerStripDockHost, floatMobile]);

  useEffect(() => {
    if (!floatMobile || keyboardOpen) {
      return;
    }
    const bottomOffsetPx = readMobileTabPillBottomOffsetPx();
    setAppMobileTabBarState({
      visible: true,
      offsetPx: mobileTabContentClearancePx(),
      bottomOffsetPx,
    });
    return () =>
      setAppMobileTabBarState({
        visible: false,
        offsetPx: 0,
        bottomOffsetPx: 0,
      });
  }, [floatMobile, keyboardOpen]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const report = () => {
      setChatFabFooterInset(
        floatMobile
          ? APP_MOBILE_TAB_BAR_H_PX +
              readMobileTabPillBottomOffsetPx() +
              APP_MOBILE_TAB_BAR_GAP_PX
          : el.getBoundingClientRect().height,
      );
    };
    report();

    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setChatFabFooterInset(0);
    };
  }, [floatMobile]);

  if (floatMobile) {
    const bottomOffsetPx = readMobileTabPillBottomOffsetPx();
    const pill = (
      <div
        ref={rootRef}
        className={`fixed z-[120] border border-border bg-card shadow-[0_10px_28px_-12px_rgb(0_0_0_/_0.35)] md:hidden ${
          keyboardOpen ? "pointer-events-none translate-y-full opacity-0" : ""
        } ${className ?? ""}`}
        style={{
          left: APP_MOBILE_TAB_PILL_INSET_PX,
          right: APP_MOBILE_TAB_PILL_INSET_PX,
          bottom: bottomOffsetPx,
          height: APP_MOBILE_TAB_BAR_H_PX,
          borderRadius: 9999,
          transition: "transform 180ms ease, opacity 180ms ease",
        }}
        role="navigation"
        aria-label="Create steps"
      >
        <div className="flex h-full w-full items-center gap-1 px-1.5">
          {children}
        </div>
      </div>
    );
    return typeof document !== "undefined"
      ? createPortal(pill, document.body)
      : pill;
  }

  return (
    <div className="relative shrink-0">
      {/* Floats above the length nav; out of flow so page content shows through. */}
      <div
        ref={stripHostRef}
        className="pointer-events-none absolute inset-x-0 bottom-full z-50"
      />
      <div
        ref={rootRef}
        className={[
          "border-t border-border/60 bg-background pt-3 pb-4 sm:pt-4 sm:pb-6",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-6xl items-center gap-2 px-4 sm:min-h-[2.75rem] sm:gap-3 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
