import {
  BookOpen,
  CirclePlay,
  LayoutGrid,
  MessageSquare,
  Presentation,
  Sparkles,
  Target,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { VoiceCheckIn } from "@/components/plan/life-area/checkin";
import { LifeAreaTracker, trackerOpenCount } from "@/components/plan/life-area/tracker";
import { LifeAreaInsights } from "@/components/plan/life-area/insights";
import { areaThoughts } from "@/components/plan/life-area/kit";
import { LifeAreaJournal } from "@/components/plan/life-area/journal";
import {
  ensureMeditationOrigins,
  journalRowsForLifeArea,
  subscribeJournalEntries,
  subscribeMeditationOrigins,
} from "@/lib/journal-links";
import { lifeAreaLastSeen, markLifeAreaSeen } from "@/lib/life-area-visits";
import { LifeAreaOverview } from "@/components/plan/life-area/overview";
import { RaiseSideFrame } from "@/components/plan/raise-ceiling-panel";
import { LifeAreaThoughts } from "@/components/plan/life-area/thoughts";
import { LifeAreaWhiteboard } from "@/components/plan/life-area/whiteboard";
import { WhiteboardBackChip } from "@/components/plan/life-area/whiteboard-return";
import { PlanLifeAreaMeditationsPanel } from "@/components/plan/plan-life-area-meditations-panel";
import type { PlanDream } from "@/lib/plan-dreams";
import { listLibraryMeditations } from "@/lib/medimade-api";
import { useMvpFlags } from "@/lib/mvp-flags";
import { lifeAreaHref } from "@/lib/entity-href";
import {
  ensureTracker,
  findTrackerByPathSlug,
  itemsForArea,
  trackerPathSlug,
} from "@/lib/tracker-items";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { looksLikeUuid } from "@/lib/readable-url";

const TABS = [
  "overview",
  "tracker",
  "thoughts",
  "insights",
  "journal",
  "meditations",
  "whiteboard",
] as const;

type TabId = (typeof TABS)[number];

const LEGACY: Record<string, TabId> = {
  vision: "overview",
  reflect: "overview",
  steps: "tracker",
  thoughts: "thoughts",
  insights: "insights",
  meditations: "meditations",
  journal: "journal",
  whiteboard: "whiteboard",
  overview: "overview",
  goals: "tracker",
  tracker: "tracker",
};

type Props = {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
};

export function LifeAreaShell({
  dream,
  onPatch,
  onRefresh,
}: Props) {
  const navigate = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const [checkIn, setCheckIn] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(
    null,
  );
  const [meditations, setMeditations] = useState(0);
  const [journalCount, setJournalCount] = useState(0);
  const nestedItemParam =
    params.itemSlug || params.itemId || params.goalSlug || params.goalId;
  const tab = resolveTab(
    params.tab,
    params.goalId || params.goalSlug,
    params.itemId || params.itemSlug,
    search.get("tab"),
  );
  const mvp = useMvpFlags();
  const tabs = TABS.filter((id) => {
    if (id === "insights") return mvp.manifestInsights;
    if (id === "whiteboard") return mvp.whiteboard;
    return true;
  });
  const nestedRaw = nestedItemParam
    ? decodeURIComponent(String(nestedItemParam))
    : null;
  const resolvedTracker = nestedRaw
    ? findTrackerByPathSlug(
        itemsForArea(ensureTracker(loadIdeateStore()), dream.id),
        nestedRaw,
      )
    : null;
  const itemId = resolvedTracker?.id ?? null;
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const base = lifeAreaHref(dream);

  useEffect(() => {
    if (!resolvedTracker || !nestedRaw) return;
    const canonical = trackerPathSlug(resolvedTracker);
    if (
      nestedRaw !== canonical &&
      (looksLikeUuid(nestedRaw) ||
        nestedRaw.startsWith("item_") ||
        nestedRaw.startsWith("todo_") ||
        nestedRaw === resolvedTracker.id)
    ) {
      navigate(
        lifeAreaHref(
          dream,
          `tracker/${encodeURIComponent(canonical)}`,
        ),
        { replace: true },
      );
    }
  }, [dream, navigate, nestedRaw, resolvedTracker]);

  useEffect(() => {
    const legacy = search.get("tab");
    if (legacy && !params.tab && !nestedItemParam) {
      const next = LEGACY[legacy] ?? "overview";
      const hidden =
        (next === "insights" && !mvp.manifestInsights) ||
        (next === "whiteboard" && !mvp.whiteboard);
      navigate(hidden || next === "overview" ? base : `${base}/${next}`, {
        replace: true,
      });
    }
  }, [
    base,
    mvp.manifestInsights,
    mvp.whiteboard,
    navigate,
    nestedItemParam,
    params.tab,
    search,
  ]);

  useEffect(() => {
    if (params.tab === "goals") {
      navigate(`${base}/tracker`, { replace: true });
      return;
    }
    if (params.goalId || params.goalSlug) {
      const gid = String(params.goalId || params.goalSlug);
      const hit = findTrackerByPathSlug(
        itemsForArea(ensureTracker(loadIdeateStore()), dream.id),
        gid,
      );
      const slug = hit ? trackerPathSlug(hit) : gid;
      navigate(`${base}/tracker/${encodeURIComponent(slug)}`, { replace: true });
    }
  }, [base, dream.id, navigate, params.goalId, params.goalSlug, params.tab]);

  useEffect(() => {
    if (tab === "insights" && !mvp.manifestInsights) {
      navigate(base, { replace: true });
    } else if (tab === "whiteboard" && !mvp.whiteboard) {
      navigate(base, { replace: true });
    }
  }, [base, mvp.manifestInsights, mvp.whiteboard, navigate, tab]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tab]);

  useEffect(() => {
    let cancel = false;
    void listLibraryMeditations()
      .then((items) => {
        if (cancel) return;
        setMeditations(
          items.filter(
            (m) => !m.archived && !m.isDraft && m.lifeAreaId === dream.id,
          ).length,
        );
      })
      .catch(() => setMeditations(0));
    return () => {
      cancel = true;
    };
  }, [dream.id]);

  useEffect(() => {
    const sync = () => setJournalCount(journalRowsForLifeArea(dream.id).length);
    sync();
    const stopEntries = subscribeJournalEntries(sync);
    const stopOrigins = subscribeMeditationOrigins(sync);
    void ensureMeditationOrigins().then(sync);
    return () => {
      stopEntries();
      stopOrigins();
    };
  }, [dream.id]);

  const thoughtsSeen = lifeAreaLastSeen(dream.id, "thoughts");
  const insightsSeen = lifeAreaLastSeen(dream.id, "insights");
  const thoughtFeed = thoughtTimes(dream);
  const thoughtFresh =
    tab === "thoughts" || !thoughtsSeen
      ? 0
      : thoughtFeed.filter((at) => at > thoughtsSeen).length;
  const openItems = trackerOpenCount(dream.id);
  const latestInsight = (dream.insights ?? [])[0];
  const insightNew =
    tab !== "insights" &&
    ((latestInsight &&
      (!insightsSeen || latestInsight.createdAt > insightsSeen)) ||
      areaThoughts(dream).some(
        (row) =>
          (row.kind === "hard_blocker" || row.kind === "resistance") &&
          (!insightsSeen || row.createdAt > insightsSeen),
      ));

  useEffect(() => {
    if (tab === "thoughts") markLifeAreaSeen(dream.id, "thoughts");
    if (tab === "insights") markLifeAreaSeen(dream.id, "insights");
  }, [dream.id, tab]);

  function go(next: TabId) {
    navigate(next === "overview" ? base : `${base}/${next}`);
  }

  return (
    <RaiseSideFrame className="min-h-[calc(100vh-var(--app-header-h))] pb-28 sm:pb-10">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pt-4 sm:px-6">
        <div className="min-w-0">
          <LifeAreaTabTrack
            tabs={tabs}
            tab={tab}
            onSelect={go}
            activeRef={activeRef}
            goalBadge={openItems > 0 ? String(openItems) : null}
            goalProgress={false}
            goalAria={openItems > 0 ? `Tracker, ${openItems} open` : "Tracker"}
            thoughtFresh={thoughtFresh}
            thoughtTotal={thoughtFeed.length}
            insightNew={insightNew}
            meditations={meditations}
            journalCount={journalCount}
          />
        </div>
        <div className="pt-[18px]">
          {mvp.whiteboard && search.get("wb") === "1" && tab !== "whiteboard" ? (
            <WhiteboardBackChip areaId={dream.id} />
          ) : null}
          {tab === "overview" ? (
            <LifeAreaOverview
              dream={dream}
              onPatch={onPatch}
              onRefresh={onRefresh}
              onCheckIn={() => setCheckIn(true)}
            />
          ) : null}
          {tab === "tracker" ? (
            <LifeAreaTracker dream={dream} itemId={itemId} onRefresh={onRefresh} />
          ) : null}
          {tab === "thoughts" ? (
            <LifeAreaThoughts
              dream={dream}
              onPatch={onPatch}
              onRefresh={onRefresh}
            />
          ) : null}
          {tab === "insights" && mvp.manifestInsights ? (
            <LifeAreaInsights
              dream={dream}
              onPatch={onPatch}
              onRefresh={onRefresh}
              onCheckIn={() => setCheckIn(true)}
            />
          ) : null}
          {tab === "journal" ? <LifeAreaJournal dream={dream} /> : null}
          {tab === "meditations" ? (
            <PlanLifeAreaMeditationsPanel
              lifeAreaId={dream.id}
              lifeAreaTitle={dream.title}
            />
          ) : null}
          {tab === "whiteboard" && mvp.whiteboard ? (
            <LifeAreaWhiteboard
              dream={dream}
              onPatch={onPatch}
              onRefresh={onRefresh}
            />
          ) : null}
        </div>
      </div>
      {checkIn ? (
        <VoiceCheckIn
          dream={dream}
          onClose={() => setCheckIn(false)}
          onPatch={onPatch}
          onRefresh={onRefresh}
          onFilled={(text, undo) => setToast({ text, undo })}
        />
      ) : null}
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-[170] flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-sm text-background">
          <span>{toast.text}</span>
          <button type="button" className="font-semibold" onClick={() => setToast(null)}>
            See what changed
          </button>
          <button
            type="button"
            className="font-semibold"
            onClick={() => {
              toast.undo();
              setToast(null);
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </RaiseSideFrame>
  );
}

const TAB_ICON: Record<TabId, typeof LayoutGrid> = {
  overview: LayoutGrid,
  tracker: Target,
  thoughts: MessageSquare,
  insights: Sparkles,
  journal: BookOpen,
  meditations: CirclePlay,
  whiteboard: Presentation,
};

function LifeAreaTabTrack({
  tabs,
  tab,
  onSelect,
  activeRef,
  goalBadge,
  goalProgress,
  goalAria,
  thoughtFresh,
  thoughtTotal,
  insightNew,
  meditations,
  journalCount,
}: {
  tabs: readonly TabId[];
  tab: TabId;
  onSelect: (id: TabId) => void;
  activeRef: RefObject<HTMLButtonElement | null>;
  goalBadge: string | null;
  goalProgress: boolean;
  goalAria: string;
  thoughtFresh: number;
  thoughtTotal: number;
  insightNew: boolean;
  meditations: number;
  journalCount: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [fade, setFade] = useState({ left: false, right: false });
  const [reduce, setReduce] = useState(false);

  const measure = () => {
    const track = trackRef.current;
    const button = track?.querySelector<HTMLElement>("[data-active='true']");
    if (track && button) {
      setBox({
        x: button.offsetLeft,
        y: button.offsetTop,
        w: button.offsetWidth,
        h: button.offsetHeight,
      });
    }
    const scroller = scrollerRef.current;
    if (scroller) {
      setFade({
        left: scroller.scrollLeft > 8,
        right: scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 8,
      });
    }
  };

  useLayoutEffect(() => {
    measure();
  }, [tab, goalBadge, thoughtFresh, thoughtTotal, insightNew, meditations, journalCount]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(motion.matches);
    apply();
    motion.addEventListener("change", apply);
    const scroller = scrollerRef.current;
    scroller?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      motion.removeEventListener("change", apply);
      scroller?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="relative -mx-4 md:mx-0">
      <div
        ref={scrollerRef}
        className="overflow-x-auto px-4 [scrollbar-width:none] md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={trackRef}
          role="tablist"
          aria-label="Life area"
          className="relative inline-flex gap-0.5 rounded-full border border-border bg-card p-1 shadow-[0_2px_8px_rgba(15,27,45,0.04)]"
        >
          {box ? (
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 rounded-full bg-foreground shadow-[0_4px_12px_-4px_color-mix(in_srgb,var(--foreground)_45%,transparent)]"
              style={{
                width: box.w,
                height: box.h,
                transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
                transition: reduce
                  ? "none"
                  : "transform 250ms cubic-bezier(.22,1,.36,1), width 250ms cubic-bezier(.22,1,.36,1)",
              }}
            />
          ) : null}
          {tabs.map((id) => {
            const active = tab === id;
            const Icon = TAB_ICON[id];
            const label = id[0]!.toUpperCase() + id.slice(1);
            const aria =
              id === "tracker"
                ? goalAria
                : id === "thoughts" && thoughtFresh > 0
                  ? `Thoughts, ${thoughtFresh} new`
                  : id === "insights" && insightNew
                    ? "Insights, new"
                    : label;
            return (
              <button
                key={id}
                ref={active ? activeRef : undefined}
                type="button"
                role="tab"
                data-active={active ? "true" : "false"}
                aria-selected={active}
                aria-label={aria}
                onClick={() => onSelect(id)}
                className={`relative z-[1] inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold md:h-[38px] md:px-[11px] ${
                  active ? "text-white" : "text-foreground"
                }`}
              >
                <Icon className="size-[15px]" strokeWidth={1.8} />
                {label}
                <TabBadge
                  id={id}
                  active={active}
                  goalBadge={goalBadge}
                  goalProgress={goalProgress}
                  thoughtFresh={thoughtFresh}
                  thoughtTotal={thoughtTotal}
                  insightNew={insightNew}
                  meditations={meditations}
                  journalCount={journalCount}
                />
              </button>
            );
          })}
        </div>
      </div>
      {fade.left ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-6 bg-gradient-to-r from-background to-transparent"
        />
      ) : null}
      {fade.right ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-6 bg-gradient-to-l from-background to-transparent"
        />
      ) : null}
    </div>
  );
}

function TabBadge({
  id,
  active,
  goalBadge,
  goalProgress,
  thoughtFresh,
  thoughtTotal,
  insightNew,
  meditations,
  journalCount,
}: {
  id: TabId;
  active: boolean;
  goalBadge: string | null;
  goalProgress: boolean;
  thoughtFresh: number;
  thoughtTotal: number;
  insightNew: boolean;
  meditations: number;
  journalCount: number;
}) {
  if (id === "tracker" && goalBadge) {
    if (goalProgress) {
      return (
        <span
          className={`rounded-full px-[7px] py-0.5 text-[11px] font-semibold ${
            active ? "bg-white/[0.16] text-white" : "bg-accent-soft text-accent-link"
          }`}
        >
          {goalBadge}
        </span>
      );
    }
    return (
      <span className={`text-xs ${active ? "text-white/70" : "text-muted"}`}>
        {goalBadge}
      </span>
    );
  }
  if (id === "thoughts") {
    if (thoughtFresh > 0) {
      return (
        <span className="rounded-full bg-accent px-[7px] py-0.5 text-[11px] font-bold text-foreground">
          +{thoughtFresh}
        </span>
      );
    }
    if (thoughtTotal > 0) {
      return (
        <span className={`text-xs ${active ? "text-white/70" : "text-muted"}`}>
          {thoughtTotal}
        </span>
      );
    }
  }
  if (id === "insights" && insightNew) {
    return (
      <span
        className="size-[7px] rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
        aria-hidden
      />
    );
  }
  if (id === "meditations" && meditations > 0) {
    return (
      <span className={`text-xs ${active ? "text-white/70" : "text-muted"}`}>
        {meditations}
      </span>
    );
  }
  if (id === "journal" && journalCount > 0) {
    return (
      <span className={`text-xs ${active ? "text-white/70" : "text-muted"}`}>
        {journalCount}
      </span>
    );
  }
  return null;
}

function thoughtTimes(dream: import("@/lib/plan-dreams").PlanDream): string[] {
  return areaThoughts(dream).map((row) => row.createdAt);
}

function resolveTab(
  pathTab: string | undefined,
  goalId: string | undefined,
  itemId: string | undefined,
  queryTab: string | null,
): TabId {
  if (itemId || goalId) return "tracker";
  if (pathTab === "goals") return "tracker";
  if (pathTab && (TABS as readonly string[]).includes(pathTab)) {
    return pathTab as TabId;
  }
  if (queryTab && LEGACY[queryTab]) return LEGACY[queryTab]!;
  return "overview";
}
