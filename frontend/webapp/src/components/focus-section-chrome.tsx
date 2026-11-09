"use client";

import { useLocation, useNavigate } from "react-router-dom";
import { AppPrimaryTabsDesktop } from "@/components/app-primary-tabs";
import {
  MobileHeaderSubPillPortal,
  MobileHeaderSubPillTabs,
} from "@/components/mobile-header-sub-pill";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  HEADER_SECTION_TABS_IDLE,
  HEADER_SECTION_TABS_SELECTED,
  HEADER_SECTION_TABS_TRACK,
} from "@/components/header-section-tabs";
import { useMinWidth } from "@/hooks/use-min-width";

export const FOCUS_SECTION_HREF = {
  timer: "/focus",
  history: "/focus/history",
  insights: "/focus/insights",
} as const;

export type FocusSectionId = keyof typeof FOCUS_SECTION_HREF;

export const FOCUS_SECTION_TABS = [
  { id: "timer" as const, label: "Timer" },
  { id: "history" as const, label: "History" },
  { id: "insights" as const, label: "Insights" },
];

export function focusSectionFromPath(pathname: string): FocusSectionId {
  if (pathname.startsWith("/focus/history")) return "history";
  if (pathname.startsWith("/focus/insights")) return "insights";
  return "timer";
}

export function FocusSectionTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMinWidth(768);
  const section = focusSectionFromPath(location.pathname);

  const tabs = (
    <SegmentedPillTabs
      aria-label="Focus section"
      value={section}
      onChange={(id) => navigate(FOCUS_SECTION_HREF[id as FocusSectionId])}
      className={HEADER_SECTION_TABS_TRACK}
      idleClassName={HEADER_SECTION_TABS_IDLE}
      selectedClassName={HEADER_SECTION_TABS_SELECTED}
      options={FOCUS_SECTION_TABS}
    />
  );

  if (wide) {
    return <AppPrimaryTabsDesktop>{tabs}</AppPrimaryTabsDesktop>;
  }

  /*
   * Previous in-page SegmentedPillTabs under the header — replaced by the
   * shared sub-pill (consciously-mobile-header-subtabs-v2).
   * return <div className="… pt-3">{tabs}</div>;
   */
  return (
    <MobileHeaderSubPillPortal>
      <MobileHeaderSubPillTabs
        aria-label="Focus section"
        value={section}
        onChange={(id) => navigate(FOCUS_SECTION_HREF[id as FocusSectionId])}
        options={FOCUS_SECTION_TABS}
      />
    </MobileHeaderSubPillPortal>
  );
}
