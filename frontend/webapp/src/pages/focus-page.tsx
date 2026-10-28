import { Suspense } from "react";
import { FocusSectionTabs } from "@/components/focus-section-chrome";
import { FocusTimerView } from "@/components/focus-timer-view";

export function FocusPage() {
  return (
    <Suspense fallback={null}>
      <div className="flex min-h-0 flex-1 flex-col">
        <FocusSectionTabs />
        <FocusTimerView />
      </div>
    </Suspense>
  );
}
