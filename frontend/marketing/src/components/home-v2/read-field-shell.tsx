"use client";

import { usePathname } from "next/navigation";
import { HomeV2ScrollChrome } from "@/components/home-v2/home-v2-scroll-chrome";
import { HomeV2TopChrome } from "@/components/home-v2/home-v2-top-chrome";

/**
 * Read field shell — shared translucent top chrome + scroll sticky.
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
        <div className="px-5 md:px-6">
          <HomeV2TopChrome />
        </div>
        {children}
      </div>
    </HomeV2ScrollChrome>
  );
}
