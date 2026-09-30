"use client";

import { usePathname } from "next/navigation";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
} from "@/components/home-v2/home-v2-scroll-chrome";

/**
 * Read field shell — sticky fading header lives inside the field so
 * transparency reveals paisley (and overscroll keeps header with content).
 */
export function ReadFieldShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const isPost = /^\/read\/[^/]+/.test(pathname);

  return (
    <HomeV2ScrollChrome showReadingProgress={isPost}>
      <div className="home-v2-field min-h-full">
        <HomeV2Chrome />
        {children}
      </div>
    </HomeV2ScrollChrome>
  );
}
