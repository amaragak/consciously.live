import { Heart, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HealNameChip } from "@/components/heal/heal-name-chip";
import { readCachedInsight } from "@/components/plan/life-area/insights";
import { DreamPoster } from "@/components/plan/life-area/poster";
import {
  AREA_LABEL,
  InsightText,
  MIST,
  OUTLINE,
  ProgressBar,
  areaThoughts,
  capWords,
  daysAgo,
  formatShortDate,
  goalsForArea,
  guessThoughtKind,
  progressFor,
} from "@/components/plan/life-area/kit";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { MeditationReflectionLink } from "@/components/meditation-reflection-link";
import { meditationIdFromLibraryItem } from "@/lib/journal-meditation-reflect";
import {
  healItemsForLifeArea,
  loadHealStore,
  type HealItem,
} from "@/lib/heal-store";
import { queueTrackerFocus } from "@/lib/focus-ideate-link";
import {
  descendantsOf,
  ensureTracker,
  inFocusItem,
  itemsForArea,
  rollup,
  type TrackerItem,
} from "@/lib/tracker-items";
import {
  listLibraryMeditations,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import {
  newDreamId,
  type PlanDream,
  type ThoughtKind,
} from "@/lib/plan-dreams";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
function insightQuiet(dream: PlanDream, createdAt: string): boolean {
  const at = new Date(createdAt).getTime();
  if (!Number.isFinite(at)) return false;
  if (Date.now() - at <= 21 * 24 * 60 * 60 * 1000) return false;
  const newerWriting = [
    ...areaThoughts(dream).map((t) => t.createdAt),
    ...(dream.checkIns ?? []).map((c) => c.createdAt),
  ].some((iso) => new Date(iso).getTime() > at);
  const newerGoal = goalsForArea(loadIdeateStore(), dream).some(
    (goal) => new Date(goal.updatedAt).getTime() > at,
  );
  return !newerWriting && !newerGoal;
}

type Props = {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
  onCheckIn: () => void;
};

export function LifeAreaOverview({
  dream,
  onPatch,
  onRefresh,
  onCheckIn,
}: Props) {
  const navigate = useNavigate();
  const store = loadIdeateStore();
  const tracked = ensureTracker(store);
  const focusItem = inFocusItem(tracked, dream);
  const areaItems = itemsForArea(tracked, dream.id);
  const others = goalsForArea(store, dream).filter(
    (g) => g.status !== "done" && g.id !== focusItem?.id,
  );
  const heal = healItemsForLifeArea(loadHealStore(), dream.id);
  const kept = (dream.ifThenPlans ?? []).filter((p) => p.kept);
  const latestInsight = readCachedInsight(dream.id) ?? (dream.insights ?? [])[0];
  const showInsight = Boolean(
    latestInsight && !insightQuiet(dream, latestInsight.createdAt),
  );
  const hasOthers = others.length > 0;
  const hasSide = hasOthers || showInsight;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <DreamPoster dream={dream} onPatch={onPatch} />
      {dream.visionSuggestion ? (
        <VisionSuggestion dream={dream} onPatch={onPatch} />
      ) : null}
      {heal.slice(0, 2).map((item) => (
        <HealLine key={item.id} item={item} />
      ))}
      {heal.length > 2 ? (
        <Link
          to="/heal"
          className="text-[13px] font-semibold text-accent-link"
        >
          +{heal.length - 2} more
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-stretch xl:grid-cols-3">
        <div
          className={`order-1 md:col-span-2 md:order-none ${
            hasSide ? "xl:col-span-2" : "xl:col-span-3"
          }`}
        >
          {focusItem ? (
            <ActiveGoalCard
              dream={dream}
              item={focusItem}
              items={areaItems}
              keptPlan={kept[0]?.plan}
            />
          ) : (
            <GoalsEmpty dreamId={dream.id} />
          )}
        </div>
        {hasSide ? (
          <div className="contents xl:col-span-1 xl:flex xl:h-full xl:flex-col xl:gap-4">
            {hasOthers ? (
              <OtherGoalsCard
                dreamId={dream.id}
                goalIds={others.map((goal) => goal.id)}
                className={
                  showInsight
                    ? "order-3 h-full md:order-none xl:h-auto"
                    : "order-3 h-full md:order-none md:col-span-2 xl:col-auto xl:h-auto"
                }
              />
            ) : null}
            {showInsight ? (
              <InsightCard
                dream={dream}
                onCheckIn={onCheckIn}
                className={
                  hasOthers
                    ? "order-5 h-full md:order-none xl:h-auto xl:min-h-0 xl:flex-1"
                    : "order-5 h-full md:order-none md:col-span-2 xl:col-auto xl:h-auto xl:min-h-0 xl:flex-1"
                }
              />
            ) : null}
          </div>
        ) : null}
        <ThoughtsCapture
          dream={dream}
          onPatch={onPatch}
          className="order-2 h-full md:order-none"
        />
        <MeditationsCard
          lifeAreaId={dream.id}
          className="order-4 h-full md:order-none xl:col-span-2"
        />
      </div>
    </div>
  );
}

function HealLine({ item }: { item: HealItem }) {
  const store = loadHealStore();
  return (
    <Link
      to={`/heal/${encodeURIComponent(item.id)}`}
      className="flex items-center gap-2 rounded-[14px] bg-card px-4 py-3 text-sm text-foreground"
    >
      <Heart className="size-4 shrink-0 text-heal-accent" strokeWidth={1.75} />
      <span>
        For <HealNameChip item={item} store={store} />
        {item.valuesAction ? ` ${item.valuesAction}` : ""}
      </span>
    </Link>
  );
}

function VisionSuggestion({
  dream,
  onPatch,
}: {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
}) {
  if (!dream.visionSuggestion) return null;
  return (
    <p className="mt-3 text-[13px] text-foreground">
      1 suggested change
      <button
        type="button"
        className="ml-2 font-semibold text-accent-link"
        onClick={() =>
          onPatch({
            visionText: dream.visionSuggestion || dream.visionText,
            visionSuggestion: null,
          })
        }
      >
        Accept
      </button>
      <button
        type="button"
        className="ml-2 font-semibold text-accent-link"
        onClick={() => onPatch({ visionSuggestion: null })}
      >
        Dismiss
      </button>
    </p>
  );
}

function ActiveGoalCard({
  dream,
  item,
  items,
  keptPlan,
}: {
  dream: PlanDream;
  item: TrackerItem;
  items: TrackerItem[];
  keptPlan?: string;
}) {
  const navigate = useNavigate();
  const stats = rollup(items, item.id);
  const doing = descendantsOf(items, item.id).filter((row) => row.status === "doing");
  const shown = doing.slice(0, 3);
  const extra = Math.max(0, doing.length - shown.length);

  return (
    <section className="flex h-full flex-col gap-3.5 rounded-2xl border border-border bg-card px-5 py-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={AREA_LABEL}>In focus</p>
          <h2 className="mt-1 font-display text-2xl text-foreground">
            {item.title || "Untitled"}
          </h2>
        </div>
        <Link
          to={`/manifest/goal/${encodeURIComponent(dream.id)}/tracker`}
          className="shrink-0 text-[13px] font-semibold text-accent-link"
        >
          All items →
        </Link>
      </div>
      {stats.leaves > 1 || stats.tickable ? (
        <div>
          <ProgressBar done={stats.doneLeaves} total={stats.leaves} />
          <p className="mt-1.5 text-[13px] text-muted">
            {stats.doneLeaves} of {stats.leaves}
          </p>
        </div>
      ) : null}
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 text-[15px]">
              <span className="font-semibold">{row.title || "Untitled"}</span>
              <button
                type="button"
                className={`${MIST} h-9 shrink-0 px-3 text-[13px]`}
                onClick={() =>
                  navigate(
                    queueTrackerFocus([
                      { id: row.id, title: row.title, lifeAreaId: row.lifeAreaId },
                    ]),
                  )
                }
              >
                <Timer className="size-3.5" aria-hidden />
                Focus
              </button>
            </li>
          ))}
          {extra > 0 ? (
            <li>
              <Link
                to={`/manifest/goal/${encodeURIComponent(dream.id)}/tracker/${encodeURIComponent(item.id)}`}
                className="text-[13px] text-muted"
              >
                + {extra} more
              </Link>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">Nothing marked Doing</p>
          <Link
            to={`/manifest/goal/${encodeURIComponent(dream.id)}/tracker/${encodeURIComponent(item.id)}`}
            className={`${OUTLINE} h-10 px-4 text-sm`}
          >
            Choose what you're on
          </Link>
        </div>
      )}
      {keptPlan ? (
        <p className="text-[13px] text-foreground">If … then … {keptPlan}</p>
      ) : null}
    </section>
  );
}

function GoalsEmpty({ dreamId }: { dreamId: string }) {
  return (
    <section className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-[18px]">
      <p className="text-[15px] text-foreground">No goals here yet</p>
      <Link
        to={`/manifest/goal/${encodeURIComponent(dreamId)}/tracker`}
        className="text-[13px] font-semibold text-accent-link"
      >
        New goal
      </Link>
    </section>
  );
}

function OtherGoalsCard({
  dreamId,
  goalIds,
  className = "",
}: {
  dreamId: string;
  goalIds: string[];
  className?: string;
}) {
  const store = loadIdeateStore();
  const rows = goalIds
    .map((id) => store.subtasks.find((s) => s.id === id))
    .filter((goal): goal is NonNullable<typeof goal> => Boolean(goal));
  if (rows.length === 0) return null;
  return (
    <section
      className={`flex flex-col rounded-2xl border border-border bg-card px-5 py-[18px] ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={AREA_LABEL}>Other goals</p>
        <Link
          to={`/manifest/goal/${encodeURIComponent(dreamId)}/tracker`}
          className="text-[13px] text-muted"
        >
          New goal
        </Link>
      </div>
      <div className="mt-1">
        {rows.map((goal) => {
          const { done, total } = progressFor(store, goal);
          return (
            <Link
              key={goal.id}
              to={`/manifest/goal/${encodeURIComponent(dreamId)}/tracker/${encodeURIComponent(goal.id)}`}
              className="flex items-center gap-3.5 border-t border-border py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-foreground">
                  {goal.title}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {done} of {total}
                </span>
              </span>
              <span className="hidden w-[90px] shrink-0 min-[360px]:block">
                <ProgressBar done={done} total={total} className="!h-[5px]" />
              </span>
              <span aria-hidden className="text-lg text-muted">
                ›
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function MeditationsCard({
  lifeAreaId,
  className = "",
}: {
  lifeAreaId: string;
  className?: string;
}) {
  const { playItem } = useLibraryPlayer();
  const [rows, setRows] = useState<LibraryMeditationItem[]>([]);
  useEffect(() => {
    let cancel = false;
    void listLibraryMeditations()
      .then((items) => {
        if (cancel) return;
        setRows(
          items
            .filter((m) => !m.archived && !m.isDraft && m.lifeAreaId === lifeAreaId)
            .slice(0, 3),
        );
      })
      .catch(() => setRows([]));
    return () => {
      cancel = true;
    };
  }, [lifeAreaId]);
  return (
    <section
      className={`rounded-2xl border border-border bg-card px-5 py-[18px] ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className={AREA_LABEL}>Meditations</p>
        <Link
          to={`/manifest/goal/${encodeURIComponent(lifeAreaId)}/meditations`}
          className="text-[13px] text-muted"
        >
          See all
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm italic text-muted">
          None yet. Use Create meditation when you have a vision written, or
          pick this life area in Create.
        </p>
      ) : (
      <div className="mt-3 flex flex-col gap-2.5 xl:flex-row">
        {rows.map((m) => (
          <div key={m.sk || m.s3Key} className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-background p-2.5"
          >
            <span className="size-[52px] shrink-0 overflow-hidden rounded-lg bg-accent-soft">
              {m.speakerPortraitUrl ? (
                <img
                  src={m.speakerPortraitUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[15px] text-foreground">
                {m.title}
              </span>
              <span className="text-xs text-muted">
                {m.durationSeconds
                  ? `${Math.max(1, Math.round(m.durationSeconds / 60))} min · `
                  : ""}
                {m.meditationStyle || m.meditationType || "Meditation"}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Play ${m.title}`}
              onClick={() => playItem(m)}
              className={`${MIST} size-8 shrink-0 text-sm`}
            >
              ▶
            </button>
          </div>
          <MeditationReflectionLink
            meditationId={meditationIdFromLibraryItem(m)}
            item={m}
          />
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

function InsightCard({
  dream,
  onCheckIn,
  className = "",
}: {
  dream: PlanDream;
  onCheckIn: () => void;
  className?: string;
}) {
  const cached = readCachedInsight(dream.id);
  const latest = cached
    ? { createdAt: cached.createdAt, text: cached.text, sections: undefined }
    : (dream.insights ?? [])[0];
  if (!latest || insightQuiet(dream, latest.createdAt)) return null;
  const read = capWords(
    latest.sections?.find((s) => s.id === "summary")?.body || latest.text || "",
    25,
  );
  const working = capWords(
    latest.sections?.find((s) => s.id === "working")?.body || "",
    12,
  );
  const stalled = capWords(
    latest.sections?.find((s) => s.id === "not_working")?.body || "",
    12,
  );
  const last = dream.checkIns?.[0]?.createdAt;
  const ago = daysAgo(last);
  return (
    <section
      className={`rounded-2xl border border-border border-l-[3px] border-l-accent bg-card px-4 py-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className={AREA_LABEL}>
          Insight · {formatShortDate(latest.createdAt)}
        </p>
        <Link
          to={`/manifest/goal/${encodeURIComponent(dream.id)}/insights`}
          className="text-xs text-muted"
          aria-label="Refresh on the Insights tab"
        >
          ↻
        </Link>
      </div>
      {read ? (
        <p className="mt-2 font-display text-[17px] italic text-foreground">
          <InsightText text={read} />
        </p>
      ) : null}
      {working ? (
        <p className="mt-2 text-[13px] text-foreground">
          <span className="text-accent-link">↑ </span>
          <span className="font-semibold">Working:</span>{" "}
          <InsightText text={working} />
        </p>
      ) : null}
      {stalled ? (
        <p className="mt-1 text-[13px] text-muted">
          → <span className="font-semibold">Stalled:</span>{" "}
          <InsightText text={stalled} />
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-[13px]">
        <Link
          to={`/manifest/goal/${encodeURIComponent(dream.id)}/insights`}
          className="font-semibold text-accent-link"
        >
          Full insights →
        </Link>
        <span className="text-muted">
          {ago == null ? "No check-in yet" : `Last check-in ${ago} days ago`}
          {" · "}
          <button
            type="button"
            onClick={onCheckIn}
            className="font-semibold text-accent-link"
          >
            Check in
          </button>
        </span>
      </div>
    </section>
  );
}

function ThoughtsCapture({
  dream,
  onPatch,
  className = "",
}: {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<ThoughtKind | null>(null);
  const latest = areaThoughts(dream)[0];

  function add() {
    const value = text.trim();
    if (!value) return;
    const entry = {
      id: newDreamId().replace(/^dream_/, "thought_"),
      text: value,
      createdAt: new Date().toISOString(),
      coachReply: "",
      kind: kind ?? guessThoughtKind(value),
    };
    onPatch({ dreamEntries: [...(dream.dreamEntries ?? []), entry] });
    setText("");
    setKind(null);
  }

  return (
    <section
      className={`rounded-2xl border border-border bg-card px-4 py-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className={AREA_LABEL}>Thoughts</p>
        <Link
          to={`/manifest/goal/${encodeURIComponent(dream.id)}/thoughts`}
          className="text-[13px] font-semibold text-accent-link"
        >
          See all
        </Link>
      </div>
      <form
        className="mt-3 rounded-xl border border-border bg-background p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`What's on your mind about ${dream.title.trim() || "this"}?`}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
      </form>
      {latest ? (
        <p className="mt-3 text-sm text-foreground">
          {latest.text}
          <span className="mt-1 block text-xs text-muted">
            {formatShortDate(latest.createdAt)}
            {latest.kind ? ` · ${latest.kind.replace(/_/g, " ")}` : ""}
          </span>
        </p>
      ) : null}
    </section>
  );
}
