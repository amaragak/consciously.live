import { JournalInsightsAutoRefresh } from "@/components/journal-insights-autorefresh";
import { JournalView } from "@/components/journal-view";

/**
 * Journal / Gratitudes / Insights share one mounted JournalView so tab switches
 * only change the URL + local section state (no remount / re-fetch).
 * Nested routes under `/journal/my/*` all render this same shell; pathname
 * parsing inside JournalView drives section + entry selection.
 */
export function JournalPage() {
  return (
    <>
      <JournalInsightsAutoRefresh />
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <JournalView />
      </div>
    </>
  );
}
