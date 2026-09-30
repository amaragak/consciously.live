"use client";

import type { HomeV2ToolId } from "@/components/home-v2/constants";
import { HomeV2NavHeader } from "@/components/home-v2/home-v2-nav-header";

type Props = {
  stuck: boolean;
  activeTool: HomeV2ToolId | null;
};

/** Homepage scroll sticky — same SiteHeader as Read/Connect via NavHeader. */
export function StickyToolHeader({ stuck, activeTool }: Props) {
  if (!stuck) return null;
  return (
    <HomeV2NavHeader
      home
      tone="solid"
      position="fixed"
      activeTool={activeTool}
    />
  );
}
