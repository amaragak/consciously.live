import { Link, useRouter } from "@/lib/spa-nav";
import { useEffect, useState } from "react";
import {
  DAILY_HABITS_CHANGED_EVENT,
  computeLocalDailyStatus,
  formatHabitDateLabel,
  localDateKey,
  setLocalManualCheck,
  type DailyHabitPillar,
  type DailyStatus,
} from "@/lib/daily-habits";
import {
  fetchDashboardDailyStatus,
  putDashboardDailyManualCheck,
} from "@/lib/medimade-api";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import {
  loadJournalStoreRaw,
  withoutDemoJournalEntries,
} from "@/lib/journal-storage";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import { queueTrackerFocus } from "@/lib/focus-ideate-link";
import { useDailyTodoPrefs } from "@/lib/daily-todos";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { SelectChevron } from "@/components/select-chevron";

/** @deprecated Inferred next step — replaced by TodayDoingStep. */
export type TodayGoalStep = {
  stepTitle: string;
  goalTitle: string;
  subtaskId: string;
};

/** Explicit Tracker Doing item for the Today checklist. */
export type TodayDoingStep = {
  title: string;
  lifeAreaTitle: string;
  itemId: string;
  lifeAreaId: string;
};

type Props = {
  /** Meditation suggested on the “Ready when you are” card. */
  readyMeditationTitle?: string | null;
  onPlayReadyMeditation?: (() => void) | null;
  /**
   * When a narrated Story exists, the fourth daily is “Listen to your story”.
   * Otherwise it is “Create your story” — always four checklist items.
   */
  storyAvailable?: boolean;
  storyMinutes?: number | null;
  onPlayStory?: (() => void) | null;
  /**
   * Explicit Doing items (most recent first). When empty, the life-area step
   * row is omitted — never infer a "Next step".
   */
  doingSteps?: TodayDoingStep[];
  /** @deprecated Prefer doingSteps. */
  goalStep?: TodayGoalStep | null;
  /** Tighter single-column layout for the mobile dashboard. */
  compact?: boolean;
  /** Checklist only, styled for the navy hero. */
  embedded?: boolean;
  onStats?: (stats: { partialStreak: number; doneCount: number; totalCount: number }) => void;
};

function emptyStatus(): DailyStatus {
  return {
    gratitude: false,
    meditation: false,
    lifeArea: false,
    story: false,
    journal: false,
    streak: 0,
    fullStreak: 0,
    partialStreak: 0,
    fullStreakRecord: 0,
    partialStreakRecord: 0,
  };
}

function localStatusNow(): DailyStatus {
  const entries = withoutDemoJournalEntries(loadJournalStoreRaw()).entries.filter(
    (e) => !e.id.startsWith("guest-journal-"),
  );
  const ideate = loadIdeateStore();
  return computeLocalDailyStatus(entries, ideate, localDateKey());
}

function mergeRemoteDailyStatus(
  remote: Pick<
    DailyStatus,
    | "gratitude"
    | "meditation"
    | "lifeArea"
    | "fullStreak"
    | "partialStreak"
    | "fullStreakRecord"
    | "partialStreakRecord"
  >,
  local: DailyStatus,
): DailyStatus {
  return {
    gratitude: remote.gratitude || local.gratitude,
    meditation: remote.meditation || local.meditation,
    lifeArea: remote.lifeArea || local.lifeArea,
    story: local.story,
    journal: local.journal,
    streak: remote.fullStreak,
    fullStreak: remote.fullStreak,
    partialStreak: remote.partialStreak,
    fullStreakRecord: remote.fullStreakRecord,
    partialStreakRecord: remote.partialStreakRecord,
  };
}

function HabitCheckbox({
  checked,
  onToggle,
  label,
  compact = false,
  onDark = false,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  compact?: boolean;
  onDark?: boolean;
}) {
  const size = compact || onDark ? "h-5 w-5 text-[11px]" : "h-5 w-5 text-[11px]";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={
        checked
          ? `flex ${size} shrink-0 items-center justify-center rounded-full font-semibold leading-none ${onDark ? "bg-[#F3EDE2] text-[#0F1B2D]" : "bg-gold text-on-accent"}`
          : `flex ${size} shrink-0 items-center justify-center rounded-full border-[1.5px] bg-transparent ${onDark ? "border-[rgba(243,237,226,0.4)]" : "border-[color-mix(in_srgb,var(--border)_100%,var(--muted))]"}`
      }
    >
      {checked ? "✓" : null}
    </button>
  );
}

/** Today card for the signed-in home dashboard (partial streak only). */
export function DailyHabitTracker({
  readyMeditationTitle = null,
  onPlayReadyMeditation = null,
  storyAvailable = false,
  storyMinutes = null,
  onPlayStory = null,
  doingSteps = [],
  goalStep = null,
  compact = false,
  embedded = false,
  onStats,
}: Props) {
  const router = useRouter();
  const todoPrefs = useDailyTodoPrefs();
  const [status, setStatus] = useState<DailyStatus>(emptyStatus);
  const [dateLabel, setDateLabel] = useState("");
  const dateKey = localDateKey();

  useEffect(() => {
    setDateLabel(formatHabitDateLabel(new Date()));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyLocal = () => {
      if (cancelled) return;
      setStatus(localStatusNow());
    };

    const refresh = () => {
      applyLocal();
      if (!isMedimadeSessionActive()) return;
      void fetchDashboardDailyStatus({ dateKey })
        .then((remote) => {
          if (cancelled) return;
          const local = localStatusNow();
          setStatus(mergeRemoteDailyStatus(remote, local));
        })
        .catch(() => {
          /* keep local */
        });
    };

    refresh();
    const unsubIdeate = subscribeIdeateCloud(refresh);
    window.addEventListener(DAILY_HABITS_CHANGED_EVENT, refresh);
    window.addEventListener("medimade-session-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      unsubIdeate();
      window.removeEventListener(DAILY_HABITS_CHANGED_EVENT, refresh);
      window.removeEventListener("medimade-session-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [dateKey]);


  const toggle = (pillar: DailyHabitPillar) => {
    const next = !status[pillar];
    setLocalManualCheck(pillar, next, dateKey);
    setStatus(localStatusNow());
    // Story and journal are local-only — the API only accepts the original three pillars.
    if (pillar === "story" || pillar === "journal" || !isMedimadeSessionActive()) return;
    void putDashboardDailyManualCheck({
      dateKey,
      pillar,
      checked: next,
    })
      .then(() =>
        fetchDashboardDailyStatus({ dateKey }).then((remote) => {
          const local = localStatusNow();
          setStatus({
            ...mergeRemoteDailyStatus(remote, local),
            [pillar]: next || remote[pillar] || local[pillar],
          });
        }),
      )
      .catch(() => {
        setStatus(localStatusNow());
      });
  };

  const streak = status.partialStreak;
  const streakLine = () =>
    streak > 0
      ? `${streak}-day streak · ${doneCount} of ${totalCount} done`
      : `${doneCount} of ${totalCount} done`;

  const shownDoing = doingSteps.slice(0, 2);
  const doingExtra = Math.max(0, doingSteps.length - shownDoing.length);
  // Comment out inferred next-step wording:
  // const lifeAreaName = goalStep ? "Next step on your goal" : "Make progress…";
  void goalStep;

  function openFocus(items: TodayDoingStep[] = doingSteps) {
    if (items.length === 0) {
      router.push("/focus");
      return;
    }
    router.push(
      queueTrackerFocus(
        items.map((row) => ({
          id: row.itemId,
          title: row.title,
          lifeAreaId: row.lifeAreaId,
        })),
      ),
    );
  }

  const allRows: {
    pillar: DailyHabitPillar;
    name: string;
    /** One-line title for the compact mobile hero row. */
    mobileName?: string;
    help: string | null;
    actionLabel: string;
    onAction: () => void;
    actionAsLink?: string;
    /** Extra Doing lines under the life-area row (2nd item + "+N more"). */
    doingExtraLines?: string[];
  }[] = [
    {
      pillar: "gratitude",
      name: "Add a gratitude",
      help: null,
      actionLabel: "Add →",
      onAction: () => {},
      actionAsLink: "/journal/gratitudes?new=1",
    },
    {
      pillar: "meditation",
      name: "Do a meditation",
      help: readyMeditationTitle
        ? `Try: ${readyMeditationTitle}`
        : "Listen to any meditation in your library — or create a new one",
      actionLabel: readyMeditationTitle && onPlayReadyMeditation ? "Play →" : "Open →",
      onAction: () => {
        if (readyMeditationTitle && onPlayReadyMeditation) {
          onPlayReadyMeditation();
          return;
        }
        router.push("/meditate/library/creations");
      },
    },
    storyAvailable
      ? {
          pillar: "story" as const,
          name: "Listen to your story",
          help:
            typeof storyMinutes === "number" && storyMinutes > 0
              ? `About ${storyMinutes} min`
              : "Your narrated story",
          actionLabel: onPlayStory ? "Listen →" : "Open →",
          onAction: () => {
            if (onPlayStory) {
              onPlayStory();
              return;
            }
            router.push("/manifest/story?tab=narration");
          },
        }
      : {
          pillar: "story" as const,
          name: "Create your story",
          help: "Write the story of who you’re becoming",
          actionLabel: "Write →",
          onAction: () => {},
          actionAsLink: "/manifest/story",
        },
    {
      pillar: "journal",
      name: "Write a journal entry",
      help: null,
      actionLabel: "Write →",
      onAction: () => {},
      actionAsLink: "/journal?new=1",
    },
    ...(shownDoing.length > 0
      ? [
          {
            pillar: "lifeArea" as const,
            name: `Doing: ${shownDoing[0]!.title}`,
            mobileName: `Doing: ${shownDoing[0]!.title}`,
            help:
              shownDoing.length === 1
                ? shownDoing[0]!.lifeAreaTitle
                : `${shownDoing[0]!.lifeAreaTitle}${
                    shownDoing[1]
                      ? ` · also ${shownDoing[1].title}`
                      : ""
                  }${doingExtra > 0 ? ` · +${doingExtra} more` : ""}`,
            actionLabel: "Focus →",
            onAction: () => openFocus(),
            doingExtraLines: [
              ...(shownDoing[1]
                ? [`Doing: ${shownDoing[1].title}`]
                : []),
              ...(doingExtra > 0 ? [`+${doingExtra} more`] : []),
            ],
          },
        ]
      : // No Doing marked → no step row at all (never infer "Next step").
        []),
  ];
  // Settings › Daily to-dos. Order follows `allRows`.
  const rows = allRows.filter((row) => todoPrefs[row.pillar]);
  const totalCount = rows.length;
  const doneCount = rows.filter((row) => status[row.pillar]).length;

  useEffect(() => {
    onStats?.({ partialStreak: streak, doneCount, totalCount });
  }, [onStats, streak, doneCount, totalCount]);

  if (embedded) {
    return (
      <ul>
        {rows.map((row, rowIndex) => {
          const checked = status[row.pillar];
          const action = row.actionLabel.replace(/\s*→\s*$/, "").split(" ")[0] || row.actionLabel;
          const control = (
            <span className="inline-flex h-[30px] shrink-0 items-center gap-0.5 rounded-full border border-[rgba(243,237,226,0.3)] px-3 text-[12.5px] font-semibold text-[#F3EDE2]">
              {action}
              <SelectChevron direction="right" className="text-[#F3EDE2]" />
            </span>
          );
          const mobileTitle = (
            <>
              <span className={`min-w-0 flex-1 truncate text-[15px] ${checked ? "text-[rgba(243,237,226,0.55)] line-through" : "text-[#F3EDE2]"}`}>
                {row.mobileName ?? row.name}
              </span>
              <SelectChevron direction="right" className="shrink-0 text-[rgba(243,237,226,0.55)]" />
            </>
          );
          const mobileRowClass = "flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left";
          const borderTop = rowIndex === 0 ? "" : "border-t border-[rgba(243,237,226,0.12)]";
          return (
            <li key={row.pillar}>
            {/* Mobile: one line, whole row opens the step; the circle still toggles on its own. */}
            <div className={`flex h-[46px] items-center gap-3 md:hidden ${borderTop}`}>
              <HabitCheckbox
                checked={checked}
                onToggle={() => toggle(row.pillar)}
                label={row.name}
                onDark
              />
              {row.actionAsLink ? (
                <Link href={row.actionAsLink} className={mobileRowClass}>
                  {mobileTitle}
                </Link>
              ) : (
                <button type="button" onClick={row.onAction} className={mobileRowClass}>
                  {mobileTitle}
                </button>
              )}
            </div>
            {(row.doingExtraLines ?? []).map((line) => (
              <button
                key={line}
                type="button"
                onClick={() => openFocus()}
                className="flex h-[40px] w-full cursor-pointer items-center gap-3 border-t border-[rgba(243,237,226,0.12)] pl-8 text-left md:hidden"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-[#F3EDE2]">
                  {line}
                </span>
                <SelectChevron direction="right" className="shrink-0 text-[rgba(243,237,226,0.55)]" />
              </button>
            ))}
            <div className="hidden items-center gap-3 py-2 md:flex">
              <HabitCheckbox
                checked={checked}
                onToggle={() => toggle(row.pillar)}
                label={row.name}
                onDark
              />
              {/* Two-line height is reserved so a missing subtitle doesn’t resize the hero; a lone title centres. */}
              <span className="flex min-h-[36px] min-w-0 flex-1 flex-col justify-center">
                <span className={`truncate text-[14.5px] leading-[20px] ${checked ? "text-[rgba(243,237,226,0.55)] line-through" : "text-[#F3EDE2]"}`}>
                  {row.name}
                </span>
                {row.help ? (
                  <span className="truncate text-[12px] leading-[16px] text-[rgba(243,237,226,0.55)]">
                    {row.help}
                  </span>
                ) : null}
              </span>
              {row.actionAsLink ? (
                <Link href={row.actionAsLink}>{control}</Link>
              ) : (
                <button type="button" onClick={row.onAction} className="cursor-pointer">
                  {control}
                </button>
              )}
            </div>
            </li>
          );
        })}
      </ul>
    );
  }

  if (compact) {
    return (
      <section
        aria-label="Today"
        className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card px-4 py-3.5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <SectionEyebrow className="text-[11px] font-semibold tracking-[1.4px]">
            Today · {dateLabel}
          </SectionEyebrow>
          <p className="shrink-0 text-[12px] text-muted">{streakLine()}</p>
        </div>
        <ul>
          {rows.map((row, i) => {
            const checked = status[row.pillar];
            const last = i === rows.length - 1;
            return (
              <li
                key={row.pillar}
                className={`flex items-center gap-3 py-2.5 ${
                  last ? "" : "border-b border-border"
                }`}
              >
                <HabitCheckbox
                  checked={checked}
                  onToggle={() => toggle(row.pillar)}
                  label={row.name}
                  compact
                />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span
                    className={`text-[14px] ${
                      checked
                        ? "text-muted line-through"
                        : "text-foreground"
                    }`}
                  >
                    {row.name}
                  </span>
                  {row.help ? (
                    <span className="truncate text-[12px] text-muted">
                      {row.help}
                    </span>
                  ) : null}
                </span>
                {row.actionAsLink ? (
                  <Link
                    href={row.actionAsLink}
                    className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-accent-link"
                  >
                    {row.actionLabel}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={row.onAction}
                    className="shrink-0 cursor-pointer whitespace-nowrap text-[13px] font-semibold text-accent-link"
                  >
                    {row.actionLabel}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section
      aria-label="Today"
      className="flex h-full flex-col gap-1.5 rounded-[20px] border border-border bg-card p-6 sm:p-7"
    >
      <div className="flex items-baseline justify-between gap-3">
        <SectionEyebrow>Today · {dateLabel}</SectionEyebrow>
        <p className="shrink-0 text-[14px] text-muted">
          {streak > 0 ? (
            <>
              <span className="font-semibold text-foreground">{streak}-day streak</span>
              {" · "}
              {doneCount} of {totalCount} done
            </>
          ) : (
            streakLine()
          )}
        </p>
      </div>

      <ul className="mt-1 flex flex-col">
        {rows.map((row, i) => {
          const checked = status[row.pillar];
          return (
            <li
              key={row.pillar}
              className={`flex items-center justify-between gap-3 py-3.5 ${
                i === 0 ? "" : "border-t border-border-subtle"
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <HabitCheckbox
                  checked={checked}
                  onToggle={() => toggle(row.pillar)}
                  label={row.name}
                />
                <span className="min-w-0">
                  <span
                    className={`block text-[15px] ${
                      checked
                        ? "text-muted line-through"
                        : "font-medium text-foreground"
                    }`}
                  >
                    {row.name}
                  </span>
                  {row.help ? (
                    <span className="mt-0.5 block truncate text-[13px] text-muted">
                      {row.help}
                    </span>
                  ) : null}
                </span>
              </span>
              {row.actionAsLink ? (
                <Link
                  href={row.actionAsLink}
                  className="shrink-0 text-[14px] font-semibold text-accent-link transition-opacity hover:opacity-80"
                >
                  {row.actionLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={row.onAction}
                  className="shrink-0 cursor-pointer text-[14px] font-semibold text-accent-link transition-opacity hover:opacity-80"
                >
                  {row.actionLabel}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
