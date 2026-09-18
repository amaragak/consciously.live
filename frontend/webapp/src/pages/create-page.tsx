import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { CreateWorkspace } from "@/components/create-workspace";

function CreateWorkspaceRoute() {
  const [sp] = useSearchParams();
  return (
    <CreateWorkspace
      initialDraftSk={sp.get("draftSk")}
      seedJournalContext={sp.get("fromJournal") === "1"}
      seedPlanContext={
        sp.get("fromDream") === "1" ||
        sp.get("fromIdeate") === "1" ||
        sp.get("fromPlan") === "1"
      }
    />
  );
}

/**
 * Create Meditation workspace. Nested `/meditate/create/*` paths all mount this
 * same shell so URL/step changes do not remount CreateWorkspace.
 */
export function CreatePage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
            Loading…
          </div>
        }
      >
        <CreateWorkspaceRoute />
      </Suspense>
    </div>
  );
}
