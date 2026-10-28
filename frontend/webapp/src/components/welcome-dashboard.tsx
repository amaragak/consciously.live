import { Link } from "@/lib/spa-nav";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ensureMedimadeSession,
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  getMedimadeSessionJwt,
  isMedimadeGuestAccount,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import {
  pullIdeateStoreFromCloud,
  subscribeIdeateCloud,
} from "@/lib/ideate-cloud";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { formatDuration } from "@/components/library-meditation-card";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { DashboardAffirmationsCard } from "@/components/plan/daily-affirmations-card";
import { GetSetUpPanel } from "@/components/get-set-up-panel";
import { JournalEntryListTitle } from "@/components/journal-prompt-question";
import { SelectChevron } from "@/components/select-chevron";
import { useLibraryPlayer } from "@/components/library-player-provider";
import {
  isDemoJournalEntry,
  isGratitudeEntry,
  journalEntryHasMeaningfulContent,
  loadJournalStoreRaw,
  stripHtmlToText,
  withoutDemoJournalEntries,
  type JournalEntry,
} from "@/lib/journal-storage";
import {
  fetchJournalStoreRemote,
  listLibraryMeditations,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import {
  loadIdeateStore,
  sortSubtasks,
  subtasksForProject,
  todosForSubtask,
  type IdeateStoreV2,
} from "@/lib/plan-ideate-store";
import type { PlanDream } from "@/lib/plan-dreams";
import {
  DailyHabitTracker,
  type TodayGoalStep,
} from "@/components/daily-habit-tracker";
import { timeOfDayGreeting } from "@/lib/time-of-day-greeting";
import { loadIdeateManifestoStore } from "@/lib/ideate-manifesto";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import {
  loadIdeateVisionBoardStore,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import { creationPathDisplayLabel } from "@/lib/meditation-creation-provenance";
import { firstNameFromAccount } from "@/lib/manifesto-print";
import {
  pickUnplayedNewMeditation,
  resolveNarratedStoryPlacement,
  isLibraryStoryItem,
} from "@/lib/manifesto-story-placement";
import { DashboardStoryManifestRow } from "@/components/dashboard-story-slot";
import {
  readFocusSessionPrefs,
  readFocusTasksList,
  readSessionsCompletedToday,
  writeFocusTasksList,
  type FocusTaskItem,
} from "@/lib/focus-timer-storage";
import { newFocusTaskId, writeIdeateDoneFromFocus } from "@/lib/focus-ideate-link";
import {
  activeHealItems,
  currentView,
  loadHealStore,
  type HealItem,
  type HealStoreV1,
} from "@/lib/heal-store";
import { healTypeLabel } from "@/lib/heal-copy";

const JOURNAL_PREVIEW_LS = "mm_home_journal_show_previews_v1";

const LIFE_AREA_DASH_TINTS = ["#E7D3AE", "#EBDFC8", "#DCC39A", "#E3CFAA"] as const;

function greetingName(): string {
  const raw = getMedimadeSessionDisplayName()?.trim();
  if (raw && !/^guest$/i.test(raw)) return raw.split(/\s+/)[0] || raw;
  if (isMedimadeGuestAccount()) {
    const email = getMedimadeSessionEmail()?.trim() ?? "";
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "there";
}

function provenanceLine(m: LibraryMeditationItem): string | null {
  const path = m.creationProvenance?.creationPath;
  if (!path) return null;
  const label = creationPathDisplayLabel(path);
  if (path === "goal") return "made from your goal";
  if (path === "journalReflect") return "made from your journal";
  if (label === "Manifest") return "made from your goal";
  if (label === "Journal") return "made from your journal";
  return null;
}

type TopSlotKind = "unplayed" | "story" | "create";

type LifeAreaProgress = {
  dream: PlanDream;
  goalTitle: string | null;
  nextStep: string | null;
  done: number;
  total: number;
  subtaskId: string | null;
};

function activeGoalForDream(
  store: IdeateStoreV2,
  dreamId: string,
): {
  goalTitle: string;
  nextStep: string | null;
  done: number;
  total: number;
  subtaskId: string;
} | null {
  const subs = sortSubtasks(
    subtasksForProject(store, dreamId).filter((s) => s.status !== "done"),
    "updated_desc",
  );
  const goal = subs[0];
  if (!goal) return null;
  const todos = todosForSubtask(store, goal.id);
  const done = todos.filter((t) => t.isChecked).length;
  const next = todos.find((t) => !t.isChecked);
  return {
    goalTitle: goal.title.trim() || "Untitled goal",
    nextStep: next?.title.trim() || null,
    done,
    total: todos.length,
    subtaskId: goal.id,
  };
}

function lifeAreaProgressRows(
  store: IdeateStoreV2,
  dreams: PlanDream[],
): LifeAreaProgress[] {
  return dreams.map((dream) => {
    const g = activeGoalForDream(store, dream.id);
    return {
      dream,
      goalTitle: g?.goalTitle ?? null,
      nextStep: g?.nextStep ?? null,
      done: g?.done ?? 0,
      total: g?.total ?? 0,
      subtaskId: g?.subtaskId ?? null,
    };
  });
}

function focusGoalChip(
  store: IdeateStoreV2,
  dreams: PlanDream[],
): { title: string; href: string; subtaskId: string } | null {
  for (const d of dreams) {
    const g = activeGoalForDream(store, d.id);
    if (g) {
      return {
        title: g.goalTitle,
        href: `/manifest/goal/${encodeURIComponent(d.id)}`,
        subtaskId: g.subtaskId,
      };
    }
  }
  return null;
}

function Waveform({ compact = false }: { compact?: boolean }) {
  const heights = compact
    ? [
        8, 14, 10, 18, 12, 20, 9, 8, 14, 10, 18, 12, 20, 9, 8, 14, 10, 18, 12,
        20, 9, 8, 14, 10, 18, 12, 20, 9, 8, 14,
      ]
    : [
        8, 16, 22, 12, 26, 18, 24, 10, 20, 26, 14, 22, 8, 18, 24, 12, 20, 16, 26,
        10, 22, 14, 20, 24, 12, 18, 22, 8, 16, 20, 12, 24, 14, 18, 22, 10, 20, 16,
        24, 12,
      ];
  return (
    <div
      className={`flex items-center gap-[3px] ${compact ? "h-[22px]" : "h-[26px]"}`}
      aria-hidden
    >
      {heights.map((h, i) => (
        <i
          key={i}
          className={`block rounded-sm ${
            compact ? "w-[3px]" : "w-1"
          } ${
            i < 5
              ? "bg-gold"
              : "bg-[color-mix(in_srgb,var(--background)_22%,transparent)]"
          }`}
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

/** Signed-in home — personal dashboard. */
export function WelcomeDashboard() {
  const { playItem } = useLibraryPlayer();
  const [greeting, setGreeting] = useState("Good morning");
  const [name, setName] = useState("there");
  const [dreams, setDreams] = useState<PlanDream[]>([]);
  const [ideateStore, setIdeateStore] = useState<IdeateStoreV2>(() =>
    loadIdeateStore(),
  );
  const [manifesto, setManifesto] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [visionItems, setVisionItems] = useState<VisionBoardItem[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [meditations, setMeditations] = useState<LibraryMeditationItem[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [showJournalPreviews, setShowJournalPreviews] = useState(false);

  useEffect(() => {
    setGreeting(timeOfDayGreeting());
    setName(greetingName());
    try {
      setShowJournalPreviews(
        window.localStorage.getItem(JOURNAL_PREVIEW_LS) === "1",
      );
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    const syncIdeate = () => {
      const store = loadIdeateStore();
      const next = store.dreams.filter((d) => !isDemoIdeateDream(d));
      const byUpdated = [...next].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      );
      setDreams(byUpdated);
      setIdeateStore(store);
      setManifesto(loadIdeateManifestoStore().text.trim());
      setValues(
        loadIdeateValuesStore()
          .values.map((v) => v.text.trim())
          .filter(Boolean),
      );
      setVisionItems(loadIdeateVisionBoardStore().items.slice(0, 4));
    };
    syncIdeate();
    const unsub = subscribeIdeateCloud(syncIdeate);
    if (isMedimadeSessionActive()) {
      void pullIdeateStoreFromCloud().finally(syncIdeate);
    }
    window.addEventListener("medimade-session-changed", syncIdeate);
    return () => {
      unsub();
      window.removeEventListener("medimade-session-changed", syncIdeate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const applyJournal = (entries: JournalEntry[]) => {
      const real = entries
        .filter((e) => !isDemoJournalEntry(e))
        .filter(journalEntryHasMeaningfulContent);
      const sorted = [...real].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      );
      if (!cancelled) setJournalEntries(sorted);
    };

    const refreshJournal = () => {
      applyJournal(withoutDemoJournalEntries(loadJournalStoreRaw()).entries);
    };

    const scheduleLibraryRetry = () => {
      const t = setTimeout(() => {
        timers.delete(t);
        void refreshLibrary({ isRetry: true });
      }, 400);
      timers.add(t);
    };

    const refreshLibrary = async (opts?: { isRetry?: boolean }) => {
      if (!isMedimadeSessionActive()) {
        if (!cancelled) {
          setMeditations([]);
          setLibraryReady(true);
        }
        return;
      }
      try {
        await ensureMedimadeSession();
        if (cancelled) return;
        if (!getMedimadeSessionJwt()) {
          if (!opts?.isRetry) scheduleLibraryRetry();
          else if (!cancelled) setLibraryReady(true);
          return;
        }
        void fetchJournalStoreRemote()
          .then((remote) => {
            if (remote?.entries) applyJournal(remote.entries);
          })
          .catch(() => {
            /* keep local */
          });
        const items = await listLibraryMeditations();
        if (cancelled) return;
        const visible = items.filter(
          (x) => x.catalogued && x.archived !== true && x.isDraft !== true,
        );
        visible.sort((a, b) =>
          (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
        );
        setMeditations(visible);
        setLibraryReady(true);
      } catch {
        if (cancelled) return;
        if (!opts?.isRetry) {
          scheduleLibraryRetry();
          return;
        }
        setMeditations([]);
        setLibraryReady(true);
      }
    };

    refreshJournal();
    void refreshLibrary();

    const onSession = () => {
      refreshJournal();
      void refreshLibrary();
    };
    window.addEventListener("medimade-session-changed", onSession);
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      window.removeEventListener("medimade-session-changed", onSession);
    };
  }, []);

  const chip = useMemo(
    () => focusGoalChip(ideateStore, dreams),
    [ideateStore, dreams],
  );

  const lifeAreas = useMemo(
    () => lifeAreaProgressRows(ideateStore, dreams),
    [ideateStore, dreams],
  );

  const storyPlacement = useMemo(
    () => resolveNarratedStoryPlacement(meditations),
    [meditations],
  );
  const storyFirstName =
    firstNameFromAccount(
      getMedimadeSessionDisplayName(),
      getMedimadeSessionEmail(),
    ) || name;

  const unplayedReady = useMemo(
    () => pickUnplayedNewMeditation(meditations),
    [meditations],
  );

  // Never put the Manifest Story under “Ready when you are” — that label is
  // for a new unplayed meditation only.
  const topSlotKind: TopSlotKind = storyPlacement
    ? unplayedReady &&
      !isLibraryStoryItem(unplayedReady) &&
      unplayedReady.s3Key !== storyPlacement.libraryItem.s3Key
      ? "unplayed"
      : "story"
    : unplayedReady
      ? "unplayed"
      : "create";

  const ready = topSlotKind === "unplayed" ? unplayedReady : null;

  /** Meditation Try line only — story has its own Today check when narrated. */
  const todayTryTitle =
    topSlotKind === "unplayed" && ready
      ? ready.title?.trim() || null
      : null;

  const goalStep: TodayGoalStep | null = useMemo(() => {
    if (!chip) return null;
    const row = lifeAreas.find((r) => r.subtaskId === chip.subtaskId);
    if (!row?.nextStep) {
      return {
        stepTitle: "Open your goal",
        goalTitle: chip.title,
        subtaskId: chip.subtaskId,
      };
    }
    return {
      stepTitle: row.nextStep,
      goalTitle: chip.title,
      subtaskId: chip.subtaskId,
    };
  }, [chip, lifeAreas]);

  const recentMeditations = meditations
    .filter((m) => !isLibraryStoryItem(m) && m.s3Key !== ready?.s3Key)
    .slice(0, 2);
  const recentJournal = journalEntries.filter((entry) => !isGratitudeEntry(entry)).slice(0, 3);
  const lifeAreaTint = useMemo(() => {
    const ordered = [...dreams].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const map = new Map<string, string>();
    ordered.forEach((dream, index) => {
      map.set(dream.id, LIFE_AREA_DASH_TINTS[index % LIFE_AREA_DASH_TINTS.length] ?? LIFE_AREA_DASH_TINTS[0]);
    });
    return map;
  }, [dreams]);
  const showManifestStoryRow =
    Boolean(storyPlacement) && topSlotKind !== "story";

  function playReady() {
    if (!ready) return;
    playItem(ready);
  }

  function playStory() {
    if (!storyPlacement) return;
    playItem(storyPlacement.libraryItem);
  }

  const [todayStats, setTodayStats] = useState({ partialStreak: 0, doneCount: 0, totalCount: 4 });
  const [focusTasks, setFocusTasks] = useState<FocusTaskItem[]>([]);
  const [focusDraft, setFocusDraft] = useState("");
  const [healStore, setHealStore] = useState<HealStoreV1 | null>(null);
  const [healItems, setHealItems] = useState<HealItem[]>([]);

  useEffect(() => {
    setFocusTasks(readFocusTasksList());
    const store = loadHealStore();
    setHealStore(store);
    setHealItems(activeHealItems(store));
  }, []);

  const focusTodo = focusTasks.filter((task) => !task.done);
  const focusMinutes = readFocusSessionPrefs().focusMinutes;
  const sessionsToday = readSessionsCompletedToday();

  function addFocusGoal() {
    const text = focusDraft.trim();
    if (!text) {
      document.getElementById("dashboard-focus-add")?.focus();
      return;
    }
    const next = [
      ...focusTasks.filter((task) => !task.done),
      { id: newFocusTaskId(), text, done: false, inSession: true },
      ...focusTasks.filter((task) => task.done),
    ];
    writeFocusTasksList(next);
    setFocusTasks(next);
    setFocusDraft("");
  }

  function tickFocusGoal(id: string) {
    const item = focusTasks.find((task) => task.id === id);
    if (!item) return;
    const nextDone = !item.done;
    if (item.ideateKind && item.ideateId) {
      writeIdeateDoneFromFocus(item.ideateKind, item.ideateId, nextDone);
    }
    const next = focusTasks.map((task) =>
      task.id === id ? { ...task, done: nextDone, inSession: false } : task,
    );
    const ordered = [
      ...next.filter((task) => !task.done),
      ...next.filter((task) => task.done),
    ];
    writeFocusTasksList(ordered);
    setFocusTasks(ordered);
  }

  return (
    <div className="welcome-dashboard relative mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4">
      <section
        aria-label="Today"
        className="relative flex flex-col gap-5 overflow-hidden rounded-[22px] px-5 py-6 text-[#F3EDE2] shadow-[0_12px_34px_rgba(15,27,45,0.18)] md:flex-row md:gap-7 md:px-[30px] md:py-7"
        style={{ backgroundColor: "#0F1B2D" }}
      >
        <div className="navy-paisley-plate" aria-hidden />
        <div className="relative flex min-w-0 flex-[1.2] flex-col justify-center gap-3.5">
          <h1 className="font-display text-[32px] font-normal leading-[1.1] md:text-[40px]">
            {greeting}, {name}.
          </h1>
          {/* Reserved 2-line block so cloud manifesto load doesn’t grow the hero. */}
          <div className="min-h-[calc(1.45em*2)] font-display text-[17px] italic leading-[1.45] md:min-h-[calc(1.45em*2)] md:text-[19px]">
            {manifesto ? (
              <p className="line-clamp-2 text-[rgba(243,237,226,0.82)]">
                “{manifesto}”
              </p>
            ) : (
              <Link
                href="/manifest"
                className="line-clamp-2 text-[#D9B87C]"
              >
                Write your manifesto →
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chip ? (
              <Link
                href={chip.href}
                className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-[rgba(243,237,226,0.3)] px-3 text-[13px] text-[#F3EDE2]"
              >
                <span className="text-[rgba(243,237,226,0.6)]">Becoming</span>
                <span className="truncate">· {chip.title}</span>
                <SelectChevron direction="right" className="text-[#F3EDE2]" />
              </Link>
            ) : null}
            {todayStats.partialStreak > 0 ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[rgba(200,164,106,0.45)] bg-[rgba(200,164,106,0.16)] px-3 text-[13px] font-semibold text-[#E6C98A]">
                <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
                  <circle cx="24" cy="24" r="8.2" fill="#C8A46A" />
                  <g stroke="#C8A46A" strokeWidth="2" strokeLinecap="round">
                    <line x1="36.5" y1="24" x2="45" y2="24" />
                    <line x1="32.8" y1="32.8" x2="38.8" y2="38.8" />
                    <line x1="24" y1="36.5" x2="24" y2="45" />
                    <line x1="15.2" y1="32.8" x2="9.2" y2="38.8" />
                    <line x1="11.5" y1="24" x2="3" y2="24" />
                    <line x1="15.2" y1="15.2" x2="9.2" y2="9.2" />
                    <line x1="24" y1="11.5" x2="24" y2="3" />
                    <line x1="32.8" y1="15.2" x2="38.8" y2="9.2" />
                  </g>
                </svg>
                {todayStats.partialStreak}-day streak
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative hidden w-px self-stretch bg-[rgba(243,237,226,0.15)] md:block" />
        <div className="relative h-px bg-[rgba(243,237,226,0.15)] md:hidden" />
        <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[1.6px] text-[#D9B87C]">Today</span>
            <span className="text-[12.5px] text-[rgba(243,237,226,0.6)]">
              {todayStats.doneCount} of {todayStats.totalCount} done
            </span>
          </div>
          <DailyHabitTracker
            embedded
            onStats={setTodayStats}
            readyMeditationTitle={todayTryTitle}
            onPlayReadyMeditation={topSlotKind === "unplayed" && ready ? playReady : null}
            storyAvailable={Boolean(storyPlacement)}
            storyMinutes={storyPlacement?.minutes ?? null}
            onPlayStory={storyPlacement ? playStory : null}
            goalStep={goalStep}
          />
        </div>
      </section>

      <GetSetUpPanel />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DashCard
          label="Meditate"
          action={<OutlineGo href="/meditate/library/creations" label={`Library · ${libraryReady ? meditations.length : "…"}`} short="Open" />}
        >
          <h2 className="font-display text-[22px] leading-[1.2] text-foreground md:text-[26px]">What do you need right now?</h2>
          {ready ? (
            <button type="button" onClick={playReady} className="flex w-full cursor-pointer items-center gap-3.5 rounded-[14px] bg-[#0F1B2D] px-4 py-3.5 text-left text-[#F3EDE2]">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-[#AFC2DC] text-on-accent" style={PRIMARY_ACCENT_FILL_STYLE}>
                <PlayMark />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[1.4px] text-[#D9B87C]">Ready when you are</span>
                <span className="mt-0.5 block truncate font-display text-[19px] leading-tight">{ready.title?.trim() || "Untitled"}</span>
                <span className="mt-0.5 block text-[12px] text-[rgba(243,237,226,0.6)]">
                  {formatDuration(ready.durationSeconds)}
                  {provenanceLine(ready) ? ` · ${provenanceLine(ready)}` : ""}
                </span>
              </span>
              <span className="hidden shrink-0 md:block">
                <Waveform compact />
              </span>
            </button>
          ) : !libraryReady ? (
            <p className="text-[14px] text-muted">Loading your library…</p>
          ) : meditations.length === 0 ? (
            <p className="text-[14px] text-muted">Your first meditation is one prompt away</p>
          ) : null}
          {recentMeditations.map((item) => {
            const voice = item.speakerName?.trim();
            const duration = formatDuration(item.durationSeconds);
            const meta = [voice, duration !== "—" ? duration : ""].filter(Boolean).join(" · ");
            return (
              <button
                key={item.s3Key}
                type="button"
                onClick={() => playItem(item)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] border border-border bg-card p-2 text-left"
              >
                <span className="relative size-[52px] shrink-0 overflow-hidden rounded-[10px] bg-[linear-gradient(135deg,#E9C890,#7F93AE)]">
                  {item.coverImageUrl ? (
                    <img src={item.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex size-[26px] items-center justify-center rounded-full bg-white/90 text-[#0F1B2D]">
                      <PlayMark small />
                    </span>
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[16px] text-foreground">{item.title?.trim() || "Untitled"}</span>
                  {meta ? <span className="mt-0.5 block truncate text-[12px] text-muted">{meta}</span> : null}
                </span>
              </button>
            );
          })}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <MistLink href="/meditate/create">Create meditation</MistLink>
          </div>
        </DashCard>

        <DashCard
          label="Journal"
          action={<OutlineGo href="/journal/entries" label={`All entries · ${journalEntries.length}`} short="Open" />}
        >
          <h2 className="font-display text-[22px] leading-[1.2] text-foreground md:text-[26px]">How are you, really?</h2>
          {recentJournal.length === 0 ? (
            <p className="text-[14px] text-muted">Write your first entry</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentJournal.map((entry) => {
                const when = journalDateParts(entry.updatedAt || entry.createdAt);
                const excerpt = stripHtmlToText(entry.contentHtml).replace(/\s+/g, " ").trim();
                const chips = journalDashChips(entry);
                return (
                  <li key={entry.id}>
                    <Link
                      href={`/journal/entries/${encodeURIComponent(entry.id)}`}
                      className="flex gap-3 rounded-[14px] border border-border bg-card px-3 py-2.5"
                    >
                      {when ? (
                        <span className="flex w-11 shrink-0 flex-col items-center justify-center rounded-[10px] border border-[#E6D3AE] bg-[#F6EEDD] py-1.5">
                          <span className="font-display text-[20px] leading-none text-foreground">{when.day}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[#8A6424]">{when.month}</span>
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <JournalEntryListTitle
                          entry={entry}
                          className="block truncate text-[14.5px] font-semibold text-foreground"
                        />
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            {chips.map((chip) => (
                              <span key={chip.kind} className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#E6D3AE] bg-[#F6EEDD] px-2 text-[11.5px] font-semibold text-[#8A6424]">
                                <JournalKindIcon kind={chip.kind} />
                                {chip.label}
                              </span>
                            ))}
                            <span className="min-w-0 flex-1 truncate text-[13px] text-[#4A4652]">{excerpt || "Empty entry"}</span>
                          </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <MistLink href="/journal/entries?new=1">New entry</MistLink>
            <OutlineGo href="/journal/gratitudes?new=1" label="Add a gratitude" plain />
          </div>
        </DashCard>

        <DashCard
          label="Manifest"
          className="md:col-span-2"
          action={<OutlineGo href="/manifest" label="Open Manifest" short="Open" />}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Your vision board</span>
              {visionItems.length === 0 ? (
                <Link href="/manifest/vision-board" className="text-[14px] font-medium text-accent-link">Start your vision board →</Link>
              ) : (
                <>
                  <div className="-mr-5 flex gap-2.5 overflow-x-auto pr-5 md:mr-0 md:grid md:grid-cols-4 md:overflow-visible md:pr-0">
                    {visionItems.map((item) => (
                      <Link key={item.id} href="/manifest/vision-board" className="h-[90px] w-[120px] shrink-0 overflow-hidden rounded-xl md:h-[86px] md:w-auto" style={{ background: item.color || "var(--accent-soft)" }}>
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.label || ""} className="h-full w-full object-cover" /> : null}
                      </Link>
                    ))}
                  </div>
                  {visionItems.length > 2 ? (
                    <p className="flex items-center gap-1 text-[11.5px] text-muted md:hidden">
                      Swipe for more
                      <SelectChevron direction="right" />
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Your story</span>
              {storyPlacement ? (
                <DashboardStoryManifestRow placement={storyPlacement} firstName={storyFirstName} onPlay={playStory} compact />
              ) : (
                <Link href="/manifest/story" className="text-[14px] font-medium text-accent-link">Write your story →</Link>
              )}
            </div>
          </div>
          {values.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Your values</span>
              <div className="flex flex-wrap gap-1.5">
                {values.slice(0, 8).map((value) => (
                  <span key={value} className="rounded-full border border-[#E6D3AE] bg-[#F6EEDD] px-[13px] py-[7px] text-[13.5px] text-foreground">{value}</span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-muted">Your life areas</span>
            {lifeAreas.length === 0 ? (
              <Link href="/manifest?new=1" className="text-[14px] font-medium text-accent-link">Map your life areas →</Link>
            ) : (
              <>
                <div className={`-mr-5 flex gap-3 overflow-x-auto pb-1 pr-5 md:mr-0 md:pr-0 ${lifeAreas.length <= 4 ? "md:overflow-visible" : ""}`}>
                  {lifeAreas.map((row) => {
                    const pct = row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
                    return (
                      <Link
                        key={row.dream.id}
                        href={`/manifest/goal/${encodeURIComponent(row.dream.id)}`}
                        className={`flex w-[170px] shrink-0 flex-col gap-1.5 rounded-[14px] px-3.5 py-3 ${lifeAreas.length <= 4 ? "md:w-auto md:min-w-0 md:flex-1" : "md:w-[220px]"}`}
                        style={{ background: lifeAreaTint.get(row.dream.id) ?? LIFE_AREA_DASH_TINTS[0] }}
                      >
                        <span className="font-display text-[17px] text-foreground md:text-[18px]">{row.dream.title.trim() || "Untitled"}</span>
                        {row.nextStep ? (
                          <span className="line-clamp-2 text-[12.5px] text-foreground">
                            <span className="text-[#4A4652]">Next:</span> <span className="font-semibold">{row.nextStep}</span>
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-[#4A4652]">No next step yet</span>
                        )}
                        <span className="mt-auto h-1 overflow-hidden rounded-full bg-[rgba(15,27,45,0.1)]">
                          <span className="block h-1 rounded-full bg-[#8A6424]" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-[11.5px] text-[#4A4652]">{row.done} of {row.total}</span>
                      </Link>
                    );
                  })}
                </div>
                {lifeAreas.length > 1 ? (
                  <p className="flex items-center gap-1 text-[11.5px] text-muted md:hidden">
                    Swipe for more
                    <SelectChevron direction="right" />
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <MistLink href="/manifest/tracker?add=1">Add a goal</MistLink>
            <OutlineGo href="/manifest/vision-board?add=1" label="Add to vision board" plain />
          </div>
        </DashCard>

        <DashCard
          label="Heal"
          action={<OutlineGo href="/heal" label={`What you’re carrying · ${healItems.length}`} short={`Carrying · ${healItems.length}`} />}
        >
          <h2 className="font-display text-[22px] leading-[1.2] text-foreground md:text-[26px]">What’s weighing on you?</h2>
          {healItems.length === 0 ? (
            <p className="text-[14px] text-muted">Nothing here yet. A breakup, a pattern, a thought you can’t shake.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {healItems.slice(0, 2).map((item, index) => {
                const good = healStore ? currentView(healStore, item.id, "good") : null;
                const since = healSinceMonth(item.since || item.createdAt);
                return (
                  <li key={item.id} className={index === 1 ? "hidden md:block" : ""}>
                    <Link href={`/heal/${encodeURIComponent(item.id)}`} className="relative flex flex-col gap-2 overflow-hidden rounded-[14px] bg-[#0F1B2D] px-4 py-3.5">
                      <span className="navy-paisley-plate" aria-hidden />
                      <span className="relative text-[10.5px] font-semibold uppercase tracking-[1.4px] text-[rgba(243,237,226,0.55)]">
                        {healTypeLabel(item.type)}
                        {since ? ` · Since ${since}` : ""}
                      </span>
                      <span className="relative font-display text-[20px] leading-tight text-[#F3EDE2]">{item.title}</span>
                      {good?.text ? (
                        <span className="relative flex items-start gap-2 text-[13.5px] leading-[1.45] text-[#F3EDE2]">
                          <SunMark />
                          <span className="line-clamp-3">{good.text}</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <MistLink href="/heal?describe=1">Add something</MistLink>
          </div>
        </DashCard>

        <DashCard
          label="Focus"
          action={<OutlineGo href="/focus" label="Open Focus" short="Open" />}
        >
          <h2 className="font-display text-[22px] leading-[1.2] text-foreground md:text-[26px]">Today’s goals</h2>
          {focusTodo.length === 0 ? (
            <p className="text-[14px] text-muted">Nothing to do yet.</p>
          ) : (
            <ul>
              {focusTodo.slice(0, 3).map((task) => (
                <li key={task.id} className="flex items-center gap-2.5 border-t border-border py-2 first:border-0">
                  <button
                    type="button"
                    aria-label={`Tick ${task.text}`}
                    onClick={() => tickFocusGoal(task.id)}
                    className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[#E6DDCB] bg-white"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{task.text}</span>
                  {task.lifeAreaTitle ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-[#F6EEDD] px-[7px] text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8A6424]">{task.lifeAreaTitle}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3 rounded-[14px] border border-[#E6D3AE] bg-[#F6EEDD] px-3.5 py-3">
            <span className="font-display text-[26px] tabular-nums leading-none text-foreground">{String(focusMinutes).padStart(2, "0")}:00</span>
            <span className="min-w-0 flex-1 text-[13px] text-[#4A4652]">
              {focusTodo.length === 1 ? "1 to do" : `${focusTodo.length} to do`}
              <span className="hidden md:inline">
                {" · "}
                {sessionsToday === 1 ? "1 session done today" : `${sessionsToday} sessions done today`}
              </span>
            </span>
            <Link href="/focus?autoStart=1" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[14px] font-semibold text-foreground">
              <PlayMark />
              Start
            </Link>
          </div>
          <form
            className="mt-auto flex flex-wrap items-center gap-2 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              addFocusGoal();
            }}
          >
            <input
              id="dashboard-focus-add"
              value={focusDraft}
              onChange={(event) => setFocusDraft(event.target.value)}
              placeholder="Add a goal"
              aria-label="Add a goal"
              className="h-[38px] min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-[14px] text-foreground outline-none placeholder:text-muted"
            />
            <button type="submit" className="inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-full border border-[#AFC2DC] px-5 text-[14px] font-semibold text-on-accent" style={PRIMARY_ACCENT_FILL_STYLE}>
              <PlusMark />
              Add to today
            </button>
          </form>
        </DashCard>
      </div>

      <DashboardAffirmationsCard />
    </div>
  );
}

function DashCard({
  label,
  action,
  children,
  className = "",
}: {
  label: string;
  action: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 rounded-[22px] border border-border bg-card p-5 shadow-[0_2px_12px_rgba(15,27,45,0.05)] ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-[#8A6424]">{label}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function OutlineGo({
  href,
  label,
  short,
  plain = false,
}: {
  href: string;
  label: string;
  short?: string;
  plain?: boolean;
}) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1 rounded-full border border-border bg-card font-semibold text-foreground ${plain ? "h-[38px] gap-2 px-4 text-[14px]" : "h-[34px] pl-3.5 pr-2 text-[13px]"}`}>
      {plain ? <PlusMark /> : null}
      {short ? (
        <>
          <span className="md:hidden">{short}</span>
          <span className="hidden md:inline">{label}</span>
        </>
      ) : (
        label
      )}
      {plain ? null : <SelectChevron direction="right" />}
    </Link>
  );
}

function MistLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex h-[38px] items-center gap-2 rounded-full border border-[#AFC2DC] px-5 text-[14px] font-semibold text-on-accent" style={PRIMARY_ACCENT_FILL_STYLE}>
      <PlusMark />
      {children}
    </Link>
  );
}

function PlusMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PlayMark({ small = false }: { small?: boolean }) {
  const size = small ? 11 : 14;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function SunMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" className="mt-px shrink-0" aria-hidden>
      <circle cx="24" cy="24" r="8.2" fill="#C8A46A" />
      <g stroke="#C8A46A" strokeWidth="2" strokeLinecap="round">
        <line x1="36.5" y1="24" x2="45" y2="24" />
        <line x1="32.8" y1="32.8" x2="38.8" y2="38.8" />
        <line x1="24" y1="36.5" x2="24" y2="45" />
        <line x1="15.2" y1="32.8" x2="9.2" y2="38.8" />
        <line x1="11.5" y1="24" x2="3" y2="24" />
        <line x1="15.2" y1="15.2" x2="9.2" y2="9.2" />
        <line x1="24" y1="11.5" x2="24" y2="3" />
        <line x1="32.8" y1="15.2" x2="38.8" y2="9.2" />
      </g>
    </svg>
  );
}

function journalDateParts(iso: string): { day: string; month: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString("en-US", { month: "short" }),
  };
}

function healSinceMonth(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long" });
}

function journalDashChips(entry: JournalEntry): { kind: "Meditation" | "Manifest" | "Heal"; label: string }[] {
  const kinds: ("Meditation" | "Manifest" | "Heal")[] = [];
  const add = (kind: "Meditation" | "Manifest" | "Heal") => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };
  for (const link of entry.links ?? []) {
    if (link.targetType === "meditation") add("Meditation");
    else if (link.targetType === "life_area") add("Manifest");
    else if (link.targetType === "heal_item") add("Heal");
  }
  if (kinds.length === 0 && entry.meditationId) add("Meditation");
  return kinds.slice(0, 2).map((kind) => ({ kind, label: kind }));
}

function JournalKindIcon({ kind }: { kind: "Meditation" | "Manifest" | "Heal" }) {
  const props = {
    width: 11,
    height: 11,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "Manifest") {
    return (
      <svg {...props}>
        <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
      </svg>
    );
  }
  if (kind === "Heal") {
    return (
      <svg {...props}>
        <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <circle cx="12" cy="6" r="2" />
      <path d="M6 20c1-4 3-6 6-6s5 2 6 6M4 14l4-2M20 14l-4-2" />
    </svg>
  );
}
