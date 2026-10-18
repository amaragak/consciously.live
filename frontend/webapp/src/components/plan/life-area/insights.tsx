import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AREA_LABEL,
  InsightText,
  MIST,
  OUTLINE,
  areaThoughts,
  commitIdeate,
  daysAgo,
  formatShortDate,
  goalsForArea,
  obstacleChips,
  progressFor,
} from "@/components/plan/life-area/kit";
import { startLifeAreaFocus, startLifeAreaMeditation } from "@/lib/life-area-card-actions";
import type { InsightScope, PlanDream, ThoughtKind } from "@/lib/plan-dreams";
import { prependLifeAreaInsight } from "@/lib/plan-dreams";
import {
  createTodo,
  loadIdeateStore,
  subtasksForProject,
  todosForSubtask,
  upsertTodo,
  type IdeateSubtask,
} from "@/lib/plan-ideate-store";
import {
  buildLifeAreaInsightSnapshot,
  streamLifeAreaInsight,
} from "@/lib/plan-insights";

type Source = "goals" | "thoughts" | "journal" | "focus" | "meditations";

const SOURCES: Source[] = ["goals", "thoughts", "journal", "focus", "meditations"];

type Props = {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
  onCheckIn: () => void;
};

export function LifeAreaInsights({
  dream,
  onPatch,
  onRefresh,
  onCheckIn,
}: Props) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<InsightScope>("4w");
  const [sources, setSources] = useState<Source[]>([...SOURCES]);
  const [loading, setLoading] = useState(false);
  const store = loadIdeateStore();
  const since = scope === "all" ? 0 : Date.now() - (scope === "4w" ? 28 : 90) * 86_400_000;
  const thoughts = areaThoughts(dream).filter(
    (t) => sources.includes("thoughts") && new Date(t.createdAt).getTime() >= since,
  );
  const goals = sources.includes("goals") ? goalsForArea(store, dream) : [];
  const doneSteps = goals.flatMap((g) =>
    todosForSubtask(store, g.id).filter(
      (t) => t.isChecked && t.checkedAt && new Date(t.checkedAt).getTime() >= since,
    ),
  );
  const thin = thoughts.length < 3 && doneSteps.length === 0;
  const latest =
    (dream.insights ?? []).find((i) => (i.scope ?? "all") === scope) ??
    (dream.insights ?? [])[0];
  const snap = buildLifeAreaInsightSnapshot(dream, store);
  const stale =
    Boolean(latest?.fingerprint) && latest!.fingerprint !== snap.fingerprint;
  const read =
    latest?.sections?.find((s) => s.id === "summary")?.body ||
    latest?.text ||
    "";
  const nextMove =
    latest?.sections?.find((s) => s.id === "next")?.body ||
    "Take the next open step.";

  async function refresh() {
    setLoading(true);
    try {
      const parsed = await streamLifeAreaInsight(dream, () => undefined, store);
      const updated = prependLifeAreaInsight(dream, {
        text: parsed.text,
        fingerprint: snap.fingerprint,
        sections: parsed.sections,
        scope,
      });
      onPatch({ insights: updated.insights });
    } finally {
      setLoading(false);
    }
  }

  function addStep() {
    const goal = goals.find((g) => g.status !== "done") ?? goals[0];
    if (!goal) return;
    const todos = todosForSubtask(store, goal.id);
    commitIdeate((s) => upsertTodo(s, createTodo(goal.id, nextMove, todos.length)));
    onRefresh();
  }

  const active = goals.find((g) => g.status !== "done");

  return (
    <div className="flex flex-col gap-3.5">
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5">
        <div className="flex rounded-full bg-background p-0.5 text-xs">
          {(
            [
              ["4w", "4 weeks"],
              ["3m", "3 months"],
              ["all", "All time"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={`rounded-full px-2.5 py-1 ${
                scope === id ? "bg-card font-semibold" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {SOURCES.map((id) => {
          const on = sources.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() =>
                setSources((cur) =>
                  cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id],
                )
              }
              className={`rounded-full px-2 py-1 text-xs capitalize ${
                on ? "bg-accent-soft font-semibold text-accent-link" : "text-muted"
              }`}
            >
              {id}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-2">
          {stale ? (
            <span className="text-xs text-muted">● Edited since {formatShortDate(latest?.createdAt)}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            className={`${OUTLINE} h-8 px-3 text-xs`}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </span>
      </section>

      <section className="rounded-2xl border border-border border-l-[3px] border-l-accent bg-card p-5">
        <p className={AREA_LABEL}>The read</p>
        <p className="mt-2 font-display text-[19px] italic leading-snug text-foreground">
          {thin && !read ? (
            "Not much to go on yet. Add a few thoughts or check in, and this fills in."
          ) : (
            <InsightText text={read || snap.emptyHint} />
          )}
        </p>
        {thin && !read ? (
          <button
            type="button"
            onClick={onCheckIn}
            className={`${MIST} mt-4 h-10 px-4 text-sm`}
          >
            Check in
          </button>
        ) : (
          <div className="mt-4 rounded-xl border border-accent/25 bg-accent-soft p-3">
            <p className={AREA_LABEL}>Smallest next move</p>
            <p className="mt-1 text-[15px] font-semibold text-foreground">
              <InsightText text={nextMove} />
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={addStep} className="text-[13px] font-semibold text-accent-link">
                Add as step
              </button>
              {active ? (
                <button
                  type="button"
                  onClick={() => {
                    startLifeAreaFocus(active.id);
                    navigate(`/focus?fromIdeate=${Date.now()}&minutes=15&autoStart=1`);
                  }}
                  className={`${MIST} h-8 px-3 text-xs`}
                >
                  Focus 15 min
                </button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {!thin ? (
        <>
          <HeadingCard
            dream={dream}
            thoughts={thoughts}
            doneSteps={doneSteps.length}
            onPatch={onPatch}
          />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <Momentum done={doneSteps} goals={goals} />
            <Obstacles dream={dream} thoughts={thoughts} onPatch={onPatch} />
          </div>
          <IfThen dream={dream} onPatch={onPatch} />
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <Wins thoughts={thoughts} />
            <Effort dream={dream} />
            <Feeling thoughts={thoughts} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function HeadingCard({
  dream,
  thoughts,
  doneSteps,
  onPatch,
}: {
  dream: PlanDream;
  thoughts: { text: string; kind?: ThoughtKind | null; createdAt: string }[];
  doneSteps: number;
  onPatch: (partial: Partial<PlanDream>) => void;
}) {
  const up = thoughts.filter((t) =>
    t.kind === "win" || t.kind === "intention" || t.kind === "progress",
  ).length;
  const down = thoughts.filter(
    (t) => t.kind === "hard_blocker" || t.kind === "resistance",
  ).length;
  const hopeful = up >= down;
  const moving = doneSteps > 0;
  const state = hopeful && moving
    ? "Building"
    : hopeful
      ? "Stuck but willing"
      : moving
        ? "Grinding"
        : "Losing heart";
  const cells = ["Building", "Stuck but willing", "Grinding", "Losing heart"];
  const doubt = thoughts.find((t) => t.kind === "question");
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className={AREA_LABEL}>Where this is heading</p>
        <p className="text-xs text-muted">feeling × progress · previously {state}</p>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[330px_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-2">
          {cells.map((name) => (
            <div
              key={name}
              className={`rounded-xl px-3 py-4 text-sm font-semibold ${
                name === state
                  ? "bg-accent text-on-accent"
                  : "bg-background text-foreground"
              }`}
            >
              {name}
            </div>
          ))}
        </div>
        <div>
          <h3 className="font-display text-[22px] text-foreground">{state}</h3>
          <p className="mt-2 text-sm text-foreground">
            {hopeful
              ? "The writing still sounds willing."
              : "The writing has more friction than lift."}{" "}
            {moving
              ? "Steps are getting ticked in this period."
              : "Steps have not moved in this period."}
          </p>
          <div className="mt-3 rounded-xl bg-background p-3 text-sm">
            <p className={AREA_LABEL}>Nudge</p>
            <p className="mt-1">
              {moving ? "Keep the next step smaller than the doubt." : "Pick one step and give it 15 minutes."}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${OUTLINE} h-9 px-3 text-xs`}>
              ✦ Break down next step
            </button>
            <button
              type="button"
              className={`${OUTLINE} h-9 px-3 text-xs`}
              onClick={() => {
                const goal = goalsForArea(loadIdeateStore(), dream).find(
                  (g) => g.status !== "done",
                );
                if (!goal) return;
                startLifeAreaFocus(goal.id);
              }}
            >
              Schedule a focus session
            </button>
          </div>
        </div>
      </div>
      {doubt ? (
        <div className="mt-4 rounded-xl border border-dashed border-accent/40 p-3">
          <p className="text-sm font-semibold">Worth revisiting?</p>
          <p className="mt-1 text-sm italic">“{doubt.text}”</p>
          <p className="text-xs text-muted">{formatShortDate(doubt.createdAt)}</p>
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              className={`${OUTLINE} h-9 px-3 text-xs`}
              onClick={() => onPatch({ themesCache: { at: new Date().toISOString(), read: "recommit", chips: [] } })}
            >
              Still mine: recommit
            </button>
            <button type="button" className={`${OUTLINE} h-9 px-3 text-xs`}>
              Reshape the goal
            </button>
            <button type="button" className={`${OUTLINE} h-9 px-3 text-xs`}>
              Pause {dream.title.trim() || "this area"} for now
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Momentum({
  done,
  goals,
}: {
  done: { checkedAt: string | null }[];
  goals: IdeateSubtask[];
}) {
  const weeks = useMemo(() => {
    const buckets = [0, 0, 0, 0];
    for (const row of done) {
      const age = daysAgo(row.checkedAt) ?? 99;
      const index = Math.min(3, Math.floor(age / 7));
      buckets[3 - index] = (buckets[3 - index] ?? 0) + 1;
    }
    return buckets;
  }, [done]);
  const max = Math.max(1, ...weeks);
  const perWeek = done.length / 4;
  const last = goals
    .map((g) => progressFor(loadIdeateStore(), g).next)
    .find(Boolean);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className={AREA_LABEL}>Momentum</p>
      <p className="text-xs text-muted">steps done per week</p>
      <div className="mt-3 flex h-24 items-end gap-2">
        {weeks.map((n, i) => (
          <span key={i} className="flex flex-1 flex-col items-center gap-1">
            <span
              className="w-full rounded-t bg-accent"
              style={{ height: `${(n / max) * 100}%` }}
            />
            <span className="text-[10px] text-muted">W{i + 1}</span>
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
        <p>
          <span className="font-display text-xl">{perWeek.toFixed(1)} / wk</span>
          <span className="block text-xs text-muted">steps this period</span>
        </p>
        <p>
          <span className="font-display text-xl">{daysAgo(last ? goals[0]?.updatedAt : null) ?? "—"}</span>
          <span className="block text-xs text-muted">days since your last step</span>
        </p>
      </div>
      {last ? (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Stalled: </span>
          {last.title}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-muted">
        <span className="font-semibold text-foreground">Forecast: </span>
        at this pace the open steps land in about{" "}
        {Math.max(1, Math.round((goals.length * 3) / Math.max(perWeek, 0.5)))} weeks.
      </p>
    </section>
  );
}

function Obstacles({
  dream,
  thoughts,
  onPatch,
}: {
  dream: PlanDream;
  thoughts: { text: string }[];
  onPatch: (partial: Partial<PlanDream>) => void;
}) {
  const chips = obstacleChips(dream.obstacleText);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className={AREA_LABEL}>What's in the way</p>
      <ul className="mt-2 flex flex-col gap-2">
        {chips.map((chip) => {
          const n = thoughts.filter((t) =>
            t.text.toLowerCase().includes(chip.toLowerCase().slice(0, 12)),
          ).length;
          return (
            <li key={chip} className="text-sm">
              <span className="font-semibold">{chip}</span>
              <span className="text-muted"> ×{n}</span>
              <span className="text-accent-link"> {n > 1 ? "↑" : "→"}</span>
            </li>
          );
        })}
      </ul>
      {chips.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Obstacles from your vision show up here.</p>
      ) : null}
      <button
        type="button"
        className="mt-3 text-[13px] font-semibold text-accent-link"
        onClick={() =>
          onPatch({
            obstacleText: dream.obstacleText
              ? `${dream.obstacleText}\nA repeated worry`
              : "A repeated worry",
          })
        }
      >
        Add to obstacles
      </button>
    </section>
  );
}

function IfThen({
  dream,
  onPatch,
}: {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
}) {
  const navigate = useNavigate();
  const chips = obstacleChips(dream.obstacleText);
  const plans =
    dream.ifThenPlans ??
    chips.map((obstacle, i) => ({
      id: `plan-${i}`,
      obstacle,
      plan: `If ${obstacle.toLowerCase()}, then I do the next step anyway.`,
      kept: false,
    }));
  if (plans.length === 0) return null;
  return (
    <section className="flex flex-wrap gap-3">
      {plans.map((plan) => (
        <article
          key={plan.id}
          className={`min-w-[220px] flex-1 rounded-2xl border border-border p-4 ${
            plan.kept ? "bg-accent-soft" : "bg-card"
          }`}
        >
          <div className="flex justify-between">
            <p className={AREA_LABEL}>For: {plan.obstacle}</p>
            {plan.kept ? <span className="text-xs text-accent-link">✓ Kept</span> : null}
          </div>
          <p className="mt-2 font-display text-base text-foreground">
            <span className="text-accent-link">If</span> {plan.plan.replace(/^If\s+/i, "").split(/,?\s+then\s+/i)[0]}{" "}
            <span className="text-accent-link">then</span>{" "}
            {plan.plan.split(/then\s+/i)[1] || plan.plan}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="text-[13px] font-semibold text-accent-link"
              onClick={() => {
                const next = plans.map((p) =>
                  p.id === plan.id ? { ...p, kept: true } : p,
                );
                onPatch({ ifThenPlans: next });
              }}
            >
              {plan.kept ? "Edit" : "Keep"}
            </button>
            <button
              type="button"
              className="text-[13px] font-semibold text-accent-link"
              onClick={() => {
                const href = startLifeAreaMeditation(dream.id);
                if (href) navigate(href);
              }}
            >
              ✦ Make a meditation
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function Wins({ thoughts }: { thoughts: { text: string; kind?: ThoughtKind | null; createdAt: string }[] }) {
  const wins = thoughts.filter((t) => t.kind === "win");
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className={AREA_LABEL}>Wins</p>
      <p className="mt-2 font-display text-[17px] text-foreground">
        {wins[0]?.text || "Wins you tag show up here."}
      </p>
      <ul className="mt-2 text-sm">
        {wins.map((w) => (
          <li key={w.createdAt + w.text}>✓ {w.text} · {formatShortDate(w.createdAt)}</li>
        ))}
      </ul>
    </section>
  );
}

function Effort({ dream }: { dream: PlanDream }) {
  const store = loadIdeateStore();
  const areas = store.dreams.slice(0, 4);
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className={AREA_LABEL}>Effort and alignment</p>
      <p className="text-xs text-muted">focus minutes this period</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {areas.map((area) => {
          const steps = subtasksForProject(store, area.id).length;
          return (
            <li key={area.id} className="text-xs">
              <span className={area.id === dream.id ? "font-semibold" : ""}>
                {area.title}
              </span>
              <span
                className="mt-0.5 block h-1.5 rounded-full bg-accent/70"
                style={{ width: `${Math.min(100, 20 + steps * 12)}%` }}
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[13px] text-foreground">
        Time follows the goals you keep open, starting with {dream.title.trim() || "this area"}.
      </p>
    </section>
  );
}

function Feeling({
  thoughts,
}: {
  thoughts: { text: string; kind?: ThoughtKind | null; createdAt: string }[];
}) {
  const points = thoughts
    .slice(0, 8)
    .reverse()
    .map((t) =>
      t.kind === "win" || t.kind === "progress" ? 3 : t.kind === "hard_blocker" ? 0 : 1.5,
    );
  const d = points
    .map((y, i) => `${i === 0 ? "M" : "L"} ${i * 28} ${40 - y * 10}`)
    .join(" ");
  const high = thoughts.find((t) => t.kind === "win") ?? thoughts[0];
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className={AREA_LABEL}>How you feel about it</p>
      <svg viewBox="0 0 200 48" className="mt-2 h-12 w-full">
        <path d={d || "M0 24 L200 24"} fill="none" stroke="currentColor" className="text-accent" />
      </svg>
      {high ? (
        <p className="mt-2 font-display text-sm italic text-foreground">“{high.text}”</p>
      ) : null}
    </section>
  );
}
