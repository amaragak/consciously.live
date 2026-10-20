import {
  Calendar,
  ChevronRight,
  Columns2,
  Copy,
  FolderInput,
  GripVertical,
  List,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Tag,
  Timer,
  Trash2,
  UserRound,
  ZoomIn,
  ArrowUpRight,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MIST, OUTLINE, ProgressBar } from "@/components/plan/life-area/kit";
import { queueTrackerFocus } from "@/lib/focus-ideate-link";
import { openAssistantChatFab } from "@/lib/assistant-chat-launch";
import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { loadIdeateStore, saveIdeateStore } from "@/lib/plan-ideate-store";
import type { PlanDream } from "@/lib/plan-dreams";
import { streamPlanCoachReply } from "@/lib/plan-claude";
import { startLifeAreaMeditation } from "@/lib/life-area-card-actions";
import {
  addTrackerItem,
  childrenOf,
  commitTracker,
  deleteTrackerItem,
  descendantsOf,
  dueLabel,
  duplicateTrackerItem,
  ensureTracker,
  itemsForArea,
  leavesOf,
  moveTrackerItem,
  moveTrackerToArea,
  patchTrackerItem,
  relativeTouched,
  rollup,
  toggleTrackerDone,
  type TrackerItem,
  type TrackerKind,
  type TrackerStatus,
} from "@/lib/tracker-items";

const VIEW_KEY = "mm_tracker_view_v1";
const EXPAND_KEY = "mm_tracker_expand_v1";

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

type Visible = { item: TrackerItem; level: number };

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

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return coarse;
}

const OPEN_PILL =
  "invisible inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 text-xs font-semibold text-foreground pointer-events-none group-hover:visible group-hover:pointer-events-auto group-focus-within:visible group-focus-within:pointer-events-auto";

export function TrackerTitleField({
  title,
  editing,
  fresh,
  grabFocus,
  bold,
  coarse,
  placeholder,
  onBegin,
  onOpen,
  onFinish,
  onKeyDown,
}: {
  title: string;
  editing: boolean;
  fresh: boolean;
  grabFocus: boolean;
  bold: boolean;
  coarse: boolean;
  placeholder: string;
  onBegin: () => void;
  onOpen: () => void;
  onFinish: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!grabFocus) return;
    input.current?.focus();
  }, [grabFocus]);
  useEffect(() => {
    if (editing || !input.current) return;
    if (input.current.value !== title) input.current.value = title;
  }, [editing, title]);

  if (coarse && !editing) {
    return (
      <button
        type="button"
        className={`min-w-0 truncate text-left ${bold ? "font-semibold" : ""}`}
        onClick={onOpen}
      >
        {title || "Untitled"}
      </button>
    );
  }

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <input
        ref={input}
        autoFocus={fresh}
        size={Math.min(Math.max((title || placeholder).length, 4), 72)}
        defaultValue={title}
        placeholder={placeholder}
        aria-label="Item title"
        className={
          editing
            ? "h-[30px] min-w-0 max-w-full flex-1 rounded-lg border-[1.5px] border-accent bg-card px-2 text-sm outline-none placeholder:italic placeholder:text-muted"
            : `h-7 min-w-0 max-w-full cursor-text truncate border border-transparent bg-transparent px-0 text-sm outline-none ${bold ? "font-semibold" : ""}`
        }
        onFocus={onBegin}
        onBlur={(event) => onFinish(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {fresh ? (
        <span className="shrink-0 text-[11px] text-muted">Enter adds another · Tab nests · Esc finishes</span>
      ) : null}
      {!coarse && !fresh ? (
        <button type="button" className={OPEN_PILL} onClick={onOpen}>
          <ArrowUpRight className="size-3.5" aria-hidden />
          Open
        </button>
      ) : null}
    </span>
  );
}

export function rowOpensOnKey(event: KeyboardEvent<HTMLDivElement>, open: () => void) {
  const target = event.target as HTMLElement;
  if (target.closest("button, input, textarea, select, a, label")) return;
  if (event.key === " " || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
    event.preventDefault();
    open();
  }
}

function readView(areaId: string): "outline" | "detail" {
  try {
    const raw = readAccountLocalStorage(VIEW_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed[areaId] === "detail" ? "detail" : "outline";
  } catch {
    return "outline";
  }
}

function writeView(areaId: string, view: "outline" | "detail") {
  try {
    const raw = readAccountLocalStorage(VIEW_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[areaId] = view;
    writeAccountLocalStorage(VIEW_KEY, JSON.stringify(parsed));
  } catch {
    /* */
  }
}

export function rememberTrackerDetail(areaId: string) {
  writeView(areaId, "detail");
}

function readExpanded(areaId: string): Set<string> | null {
  try {
    const raw = readAccountLocalStorage(EXPAND_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    return parsed[areaId] ? new Set(parsed[areaId]) : null;
  } catch {
    return null;
  }
}

function writeExpanded(areaId: string, ids: Set<string>) {
  try {
    const raw = readAccountLocalStorage(EXPAND_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    parsed[areaId] = [...ids];
    writeAccountLocalStorage(EXPAND_KEY, JSON.stringify(parsed));
  } catch {
    /* */
  }
}

function parentChoices(items: TrackerItem[]): { id: string; depth: number; title: string }[] {
  const out: { id: string; depth: number; title: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of childrenOf(items, parentId)) {
      out.push({ id: item.id, depth, title: item.title || "Untitled" });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function ThoughtTrackerAdd({
  dreamId,
  title,
  thoughtId,
  items,
  onCancel,
  onSave,
}: {
  dreamId: string;
  title: string;
  thoughtId: string;
  items: TrackerItem[];
  onCancel: () => void;
  onSave: (parentId: string | null) => void;
}) {
  const [text, setText] = useState(title);
  const [parentId, setParentId] = useState("");
  const choices = parentChoices(items);
  function save() {
    const next = text.trim();
    if (!next) return;
    commitTracker((current) =>
      addTrackerItem(current, {
        lifeAreaId: dreamId,
        parentId: parentId || null,
        title: next,
        sourceThoughtId: thoughtId,
      }).store,
    );
    onSave(parentId || null);
  }
  return (
    <form
      className="rounded-2xl border border-border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">Add to Tracker</p>
      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        aria-label="Item title"
        className="mt-2 h-[30px] w-full rounded-lg border-[1.5px] border-accent bg-card px-2 text-sm outline-none"
      />
      <label className="mt-2 flex items-center gap-2 text-[13px] text-foreground">
        Parent
        <select
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm"
        >
          <option value="">Top level</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {`${"\u2013 ".repeat(choice.depth)}${choice.title}`}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex gap-2">
        <button type="submit" className={`${MIST} h-9 px-4 text-sm`}>
          Add
        </button>
        <button type="button" className={`${OUTLINE} h-9 px-4 text-sm`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function LifeAreaTracker({
  dream,
  itemId,
  onRefresh,
}: {
  dream: PlanDream;
  itemId: string | null;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const root = search.get("root");
  const [view, setView] = useState<"outline" | "detail">(() => readView(dream.id));
  const [kindFilter, setKindFilter] = useState<TrackerKind | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TrackerStatus | "any">("any");
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<"create" | "rename" | null>(null);
  const [grabId, setGrabId] = useState<string | null>(null);
  const coarse = useCoarsePointer();
  const [menu, setMenu] = useState<string | null>(null);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [picker, setPicker] = useState<{ id: string; field: "status" | "kind" | "due"; el: HTMLElement } | null>(null);
  const titleLock = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<TrackerItem[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const store = loadIdeateStore();
    if (!store.trackerItems) {
      saveIdeateStore(ensureTracker(store));
      onRefresh();
    }
  }, [dream.id, onRefresh]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const store = ensureTracker(loadIdeateStore());
  const areaItems = itemsForArea(store, dream.id);
  const areas = store.dreams.filter((row) => row.id !== dream.id);

  useEffect(() => {
    const saved = readExpanded(dream.id);
    if (saved) {
      setExpanded(saved);
      return;
    }
    setExpanded(new Set(areaItems.filter((item) => childrenOf(areaItems, item.id).length > 0).map((item) => item.id)));
    // Only seed once per area.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dream.id]);

  function persistExpand(next: Set<string>) {
    setExpanded(next);
    writeExpanded(dream.id, next);
  }

  function mutate(recipe: Parameters<typeof commitTracker>[0]) {
    commitTracker(recipe);
    onRefresh();
  }

  const scopeItems = useMemo(() => {
    if (!root) return areaItems;
    const node = areaItems.find((item) => item.id === root);
    if (!node) return areaItems;
    return [node, ...descendantsOf(areaItems, root)];
  }, [areaItems, root]);

  const visible = useMemo(() => {
    const rows: Visible[] = [];
    const walk = (parentId: string | null, level: number) => {
      for (const item of childrenOf(scopeItems, parentId === root ? root : parentId)) {
        if (root && parentId === null) continue;
        if (kindFilter !== "all" && item.kind !== kindFilter) continue;
        if (statusFilter !== "any" && item.status !== statusFilter) continue;
        if (hideDone && item.status === "done") continue;
        const shownLevel = root ? Math.max(0, level) : level;
        rows.push({ item, level: shownLevel });
        if (expanded.has(item.id) || narrow) {
          if (!(narrow && childrenOf(scopeItems, item.id).length > 0 && !expanded.has(item.id))) {
            walk(item.id, shownLevel + 1);
          }
        }
      }
    };
    if (root) {
      const node = scopeItems.find((item) => item.id === root);
      if (node) walk(root, 0);
    } else {
      walk(null, 0);
    }
    return rows;
  }, [scopeItems, expanded, kindFilter, statusFilter, hideDone, root, narrow]);

  function topOf(id: string): TrackerItem | null {
    let current = areaItems.find((item) => item.id === id) ?? null;
    while (current?.parentId) {
      current = areaItems.find((item) => item.id === current!.parentId) ?? null;
    }
    return current;
  }

  function openDetail(id: string) {
    const top = topOf(id);
    writeView(dream.id, "detail");
    setView("detail");
    if (top) navigate(`/manifest/goal/${encodeURIComponent(dream.id)}/tracker/${encodeURIComponent(top.id)}`);
  }

  function addItem(parentId: string | null, afterId?: string | null) {
    let created = "";
    mutate((current) => {
      const result = addTrackerItem(current, {
        lifeAreaId: dream.id,
        parentId,
        afterId: afterId ?? null,
      });
      created = result.id;
      return result.store;
    });
    if (parentId) persistExpand(new Set([...expanded, parentId]));
    setEditingMode("create");
    setGrabId(created);
    setEditing(created);
  }

  function startEdit(id: string | null, mode: "create" | "rename" = "rename", grab = false) {
    setEditing(id);
    setEditingMode(id ? mode : null);
    setGrabId(grab ? id : null);
  }

  function openMenu(id: string | null, el?: HTMLElement) {
    setPicker(null);
    if (!id || menu === id) {
      setMenu(null);
      setMenuEl(null);
      return;
    }
    setMenu(id);
    setMenuEl(el ?? null);
  }

  function openPicker(id: string, field: "status" | "kind" | "due", el: HTMLElement) {
    setMenu(null);
    setMenuEl(null);
    setPicker((current) => (current?.id === id && current.field === field ? null : { id, field, el }));
  }

  function applyTitle(item: TrackerItem, value: string, next: "close" | "sibling" | "keep") {
    const title = value.trim();
    if (!title) {
      mutate((current) => deleteTrackerItem(current, item.id));
      setEditing(null);
      setEditingMode(null);
      setGrabId(null);
      return false;
    }
    mutate((current) => patchTrackerItem(current, item.id, { title }));
    if (next === "sibling") addItem(item.parentId, item.id);
    else if (next === "close") {
      setEditing(null);
      setEditingMode(null);
      setGrabId(null);
    }
    return true;
  }

  function finishEdit(item: TrackerItem, value: string) {
    if (titleLock.current) {
      titleLock.current = false;
      return;
    }
    applyTitle(item, value, "close");
  }

  function onTitleKey(event: KeyboardEvent<HTMLInputElement>, item: TrackerItem) {
    if (event.key === "Enter" && editingMode === "rename") {
      event.preventDefault();
      titleLock.current = true;
      applyTitle(item, event.currentTarget.value, "close");
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape" && editingMode === "rename") {
      event.preventDefault();
      event.stopPropagation();
      titleLock.current = true;
      event.currentTarget.value = item.title;
      event.currentTarget.blur();
      setEditing(null);
      setEditingMode(null);
      setGrabId(null);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      titleLock.current = true;
      applyTitle(item, event.currentTarget.value, "sibling");
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      titleLock.current = true;
      applyTitle(item, event.currentTarget.value, "close");
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      if (!applyTitle(item, event.currentTarget.value, "keep")) return;
      const siblings = childrenOf(areaItems, item.parentId);
      const index = siblings.findIndex((row) => row.id === item.id);
      const previous = siblings[index - 1];
      if (!previous) return;
      mutate((current) => moveTrackerItem(current, item.id, previous.id, null));
      persistExpand(new Set([...expanded, previous.id]));
    } else if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      if (!applyTitle(item, event.currentTarget.value, "keep")) return;
      const parent = areaItems.find((row) => row.id === item.parentId);
      if (!parent) return;
      mutate((current) => moveTrackerItem(current, item.id, parent.parentId, null));
    } else if (event.key === "Backspace" && event.currentTarget.value === "") {
      event.preventDefault();
      titleLock.current = true;
      const siblings = childrenOf(areaItems, item.parentId);
      const index = siblings.findIndex((row) => row.id === item.id);
      const previous = siblings[index - 1];
      mutate((current) => deleteTrackerItem(current, item.id));
      setEditing(previous?.id ?? null);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const siblings = childrenOf(areaItems, item.parentId);
      const index = siblings.findIndex((row) => row.id === item.id);
      const swap = event.key === "ArrowUp" ? siblings[index - 1] : siblings[index + 1];
      if (!swap) return;
      mutate((current) => moveTrackerItem(current, item.id, item.parentId, event.key === "ArrowUp" ? swap.id : siblings[index + 2]?.id ?? null));
    }
  }

  function toggleSelect(id: string, shift: boolean, meta: boolean) {
    if (shift && anchor) {
      const ids = visible.map((row) => row.item.id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(ids.slice(lo, hi + 1));
        return;
      }
    }
    setAnchor(id);
    setSelected((current) =>
      meta || current.includes(id)
        ? current.includes(id)
          ? current.filter((row) => row !== id)
          : [...current, id]
        : [id],
    );
    if (!meta && !shift) {
      setSelected((current) => (current.includes(id) && current.length === 1 ? [] : current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
    }
  }

  function selectDot(id: string, event: MouseEvent) {
    event.stopPropagation();
    if (event.shiftKey && anchor) {
      const ids = visible.map((row) => row.item.id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(ids.slice(lo, hi + 1));
        return;
      }
    }
    setAnchor(id);
    setSelected((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  const covered = useMemo(() => {
    const chosen = new Set(selected);
    const leaves: TrackerItem[] = [];
    const seen = new Set<string>();
    for (const id of selected) {
      for (const leaf of leavesOf(areaItems, id)) {
        if (leaf.status === "done" || seen.has(leaf.id) || !chosen.has(id)) continue;
        seen.add(leaf.id);
        leaves.push(leaf);
      }
    }
    return leaves;
  }, [selected, areaItems]);

  const selectedTop = itemId ? areaItems.find((item) => item.id === itemId) ?? null : childrenOf(areaItems, null)[0] ?? null;
  const zoomNode = root ? areaItems.find((item) => item.id === root) ?? null : null;
  const ancestors = useMemo(() => {
    const chain: TrackerItem[] = [];
    let current = zoomNode;
    while (current?.parentId) {
      const parent = areaItems.find((item) => item.id === current?.parentId);
      if (!parent) break;
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  }, [zoomNode, areaItems]);

  const indent = narrow ? 16 : 24;
  const indentCap = narrow ? 3 : 4;

  return (
    <div className="flex flex-col gap-3" onKeyDown={(event) => { if (event.key === "Escape") setSelected([]); }}>
      {zoomNode ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${OUTLINE} h-9 px-3 text-[13px]`}
            onClick={() => {
              const params = new URLSearchParams(search);
              if (zoomNode.parentId) params.set("root", zoomNode.parentId);
              else params.delete("root");
              setSearch(params, { replace: true });
            }}
          >
            ↑ Up a level
          </button>
          <p className="min-w-0 truncate text-[13px] text-muted">
            Tracker
            {ancestors.map((item) => ` › ${item.title || "Untitled"}`).join("")}
            {` › ${zoomNode.title || "Untitled"}`}
          </p>
        </div>
      ) : null}
      {search.get("fromThought") ? (
        <ThoughtTrackerAdd
          dreamId={dream.id}
          title={search.get("addTitle") ?? ""}
          thoughtId={search.get("fromThought") ?? ""}
          items={areaItems}
          onCancel={() => {
            const params = new URLSearchParams(search);
            params.delete("fromThought");
            params.delete("addTitle");
            setSearch(params, { replace: true });
          }}
          onSave={(parentId) => {
            if (parentId) {
              const next = new Set(expanded);
              let current: string | null = parentId;
              while (current) {
                next.add(current);
                current = areaItems.find((item) => item.id === current)?.parentId ?? null;
              }
              persistExpand(next);
            }
            const params = new URLSearchParams(search);
            params.delete("fromThought");
            params.delete("addTitle");
            setSearch(params, { replace: true });
            onRefresh();
          }}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-[34px] items-center rounded-full border border-border bg-card p-0.5 text-[13px]">
          {([
            ["outline", List, "Outline"],
            ["detail", Columns2, "Detail"],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 ${view === id ? "bg-foreground text-white" : "text-foreground"}`}
              onClick={() => {
                setView(id);
                writeView(dream.id, id);
              }}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
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
        <button type="button" className={`${MIST} ml-auto h-10 px-4 text-sm`} onClick={() => addItem(root)}>
          <Plus className="size-4" /> New
        </button>
      </div>

      {view === "outline" || !selectedTop ? (
        <Outline
          rows={visible}
          items={areaItems}
          expanded={expanded}
          selected={selected}
          editing={editing}
          menu={menu}
          indent={indent}
          indentCap={indentCap}
          narrow={narrow}
          areas={areas}
          onToggleExpand={(id) => {
            const kids = childrenOf(areaItems, id);
            if (narrow && kids.length > 0) {
              const params = new URLSearchParams(search);
              params.set("root", id);
              setSearch(params);
              return;
            }
            const next = new Set(expanded);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            persistExpand(next);
          }}
          coarse={coarse}
          editingMode={editingMode}
          grabId={grabId}
          onOpen={openDetail}
          onEdit={startEdit}
          onTitle={(id, title) => mutate((current) => patchTrackerItem(current, id, { title }))}
          onTitleKey={onTitleKey}
          onDone={(item) => {
            const kids = descendantsOf(areaItems, item.id);
            if (kids.length > 0 && item.status !== "done") {
              const ok = window.confirm(`Mark ${plural(kids.length + 1, "item", "items")} done?`);
              if (!ok) return;
            }
            mutate((current) => toggleTrackerDone(current, item.id));
          }}
          onSelect={selectDot}
          onMenu={openMenu}
          onPick={openPicker}
          onFinish={finishEdit}
          onAddChild={(id) => addItem(id)}
          onZoom={(id) => {
            const params = new URLSearchParams(search);
            params.set("root", id);
            setSearch(params);
          }}
          onPatch={(id, patch) => mutate((current) => patchTrackerItem(current, id, patch))}
          onDelete={(id) => mutate((current) => deleteTrackerItem(current, id))}
          onDuplicate={(id) => mutate((current) => duplicateTrackerItem(current, id))}
          onMoveArea={(id, lifeAreaId) => mutate((current) => moveTrackerToArea(current, id, lifeAreaId))}
          onMoveUnder={(id, parentId) => mutate((current) => moveTrackerItem(current, id, parentId, null))}
          onDragEnd={(id, parentId, beforeId) => mutate((current) => moveTrackerItem(current, id, parentId, beforeId))}
        />
      ) : (
        <Detail
          dream={dream}
          item={selectedTop}
          items={areaItems}
          rows={visible.filter((row) => row.item.id === selectedTop.id || descendantsOf(areaItems, selectedTop.id).some((child) => child.id === row.item.id))}
          hideDone={hideDone}
          suggesting={suggesting}
          areas={areas}
          topLevel={childrenOf(areaItems, null)}
          narrow={narrow}
          coarse={coarse}
          editingMode={editingMode}
          grabId={grabId}
          editing={editing}
          menu={menu}
          expanded={expanded}
          selected={selected}
          indent={indent}
          indentCap={indentCap}
          onHideDone={() => setHideDone((value) => !value)}
          onSelectTop={(id) => navigate(`/manifest/goal/${encodeURIComponent(dream.id)}/tracker/${encodeURIComponent(id)}`)}
          onSuggest={() => {
            setSuggesting(true);
            void streamPlanCoachReply(
              [{ role: "user", content: `Suggest 4 short child items for “${selectedTop.title}”. One item per line, no numbering.` }],
              () => undefined,
            )
              .then((raw) => {
                const lines = raw.split("\n").map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 5);
                mutate((current) => {
                  let next = current;
                  for (const title of lines) {
                    next = addTrackerItem(next, { lifeAreaId: dream.id, parentId: selectedTop.id, title }).store;
                  }
                  return next;
                });
              })
              .finally(() => setSuggesting(false));
          }}
          onOpen={openDetail}
          onEdit={startEdit}
          onTitle={(id, title) => mutate((current) => patchTrackerItem(current, id, { title }))}
          onTitleKey={onTitleKey}
          onDone={(item) => mutate((current) => toggleTrackerDone(current, item.id))}
          onMenu={openMenu}
          onPick={openPicker}
          onFinish={finishEdit}
          onAddChild={(id) => addItem(id)}
          onPatch={(id, patch) => mutate((current) => patchTrackerItem(current, id, patch))}
          onDelete={(id) => mutate((current) => deleteTrackerItem(current, id))}
          onDuplicate={(id) => mutate((current) => duplicateTrackerItem(current, id))}
          onMoveArea={(id, lifeAreaId) => mutate((current) => moveTrackerToArea(current, id, lifeAreaId))}
          onToggleExpand={(id) => {
            const next = new Set(expanded);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            persistExpand(next);
          }}
          onSelect={selectDot}
          onZoom={(id) => {
            const params = new URLSearchParams(search);
            params.set("root", id);
            setSearch(params);
          }}
          onAdd={() => addItem(selectedTop.id)}
          onPlan={() =>
            openAssistantChatFab({
              kind: "life_area_ideate",
              lifeAreaId: dream.id,
              seed: `Plan the next steps for “${selectedTop.title}”.`,
            })
          }
        />
      )}

      <button type="button" className="py-2 text-left text-sm text-muted" onClick={() => addItem(root)}>
        + Add anything: a goal, a project, a feature, a task…
      </button>

      {selected.length > 0 ? (
        <div className="fixed inset-x-3 bottom-[calc(var(--app-mobile-tab-h,0px)+12px)] z-30 mx-auto flex max-w-3xl items-center gap-2 rounded-full bg-foreground px-4 py-1.5 text-white shadow-[0_16px_36px_-14px_rgba(0,0,0,0.6)] md:bottom-6">
          <span className="text-sm">{selected.length} selected · {plural(covered.length, "task", "tasks")}</span>
          <button type="button" className={`${MIST} h-9 px-3 text-[13px]`} onClick={() => setSheet(covered)}>
            <Timer className="size-3.5" /> Focus session
          </button>
          <button
            type="button"
            className="h-9 rounded-full border border-white/30 px-3 text-[13px]"
            onClick={() => {
              const href = startLifeAreaMeditation(dream.id, undefined, {
                source: "goal",
                brief: covered.map((item) => item.title).join("\n"),
              });
              if (href) navigate(href);
            }}
          >
            ✦ Meditation
          </button>
          <button type="button" className="ml-auto grid size-9 place-items-center" onClick={() => setSelected([])} aria-label="Clear selection">
            ×
          </button>
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 p-4 sm:place-items-center" onClick={() => setSheet(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-4" onClick={(event) => event.stopPropagation()}>
            <p className="font-display text-2xl">{plural(sheet.length, "task", "tasks")}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {sheet.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{item.title || "Untitled"}</span>
                  <button type="button" className="text-muted" onClick={() => setSheet(sheet.filter((row) => row.id !== item.id))}>Remove</button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`${MIST} mt-4 h-10 w-full`}
              onClick={() => navigate(queueTrackerFocus(sheet.map((item) => ({ id: item.id, title: item.title, lifeAreaId: item.lifeAreaId }))))}
            >
              Start 25 min
            </button>
          </div>
        </div>
      ) : null}
      {menu && menuEl && areaItems.find((item) => item.id === menu) ? (
        <ItemMenu
          anchor={menuEl}
          item={areaItems.find((item) => item.id === menu)!}
          items={areaItems}
          areas={areas}
          onRename={coarse ? (id) => startEdit(id, "rename", true) : undefined}
          onOpen={(id) => {
            openDetail(id);
            openMenu(null);
          }}
          onZoom={(id) => {
            const params = new URLSearchParams(search);
            params.set("root", id);
            setSearch(params);
            openMenu(null);
          }}
          onPatch={(id, patch) => mutate((current) => patchTrackerItem(current, id, patch))}
          onDelete={(id) => mutate((current) => deleteTrackerItem(current, id))}
          onDuplicate={(id) => mutate((current) => duplicateTrackerItem(current, id))}
          onMoveArea={(id, lifeAreaId) => mutate((current) => moveTrackerToArea(current, id, lifeAreaId))}
          onMoveUnder={(id, parentId) => mutate((current) => moveTrackerItem(current, id, parentId, null))}
          onClose={() => openMenu(null)}
        />
      ) : null}
      {picker && areaItems.find((item) => item.id === picker.id) ? (
        <FieldPicker
          anchor={picker.el}
          item={areaItems.find((item) => item.id === picker.id)!}
          field={picker.field}
          onPatch={(patch) => mutate((current) => patchTrackerItem(current, picker.id, patch))}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}

function KindTag({ kind }: { kind: TrackerKind | null }) {
  if (!kind) return null;
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-semibold ${KIND_CLASS[kind]}`}>
      <span className={`size-1.5 rounded-sm ${KIND_DOT[kind]}`} />
      {KIND_LABEL[kind]}
    </span>
  );
}

function StatusPill({ item }: { item: TrackerItem }) {
  if (!item.status) return null;
  if (item.status === "doing") {
    return <span className={`${MIST} h-6 px-2 text-[11.5px]`}>Doing</span>;
  }
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

function Outline({
  rows,
  items,
  expanded,
  selected,
  editing,
  editingMode,
  grabId,
  coarse,
  menu,
  indent,
  indentCap,
  narrow,
  areas,
  onToggleExpand,
  onOpen,
  onEdit,
  onTitle,
  onTitleKey,
  onDone,
  onSelect,
  onMenu,
  onPick,
  onFinish,
  onAddChild,
  onZoom,
  onPatch,
  onDelete,
  onDuplicate,
  onMoveArea,
  onMoveUnder,
  onDragEnd,
}: {
  rows: Visible[];
  items: TrackerItem[];
  expanded: Set<string>;
  selected: string[];
  editing: string | null;
  editingMode: "create" | "rename" | null;
  grabId: string | null;
  coarse: boolean;
  menu: string | null;
  indent: number;
  indentCap: number;
  narrow: boolean;
  areas: PlanDream[];
  onToggleExpand: (id: string) => void;
  onOpen: (id: string) => void;
  onEdit: (id: string | null, mode?: "create" | "rename", grab?: boolean) => void;
  onTitle: (id: string, title: string) => void;
  onTitleKey: (event: KeyboardEvent<HTMLInputElement>, item: TrackerItem) => void;
  onDone: (item: TrackerItem) => void;
  onSelect: (id: string, event: MouseEvent) => void;
  onMenu: (id: string | null, el?: HTMLElement) => void;
  onPick: (id: string, field: "status" | "kind" | "due", el: HTMLElement) => void;
  onFinish: (item: TrackerItem, value: string) => void;
  onAddChild: (id: string | null) => void;
  onZoom: (id: string) => void;
  onPatch: (id: string, patch: Partial<TrackerItem>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveArea: (id: string, lifeAreaId: string) => void;
  onMoveUnder: (id: string, parentId: string | null) => void;
  onDragEnd: (id: string, parentId: string | null, beforeId: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const ghosts = ghostAfter(rows, expanded);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="grid min-w-[720px] grid-cols-[minmax(0,3fr)_150px_140px_90px_120px] px-3 text-[11px] uppercase tracking-wide text-muted">
        <span className="py-2">Item</span>
        <span className="py-2">Status</span>
        <span className="py-2">Progress</span>
        <span className="py-2">Due</span>
        <span className="py-2">Touched</span>
      </div>
      {rows.map(({ item, level }, index) => {
        const kids = childrenOf(items, item.id);
        const stats = rollup(items, item.id);
        const depth = Math.min(level, indentCap);
        const parent = item.parentId ? items.find((row) => row.id === item.parentId) : null;
        const rowGhosts = ghosts.get(index) ?? [];
        return (
          <div key={item.id}>
          <div
            draggable
            onDragStart={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("input, textarea")) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/plain");
              if (!id || id === item.id) return;
              const asChild = event.nativeEvent.offsetX > 48 + depth * indent;
              onDragEnd(id, asChild ? item.id : item.parentId, asChild ? null : item.id);
            }}
            tabIndex={0}
            onKeyDown={(event) => rowOpensOnKey(event, () => onOpen(item.id))}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("button, input, textarea, select, a, label")) return;
              onSelect(item.id, event);
            }}
            onMouseEnter={() => setHover(item.id)}
            onMouseLeave={() => setHover((current) => (current === item.id ? null : current))}
            className={`group grid min-w-[720px] grid-cols-[minmax(0,3fr)_150px_140px_90px_120px] items-center border-t border-border px-3 py-[9px] text-sm outline-none ${selected.includes(item.id) ? "bg-[color-mix(in_srgb,var(--primary)_28%,transparent)]" : "hover:bg-background focus-within:bg-background"}`}
            style={{ boxShadow: selected.includes(item.id) ? "inset 3px 0 0 var(--foreground)" : undefined }}
          >
            <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * indent }}>
              <button type="button" className={`grid size-7 place-items-center rounded-full border ${selected.includes(item.id) ? "border-foreground bg-foreground text-white" : "border-border opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`} onClick={(event) => onSelect(item.id, event)} aria-label="Select">
                {selected.includes(item.id) ? "✓" : ""}
              </button>
              <GripVertical className="size-3.5 text-muted opacity-0 group-hover:opacity-100" />
              <button type="button" title="Add an item inside" aria-label="Add an item inside" className="grid size-[18px] shrink-0 place-items-center rounded-md border border-border bg-card text-foreground opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100" onClick={() => onAddChild(item.id)}>
                <Plus className="size-3" />
              </button>
              {level > indentCap ? (
                <span className="rounded-md border border-accent/40 bg-accent-soft px-1 text-[10.5px] font-semibold text-accent-link">L{level + 1}</span>
              ) : null}
              {narrow && parent && level >= indentCap ? (
                <span className="truncate text-[11px] text-muted">↳ under {parent.title}</span>
              ) : null}
              {kids.length > 0 ? (
                <button type="button" aria-label="Expand" onClick={() => onToggleExpand(item.id)}>
                  <ChevronRight className={`size-4 ${expanded.has(item.id) ? "rotate-90" : ""}`} />
                </button>
              ) : (
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={item.status === "done"} onChange={() => onDone(item)} />
              )}
              <TrackerTitleField
                title={item.title}
                editing={editing === item.id}
                fresh={editing === item.id && editingMode === "create"}
                grabFocus={grabId === item.id}
                bold={level === 0}
                coarse={coarse}
                placeholder={parent ? `New item in ${parent.title || "this item"}` : "New item"}
                onBegin={() => {
                  if (editing === item.id && editingMode === "create") return;
                  onEdit(item.id, "rename");
                }}
                onOpen={() => onOpen(item.id)}
                onFinish={(value) => onFinish(item, value)}
                onKeyDown={(event) => onTitleKey(event, item)}
              />
              {item.kind ? (
                <button type="button" onClick={(event) => onPick(item.id, "kind", event.currentTarget)}><KindTag kind={item.kind} /></button>
              ) : (
                <button type="button" className="text-xs text-muted opacity-0 group-hover:opacity-100" onClick={(event) => onPick(item.id, "kind", event.currentTarget)}>+ Kind</button>
              )}
            </div>
            <button type="button" className="text-left" onClick={(event) => onPick(item.id, "status", event.currentTarget)}>
              {item.status ? <StatusPill item={item} /> : <span className="text-xs text-muted opacity-0 group-hover:opacity-100">Set status</span>}
            </button>
            <div>
              {stats.tickable && kids.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="w-[60px]"><ProgressBar done={stats.doneLeaves} total={stats.leaves} /></span>
                  <span className="text-xs text-muted">{stats.doneLeaves}/{stats.leaves}</span>
                </div>
              ) : kids.length > 0 ? (
                <span className="text-xs text-muted">{plural(kids.length, "item", "items")}</span>
              ) : null}
            </div>
            <button type="button" className="text-left text-accent-link" onClick={(event) => onPick(item.id, "due", event.currentTarget)}>
              {item.due ? dueLabel(item.due) : <span className="text-xs text-muted opacity-0 group-hover:opacity-100">Set date</span>}
            </button>
            <div className="flex items-center justify-end gap-1">
              {coarse ? (
                <button type="button" className="grid size-7 place-items-center text-muted" aria-label="Open" onClick={() => onOpen(item.id)}>
                  <ChevronRight className="size-4" />
                </button>
              ) : (
                <span className="text-muted group-hover:hidden group-focus-within:hidden">{relativeTouched(item.lastTouchedAt)}</span>
              )}
              <span className={`${coarse ? "flex" : "hidden group-hover:flex group-focus-within:flex"} items-center gap-1`}>
                {kids.length > 0 ? (
                  <button type="button" title="Zoom in" aria-label="Zoom in" className="grid size-7 place-items-center rounded-lg border border-border bg-card" onClick={() => onZoom(item.id)}>
                    <ZoomIn className="size-3.5" />
                  </button>
                ) : null}
                <button type="button" aria-label="Item menu" className="grid size-7 place-items-center rounded-lg border border-border bg-card" onClick={(event) => onMenu(menu === item.id ? null : item.id, event.currentTarget)}>
                  <MoreHorizontal className="size-3.5" />
                </button>
              </span>
            </div>
          </div>
          {rowGhosts.map((ghost) => (narrow || groupHot(hover, ghost.parent.id, items)) ? (
            <button
              key={`add-${ghost.parent.id}`}
              type="button"
              className="flex min-w-[720px] items-center gap-1.5 border-t border-border px-3 py-2 text-[13px] text-muted"
              style={{ paddingLeft: 12 + Math.min(ghost.level, indentCap) * indent + 52 }}
              onClick={() => onAddChild(ghost.parent.id)}
            >
              <Plus className="size-3.5" /> Add item to {ghost.parent.title || "this item"}
            </button>
          ) : null)}
          </div>
        );
      })}
    </div>
  );
}

function ghostAfter(rows: Visible[], expanded: Set<string>) {
  const at = new Map<number, { parent: TrackerItem; level: number }[]>();
  rows.forEach((row, index) => {
    if (!expanded.has(row.item.id)) return;
    let last = index;
    for (let i = index + 1; i < rows.length; i += 1) {
      if (rows[i]!.level <= row.level) break;
      last = i;
    }
    const list = at.get(last) ?? [];
    list.push({ parent: row.item, level: row.level + 1 });
    at.set(last, list);
  });
  for (const list of at.values()) list.sort((a, b) => b.level - a.level);
  return at;
}

function groupHot(hoverId: string | null, parentId: string, items: TrackerItem[]) {
  let current = items.find((item) => item.id === hoverId) ?? null;
  while (current) {
    if (current.id === parentId) return true;
    const nextId = current.parentId;
    current = nextId ? items.find((item) => item.id === nextId) ?? null : null;
  }
  return false;
}

function Anchored({
  anchor,
  width,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const height = panel.current?.offsetHeight ?? 280;
      const flip = rect.bottom + 8 + height > window.innerHeight - 8;
      const top = flip ? Math.max(8, rect.top - height - 8) : rect.bottom + 8;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      setBox({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width]);
  useEffect(() => {
    const onDown = (event: Event) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchor, onClose]);
  return createPortal(
    <div ref={panel} style={{ top: box.top, left: box.left, width }} className="fixed z-50 rounded-[14px] border border-border bg-card p-1.5 shadow-[0_16px_40px_-18px_rgba(15,27,45,0.45)]">
      {children}
    </div>,
    document.body,
  );
}

const MENU_ROW = "flex h-[34px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-foreground hover:bg-accent-soft";

function ItemMenu({
  anchor,
  item,
  items,
  areas,
  onOpen,
  onRename,
  onZoom,
  onPatch,
  onDelete,
  onDuplicate,
  onMoveArea,
  onMoveUnder,
  onClose,
}: {
  anchor: HTMLElement;
  item: TrackerItem;
  items: TrackerItem[];
  areas: PlanDream[];
  onOpen: (id: string) => void;
  onRename?: (id: string) => void;
  onZoom: (id: string) => void;
  onPatch: (id: string, patch: Partial<TrackerItem>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveArea: (id: string, lifeAreaId: string) => void;
  onMoveUnder: (id: string, parentId: string | null) => void;
  onClose: () => void;
}) {
  const [sub, setSub] = useState<"kind" | "due" | "move" | "area" | "waiting" | null>(null);
  const [query, setQuery] = useState("");
  const kids = descendantsOf(items, item.id);
  const blocked = new Set([item.id, ...kids.map((row) => row.id)]);
  const destinations = moveTree(items.filter((row) => row.lifeAreaId === item.lifeAreaId && !blocked.has(row.id)), query);
  return (
    <Anchored anchor={anchor} width={250} onClose={onClose}>
      <MenuButton icon={ArrowUpRight} label="Open" onClick={() => onOpen(item.id)} />
      {onRename ? (
        <MenuButton
          icon={Pencil}
          label="Rename"
          onClick={() => {
            onRename(item.id);
            onClose();
          }}
        />
      ) : null}
      {kids.length > 0 ? <MenuButton icon={ZoomIn} label="Zoom in" onClick={() => onZoom(item.id)} /> : null}
      <div className="my-1 h-px bg-border" />
      <MenuButton icon={Tag} label="Kind" chevron onClick={() => setSub(sub === "kind" ? null : "kind")} />
      {sub === "kind" ? (
        <div className="mb-1 ml-6 flex flex-col">
          {KINDS.map((kind) => (
            <button key={kind} type="button" className={MENU_ROW} onClick={() => { onPatch(item.id, { kind }); onClose(); }}>
              <KindTag kind={kind} />
              {item.kind === kind ? <span className="ml-auto">✓</span> : null}
            </button>
          ))}
          <button type="button" className={`${MENU_ROW} text-muted`} onClick={() => { onPatch(item.id, { kind: null }); onClose(); }}>None {item.kind == null ? <span className="ml-auto">✓</span> : null}</button>
        </div>
      ) : null}
      <MenuButton icon={Calendar} label="Due date" chevron onClick={() => setSub(sub === "due" ? null : "due")} />
      {sub === "due" ? (
        <div className="mb-1 ml-6 flex flex-col gap-1 px-2">
          <input type="date" className="h-8 rounded-lg border border-border bg-card px-2 text-sm" defaultValue={item.due ?? ""} onChange={(event) => { onPatch(item.id, { due: event.target.value || null }); onClose(); }} />
          <button type="button" className="h-8 text-left text-sm text-muted" onClick={() => { onPatch(item.id, { due: null }); onClose(); }}>Clear</button>
        </div>
      ) : null}
      {sub === "waiting" ? (
        <input
          autoFocus
          defaultValue={item.waitingOn ?? ""}
          placeholder="Name"
          className="mx-2 mb-1 h-8 w-[calc(100%-16px)] rounded-lg border border-border bg-card px-2 text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onPatch(item.id, { status: "waiting", waitingOn: event.currentTarget.value.trim() || null });
              onClose();
            }
          }}
        />
      ) : (
        <MenuButton icon={UserRound} label="Waiting on…" onClick={() => setSub("waiting")} />
      )}
      <div className="my-1 h-px bg-border" />
      <MenuButton icon={Pin} label="Show on Overview" mark={item.pinned} onClick={() => { onPatch(item.id, { pinned: !item.pinned }); onClose(); }} />
      <MenuButton icon={FolderInput} label="Move to…" chevron onClick={() => setSub(sub === "move" ? null : "move")} />
      {sub === "move" || sub === "area" ? (
        <div className="mb-1 ml-6">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" className="mb-1 h-8 w-full rounded-lg border border-border bg-card px-2 text-sm" />
          <div className="max-h-40 overflow-y-auto">
            {destinations.map((row) => (
              <button key={row.item.id} type="button" className={MENU_ROW} style={{ paddingLeft: 8 + row.depth * 12 }} onClick={() => { onMoveUnder(item.id, row.item.id); onClose(); }}>
                {row.item.title || "Untitled"}
              </button>
            ))}
          </div>
          <button type="button" className={MENU_ROW} onClick={() => setSub(sub === "area" ? "move" : "area")}>
            Another life area <ChevronRight className="ml-auto size-3.5" />
          </button>
          {sub === "area" ? areas.map((area) => (
            <button key={area.id} type="button" className={MENU_ROW} onClick={() => { onMoveArea(item.id, area.id); onClose(); }}>{area.title}</button>
          )) : null}
        </div>
      ) : null}
      <MenuButton icon={Copy} label="Duplicate" onClick={() => { onDuplicate(item.id); onClose(); }} />
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        className={`${MENU_ROW} text-danger`}
        onClick={() => {
          if (kids.length > 0 && !window.confirm(`Delete “${item.title || "Untitled"}” and its ${plural(kids.length, "item", "items")}?`)) return;
          onDelete(item.id);
          onClose();
        }}
      >
        <Trash2 className="size-[15px]" /> Delete
      </button>
    </Anchored>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  chevron,
  mark,
}: {
  icon: typeof Tag;
  label: string;
  onClick: () => void;
  chevron?: boolean;
  mark?: boolean;
}) {
  return (
    <button type="button" className={MENU_ROW} onClick={onClick}>
      <Icon className="size-[15px] text-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {mark ? <span>✓</span> : null}
      {chevron ? <ChevronRight className="size-3.5 text-muted" /> : null}
    </button>
  );
}

function moveTree(items: TrackerItem[], query: string) {
  const q = query.trim().toLowerCase();
  const rows: { item: TrackerItem; depth: number }[] = [];
  const collect = (parentId: string | null, depth: number): boolean => {
    let any = false;
    for (const item of childrenOf(items, parentId)) {
      const start = rows.length;
      const childHit = collect(item.id, depth + 1);
      const self = !q || (item.title || "").toLowerCase().includes(q);
      if (self || childHit) {
        rows.splice(start, 0, { item, depth });
        any = true;
      }
    }
    return any;
  };
  collect(null, 0);
  return rows;
}

function FieldPicker({
  anchor,
  item,
  field,
  onPatch,
  onClose,
}: {
  anchor: HTMLElement;
  item: TrackerItem;
  field: "status" | "kind" | "due";
  onPatch: (patch: Partial<TrackerItem>) => void;
  onClose: () => void;
}) {
  return (
    <Anchored anchor={anchor} width={220} onClose={onClose}>
      {field === "status" ? (
        <>
          {STATUSES.map((status) => (
            <button key={status} type="button" className={MENU_ROW} onClick={() => { onPatch({ status, waitingOn: status === "waiting" ? item.waitingOn : null }); onClose(); }}>
              <span>{STATUS_LABEL[status]}</span>
              {item.status === status ? <span className="ml-auto">✓</span> : null}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button type="button" className={`${MENU_ROW} text-muted`} onClick={() => { onPatch({ status: null, waitingOn: null }); onClose(); }}>No status</button>
        </>
      ) : null}
      {field === "kind" ? (
        <>
          {KINDS.map((kind) => (
            <button key={kind} type="button" className={MENU_ROW} onClick={() => { onPatch({ kind }); onClose(); }}>
              <KindTag kind={kind} />
              {item.kind === kind ? <span className="ml-auto">✓</span> : null}
            </button>
          ))}
          <button type="button" className={`${MENU_ROW} text-muted`} onClick={() => { onPatch({ kind: null }); onClose(); }}>None {item.kind == null ? <span className="ml-auto">✓</span> : null}</button>
        </>
      ) : null}
      {field === "due" ? (
        <div className="flex flex-col gap-1 p-1">
          <input type="date" className="h-8 rounded-lg border border-border bg-card px-2 text-sm" defaultValue={item.due ?? ""} onChange={(event) => { onPatch({ due: event.target.value || null }); onClose(); }} />
          <button type="button" className="h-8 px-2 text-left text-sm text-muted" onClick={() => { onPatch({ due: null }); onClose(); }}>Clear</button>
        </div>
      ) : null}
    </Anchored>
  );
}

function Detail(props: {
  dream: PlanDream;
  item: TrackerItem;
  items: TrackerItem[];
  rows: Visible[];
  hideDone: boolean;
  suggesting: boolean;
  areas: PlanDream[];
  topLevel: TrackerItem[];
  narrow: boolean;
  coarse: boolean;
  editingMode: "create" | "rename" | null;
  grabId: string | null;
  editing: string | null;
  menu: string | null;
  expanded: Set<string>;
  selected: string[];
  indent: number;
  indentCap: number;
  onHideDone: () => void;
  onSelectTop: (id: string) => void;
  onSuggest: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string | null, mode?: "create" | "rename", grab?: boolean) => void;
  onTitle: (id: string, title: string) => void;
  onTitleKey: (event: React.KeyboardEvent<HTMLInputElement>, item: TrackerItem) => void;
  onDone: (item: TrackerItem) => void;
  onMenu: (id: string | null, el?: HTMLElement) => void;
  onPick: (id: string, field: "status" | "kind" | "due", el: HTMLElement) => void;
  onFinish: (item: TrackerItem, value: string) => void;
  onAddChild: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<TrackerItem>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveArea: (id: string, lifeAreaId: string) => void;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onZoom: (id: string) => void;
  onAdd: () => void;
  onPlan: () => void;
}) {
  const stats = rollup(props.items, props.item.id);
  const doing = descendantsOf(props.items, props.item.id).filter((item) => item.status === "doing").length;
  const [hover, setHover] = useState<string | null>(null);
  const detailRows = props.rows.filter((row) => row.item.id !== props.item.id);
  const ghosts = ghostAfter(detailRows, props.expanded);
  return (
    <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
      <div className="hidden xl:block">
        <p className="text-sm font-semibold">{plural(props.topLevel.length, "top-level item", "top-level items")}</p>
        <p className="text-xs text-muted">Drag to reorder</p>
        <div className="mt-2 flex flex-col gap-2">
          {props.topLevel.map((row) => {
            const rowStats = rollup(props.items, row.id);
            const active = row.id === props.item.id;
            return (
              <button key={row.id} type="button" onClick={() => props.onSelectTop(row.id)} className={`rounded-2xl border px-3 py-2 text-left ${active ? "border-accent/50 bg-accent-soft" : "border-border bg-card"}`}>
                <span className="flex items-center gap-2 text-[15px] font-semibold">{row.title || "Untitled"} <KindTag kind={row.kind} /></span>
                <span className="text-xs text-muted">
                  {rowStats.tickable ? `${rowStats.doneLeaves} of ${rowStats.leaves} · ${doing} doing` : plural(childrenOf(props.items, row.id).length, "item", "items")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto xl:hidden">
        {props.topLevel.map((row) => (
          <button key={row.id} type="button" onClick={() => props.onSelectTop(row.id)} className={`h-[52px] shrink-0 rounded-[14px] border px-3.5 text-sm font-semibold ${row.id === props.item.id ? "border-accent/50 bg-accent-soft" : "border-border bg-card"}`}>
            {row.title || "Untitled"}
          </button>
        ))}
      </div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><KindTag kind={props.item.kind} /><StatusPill item={props.item} /></div>
            <h2 className="mt-1 font-display text-[30px] leading-tight">{props.item.title || "Untitled"}</h2>
            <p className="text-xs text-muted">Updated {relativeTouched(props.item.updatedAt)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={`${OUTLINE} h-10 px-3 text-sm`} onClick={() => props.onDone(props.item)}>✓ Mark done</button>
            <button type="button" className="grid size-10 place-items-center rounded-full border border-border" onClick={(event) => props.onMenu(props.menu === props.item.id ? null : props.item.id, event.currentTarget)} aria-label="Item menu">
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </div>
        {stats.tickable ? (
          <div className="mt-3">
            <ProgressBar done={stats.doneLeaves} total={stats.leaves} />
            <p className="mt-1 text-xs text-muted">{stats.doneLeaves} of {stats.leaves}</p>
          </div>
        ) : null}
        {props.item.kind === "goal" ? (
          <label className="mt-4 block text-sm">
            How I'll get there
            <textarea className="mt-1 w-full rounded-xl border border-border bg-transparent p-2" defaultValue={props.item.plan ?? ""} onBlur={(event) => props.onPatch(props.item.id, { plan: event.target.value })} />
          </label>
        ) : null}
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className={`${OUTLINE} h-9 px-3 text-sm`} disabled={props.suggesting} onClick={props.onSuggest}>✦ Suggest items</button>
          <button type="button" className="text-sm text-muted" onClick={props.onHideDone}>{props.hideDone ? "Show done" : "Hide done"}</button>
        </div>
        <div className="mt-3">
          {detailRows.map(({ item, level }, index) => {
            const kids = childrenOf(props.items, item.id);
            const parent = item.parentId ? props.items.find((row) => row.id === item.parentId) : null;
            return (
            <div key={item.id}>
            <div
              tabIndex={0}
              className="group flex items-center gap-2 border-t border-border py-2 outline-none hover:bg-background focus-within:bg-background"
              style={{ paddingLeft: Math.min(level, props.indentCap) * props.indent }}
              onMouseEnter={() => setHover(item.id)}
              onMouseLeave={() => setHover((current) => (current === item.id ? null : current))}
              onKeyDown={(event) => rowOpensOnKey(event, () => props.onOpen(item.id))}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, input, textarea, select, a, label")) return;
                props.onSelect(item.id, event);
              }}
            >
              <button type="button" title="Add an item inside" aria-label="Add an item inside" className="grid size-[18px] shrink-0 place-items-center rounded-md border border-border bg-card opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100" onClick={() => props.onAddChild(item.id)}>
                <Plus className="size-3" />
              </button>
              {kids.length === 0 ? (
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={item.status === "done"} onChange={() => props.onDone(item)} />
              ) : (
                <button type="button" onClick={() => props.onToggleExpand(item.id)}><ChevronRight className={`size-4 ${props.expanded.has(item.id) ? "rotate-90" : ""}`} /></button>
              )}
              <TrackerTitleField
                title={item.title}
                editing={props.editing === item.id}
                fresh={props.editing === item.id && props.editingMode === "create"}
                grabFocus={props.grabId === item.id}
                bold={false}
                coarse={props.coarse}
                placeholder={parent ? `New item in ${parent.title || "this item"}` : "New item"}
                onBegin={() => {
                  if (props.editing === item.id && props.editingMode === "create") return;
                  props.onEdit(item.id, "rename");
                }}
                onOpen={() => props.onOpen(item.id)}
                onFinish={(value) => props.onFinish(item, value)}
                onKeyDown={(event) => props.onTitleKey(event, item)}
              />
              {item.kind ? (
                <button type="button" onClick={(event) => props.onPick(item.id, "kind", event.currentTarget)}><KindTag kind={item.kind} /></button>
              ) : (
                <button type="button" className="text-xs text-muted opacity-0 group-hover:opacity-100" onClick={(event) => props.onPick(item.id, "kind", event.currentTarget)}>+ Kind</button>
              )}
              <button type="button" className="ml-auto text-left" onClick={(event) => props.onPick(item.id, "status", event.currentTarget)}>
                {item.status ? <StatusPill item={item} /> : <span className="text-xs text-muted opacity-0 group-hover:opacity-100">Set status</span>}
              </button>
              {kids.length > 0 ? (
                <button type="button" title="Zoom in" aria-label="Zoom in" className="grid size-7 place-items-center rounded-lg border border-border bg-card opacity-0 group-hover:opacity-100" onClick={() => props.onZoom(item.id)}>
                  <ZoomIn className="size-3.5" />
                </button>
              ) : null}
              <button type="button" aria-label="Item menu" className={`grid size-7 place-items-center rounded-lg border border-border bg-card ${props.coarse ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`} onClick={(event) => props.onMenu(props.menu === item.id ? null : item.id, event.currentTarget)}>
                <MoreHorizontal className="size-3.5" />
              </button>
              {props.coarse ? (
                <button type="button" className="grid size-7 place-items-center text-muted" aria-label="Open" onClick={() => props.onOpen(item.id)}>
                  <ChevronRight className="size-4" />
                </button>
              ) : null}
            </div>
            {(ghosts.get(index) ?? []).map((ghost) => (props.narrow || groupHot(hover, ghost.parent.id, props.items)) ? (
              <button key={`add-${ghost.parent.id}`} type="button" className="flex items-center gap-1.5 border-t border-border py-2 text-[13px] text-muted" style={{ paddingLeft: 8 + Math.min(ghost.level, props.indentCap) * props.indent }} onClick={() => props.onAddChild(ghost.parent.id)}>
                <Plus className="size-3.5" /> Add item to {ghost.parent.title || "this item"}
              </button>
            ) : null)}
            </div>
            );
          })}
          <button type="button" className="mt-2 text-sm text-muted" onClick={props.onAdd}>+ Add an item… <span className="text-xs">Tab to indent · Shift+Tab to outdent</span></button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className={`${OUTLINE} h-10 px-4 text-sm`} onClick={props.onPlan}>
            <MessageSquare className="size-3.5" /> Plan next steps
          </button>
          <p className="text-xs text-muted">Select items with the dot on the left to start a focus session</p>
        </div>
      </section>
    </div>
  );
}

export function trackerOpenCount(dreamId: string): number {
  const store = ensureTracker(loadIdeateStore());
  return itemsForArea(store, dreamId).filter((item) => item.status !== "done").length;
}
