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
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { smoothScrollToId } from "@/components/home-v2/use-home-v2-scroll";

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
      ctaLabel: "Start free →",
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
      ctaLabel: "Start free →",
    };
  }
  if (sectionActive(pathname, HOME_V2_CONNECT_HREF)) {
    return {
      verbLabel: "Connect",
      activeTool: null,
      activeSecondary: "connect",
      ctaHref: HOME_V2_START_FREE_HREF,
      ctaLabel: "Start free →",
    };
  }
  return {
    verbLabel: null,
    activeTool: null,
    activeSecondary: null,
    ctaHref: HOME_V2_START_FREE_HREF,
    ctaLabel: "Start free →",
  };
}

/**
 * Shared SiteHeader wiring for marketing pages.
 * `home` uses in-page tool anchors; otherwise path-based tool routes.
 */
export function HomeV2NavHeader({
  tone = "solid",
  position = "sticky",
  home = false,
  activeTool: activeToolOverride,
}: {
  tone?: "solid" | "transparent";
  position?: "fixed" | "sticky" | "static";
  /** Homepage: tool links scroll to `#tool-*` sections. */
  home?: boolean;
  /** Homepage sticky: highlight the section in view. */
  activeTool?: HomeV2ToolId | null;
} = {}) {
  const pathname = usePathname() || "/";
  const resolved = resolveNav(pathname);
  const activeTool = home
    ? (activeToolOverride ?? null)
    : resolved.activeTool;
  const verbLabel = home
    ? HOME_V2_TOOLS.find((t) => t.id === activeTool)?.label ?? null
    : resolved.verbLabel;
  const activeSecondary = home ? null : resolved.activeSecondary;
  const tool = HOME_V2_TOOLS.find((t) => t.id === activeTool);
  const ctaHref = home
    ? tool
      ? `/login?mode=signup&next=${encodeURIComponent(tool.href)}`
      : HOME_V2_START_FREE_HREF
    : resolved.ctaHref;
  const ctaLabel = home
    ? (tool?.stickyCta ?? "Start free →")
    : resolved.ctaLabel;

  const toolLinks = HOME_V2_TOOLS.map((t) =>
    home
      ? {
          id: t.id,
          label: t.label,
          href: `#tool-${t.id}`,
          onClick: () => smoothScrollToId(`tool-${t.id}`),
        }
      : {
          id: t.id,
          label: t.label,
          href: t.href,
        },
  );
  const ctaIcon = activeTool ? (
    <HomeV2ToolIcon tool={activeTool} />
  ) : undefined;

  return (
    <HomeV2SiteHeader
      verbLabel={verbLabel}
      activeTool={activeTool}
      activeSecondary={activeSecondary}
      toolLinks={toolLinks}
      secondaryLinks={HOME_V2_SITE_HEADER_SECONDARY}
      mobileToolLinks={toolLinks}
      mobileSecondaryLinks={HOME_V2_SITE_HEADER_SECONDARY}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
      ctaIcon={ctaIcon}
      position={position}
      tone={tone}
    />
  );
}
