import { Suspense } from "react";
import LibraryView from "@/components/library-view";

/**
 * Keep a single LibraryView mounted across creations / programs / community and
 * program detail URLs so list ↔ detail navigation does not remount.
 */
export function LibraryPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        <LibraryView />
      </Suspense>
    </div>
  );
}
