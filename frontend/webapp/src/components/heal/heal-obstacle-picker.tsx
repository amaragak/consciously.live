import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HealAvatar, useHealStore } from "@/components/heal/heal-bits";
import { useMinWidth } from "@/hooks/use-min-width";
import { healMatchObstacle } from "@/lib/heal-ai";
import { healTypeLabel } from "@/lib/heal-copy";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import {
  activeHealItems,
  currentView,
  descriptionForItem,
  healItemForObstacle,
  linkObstacleToItem,
  loadHealStore,
  unlinkObstacle,
  type HealItem,
  type HealStoreV1,
} from "@/lib/heal-store";

export function openHealForObstacle(lifeAreaId: string, label: string) {
  const params = new URLSearchParams({
    describe: "1",
    name: label,
    area: lifeAreaId,
    obstacle: `${lifeAreaId}::${label}`,
  });
  window.location.assign(`/heal?${params.toString()}`);
}

function areaTitle(lifeAreaId: string): string {
  return loadIdeateStore().dreams.find((dream) => dream.id === lifeAreaId)?.title?.trim() || "another area";
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

/** Closest match from the item name, bad-day line, and description. Used until the match call returns. */
export function rankHealItemsForObstacle(store: HealStoreV1, obstacle: string, items: HealItem[]): HealItem[] {
  const words = new Set(tokens(obstacle));
  const score = (item: HealItem) => {
    const bad = currentView(store, item.id, "bad")?.text ?? "";
    const description = descriptionForItem(store, item.id)?.text ?? item.aboutText;
    const hay = new Set(tokens(`${item.title} ${bad} ${description}`));
    let hits = 0;
    for (const word of words) if (hay.has(word)) hits += 1;
    return hits;
  };
  return [...items].sort((a, b) => score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt));
}

function alsoLinked(item: HealItem): string {
  const areas = [...new Set(item.linkedObstacles.map((link) => areaTitle(link.lifeAreaId)))];
  if (!areas.length) return "";
  return ` · also linked from ${areas.join(", ")}`;
}

function announceLinked(toast: { id: string; title: string }) {
  document.getElementById("heal-link-toast")?.remove();
  const el = document.createElement("div");
  el.id = "heal-link-toast";
  el.className =
    "fixed bottom-6 left-1/2 z-[170] flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg";
  const label = document.createElement("span");
  label.textContent = `Linked to ${toast.title}`;
  const open = document.createElement("a");
  open.href = `/heal/${encodeURIComponent(toast.id)}`;
  open.textContent = "Open";
  open.className = "font-semibold underline";
  open.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.assign(open.href);
  });
  el.append(label, open);
  document.body.append(el);
  window.setTimeout(() => el.remove(), 4000);
}

export function ObstacleHealPicker({
  dreamId,
  label,
  anchor,
  onClose,
}: {
  dreamId: string;
  label: string;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  const desktop = useMinWidth(768);
  const [store, commit] = useHealStore();
  const [query, setQuery] = useState("");
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const active = activeHealItems(store);
  const activeKey = active.map((item) => item.id).join("|");
  const ranked = useMemo(() => {
    const rows = rankHealItemsForObstacle(store, label, active);
    if (!suggestedId) return rows;
    const hit = rows.find((item) => item.id === suggestedId);
    return hit ? [hit, ...rows.filter((item) => item.id !== suggestedId)] : rows;
  }, [store, label, active, suggestedId]);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? ranked.filter((item) => `${item.title} ${healTypeLabel(item.type)}`.toLowerCase().includes(q))
    : ranked;
  const shown = q ? filtered : filtered.slice(0, 5);
  const topId = shown[0]?.id ?? null;

  useEffect(() => {
    if (active.length < 2) return;
    let cancel = false;
    const rows = activeHealItems(loadHealStore());
    void healMatchObstacle({
      obstacle: label,
      items: rows.map((item) => ({
        id: item.id,
        title: item.title,
        bad: currentView(store, item.id, "bad")?.text ?? "",
        description: descriptionForItem(store, item.id)?.text ?? item.aboutText,
      })),
    }).then((id) => {
      if (!cancel && id && rows.some((item) => item.id === id)) setSuggestedId(id);
    });
    return () => {
      cancel = true;
    };
    // activeKey is the stable list of ids. `active` is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, activeKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function choose(item: HealItem) {
    commit(linkObstacleToItem(loadHealStore(), item.id, dreamId, label));
    announceLinked({ id: item.id, title: item.title });
    onClose();
  }

  const rect = anchor?.getBoundingClientRect();
  const width = 360;
  const left = rect ? Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8) : 8;
  const top = rect ? rect.bottom + 8 : 80;

  const body = (
    <div
      ref={panel}
      role="dialog"
      aria-label={`Work through “${label}” in Heal`}
      className={
        desktop
          ? "fixed z-[160] flex w-[360px] flex-col gap-1.5 rounded-[14px] border border-border bg-card p-3.5 shadow-[0_16px_40px_rgb(15_27_45_/_0.16)]"
          : "fixed inset-x-0 bottom-0 z-[160] flex max-h-[80vh] flex-col gap-1.5 rounded-t-2xl border border-border bg-card p-4 shadow-[0_-12px_40px_rgb(15_27_45_/_0.16)]"
      }
      style={desktop ? { left, top, width } : undefined}
    >
      <p className="px-1 text-[13px] font-semibold text-foreground">Work through “{label}” in Heal</p>
      {active.length ? (
        <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Add to something you're working on
        </p>
      ) : null}
      {active.length > 5 ? (
        <label className="relative mt-1 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm outline-none"
          />
        </label>
      ) : null}
      <div className="max-h-72 overflow-y-auto">
        {shown.map((item) => {
          const suggested = item.id === topId && !q;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left ${suggested ? "bg-background" : ""}`}
              onClick={() => choose(item)}
            >
              <HealAvatar item={item} store={store} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{item.title}</span>
                <span className="block truncate text-xs text-muted">
                  {healTypeLabel(item.type)}
                  {alsoLinked(item)}
                </span>
              </span>
              {suggested ? (
                <span className="shrink-0 rounded-full border border-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  Suggested
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-1 border-t border-border pt-1">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-sm font-semibold text-foreground"
          onClick={() => openHealForObstacle(dreamId, label)}
        >
          <Plus className="size-[15px]" aria-hidden />
          Start a new one
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[150] cursor-default" onClick={onClose} />
      {body}
    </>,
    document.body,
  );
}

export function ObstacleHealMenu({
  dreamId,
  label,
}: {
  dreamId: string;
  label: string;
}) {
  const [store, commit] = useHealStore();
  const item = healItemForObstacle(store, dreamId, label);
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const rect = button.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Obstacle actions"
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open
        ? createPortal(
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-[145] cursor-default" onClick={() => setOpen(false)} />
              <div
                className="fixed z-[146] w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
                style={{
                  top: (rect?.bottom ?? 80) + 6,
                  left: Math.max(8, (rect?.right ?? 200) - 224),
                }}
              >
                {item ? (
                  <>
                    <a
                      href={`/heal/${encodeURIComponent(item.id)}`}
                      className="block px-3 py-2 text-sm font-semibold text-foreground"
                    >
                      Open in Heal
                    </a>
                    <button
                      type="button"
                      className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-semibold text-foreground"
                      onClick={() => {
                        commit(unlinkObstacle(loadHealStore(), dreamId, label));
                        setOpen(false);
                      }}
                    >
                      Unlink from Heal
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-semibold text-foreground"
                    onClick={() => {
                      setOpen(false);
                      setPicker(true);
                    }}
                  >
                    Work through this in Heal
                  </button>
                )}
              </div>
            </>,
            document.body,
          )
        : null}
      {picker ? (
        <ObstacleHealPicker dreamId={dreamId} label={label} anchor={button.current} onClose={() => setPicker(false)} />
      ) : null}
    </>
  );
}

export function useLinkedObstacle(dreamId: string, label: string): HealItem | null {
  const [store] = useHealStore();
  return healItemForObstacle(store, dreamId, label);
}
