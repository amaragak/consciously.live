"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { scrollAppToTop } from "@/lib/scroll-app";

/** Scroll the app shell to top on every client-side route change. */
export function ScrollToTopOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    scrollAppToTop("auto");
  }, [pathname]);

  return null;
}
