import { Pin, Sparkles, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SelectChevron } from "@/components/select-chevron";
import {
  AREA_LABEL,
  MIST,
  OUTLINE,
  ProgressBar,
  commitIdeate,
  formatShortDate,
  goalsForArea,
  progressFor,
} from "@/components/plan/life-area/kit";
import {
  startLifeAreaFocus,
  startLifeAreaMeditation,
} from "@/lib/life-area-card-actions";
import { streamPlanCoachReply } from "@/lib/plan-claude";
import type { PlanDream } from "@/lib/plan-dreams";
import {
  createSubtask,
  createTodo,
  deleteSubtask,
  deleteTodo,
  loadIdeateStore,
  recomputeSubtaskStatus,
  upsertSubtask,
  upsertTodo,
  type IdeateSubtask,
  type IdeateTodo,
} from "@/lib/plan-ideate-store";

type Filter = "active" | "done" | "all";
type Sort = "recent" | "custom" | "progress";

type Props = {
  dream: PlanDream;
  goalId: string | null;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
};

export function LifeAreaGoals({ dream, goalId, onPatch, onRefresh }: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("active");
  const [sort, setSort] = useState<Sort>("recent");
  const store = loadIdeateStore();
  const goals = goalsForArea(store, dream);
  const shown = goals
    .filter((g) => {
      if (filter === "active") return g.status !== "done";
      if (filter === "done") return g.status === "done";
      return true;
    })
    .sort((a, b) => {
      if (sort === "progress") {
        const pa = progressFor(store, a);
        const pb = progressFor(store, b);
        const ra = pa.total ? pa.done / pa.total : 0;
        const rb = pb.total ? pb.done / pb.total : 0;
        return rb - ra;
      }
      if (sort === "custom") return 0;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  const selected =
    shown.find((g) => g.id === goalId) ??
    goals.find((g) => g.id === goalId) ??
    null;
  const desktopSelected = selected ?? shown[0] ?? null;
  const base = `/manifest/goal/${encodeURIComponent(dream.id)}/goals`;

  function openGoal(id: string) {
    navigate(`${base}/${encodeURIComponent(id)}`);
  }

  function addGoal(title: string) {
    const row = createSubtask(dream.id, title);
    commitIdeate((s) => upsertSubtask(s, row));
    onRefresh();
    openGoal(row.id);
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[330px_minmax(0,1fr)]">
      <section
        className={`rounded-2xl border border-border bg-card p-3 ${
          goalId ? "hidden md:block" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => addGoal("New goal")}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-dashed border-accent/40 text-sm font-semibold text-accent-link"
        >
          + New goal
        </button>
        <div className="mt-3 flex gap-1 rounded-full bg-background p-1 text-xs">
          {(
            [
              ["active", `Active · ${goals.filter((g) => g.status !== "done").length}`],
              ["done", `Done · ${goals.filter((g) => g.status === "done").length}`],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`flex-1 rounded-full px-2 py-1.5 font-semibold ${
                filter === id ? "bg-card text-foreground shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted">
          <label>
            Sorted by{" "}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="bg-transparent font-semibold text-foreground"
            >
              <option value="recent">recent activity</option>
              <option value="custom">custom order</option>
              <option value="progress">progress</option>
            </select>
          </label>
          {sort === "custom" ? <span>Drag to reorder</span> : null}
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {shown.map((goal) => {
            const p = progressFor(store, goal);
            const on = (desktopSelected?.id ?? "") === goal.id;
            return (
              <li key={goal.id}>
                <button
                  type="button"
                  draggable={sort === "custom"}
                  onDragStart={(e) => e.dataTransfer.setData("text/goal", goal.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const from = e.dataTransfer.getData("text/goal");
                    if (!from || from === goal.id) return;
                    const ids = shown.map((g) => g.id);
                    const a = ids.indexOf(from);
                    const b = ids.indexOf(goal.id);
                    if (a < 0 || b < 0) return;
                    ids.splice(a, 1);
                    ids.splice(b, 0, from);
                    onPatch({ goalOrder: ids });
                  }}
                  onClick={() => openGoal(goal.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left ${
                    on
                      ? "border border-accent/30 bg-accent-soft"
                      : "border border-transparent"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-foreground">
                      {goal.title}
                    </span>
                    {dream.overviewGoalId === goal.id ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-link">
                        <Pin className="size-3" aria-hidden />
                        On Overview
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="hidden w-16 md:block">
                      <ProgressBar done={p.done} total={p.total} className="!h-1" />
                    </span>
                    <span className="text-xs text-muted">
                      {p.done} of {p.total}
                    </span>
                  </span>
                  {p.next ? (
                    <span className="mt-0.5 block truncate text-xs text-foreground">
                      Next: {p.next.title}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={goalId ? "" : "hidden md:block"}>
        {desktopSelected ? (
          <GoalDetail
            dream={dream}
            goal={goalId ? selected ?? desktopSelected : desktopSelected}
            showBack={Boolean(goalId)}
            onBack={() => navigate(base)}
            onPatch={onPatch}
            onRefresh={onRefresh}
            onFocus={(id, minutes) => {
              startLifeAreaFocus(id);
              navigate(
                `/focus?fromIdeate=${Date.now()}&minutes=${minutes}&autoStart=1`,
              );
            }}
            suggestFromVision={() => addGoal(dream.visionText.trim().slice(0, 80) || "From your vision")}
            empty={goals.length === 0}
          />
        ) : (
          <EmptyGoals
            hasVision={Boolean(dream.visionText.trim() || dream.dreamText.trim())}
            onCreate={() => addGoal("New goal")}
            onSuggest={() =>
              addGoal(
                (dream.visionText || dream.dreamText).trim().slice(0, 80) ||
                  "From your vision",
              )
            }
          />
        )}
      </section>
    </div>
  );
}

function EmptyGoals({
  hasVision,
  onCreate,
  onSuggest,
}: {
  hasVision: boolean;
  onCreate: () => void;
  onSuggest: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-10">
      <h2 className="font-display text-2xl text-foreground">No goals here yet</h2>
      <p className="mt-2 text-sm text-muted">
        Goals turn the dream into steps you can tick off.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onCreate} className={`${MIST} h-10 px-4 text-sm`}>
          New goal
        </button>
        {hasVision ? (
          <button
            type="button"
            onClick={onSuggest}
            className="text-sm font-semibold text-accent-link"
          >
            ✦ Suggest a goal from your vision
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GoalDetail({
  dream,
  goal,
  showBack,
  onBack,
  onPatch,
  onRefresh,
  onFocus,
  empty,
}: {
  dream: PlanDream;
  goal: IdeateSubtask | null;
  showBack: boolean;
  onBack: () => void;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
  onFocus: (subtaskId: string, minutes: number) => void;
  suggestFromVision: () => void;
  empty: boolean;
}) {
  const store = loadIdeateStore();
  const areas = store.dreams.filter((d) => d.id !== dream.id);
  const [menu, setMenu] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [plan, setPlan] = useState(goal?.dreamText ?? "");
  const [stepDraft, setStepDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    setPlan(goal?.dreamText ?? "");
  }, [goal?.id, goal?.dreamText]);
  if (!goal || empty) {
    return (
      <EmptyGoals
        hasVision={Boolean(dream.visionText.trim())}
        onCreate={() => {
          const row = createSubtask(dream.id, "New goal");
          commitIdeate((s) => upsertSubtask(s, row));
          onRefresh();
        }}
        onSuggest={() => {
          const row = createSubtask(
            dream.id,
            dream.visionText.trim().slice(0, 80) || "From your vision",
          );
          commitIdeate((s) => upsertSubtask(s, row));
          onRefresh();
        }}
      />
    );
  }
  const progress = progressFor(store, goal);
  const pinned = dream.overviewGoalId === goal.id;
  const steps = progress.todos.filter((t) => (hideDone ? !t.isChecked : true));

  function saveGoal(partial: Partial<IdeateSubtask>) {
    commitIdeate((s) =>
      upsertSubtask(s, { ...goal!, ...partial, updatedAt: new Date().toISOString() }),
    );
    onRefresh();
  }

  function toggle(todo: IdeateTodo) {
    commitIdeate((s) => {
      const next = upsertTodo(s, {
        ...todo,
        isChecked: !todo.isChecked,
        checkedAt: todo.isChecked ? null : new Date().toISOString(),
      });
      return recomputeSubtaskStatus(next, goal!.id);
    });
    onRefresh();
  }

  function addStep(title: string) {
    const order = progress.todos.length;
    commitIdeate((s) => upsertTodo(s, createTodo(goal!.id, title, order)));
    onRefresh();
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const thoughts = [
        ...(dream.dreamEntries ?? []),
        ...(dream.obstacleEntries ?? []),
      ]
        .slice(-6)
        .map((t) => t.text)
        .join("\n");
      const raw = await streamPlanCoachReply(
        [
          {
            role: "user",
            content: `Suggest exactly 3 short next steps for this goal. One step per line, no numbering.\nGoal: ${goal!.title}\nPlan: ${goal!.dreamText}\nArea: ${dream.title}\nThoughts:\n${thoughts}`,
          },
        ],
        () => undefined,
      );
      setSuggestions(
        raw
          .split("\n")
          .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
          .filter(Boolean)
          .slice(0, 3),
      );
    } catch {
      setSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <article className="rounded-2xl border border-border bg-card px-5 py-5">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-link md:hidden"
        >
          <SelectChevron className="size-3.5 rotate-90" />
          Goals
        </button>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`${AREA_LABEL} inline-flex items-center gap-2`}>
            Goal
            {pinned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 text-[11px] normal-case tracking-normal">
                <Pin className="size-3" /> On Overview
              </span>
            ) : null}
          </p>
          <h2 className="mt-1 font-display text-[30px] leading-tight text-foreground">
            {goal.title}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Created {formatShortDate(goal.createdAt)} · Updated{" "}
            {formatShortDate(goal.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${OUTLINE} h-9 px-3 text-[13px]`}
            onClick={() =>
              saveGoal({
                status: goal.status === "done" ? "in_progress" : "done",
                completedAt:
                  goal.status === "done" ? null : new Date().toISOString(),
                completedManually: goal.status !== "done",
              })
            }
          >
            ✓ {goal.status === "done" ? "Reopen" : "Mark done"}
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="Goal actions"
              className={`${OUTLINE} size-9`}
              onClick={() => setMenu((v) => !v)}
            >
              ⋯
            </button>
            {menu ? (
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-border bg-card py-1 text-sm shadow-lg">
                <MenuBtn
                  label={pinned ? "Unpin" : "Pin to Overview"}
                  onClick={() => {
                    onPatch({ overviewGoalId: pinned ? null : goal.id });
                    setMenu(false);
                  }}
                />
                <MenuBtn
                  label="Rename"
                  onClick={() => {
                    const title = window.prompt("Rename goal", goal.title);
                    if (title?.trim()) saveGoal({ title: title.trim() });
                    setMenu(false);
                  }}
                />
                {areas.map((area) => (
                  <MenuBtn
                    key={area.id}
                    label={`Move to ${area.title}`}
                    onClick={() => {
                      saveGoal({ projectId: area.id });
                      setMenu(false);
                    }}
                  />
                ))}
                <MenuBtn
                  label="Delete"
                  onClick={() => {
                    if (!window.confirm("Delete this goal?")) return;
                    commitIdeate((s) => deleteSubtask(s, goal.id));
                    if (dream.overviewGoalId === goal.id) {
                      onPatch({ overviewGoalId: null });
                    }
                    onRefresh();
                    setMenu(false);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <ProgressBar done={progress.done} total={progress.total} />
        <p className="mt-1 text-[13px] text-muted">
          {progress.done} of {progress.total} steps
        </p>
      </div>
      <div className="mt-4">
        <p className={AREA_LABEL}>How I'll get there</p>
        <textarea
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          onBlur={() => {
            if (plan !== goal.dreamText) saveGoal({ dreamText: plan });
          }}
          placeholder="The plan, in a sentence or two."
          className="mt-2 w-full rounded-xl bg-accent-soft px-4 py-3.5 font-display text-[15px] italic text-foreground outline-none"
        />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className={AREA_LABEL}>Steps</p>
        <div className="flex items-center gap-3 text-[13px] font-semibold text-accent-link">
          <button type="button" onClick={() => void suggest()} disabled={suggesting}>
            <Sparkles className="mr-1 inline size-3" />
            {suggesting ? "Suggesting…" : "Suggest steps"}
          </button>
          <button type="button" onClick={() => setHideDone((v) => !v)}>
            {hideDone ? "Show done" : "Hide done"}
          </button>
        </div>
      </div>
      <ul className="mt-2">
        {steps.map((todo, index) => {
          const isNext = progress.next?.id === todo.id;
          return (
            <li
              key={todo.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/step", todo.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const from = e.dataTransfer.getData("text/step");
                if (!from || from === todo.id) return;
                const ids = progress.todos.map((t) => t.id);
                const a = ids.indexOf(from);
                const b = ids.indexOf(todo.id);
                if (a < 0 || b < 0) return;
                ids.splice(a, 1);
                ids.splice(b, 0, from);
                commitIdeate((s) => {
                  let next = s;
                  ids.forEach((id, order) => {
                    const row = next.todos.find((t) => t.id === id);
                    if (row) next = upsertTodo(next, { ...row, order });
                  });
                  return next;
                });
                onRefresh();
              }}
              className={`flex items-center gap-2 border-b border-border py-2.5 ${
                isNext ? "-mx-3 rounded-xl border border-accent/25 bg-accent-soft px-3" : ""
              }`}
            >
              <span className="cursor-grab text-muted" aria-hidden>
                ⋮⋮
              </span>
              <input
                type="checkbox"
                checked={todo.isChecked}
                onChange={() => toggle(todo)}
                className="size-4"
              />
              <input
                defaultValue={todo.title}
                onBlur={(e) => {
                  const title = e.target.value.trim();
                  if (title && title !== todo.title) {
                    commitIdeate((s) => upsertTodo(s, { ...todo, title }));
                    onRefresh();
                  }
                }}
                className={`min-w-0 flex-1 bg-transparent text-[15px] outline-none ${
                  todo.isChecked ? "text-muted line-through" : "text-foreground"
                }`}
              />
              {todo.isChecked && todo.checkedAt ? (
                <span className="text-xs text-muted">
                  {formatShortDate(todo.checkedAt)}
                </span>
              ) : null}
              {isNext ? (
                <button
                  type="button"
                  onClick={() => onFocus(goal.id, 25)}
                  className={`${MIST} h-9 px-3 text-[13px]`}
                >
                  <Timer className="size-3.5" />
                  Focus
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Remove step"
                className="text-muted"
                onClick={() => {
                  commitIdeate((s) => deleteTodo(s, todo.id));
                  onRefresh();
                }}
              >
                ×
              </button>
              <span className="sr-only">Step {index + 1}</span>
            </li>
          );
        })}
        {suggestions.map((title) => (
          <li
            key={title}
            className="flex items-center gap-2 border-b border-dashed border-accent/40 py-2 text-sm"
          >
            <span className="flex-1">{title}</span>
            <button
              type="button"
              className="font-semibold text-accent-link"
              onClick={() => {
                addStep(title);
                setSuggestions((rows) => rows.filter((r) => r !== title));
              }}
            >
              Add
            </button>
            <button
              type="button"
              aria-label="Dismiss suggestion"
              onClick={() =>
                setSuggestions((rows) => rows.filter((r) => r !== title))
              }
            >
              ×
            </button>
          </li>
        ))}
        {suggestions.length > 1 ? (
          <li>
            <button
              type="button"
              className="py-2 text-[13px] font-semibold text-accent-link"
              onClick={() => {
                suggestions.forEach(addStep);
                setSuggestions([]);
              }}
            >
              Add all
            </button>
          </li>
        ) : null}
      </ul>
      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stepDraft.trim()) return;
          addStep(stepDraft.trim());
          setStepDraft("");
        }}
      >
        <input
          value={stepDraft}
          onChange={(e) => setStepDraft(e.target.value)}
          placeholder="+ Add a step…"
          className="h-11 w-full rounded-xl border border-dashed border-accent/40 bg-transparent px-3 text-sm outline-none"
        />
      </form>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          disabled={!progress.next}
          onClick={() => onFocus(goal.id, 25)}
          className={`${MIST} h-10 px-4 text-sm`}
        >
          Focus session on the next 3 steps
        </button>
        <button
          type="button"
          className={`${OUTLINE} h-10 px-4 text-sm`}
          onClick={() => {
            const href = startLifeAreaMeditation(dream.id, goal.title);
            if (href) navigate(href);
          }}
        >
          ✦ Meditation for this goal
        </button>
      </div>
    </article>
  );
}

function MenuBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left hover:bg-accent-soft"
    >
      {label}
    </button>
  );
}
