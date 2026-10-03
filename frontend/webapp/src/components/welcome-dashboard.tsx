import { Link } from "@/lib/spa-nav";
import { useEffect, useMemo, useState } from "react";
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
import { PrimaryCreateButton } from "@/components/primary-create-button";
import { SectionEyebrow } from "@/components/section-eyebrow";
import { useLibraryPlayer } from "@/components/library-player-provider";
import {
  formatJournalEntryDate,
  isDemoJournalEntry,
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

const JOURNAL_PREVIEW_LS = "mm_home_journal_show_previews_v1";

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

/** Pick one meditation: goal-linked if possible, else newest creation. */
function pickReadyMeditation(
  items: LibraryMeditationItem[],
  focusLifeAreaId: string | null,
): LibraryMeditationItem | null {
  if (items.length === 0) return null;
  const byCreated = [...items].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  if (focusLifeAreaId) {
    const linked = byCreated.find(
      (m) =>
        m.lifeAreaId === focusLifeAreaId ||
        m.creationProvenance?.creationPath === "goal",
    );
    if (linked) return linked;
  }
  const fromGoal = byCreated.find(
    (m) => m.creationProvenance?.creationPath === "goal",
  );
  if (fromGoal) return fromGoal;
  return byCreated[0] ?? null;
}

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

  const ready = useMemo(
    () =>
      pickReadyMeditation(
        meditations,
        chip
          ? dreams.find((d) =>
              lifeAreas.some(
                (r) => r.subtaskId === chip.subtaskId && r.dream.id === d.id,
              ),
            )?.id ?? null
          : null,
      ),
    [meditations, chip, dreams, lifeAreas],
  );

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

  const recentMeditations = meditations.slice(0, 2);
  const recentJournal = journalEntries.slice(0, 2);
  const visibleLifeAreas = lifeAreas.slice(0, 3);
  const moreLifeAreas = Math.max(0, lifeAreas.length - 3);

  function playReady() {
    if (!ready) return;
    playItem(ready);
  }

  function toggleJournalPreviews() {
    setShowJournalPreviews((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(JOURNAL_PREVIEW_LS, next ? "1" : "0");
      } catch {
        /* */
      }
      return next;
    });
  }

  return (
    <div className="welcome-dashboard relative w-full">
      {/* —— Mobile (below md) —— */}
      <div className="flex flex-col gap-[22px] pb-24 md:hidden">
        <header className="flex flex-col gap-1.5 px-5 pb-2 pt-6">
          <h1 className="font-display text-[28px] font-normal leading-[1.15] text-foreground">
            {greeting}, {name}.
          </h1>
          {manifesto ? (
            <p className="font-display text-[15px] italic leading-[1.45] text-muted">
              “{manifesto}”
            </p>
          ) : (
            <Link
              href="/manifest/my"
              className="font-display text-[15px] italic leading-[1.45] text-accent-link"
            >
              Write your manifesto →
            </Link>
          )}
          {chip ? (
            <Link
              href={chip.href}
              className="mt-1 max-w-full self-start truncate rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted"
            >
              Becoming · {chip.title} →
            </Link>
          ) : null}
        </header>

        <div className="flex flex-col gap-[22px] px-4">
          <section
            aria-label="Ready when you are"
            className="flex flex-col gap-3 rounded-2xl bg-[var(--deep)] p-4 text-[color-mix(in_srgb,white_92%,var(--gold))]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-gold">
              Ready when you are
            </p>
            {ready ? (
              <>
                <div className="flex items-center gap-3.5">
                  <PrimaryCreateButton
                    variant="compact"
                    leadingPlus={false}
                    aria-label={`Play ${ready.title?.trim() || "meditation"}`}
                    onClick={playReady}
                    className="!rounded-full"
                    style={{ width: 48, height: 48, borderRadius: 9999 }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </PrimaryCreateButton>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <p className="font-display text-[18px] leading-[1.25]">
                      {ready.title?.trim() || "Untitled"}
                    </p>
                    <p className="text-[12px] text-[color-mix(in_srgb,white_65%,transparent)]">
                      {formatDuration(ready.durationSeconds)}
                    </p>
                  </div>
                </div>
                <Waveform compact />
              </>
            ) : (
              <div className="flex flex-col gap-3 py-1">
                <p className="font-display text-[18px] leading-[1.25]">
                  {libraryReady
                    ? "Create your first meditation"
                    : "Loading your library…"}
                </p>
                {libraryReady ? (
                  <PrimaryCreateButton to="/meditate/create" className="w-fit">
                    Create a meditation
                  </PrimaryCreateButton>
                ) : null}
              </div>
            )}
          </section>

          <DailyHabitTracker
            compact
            readyMeditationTitle={ready?.title?.trim() || null}
            onPlayReadyMeditation={ready ? playReady : null}
            goalStep={goalStep}
          />

          <section
            aria-label="Meditate"
            className="flex flex-col gap-2.5 rounded-[14px] border border-[#F2D6BA] bg-[#FBEBDC] px-4 py-3.5 dark:border-[color:var(--card-warm-border)] dark:bg-[color:var(--card-warm-bg)]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <SectionEyebrow className="text-[11px] font-semibold tracking-[1.4px]">
                Meditate
              </SectionEyebrow>
              <Link
                href="/meditate/library/creations"
                className="text-[12px] text-muted"
              >
                Library ({libraryReady ? meditations.length : "…"}) →
              </Link>
            </div>
            <h2 className="font-display text-[21px] font-normal leading-[1.2] text-foreground">
              What do you need right now?
            </h2>
            {recentMeditations.length === 0 ? (
              <p className="border-t border-[#F2D6BA] py-2.5 text-[14px] text-muted dark:border-[color:var(--card-warm-border)]">
                Your first meditation is one prompt away
              </p>
            ) : (
              <ul>
                {recentMeditations.map((m, i) => {
                  const last = i === recentMeditations.length - 1;
                  return (
                    <li
                      key={m.sk || m.id || `m-${i}`}
                      className={`flex items-baseline gap-3 py-2.5 ${
                        last
                          ? ""
                          : "border-b border-[#F2D6BA] dark:border-[color:var(--card-warm-border)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => playItem(m)}
                        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px text-left"
                      >
                        <span className="text-[14px] text-foreground">
                          {m.title?.trim() || "Untitled"}
                        </span>
                        <span className="text-[12px] text-muted">Recent</span>
                      </button>
                      <span className="shrink-0 whitespace-nowrap text-[12px] text-muted">
                        {formatDuration(m.durationSeconds)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-label="Journal"
            className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card px-4 py-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <SectionEyebrow className="text-[11px] font-semibold tracking-[1.4px]">
                Journal
              </SectionEyebrow>
              <button
                type="button"
                role="switch"
                aria-checked={showJournalPreviews}
                onClick={toggleJournalPreviews}
                className="flex cursor-pointer items-center gap-2 text-[12px] text-muted"
              >
                Show previews
                <span
                  aria-hidden
                  className={`relative h-[18px] w-[30px] rounded-full transition-colors ${
                    showJournalPreviews ? "bg-gold" : "bg-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-[left] ${
                      showJournalPreviews ? "left-[14px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
            <h2 className="font-display text-[21px] font-normal leading-[1.2] text-foreground">
              How are you, really?
            </h2>
            {recentJournal.length === 0 ? (
              <p className="border-t border-border-subtle py-2.5 text-[14px] text-muted">
                Write your first entry
              </p>
            ) : (
              <ul>
                {recentJournal.map((e, i) => {
                  const preview = stripHtmlToText(e.contentHtml).trim();
                  const last = i === recentJournal.length - 1;
                  return (
                    <li
                      key={e.id}
                      className={`flex items-center gap-3 py-2.5 ${
                        last ? "" : "border-b border-border"
                      }`}
                    >
                      <Link
                        href={`/journal/my/${encodeURIComponent(e.id)}`}
                        className="flex min-w-0 flex-1 flex-col gap-px"
                      >
                        <span className="text-[14px] text-foreground">
                          {e.title.trim() || "Untitled entry"}
                        </span>
                        <span className="text-[12px] text-muted">
                          {formatJournalEntryDate(e.updatedAt || e.createdAt)}
                        </span>
                        {showJournalPreviews && preview ? (
                          <span className="mt-0.5 line-clamp-2 text-[12px] text-muted">
                            {preview}
                          </span>
                        ) : null}
                      </Link>
                      {!showJournalPreviews ? (
                        <span
                          aria-hidden
                          className="h-1.5 w-[72px] shrink-0 rounded-full bg-border"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-label="Manifest"
            className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card px-4 py-3.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <SectionEyebrow className="text-[11px] font-semibold tracking-[1.4px]">
                Manifest
              </SectionEyebrow>
              <Link href="/manifest/my" className="text-[12px] text-muted">
                Open →
              </Link>
            </div>
            <h2 className="font-display text-[21px] font-normal leading-[1.2] text-foreground">
              Your life areas
            </h2>

            {visionItems.length === 0 ? (
              <Link
                href="/manifest/my/vision-board"
                className="text-[14px] font-medium text-accent-link"
              >
                Start your vision board →
              </Link>
            ) : (
              <div className="flex gap-1.5">
                {visionItems.map((item) => (
                  <Link
                    key={item.id}
                    href="/manifest/my/vision-board"
                    className="h-10 flex-1 overflow-hidden rounded-lg"
                    style={{
                      background: item.color || "var(--accent-soft)",
                    }}
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.label || ""}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </Link>
                ))}
              </div>
            )}

            {values.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {values.slice(0, 8).map((v) => (
                  <span
                    key={v}
                    className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted"
                  >
                    {v}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="h-px bg-border" />

            {visibleLifeAreas.length === 0 ? (
              <Link
                href="/manifest/my?new=1"
                className="text-[14px] font-medium text-accent-link"
              >
                Map your life areas →
              </Link>
            ) : (
              <ul>
                {visibleLifeAreas.map((row, i) => {
                  const pct =
                    row.total > 0
                      ? Math.round((row.done / row.total) * 100)
                      : 0;
                  const last = i === visibleLifeAreas.length - 1;
                  return (
                    <li
                      key={row.dream.id}
                      className={`flex flex-col gap-1 py-2.5 ${
                        last ? "" : "border-b border-border"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-display text-[16px] text-foreground">
                          {row.dream.title.trim() || "Untitled"}
                        </span>
                        <span className="shrink-0 text-[12px] text-muted">
                          {row.total > 0
                            ? `${row.done} of ${row.total} steps`
                            : "No steps yet"}
                        </span>
                      </div>
                      <span className="text-[13px] text-muted">
                        {row.goalTitle || "No active goal yet"}
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-border">
                          <span
                            className="block h-1 rounded-full bg-gold"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        {row.nextStep ? (
                          <Link
                            href={`/manifest/goal/${encodeURIComponent(row.dream.id)}`}
                            className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-accent-link"
                          >
                            Next: {row.nextStep} →
                          </Link>
                        ) : (
                          <Link
                            href={`/manifest/goal/${encodeURIComponent(row.dream.id)}`}
                            className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-accent-link"
                          >
                            Open →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {moreLifeAreas > 0 ? (
              <Link
                href="/manifest/my"
                className="text-[13px] font-medium text-accent-link"
              >
                + {moreLifeAreas} more →
              </Link>
            ) : null}
          </section>
        </div>
      </div>

      {/* —— Desktop (md+) —— */}
      <div className="relative mx-auto hidden max-w-6xl flex-col gap-8 px-4 pb-14 pt-8 sm:px-6 sm:pt-10 md:flex md:gap-8">
        {/* Greeting + manifesto */}
        <header className="flex flex-col gap-3.5">
          <h1 className="font-display text-[40px] font-normal leading-none tracking-[-1px] text-foreground sm:text-[48px]">
            {greeting}, {name}.
          </h1>
          <div className="flex flex-wrap items-center gap-3.5">
            {manifesto ? (
              <p className="font-display text-[18px] italic leading-snug text-muted sm:text-[20px]">
                “{manifesto}”
              </p>
            ) : (
              <Link
                href="/manifest/my"
                className="font-display text-[18px] italic text-accent-link transition-opacity hover:opacity-80 sm:text-[20px]"
              >
                Write your manifesto →
              </Link>
            )}
            {chip ? (
              <Link
                href={chip.href}
                className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-accent/40 hover:text-foreground"
              >
                Becoming · {chip.title} →
              </Link>
            ) : null}
          </div>
        </header>

        {/* Ready + Today */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section
            aria-label="Ready when you are"
            className="flex flex-col gap-5 rounded-[22px] bg-[var(--deep)] p-7 text-[color-mix(in_srgb,white_92%,var(--gold))] lg:col-span-7"
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold">
              Ready when you are
            </p>
            {ready ? (
              <>
                <div className="flex items-center gap-4">
                  <PrimaryCreateButton
                    variant="compact"
                    leadingPlus={false}
                    aria-label={`Play ${ready.title?.trim() || "meditation"}`}
                    onClick={playReady}
                    className="!rounded-full"
                    style={{ width: 60, height: 60, borderRadius: 9999 }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </PrimaryCreateButton>
                  <div className="min-w-0 flex flex-col gap-1">
                    <p className="font-display text-[22px] font-medium leading-snug sm:text-[24px]">
                      {ready.title?.trim() || "Untitled"}
                    </p>
                    <p className="text-[14px] text-[color-mix(in_srgb,white_65%,transparent)]">
                      {[
                        ready.meditationStyle?.trim() || null,
                        formatDuration(ready.durationSeconds),
                        provenanceLine(ready),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <Waveform />
              </>
            ) : (
              <div className="flex flex-col gap-4 py-2">
                <p className="font-display text-[22px] font-medium sm:text-[24px]">
                  {libraryReady
                    ? "Create your first meditation"
                    : "Loading your library…"}
                </p>
                {libraryReady ? (
                  <PrimaryCreateButton to="/meditate/create" className="w-fit">
                    Create a meditation
                  </PrimaryCreateButton>
                ) : null}
              </div>
            )}
          </section>

          <div className="lg:col-span-5">
            <DailyHabitTracker
              readyMeditationTitle={ready?.title?.trim() || null}
              onPlayReadyMeditation={ready ? playReady : null}
              goalStep={goalStep}
            />
          </div>
        </div>

        {/* Meditate + Journal */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <section
            aria-label="Meditate"
            className="flex flex-col gap-2.5 rounded-[20px] border border-[#F2D6BA] bg-[#FBEBDC] p-6 sm:p-7 dark:border-[color:var(--card-warm-border)] dark:bg-[color:var(--card-warm-bg)]"
          >
            <div className="flex items-center justify-between gap-3">
              <SectionEyebrow>Meditate</SectionEyebrow>
              <Link
                href="/meditate/library/creations"
                className="text-[14px] text-muted transition-colors hover:text-foreground"
              >
                Library ({libraryReady ? meditations.length : "…"}) →
              </Link>
            </div>
            <h2 className="pb-1.5 font-display text-[24px] font-normal tracking-tight text-foreground sm:text-[26px]">
              What do you need right now?
            </h2>
            {recentMeditations.length === 0 ? (
              <p className="border-t border-[#F2D6BA] py-3 text-[14px] text-muted dark:border-[color:var(--card-warm-border)]">
                Your first meditation is one prompt away
              </p>
            ) : (
              <ul>
                {recentMeditations.map((m, i) => (
                  <li
                    key={m.sk || m.id || `m-${i}`}
                    className="flex items-center justify-between gap-3 border-t border-[#F2D6BA] py-3.5 first:border-t-0 first:pt-0 dark:border-[color:var(--card-warm-border)]"
                  >
                    <button
                      type="button"
                      onClick={() => playItem(m)}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <span className="block truncate text-[15px] font-medium text-foreground">
                        {m.title?.trim() || "Untitled"}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        Recent
                      </span>
                    </button>
                    <span className="shrink-0 text-[14px] tabular-nums text-muted">
                      {formatDuration(m.durationSeconds)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <PrimaryCreateButton
              to="/meditate/create"
              className="mt-2.5 w-fit"
            >
              Create a meditation
            </PrimaryCreateButton>
          </section>

          <section
            aria-label="Journal"
            className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-card p-6 sm:p-7"
          >
            <div className="flex items-center justify-between gap-3">
              <SectionEyebrow>Journal</SectionEyebrow>
              <button
                type="button"
                role="switch"
                aria-checked={showJournalPreviews}
                onClick={toggleJournalPreviews}
                className="flex cursor-pointer items-center gap-2 text-[13px] text-muted"
              >
                Show previews
                <span
                  aria-hidden
                  className={`relative h-5 w-[34px] rounded-full transition-colors ${
                    showJournalPreviews ? "bg-gold" : "bg-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-card transition-transform ${
                      showJournalPreviews ? "left-[14px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
            <h2 className="pb-1.5 font-display text-[24px] font-normal tracking-tight text-foreground sm:text-[26px]">
              How are you, really?
            </h2>
            {recentJournal.length === 0 ? (
              <p className="border-t border-border-subtle py-3 text-[14px] text-muted">
                Write your first entry
              </p>
            ) : (
              <ul>
                {recentJournal.map((e) => {
                  const preview = stripHtmlToText(e.contentHtml).trim();
                  return (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-3 border-t border-border-subtle py-3.5 first:border-t-0 first:pt-0"
                    >
                      <Link
                        href={`/journal/my/${encodeURIComponent(e.id)}`}
                        className="min-w-0 flex-1"
                      >
                        <span className="block truncate text-[15px] font-medium text-foreground">
                          {e.title.trim() || "Untitled entry"}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-muted">
                          {formatJournalEntryDate(e.updatedAt || e.createdAt)}
                        </span>
                        {showJournalPreviews && preview ? (
                          <span className="mt-1 block truncate text-[13px] text-muted">
                            {preview}
                          </span>
                        ) : null}
                      </Link>
                      {!showJournalPreviews ? (
                        <span
                          aria-hidden
                          className="hidden h-2 w-[90px] shrink-0 rounded-full bg-border-subtle sm:block"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <PrimaryCreateButton
              to="/journal/my?new=1"
              tone="outline"
              className="mt-2.5 w-fit"
            >
              New entry
            </PrimaryCreateButton>
          </section>
        </div>

        {/* Manifest */}
        <section
          aria-label="Manifest"
          className="flex flex-col gap-5 rounded-[20px] border border-border bg-card p-6 sm:p-7"
        >
          <div className="flex items-center justify-between gap-3">
            <SectionEyebrow>Manifest</SectionEyebrow>
            <Link
              href="/manifest/my"
              className="text-[14px] text-muted transition-colors hover:text-foreground"
            >
              Open Manifest →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-7 md:grid-cols-12 md:items-start">
            <div className="flex flex-col gap-2.5 md:col-span-8">
              <span className="text-[14px] text-muted">Your vision board</span>
              {visionItems.length === 0 ? (
                <Link
                  href="/manifest/my/vision-board"
                  className="text-[15px] font-medium text-accent-link transition-opacity hover:opacity-80"
                >
                  Start your vision board →
                </Link>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {visionItems.map((item) => (
                    <Link
                      key={item.id}
                      href="/manifest/my/vision-board"
                      className="block aspect-square w-full overflow-hidden rounded-xl"
                      style={{
                        background: item.color || "var(--accent-soft)",
                      }}
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={item.label || ""}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {values.length > 0 ? (
              <div className="flex flex-col gap-2.5 md:col-span-4">
                <span className="text-[14px] text-muted">Your values</span>
                <div className="flex flex-wrap gap-2">
                  {values.slice(0, 8).map((v) => (
                    <span
                      key={v}
                      className="rounded-full border border-[color:var(--card-warm-border)] bg-[color:var(--card-warm-bg)] px-3.5 py-2 text-[14px] text-foreground"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
            <span className="text-[14px] text-muted">Your life areas</span>
            {visibleLifeAreas.length === 0 ? (
              <Link
                href="/manifest/my?new=1"
                className="text-[15px] font-medium text-accent-link transition-opacity hover:opacity-80"
              >
                Map your life areas →
              </Link>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleLifeAreas.map((row) => {
                  const pct =
                    row.total > 0
                      ? Math.round((row.done / row.total) * 100)
                      : 0;
                  return (
                    <Link
                      key={row.dream.id}
                      href={`/manifest/goal/${encodeURIComponent(row.dream.id)}`}
                      className="flex flex-col gap-2 rounded-2xl border border-border px-5 py-4 transition-colors hover:border-accent/40"
                    >
                      <span className="font-display text-[20px] text-foreground">
                        {row.dream.title.trim() || "Untitled"}
                      </span>
                      <span className="text-[14px] text-muted">
                        {row.goalTitle
                          ? `Goal · ${row.goalTitle}`
                          : "No active goal yet"}
                      </span>
                      {row.nextStep ? (
                        <span className="text-[14px] text-foreground">
                          Next:{" "}
                          <span className="font-semibold">{row.nextStep}</span>
                        </span>
                      ) : null}
                      <span className="mt-1 h-[5px] overflow-hidden rounded-full bg-border-subtle">
                        <span
                          className="block h-[5px] rounded-full bg-gold"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="text-[12px] text-muted">
                        {row.total > 0
                          ? `${row.done} of ${row.total} steps`
                          : "No steps yet"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
            {moreLifeAreas > 0 ? (
              <Link
                href="/manifest/my"
                className="text-[14px] font-medium text-accent-link"
              >
                + {moreLifeAreas} more →
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
