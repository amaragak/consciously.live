import { Suspense } from "react";
import LibraryView from "@/components/library-view";

/**
 * Keep a single LibraryView mounted across creations / programs / community and
 * program detail URLs so list ↔ detail navigation does not remount.
 * Natural document height — MainShell scrolls; footer comes after content.
 */
export function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryView />
    </Suspense>
  );
}
