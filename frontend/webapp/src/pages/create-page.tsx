import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { CreateOneFlow } from "@/components/create-one-flow";

function CreateWorkspaceRoute() {
  const [sp] = useSearchParams();
  return (
    <CreateOneFlow
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
 * Create Meditation — Start → Shape → Sound (one flow).
 * Nested `/meditate/create/*` paths mount this shell; legacy doors redirect in.
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
