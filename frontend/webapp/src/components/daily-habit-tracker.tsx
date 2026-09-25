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
import {
  focusMyHrefFromIdeate,
  writeFocusSessionHandoff,
} from "@/lib/focus-session-handoff";
import { writeFocusActiveIdeateSubtask } from "@/lib/focus-preflight-link";

export type TodayGoalStep = {
  stepTitle: string;
  goalTitle: string;
  subtaskId: string;
};

type Props = {
  /** Meditation suggested on the “Ready when you are” card. */
  readyMeditationTitle?: string | null;
  onPlayReadyMeditation?: (() => void) | null;
  /** Next incomplete goal step; when absent, fall back to life-area wording. */
  goalStep?: TodayGoalStep | null;
};

function emptyStatus(): DailyStatus {
  return {
    gratitude: false,
    meditation: false,
    lifeArea: false,
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
  remote: DailyStatus,
  local: DailyStatus,
): DailyStatus {
  return {
    gratitude: remote.gratitude || local.gratitude,
    meditation: remote.meditation || local.meditation,
    lifeArea: remote.lifeArea || local.lifeArea,
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
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={
        checked
          ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-[11px] font-semibold leading-none text-on-accent"
          : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--border)_100%,var(--muted))] bg-transparent"
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
  goalStep = null,
}: Props) {
  const router = useRouter();
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

  const doneCount =
    (status.gratitude ? 1 : 0) +
    (status.meditation ? 1 : 0) +
    (status.lifeArea ? 1 : 0);

  const toggle = (pillar: DailyHabitPillar) => {
    const next = !status[pillar];
    setLocalManualCheck(pillar, next, dateKey);
    setStatus(localStatusNow());
    if (isMedimadeSessionActive()) {
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
    }
  };

  const streak = status.partialStreak;
  const streakLine =
    streak > 0
      ? `${streak}-day streak · ${doneCount} of 3 done`
      : `${doneCount} of 3 done`;

  const lifeAreaName = goalStep
    ? "Next step on your goal"
    : "Make progress on a life area";
  const lifeAreaHelp = goalStep
    ? `${goalStep.stepTitle} · ${goalStep.goalTitle}`
    : "Complete any goal or To Do in Manifest, or add a thought";

  function openFocus() {
    if (goalStep?.subtaskId) {
      writeFocusSessionHandoff({ v: 1, subtaskId: goalStep.subtaskId });
      writeFocusActiveIdeateSubtask(goalStep.subtaskId);
      router.push(focusMyHrefFromIdeate());
      return;
    }
    router.push("/focus/my");
  }

  const rows: {
    pillar: DailyHabitPillar;
    name: string;
    help: string | null;
    actionLabel: string;
    onAction: () => void;
    actionAsLink?: string;
  }[] = [
    {
      pillar: "gratitude",
      name: "Add a gratitude",
      help: null,
      actionLabel: "Add →",
      onAction: () => {},
      actionAsLink: "/journal/my/gratitudes?new=1",
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
    {
      pillar: "lifeArea",
      name: lifeAreaName,
      help: lifeAreaHelp,
      actionLabel: "Focus →",
      onAction: openFocus,
    },
  ];

  return (
    <section
      aria-label="Today"
      className="flex h-full flex-col gap-1.5 rounded-[20px] border border-border bg-card p-6 sm:p-7"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-link">
          Today · {dateLabel}
        </p>
        <p className="shrink-0 text-[14px] text-muted">
          {streak > 0 ? (
            <>
              <span className="font-semibold text-foreground">{streak}-day streak</span>
              {" · "}
              {doneCount} of 3 done
            </>
          ) : (
            streakLine
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
