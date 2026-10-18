import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AREA_LABEL,
  OUTLINE,
  areaThoughts,
  commitIdeate,
  goalsForArea,
  obstacleChips,
  progressFor,
} from "@/components/plan/life-area/kit";
import { loadIdeateVisionBoardStore } from "@/lib/ideate-vision-board";
import type { LifeAreaWbEdge, LifeAreaWbNode, PlanDream } from "@/lib/plan-dreams";
import {
  loadIdeateStore,
  recomputeSubtaskStatus,
  upsertTodo,
} from "@/lib/plan-ideate-store";

type Props = {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
};

type FlowNode = Node<{ label: string; kind: LifeAreaWbNode["kind"]; refId: string | null }>;

const nodeTypes = { card: CardNode };

export function LifeAreaWhiteboard({ dream, onPatch, onRefresh }: Props) {
  return (
    <ReactFlowProvider>
      <Board dream={dream} onPatch={onPatch} onRefresh={onRefresh} />
    </ReactFlowProvider>
  );
}

function Board({ dream, onPatch, onRefresh }: Props) {
  const doc = dream.whiteboard;
  const [sheet, setSheet] = useState(false);
  const [tool, setTool] = useState<"select" | "pan" | "sticky" | "text" | "link" | "image">("select");
  const [tab, setTab] = useState<"thoughts" | "goals" | "images">("thoughts");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState(doc?.title || `${dream.title.trim() || "This area"}, the map`);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const initial = useMemo(() => toFlow(doc?.nodes ?? [], doc?.edges ?? []), [doc?.nodes, doc?.edges]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const flow = useReactFlow();

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      const stack = e.shiftKey ? redo.current : undo.current;
      const raw = stack.pop();
      if (!raw) return;
      const snap = JSON.parse(raw) as { nodes: FlowNode[]; edges: Edge[] };
      (e.shiftKey ? undo.current : redo.current).push(
        JSON.stringify({ nodes, edges }),
      );
      setNodes(snap.nodes);
      setEdges(snap.edges);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edges, nodes, setEdges, setNodes]);

  function remember() {
    undo.current.push(JSON.stringify({ nodes, edges }));
    redo.current = [];
  }

  function place(kind: LifeAreaWbNode["kind"], label: string, refId: string | null) {
    remember();
    const node: FlowNode = {
      id: `wb_${Date.now()}`,
      type: "card",
      position: { x: 80 + nodes.length * 16, y: 80 + nodes.length * 12 },
      data: { label, kind, refId },
      style: { width: kind === "dream" ? 240 : 200 },
    };
    setNodes((cur) => [...cur, node]);
  }

  function starter() {
    if (nodes.length && !window.confirm("Add a starter map beside what's here?")) return;
    const store = loadIdeateStore();
    const goal = goalsForArea(store, dream).find((g) => g.status !== "done");
    const progress = goal ? progressFor(store, goal) : null;
    const thoughts = areaThoughts(dream)
      .filter((t) => t.kind === "insight")
      .slice(0, 2);
    const next: FlowNode[] = [
      nodeOf("dream", dream.dreamText.trim() || dream.title, null, 260, 20),
      ...obstacleChips(dream.obstacleText).slice(0, 3).map((label, i) =>
        nodeOf("obstacle", label, null, 20, 160 + i * 90),
      ),
    ];
    if (goal && progress) {
      next.push(nodeOf("goal", goal.title, goal.id, 260, 180));
      progress.todos
        .filter((t) => !t.isChecked)
        .slice(0, 3)
        .forEach((todo, i) => {
          next.push(nodeOf("step", todo.title, todo.id, 260, 300 + i * 70));
        });
    }
    thoughts.forEach((t, i) => {
      next.push(nodeOf("thought", t.text, t.id, 520, 180 + i * 90));
    });
    setNodes(next);
    setEdges([]);
  }

  const library = libraryItems(dream, tab, query);
  const onBoard = new Set(nodes.map((n) => n.data.refId).filter(Boolean));

  return (
    <div className="grid min-h-[70vh] grid-cols-1 gap-3.5 md:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="hidden flex-col rounded-2xl border border-border bg-card p-3 md:flex">
        <SideList
          tab={tab}
          setTab={setTab}
          query={query}
          setQuery={setQuery}
          items={library}
          onBoard={onBoard}
          onAdd={(item) => place(item.kind, item.label, item.refId)}
          onStarter={starter}
          empty={nodes.length === 0}
        />
      </aside>
      <div className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-border bg-card">
        <p className="pointer-events-none absolute left-4 top-14 z-10 font-display text-sm italic text-muted">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="pointer-events-auto bg-transparent font-display italic outline-none"
          />
        </p>
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1 rounded-full border border-border bg-card p-1 text-xs">
          {(
            [
              ["select", "Select"],
              ["pan", "Pan"],
              ["sticky", "Sticky note"],
              ["text", "Text"],
              ["link", "Link"],
              ["image", "Image"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTool(id);
                if (id === "sticky") place("sticky", "Note", null);
                if (id === "text") place("text", "Text", null);
              }}
              className={`rounded-full px-2 py-1 ${
                tool === id ? "bg-accent-soft font-semibold text-accent-link" : ""
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-full px-2 py-1 font-semibold text-accent-link"
            onClick={starter}
          >
            ✦ Arrange
          </button>
        </div>
        <button
          type="button"
          className={`${OUTLINE} absolute bottom-3 right-3 z-10 size-10 md:hidden`}
          onClick={() => setSheet(true)}
        >
          +
        </button>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(c: Connection) => {
            remember();
            setEdges((eds) =>
              addEdge(
                {
                  ...c,
                  label: "leads to",
                  style: { strokeWidth: 1.5 },
                },
                eds,
              ),
            );
          }}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => {
            if (node.data.kind !== "step" || !node.data.refId) return;
            const todo = loadIdeateStore().todos.find((t) => t.id === node.data.refId);
            if (!todo) return;
            commitIdeate((s) => {
              const next = upsertTodo(s, {
                ...todo,
                isChecked: !todo.isChecked,
                checkedAt: todo.isChecked ? null : new Date().toISOString(),
              });
              return recomputeSubtaskStatus(next, todo.subtaskId);
            });
            onRefresh();
          }}
          fitView
          panOnDrag={tool === "pan"}
          selectionOnDrag={tool === "select"}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <MiniMap className="!rounded-xl" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {sheet ? (
        <div className="fixed inset-0 z-[150] flex items-end bg-overlay/40 md:hidden">
          <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-card p-4">
            <button type="button" className="mb-2 text-sm" onClick={() => setSheet(false)}>
              Close
            </button>
            <SideList
              tab={tab}
              setTab={setTab}
              query={query}
              setQuery={setQuery}
              items={library}
              onBoard={onBoard}
              onAdd={(item) => {
                place(item.kind, item.label, item.refId);
                setSheet(false);
              }}
              onStarter={() => {
                starter();
                setSheet(false);
              }}
              empty={nodes.length === 0}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function nodeOf(
  kind: LifeAreaWbNode["kind"],
  label: string,
  refId: string | null,
  x: number,
  y: number,
): FlowNode {
  return {
    id: `wb_${kind}_${refId ?? x}_${y}`,
    type: "card",
    position: { x, y },
    data: { label, kind, refId },
    style: { width: 220 },
  };
}

function CardNode({ data, selected }: NodeProps<FlowNode>) {
  const tint =
    data.kind === "dream"
      ? "border-accent/30 bg-accent-soft"
      : data.kind === "obstacle"
        ? "border-danger/30 bg-danger-soft"
        : data.kind === "sticky"
          ? "rotate-1 border-amber-300 bg-amber-100 text-amber-950"
          : "border-border bg-card";
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm shadow-sm ${tint} ${selected ? "outline outline-[1.5px] outline-accent" : ""}`}>
      <p className={AREA_LABEL}>{data.kind}</p>
      <p className={data.kind === "dream" || data.kind === "goal" || data.kind === "sticky" || data.kind === "text" ? "font-display text-[17px]" : "text-[15px] font-semibold"}>
        {data.label}
      </p>
    </div>
  );
}

function SideList({
  tab,
  setTab,
  query,
  setQuery,
  items,
  onBoard,
  onAdd,
  onStarter,
  empty,
}: {
  tab: "thoughts" | "goals" | "images";
  setTab: (tab: "thoughts" | "goals" | "images") => void;
  query: string;
  setQuery: (q: string) => void;
  items: { id: string; label: string; meta: string; kind: LifeAreaWbNode["kind"]; refId: string | null }[];
  onBoard: Set<string | null>;
  onAdd: (item: { kind: LifeAreaWbNode["kind"]; label: string; refId: string | null }) => void;
  onStarter: () => void;
  empty: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <p className={AREA_LABEL}>Add to board</p>
      <p className="text-xs text-muted">drag onto the canvas</p>
      <div className="mt-2 flex rounded-full bg-background p-0.5 text-xs">
        {(["thoughts", "goals", "images"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-full px-2 py-1 capitalize ${
              tab === id ? "bg-card font-semibold" : "text-muted"
            }`}
          >
            {id}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        className="mt-2 h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none"
      />
      <ul className="mt-2 flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {items.map((item) => {
          const placed = item.refId ? onBoard.has(item.refId) : false;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onAdd(item)}
                className={`w-full rounded-xl border px-2 py-2 text-left text-xs ${
                  placed ? "border-accent/30 bg-accent-soft" : "border-border"
                }`}
              >
                <span className="line-clamp-2">{item.label}</span>
                <span className="text-muted">{item.meta}</span>
                {placed ? (
                  <span className="mt-1 block text-accent-link">
                    ✓ “{item.label.slice(0, 28)}…” is on the board
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted">
        Items stay linked: tick a step here and it's ticked in Goals.
      </p>
      <button type="button" onClick={onStarter} className={`${OUTLINE} mt-2 h-9 text-xs`}>
        ✦ {empty ? "Build a starter map" : "Build a starter map"}
      </button>
    </div>
  );
}

function libraryItems(dream: PlanDream, tab: "thoughts" | "goals" | "images", query: string) {
  const q = query.trim().toLowerCase();
  const match = (label: string) => !q || label.toLowerCase().includes(q);
  if (tab === "thoughts") {
    return areaThoughts(dream)
      .filter((t) => match(t.text))
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        label: t.text,
        meta: t.kind ?? "Thought",
        kind: "thought" as const,
        refId: t.id,
      }));
  }
  if (tab === "goals") {
    return goalsForArea(loadIdeateStore(), dream)
      .filter((g) => match(g.title))
      .map((g) => ({
        id: g.id,
        label: g.title,
        meta: "Goal",
        kind: "goal" as const,
        refId: g.id,
      }));
  }
  return loadIdeateVisionBoardStore()
    .items.filter(
      (item) =>
        (item.lifeAreaIds ?? []).includes(dream.id) &&
        match(item.prompt || item.id),
    )
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      label: item.prompt || "Image",
      meta: "Image",
      kind: "image" as const,
      refId: item.id,
    }));
}

function toFlow(nodes: LifeAreaWbNode[], edges: LifeAreaWbEdge[]) {
  return {
    nodes: nodes.map(
      (n): FlowNode => ({
        id: n.id,
        type: "card",
        position: { x: n.x, y: n.y },
        data: { label: n.text || n.kind, kind: n.kind, refId: n.refId },
        style: { width: n.w || 200, height: n.h || undefined },
      }),
    ),
    edges: edges.map(
      (e): Edge => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: e.label ?? undefined,
        style: { strokeDasharray: e.style === "dashed" ? "4 3" : undefined },
      }),
    ),
  };
}

function fromNode(node: FlowNode): LifeAreaWbNode {
  return {
    id: node.id,
    kind: node.data.kind,
    refId: node.data.refId,
    x: node.position.x,
    y: node.position.y,
    w: node.width ?? 200,
    h: node.height ?? 80,
    text: node.data.label,
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
