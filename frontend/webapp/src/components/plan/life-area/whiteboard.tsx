import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  NodeResizer,
  NodeToolbar,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Hand,
  Image as ImageIcon,
  MousePointer2,
  Plus,
  Spline,
  StickyNote,
  Type,
  Upload,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { MIST, OUTLINE, areaThoughts, thoughtSource } from "@/components/plan/life-area/kit";
import { readCachedInsight } from "@/components/plan/life-area/insights";
import { SourceCard } from "@/components/plan/life-area/whiteboard-card";
import {
  rememberTrackerDetail,
  TRACKER_KIND_DOT,
  TRACKER_KIND_LABEL,
  useCoarsePointer,
} from "@/components/plan/life-area/tracker";
import { THOUGHT_KIND_DOT } from "@/components/plan/life-area/thoughts";
import { thoughtKindLabel, type ThoughtKind } from "@/lib/plan-dreams";
import {
  rememberWhiteboardView,
  sourceCardTarget,
  takeWhiteboardReturn,
} from "@/components/plan/life-area/whiteboard-return";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import {
  loadIdeateVisionBoardStore,
  saveIdeateVisionBoardStore,
  setVisionItemLifeAreaIds,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import { addVisionBoardImageFromFile } from "@/lib/ideate-vision-upload";
import {
  listLibraryMeditations,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import type { LifeAreaWbEdge, LifeAreaWbNode, PlanDream } from "@/lib/plan-dreams";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import {
  childrenOf,
  commitTracker,
  descendantsOf,
  dueLabel,
  ensureTracker,
  inFocusItem,
  itemsForArea,
  rollup,
  toggleTrackerDone,
  type TrackerItem,
  type TrackerKind,
} from "@/lib/tracker-items";

type Props = {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
};

type Tool = "select" | "pan" | "sticky" | "text" | "link" | "image";
type NodeData = {
  label: string;
  kind: LifeAreaWbNode["kind"];
  refId: string | null;
  refType?: string | null;
  colour?: string;
  size?: "s" | "m" | "l";
  imageId?: string | null;
  uploading?: boolean;
};
type FlowNode = Node<NodeData>;
type SourceRow = {
  id: string;
  label: string;
  meta: string;
  kind: LifeAreaWbNode["kind"];
  refId: string;
  refType: string;
  imageUrl?: string;
  depth?: number;
  parentId?: string | null;
  hasChildren?: boolean;
  when?: string;
  extra?: string;
};

const COLOURS = ["sand", "rose", "sage", "sky", "mist"] as const;
const COLOUR_FILL: Record<(typeof COLOURS)[number], string> = {
  sand: "#F6E7B8",
  rose: "#F3D6D0",
  sage: "#D7E4D4",
  sky: "#D5E3F0",
  mist: "#E7E2D6",
};

const TOOLS: { id: Tool; label: string; key: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "pan", label: "Pan", key: "H", icon: Hand },
  { id: "sticky", label: "Sticky note", key: "N", icon: StickyNote },
  { id: "text", label: "Text", key: "T", icon: Type },
  { id: "link", label: "Link", key: "L", icon: Spline },
  { id: "image", label: "Image", key: "I", icon: ImageIcon },
];

type BoardApi = {
  dream: PlanDream;
  editingId: string | null;
  setEditing: (id: string | null) => void;
  patchNode: (id: string, patch: Partial<NodeData>) => void;
  removeNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  commitText: (id: string, text: string) => void;
  tickItem: (id: string) => void;
  playMeditation: (id: string) => void;
  beginReplace: (id: string) => void;
  openNode: (id: string) => void;
  meditations: LibraryMeditationItem[];
  coarse: boolean;
  menuId: string | null;
  setMenu: (id: string | null) => void;
};

const BoardContext = createContext<BoardApi | null>(null);
const nodeTypes = { card: CardNode };

export function LifeAreaWhiteboard({ dream, onPatch, onRefresh }: Props) {
  return (
    <ReactFlowProvider>
      <Board dream={dream} onPatch={onPatch} onRefresh={onRefresh} />
    </ReactFlowProvider>
  );
}

function Board({ dream, onPatch, onRefresh }: Props) {
  const navigate = useNavigate();
  const { playItem } = useLibraryPlayer();
  const doc = dream.whiteboard;
  const [tool, setTool] = useState<Tool>("select");
  const [locked, setLocked] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("vision");
  const [picked, setPicked] = useState<string[]>([]);
  const [folded, setFolded] = useState<string[]>([]);
  const [editingId, setEditing] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [title, setTitle] = useState(doc?.title || `${dream.title.trim() || "This area"}, the map`);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [meditations, setMeditations] = useState<LibraryMeditationItem[]>([]);
  const [narrow, setNarrow] = useState(false);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const initial = useMemo(() => toFlow(doc?.nodes ?? [], doc?.edges ?? []), [doc?.nodes, doc?.edges]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const flow = useReactFlow();
  const coarse = useCoarsePointer();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancel = false;
    void listLibraryMeditations()
      .then((rows) => {
        if (!cancel) setMeditations(rows.filter((row) => row.lifeAreaId === dream.id && !row.archived && !row.isDraft));
      })
      .catch(() => setMeditations([]));
    return () => {
      cancel = true;
    };
  }, [dream.id]);

  const save = useCallback(
    (nextNodes: FlowNode[], nextEdges: Edge[]) => {
      onPatch({
        whiteboard: {
          areaId: dream.id,
          title,
          viewport: flow.getViewport(),
          nodes: nextNodes.map(fromNode),
          edges: nextEdges.map(fromEdge),
          updatedAt: new Date().toISOString(),
        },
      });
    },
    [dream.id, flow, onPatch, title],
  );

  useEffect(() => {
    const t = window.setTimeout(() => save(nodes as FlowNode[], edges), 500);
    return () => window.clearTimeout(t);
  }, [nodes, edges, title, save]);

  function remember() {
    undo.current.push(JSON.stringify({ nodes, edges }));
    redo.current = [];
  }

  function restore(stack: string[], other: string[]) {
    const raw = stack.pop();
    if (!raw) return;
    other.push(JSON.stringify({ nodes, edges }));
    const snap = JSON.parse(raw) as { nodes: FlowNode[]; edges: Edge[] };
    setNodes(snap.nodes);
    setEdges(snap.edges);
  }

  const center = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return flow.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 640) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 480) / 2,
    });
  }, [flow]);

  function addNodes(rows: SourceRow[], at?: { x: number; y: number }, select = false) {
    remember();
    const origin = at ?? center();
    const made: FlowNode[] = [];
    let y = origin.y - 40;
    let index = 0;
    const groups = new Map<string, SourceRow[]>();
    for (const row of rows) {
      const key = row.refType || row.kind;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) {
      let x = origin.x - 160;
      for (const row of group) {
        const width = row.kind === "image" ? 320 : row.kind === "dream" ? 240 : 200;
        made.push({
          id: `wb_${Date.now()}_${index}`,
          type: "card",
          position: { x, y },
          selected: select,
          data: {
            label: row.label,
            kind: row.kind,
            refId: row.refId,
            refType: row.refType,
            imageId: row.kind === "image" ? row.refId : null,
            colour: row.kind === "sticky" ? "sand" : undefined,
          },
          style: { width },
        });
        x += width + 24;
        index += 1;
      }
      y += 120;
    }
    setNodes((cur) => [...cur.map((node) => ({ ...node, selected: select ? false : node.selected })), ...made]);
  }

  function placeBlank(kind: "sticky" | "text", at: { x: number; y: number }) {
    remember();
    const id = `wb_${Date.now()}`;
    const node: FlowNode = {
      id,
      type: "card",
      position: at,
      selected: true,
      data: { label: "", kind, refId: null, refType: null, colour: kind === "sticky" ? "sand" : undefined, size: "m" },
      style: { width: kind === "sticky" ? 180 : 200 },
    };
    setNodes((cur) => [...cur.map((row) => ({ ...row, selected: false })), node]);
    setEditing(id);
    if (!locked) setTool("select");
  }

  async function placeFile(file: File, at?: { x: number; y: number }) {
    const replacing = replaceId.current;
    replaceId.current = null;
    const okType = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
    if (!okType) return;
    if (file.size > 10 * 1024 * 1024) {
      setToast({ text: "Images need to be 10MB or smaller." });
      return;
    }
    const id = replacing ?? `wb_${Date.now()}`;
    const spot = at ?? center();
    setNodes((cur) => {
      if (replacing && cur.some((node) => node.id === replacing)) {
        return cur.map((node) =>
          node.id === replacing ? { ...node, selected: true, data: { ...node.data, uploading: true } } : node,
        );
      }
      return [
        ...cur.map((row) => ({ ...row, selected: false })),
        {
          id,
          type: "card",
          position: spot,
          selected: true,
          data: { label: "", kind: "image", refId: null, refType: "image", uploading: true },
          style: { width: 320 },
        },
      ];
    });
    try {
      const signedIn = isMedimadeSessionActive();
      const imageId = await addVisionBoardImageFromFile(file, signedIn);
      const board = loadIdeateVisionBoardStore();
      const current = board.items.find((item) => item.id === imageId);
      const tags = [...new Set([...(current?.lifeAreaIds ?? []), dream.id])];
      saveIdeateVisionBoardStore(setVisionItemLifeAreaIds(board, imageId, tags));
      setNodes((cur) =>
        cur.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, imageId, refId: imageId, uploading: false } } : node,
        ),
      );
      if (!locked) setTool("select");
      setImageOpen(false);
    } catch (error) {
      setNodes((cur) =>
        replacing
          ? cur.map((node) => (node.id === id ? { ...node, data: { ...node.data, uploading: false } } : node))
          : cur.filter((node) => node.id !== id),
      );
      setToast({ text: error instanceof Error ? error.message : "Couldn't add that image." });
    }
  }

  const api = useMemo<BoardApi>(
    () => ({
      dream,
      editingId,
      setEditing,
      patchNode: (id, patch) => {
        setNodes((cur) => cur.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)));
      },
      removeNode: (id) => {
        remember();
        setNodes((cur) => cur.filter((node) => node.id !== id));
        setEdges((cur) => cur.filter((edge) => edge.source !== id && edge.target !== id));
      },
      duplicateNode: (id) => {
        remember();
        setNodes((cur) => {
          const node = cur.find((row) => row.id === id);
          if (!node) return cur;
          return [
            ...cur,
            {
              ...node,
              id: `wb_${Date.now()}`,
              position: { x: node.position.x + 24, y: node.position.y + 24 },
              selected: true,
              data: { ...node.data },
            },
          ];
        });
      },
      commitText: (id, text) => {
        const node = (nodes as FlowNode[]).find((row) => row.id === id);
        if (!node) return;
        const value = text.trim();
        if ((node.data.kind === "sticky" || node.data.kind === "text") && !value) {
          setNodes((cur) => cur.filter((row) => row.id !== id));
          return;
        }
        setNodes((cur) => cur.map((row) => (row.id === id ? { ...row, data: { ...row.data, label: value } } : row)));
        if (node.data.refType === "thought" && node.data.refId) {
          const key = thoughtSource(dream, node.data.refId);
          if (key) {
            onPatch({
              [key]: (dream[key] ?? []).map((entry) => (entry.id === node.data.refId ? { ...entry, text: value } : entry)),
            });
          }
        }
        if (node.data.refType === "dream") onPatch({ dreamText: value });
        if (node.data.refType === "moment") onPatch({ visionText: value });
        if (node.data.refType === "plan" && node.data.refId) {
          onPatch({
            ifThenPlans: (dream.ifThenPlans ?? []).map((plan) =>
              plan.id === node.data.refId ? { ...plan, plan: value } : plan,
            ),
          });
        }
      },
      tickItem: (id) => {
        const before = (ensureTracker(loadIdeateStore()).trackerItems ?? []).find((item) => item.id === id);
        commitTracker((store) => toggleTrackerDone(store, id));
        onRefresh();
        const marked = before?.status !== "done";
        setToast({
          text: marked ? "Marked done" : "Marked not done",
          undo: () => {
            commitTracker((store) => toggleTrackerDone(store, id));
            onRefresh();
          },
        });
      },
      playMeditation: (id) => {
        const item = meditations.find((row) => row.id === id || row.sk === id);
        if (item) playItem(item);
      },
      beginReplace: (id) => {
        replaceId.current = id;
        fileRef.current?.click();
      },
      openNode: (id) => {
        const node = (nodes as FlowNode[]).find((row) => row.id === id);
        if (!node) return;
        const target = sourceCardTarget(dream.id, node.data);
        if (!target) return;
        const selected = (nodes as FlowNode[]).filter((row) => row.selected).map((row) => row.id);
        if (!selected.includes(id)) selected.push(id);
        rememberWhiteboardView(dream.id, { viewport: flow.getViewport(), selected });
        if (target.place === "Tracker") rememberTrackerDetail(dream.id);
        navigate(target.href);
      },
      meditations,
      coarse,
      menuId,
      setMenu: setMenuId,
    }),
    [coarse, dream, editingId, flow, meditations, menuId, navigate, nodes, onPatch, onRefresh, playItem, setEdges, setNodes],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest("input, textarea, [contenteditable='true']"));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        if (event.shiftKey) restore(redo.current, undo.current);
        else restore(undo.current, redo.current);
        return;
      }
      if (typing) return;
      if (event.key === "Escape") {
        setAddOpen(false);
        setImageOpen(false);
        setEditing(null);
        setMenuId(null);
        setLocked(false);
        setTool("select");
        return;
      }
      const key = event.key.toLowerCase();
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const toolByKey: Record<string, Tool> = { v: "select", h: "pan", n: "sticky", t: "text", l: "link", i: "image" };
        if (toolByKey[key] && !editingId) {
          setTool(toolByKey[key]);
          setImageOpen(toolByKey[key] === "image");
          return;
        }
        if (key === "a") {
          setAddOpen(true);
          return;
        }
      }
      const selected = (nodes as FlowNode[]).filter((node) => node.selected);
      if ((event.metaKey || event.ctrlKey) && key === "d" && selected[0]) {
        event.preventDefault();
        api.duplicateNode(selected[0].id);
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selected.length && !editingId) {
        event.preventDefault();
        remember();
        const ids = new Set(selected.map((node) => node.id));
        setNodes((cur) => cur.filter((node) => !ids.has(node.id)));
        return;
      }
      if (event.key === "Enter" && selected.length === 1 && !editingId) {
        event.preventDefault();
        const node = selected[0]!;
        if (node.data.kind === "sticky" || node.data.kind === "text") {
          setEditing(node.id);
          return;
        }
        api.openNode(node.id);
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && selected.length === 1 && !editingId) {
        const node = selected[0]!;
        if (node.data.kind === "sticky" || node.data.kind === "text") {
          api.patchNode(node.id, { label: event.key });
          setEditing(node.id);
        }
      }
      if (event.key.startsWith("Arrow") && selected.length && !editingId) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const ids = new Set(selected.map((node) => node.id));
        setNodes((cur) =>
          cur.map((node) =>
            ids.has(node.id) ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } } : node,
          ),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api, editingId, nodes, setNodes]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const onBoard = new Set(nodes.map((node) => node.data.refId).filter(Boolean));
  const sources = buildSources(dream, meditations, query);
  const tabs = sources.filter((group) => group.rows.length > 0 || group.id === "images");
  const active = tabs.find((group) => group.id === source) ?? tabs[0];
  const chosen = sources.flatMap((group) => group.rows).filter((row) => picked.includes(row.id) && !onBoard.has(row.refId));

  function starter() {
    if (nodes.length && !window.confirm("Build a starter map beside what's here?")) return;
    const store = ensureTracker(loadIdeateStore());
    const focus = inFocusItem(store, dream);
    const doing = focus
      ? descendantsOf(itemsForArea(store, dream.id), focus.id).filter((item) => item.status === "doing").slice(0, 5)
      : [];
    const thoughts = [...areaThoughts(dream)].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 2);
    const rows: SourceRow[] = [
      { id: "dream", label: dream.dreamText.trim() || dream.title, meta: "Dream", kind: "dream", refId: dream.id, refType: "dream" },
      ...(dream.obstacleLabels ?? []).filter(Boolean).map((label) => ({
        id: `obs_${label}`,
        label,
        meta: "Obstacle",
        kind: "obstacle" as const,
        refId: label,
        refType: "obstacle",
      })),
    ];
    if (focus) {
      rows.push({ id: focus.id, label: focus.title, meta: "In focus", kind: "item", refId: focus.id, refType: "item" });
      doing.forEach((item) => rows.push({ id: item.id, label: item.title, meta: "Doing", kind: "item", refId: item.id, refType: "item" }));
    }
    thoughts.forEach((thought) =>
      rows.push({ id: thought.id, label: thought.text, meta: "Thought", kind: "thought", refId: thought.id, refType: "thought" }),
    );
    const made = rows.map((row, index) => ({
      nodeId: `wb_${row.refType}_${row.refId}_${index}`,
      row,
    }));
    remember();
    setNodes((cur) => [
      ...cur.map((node) => ({ ...node, selected: false })),
      ...made.map(({ nodeId, row }, index) => ({
        id: nodeId,
        type: "card" as const,
        position: { x: 80 + (index % 3) * 230, y: 40 + Math.floor(index / 3) * 130 },
        selected: true,
        data: { label: row.label, kind: row.kind, refId: row.refId, refType: row.refType, imageId: row.kind === "image" ? row.refId : null },
        style: { width: 220 },
      })),
    ]);
    const anchor = made.find((entry) => entry.row.meta === "In focus");
    if (anchor) {
      setEdges((cur) => [
        ...cur,
        ...made
          .filter((entry) => entry !== anchor)
          .map((entry, index) => ({
            id: `e_start_${Date.now()}_${index}`,
            source: entry.nodeId,
            target: anchor.nodeId,
            label: "leads to",
          })),
      ]);
    }
    setAddOpen(false);
  }

  function arrange() {
    remember();
    const store = ensureTracker(loadIdeateStore());
    const tops = childrenOf(itemsForArea(store, dream.id), null);
    setNodes((cur) => {
      let obstacle = 0;
      let thought = 0;
      const topX = new Map<string, number>();
      tops.forEach((item, index) => topX.set(item.id, 240 + index * 230));
      return cur.map((node) => {
        if (node.data.kind === "image" || node.data.kind === "sticky" || node.data.kind === "text") return node;
        if (node.data.kind === "dream") return { ...node, position: { x: 280, y: 24 } };
        if (node.data.kind === "obstacle") {
          obstacle += 1;
          return { ...node, position: { x: 24, y: 120 + (obstacle - 1) * 110 } };
        }
        if (node.data.kind === "thought") {
          thought += 1;
          return { ...node, position: { x: 820, y: 140 + (thought - 1) * 110 } };
        }
        if (node.data.refType === "item" && node.data.refId) {
          const item = (store.trackerItems ?? []).find((row) => row.id === node.data.refId);
          const parent = item?.parentId ? topX.get(item.parentId) : topX.get(item?.id ?? "");
          const siblings = item ? childrenOf(store.trackerItems ?? [], item.parentId) : [];
          const index = siblings.findIndex((row) => row.id === item?.id);
          if (item && !item.parentId && parent != null) return { ...node, position: { x: parent, y: 220 } };
          if (parent != null) return { ...node, position: { x: parent, y: 340 + Math.max(0, index) * 90 } };
        }
        return node;
      });
    });
  }

  return (
    <BoardContext.Provider value={api}>
      <div
        ref={canvasRef}
        className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-card"
        onPaste={(event) => {
          const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
          if (file) void placeFile(file);
        }}
      >
        <p className="pointer-events-none absolute left-4 top-16 z-10 font-display text-sm italic text-muted">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="pointer-events-auto bg-transparent font-display italic outline-none"
          />
        </p>
        <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
          <button type="button" className={`${MIST} h-9 px-3 text-[13px]`} onClick={() => setAddOpen((open) => !open)}>
            <Plus className="size-3.5" /> Add from…
          </button>
          <span className="mx-1 h-5 w-px bg-border" />
          {TOOLS.map((entry) => {
            const Icon = entry.icon;
            const on = tool === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                title={`${entry.label} · ${entry.key}`}
                onClick={() => {
                  setTool(entry.id);
                  setLocked(false);
                  setImageOpen(entry.id === "image");
                }}
                onDoubleClick={() => {
                  setTool(entry.id);
                  setLocked(true);
                }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] ${on ? "bg-accent-soft font-semibold text-accent-link" : "text-foreground"}`}
              >
                <Icon className="size-3.5" />
                {entry.label}
              </button>
            );
          })}
          <button type="button" className="rounded-full px-2 py-1 text-xs font-semibold text-accent-link" onClick={arrange}>
            ✦ Arrange
          </button>
        </div>
        {nodes.length === 0 ? (
          <p className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(100%,28rem)] -translate-x-1/2 -translate-y-1/2 text-center text-[13px] text-muted">
            Double-click to add a note, or{" "}
            <button type="button" className="pointer-events-auto font-semibold text-accent-link" onClick={() => setAddOpen(true)}>
              Add from…
            </button>{" "}
            to bring in your vision, tracker, thoughts and more
          </p>
        ) : null}
        <ReactFlow
          nodes={
            coarse
              ? nodes.map((node) => ({ ...node, draggable: Boolean(node.selected) && !editingId }))
              : nodes
          }
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection: Connection) => {
            remember();
            setEdges((eds) => addEdge({ ...connection, label: "leads to", style: { strokeWidth: 1.5 } }, eds));
          }}
          nodeTypes={nodeTypes}
          onPaneClick={(event) => {
            setAddOpen(false);
            setImageOpen(false);
            setMenuId(null);
            if (tool === "sticky" || tool === "text") {
              placeBlank(tool, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            }
          }}
          onDoubleClick={(event) => {
            const target = event.target as HTMLElement;
            if (!target.classList.contains("react-flow__pane") || tool !== "select") return;
            placeBlank("sticky", flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            if (file) {
              void placeFile(file, at);
              return;
            }
            const raw = event.dataTransfer.getData("application/x-wb");
            if (!raw) return;
            const row = JSON.parse(raw) as SourceRow;
            addNodes([row], at, true);
          }}
          onInit={(instance) => {
            const saved = takeWhiteboardReturn(dream.id);
            if (saved) {
              void instance.setViewport(saved.viewport);
              const selected = new Set(saved.selected);
              setNodes((cur) => cur.map((node) => ({ ...node, selected: selected.has(node.id) })));
              return;
            }
            void Promise.resolve(instance.fitView()).then(() => {
              const pane = canvasRef.current;
              const width = pane?.clientWidth ?? 0;
              const height = pane?.clientHeight ?? 0;
              const { x, y, zoom } = instance.getViewport();
              const nextZoom = zoom / 2;
              if (width <= 0 || height <= 0) {
                void instance.setViewport({ x, y, zoom: nextZoom });
                return;
              }
              void instance.setViewport({
                x: width / 4 + x / 2,
                y: height / 4 + y / 2,
                zoom: nextZoom,
              });
            });
          }}
          minZoom={0.05}
          panOnDrag={tool === "pan" || (coarse && tool === "select")}
          selectionOnDrag={tool === "select" && !coarse}
          nodesDraggable={!editingId}
          className={`!absolute inset-0 ${tool === "sticky" || tool === "text" ? "[&_.react-flow__pane]:cursor-crosshair" : ""}`}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <MiniMap className="!rounded-xl" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {addOpen ? (
          <div className={narrow ? "fixed inset-x-0 bottom-[var(--app-mobile-tab-h)] z-30 flex max-h-[70vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl" : "absolute left-3 top-16 z-30 flex max-h-[70vh] w-[560px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"}>
            <div className="border-b border-border p-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search everything in ${dream.title}`}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none"
              />
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {tabs.map((group) => (
                  <button key={group.id} type="button" className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${active?.id === group.id ? "bg-foreground text-white" : "border border-border"}`} onClick={() => setSource(group.id)}>
                    {group.label}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto p-2"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file && active?.id === "images") void placeFile(file);
              }}
            >
              {active?.id === "images" ? (
                <div className="mb-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
                  Drop images here
                  <button type="button" className={`${OUTLINE} h-9 px-3 text-sm`} onClick={() => fileRef.current?.click()}>
                    <Upload className="size-4" aria-hidden />
                    Upload
                  </button>
                </div>
              ) : null}
              {shownSourceRows(active?.rows ?? [], active?.id === "tracker" ? folded : []).map((row) => {
                const placed = onBoard.has(row.refId);
                const on = picked.includes(row.id);
                const depth = row.depth ?? 0;
                const target = sourceCardTarget(dream.id, row);
                return (
                  <div
                    key={row.id}
                    draggable={!placed}
                    onDragStart={(event) => event.dataTransfer.setData("application/x-wb", JSON.stringify(row))}
                    onClick={(event) => {
                      if (placed) return;
                      if ((event.target as HTMLElement).closest("[data-fold], [data-open]")) return;
                      setPicked((cur) => (cur.includes(row.id) ? cur.filter((id) => id !== row.id) : [...cur, row.id]));
                    }}
                    className={`group relative flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm ${placed ? "opacity-50" : "cursor-pointer"}`}
                    style={{ paddingLeft: 8 + depth * 18 }}
                    role="button"
                    tabIndex={0}
                  >
                    {depth > 0 ? (
                      <span className="pointer-events-none absolute inset-y-1 border-l border-border" style={{ left: (depth - 1) * 18 + 16 }} />
                    ) : null}
                    {row.hasChildren ? (
                      <span data-fold role="presentation" className="grid size-5 shrink-0 place-items-center text-muted" onClick={() => setFolded((cur) => (cur.includes(row.id) ? cur.filter((id) => id !== row.id) : [...cur, row.id]))}>
                        {folded.includes(row.id) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </span>
                    ) : depth > 0 ? (
                      <span className="size-5 shrink-0" />
                    ) : null}
                    <span className={`grid size-[18px] shrink-0 place-items-center rounded-full border ${on ? "border-foreground bg-foreground text-[10px] text-white" : "border-border"}`}>{on ? "✓" : ""}</span>
                    {row.imageUrl ? <img src={row.imageUrl} alt="" className="size-8 rounded-md object-cover" /> : null}
                    <span className="min-w-0 flex-1 truncate">
                      {row.label}
                      {row.extra ? <span className="text-muted"> {row.extra}</span> : null}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                      <span className={`size-1.5 rounded-full ${sourceDot(row)}`} />
                      {sourceKindLabel(row)}
                    </span>
                    {placed ? <span className="shrink-0 text-xs text-muted">On board</span> : null}
                    {target ? (
                      <button
                        type="button"
                        data-open
                        title={`Open in ${target.place}`}
                        aria-label={`Open in ${target.place}`}
                        className={`nodrag grid shrink-0 place-items-center rounded-lg border border-border bg-card ${
                          coarse
                            ? "size-7 text-muted"
                            : "invisible size-[26px] group-hover:visible"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const selected = (nodes as FlowNode[]).filter((node) => node.selected).map((node) => node.id);
                          rememberWhiteboardView(dream.id, { viewport: flow.getViewport(), selected });
                          if (target.place === "Tracker") rememberTrackerDetail(dream.id);
                          navigate(target.href);
                        }}
                      >
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 border-t border-border p-3">
              {nodes.length === 0 ? (
                <button type="button" className="text-sm font-semibold text-accent-link" onClick={starter}>✦ Build a starter map</button>
              ) : null}
              <span className="text-sm text-muted">{chosen.length} selected</span>
              <button
                type="button"
                className={`${MIST} ml-auto h-9 px-3 text-sm`}
                disabled={chosen.length === 0}
                onClick={() => {
                  addNodes(chosen, undefined, true);
                  setPicked([]);
                  setAddOpen(false);
                }}
              >
                Add {chosen.length} to board
              </button>
            </div>
          </div>
        ) : null}
        {imageOpen ? (
          <div className="absolute left-3 top-16 z-30 w-72 rounded-2xl border border-border bg-card p-2 shadow-xl">
            <button type="button" className={`${OUTLINE} mb-1 h-10 w-full px-3 text-sm`} onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" aria-hidden />
              Upload
            </button>
            <p className="px-3 pt-2 text-[11px] uppercase tracking-wide text-muted">From your vision board</p>
            {visionImages(dream.id).slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm hover:bg-accent-soft"
                onClick={() => addNodes([{ id: item.id, label: item.prompt || item.label, meta: "Image", kind: "image", refId: item.id, refType: "image", imageUrl: item.imageUrl }], undefined, true)}
              >
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-8 rounded-md object-cover" /> : null}
                <span className="truncate">{item.label || "Image"}</span>
              </button>
            ))}
            <button type="button" className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-accent-link" onClick={() => navigate(`/manifest/vision-board?createArea=${encodeURIComponent(dream.id)}`)}>
              ✦ Create one
            </button>
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void placeFile(file);
          }}
        />
        {toast ? (
          <p className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm text-white">
            {toast.text}
            {toast.undo ? (
              <button type="button" className="font-semibold" onClick={() => { toast.undo?.(); setToast(null); }}>
                Undo
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </BoardContext.Provider>
  );
}

function CardNode({ id, data, selected }: NodeProps<FlowNode>) {
  const api = useContext(BoardContext);
  const editing = api?.editingId === id;
  const tilt = ((id.charCodeAt(id.length - 1) % 21) - 10) / 10;
  const size = data.size === "s" ? "text-[15px]" : data.size === "l" ? "text-[28px]" : "text-[20px]";
  const image = data.imageId ? loadIdeateVisionBoardStore().items.find((item) => item.id === data.imageId) : null;

  const boardOnly = data.kind === "sticky" || data.kind === "text";
  const target = api ? sourceCardTarget(api.dream.id, data) : null;
  const menu = api?.menuId === id;

  return (
    <>
      {selected && !editing && data.kind === "image" ? <NodeResizer keepAspectRatio minWidth={120} /> : null}
      {selected && !editing && data.kind !== "image" ? <NodeResizer minWidth={140} /> : null}
      {selected && !editing && boardOnly ? (
        <NodeToolbar isVisible className="flex items-center gap-1 rounded-full bg-foreground px-1.5 py-1 text-xs text-white">
          {data.kind === "sticky"
            ? COLOURS.map((colour) => (
                <button key={colour} type="button" aria-label={colour} className="size-4 rounded-full border border-white/40" style={{ background: COLOUR_FILL[colour] }} onClick={() => api?.patchNode(id, { colour })} />
              ))
            : null}
          {data.kind === "text"
            ? (["s", "m", "l"] as const).map((value) => (
                <button key={value} type="button" className="px-1 uppercase" onClick={() => api?.patchNode(id, { size: value })}>{value}</button>
              ))
            : null}
          <button type="button" className="px-1" onClick={() => api?.setEditing(id)}>Edit</button>
          <button type="button" className="px-1" onClick={() => api?.duplicateNode(id)}>Duplicate</button>
          <button type="button" className="px-1" onClick={() => api?.removeNode(id)}>Delete</button>
        </NodeToolbar>
      ) : null}
      {selected && !editing && !boardOnly && target ? (
        <NodeToolbar isVisible className="flex items-center gap-1 rounded-full bg-foreground px-1.5 py-1 text-xs text-white">
          <button type="button" className="inline-flex items-center gap-1 px-1" onClick={() => api?.openNode(id)}>
            <ArrowUpRight className="size-3.5" aria-hidden />
            Open in {target.place}
          </button>
          <button type="button" className="px-1" onClick={() => api?.removeNode(id)}>Remove from board</button>
          <button type="button" className="px-1" aria-label="More" onClick={() => api?.setMenu(menu ? null : id)}>⋯</button>
        </NodeToolbar>
      ) : null}
      {menu ? (
        <div className="nodrag absolute right-0 top-0 z-20 mt-8 rounded-xl border border-border bg-card p-1 text-sm shadow-md">
          <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left" onClick={() => { api?.duplicateNode(id); api?.setMenu(null); }}>Duplicate</button>
          {data.kind === "image" ? (
            <>
              <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left" onClick={() => { api?.beginReplace(id); api?.setMenu(null); }}>Replace</button>
              <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left" onClick={() => { api?.setEditing(id); api?.setMenu(null); }}>Edit caption</button>
            </>
          ) : null}
        </div>
      ) : null}
      <NodeBody
        id={id}
        data={data}
        selected={selected}
        editing={editing}
        tilt={tilt}
        size={size}
        image={image}
      />
    </>
  );
}

function NodeBody({
  id,
  data,
  selected,
  editing,
  tilt,
  size,
  image,
}: {
  id: string;
  data: NodeData;
  selected?: boolean;
  editing: boolean;
  tilt: number;
  size: string;
  image?: VisionBoardItem | null;
}) {
  const api = useContext(BoardContext);
  const outline = editing || selected ? "outline outline-[1.5px] outline-accent" : "";
  if (data.kind === "sticky") {
    return (
      <div className={`min-w-[160px] px-4 py-[14px] font-display text-[17px] shadow-md ${outline}`} style={{ background: COLOUR_FILL[(data.colour as keyof typeof COLOUR_FILL) || "sand"], transform: `rotate(${tilt}deg)` }}>
        <Editor id={id} value={data.label} placeholder="Write something…" editing={editing} />
      </div>
    );
  }
  if (data.kind === "text") {
    return (
      <div className={`min-w-[140px] font-display ${size} ${outline} ${selected || editing ? "" : "hover:outline hover:outline-dashed hover:outline-border"}`}>
        <Editor id={id} value={data.label} placeholder="Type here…" editing={editing} />
      </div>
    );
  }
  if (data.uploading) {
    return (
      <div className="relative h-40 overflow-hidden rounded-[14px] bg-border">
        <span className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/70">
          <span className="block h-full w-1/2 animate-pulse bg-accent" />
        </span>
      </div>
    );
  }
  if (!api) return null;
  const meditation = api.meditations.find((item) => item.id === data.refId || item.sk === data.refId) ?? null;
  return (
    <SourceCard
      dream={api.dream}
      card={data}
      selected={selected}
      coarse={api.coarse}
      outline={outline}
      image={image}
      meditation={meditation}
      caption={
        editing && data.kind === "image" ? (
          <Editor id={id} value={data.label} placeholder="Add a caption…" editing />
        ) : (
          <p className={data.label ? "" : "italic text-muted"}>{data.label || "Add a caption…"}</p>
        )
      }
      onOpen={() => api.openNode(id)}
      onTick={(itemId) => api.tickItem(itemId)}
      onPlay={(itemId) => api.playMeditation(itemId)}
      onLongPress={() => api.setMenu(id)}
    />
  );
}

function Editor({ id, value, placeholder, editing }: { id: string; value: string; placeholder: string; editing: boolean }) {
  const api = useContext(BoardContext);
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!editing || !el) return;
    el.focus();
  }, [editing]);
  if (!editing) {
    return (
      <p className={`whitespace-pre-wrap ${value ? "" : "italic text-muted"}`} onDoubleClick={() => api?.setEditing(id)}>
        {value || placeholder}
      </p>
    );
  }
  return (
    <div
      ref={field}
      contentEditable
      suppressContentEditableWarning
      className="nodrag nopan whitespace-pre-wrap outline-none"
      onPointerDown={(event) => event.stopPropagation()}
      onPaste={(event) => {
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
          event.preventDefault();
          api?.commitText(id, event.currentTarget.textContent ?? "");
          api?.setEditing(null);
        }
      }}
      onBlur={(event) => {
        api?.commitText(id, event.currentTarget.textContent ?? "");
        api?.setEditing(null);
      }}
      data-placeholder={placeholder}
    >
      {value}
    </div>
  );
}

function thoughtWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function trackerSourceRows(items: TrackerItem[], match: (label: string) => boolean): SourceRow[] {
  const ids = new Set(items.map((item) => item.id));
  const linked = items.map((item) => ({
    ...item,
    parentId: item.parentId && ids.has(item.parentId) ? item.parentId : null,
  }));
  const keep = new Set<string>();
  const hits = (item: TrackerItem): boolean => {
    let childHit = false;
    for (const kid of childrenOf(linked, item.id)) {
      if (hits(kid)) childHit = true;
    }
    const on = match(item.title || "Untitled") || childHit;
    if (on) keep.add(item.id);
    return on;
  };
  for (const root of childrenOf(linked, null)) hits(root);
  const rows: SourceRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of childrenOf(linked, parentId)) {
      if (!keep.has(item.id)) continue;
      const kids = childrenOf(linked, item.id).filter((child) => keep.has(child.id));
      rows.push({
        id: item.id,
        label: item.title || "Untitled",
        meta: item.kind ?? "Item",
        kind: "item",
        refId: item.id,
        refType: "item",
        depth,
        parentId,
        hasChildren: kids.length > 0,
        extra: trackerRowExtra(linked, item),
      });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

function shownSourceRows(rows: SourceRow[], folded: string[]) {
  const hidden = new Set<string>();
  return rows.filter((row) => {
    if (row.parentId && (folded.includes(row.parentId) || hidden.has(row.parentId))) {
      hidden.add(row.id);
      return false;
    }
    return true;
  });
}

function visionImages(areaId: string): VisionBoardItem[] {
  const items = loadIdeateVisionBoardStore().items.filter((item) => item.imageUrl || item.mediaId);
  return [...items.filter((item) => (item.lifeAreaIds ?? []).includes(areaId)), ...items.filter((item) => !(item.lifeAreaIds ?? []).includes(areaId))];
}

function buildSources(dream: PlanDream, meditations: LibraryMeditationItem[], query: string): { id: string; label: string; rows: SourceRow[] }[] {
  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);
  const store = ensureTracker(loadIdeateStore());
  const read = readCachedInsight(dream.id);
  const vision = (
    [
      { id: `dream_${dream.id}`, label: dream.dreamText.trim() || dream.title, meta: "Dream", kind: "dream", refId: dream.id, refType: "dream" },
      { id: `moment_${dream.id}`, label: dream.visionText.trim() || "The moment it's happened", meta: "Moment", kind: "moment", refId: dream.id, refType: "moment" },
      ...(dream.obstacleLabels ?? []).filter(Boolean).map((label) => ({ id: `obs_${label}`, label, meta: "Obstacle", kind: "obstacle", refId: label, refType: "obstacle" })),
      ...(dream.ifThenPlans ?? []).map((plan) => ({ id: plan.id, label: plan.plan, meta: plan.obstacle, kind: "plan", refId: plan.id, refType: "plan" })),
    ] as SourceRow[]
  ).filter((row) => match(row.label));
  const tracker = trackerSourceRows(itemsForArea(store, dream.id), match);
  const thoughts = areaThoughts(dream)
    .filter((row) => match(row.text))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((row) => ({
      id: row.id,
      label: row.text,
      meta: row.kind ?? "Thought",
      when: thoughtWhen(row.createdAt),
      kind: "thought" as const,
      refId: row.id,
      refType: "thought",
    }));
  const images = visionImages(dream.id)
    .filter((item) => match(item.label || item.prompt || ""))
    .map((item) => ({ id: item.id, label: item.label || item.prompt || "Image", meta: (item.lifeAreaIds ?? []).includes(dream.id) ? "This area" : "All areas", kind: "image" as const, refId: item.id, refType: "image", imageUrl: item.imageUrl }));
  const meds = meditations
    .filter((row) => match(row.title))
    .map((row) => ({ id: row.id || row.sk || row.title, label: row.title, meta: row.durationSeconds ? `${Math.round(row.durationSeconds / 60)} min` : "Meditation", kind: "meditation" as const, refId: row.id || row.sk || "", refType: "meditation", imageUrl: row.coverImageUrl || undefined }));
  const insights = [
    ...(read
      ? [{ id: `read_${dream.id}`, label: read.text, meta: "The read", kind: "insight" as const, refId: dream.id, refType: "insight" }]
      : []),
    ...(dream.obstacleLabels ?? [])
      .filter((label) => match(label))
      .map((label) => ({
        id: `spot_${label}`,
        label,
        meta: "Spotted",
        kind: "insight" as const,
        refId: label,
        refType: "insight",
      })),
  ] as SourceRow[];
  return [
    { id: "vision", label: "Vision", rows: vision },
    { id: "tracker", label: "Tracker", rows: tracker },
    { id: "thoughts", label: "Thoughts", rows: thoughts },
    { id: "images", label: "Images", rows: images },
    { id: "meditations", label: "Meditations", rows: meds },
    { id: "insights", label: "Insights", rows: insights },
  ].filter((group) => group.rows.length > 0 || group.id === "images");
}

function trackerRowExtra(items: TrackerItem[], item: TrackerItem) {
  const kids = childrenOf(items, item.id);
  if (kids.length > 0) {
    const stats = rollup(items, item.id);
    return stats.leaves > 0 ? `· ${stats.doneLeaves}/${stats.leaves}` : "";
  }
  return item.due ? `· due ${dueLabel(item.due)}` : "";
}

function sourceDot(row: SourceRow) {
  if (row.kind === "dream" || row.kind === "moment") return "bg-accent";
  if (row.kind === "obstacle" || row.kind === "plan") return "bg-danger";
  if (row.kind === "meditation") return "bg-success";
  if (row.kind === "insight") return "bg-accent-link";
  if (row.kind === "image") return "bg-muted";
  if (row.kind === "thought") {
    const kind = row.meta as ThoughtKind;
    return THOUGHT_KIND_DOT[kind] ?? "bg-accent";
  }
  if (row.refType === "item") return TRACKER_KIND_DOT[row.meta as TrackerKind] ?? "bg-accent-button";
  return "bg-muted";
}

function sourceKindLabel(row: SourceRow) {
  if (row.refType === "item") return TRACKER_KIND_LABEL[row.meta as TrackerKind] ?? "Item";
  if (row.refType === "thought") return thoughtKindLabel(row.meta as ThoughtKind) ?? "Thought";
  return row.meta;
}

function toFlow(nodes: LifeAreaWbNode[], edges: LifeAreaWbEdge[]) {
  return {
    nodes: nodes.map(
      (node): FlowNode => ({
        id: node.id,
        type: "card",
        position: { x: node.x, y: node.y },
        data: {
          label: node.text && node.text !== "Note" && node.text !== "Text" ? node.text : node.text === "Note" || node.text === "Text" ? "" : node.text || "",
          kind: node.kind,
          refId: node.refId,
          refType: node.refType,
          colour: node.colour,
          size: node.size,
          imageId: node.imageId,
        },
        style: { width: node.w || 200, height: node.h || undefined },
      }),
    ),
    edges: edges.map(
      (edge): Edge => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.label ?? undefined,
        style: { strokeDasharray: edge.style === "dashed" ? "4 3" : undefined },
      }),
    ),
  };
}

function fromNode(node: FlowNode): LifeAreaWbNode {
  return {
    id: node.id,
    kind: node.data.kind,
    refId: node.data.refId,
    refType: node.data.refType,
    x: node.position.x,
    y: node.position.y,
    w: node.width ?? (typeof node.style?.width === "number" ? node.style.width : 200),
    h: node.height ?? 80,
    text: node.data.label,
    ...(node.data.colour ? { colour: node.data.colour } : {}),
    ...(node.data.size ? { size: node.data.size } : {}),
    ...(node.data.imageId ? { imageId: node.data.imageId } : {}),
  };
}

function fromEdge(edge: Edge): LifeAreaWbEdge {
  const label = typeof edge.label === "string" ? edge.label : null;
  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    label,
    style: label === "helps" || label === "answers" ? "dashed" : "solid",
  };
}
