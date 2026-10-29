import { ChevronRight, Pin } from "lucide-react";
import { lifeAreaHref, lifeAreaTrackerItemHref } from "@/lib/entity-href";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { startLifeAreaMeditation } from "@/lib/life-area-card-actions";
import { DictationMicButton } from "@/components/dictation-mic-button";
import {
  THOUGHT_KIND_OPTIONS,
  newDreamId,
  thoughtKindLabel,
  type DrvTimelineEntry,
  type PlanDream,
  type ThoughtKind,
} from "@/lib/plan-dreams";
import { streamPlanCoachReply } from "@/lib/plan-claude";
import {
  AREA_LABEL,
  MIST,
  areaThoughts,
  formatShortDate,
  guessThoughtKind,
  thoughtSource,
} from "@/components/plan/life-area/kit";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { ensureTracker, itemsForArea, type TrackerItem } from "@/lib/tracker-items";
import { rememberTrackerDetail } from "@/components/plan/life-area/tracker";

export const THOUGHT_KIND_DOT: Record<ThoughtKind, string> = {
  win: "bg-emerald-600",
  hard_blocker: "bg-rose-600",
  resistance: "bg-amber-600",
  insight: "bg-sky-600",
  question: "bg-accent",
  intention: "bg-teal-600",
  progress: "bg-lime-700",
};

export function ThoughtKindChip({ kind }: { kind: ThoughtKind | null }) {
  if (!kind) return null;
  const label = thoughtKindLabel(kind);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-link">
      <span className={`size-1.5 rounded-full ${THOUGHT_KIND_DOT[kind]}`} />
      {label}
    </span>
  );
}

type Row = {
  id: string;
  text: string;
  createdAt: string;
  kind: ThoughtKind | null;
  journal?: { title: string; href: string };
  pinned?: boolean;
  compact?: { label: string; href: string };
};

type Props = {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
};

export function LifeAreaThoughts({ dream, onPatch, onRefresh }: Props) {
  const [search] = useSearchParams();
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState<ThoughtKind | null>(null);
  const [tagging, setTagging] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<ThoughtKind | "all">("all");
  const [hover, setHover] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  useEffect(() => {
    const id = search.get("thought");
    if (!id) return;
    setKindFilter("all");
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`thought-${id}`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("rounded-xl", "bg-accent-soft");
      window.setTimeout(() => el.classList.remove("rounded-xl", "bg-accent-soft"), 2200);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [search]);

  const mine: Row[] = areaThoughts(dream).map((e) => ({
    id: e.id,
    text: e.text,
    createdAt: e.createdAt,
    kind: e.kind ?? null,
    pinned: e.pinned,
  }));

  const rows = mine
    .filter((r) => kindFilter === "all" || r.kind === kindFilter)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const counts = new Map<ThoughtKind, number>();
  for (const row of mine) {
    if (row.kind) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }

  async function add(text: string) {
    const value = text.trim();
    if (!value) return;
    const id = newDreamId().replace(/^dream_/, "thought_");
    const entry: DrvTimelineEntry = {
      id,
      text: value,
      createdAt: new Date().toISOString(),
      coachReply: "",
      ...(tag ? { kind: tag } : {}),
    };
    onPatch({ dreamEntries: [...(dream.dreamEntries ?? []), entry] });
    setDraft("");
    setTag(null);
    const labels = (dream.obstacleLabels ?? []).filter(Boolean);
    setTagging(id);
    let settled = false;
    let timer = 0;
    const stop = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      setTagging((current) => (current === id ? null : current));
    };
    timer = window.setTimeout(() => {
      console.error("Thought tagging timed out");
      stop();
    }, 8000);
    try {
      const raw = await streamPlanCoachReply(
        [
          {
            role: "user",
            content: `Reply with JSON only: {"tag":"win|hard_blocker|resistance|insight|question|intention|progress","obstacle":null,"newObstacle":null}. obstacle is one of ${JSON.stringify(labels)} when the thought names it, else null. newObstacle is a 1-3 word noun only when it names a blocker that is not in that list.\n${value}`,
          },
        ],
        () => undefined,
      );
      if (settled) return;
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = match ? (JSON.parse(match[0]) as { tag?: string; obstacle?: string | null; newObstacle?: string | null }) : {};
      const found = THOUGHT_KIND_OPTIONS.find((o) => o.id === parsed.tag || raw.toLowerCase().includes(o.id));
      const kind = tag ?? found?.id ?? guessThoughtKind(value);
      const current = loadIdeateStore().dreams.find((d) => d.id === dream.id);
      if (!current) return;
      onPatch({
        dreamEntries: (current.dreamEntries ?? []).map((e) =>
          e.id === id
            ? {
                ...e,
                kind,
                ...(parsed.obstacle ? { obstacleId: parsed.obstacle } : {}),
                ...(parsed.newObstacle ? { newObstacleLabel: parsed.newObstacle } : {}),
              }
            : e,
        ),
      });
    } catch (error) {
      console.error("Thought tagging failed", error);
    } finally {
      stop();
    }
  }

  function updateEntry(id: string, partial: Partial<DrvTimelineEntry> | null) {
    const key = thoughtSource(dream, id);
    if (!key) return;
    const list = dream[key] ?? [];
    onPatch({
      [key]:
        partial == null
          ? list.filter((e) => e.id !== id)
          : list.map((e) => (e.id === id ? { ...e, ...partial } : e)),
    });
  }

  const pinned = mine.filter((r) => r.pinned).slice(0, 3);
  const themes = themeChips(mine);

  return (
    <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        <section className="rounded-2xl border border-border bg-card p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void add(draft);
              }
            }}
            rows={3}
            placeholder={`What's on your mind about ${dream.title.trim() || "this"}?`}
            className="w-full resize-none bg-transparent font-display text-lg text-foreground outline-none placeholder:text-muted"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted">Tag (or AI will)</span>
            {THOUGHT_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTag((v) => (v === opt.id ? null : opt.id))}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  tag === opt.id
                    ? "bg-accent-soft text-accent-link"
                    : "bg-background text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <DictationMicButton
              variant="inset"
              onTranscript={(spoken) =>
                setDraft((prev) => (prev ? `${prev} ${spoken}` : spoken))
              }
            />
            <button
              type="button"
              onClick={() => void add(draft)}
              className={`${MIST} ml-auto h-9 px-4 text-sm`}
            >
              Add
            </button>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              on={kindFilter === "all"}
              label={`All · ${mine.length}`}
              onClick={() => setKindFilter("all")}
            />
            {THOUGHT_KIND_OPTIONS.filter((o) => counts.get(o.id)).map((o) => (
              <FilterChip
                key={o.id}
                on={kindFilter === o.id}
                label={`${o.label} · ${counts.get(o.id)}`}
                dot={THOUGHT_KIND_DOT[o.id]}
                onClick={() => setKindFilter(o.id)}
              />
            ))}
          </div>
          <Feed
            rows={rows}
            tagging={tagging}
            hover={hover}
            menu={menu}
            dream={dream}
            setHover={setHover}
            setMenu={setMenu}
            onUpdate={updateEntry}
            onHideJournal={(id) =>
              onPatch({
                hiddenJournalIds: [...(dream.hiddenJournalIds ?? []), id],
              })
            }
          />
        </section>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:hidden">
          <ThemesCard chips={themes} />
          <PinnedCard rows={pinned} />
        </div>
      </div>
      <aside className="hidden flex-col gap-3.5 xl:flex">
        <ThemesCard chips={themes} />
        <PinnedCard rows={pinned} />
      </aside>
    </div>
  );
}

function themeChips(rows: Row[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (new Date(row.createdAt).getTime() < Date.now() - 30 * 86_400_000) continue;
    const words = row.text.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    for (const word of words.slice(0, 4)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
}

function FilterChip({
  on,
  label,
  dot,
  onClick,
}: {
  on: boolean;
  label: string;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        on ? "bg-accent-soft font-semibold text-accent-link" : "text-foreground"
      }`}
    >
      {dot ? <span className={`size-1.5 rounded-full ${dot}`} /> : null}
      {label}
    </button>
  );
}

function Feed({
  rows,
  tagging,
  hover,
  menu,
  dream,
  setHover,
  setMenu,
  onUpdate,
  onHideJournal,
}: {
  rows: Row[];
  tagging: string | null;
  hover: string | null;
  menu: string | null;
  dream: PlanDream;
  setHover: (id: string | null) => void;
  setMenu: (id: string | null) => void;
  onUpdate: (id: string, partial: Partial<DrvTimelineEntry> | null) => void;
  onHideJournal: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [tapped, setTapped] = useState<string | null>(null);
  const groups = new Map<string, Row[]>();
  const now = new Date();
  for (const row of rows) {
    const d = new Date(row.createdAt);
    const label =
      d.toDateString() === now.toDateString()
        ? "Today"
        : now.getTime() - d.getTime() < 7 * 86_400_000
          ? "This week"
          : d.toLocaleDateString(undefined, { month: "long" });
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }
  const linked = new Map<string, TrackerItem>();
  for (const item of itemsForArea(ensureTracker(loadIdeateStore()), dream.id)) {
    if (item.sourceThoughtId && !linked.has(item.sourceThoughtId)) linked.set(item.sourceThoughtId, item);
  }
  return (
    <div className="mt-4">
      {[...groups.entries()].map(([label, list]) => (
        <section key={label}>
          <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
            {label}
          </h3>
          <ul>
            {list.map((row) => (
              <li
                key={row.id}
                id={`thought-${row.id}`}
                onMouseEnter={() => setHover(row.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button, a")) return;
                  setTapped((id) => (id === row.id ? null : row.id));
                }}
                className={`relative flex gap-3 py-2.5 ${
                  hover === row.id || tapped === row.id
                    ? "rounded-xl bg-background px-2"
                    : ""
                } ${row.journal ? "border-l-2 border-accent/40 pl-3 italic" : ""} ${
                  row.compact ? "items-center border-t border-border" : ""
                }`}
              >
                {row.compact ? null : (
                <span className="w-[52px] shrink-0 text-xs text-muted">
                  {formatShortDate(row.createdAt)}
                </span>
                )}
                <span className="min-w-0 flex-1">
                  {row.compact ? (
                    <>
                      <span className="block text-[11px] font-semibold uppercase tracking-[1.2px] text-muted">
                        {row.compact.label}
                      </span>
                      <span className="block truncate font-display text-[15px] text-foreground">
                        {row.text}
                      </span>
                    </>
                  ) : null}
                  {row.compact ? null : (
                  <>
                  <span
                    className={`block text-[15px] ${
                      row.journal ? "font-display" : "text-foreground"
                    }`}
                  >
                    {row.journal ? `“${row.text}”` : row.text}
                  </span>
                  {row.kind ? (
                    <span className="mt-1 inline-flex">
                      <ThoughtKindChip kind={row.kind} />
                    </span>
                  ) : null}
                  {tagging === row.id ? (
                    <span className="ml-2 text-[11px] text-muted">Tagging…</span>
                  ) : null}
                  {linked.get(row.id) ? (
                    <Link
                      to={lifeAreaTrackerItemHref(dream, linked.get(row.id)!)}
                      onClick={() => rememberTrackerDetail(dream.id)}
                      className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted"
                    >
                      In Tracker
                      <ChevronRight className="size-3.5" />
                    </Link>
                  ) : null}
                  {row.journal ? (
                    <Link
                      to={row.journal.href}
                      className="mt-1 block text-xs font-semibold not-italic text-accent-link"
                    >
                      From journal · “{row.journal.title}”
                    </Link>
                  ) : null}
                  {(hover === row.id || tapped === row.id) && !row.journal ? (
                    <span className="mt-1 flex flex-wrap items-center gap-3 text-[13px] font-semibold text-accent-link">
                      <button
                        type="button"
                        onClick={() => {
                          const href = startLifeAreaMeditation(dream.id, undefined, {
                            source: "thought",
                            brief: row.text,
                          });
                          if (href) navigate(href);
                        }}
                      >
                        ✦ Create meditation
                      </button>
                      <button
                        type="button"
                        aria-label={row.pinned ? "Unpin" : "Pin"}
                        onClick={() => onUpdate(row.id, { pinned: !row.pinned })}
                      >
                        <Pin className="size-3.5" />
                      </button>
                    </span>
                  ) : null}
                  </>
                  )}
                </span>
                {row.compact ? (
                  <Link
                    to={row.compact.href}
                    className="shrink-0 text-[12px] font-semibold text-muted"
                  >
                    Open in Journal
                  </Link>
                ) : (
                <>
                <button
                  type="button"
                  aria-label="Thought actions"
                  className="text-muted"
                  onClick={() => setMenu(menu === row.id ? null : row.id)}
                >
                  ⋯
                </button>
                {menu === row.id ? (
                  <span className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-border bg-card py-1 text-sm shadow-lg">
                    {row.journal ? (
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left"
                        onClick={() => {
                          onHideJournal(row.id.replace(/^journal-/, ""));
                          setMenu(null);
                        }}
                      >
                        Hide from this area
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left"
                          onClick={() => {
                            const text = window.prompt("Edit thought", row.text);
                            if (text?.trim()) onUpdate(row.id, { text: text.trim() });
                            setMenu(null);
                          }}
                        >
                          Edit
                        </button>
                        {THOUGHT_KIND_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            className="block w-full px-3 py-1.5 text-left"
                            onClick={() => {
                              onUpdate(row.id, { kind: opt.id });
                              setMenu(null);
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left"
                          onClick={() => {
                            const item = linked.get(row.id);
                            if (item) {
                              rememberTrackerDetail(dream.id);
                              navigate(
                                lifeAreaTrackerItemHref(dream, item),
                              );
                            } else {
                              const params = new URLSearchParams({
                                fromThought: row.id,
                                addTitle: thoughtTrackerTitle(row.text),
                              });
                              navigate(
                                `${lifeAreaHref(dream, "tracker")}?${params.toString()}`,
                              );
                            }
                            setMenu(null);
                          }}
                        >
                          {linked.get(row.id) ? "Open in Tracker" : "Add to Tracker"}
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left"
                          onClick={() => {
                            onUpdate(row.id, null);
                            setMenu(null);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </span>
                ) : null}
                </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function thoughtTrackerTitle(text: string): string {
  const line = text.split(/\n/)[0]?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
}

function ThemesCard({ chips }: { chips: { label: string; count: number }[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className={AREA_LABEL}>Recurring themes</p>
      <p className="text-[11px] text-muted">last 30 days</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="rounded-full bg-accent-soft px-2 py-1 text-xs text-accent-link"
          >
            {chip.label} ×{chip.count}
          </span>
        ))}
        {chips.length === 0 ? (
          <p className="text-[13px] text-muted">Themes show up as thoughts repeat.</p>
        ) : null}
      </div>
    </section>
  );
}

function PinnedCard({ rows }: { rows: Row[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className={AREA_LABEL}>Pinned</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">Pin a thought to keep it here.</p>
      ) : (
        rows.map((row) => (
          <p key={row.id} className="mt-2 font-display text-[17px] text-foreground">
            {row.text}
            <span className="mt-1 block text-xs text-muted">
              {row.kind ? thoughtKindLabel(row.kind) : "Thought"} ·{" "}
              {formatShortDate(row.createdAt)}
            </span>
          </p>
        ))
      )}
    </section>
  );
}

