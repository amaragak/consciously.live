import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { IdeateCloudProvider } from "@/components/plan/ideate-cloud-provider";
import { ManifestoPrintView } from "@/components/plan/manifesto-print-view";
import { ManifestoStoryView } from "@/components/plan/manifesto-story-view";
import { PlanHomeClient } from "@/components/plan/plan-home-client";
import { ensureManifestoStoryReminderPoller } from "@/lib/manifesto-story-reminder";

function useStoryReminder() {
  useEffect(() => {
    ensureManifestoStoryReminderPoller();
  }, []);
}

/** Old `?view=` links land on the page that replaced that tab. */
function legacyViewRedirect(view: string | null, tab: string | null): string | null {
  if (view === "story") {
    const next = new URLSearchParams();
    if (tab === "narration" || tab === "draft") next.set("tab", tab);
    const q = next.toString();
    return q ? `/manifest/story?${q}` : "/manifest/story";
  }
  if (view === "manifesto") return "/manifest/poster";
  return null;
}

/**
 * Manifesto page (the former Edit view).
 * `?view=story` and `?view=manifesto` redirect to Story and Poster.
 */
export function ManifestHomePage() {
  const [params] = useSearchParams();
  useStoryReminder();

  const legacy = legacyViewRedirect(params.get("view"), params.get("tab"));
  if (legacy) return <Navigate to={legacy} replace />;

  if (params.get("view") === "edit") {
    const next = new URLSearchParams(params);
    next.delete("view");
    const q = next.toString();
    return <Navigate to={q ? `/manifest/my?${q}` : "/manifest/my"} replace />;
  }

  return (
    <IdeateCloudProvider>
      <PlanHomeClient />
    </IdeateCloudProvider>
  );
}

/** Story page. `?tab=draft|narration` selects the toggle. */
export function ManifestStoryPage() {
  useStoryReminder();
  return (
    <IdeateCloudProvider>
      <ManifestoStoryView />
    </IdeateCloudProvider>
  );
}

/** Poster page: the print view, on its own route. */
export function ManifestPosterPage() {
  useStoryReminder();
  return (
    <IdeateCloudProvider>
      <ManifestoPrintView />
    </IdeateCloudProvider>
  );
}
