import { Suspense } from "react";
import { FocusTimerView } from "@/components/focus-timer-view";

export function FocusPage() {
  return (
    <Suspense fallback={null}>
      <FocusTimerView />
    </Suspense>
  );
}
