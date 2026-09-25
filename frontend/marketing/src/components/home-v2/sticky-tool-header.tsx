"use client";

import {
  HOME_V2_START_FREE_HREF,
  HOME_V2_TOOLS,
  type HomeV2ToolId,
} from "@/components/home-v2/constants";
import {
  HOME_V2_SITE_HEADER_SECONDARY,
  HomeV2SiteHeader,
} from "@/components/home-v2/home-v2-site-header";
import { smoothScrollToId } from "@/components/home-v2/use-home-v2-scroll";

type Props = {
  stuck: boolean;
  activeTool: HomeV2ToolId | null;
};

export function StickyToolHeader({ stuck, activeTool }: Props) {
  const tool = HOME_V2_TOOLS.find((t) => t.id === activeTool);
  const ctaLabel = tool?.stickyCta ?? "Start free";
  const ctaHref = tool
    ? `/login?mode=signup&next=${encodeURIComponent(tool.href)}`
    : HOME_V2_START_FREE_HREF;
  const verbLabel = tool?.label ?? null;

  if (!stuck) return null;

  const toolLinks = HOME_V2_TOOLS.filter((t) => t.id !== activeTool).map(
    (t) => ({
      id: t.id,
      label: t.label,
      href: `#tool-${t.id}`,
      onClick: () => smoothScrollToId(`tool-${t.id}`),
    }),
  );

  const mobileToolLinks = HOME_V2_TOOLS.map((t) => ({
    id: t.id,
    label: t.label,
    href: `#tool-${t.id}`,
    onClick: () => smoothScrollToId(`tool-${t.id}`),
  }));

  return (
    <HomeV2SiteHeader
      verbLabel={verbLabel}
      activeTool={activeTool}
      toolLinks={toolLinks}
      secondaryLinks={HOME_V2_SITE_HEADER_SECONDARY}
      mobileToolLinks={mobileToolLinks}
      mobileSecondaryLinks={HOME_V2_SITE_HEADER_SECONDARY}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      position="fixed"
    />
  );
}
