"use client";

import { usePathname } from "next/navigation";
import "@/components/home-v2/home-v2.css";
import {
  HOME_V2_CONNECT_HREF,
  HOME_V2_LISTEN_HREF,
  HOME_V2_READ_HREF,
  HOME_V2_START_FREE_HREF,
  HOME_V2_TOOLS,
  type HomeV2ToolId,
} from "@/components/home-v2/constants";
import {
  HOME_V2_SITE_HEADER_SECONDARY,
  HomeV2SiteHeader,
  type HomeV2SiteHeaderSecondaryId,
} from "@/components/home-v2/home-v2-site-header";

function sectionActive(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function resolveNav(pathname: string): {
  verbLabel: string | null;
  activeTool: HomeV2ToolId | null;
  activeSecondary: HomeV2SiteHeaderSecondaryId | null;
  ctaHref: string;
  ctaLabel: string;
} {
  const tool = HOME_V2_TOOLS.find((t) => sectionActive(pathname, t.href));
  if (tool) {
    return {
      verbLabel: tool.label,
      activeTool: tool.id,
      activeSecondary: null,
      ctaHref: `/login?mode=signup&next=${encodeURIComponent(tool.href)}`,
      ctaLabel: tool.stickyCta,
    };
  }
  if (sectionActive(pathname, HOME_V2_LISTEN_HREF)) {
    return {
      verbLabel: "Listen",
      activeTool: null,
      activeSecondary: "listen",
      ctaHref: HOME_V2_START_FREE_HREF,
      ctaLabel: "Start free",
    };
  }
  if (
    sectionActive(pathname, HOME_V2_READ_HREF) ||
    sectionActive(pathname, "/blog")
  ) {
    return {
      verbLabel: "Read",
      activeTool: null,
      activeSecondary: "read",
      ctaHref: HOME_V2_START_FREE_HREF,
      ctaLabel: "Start free",
    };
  }
  if (sectionActive(pathname, HOME_V2_CONNECT_HREF)) {
    return {
      verbLabel: "Connect",
      activeTool: null,
      activeSecondary: "connect",
      ctaHref: HOME_V2_START_FREE_HREF,
      ctaLabel: "Start free",
    };
  }
  return {
    verbLabel: null,
    activeTool: null,
    activeSecondary: null,
    ctaHref: HOME_V2_START_FREE_HREF,
    ctaLabel: "Start free",
  };
}

/**
 * Site-wide marketing header matching homepage-v2 chrome.
 * Used on every Next marketing page except `/` (hero owns that) and `/legacy/*`.
 */
export function HomeV2NavHeader() {
  const pathname = usePathname() || "/";
  const { verbLabel, activeTool, activeSecondary, ctaHref, ctaLabel } =
    resolveNav(pathname);

  const toolLinks = HOME_V2_TOOLS.filter((t) => t.id !== activeTool).map(
    (t) => ({ id: t.id, label: t.label, href: t.href }),
  );
  const secondaryLinks = HOME_V2_SITE_HEADER_SECONDARY.filter(
    (s) => s.id !== activeSecondary,
  );

  return (
    <HomeV2SiteHeader
      verbLabel={verbLabel}
      activeTool={activeTool}
      activeSecondary={activeSecondary}
      toolLinks={toolLinks}
      secondaryLinks={secondaryLinks}
      mobileToolLinks={HOME_V2_TOOLS.map((t) => ({
        id: t.id,
        label: t.label,
        href: t.href,
      }))}
      mobileSecondaryLinks={HOME_V2_SITE_HEADER_SECONDARY}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      position="sticky"
    />
  );
}
