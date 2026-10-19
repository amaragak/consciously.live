import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MIST, ProgressBar } from "@/components/plan/life-area/kit";
import { IdeateCloudProvider, useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { loadIdeateStore, saveIdeateStore } from "@/lib/plan-ideate-store";
import {
  addTrackerItem,
  childrenOf,
  commitTracker,
  deleteTrackerItem,
  descendantsOf,
  dueLabel,
  ensureTracker,
  moveTrackerToArea,
  patchTrackerItem,
  relativeTouched,
  rollup,
  toggleTrackerDone,
  type TrackerItem,
  type TrackerKind,
  type TrackerStatus,
} from "@/lib/tracker-items";

/** Items with no life area use an empty id so they stay out of every area tracker. */
const NO_AREA = "";

const KINDS: TrackerKind[] = ["goal", "project", "feature", "task"];
const STATUSES: TrackerStatus[] = ["not_started", "doing", "waiting", "done"];

const KIND_CLASS: Record<TrackerKind, string> = {
  goal: "border-accent/50 text-accent-link",
  project: "border-sky-500/40 text-sky-800",
  feature: "border-violet-400/50 text-violet-800",
  task: "border-border text-muted",
};

const KIND_DOT: Record<TrackerKind, string> = {
  goal: "bg-accent",
  project: "bg-sky-500",
  feature: "bg-violet-400",
  task: "bg-muted",
};

const STATUS_LABEL: Record<TrackerStatus, string> = {
  not_started: "Not started",
  doing: "Doing",
  waiting: "Waiting",
  done: "Done",
};

const KIND_LABEL: Record<TrackerKind, string> = {
  goal: "Goal",
  project: "Project",
  feature: "Feature",
  task: "Task",
};

type Visible = { item: TrackerItem; level: number };

export function ManifestTrackerPage() {
  return (
    <IdeateCloudProvider>
      <TrackerAll />
    </IdeateCloudProvider>
  );
}

function TrackerAll() {
  const { ready, revision } = useIdeateCloud();
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [areaMenu, setAreaMenu] = useState<string | null>(null);
  const [statusMenu, setStatusMenu] = useState<string | null>(null);
  const titleLock = useRef(false);
  const [kindFilter, setKindFilter] = useState<TrackerKind | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TrackerStatus | "any">("any");

  useEffect(() => {
    if (!ready) return;
    const store = loadIdeateStore();
    if (!store.trackerItems) saveIdeateStore(ensureTracker(store));
  }, [ready]);

  function mutate(recipe: Parameters<typeof commitTracker>[0]) {
    commitTracker(recipe);
    setTick((n) => n + 1);
  }

  const store = ensureTracker(loadIdeateStore());
  void revision;
  void tick;
  const items = store.trackerItems ?? [];
  const areas = [...store.dreams].sort((a, b) => a.title.localeCompare(b.title));

  useEffect(() => {
    if (!ready || seeded) return;
    const rows = ensureTracker(loadIdeateStore()).trackerItems ?? [];
    setExpanded(new Set(rows.filter((item) => childrenOf(rows, item.id).length > 0).map((item) => item.id)));
    setSeeded(true);
  }, [ready, seeded]);

  function areaName(id: string) {
    if (!id) return "No life area";
    return areas.find((area) => area.id === id)?.title || "Life area";
  }

  const visible = visibleRows(items, expanded, kindFilter, statusFilter, areaName);

  function addTask(lifeAreaId: string) {
    let created = "";
    mutate((current) => {
      const result = addTrackerItem(current, { lifeAreaId, parentId: null, kind: "task" });
      created = result.id;
      return result.store;
    });
    setAdding(false);
    setEditing(created);
  }

  function addChild(parent: TrackerItem) {
    let created = "";
    mutate((current) => {
      const result = addTrackerItem(current, {
        lifeAreaId: parent.lifeAreaId,
        parentId: parent.id,
        kind: "task",
      });
      created = result.id;
      return result.store;
    });
    setExpanded((current) => new Set([...current, parent.id]));
    setEditing(created);
  }

  function applyTitle(item: TrackerItem, value: string, next: "close" | "sibling") {
    const title = value.trim();
    if (!title) {
      mutate((current) => deleteTrackerItem(current, item.id));
      setEditing(null);
      return;
    }
    mutate((current) => patchTrackerItem(current, item.id, { title }));
    if (next === "sibling") {
      let created = "";
      mutate((current) => {
        const result = addTrackerItem(current, {
          lifeAreaId: item.lifeAreaId,
          parentId: item.parentId,
          kind: "task",
          afterId: item.id,
        });
        created = result.id;
        return result.store;
      });
      setEditing(created);
      return;
    }
    setEditing(null);
  }

  function onTitleKey(event: KeyboardEvent<HTMLInputElement>, item: TrackerItem) {
    if (event.key === "Enter") {
      event.preventDefault();
      titleLock.current = true;
      applyTitle(item, event.currentTarget.value, "sibling");
    } else if (event.key === "Escape") {
      event.preventDefault();
      titleLock.current = true;
      applyTitle(item, event.currentTarget.value, "close");
    }
  }

  function finishTitle(item: TrackerItem, value: string) {
    if (titleLock.current) {
      titleLock.current = false;
      return;
    }
    applyTitle(item, value, "close");
  }

  if (!ready) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted">Loading tracker…</div>;
  }

  const open = items.filter((item) => item.status !== "done").length;
  const doing = items.filter((item) => item.status === "doing").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-[calc(58px+env(safe-area-inset-bottom,0px)+16px)] pt-6 sm:px-6 sm:pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl">Tracker</h1>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">Open · {open}</span>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">Doing · {doing}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[13px] text-muted">
          Kind
          <select
            className="ml-1 bg-transparent"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as TrackerKind | "all")}
          >
            <option value="all">All</option>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
            ))}
          </select>
        </label>
        <label className="text-[13px] text-muted">
          Status
          <select
            className="ml-1 bg-transparent"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TrackerStatus | "any")}
          >
            <option value="any">Any</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABEL[status]}</option>
            ))}
          </select>
        </label>
        <button type="button" className={`${MIST} ml-auto h-10 px-4 text-sm`} onClick={() => setAdding((value) => !value)}>
          <Plus className="size-4" /> New
        </button>
      </div>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Add to</span>
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              className="inline-flex h-7 cursor-pointer items-center rounded-full border border-border bg-card px-2.5 text-[12px] font-semibold"
              onClick={() => addTask(area.id)}
            >
              {area.title}
            </button>
          ))}
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center rounded-full border border-border bg-card px-2.5 text-[12px] font-semibold text-muted"
            onClick={() => addTask(NO_AREA)}
          >
            No life area
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="grid min-w-[760px] grid-cols-[minmax(0,3fr)_150px_140px_90px_120px] px-3 text-[11px] uppercase tracking-wide text-muted">
          <span className="py-2">Item</span>
          <span className="py-2">Status</span>
          <span className="py-2">Progress</span>
          <span className="py-2">Due</span>
          <span className="py-2">Touched</span>
        </div>
        {visible.length === 0 ? (
          <p className="border-t border-border px-3 py-6 text-sm text-muted">Nothing here yet. New adds a task to a life area, or to none.</p>
        ) : null}
        {visible.map(({ item, level }) => {
          const kids = childrenOf(items, item.id);
          const stats = rollup(items, item.id);
          const depth = Math.min(level, 4);
          return (
            <div
              key={item.id}
              className="group grid min-w-[760px] grid-cols-[minmax(0,3fr)_150px_140px_90px_120px] items-center border-t border-border px-3 py-[9px] text-sm hover:bg-background"
            >
              <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 24 }}>
                <button
                  type="button"
                  title="Add an item inside"
                  aria-label="Add an item inside"
                  className="grid size-[18px] shrink-0 place-items-center rounded-md border border-border bg-card opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100"
                  onClick={() => addChild(item)}
                >
                  <Plus className="size-3" />
                </button>
                {kids.length > 0 ? (
                  <button
                    type="button"
                    aria-label="Expand"
                    onClick={() => {
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                  >
                    <ChevronRight className={`size-4 ${expanded.has(item.id) ? "rotate-90" : ""}`} />
                  </button>
                ) : (
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={item.status === "done"}
                    onChange={() => {
                      if (descendantsOf(items, item.id).length > 0 && item.status !== "done") {
                        const count = descendantsOf(items, item.id).length + 1;
                        if (!window.confirm(`Mark ${count} items done?`)) return;
                      }
                      mutate((current) => toggleTrackerDone(current, item.id));
                    }}
                  />
                )}
                {editing === item.id ? (
                  <input
                    autoFocus
                    defaultValue={item.title}
                    placeholder="New item"
                    className="h-[30px] min-w-0 flex-1 rounded-lg border-[1.5px] border-accent bg-card px-2 text-sm outline-none placeholder:italic placeholder:text-muted"
                    onBlur={(event) => finishTitle(item, event.target.value)}
                    onKeyDown={(event) => onTitleKey(event, item)}
                  />
                ) : (
                  <button
                    type="button"
                    className={`min-w-0 truncate text-left ${level === 0 ? "font-semibold" : ""}`}
                    onClick={() => setEditing(item.id)}
                  >
                    {item.title || "Untitled"}
                  </button>
                )}
                <AreaChip
                  label={areaName(item.lifeAreaId)}
                  open={areaMenu === item.id}
                  areas={areas}
                  onOpen={() => {
                    setStatusMenu(null);
                    setAreaMenu(item.id);
                  }}
                  onClose={() => setAreaMenu(null)}
                  onPick={(lifeAreaId) => {
                    mutate((current) => moveTrackerToArea(current, item.id, lifeAreaId));
                    setAreaMenu(null);
                  }}
                />
                {item.kind ? (
                  <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-semibold ${KIND_CLASS[item.kind]}`}>
                    <span className={`size-1.5 rounded-sm ${KIND_DOT[item.kind]}`} />
                    {KIND_LABEL[item.kind]}
                  </span>
                ) : null}
              </div>
              <StatusMenu
                item={item}
                open={statusMenu === item.id}
                onOpen={() => {
                  setAreaMenu(null);
                  setStatusMenu(item.id);
                }}
                onClose={() => setStatusMenu(null)}
                onPick={(status) => {
                  mutate((current) => patchTrackerItem(current, item.id, status ? { status } : { status: null, waitingOn: null }));
                  setStatusMenu(null);
                }}
              />
              <div>
                {stats.tickable && kids.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="w-[60px]"><ProgressBar done={stats.doneLeaves} total={stats.leaves} /></span>
                    <span className="text-xs text-muted">{stats.doneLeaves}/{stats.leaves}</span>
                  </div>
                ) : kids.length > 0 ? (
                  <span className="text-xs text-muted">{kids.length} {kids.length === 1 ? "item" : "items"}</span>
                ) : null}
              </div>
              <label className="text-left text-accent-link">
                {item.due ? dueLabel(item.due) : <span className="text-xs text-muted opacity-0 group-hover:opacity-100">Set date</span>}
                <input
                  type="date"
                  aria-label="Due date"
                  className="sr-only"
                  value={item.due ?? ""}
                  onChange={(event) => mutate((current) => patchTrackerItem(current, item.id, { due: event.target.value || null }))}
                />
              </label>
              <span className="text-right text-muted">{relativeTouched(item.lastTouchedAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AreaChip({
  label,
  open,
  areas,
  onOpen,
  onClose,
  onPick,
}: {
  label: string;
  open: boolean;
  areas: { id: string; title: string }[];
  onOpen: () => void;
  onClose: () => void;
  onPick: (lifeAreaId: string) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  return (
    <span className="shrink-0">
      <button
        ref={button}
        type="button"
        className="inline-flex h-5 cursor-pointer items-center rounded-full border border-border bg-background px-2 text-[11px] font-semibold"
        onClick={open ? onClose : onOpen}
      >
        {label}
      </button>
      {open && button.current ? (
        <Menu anchor={button.current} onClose={onClose}>
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              className="flex h-[34px] w-full cursor-pointer items-center rounded-lg px-2 text-left text-sm hover:bg-accent-soft"
              onClick={() => onPick(area.id)}
            >
              {area.title}
            </button>
          ))}
          <button
            type="button"
            className="flex h-[34px] w-full cursor-pointer items-center rounded-lg px-2 text-left text-sm text-muted hover:bg-accent-soft"
            onClick={() => onPick(NO_AREA)}
          >
            No life area
          </button>
        </Menu>
      ) : null}
    </span>
  );
}

function StatusMenu({
  item,
  open,
  onOpen,
  onClose,
  onPick,
}: {
  item: TrackerItem;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (status: TrackerStatus | null) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={button} type="button" className="text-left" onClick={open ? onClose : onOpen}>
        {item.status ? <StatusPill item={item} /> : <span className="text-xs text-muted opacity-0 group-hover:opacity-100">Set status</span>}
      </button>
      {open && button.current ? (
        <Menu anchor={button.current} onClose={onClose} width={160}>
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="flex h-[34px] w-full cursor-pointer items-center rounded-lg px-2 text-left text-sm hover:bg-accent-soft"
              onClick={() => onPick(status)}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
          <button
            type="button"
            className="flex h-[34px] w-full cursor-pointer items-center rounded-lg px-2 text-left text-sm text-muted hover:bg-accent-soft"
            onClick={() => onPick(null)}
          >
            No status
          </button>
        </Menu>
      ) : null}
    </div>
  );
}

function Menu({
  anchor,
  width = 176,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const height = panel.current?.offsetHeight ?? 240;
      const flip = rect.bottom + 8 + height > window.innerHeight - 72;
      const top = flip ? Math.max(8, rect.top - height - 8) : rect.bottom + 8;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setBox({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, width]);
  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.contains(target)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={panel}
      className="fixed z-50 flex max-h-64 flex-col overflow-y-auto rounded-[14px] border border-border bg-card p-1.5 shadow-[0_16px_40px_-18px_rgba(15,27,45,0.45)]"
      style={{ top: box.top, left: box.left, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

function StatusPill({ item }: { item: TrackerItem }) {
  if (item.status === "doing") return <span className={`${MIST} h-6 px-2 text-[11.5px]`}>Doing</span>;
  if (item.status === "waiting") {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-accent/40 bg-accent-soft px-2 text-[11.5px] font-semibold text-accent-link">
        {item.waitingOn ? `Waiting · ${item.waitingOn}` : "Waiting"}
      </span>
    );
  }
  if (item.status === "done") {
    return <span className="inline-flex h-6 items-center rounded-full border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_16%,transparent)] px-2 text-[11.5px] font-semibold text-[var(--success)]">Done</span>;
  }
  return <span className="inline-flex h-6 items-center rounded-full border border-border px-2 text-[11.5px] font-semibold text-muted">Not started</span>;
}

function visibleRows(
  items: TrackerItem[],
  expanded: Set<string>,
  kindFilter: TrackerKind | "all",
  statusFilter: TrackerStatus | "any",
  areaName: (id: string) => string,
): Visible[] {
  const rows: Visible[] = [];
  const tops = items
    .filter((item) => item.parentId == null)
    .sort((a, b) => {
      const area = areaName(a.lifeAreaId).localeCompare(areaName(b.lifeAreaId));
      if (a.lifeAreaId && !b.lifeAreaId) return -1;
      if (!a.lifeAreaId && b.lifeAreaId) return 1;
      if (area !== 0) return area;
      return Number(a.sortKey) - Number(b.sortKey);
    });
  const walk = (item: TrackerItem, level: number) => {
    if (kindFilter !== "all" && item.kind !== kindFilter) return;
    if (statusFilter !== "any" && item.status !== statusFilter) return;
    rows.push({ item, level });
    if (!expanded.has(item.id)) return;
    for (const child of childrenOf(items, item.id)) walk(child, level + 1);
  };
  for (const item of tops) walk(item, 0);
  return rows;
}
