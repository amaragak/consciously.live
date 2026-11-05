import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { restoreTabScroll, saveTabScroll } from "@/lib/tab-scroll";

/** Restore scroll on mount; save on leave. Landing overviews only. */
export function useTabScrollRestore(enabled = true): void {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (!enabled) return;
    restoreTabScroll(pathname);
  }, [pathname, enabled]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      saveTabScroll(pathname);
    };
  }, [pathname, enabled]);
}
