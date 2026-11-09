"use client";

import { useNavigate } from "react-router-dom";
import {
  MobileHeaderSubPillPortal,
  MobileHeaderSubPillTabs,
} from "@/components/mobile-header-sub-pill";
import { useMvpFlags } from "@/lib/mvp-flags";

export type JournalMobileSectionId = "journal" | "gratitude" | "insights";

const HREF: Record<JournalMobileSectionId, string> = {
  journal: "/journal/entries",
  gratitude: "/journal/gratitudes",
  insights: "/journal/insights",
};

const TABS: { id: JournalMobileSectionId; label: string }[] = [
  { id: "journal", label: "Entries" },
  { id: "gratitude", label: "Gratitudes" },
  { id: "insights", label: "Insights" },
];

type Props = {
  value: JournalMobileSectionId;
  /** Flush in-flight draft before navigating (JournalView). */
  onBeforeNavigate?: () => void;
  className?: string;
};

/**
 * Mobile Journal hub tabs under the floating header
 * (consciously-mobile-header-subtabs-v2). Previous in-page CardSegmentTabs
 * card is commented out in callers.
 */
export function JournalMobileSectionTabs({
  value,
  onBeforeNavigate,
  className = "",
}: Props) {
  const navigate = useNavigate();
  const mvp = useMvpFlags();
  const options = TABS.filter(
    (tab) => tab.id !== "insights" || mvp.journalInsights,
  );
  return (
    <MobileHeaderSubPillPortal>
      <MobileHeaderSubPillTabs
        aria-label="Journal section"
        className={className}
        value={value}
        onChange={(id) => {
          onBeforeNavigate?.();
          navigate(HREF[id]);
        }}
        options={options}
      />
    </MobileHeaderSubPillPortal>
  );
}
