import { Link } from "react-router-dom";
import { ChevronRight, Focus, Plus } from "lucide-react";
import { MeditateIcon } from "@/components/meditate-icon";
const CARD_CLASS =
  "life-area-card group/card relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-[#1a1820] shadow-[0_2px_12px_rgb(15_27_45_/_0.06)] transition-[transform,box-shadow] duration-150 dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]";

const CARD_BODY_CLASS =
  "relative z-[1] flex min-w-0 flex-1 flex-col gap-3.5 p-5";

const CARD_INTERACTIVE_CLASS =
  "hover:-translate-y-px hover:shadow-[0_8px_20px_rgb(15_27_45_/_0.12)] dark:hover:shadow-[0_8px_20px_rgba(0,0,0,0.45)]";

const PANEL_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link";

const PILL_CLASS =
  "relative z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-full font-semibold text-current transition-colors hover:bg-white/20";

export type LifeAreaCardGoal = {
  title: string;
  done: number;
  total: number;
  /** Next unchecked step; opens it. */
  next: { title: string; href: string } | null;
};

type LifeAreaCardProps =
  | {
      loading: true;
      creationIndex?: number;
    }
  | {
      loading?: false;
      href: string;
      title: string;
      snippet: string | null;
      /** Short date of the last activity, or "{n} wks quiet". */
      activity: { text: string; quiet: boolean } | null;
      /** Current goal; `null` shows the empty goal panel. */
      goal: LifeAreaCardGoal | null;
      /** Goals tab with a new goal started. */
      setGoalHref: string;
      /** Focus / Meditate for this area's current goal (goal only). */
      onFocus?: () => void;
      onMeditate?: () => void;
      creationIndex: number;
    };

/**
 * Life area tile on the Manifesto page. Pass `loading` to keep the same card
 * chrome while content slots pulse — layout stays aligned if card styles change.
 * The whole card opens the life area (stretched link); inner controls sit above it.
 */
export function LifeAreaCard(props: LifeAreaCardProps) {
  if (props.loading) {
    return (
      <div className={`${CARD_CLASS} min-h-[220px]`} aria-hidden>
        <div className="navy-paisley-plate" />
        <div className={CARD_BODY_CLASS}>
          <div className="h-7 w-[60%] animate-pulse rounded-sm bg-white/15" />
          <div className="h-3.5 w-full animate-pulse rounded-sm bg-white/10" />
          <div className="h-3.5 w-[85%] animate-pulse rounded-sm bg-white/10" />
          <div className="mt-auto h-16 w-full animate-pulse rounded-xl bg-white/10" />
        </div>
      </div>
    );
  }

  const {
    href,
    title,
    snippet,
    activity,
    goal,
    setGoalHref,
    onFocus,
    onMeditate,
  } = props;
  const name = title.trim() || "Untitled";
  const pct =
    goal && goal.total > 0
      ? Math.min(100, Math.round((goal.done / goal.total) * 100))
      : 0;

  return (
    <div className={`${CARD_CLASS} ${CARD_INTERACTIVE_CLASS}`}>
      <div className="navy-paisley-plate" aria-hidden />
      <div className={CARD_BODY_CLASS}>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2.5">
          <h3 className="min-w-0 font-display text-[26px] font-normal leading-[1.15]">
            <Link
              to={href}
              className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/60 focus-visible:after:outline-2"
            >
              {name}
            </Link>
          </h3>
          {activity ? (
            <span
              className={`shrink-0 whitespace-nowrap text-xs ${
                activity.quiet
                  ? "font-semibold text-accent-link"
                  : "text-white/60"
              }`}
            >
              {activity.text}
            </span>
          ) : null}
        </div>
        <p
          className={`line-clamp-3 text-sm leading-[1.5] text-white/75 ${
            snippet ? "" : "italic"
          }`}
        >
          {snippet ?? "Nothing written yet"}
        </p>
      </div>

      {goal ? (
        <>
          <div className="flex flex-col gap-[7px] rounded-xl bg-white/10 px-3.5 py-3">
            <span className={PANEL_LABEL_CLASS}>Current goal</span>
            <span className="text-sm font-semibold leading-[1.35]">
              {goal.title.trim() || "Untitled goal"}
            </span>
            {goal.total > 0 ? (
              <span className="flex items-center gap-2">
                <span
                  className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-white/15"
                  role="progressbar"
                  aria-label="Steps done"
                  aria-valuemin={0}
                  aria-valuemax={goal.total}
                  aria-valuenow={goal.done}
                >
                  <span
                    className="block h-full rounded-[3px] bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="shrink-0 text-xs text-white/70">
                  {goal.done} of {goal.total}
                </span>
              </span>
            ) : null}
            {goal.next ? (
              <Link
                to={goal.next.href}
                className="relative z-10 flex min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap text-[13px] font-semibold text-accent-link hover:underline"
              >
                <span className="min-w-0 truncate">
                  Next: {goal.next.title.trim() || "Untitled step"}
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0"
                  strokeWidth={1.8}
                />
              </Link>
            ) : null}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onFocus}
              className={`${PILL_CLASS} h-[30px] bg-white/14 px-[11px] text-xs`}
            >
              <Focus aria-hidden className="size-[13px]" strokeWidth={1.75} />
              Focus
            </button>
            <button
              type="button"
              onClick={onMeditate}
              className={`${PILL_CLASS} h-[30px] bg-white/14 px-[11px] text-xs`}
            >
              <MeditateIcon size={13} />
              Meditate
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-start gap-2 rounded-xl border-[1.5px] border-dashed border-white/25 bg-white/[0.08] px-3.5 py-3">
          <span className={PANEL_LABEL_CLASS}>Current goal</span>
          <span className="text-[13px] leading-[1.45] text-white/70">
            Nothing set yet. What would move {name} forward?
          </span>
          <Link
            to={setGoalHref}
            className={`${PILL_CLASS} mt-auto h-8 bg-white/14 px-[13px] text-[13px]`}
          >
            <Plus aria-hidden className="size-[13px]" strokeWidth={2} />
            Set a goal
          </Link>
        </div>
      )}
      </div>
    </div>
  );
}
