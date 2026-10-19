import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { IdeateCloudProvider, useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { ensureTracker, itemsForArea, rollup } from "@/lib/tracker-items";
import { loadIdeateStore, saveIdeateStore } from "@/lib/plan-ideate-store";

export function ManifestTrackerPage() {
  return (
    <IdeateCloudProvider>
      <TrackerAll />
    </IdeateCloudProvider>
  );
}

function TrackerAll() {
  const { ready, revision } = useIdeateCloud();
  const [migrated, setMigrated] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const store = loadIdeateStore();
    if (!store.trackerItems) {
      saveIdeateStore(ensureTracker(store));
      setMigrated(true);
    }
  }, [ready]);
  if (!ready) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted">Loading tracker…</div>;
  }
  const store = ensureTracker(loadIdeateStore());
  void revision;
  void migrated;
  const open = (store.trackerItems ?? []).filter((item) => item.status !== "done").length;
  const doing = (store.trackerItems ?? []).filter((item) => item.status === "doing").length;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl">Tracker</h1>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">Open · {open}</span>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">Doing · {doing}</span>
      </div>
      <div className="flex flex-col gap-6">
        {store.dreams.map((dream) => {
          const items = itemsForArea(store, dream.id).filter((item) => item.parentId == null);
          if (items.length === 0) return null;
          return (
            <section key={dream.id}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg">{dream.title}</h2>
                <Link to={`/manifest/goal/${encodeURIComponent(dream.id)}/tracker`} className="text-sm font-semibold text-accent-link">
                  Open {dream.title} →
                </Link>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {items.map((item) => {
                  const stats = rollup(store.trackerItems ?? [], item.id);
                  return (
                    <Link
                      key={item.id}
                      to={`/manifest/goal/${encodeURIComponent(dream.id)}/tracker/${encodeURIComponent(item.id)}`}
                      className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 first:border-t-0"
                    >
                      <span className="truncate text-sm font-semibold">{item.title || "Untitled"}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {stats.tickable ? `${stats.doneLeaves}/${stats.leaves}` : `${stats.leaves} items`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
