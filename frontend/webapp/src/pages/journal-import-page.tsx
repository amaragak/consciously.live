import { Navigate } from "react-router-dom";

/** Legacy `/journal/import` → Entries with the import modal open. */
export function JournalImportPage() {
  return <Navigate to="/journal/entries?import=1" replace />;
}
