"use client";

import { usePathname } from "next/navigation";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
  useHomeV2Scrolled,
} from "@/components/home-v2/home-v2-scroll-chrome";
import { ReadingProgress } from "@/components/reading-progress";

/**
 * Read field shell — sticky fading header lives inside the field so
 * transparency reveals paisley (and overscroll keeps header with content).
 * Reading progress sits in-flow under the header so its width matches the
 * scrollport (stops before the scrollbar), not the viewport.
 */
export function ReadFieldShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const isPost = /^\/read\/[^/]+/.test(pathname);

  return (
    <HomeV2ScrollChrome>
      <div className="home-v2-field min-h-full">
        <HomeV2Chrome />
        {isPost ? <ReadPostProgress /> : null}
        {children}
      </div>
    </HomeV2ScrollChrome>
  );
}

function ReadPostProgress() {
  const scrolled = useHomeV2Scrolled();
  return <ReadingProgress underStickyHeader visible={scrolled} />;
}
