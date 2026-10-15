import { useEffect, useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  AppPrimaryTabsDesktop,
  AppPrimaryTabsPhone,
} from "@/components/app-primary-tabs";
import {
  HEADER_SECTION_TABS_IDLE,
  HEADER_SECTION_TABS_SELECTED,
  HEADER_SECTION_TABS_TRACK,
} from "@/components/header-section-tabs";
import { IdeateCloudProvider } from "@/components/plan/ideate-cloud-provider";
import { ManifestoPrintView } from "@/components/plan/manifesto-print-view";
import { ManifestoStoryView } from "@/components/plan/manifesto-story-view";
import { PlanHomeClient } from "@/components/plan/plan-home-client";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  manifestoViewHref,
  readManifestoViewPref,
  writeManifestoViewPref,
  type ManifestoView,
} from "@/lib/manifesto-print";
import { ensureManifestoStoryReminderPoller } from "@/lib/manifesto-story-reminder";

const VIEW_OPTIONS = [
  { id: "edit", label: "Edit" },
  { id: "manifesto", label: "Manifesto" },
  { id: "story", label: "Story" },
] as const satisfies readonly { id: ManifestoView; label: string }[];

/**
 * Manifesto page: **Edit**, **Manifesto** (print), and **Story**.
 *
 * - `?view=manifesto` → print; `?view=story` → story; no param → Edit.
 * - A bare `/manifest/my` lands on the remembered choice (default Manifesto).
 * - Deep links with other params (`?new=1`, guide hand-offs) always open Edit.
 */
export function ManifestHomePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    ensureManifestoStoryReminderPoller();
  }, []);

  const viewParam = params.get("view");
  const hasOtherParams = [...params.keys()].some((k) => k !== "view");

  const stickyEditRef = useRef(false);
  if (
    hasOtherParams &&
    viewParam !== "manifesto" &&
    viewParam !== "story"
  ) {
    stickyEditRef.current = true;
  }

  const requested: ManifestoView | null =
    viewParam === "manifesto"
      ? "manifesto"
      : viewParam === "story"
        ? "story"
        : null;

  useEffect(() => {
    if (requested === "manifesto" || requested === "story") {
      writeManifestoViewPref(requested);
    }
  }, [requested]);

  if (!requested && !stickyEditRef.current && !hasOtherParams) {
    const pref = readManifestoViewPref();
    if (pref === "manifesto" || pref === "story") {
      return <Navigate to={manifestoViewHref(pref)} replace />;
    }
  }

  const view: ManifestoView = requested ?? "edit";

  function selectView(next: ManifestoView) {
    stickyEditRef.current = false;
    writeManifestoViewPref(next);
    navigate(manifestoViewHref(next));
  }

  return (
    <IdeateCloudProvider>
      <AppPrimaryTabsDesktop>
        <SegmentedPillTabs<ManifestoView>
          aria-label="Manifesto view"
          value={view}
          onChange={selectView}
          className={HEADER_SECTION_TABS_TRACK}
          idleClassName={HEADER_SECTION_TABS_IDLE}
          selectedClassName={HEADER_SECTION_TABS_SELECTED}
          options={VIEW_OPTIONS}
        />
      </AppPrimaryTabsDesktop>
      <AppPrimaryTabsPhone>
        <SegmentedPillTabs<ManifestoView>
          aria-label="Manifesto view"
          value={view}
          onChange={selectView}
          className={HEADER_SECTION_TABS_TRACK}
          idleClassName={`${HEADER_SECTION_TABS_IDLE} px-2.5`}
          selectedClassName={`${HEADER_SECTION_TABS_SELECTED} px-2.5`}
          options={VIEW_OPTIONS}
        />
      </AppPrimaryTabsPhone>
      {view === "manifesto" ? (
        <ManifestoPrintView />
      ) : view === "story" ? (
        <ManifestoStoryView />
      ) : (
        <PlanHomeClient />
      )}
    </IdeateCloudProvider>
  );
}
