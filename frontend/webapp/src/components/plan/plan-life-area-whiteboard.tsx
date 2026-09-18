import { lazy, Suspense } from "react";

const PlanLifeAreaWhiteboardInner = lazy(() =>
  import("@/components/plan/plan-life-area-whiteboard-inner").then((m) => ({
    default: m.PlanLifeAreaWhiteboardInner,
  })),
);

type Props = {
  dreamId: string;
};

function WhiteboardFallback() {
  return (
    <div
      className="flex h-[min(70vh,40rem)] items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading whiteboard</span>
      <div className="mm-skeleton h-full min-h-[12rem] w-full rounded-[12px]" />
    </div>
  );
}

/** Life-area whiteboard — client-only tldraw canvas. */
export function PlanLifeAreaWhiteboard({ dreamId }: Props) {
  return (
    <div className="mt-8">
      <div className="mm-life-area-whiteboard relative h-[min(75vh,44rem)] overflow-hidden rounded-[12px] border border-[#E5DFD0] dark:border-border">
        <Suspense fallback={<WhiteboardFallback />}>
          <PlanLifeAreaWhiteboardInner dreamId={dreamId} />
        </Suspense>
      </div>
    </div>
  );
}
