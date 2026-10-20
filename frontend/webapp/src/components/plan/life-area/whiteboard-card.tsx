import { ArrowUpRight, Play } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo-mark";
import { areaThoughts, ProgressBar } from "@/components/plan/life-area/kit";
import { ThoughtKindChip } from "@/components/plan/life-area/thoughts";
import { KindTag, StatusPill } from "@/components/plan/life-area/tracker";
import { readCachedInsight } from "@/components/plan/life-area/insights";
import {
  sourceCardTarget,
  type CardRef,
} from "@/components/plan/life-area/whiteboard-return";
import type { VisionBoardItem } from "@/lib/ideate-vision-board";
import type { LibraryMeditationItem } from "@/lib/medimade-api";
import type { PlanDream, ThoughtKind } from "@/lib/plan-dreams";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import {
  childrenOf,
  dueLabel,
  ensureTracker,
  itemsForArea,
  relativeTouched,
  rollup,
  type TrackerItem,
} from "@/lib/tracker-items";

const SHELL =
  "group relative box-border flex w-full flex-col gap-1.5 rounded-[14px] px-4 py-[14px] shadow-[0_2px_8px_rgba(15,27,45,0.06)]";
const LABEL =
  "text-[10.5px] font-bold uppercase tracking-[1.2px]";

export function SourceCard({
  dream,
  card,
  selected,
  coarse,
  outline,
  image,
  meditation,
  caption,
  onOpen,
  onTick,
  onPlay,
  onLongPress,
}: {
  dream: PlanDream;
  card: CardRef;
  selected?: boolean;
  coarse: boolean;
  outline: string;
  image?: VisionBoardItem | null;
  meditation?: LibraryMeditationItem | null;
  caption?: ReactNode;
  onOpen: () => void;
  onTick: (id: string) => void;
  onPlay: (id: string) => void;
  onLongPress: () => void;
}) {
  const target = sourceCardTarget(dream.id, card);
  const kind = card.refType || card.kind;
  const items = itemsForArea(ensureTracker(loadIdeateStore()), dream.id);
  const tracker =
    (kind === "item" || kind === "goal" || kind === "step") && card.refId
      ? items.find((item) => item.id === card.refId) ?? null
      : null;
  const thought =
    kind === "thought" && card.refId
      ? areaThoughts(dream).find((row) => row.id === card.refId) ?? null
      : null;

  return (
    <div
      className={`${shellClass(kind, outline)}`}
      onPointerDown={(event) => {
        if (!coarse) return;
        const node = event.currentTarget;
        const timer = window.setTimeout(() => onLongPress(), 500);
        const stop = () => window.clearTimeout(timer);
        node.addEventListener("pointerup", stop, { once: true });
        node.addEventListener("pointercancel", stop, { once: true });
        node.addEventListener("pointermove", stop, { once: true });
      }}
    >
      {target ? (
        <button
          type="button"
          title={`Open in ${target.place}`}
          aria-label={`Open in ${target.place}`}
          className={`nodrag nopan absolute right-1 top-1 z-10 grid place-items-center ${
            coarse ? "size-11" : "size-[26px]"
          } ${selected && coarse ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <span className="grid size-[26px] place-items-center rounded-lg border border-border bg-card text-foreground">
            <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
        </button>
      ) : null}
      <CardBody
        dream={dream}
        card={card}
        kind={kind}
        tracker={tracker}
        items={items}
        thoughtText={thought?.text || card.label}
        thoughtKind={thought?.kind ?? null}
        thoughtWhen={thought ? relativeTouched(thought.createdAt) : ""}
        image={image}
        meditation={meditation}
        caption={caption}
        onTick={onTick}
        onPlay={onPlay}
      />
    </div>
  );
}

function shellClass(kind: string, outline: string) {
  if (kind === "dream") return `${SHELL} border border-accent/50 bg-accent-soft ${outline}`;
  if (kind === "moment") return `${SHELL} border border-border border-l-4 border-l-accent bg-card ${outline}`;
  if (kind === "obstacle") return `${SHELL} border border-danger/30 bg-danger-soft ${outline}`;
  if (kind === "image") return `group relative overflow-hidden rounded-[14px] bg-card shadow-[0_2px_8px_rgba(15,27,45,0.06)] ${outline}`;
  if (kind === "item" || kind === "goal" || kind === "step") {
    return `${SHELL} border border-border border-t-[3px] border-t-accent-button bg-card ${outline}`;
  }
  return `${SHELL} border border-border bg-card ${outline}`;
}

function CardBody({
  dream,
  card,
  kind,
  tracker,
  items,
  thoughtText,
  thoughtKind,
  thoughtWhen,
  image,
  meditation,
  caption,
  onTick,
  onPlay,
}: {
  dream: PlanDream;
  card: CardRef;
  kind: string;
  tracker: TrackerItem | null;
  items: TrackerItem[];
  thoughtText: string;
  thoughtKind: ThoughtKind | null;
  thoughtWhen: string;
  image?: VisionBoardItem | null;
  meditation?: LibraryMeditationItem | null;
  caption?: ReactNode;
  onTick: (id: string) => void;
  onPlay: (id: string) => void;
}) {
  if (kind === "dream") {
    return (
      <>
        <span className={`${LABEL} inline-flex items-center gap-1.5 text-accent-link`}>
          <LogoMark size={13} />
          Vision · Dream
        </span>
        <p className="font-display text-[18px] leading-snug text-foreground">
          {dream.dreamText.trim() || card.label}
        </p>
      </>
    );
  }
  if (kind === "moment") {
    return (
      <>
        <span className={`${LABEL} text-accent-link`}>Vision · Moment</span>
        <p className="font-display text-[16px] leading-snug text-foreground">
          {dream.visionText.trim() || card.label}
        </p>
      </>
    );
  }
  if (kind === "obstacle") {
    return (
      <>
        <span className={`${LABEL} text-danger`}>Vision · Obstacle</span>
        <p className="text-[15px] font-semibold text-foreground">{card.label}</p>
      </>
    );
  }
  if (kind === "plan") {
    return (
      <>
        <span className={`${LABEL} text-muted`}>Plan</span>
        <p className="text-[14px] leading-snug text-foreground">{card.label}</p>
      </>
    );
  }
  if ((kind === "item" || kind === "goal" || kind === "step") && tracker) {
    const kids = childrenOf(items, tracker.id);
    const parent = tracker.parentId ? items.find((item) => item.id === tracker.parentId) : null;
    if (kids.length > 0) {
      const stats = rollup(items, tracker.id);
      return (
        <>
          <span className="flex items-center gap-2 pr-8">
            <span className={`${LABEL} text-foreground`}>Tracker</span>
            <KindTag kind={tracker.kind} />
            <span className="ml-auto">
              <StatusPill item={tracker} />
            </span>
          </span>
          <p className="text-[15px] font-semibold text-foreground">{tracker.title || card.label}</p>
          {stats.leaves > 0 ? (
            <span>
              <ProgressBar done={stats.doneLeaves} total={stats.leaves} />
              <span className="text-[11px] text-muted">
                {stats.doneLeaves}/{stats.leaves}
              </span>
            </span>
          ) : null}
        </>
      );
    }
    const meta = [
      tracker.due ? `due ${dueLabel(tracker.due)}` : "",
      parent ? `in “${parent.title || "this item"}”` : "",
    ].filter(Boolean);
    return (
      <>
        <span className="flex items-center gap-2 pr-8">
          <span className={`${LABEL} text-foreground`}>Tracker</span>
          <KindTag kind={tracker.kind} />
        </span>
        <span className="flex items-start gap-2">
          <input
            type="checkbox"
            className="nodrag nopan mt-0.5 size-4 accent-[var(--accent)]"
            checked={tracker.status === "done"}
            aria-label={tracker.status === "done" ? "Mark not done" : "Mark done"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onTick(tracker.id)}
          />
          <span className="text-[14px] font-semibold text-foreground">{tracker.title || card.label}</span>
        </span>
        {meta.length ? <span className="pl-[26px] text-[11px] text-muted">{meta.join(" · ")}</span> : null}
      </>
    );
  }
  if (kind === "thought") {
    return (
      <>
        <p className="pr-6 text-[14px] leading-snug text-foreground">{thoughtText}</p>
        <span className="flex flex-wrap items-center gap-2">
          <ThoughtKindChip kind={thoughtKind} />
          <span className="text-[11px] text-muted">Thought{thoughtWhen ? ` · ${thoughtWhen}` : ""}</span>
        </span>
      </>
    );
  }
  if (kind === "meditation") {
    const cover = meditation?.coverImageUrl;
    const minutes = meditation?.durationSeconds
      ? `${Math.max(1, Math.round(meditation.durationSeconds / 60))} min`
      : "";
    return (
      <>
        <span className={`${LABEL} text-success`}>Meditation</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            className="nodrag nopan relative size-12 shrink-0 overflow-hidden rounded-[10px] bg-accent-soft"
            aria-label="Play"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (card.refId) onPlay(card.refId);
            }}
          >
            {cover ? <img src={cover} alt="" className="size-full object-cover" /> : null}
            <span className="absolute inset-0 grid place-items-center bg-foreground/25 text-white">
              <Play className="size-4 fill-white" aria-hidden />
            </span>
          </button>
          <span className="min-w-0">
            <span className="block font-display text-[15px] leading-snug text-foreground">
              {meditation?.title || card.label}
            </span>
            {minutes ? <span className="text-[11px] text-muted">{minutes}</span> : null}
          </span>
        </span>
      </>
    );
  }
  if (kind === "image") {
    return (
      <>
        {image?.imageUrl ? (
          <img src={image.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="grid h-40 place-items-center text-sm text-muted">Image</div>
        )}
        <div className="px-4 py-[14px] text-[13px] text-foreground">{caption}</div>
      </>
    );
  }
  if (kind === "insight") {
    const cached = card.refId === dream.id ? readCachedInsight(dream.id) : null;
    const when = cached?.createdAt ? relativeTouched(cached.createdAt) : "";
    return (
      <>
        <span className={`${LABEL} text-muted`}>Insight{when ? ` · ${when}` : ""}</span>
        <p className="text-[14px] leading-snug text-foreground">{cached?.text || card.label}</p>
      </>
    );
  }
  return <p className="text-[14px] text-foreground">{card.label}</p>;
}
