import { Suspense, useEffect, useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { IdeateCloudProvider } from "@/components/plan/ideate-cloud-provider";
import { PlanGoalWorkspace } from "@/components/plan/plan-goal-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ensureEntityUrlSlug,
  findEntityByPathSlug,
  lifeAreaHref,
} from "@/lib/entity-href";
import { loadPlanDreamsStore, savePlanDreamsStore } from "@/lib/plan-dreams";
import { looksLikeUuid } from "@/lib/readable-url";

const MANIFEST_RESERVED = new Set([
  "story",
  "poster",
  "guides",
  "vision-board",
  "tracker",
  "insights",
  "words",
  "questions",
  "goal",
  "my",
]);

function ManifestGoalPageInner() {
  const params = useParams();
  const navigate = useNavigate();
  const rawId = typeof params.id === "string" ? decodeURIComponent(params.id) : "";
  const areaSlug =
    typeof params.areaSlug === "string" ? decodeURIComponent(params.areaSlug) : "";
  const key = rawId || areaSlug;

  const dreamId = useMemo(() => {
    if (!key || MANIFEST_RESERVED.has(key.toLowerCase())) return "";
    const store = loadPlanDreamsStore();
    const found = findEntityByPathSlug(store.dreams, key);
    return found?.id ?? (looksLikeUuid(key) || key.startsWith("dream_") ? key : "");
  }, [key]);

  useEffect(() => {
    if (!dreamId) return;
    const store = loadPlanDreamsStore();
    const ensured = ensureEntityUrlSlug(store.dreams, dreamId);
    if (ensured.items !== store.dreams) {
      savePlanDreamsStore({ ...store, dreams: ensured.items });
    }
    const dream = ensured.item ?? store.dreams.find((d) => d.id === dreamId);
    if (!dream) return;

    const tab = params.tab ? String(params.tab) : "";
    const itemSlug = params.itemSlug || params.itemId || params.goalSlug || params.goalId;
    let rest = "";
    if (itemSlug && (tab === "tracker" || params.itemSlug || params.itemId || params.goalSlug || params.goalId)) {
      rest = `tracker/${encodeURIComponent(String(itemSlug))}`;
    } else if (tab && tab !== "overview") {
      rest = tab;
    }
    const href = lifeAreaHref(dream, rest);
    const current = window.location.pathname.replace(/\/$/, "");
    if (current !== href && (rawId || looksLikeUuid(key) || key.startsWith("dream_"))) {
      navigate(href, { replace: true });
    }
  }, [dreamId, key, navigate, params, rawId]);

  if (!key || MANIFEST_RESERVED.has(key.toLowerCase())) {
    return <Navigate to="/manifest" replace />;
  }

  if (!dreamId) {
    return (
      <div className="px-4 py-16 text-muted">Missing goal link.</div>
    );
  }

  return <PlanGoalWorkspace dreamId={dreamId} />;
}

function GoalPageFallback() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading life area</span>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-8 w-[min(100%,18rem)]" />
      <Skeleton className="mt-8 h-40 w-full rounded-xl" />
    </div>
  );
}

export function ManifestGoalPage() {
  return (
    <IdeateCloudProvider>
      <Suspense fallback={<GoalPageFallback />}>
        <ManifestGoalPageInner />
      </Suspense>
    </IdeateCloudProvider>
  );
}
