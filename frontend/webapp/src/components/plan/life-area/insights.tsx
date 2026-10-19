import { useMemo, useState } from "react";
import { HealObstacleNote } from "@/components/heal/heal-reframe";
import { Link, useNavigate } from "react-router-dom";
import {
  AREA_LABEL,
  MIST,
  OUTLINE,
  areaThoughts,
  textHash,
} from "@/components/plan/life-area/kit";
import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { queueTrackerFocus } from "@/lib/focus-ideate-link";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { startLifeAreaMeditation } from "@/lib/life-area-card-actions";
import type { DrvTimelineEntry, PlanDream, ThoughtKind } from "@/lib/plan-dreams";
import { streamPlanCoachReply } from "@/lib/plan-claude";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import {
  addTrackerItem,
  commitTracker,
  ensureTracker,
  itemsForArea,
  patchTrackerItem,
  type TrackerItem,
} from "@/lib/tracker-items";

export type JournalSignal = {
  entryId: string;
  date: string;
  mood: string | null;
  items: { type: string; quote: string }[];
  obstacleHits: { obstacleId?: string; newLabel?: string }[];
  itemMatches: { itemId: string; confidence: number; quote: string }[];
};

export type InsightRange = "8w" | "3m" | "all";

/** Journal scanning is not part of this page. Later blocks merge this in. */
export function getJournalSignals(
  _areaId: string,
  _range: InsightRange,
): JournalSignal[] {
  return [];
}

type SourceId = "tracker" | "thoughts" | "focus" | "meditations" | "checkins";
type ObstacleKind = "inner" | "practical" | "people" | "time" | "heavy";

type CachedRead = {
  areaId: string;
  range: InsightRange;
  inputsHash: string;
  text: string;
  move: string;
  matchItemId?: string | null;
  createdAt: string;
};

const READ_KEY = "mm_life_area_insights_read_v1";
const RATE_KEY = "mm_life_area_insights_rate_v1";
const DISMISS_KEY = "mm_life_area_needs_dismiss_v1";
const KIND_KEY = "mm_life_area_obstacle_kind_v1";
const HIDE_KEY = "mm_life_area_obstacle_hide_v1";

const RANGES: InsightRange[] = ["8w", "3m", "all"];
const RANGE_LABEL: Record<InsightRange, string> = {
  "8w": "8 weeks",
  "3m": "3 months",
  all: "All time",
};

const SOURCE_LABEL: Record<SourceId, string> = {
  tracker: "Tracker",
  thoughts: "Thoughts",
  focus: "Focus",
  meditations: "Meditations",
  checkins: "Check-ins",
};

function weeksFor(range: InsightRange): number {
  if (range === "8w") return 8;
  if (range === "3m") return 13;
  return 12;
}

function monday(date: Date): Date {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function inRange(iso: string, from: Date): boolean {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= from.getTime();
}

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = readAccountLocalStorage(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeMap<T>(key: string, value: Record<string, T>) {
  try {
    writeAccountLocalStorage(key, JSON.stringify(value));
  } catch {
    /* */
  }
}

export function readCachedInsight(areaId: string, range: InsightRange = "8w"): CachedRead | null {
  return readMap<CachedRead>(READ_KEY)[`${areaId}:${range}`] ?? null;
}

function obstacleKind(label: string, areaId: string): ObstacleKind {
  const stored = readMap<ObstacleKind>(KIND_KEY)[`${areaId}:${label}`];
  if (stored) return stored;
  const text = label.toLowerCase();
  if (/time|busy|schedule|hour/.test(text)) return "time";
  if (/people|they|him|her|team|family|friend/.test(text)) return "people";
  if (/money|tool|place|practical|gear|room/.test(text)) return "practical";
  if (/grief|shame|heavy|panic|despair/.test(text)) return "heavy";
  return "inner";
}

function setObstacleKind(areaId: string, label: string, kind: ObstacleKind) {
  const map = readMap<ObstacleKind>(KIND_KEY);
  map[`${areaId}:${label}`] = kind;
  writeMap(KIND_KEY, map);
}

function dismissed(key: string): boolean {
  const at = readMap<string>(DISMISS_KEY)[key];
  return Boolean(at && Date.now() - Date.parse(at) < 30 * 86400000);
}

function dismiss(key: string) {
  const map = readMap<string>(DISMISS_KEY);
  map[key] = new Date().toISOString();
  writeMap(DISMISS_KEY, map);
}

type WeekCol = {
  key: string;
  label: string;
  done: number;
  thoughts: DrvTimelineEntry[];
  checkins: number;
};

type NeedCard = {
  key: string;
  kind: string;
  title: string;
  body: string;
  item: TrackerItem | null;
};

function buildModel(
  dream: PlanDream,
  range: InsightRange,
  sources: Record<SourceId, boolean>,
) {
  const count = weeksFor(range);
  const start = monday(new Date());
  start.setDate(start.getDate() - (count - 1) * 7);
  const store = ensureTracker(loadIdeateStore());
  const items = sources.tracker ? itemsForArea(store, dream.id) : [];
  const thoughts = sources.thoughts
    ? areaThoughts(dream).filter((row) => inRange(row.createdAt, start))
    : [];
  const checkins = sources.checkins
    ? (dream.checkIns ?? []).filter((row) => inRange(row.createdAt, start))
    : [];
  const weeks: WeekCol[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = new Date(start);
    at.setDate(start.getDate() + i * 7);
    const next = new Date(at);
    next.setDate(at.getDate() + 7);
    const within = (iso: string) => {
      const time = Date.parse(iso);
      return time >= at.getTime() && time < next.getTime();
    };
    weeks.push({
      key: at.toISOString().slice(0, 10),
      label: at.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      done: items.filter((item) => item.completedAt && within(item.completedAt)).length,
      thoughts: thoughts.filter((row) => within(row.createdAt)),
      checkins: checkins.filter((row) => within(row.createdAt)).length,
    });
  }
  const available: SourceId[] = [];
  if (itemsForArea(ensureTracker(loadIdeateStore()), dream.id).length) available.push("tracker");
  if (areaThoughts(dream).length) available.push("thoughts");
  if ((dream.checkIns ?? []).length) available.push("checkins");
  const cached = readCachedInsight(dream.id, range);
  const newSince = cached
    ? thoughts.filter((row) => row.createdAt > cached.createdAt).length +
      items.filter((item) => (item.completedAt ?? "") > cached.createdAt).length +
      checkins.filter((row) => row.createdAt > cached.createdAt).length
    : 0;
  const basisBits = [
    thoughts.length ? `${thoughts.length} thoughts` : "",
    items.filter((item) => item.updatedAt >= start.toISOString()).length
      ? `${items.filter((item) => item.updatedAt >= start.toISOString()).length} tracker updates`
      : "",
    checkins.length ? `${checkins.length} check-ins` : "",
  ].filter(Boolean);
  const labels = (dream.obstacleLabels ?? []).filter(Boolean);
  const obstacles = labels.map((label) => {
    const hits = thoughts.filter(
      (row) => row.obstacleId === label || row.text.toLowerCase().includes(label.toLowerCase()),
    );
    const series = weeks.map(
      (week) =>
        week.thoughts.filter(
          (row) => row.obstacleId === label || row.text.toLowerCase().includes(label.toLowerCase()),
        ).length,
    );
    const recent = series.slice(-2).reduce((sum, n) => sum + n, 0);
    const prior = series.slice(-4, -2).reduce((sum, n) => sum + n, 0);
    return {
      label,
      kind: obstacleKind(label, dream.id),
      hits,
      series,
      trend: recent > prior ? "up" : recent < prior ? "down" : "flat",
      total: series.reduce((sum, n) => sum + n, 0),
    };
  });
  const doing = items.filter((item) => item.status === "doing");
  const stuck = doing
    .filter((item) => Date.now() - Date.parse(item.lastTouchedAt) >= 14 * 86400000)
    .sort((a, b) => Date.parse(a.lastTouchedAt) - Date.parse(b.lastTouchedAt))[0];
  const overdue = items.find((item) => item.due && item.status !== "done" && Date.parse(item.due) < Date.now());
  const waiting = items.find(
    (item) => item.status === "waiting" && Date.now() - Date.parse(item.lastTouchedAt) >= 14 * 86400000,
  );
  const needs: NeedCard[] = [
    stuck
      ? {
          key: `stuck:${stuck.id}`,
          kind: "Stuck",
          title: `${Math.round((Date.now() - Date.parse(stuck.lastTouchedAt)) / 86400000)} days on “${stuck.title}”`,
          body: "Things that stall this long are usually too big.",
          item: stuck,
        }
      : null,
    thoughts.length >= 5
      ? {
          key: `talk:${dream.id}`,
          kind: "Talk vs action",
          title: `${thoughts.length} thoughts, 0 minutes`,
          body: `${dream.title} came up ${thoughts.length} times but got 0 minutes of focus.`,
          item: null,
        }
      : null,
    overdue
      ? {
          key: `overdue:${overdue.id}`,
          kind: "Overdue",
          title: "1 overdue",
          body: `“${overdue.title}” was due ${new Date(overdue.due!).toLocaleDateString()}.`,
          item: overdue,
        }
      : null,
    waiting
      ? {
          key: `waiting:${waiting.id}`,
          kind: "Waiting",
          title: `Waiting on ${waiting.waitingOn || "someone"}`,
          body: `“${waiting.title}”`,
          item: waiting,
        }
      : null,
  ].filter((card): card is NeedCard => Boolean(card) && !dismissed(card!.key)).slice(0, 3);
  const quiet = longestQuiet(items, start);
  const quietThoughts = thoughts.filter((row) => Date.parse(row.createdAt) >= quiet.from).length;
  const doneCount = items.filter((item) => item.completedAt && inRange(item.completedAt, start)).length;
  const wins = [
    ...items
      .filter((item) => item.status === "done" && item.completedAt && inRange(item.completedAt, start))
      .slice(0, 5)
      .map((item) => `✓ ${item.title} · ${new Date(item.completedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`),
    ...thoughts.filter((row) => row.kind === "win").map((row) => `✓ ${row.text}`),
  ].slice(0, 5);
  const hash = textHash(
    JSON.stringify({
      thoughts: thoughts.map((row) => [row.id, row.createdAt]),
      items: items.map((item) => [item.id, item.updatedAt]),
      checkins: checkins.map((row) => row.id),
      sources,
      range,
    }),
  );
  return {
    weeks,
    availableSources: available,
    newSince,
    hash,
    basis: basisBits.length ? `from ${basisBits.join(", ")}` : "from this life area",
    obstacles,
    needs,
    quiet: quiet.days >= 14 ? quiet : null,
    summary:
      quietThoughts >= 5
        ? `You've added ${quietThoughts} thoughts about ${dream.title} since the last thing you finished, ${quiet.days} days ago.`
        : `${doneCount} ${doneCount === 1 ? "item" : "items"} done in this period.`,
    wins,
    mood: weeks.map((week) => week.thoughts.reduce((sum, row) => sum + kindScore(row.kind), 0)),
    focusBars: store.dreams.slice(0, 6).map((area) => ({
      title: area.title,
      mine: area.id === dream.id,
    })),
    valueLine: loadIdeateValuesStore().values[0]?.text
      ? `${loadIdeateValuesStore().values[0]!.text} is your #1 value.`
      : "",
    prompt: {
      dream: dream.dreamText,
      obstacles: labels,
      thoughts: thoughts.slice(0, 5).map((row) => ({ text: row.text, type: row.kind, date: row.createdAt })),
      doing: doing.map((item) => item.title),
    },
    itemTitle: (id: string) => items.find((item) => item.id === id)?.title || "an item",
    points:
      thoughts.length +
      checkins.length +
      items.filter((item) => item.updatedAt >= start.toISOString() || (item.completedAt && inRange(item.completedAt, start))).length,
  };
}

function longestQuiet(items: TrackerItem[], start: Date): { days: number; from: number } {
  const dones = items
    .map((item) => Date.parse(item.completedAt || ""))
    .filter((at) => Number.isFinite(at) && at >= start.getTime())
    .sort((a, b) => a - b);
  const marks = [start.getTime(), ...dones, Date.now()];
  let best = { days: 0, from: start.getTime() };
  for (let i = 1; i < marks.length; i += 1) {
    const days = Math.round((marks[i]! - marks[i - 1]!) / 86400000);
    if (days > best.days) best = { days, from: marks[i - 1]! };
  }
  return best;
}

function kindScore(kind: ThoughtKind | undefined): number {
  if (kind === "win" || kind === "intention" || kind === "progress") return 1;
  if (kind === "hard_blocker" || kind === "resistance") return -1;
  return 0;
}

export function LifeAreaInsights({
  dream,
  onPatch,
  onRefresh,
  onCheckIn,
}: {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
  onCheckIn: () => void;
}) {
  const navigate = useNavigate();
  const [range, setRange] = useState<InsightRange>("8w");
  const [sources, setSources] = useState<Record<SourceId, boolean>>({
    tracker: true,
    thoughts: true,
    focus: true,
    meditations: true,
    checkins: true,
  });
  const [reading, setReading] = useState(false);
  const [tick, setTick] = useState(0);
  getJournalSignals(dream.id, range);
  const model = useMemo(
    () => buildModel(dream, range, sources),
    [dream, range, sources, tick],
  );
  const cached = readCachedInsight(dream.id, range);
  const stale = Boolean(cached && cached.inputsHash !== model.hash);

  async function refreshRead() {
    if (model.prompt.thoughts.length + model.prompt.doing.length < 3 && !cached) {
      /* still allow an explicit refresh once there is something to read */
    }
    const today = new Date().toISOString().slice(0, 10);
    const rate = readMap<number>(RATE_KEY);
    const rateKey = `${dream.id}:${today}`;
    if ((rate[rateKey] ?? 0) >= 10) return;
    setReading(true);
    try {
      const raw = await streamPlanCoachReply(
        [
          {
            role: "user",
            content: `Reply JSON only: {"text":"at most 2 sentences and 40 words","move":"at most 14 words","matchItemId":null}. No asterisks.\n${JSON.stringify(model.prompt)}`,
          },
        ],
        () => undefined,
      );
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = match
        ? (JSON.parse(match[0]) as { text?: string; move?: string; matchItemId?: string | null })
        : {};
      const text = (parsed.text || "Keep going with the thing already in motion.").replace(/\*/g, "").split(/\s+/).slice(0, 40).join(" ");
      const move = (parsed.move || "Pick the next small piece and start it.").split(/\s+/).slice(0, 14).join(" ");
      const next: CachedRead = {
        areaId: dream.id,
        range,
        inputsHash: model.hash,
        text,
        move,
        matchItemId: parsed.matchItemId ?? null,
        createdAt: new Date().toISOString(),
      };
      const map = readMap<CachedRead>(READ_KEY);
      map[`${dream.id}:${range}`] = next;
      writeMap(READ_KEY, map);
      rate[rateKey] = (rate[rateKey] ?? 0) + 1;
      writeMap(RATE_KEY, rate);
      setTick((value) => value + 1);
    } finally {
      setReading(false);
    }
  }

  const enough = model.points >= 3;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-[34px] rounded-full border border-border bg-card p-0.5 text-[13px]">
          {RANGES.map((id) => (
            <button
              key={id}
              type="button"
              className={`h-[30px] rounded-full px-3 ${range === id ? "bg-foreground text-white" : ""}`}
              onClick={() => setRange(id)}
            >
              {RANGE_LABEL[id]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {model.availableSources.map((id) => (
            <button
              key={id}
              type="button"
              className={`h-8 shrink-0 rounded-full border px-3 text-[13px] ${sources[id] ? "border-accent/40 bg-accent-soft text-accent-link" : "border-border"}`}
              onClick={() => setSources((current) => ({ ...current, [id]: !current[id] }))}
            >
              {SOURCE_LABEL[id]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {stale ? (
            <span className="text-xs text-muted">
              <span className="mr-1 inline-block size-[7px] rounded-full bg-accent" />
              {model.newSince} new since this read
            </span>
          ) : null}
          <button type="button" className={`${OUTLINE} h-9 px-3 text-sm`} disabled={reading || !enough} onClick={() => void refreshRead()}>
            {reading ? "Reading…" : "Refresh"}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-border border-l-[3px] border-l-accent bg-card p-4">
        <p className={AREA_LABEL}>The read</p>
        {cached ? (
          <>
            <p className="mt-1 text-xs text-muted">{model.basis}</p>
            <p className="mt-2 font-display text-[22px] italic leading-snug">{cached.text}</p>
            <div className="mt-3 rounded-xl border border-accent/40 bg-accent-soft p-3">
              <p className={AREA_LABEL}>Smallest next move</p>
              <p className="text-[15px] font-semibold">{cached.move}</p>
              {cached.matchItemId ? <p className="text-xs text-muted">Matches “{model.itemTitle(cached.matchItemId)}”</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {cached.matchItemId ? (
                  <button
                    type="button"
                    className={`${OUTLINE} h-9 px-3 text-sm`}
                    onClick={() => {
                      commitTracker((store) => patchTrackerItem(store, cached.matchItemId!, { status: "doing" }));
                      onRefresh();
                    }}
                  >
                    Mark Doing
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${OUTLINE} h-9 px-3 text-sm`}
                    onClick={() => {
                      commitTracker((store) => addTrackerItem(store, { lifeAreaId: dream.id, parentId: null, title: cached.move }).store);
                      onRefresh();
                    }}
                  >
                    Add as item
                  </button>
                )}
                <button
                  type="button"
                  className={`${MIST} h-9 px-3 text-sm`}
                  onClick={() =>
                    navigate(queueTrackerFocus([{ id: cached.matchItemId || `move_${dream.id}`, title: cached.move, lifeAreaId: dream.id }], 15))
                  }
                >
                  Focus 15 min
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-2">
            <p className="font-display text-[22px] italic">Not much to go on yet. Add a few thoughts or mark what you're Doing, and this fills in.</p>
            <button type="button" className={`${MIST} mt-3 h-10 px-4 text-sm`} onClick={onCheckIn}>Check in</button>
          </div>
        )}
      </section>

      <WeekStrip dream={dream} weeks={model.weeks} quiet={model.quiet} summary={model.summary} />
      <NeedsYou dream={dream} cards={model.needs} onRefresh={onRefresh} onChange={() => setTick((n) => n + 1)} />
      <div className="grid items-start gap-4 md:grid-cols-[2fr_1fr]">
        <Obstacles dream={dream} rows={model.obstacles} onPatch={onPatch} onChange={() => setTick((n) => n + 1)} />
        <div className="flex flex-col gap-4">
          <Mood dream={dream} points={model.mood} />
          <Wins dream={dream} wins={model.wins} bars={model.focusBars} valueLine={model.valueLine} />
        </div>
      </div>
    </div>
  );
}

function WeekStrip({
  dream,
  weeks,
  quiet,
  summary,
}: {
  dream: PlanDream;
  weeks: WeekCol[];
  quiet: { days: number } | null;
  summary: string;
}) {
  return (
    <section className="overflow-x-auto rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl">{dream.title}, week by week</h2>
        <p className="text-xs text-muted">each dot is one thought, item or play</p>
      </div>
      <div className="mt-3 grid min-w-[640px]" style={{ gridTemplateColumns: `104px repeat(${weeks.length}, minmax(0, 1fr))` }}>
        <span />
        {weeks.map((week) => (
          <span key={week.key} className="text-center text-[11px] text-muted">{week.label}</span>
        ))}
        <span className="flex h-8 items-center text-xs text-muted">Items done</span>
        {weeks.map((week) => (
          <span key={`${week.key}-done`} className="flex h-8 items-center justify-center gap-0.5">
            {Array.from({ length: Math.min(5, week.done) }).map((_, i) => (
              <span key={i} className="size-2.5 rounded-full bg-accent" />
            ))}
          </span>
        ))}
        <span className="flex h-8 items-center text-xs text-muted">Thoughts</span>
        {weeks.map((week) => (
          <span key={`${week.key}-thoughts`} className="flex h-8 items-center justify-center gap-0.5">
            {week.thoughts.slice(0, 5).map((row) => (
              <span key={row.id} className="size-2.5 rounded-full bg-foreground/70" />
            ))}
          </span>
        ))}
        <span className="flex h-8 items-center text-xs text-muted">Check-ins</span>
        {weeks.map((week) => (
          <span key={`${week.key}-check`} className="flex h-8 items-center justify-center gap-0.5">
            {Array.from({ length: Math.min(5, week.checkins) }).map((_, i) => (
              <span key={i} className="size-2.5 rounded-full bg-[var(--success)]" />
            ))}
          </span>
        ))}
      </div>
      {quiet ? (
        <p className="mt-3 inline-flex rounded-full border border-dashed border-accent/50 bg-accent-soft px-2 py-1 text-xs">{quiet.days} days, nothing done</p>
      ) : null}
      <p className="mt-2 text-[13px]">{summary}</p>
    </section>
  );
}

function NeedsYou({
  dream,
  cards,
  onRefresh,
  onChange,
}: {
  dream: PlanDream;
  cards: NeedCard[];
  onRefresh: () => void;
  onChange: () => void;
}) {
  const navigate = useNavigate();
  if (cards.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <p className={AREA_LABEL}>Needs you</p>
        <p className="text-xs text-muted">{cards.length} {cards.length === 1 ? "thing" : "things"} · each goes away once you act or dismiss it</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.key} className="flex flex-col rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">{card.kind}</p>
            <h3 className="mt-1 font-display text-[19px]">{card.title}</h3>
            <p className="mt-2 flex-1 text-[13px]">{card.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {card.kind === "Stuck" && card.item ? (
                <>
                  <button type="button" className={`${MIST} h-9 px-3 text-sm`} onClick={() => void breakDown(dream, card.item!, onRefresh)}>✦ Break it down</button>
                  <button type="button" className={`${OUTLINE} h-9 px-3 text-sm`} onClick={() => { commitTracker((store) => patchTrackerItem(store, card.item!.id, { status: null })); onRefresh(); }}>Not Doing</button>
                </>
              ) : null}
              {card.kind === "Talk vs action" ? (
                <>
                  <button type="button" className={`${MIST} h-9 px-3 text-sm`} onClick={() => navigate(`/manifest/goal/${encodeURIComponent(dream.id)}/tracker`)}>Start 30 min</button>
                  <button type="button" className={`${OUTLINE} h-9 px-3 text-sm`} onClick={() => { dismiss(card.key); onChange(); }}>Dismiss</button>
                </>
              ) : null}
              {card.kind === "Overdue" && card.item ? (
                <>
                  <button type="button" className={`${OUTLINE} h-9 px-3 text-sm`} onClick={() => { commitTracker((store) => patchTrackerItem(store, card.item!.id, { status: "done" })); onRefresh(); }}>Mark done</button>
                </>
              ) : null}
              {card.kind === "Waiting" && card.item ? (
                <button type="button" className={`${OUTLINE} h-9 px-3 text-sm`} onClick={() => { commitTracker((store) => patchTrackerItem(store, card.item!.id, { status: null, waitingOn: null })); onRefresh(); }}>Clear Waiting</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

async function breakDown(dream: PlanDream, item: TrackerItem, onRefresh: () => void) {
  const raw = await streamPlanCoachReply(
    [{ role: "user", content: `Suggest 4 smaller child items for “${item.title}”. One per line.` }],
    () => undefined,
  );
  const lines = raw.split("\n").map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 5);
  if (!lines.length || !window.confirm(`Add these under “${item.title}”?\n\n${lines.join("\n")}`)) return;
  commitTracker((store) => {
    let next = store;
    for (const title of lines) next = addTrackerItem(next, { lifeAreaId: dream.id, parentId: item.id, title }).store;
    return next;
  });
  onRefresh();
}

function Obstacles({
  dream,
  rows,
  onPatch,
  onChange,
}: {
  dream: PlanDream;
  rows: { label: string; kind: ObstacleKind; trend: string; total: number; hits: DrvTimelineEntry[] }[];
  onPatch: (partial: Partial<PlanDream>) => void;
  onChange: () => void;
}) {
  const rising = [...rows].sort((a, b) => b.total - a.total)[0];
  const hidden = readMap<string[]>(HIDE_KEY)[dream.id] ?? [];
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-xl">What's in the way</h2>
      <p className="text-xs text-muted">from your vision, thoughts, tracker, focus and Heal</p>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-muted">Named in your vision</p>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[74px_minmax(0,1fr)_72px] items-center gap-2 border-t border-border py-2">
          <button
            type="button"
            className="text-left text-[11px] font-semibold capitalize"
            onClick={() => {
              const kinds: ObstacleKind[] = ["inner", "practical", "people", "time", "heavy"];
              const next = kinds[(kinds.indexOf(row.kind) + 1) % kinds.length]!;
              setObstacleKind(dream.id, row.label, next);
              onChange();
            }}
          >
            {row.kind}
          </button>
          <div>
            <p className="text-sm font-semibold">{row.label}</p>
            <p className="line-clamp-2 text-xs text-muted">{row.hits[0]?.text || "fewer mentions lately"}</p>
            <HealObstacleNote
              dreamId={dream.id}
              label={row.label}
              text={(dream.healObstacleAnswers ?? []).find((answer) => answer.label === row.label)?.text}
              healItemId={(dream.healObstacleAnswers ?? []).find((answer) => answer.label === row.label)?.healItemId}
            />
          </div>
          <span className="text-right text-xs">{row.trend === "up" ? "↑" : row.trend === "down" ? "↓" : "→"} ×{row.total}</span>
        </div>
      ))}
      {rising && !hidden.includes(rising.label) ? (
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-accent-link"
          onClick={() =>
            onPatch({
              ifThenPlans: [
                ...(dream.ifThenPlans ?? []),
                {
                  id: `plan_${Date.now()}`,
                  obstacle: rising.label,
                  plan: `If ${rising.label.toLowerCase()} shows up, then I do the next small piece anyway.`,
                  kept: false,
                },
              ],
            })
          }
        >
          Make an if-then plan for {rising.label} →
        </button>
      ) : null}
    </section>
  );
}

function Mood({ dream, points }: { dream: PlanDream; points: number[] }) {
  if (points.filter((point) => point !== 0).length < 3) return null;
  const max = Math.max(1, ...points.map((point) => Math.abs(point)));
  const hopeful = points[points.length - 1]! > points[0]! ? "Lifting this month" : points[points.length - 1]! < points[0]! ? "Dipping this month" : "Steady";
  const best = areaThoughts(dream).find((row) => row.kind === "win");
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-xl">How it feels</h2>
      <svg viewBox="0 0 240 80" className="mt-2 h-20 w-full text-accent">
        <line x1="0" y1="40" x2="240" y2="40" stroke="currentColor" strokeDasharray="3 3" opacity="0.35" />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          points={points.map((point, index) => `${(index / Math.max(1, points.length - 1)) * 240},${40 - (point / max) * 30}`).join(" ")}
        />
      </svg>
      <p className="text-center text-xs text-muted">Low · {hopeful} · Hopeful</p>
      {best ? <p className="mt-2 rounded-xl bg-background p-2 font-display text-sm italic">“{best.text}”</p> : null}
    </section>
  );
}

function Wins({
  dream,
  wins,
  bars,
  valueLine,
}: {
  dream: PlanDream;
  wins: string[];
  bars: { title: string; mine: boolean }[];
  valueLine: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-xl">Wins and focus</h2>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {wins.map((win) => <li key={win}>{win}</li>)}
      </ul>
      <p className="mt-3 text-xs text-muted">Where your focus went</p>
      {bars.map((bar) => (
        <div key={bar.title} className="mt-1 flex items-center gap-2 text-xs">
          <span className={`h-2 flex-1 rounded-full ${bar.mine ? "bg-accent" : "bg-accent/30"}`} />
          <span className="w-24 truncate">{bar.title}</span>
        </div>
      ))}
      {valueLine ? <p className="mt-2 text-xs">{valueLine} {dream.title} is where that can show up.</p> : null}
      <button
        type="button"
        className={`${OUTLINE} mt-3 h-9 px-3 text-sm`}
        onClick={() => {
          const href = startLifeAreaMeditation(dream.id, undefined, { source: "plan", brief: wins[0] || dream.title });
          if (href) window.location.assign(href);
        }}
      >
        ✦ Meditation for a win
      </button>
    </section>
  );
}
