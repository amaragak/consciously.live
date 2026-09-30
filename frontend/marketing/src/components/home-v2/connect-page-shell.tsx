"use client";

import { usePathname } from "next/navigation";
import { HomeV2NavHeader } from "@/components/home-v2/home-v2-nav-header";
import { HomeV2ScrollChrome } from "@/components/home-v2/home-v2-scroll-chrome";

/**
 * Connect shell — landing uses shared scroll sticky (top chrome lives in the
 * hero via `HomeV2TopChrome`); nested routes keep a solid sticky header.
 */
export function ConnectPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const isLanding = pathname === "/connect";

  if (!isLanding) {
    return (
      <div className="home-v2 min-h-full">
        <HomeV2NavHeader tone="solid" position="sticky" />
        {children}
      </div>
    );
  }

  return <HomeV2ScrollChrome>{children}</HomeV2ScrollChrome>;
}
