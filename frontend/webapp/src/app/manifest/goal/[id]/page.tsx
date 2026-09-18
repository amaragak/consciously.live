"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { PlanGoalWorkspace } from "@/components/plan/plan-goal-workspace";
import { Skeleton } from "@/components/ui/skeleton";

function IdeateGoalPageInner() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === "string" ? decodeURIComponent(raw) : "";

  if (!id) {
    return (
      <div className="px-4 py-16 text-muted">
        Missing goal link.
      </div>
    );
  }

  return <PlanGoalWorkspace dreamId={id} />;
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

export default function IdeateGoalPage() {
  return (
    <Suspense fallback={<GoalPageFallback />}>
      <IdeateGoalPageInner />
    </Suspense>
  );
}
