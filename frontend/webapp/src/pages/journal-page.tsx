import { JournalInsightsAutoRefresh } from "@/components/journal-insights-autorefresh";
import { JournalGratitudesAll } from "@/components/journal-gratitudes-all";
import { JournalGratitudesHub } from "@/components/journal-gratitudes-hub";
import { JournalView } from "@/components/journal-view";
import { isGratitudesAllPath } from "@/lib/journal-gratitudes";
import { usePathname } from "@/lib/spa-nav";

/**
 * Journal / Gratitudes / Insights share one mounted JournalView so tab switches
 * only change the URL + local section state (no remount / re-fetch).
 * Nested routes under `/journal/entries/*` all render this same shell; pathname
 * parsing inside JournalView drives section + entry selection.
 *
 * Gratitudes hub (`/journal/gratitudes`) and All (`…/all`) are dedicated pages.
 */
export function JournalPage() {
  const path = usePathname() || "";
  const isGratitudesHub =
    path === "/journal/gratitudes" ||
    path === "/journal/gratitude" ||
    path === "/journal/gratitudes/" ||
    path === "/journal/gratitude/";
  const isGratitudesAll = isGratitudesAllPath(path);

  let body = <JournalView />;
  if (isGratitudesAll) body = <JournalGratitudesAll />;
  else if (isGratitudesHub) body = <JournalGratitudesHub />;

  return (
    <>
      <JournalInsightsAutoRefresh />
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {body}
      </div>
    </>
  );
}
