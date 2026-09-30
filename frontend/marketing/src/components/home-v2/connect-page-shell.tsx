"use client";

import { usePathname } from "next/navigation";
import { HomeV2NavHeader } from "@/components/home-v2/home-v2-nav-header";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
} from "@/components/home-v2/home-v2-scroll-chrome";

/**
 * Connect shell — landing: sticky fading chrome over hero; nested routes:
 * solid sticky header.
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

  return (
    <HomeV2ScrollChrome>
      <div className="relative">
        <HomeV2Chrome />
        {children}
      </div>
    </HomeV2ScrollChrome>
  );
}
