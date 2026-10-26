
import { Link, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconPencil } from "@tabler/icons-react";
import {
  MixEditorPanel,
  DEFAULT_MIX_EDITOR_VALUES,
  type MixEditorValues,
} from "@/components/mix-editor-panel";
import {
  FOCUS_AMBIENT_S3_PREFIX,
  trackFromFocusMix,
} from "@/components/library-audio-strip";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  FOCUS_PATTERN_OPTIONS,
  loadFocusPattern,
  saveFocusPattern,
  type FocusPatternId,
} from "@/lib/focus-pattern";
import { loadFocusMix, saveFocusMix } from "@/lib/focus-mix-storage";
import { unlockHtmlMediaPlayback } from "@/lib/audio-lead-buffer";
import {
  readFocusSessionPrefs,
  readFocusTasksList,
  readSessionsCompletedToday,
  writeFocusSessionPrefs,
  writeFocusTasksList,
  writeSessionsCompletedToday,
  type FocusSessionPrefs,
  type FocusTaskItem,
} from "@/lib/focus-timer-storage";
import {
  clearFocusSessionHandoff,
  readFocusSessionHandoff,
} from "@/lib/focus-session-handoff";
import {
  FOCUS_CHAT_CONTROL_EVENT,
  type FocusChatControlDetail,
} from "@/lib/focus-chat-control";
import {
  FOCUS_PREFLIGHT_CHANGED_EVENT,
  readActiveFocusPreflightLink,
  upsertFocusPreflightLink,
  writeFocusActiveIdeateSubtask,
  type FocusPreflightLink,
} from "@/lib/focus-preflight-link";
import { startFocusPreflightMeditationGeneration } from "@/lib/focus-preflight-meditation";
import { SelectChevron } from "@/components/select-chevron";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  FittedTimerFace,
  FocusStrikeTitle,
  GoalRows,
  GoalTick,
  ManifestPicker,
  SessionTimingPopover,
  TimerFace,
  TimerStyleMenu,
  playSoftChime,
} from "@/components/focus-board";
import { ensurePendingMeditationJobPoller } from "@/lib/poll-pending-meditation-jobs";
import {
  focusTasksFromIdeateSubtask,
  newFocusTaskId,
  syncFocusDoneFromIdeate,
  writeIdeateDoneFromFocus,
} from "@/lib/focus-ideate-link";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import {
  pullIdeateStoreFromCloud,
  subscribeIdeateCloud,
} from "@/lib/ideate-cloud";
import {
  getMedimadeMediaBaseUrl,
  listBackgroundAudio,
  listLibraryMeditations,
  type BackgroundAudioItem,
} from "@/lib/medimade-api";
import {
  loadIdeateStore,
  subtasksForProject,
  todosForSubtask,
  type IdeateStoreV2,
  type IdeateSubtask,
  type IdeateTodo,
} from "@/lib/plan-ideate-store";
import type { PlanDream } from "@/lib/plan-dreams";
import { soundDisplayName } from "@/lib/sound-taxonomy";
import { readFocusDefaults } from "@/lib/settings-local-defaults";

type TimerMode = "focus" | "shortBreak" | "longBreak";
type DrawerTab = "session" | "ideate";
type IdeateLevel = "areas" | "tasks" | "subtasks";

type IdeatePick =
  | { kind: "subtask"; id: string }
  | { kind: "todo"; id: string };

const MODE_DEFAULT_MINUTES: Record<TimerMode, number> = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

const FOCUS_DURATION_OPTIONS = [15, 25, 50] as const;

function formatMmSs(totalSeconds: number): string {
  const { mm, ss } = splitMmSs(totalSeconds);
  return `${mm}:${ss}`;
}

function splitMmSs(totalSeconds: number): { mm: string; ss: string } {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return {
    mm: String(m).padStart(2, "0"),
    ss: String(r).padStart(2, "0"),
  };
}

function formatDurationLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function pickKey(p: IdeatePick): string {
  return `${p.kind}:${p.id}`;
}

function ChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ChevronLeft({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function FocusTimerView() {
  const {
    playItem,
    playTrack,
    patchNowPlaying,
    dismiss,
    nowPlaying,
    playingS3Key,
    toggleCurrent,
    bedVolumeApiRef,
    playerStripHeightPx,
  } = useLibraryPlayer();
  const [searchParams] = useSearchParams();
  const fromIdeateToken = searchParams.get("fromIdeate");
  const autoStart = searchParams.get("autoStart") === "1";
  const minutesParam = searchParams.get("minutes");
  const [taskInput, setTaskInput] = useState("");
  const [mode, setMode] = useState<TimerMode>("focus");
  const [focusMinutes, setFocusMinutes] = useState<number>(25);
  const initialFocusSec = readFocusDefaults().defaultSessionMinutes * 60;
  const [durationSec, setDurationSec] = useState(initialFocusSec);
  const [remainingSec, setRemainingSec] = useState(initialFocusSec);
  const [running, setRunning] = useState(false);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasksShelfOpen, setTasksShelfOpen] = useState(true);
  const [ideateFlyoutOpen, setIdeateFlyoutOpen] = useState(false);
  const [tasks, setTasks] = useState<FocusTaskItem[]>([]);
  const [draftTask, setDraftTask] = useState("");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("session");
  const [ideateStore, setIdeateStore] = useState<IdeateStoreV2 | null>(null);
  const [ideateLevel, setIdeateLevel] = useState<IdeateLevel>("areas");
  const [selectedArea, setSelectedArea] = useState<PlanDream | null>(null);
  const [selectedTask, setSelectedTask] = useState<IdeateSubtask | null>(null);
  const [ideatePicks, setIdeatePicks] = useState<IdeatePick[]>([]);
  const [preflight, setPreflight] = useState<FocusPreflightLink | null>(null);
  const [preflightPlayBusy, setPreflightPlayBusy] = useState(false);
  const [focusPattern, setFocusPattern] = useState<FocusPatternId>("default");
  const [patternPickerOpen, setPatternPickerOpen] = useState(false);
  const [focusMix, setFocusMix] = useState<MixEditorValues>({
    ...DEFAULT_MIX_EDITOR_VALUES,
  });
  const [mixPanelOpen, setMixPanelOpen] = useState(false);
  const [mixNature, setMixNature] = useState<BackgroundAudioItem[]>([]);
  const [mixMusic, setMixMusic] = useState<BackgroundAudioItem[]>([]);
  const [mixDrums, setMixDrums] = useState<BackgroundAudioItem[]>([]);
  const [mixNoise, setMixNoise] = useState<BackgroundAudioItem[]>([]);
  const [mixCompositions, setMixCompositions] = useState<BackgroundAudioItem[]>(
    [],
  );
  const [prefs, setPrefs] = useState<FocusSessionPrefs>(() => readFocusSessionPrefs());
  const [epoch, setEpoch] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
  const [goalsSheet, setGoalsSheet] = useState(false);
  const [sessionMenu, setSessionMenu] = useState(false);
  const [strikingIds, setStrikingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [manifestOpen, setManifestOpen] = useState(false);
  const [meditateGate, setMeditateGate] = useState(false);
  const wide = useMinWidth(768);
  const meditatePlayed = useRef(false);
  const tasksRef = useRef(tasks);
  const strikingRef = useRef(new Set<string>());
  const strikeTimers = useRef<number[]>([]);
  const meditateHeard = useRef(false);
  const onElapsedRef = useRef<() => void>(() => {});
  const endAtRef = useRef<number | null>(null);
  const remainingRef = useRef(remainingSec);
  const ideateFlyoutRef = useRef<HTMLDivElement>(null);
  const ideateButtonRef = useRef<HTMLButtonElement>(null);
  const patternPickerRef = useRef<HTMLDivElement>(null);
  const soundsButtonRef = useRef<HTMLButtonElement>(null);
  const mixCloseRef = useRef<(() => void) | null>(null);
  const mixCompositionsRef = useRef(mixCompositions);
  mixCompositionsRef.current = mixCompositions;

  useEffect(() => {
    remainingRef.current = remainingSec;
  }, [remainingSec]);

  useEffect(() => {
    const main = document.querySelector("main[data-app-layout='focus']");
    const root = document.documentElement;
    const mq = window.matchMedia("(min-width: 640px)");

    const sync = () => {
      // Goals are a card now, so the pattern covers the whole page.
      const sideOpen = false && tasksShelfOpen && mq.matches;
      const value = sideOpen ? "open" : "closed";
      const width = sideOpen ? "320px" : "0px";
      if (main instanceof HTMLElement) {
        main.dataset.focusTasks = value;
        main.style.setProperty("--focus-tasks-w", width);
      }
      root.dataset.focusTasks = value;
      root.style.setProperty("--focus-tasks-w", width);
    };

    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      if (main instanceof HTMLElement) {
        delete main.dataset.focusTasks;
        main.style.removeProperty("--focus-tasks-w");
      }
      delete root.dataset.focusTasks;
      root.style.removeProperty("--focus-tasks-w");
    };
  }, [tasksShelfOpen]);

  useEffect(() => {
    if (!tasksShelfOpen && ideateFlyoutOpen) closeIdeateFlyout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksShelfOpen]);

  useEffect(() => {
    const store = loadIdeateStore();
    const list = syncFocusDoneFromIdeate(readFocusTasksList(), store);
    setTasks(list);
    writeFocusTasksList(list);
    setSessionsToday(readSessionsCompletedToday());
    setFocusPattern(loadFocusPattern());
    setFocusMix(loadFocusMix());
    const saved = readFocusSessionPrefs();
    setPrefs(saved);
    setFocusMinutes(saved.focusMinutes);
    if (!autoStart) {
      setDurationSec(saved.focusMinutes * 60);
      setRemainingSec(saved.focusMinutes * 60);
      remainingRef.current = saved.focusMinutes * 60;
    }
  }, [autoStart]);

  // Ideate “Start focus session” handoff (query token so repeat visits re-apply).
  useEffect(() => {
    const handoff = readFocusSessionHandoff();
    if (!handoff) return;
    clearFocusSessionHandoff();
    writeFocusActiveIdeateSubtask(handoff.subtaskId);
    setPreflight(readActiveFocusPreflightLink());
    const store = loadIdeateStore();
    const seeded = focusTasksFromIdeateSubtask(store, handoff.subtaskId);
    if (seeded.length === 0) return;
    setTasks(seeded);
    writeFocusTasksList(seeded);
    setIdeateStore(store);
    setTasksShelfOpen(true);
  }, [fromIdeateToken]);

  // Chat ACTION: auto-start + minutes query, plus live pause/stop/start events.
  useEffect(() => {
    const minsRaw = minutesParam ? Number(minutesParam) : NaN;
    if (Number.isFinite(minsRaw) && minsRaw > 0) {
      const mins = Math.min(120, Math.max(1, Math.floor(minsRaw)));
      setFocusMinutes(mins);
      setMode("focus");
      setDurationSec(mins * 60);
      setRemainingSec(mins * 60);
      remainingRef.current = mins * 60;
    }
    if (autoStart) {
      setRunning(true);
    }
  }, [autoStart, minutesParam]);

  useEffect(() => {
    const onControl = (ev: Event) => {
      const detail = (ev as CustomEvent<FocusChatControlDetail>).detail;
      if (!detail?.cmd) return;
      if (detail.cmd === "pause") {
        setRunning(false);
        endAtRef.current = null;
        return;
      }
      if (detail.cmd === "stop") {
        setRunning(false);
        endAtRef.current = null;
        const mins = focusMinutes;
        const sec = mins * 60;
        setDurationSec(sec);
        setRemainingSec(sec);
        remainingRef.current = sec;
        return;
      }
      if (detail.cmd === "start") {
        if (detail.minutes && detail.minutes > 0) {
          const mins = Math.min(120, Math.floor(detail.minutes));
          setFocusMinutes(mins);
          setMode("focus");
          const sec = mins * 60;
          setDurationSec(sec);
          setRemainingSec(sec);
          remainingRef.current = sec;
        }
        setRunning(true);
      }
    };
    window.addEventListener(FOCUS_CHAT_CONTROL_EVENT, onControl);
    return () => window.removeEventListener(FOCUS_CHAT_CONTROL_EVENT, onControl);
  }, [focusMinutes]);

  useEffect(() => {
    const sync = () => setPreflight(readActiveFocusPreflightLink());
    sync();
    ensurePendingMeditationJobPoller();
    window.addEventListener(FOCUS_PREFLIGHT_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FOCUS_PREFLIGHT_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (
      preflight &&
      (preflight.status === "starting" ||
        preflight.status === "pending" ||
        preflight.status === "running")
    ) {
      ensurePendingMeditationJobPoller();
    }
  }, [preflight]);

  const playPreflightMeditation = useCallback(async () => {
    if (!preflight || preflight.status !== "ready" || preflightPlayBusy) return;
    const key = (preflight.audioKey ?? "").trim();
    const url = (preflight.audioUrl ?? "").trim();
    setPreflightPlayBusy(true);
    try {
      if (key) {
        try {
          const list = await listLibraryMeditations();
          const hit = list.find((it) => (it.s3Key ?? "").trim() === key);
          if (hit) {
            playItem(hit);
            return;
          }
        } catch {
          /* fall through to direct URL */
        }
      }
      if (url && key) {
        playTrack({
          url,
          title: preflight.title,
          s3Key: key,
          liveMix: false,
          natureKey: "",
          musicKey: "",
          drumsKey: "",
          noiseKey: "",
          natureGain: 25,
          musicGain: 50,
          drumsGain: 40,
          noiseGain: 10,
        });
        return;
      }
    } finally {
      setPreflightPlayBusy(false);
    }
  }, [preflight, preflightPlayBusy, playItem, playTrack]);

  useEffect(() => {
    let cancelled = false;
    void listBackgroundAudio()
      .then((data) => {
        if (cancelled) return;
        setMixNature(data.nature ?? []);
        setMixMusic(data.music ?? []);
        setMixDrums(data.drums ?? []);
        setMixNoise(data.noise ?? []);
        setMixCompositions(data.compositions ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setMixNature([]);
        setMixMusic([]);
        setMixDrums([]);
        setMixNoise([]);
        setMixCompositions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const focusAmbientTitle = useCallback(
    (mix: MixEditorValues) => {
      const musicKey = mix.musicKey.trim();
      if (musicKey) {
        const hit = mixCompositionsRef.current.find((c) => c.key === musicKey);
        if (hit) return soundDisplayName(hit.name);
      }

      const nameFor = (
        items: BackgroundAudioItem[],
        key: string,
      ): string | null => {
        const k = key.trim();
        if (!k) return null;
        const hit = items.find((item) => item.key === k);
        return hit ? soundDisplayName(hit.name) : null;
      };

      // Same order as the Build-your-own faders: Music, Ambience, Drums, Noise.
      const names = [
        nameFor(mixMusic, mix.musicKey),
        nameFor(mixNature, mix.natureKey),
        nameFor(mixDrums, mix.drumsKey),
        nameFor(mixNoise, mix.noiseKey),
      ].filter((n): n is string => Boolean(n));

      if (names.length === 0) return "Focus sounds";
      return `Focus Mix: ${names.join(", ")}`;
    },
    [mixMusic, mixNature, mixDrums, mixNoise],
  );

  const syncFocusAmbientPlayer = useCallback(
    (mix: MixEditorValues) => {
      unlockHtmlMediaPlayback();
      const mediaBase = getMedimadeMediaBaseUrl();
      const next = trackFromFocusMix(mix, {
        mediaBase,
        compositions: mixCompositionsRef.current,
        title: focusAmbientTitle(mix),
      });
      const playingFocus =
        nowPlaying?.s3Key?.startsWith(FOCUS_AMBIENT_S3_PREFIX) === true;
      if (!next) {
        if (playingFocus) dismiss();
        return;
      }
      // Same stem already loaded — resume if paused; never toggle off on re-sync
      // (closing the flyout re-persists and must not pause).
      if (playingFocus && nowPlaying?.s3Key === next.s3Key) {
        if (playingS3Key !== next.s3Key) toggleCurrent();
        return;
      }
      if (
        playingFocus &&
        nowPlaying &&
        next.ambientKind === "mix" &&
        nowPlaying.ambientKind === "mix"
      ) {
        patchNowPlaying(() => next);
        return;
      }
      playTrack(next);
    },
    [
      dismiss,
      focusAmbientTitle,
      nowPlaying,
      patchNowPlaying,
      playTrack,
      playingS3Key,
      toggleCurrent,
    ],
  );

  const persistFocusMix = useCallback(
    (mix: MixEditorValues) => {
      setFocusMix(mix);
      saveFocusMix(mix);
      syncFocusAmbientPlayer(mix);
    },
    [syncFocusAmbientPlayer],
  );

  /** Save mix without touching the strip — used when closing the flyout. */
  const saveFocusMixOnly = useCallback((mix: MixEditorValues) => {
    setFocusMix(mix);
    saveFocusMix(mix);
  }, []);

  const closeMixPanel = useCallback(() => {
    setMixPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!patternPickerOpen) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (patternPickerRef.current?.contains(t)) return;
      setPatternPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPatternPickerOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [patternPickerOpen]);

  useEffect(() => {
    if (!running) {
      endAtRef.current = null;
      return;
    }
    endAtRef.current = Date.now() + remainingRef.current * 1000;
    const id = window.setInterval(() => {
      const endAt = endAtRef.current;
      if (endAt == null) return;
      const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemainingSec(next);
      if (next <= 0) {
        endAtRef.current = null;
        setRemainingSec(0);
        onElapsedRef.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running, epoch]);

  useEffect(() => {
    if (!tasksOpen && !ideateFlyoutOpen && !manifestOpen) return;
    const sync = () => setIdeateStore(loadIdeateStore());
    sync();
    void pullIdeateStoreFromCloud().finally(sync);
    return subscribeIdeateCloud(sync);
  }, [tasksOpen, ideateFlyoutOpen, manifestOpen]);

  // Keep Focus checkboxes aligned with Ideate when life-area todos change.
  useEffect(() => {
    const syncDone = () => {
      const store = loadIdeateStore();
      setTasks((prev) => {
        const next = syncFocusDoneFromIdeate(prev, store);
        if (next !== prev) writeFocusTasksList(next);
        return next;
      });
    };
    syncDone();
    return subscribeIdeateCloud(syncDone);
  }, []);

  useEffect(() => {
    if (!ideateFlyoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeIdeateFlyout();
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ideateFlyoutRef.current?.contains(t)) return;
      if (ideateButtonRef.current?.contains(t)) return;
      closeIdeateFlyout();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
    // closeIdeateFlyout is stable enough via setters; intentional deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideateFlyoutOpen]);

  const progress = useMemo(() => {
    if (durationSec <= 0) return 1;
    return Math.min(1, Math.max(0, (durationSec - remainingSec) / durationSec));
  }, [durationSec, remainingSec]);

  const clock = splitMmSs(remainingSec);

  const lifeAreas = useMemo(() => {
    if (!ideateStore) return [];
    return [...ideateStore.dreams]
      .filter((d) => !isDemoIdeateDream(d) && !d.completedAt)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
  }, [ideateStore]);

  const areaTasks = useMemo(() => {
    if (!ideateStore || !selectedArea) return [];
    return subtasksForProject(ideateStore, selectedArea.id);
  }, [ideateStore, selectedArea]);

  const taskTodos = useMemo(() => {
    if (!ideateStore || !selectedTask) return [];
    return todosForSubtask(ideateStore, selectedTask.id);
  }, [ideateStore, selectedTask]);

  const pickSet = useMemo(
    () => new Set(ideatePicks.map(pickKey)),
    [ideatePicks],
  );

  function applyDuration(seconds: number) {
    setDurationSec(seconds);
    setRemainingSec(seconds);
    remainingRef.current = seconds;
    setRunning(false);
    endAtRef.current = null;
  }

  function selectMode(next: TimerMode) {
    if (next === mode) return;
    setMode(next);
    const mins =
      next === "focus" ? focusMinutes : MODE_DEFAULT_MINUTES[next];
    applyDuration(mins * 60);
  }

  function selectFocusMinutes(mins: number) {
    setFocusMinutes(mins);
    if (mode === "focus") applyDuration(mins * 60);
  }

  function resetTimer() {
    applyDuration(durationSec);
  }

  function skipSession() {
    setRunning(false);
    endAtRef.current = null;
    if (mode === "focus" && remainingSec < durationSec) {
      setSessionsToday((prev) => {
        const count = prev + 1;
        writeSessionsCompletedToday(count);
        return count;
      });
    }
    const mins =
      mode === "focus" ? focusMinutes : MODE_DEFAULT_MINUTES[mode];
    applyDuration(mins * 60);
  }

  function toggleRunning() {
    if (remainingSec <= 0) {
      const mins =
        mode === "focus" ? focusMinutes : MODE_DEFAULT_MINUTES[mode];
      applyDuration(mins * 60);
      setRunning(true);
      return;
    }
    setRunning((v) => !v);
  }

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => () => {
    strikeTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function persistTasks(next: FocusTaskItem[]) {
    tasksRef.current = next;
    setTasks(next);
    writeFocusTasksList(next);
  }

  function toggleTaskDone(id: string) {
    const item = tasksRef.current.find((t) => t.id === id);
    if (!item) return;
    const nextDone = !item.done;
    if (item.ideateKind && item.ideateId) {
      const store = writeIdeateDoneFromFocus(
        item.ideateKind,
        item.ideateId,
        nextDone,
      );
      if (store) setIdeateStore(store);
    }
    const next = tasksRef.current.map((t) =>
      t.id === id ? { ...t, done: nextDone, inSession: false } : t,
    );
    persistTasks([
      ...next.filter((task) => !task.done),
      ...next.filter((task) => task.done),
    ]);
  }

  function requestToggle(id: string) {
    const item = tasksRef.current.find((task) => task.id === id);
    if (!item || strikingRef.current.has(id)) return;
    if (item.done || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      toggleTaskDone(id);
      return;
    }
    strikingRef.current.add(id);
    setStrikingIds(new Set(strikingRef.current));
    const timer = window.setTimeout(() => {
      toggleTaskDone(id);
      strikingRef.current.delete(id);
      setStrikingIds(new Set(strikingRef.current));
    }, 480);
    strikeTimers.current.push(timer);
  }

  function reorderTodo(id: string, index: number) {
    const todo = tasksRef.current.filter((task) => !task.done);
    const done = tasksRef.current.filter((task) => task.done);
    const from = todo.findIndex((task) => task.id === id);
    if (from < 0 || from === index) return;
    const [item] = todo.splice(from, 1);
    if (!item) return;
    const at = from < index ? index - 1 : index;
    todo.splice(Math.max(0, Math.min(at, todo.length)), 0, item);
    persistTasks([...todo, ...done]);
  }

  function appendTasks(additions: FocusTaskItem[]) {
    if (!additions.length) return;
    const todo = tasks.filter((task) => !task.done);
    const done = tasks.filter((task) => task.done);
    for (const item of additions) {
      if (item.done) done.push({ ...item, inSession: false });
      else todo.push({ ...item, inSession: true });
    }
    persistTasks([...todo, ...done]);
  }

  function removeTask(id: string) {
    persistTasks(tasks.filter((t) => t.id !== id));
  }

  function addTaskFromMainInput() {
    const text = taskInput.trim();
    if (!text) return;
    appendTasks([{ id: newFocusTaskId(), text, done: false }]);
    setTaskInput("");
  }

  function addTask() {
    const text = draftTask.trim();
    if (!text) return;
    appendTasks([{ id: newFocusTaskId(), text, done: false }]);
    setDraftTask("");
  }

  function openTasksDrawer() {
    setDrawerTab("session");
    setIdeateLevel("areas");
    setSelectedArea(null);
    setSelectedTask(null);
    setIdeatePicks([]);
    setIdeateFlyoutOpen(false);
    setTasksOpen(true);
  }

  function closeIdeateFlyout() {
    setIdeateFlyoutOpen(false);
    setIdeateLevel("areas");
    setSelectedArea(null);
    setSelectedTask(null);
    setIdeatePicks([]);
  }

  function openIdeatePicker() {
    if (ideateFlyoutOpen) {
      closeIdeateFlyout();
      return;
    }
    setTasksOpen(false);
    setIdeateLevel("areas");
    setSelectedArea(null);
    setSelectedTask(null);
    setIdeatePicks([]);
    setIdeateFlyoutOpen(true);
  }

  function toggleIdeatePick(pick: IdeatePick) {
    const key = pickKey(pick);
    setIdeatePicks((prev) => {
      if (prev.some((p) => pickKey(p) === key)) {
        return prev.filter((p) => pickKey(p) !== key);
      }
      return [...prev, pick];
    });
  }

  function addIdeatePicksToSession() {
    if (!ideateStore || ideatePicks.length === 0) return;
    const existing = new Set(
      tasks
        .filter((t) => t.ideateKind && t.ideateId)
        .map((t) => `${t.ideateKind}:${t.ideateId}`),
    );
    const additions: FocusTaskItem[] = [];
    for (const pick of ideatePicks) {
      if (pick.kind !== "todo") continue;
      const key = pickKey(pick);
      if (existing.has(key)) continue;
      const todo = ideateStore.todos.find((t) => t.id === pick.id);
      if (!todo) continue;
      const sub = ideateStore.subtasks.find((s) => s.id === todo.subtaskId);
      const area = sub
        ? ideateStore.dreams.find((d) => d.id === sub.projectId)
        : undefined;
      additions.push({
        id: newFocusTaskId(),
        text: todo.title,
        done: todo.isChecked,
        lifeAreaId: area?.id ?? null,
        lifeAreaTitle: area?.title?.trim() || null,
        ideateKind: "todo",
        ideateId: todo.id,
      });
    }
    if (additions.length > 0) appendTasks(additions);
    setIdeatePicks([]);
    setIdeateLevel("areas");
    setSelectedArea(null);
    setSelectedTask(null);
    if (ideateFlyoutOpen) {
      setIdeateFlyoutOpen(false);
    } else {
      setDrawerTab("session");
    }
  }

  function drillIntoArea(area: PlanDream) {
    setSelectedArea(area);
    setSelectedTask(null);
    setIdeateLevel("tasks");
  }

  function drillIntoTask(task: IdeateSubtask) {
    setSelectedTask(task);
    setIdeateLevel("subtasks");
  }

  function ideateBack() {
    if (ideateLevel === "subtasks") {
      setSelectedTask(null);
      setIdeateLevel("tasks");
      return;
    }
    if (ideateLevel === "tasks") {
      setSelectedArea(null);
      setIdeateLevel("areas");
    }
  }

  function savePrefs(next: FocusSessionPrefs) {
    setPrefs(next);
    writeFocusSessionPrefs(next);
    setFocusMinutes(next.focusMinutes);
    if (running) return;
    if (mode === "focus" && next.focusMinutes !== prefs.focusMinutes) {
      applyDuration(next.focusMinutes * 60);
    }
    if (mode !== "focus") {
      const mins =
        mode === "longBreak" && next.longBreakEvery
          ? next.longBreakMinutes
          : next.breakMinutes;
      const prev =
        mode === "longBreak" && prefs.longBreakEvery
          ? prefs.longBreakMinutes
          : prefs.breakMinutes;
      if (mins !== prev) applyDuration(mins * 60);
    }
  }

  function beginTimer() {
    if (remainingSec <= 0) {
      const mins = mode === "focus" ? prefs.focusMinutes : mode === "longBreak" ? prefs.longBreakMinutes : prefs.breakMinutes;
      applyDuration(mins * 60);
    }
    setRunning(true);
  }

  onElapsedRef.current = () => {
    playSoftChime();
    if (mode === "focus") {
      const count = Math.min(12, sessionsToday + 1);
      writeSessionsCompletedToday(count);
      setSessionsToday(count);
      const long = prefs.longBreakEvery && count % 4 === 0;
      const mins = long ? prefs.longBreakMinutes : prefs.breakMinutes;
      setMode(long ? "longBreak" : "shortBreak");
      const sec = mins * 60;
      setDurationSec(sec);
      setRemainingSec(sec);
      remainingRef.current = sec;
      if (prefs.autoStartBreak) {
        setRunning(true);
        setEpoch((value) => value + 1);
      } else {
        setRunning(false);
      }
      return;
    }
    setMode("focus");
    const sec = prefs.focusMinutes * 60;
    setDurationSec(sec);
    setRemainingSec(sec);
    remainingRef.current = sec;
    if (prefs.autoStartFocus) {
      setRunning(true);
      setEpoch((value) => value + 1);
    } else {
      setRunning(false);
    }
  };

  async function startSession() {
    const session = tasks.filter((task) => !task.done);
    if (prefs.meditateFirst && mode === "focus" && session.length > 0) {
      const store = loadIdeateStore();
      const areaIds = [...new Set(session.map((task) => task.lifeAreaId).filter((id): id is string => Boolean(id)))];
      const area = areaIds.length === 1
        ? store.dreams.find((dream) => dream.id === areaIds[0])
        : undefined;
      const lines = session.map((task) =>
        task.lifeAreaTitle ? `${task.text} (${task.lifeAreaTitle})` : task.text,
      );
      const lead = session[0]!;
      writeFocusActiveIdeateSubtask(lead.id);
      upsertFocusPreflightLink({
        subtaskId: lead.id,
        jobId: null,
        title: `Pre-focus · ${lines.join(", ")}`.slice(0, 80),
        status: "starting",
        createdAt: new Date().toISOString(),
      });
      setPreflight(readActiveFocusPreflightLink());
      meditatePlayed.current = false;
      setMeditateGate(true);
      try {
        await startFocusPreflightMeditationGeneration({
          goalTitle: area?.title?.trim() || (session.length === 1 ? lead.text : "This focus session"),
          visionText: area?.visionText?.trim() || lines.join("\n"),
          dreamText: area?.dreamText?.trim() || undefined,
          obstacleText: area?.obstacleText?.trim() || undefined,
          lifeAreaId: area?.id,
          focusSubtaskId: lead.id,
          focusTaskContext: lines.join("\n"),
        });
      } catch {
        setMeditateGate(false);
        beginTimer();
      }
      return;
    }
    beginTimer();
  }

  useEffect(() => {
    if (!meditateGate || !preflight) return;
    if (preflight.status === "failed") {
      setMeditateGate(false);
      beginTimer();
      return;
    }
    if (preflight.status !== "ready" || meditatePlayed.current) return;
    meditatePlayed.current = true;
    void playPreflightMeditation();
  }, [meditateGate, preflight, playPreflightMeditation]);

  useEffect(() => {
    if (!meditateGate || preflight?.status !== "ready") return;
    const id = window.setTimeout(() => {
      if (meditateHeard.current || !meditateGate) return;
      setMeditateGate(false);
      beginTimer();
    }, 15000);
    return () => window.clearTimeout(id);
    // beginTimer reads the latest idle timer when the meditation never starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meditateGate, preflight?.status]);

  useEffect(() => {
    if (!meditateGate || !meditatePlayed.current) return;
    const key = preflight?.audioKey?.trim();
    if (!key) return;
    if (playingS3Key === key) {
      meditateHeard.current = true;
      return;
    }
    if (meditateHeard.current) {
      meditateHeard.current = false;
      setMeditateGate(false);
      beginTimer();
    }
    // beginTimer closes over the latest timer state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meditateGate, playingS3Key, preflight]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!sessionMenu) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-session-menu]")) return;
      setSessionMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSessionMenu(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [sessionMenu]);

  const modeOptions = [
    { id: "focus" as const, label: "Focus" },
    { id: "shortBreak" as const, label: "Short break" },
    { id: "longBreak" as const, label: "Long break" },
  ];

  const durationOptions = FOCUS_DURATION_OPTIONS.map((m) => ({
    id: String(m),
    label: String(m),
  }));

  const drawerTabOptions = [
    { id: "session" as const, label: "Session tasks" },
    { id: "ideate" as const, label: "Import from Manifest" },
  ];

  function taskCountForArea(areaId: string): number {
    if (!ideateStore) return 0;
    return subtasksForProject(ideateStore, areaId).length;
  }

  function todosForTask(task: IdeateSubtask): IdeateTodo[] {
    if (!ideateStore) return [];
    return todosForSubtask(ideateStore, task.id);
  }

  const ideateFlyout = ideateFlyoutOpen ? (
    <div
      ref={ideateFlyoutRef}
      role="dialog"
      aria-label="Add from Manifest"
      className="focus-ideate-flyout absolute left-0 top-full z-[160] mt-2 w-[min(100vw-2rem,18.5rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
        {ideateLevel !== "areas" ? (
          <button
            type="button"
            onClick={ideateBack}
            aria-label="Back"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-nav-active hover:text-foreground"
          >
            <ChevronLeft />
          </button>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-left text-[10px] font-semibold uppercase tracking-wide text-muted">
          {ideateLevel === "areas" ? (
            "Life areas"
          ) : (
            <>
              {selectedArea?.title?.trim() || "Life area"}
              {selectedTask ? (
                <>
                  <span className="mx-1 normal-case tracking-normal text-muted/60">
                    →
                  </span>
                  <span className="normal-case tracking-normal text-foreground">
                    {selectedTask.title}
                  </span>
                </>
              ) : null}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={closeIdeateFlyout}
          aria-label="Close"
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-nav-active hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="max-h-[min(50vh,22rem)] overflow-y-auto px-2 py-2">
        {ideateLevel === "areas" ? (
          lifeAreas.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">
              No life areas yet.{" "}
              <Link
                to="/manifest/my?new=1"
                className="font-medium text-accent-link underline-offset-2 hover:underline"
              >
                Add one in Manifest
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col">
              {lifeAreas.map((area) => {
                const count = taskCountForArea(area.id);
                return (
                  <li key={area.id}>
                    <button
                      type="button"
                      onClick={() => drillIntoArea(area)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-nav-active"
                    >
                      <span className="min-w-0 flex-1 font-display text-[15px] font-medium tracking-tight text-foreground">
                        {area.title.trim() || "Untitled"}
                      </span>
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {count}
                      </span>
                      <ChevronRight className="shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {ideateLevel === "tasks" ? (
          areaTasks.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">
              No goals in this life area.
            </p>
          ) : (
            <ul className="flex flex-col">
              {areaTasks.map((task) => {
                const todos = todosForTask(task);
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => drillIntoTask(task)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-nav-active"
                    >
                      <span className="min-w-0 flex-1 text-[14px] text-foreground">
                        {task.title}
                      </span>
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {todos.length}
                      </span>
                      <ChevronRight className="shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {ideateLevel === "subtasks" ? (
          taskTodos.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">
              No To Dos under this goal.
            </p>
          ) : (
            <ul className="flex flex-col">
              {taskTodos.map((todo) => {
                const checked = pickSet.has(
                  pickKey({ kind: "todo", id: todo.id }),
                );
                return (
                  <li key={todo.id}>
                    <button
                      type="button"
                      onClick={() =>
                        toggleIdeatePick({
                          kind: "todo",
                          id: todo.id,
                        })
                      }
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-nav-active"
                    >
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          checked
                            ? "border-accent bg-accent-soft text-accent-link"
                            : "border-border text-transparent"
                        }`}
                        aria-hidden
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1 text-[14px] text-foreground">
                        {todo.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>

      <div className="border-t border-border/70 p-3">
        <button
          type="button"
          disabled={ideatePicks.length === 0}
          onClick={addIdeatePicksToSession}
          className="accent-fill-gradient w-full cursor-pointer rounded-full px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add to session
          {ideatePicks.length > 0 ? ` (${ideatePicks.length})` : ""}
        </button>
      </div>
    </div>
  ) : null;

  const openCount = tasks.filter((task) => !task.done).length;
  const doneCount = tasks.length - openCount;
  const sessionTasks = tasks.filter((task) => !task.done);
  const leadTask = sessionTasks[0] ?? null;
  const phaseBreak = mode !== "focus";
  const goalCountLabel = sessionTasks.length === 1 ? "1 to do" : `${sessionTasks.length} to do`;

  const focusGoalsCard = () => {
    if (!wide) setGoalsSheet(true);
    window.setTimeout(() => document.getElementById("focus-add-goal")?.focus(), wide ? 0 : 80);
  };

  const chipClass =
    "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13.5px] text-[#4A4652] disabled:cursor-default";

  const timingChips = (
    <div
      className={`relative flex max-w-full flex-wrap items-center justify-center gap-2 ${running ? "pointer-events-none opacity-45" : ""}`}
    >
      <button type="button" onClick={() => setTimingOpen((open) => !open)} disabled={running} className={chipClass}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A6424" strokeWidth="1.7" aria-hidden><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>
        Focus <b className="font-semibold text-foreground">{prefs.focusMinutes} min</b>
        <SelectChevron open={timingOpen} />
      </button>
      <button type="button" onClick={() => setTimingOpen((open) => !open)} disabled={running} className={chipClass}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A6424" strokeWidth="1.7" aria-hidden><path d="M5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5z"/><path d="M16 11h2a2 2 0 010 4h-2"/></svg>
        Break <b className="font-semibold text-foreground">{prefs.breakMinutes} min</b>
        <SelectChevron open={timingOpen} />
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={prefs.meditateFirst}
        disabled={running}
        onClick={() => savePrefs({ ...prefs, meditateFirst: !prefs.meditateFirst })}
        className={chipClass}
      >
        <span className="relative h-6 w-10 shrink-0 rounded-full" style={{ background: prefs.meditateFirst ? "#0F1B2D" : "#D9D1C2" }} aria-hidden>
          <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white" style={{ left: prefs.meditateFirst ? 19 : 3 }} />
        </span>
        2-min meditation first
      </button>
      {timingOpen && !running ? (
        <SessionTimingPopover prefs={prefs} onChange={savePrefs} onClose={() => setTimingOpen(false)} />
      ) : null}
    </div>
  );

  const transport = (
    <div className="flex shrink-0 items-center justify-center gap-3.5">
      <button
        type="button"
        aria-label="Restart"
        disabled={!running}
        onClick={() => { remainingRef.current = durationSec; setRemainingSec(durationSec); setEpoch((value) => value + 1); }}
        className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground disabled:cursor-default disabled:opacity-35"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12a8 8 0 1 0 8-8 8 8 0 0 0-6 2.7"/><path d="M4 4v4h4"/></svg>
      </button>
      <button
        type="button"
        onClick={() => { if (running) toggleRunning(); else void startSession(); }}
        disabled={!running && meditateGate}
        className="inline-flex h-[52px] w-[170px] shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#AFC2DC] bg-accent-button text-[14px] font-semibold text-on-accent disabled:cursor-default disabled:opacity-60"
      >
        {running ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M8 5v14M16 5v14"/></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z"/></svg>
        )}
        {running ? "Pause" : meditateGate ? "Writing…" : "Start"}
      </button>
      <button
        type="button"
        aria-label="Skip"
        disabled={!running}
        onClick={() => onElapsedRef.current()}
        className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground disabled:cursor-default disabled:opacity-35"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 5l9 7-9 7z"/><path d="M18 5v14"/></svg>
      </button>
    </div>
  );

  const goalsBody = (scrollList: boolean) => (
    <div className={`flex flex-col gap-2.5 ${scrollList ? "min-h-0 flex-1" : ""} ${running ? "opacity-[0.55]" : ""}`}>
      <div className="flex items-center justify-between px-1.5">
        <p className="text-[13px] font-semibold text-[#8A6424]">Today's goals</p>
        <p className="text-[12.5px] font-semibold text-[#8A6424]">{doneCount} of {tasks.length} done</p>
      </div>
      <form
        className="flex h-[42px] items-center gap-2 rounded-xl border border-border bg-card px-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          addTaskFromMainInput();
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-muted" aria-hidden><path d="M12 5v14M5 12h14"/></svg>
        <input
          value={taskInput}
          onChange={(event) => setTaskInput(event.target.value)}
          placeholder="Add a goal"
          aria-label="Add a goal"
          id="focus-add-goal"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted"
        />
      </form>
      <button
        type="button"
        onClick={() => {
          setIdeateStore(loadIdeateStore());
          setManifestOpen(true);
        }}
        className="inline-flex h-[34px] w-fit cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-[14px] font-semibold text-foreground"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>
        Add from Manifest
      </button>
      <div className={scrollList ? "min-h-0 flex-1 overflow-y-auto" : undefined}>
        <GoalRows tasks={tasks} strikingIds={strikingIds} onToggle={requestToggle} onRemove={removeTask} onReorder={reorderTodo} />
      </div>
    </div>
  );

  return (
    <div
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pt-4 md:px-7 md:pt-5"
      style={{ paddingBottom: Math.max(wide ? 20 : 16, playerStripHeightPx + 12) }}
    >
      <div className={wide ? "flex min-h-0 flex-1 items-stretch gap-[18px]" : "flex min-h-0 flex-1 flex-col gap-3"}>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 rounded-[18px] border border-border bg-card px-4 pb-[22px] pt-[18px] shadow-[0_2px_12px_rgba(15,27,45,0.05)] md:px-[22px]">
            <div className="flex items-center justify-between gap-3">
              <span
                className="inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold"
                style={phaseBreak ? { background: "rgba(6,118,71,0.12)", color: "#067647" } : { background: "#0F1B2D", color: "#F6F1E7" }}
              >
                {phaseBreak ? "Break" : "Focus"}
              </span>
              <div className="flex items-center gap-2.5">
                <TimerStyleMenu display={prefs.display} onChange={(display) => savePrefs({ ...prefs, display })} />
                <button type="button" aria-label="Full screen" onClick={() => setFullscreen(true)} className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[18px]">
              <div className="relative w-full shrink-0" data-session-menu="">
                <div className="flex h-[58px] w-full flex-col items-center justify-start gap-2 overflow-hidden">
                  <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-muted">
                    {phaseBreak ? "Up next after your break" : `Today's goals · ${goalCountLabel}`}
                  </p>
                  {leadTask ? (
                    <div className="flex w-full min-w-0 items-center justify-center gap-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <GoalTick
                          size={18}
                          striking={strikingIds.has(leadTask.id)}
                          done={false}
                          label={`Tick ${leadTask.text}`}
                          onClick={() => requestToggle(leadTask.id)}
                        />
                        <FocusStrikeTitle
                          text={leadTask.text}
                          striking={strikingIds.has(leadTask.id)}
                          className="text-[15px] font-semibold"
                        />
                        {leadTask.lifeAreaTitle ? (
                          <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-[#F6EEDD] px-[7px] text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8A6424]">
                            {leadTask.lifeAreaTitle}
                          </span>
                        ) : null}
                      </span>
                      {sessionTasks.length > 1 ? (
                        <button
                          type="button"
                          aria-expanded={sessionMenu}
                          onClick={() => setSessionMenu((open) => !open)}
                          className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-0.5 rounded-full border border-border bg-card px-[9px] text-[12px] font-semibold text-foreground"
                        >
                          +{sessionTasks.length - 1} more
                          <SelectChevron open={sessionMenu} />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button type="button" onClick={focusGoalsCard} className="cursor-pointer text-[15px] font-semibold text-accent-link">
                      Add a goal
                    </button>
                  )}
                </div>
                {sessionMenu && sessionTasks.length > 1 ? (
                  <div
                    role="dialog"
                    aria-label="Today's goals"
                    className="absolute left-1/2 top-[66px] z-30 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 rounded-[18px] border border-border bg-card px-3.5 py-3 shadow-[0_18px_44px_rgba(15,27,45,0.18)]"
                  >
                    <p className="px-1.5 pb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
                      Today's goals · {goalCountLabel}
                    </p>
                    {sessionTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2.5 border-t border-border px-1.5 py-2">
                        <GoalTick
                          size={18}
                          striking={strikingIds.has(task.id)}
                          done={false}
                          label={`Tick ${task.text}`}
                          onClick={() => requestToggle(task.id)}
                        />
                        <FocusStrikeTitle
                          text={task.text}
                          striking={strikingIds.has(task.id)}
                          className="flex-1 text-[14px]"
                        />
                        {task.lifeAreaTitle ? (
                          <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-[#F6EEDD] px-[7px] text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8A6424]">
                            {task.lifeAreaTitle}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex min-h-0 w-full max-h-[62%] flex-1 items-center justify-center">
                <FittedTimerFace display={prefs.display} remainingSec={remainingSec} durationSec={durationSec} progress={progress} />
              </div>
              {transport}
              {timingChips}
            </div>
          </section>
        {wide ? (
          <section className="flex min-h-0 w-[380px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-border bg-card px-4 py-[18px] shadow-[0_2px_12px_rgba(15,27,45,0.05)]">
            {goalsBody(true)}
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setGoalsSheet(true)}
            className="flex h-12 w-full shrink-0 cursor-pointer items-center justify-between rounded-[14px] border border-border bg-card px-4 text-left text-[14px] font-semibold text-foreground"
          >
            <span>{openCount} to do · {doneCount} done</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        )}
      </div>

      {!wide && goalsSheet ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={() => setGoalsSheet(false)}>
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-[18px] bg-card px-4 py-4" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Today's goals">
            {goalsBody(false)}
          </div>
        </div>
      ) : null}

      {fullscreen ? (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-8 px-6" style={{ background: "#0F1B2D", color: "#F6F1E7" }}>
          <button type="button" aria-label="Close full screen" onClick={() => setFullscreen(false)} className="absolute right-5 top-5 cursor-pointer text-[#F6F1E7]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
          <p className="text-center text-[18px] font-semibold">{leadTask?.text || "Focus"}</p>
          <TimerFace display={prefs.display} remainingSec={remainingSec} durationSec={durationSec} progress={progress} light />
          {transport}
        </div>
      ) : null}

      {manifestOpen ? (
        <ManifestPicker
          store={ideateStore}
          existingIds={new Set(tasks.map((task) => task.ideateId).filter((id): id is string => Boolean(id)))}
          onClose={() => setManifestOpen(false)}
          onAdd={(items) => {
            const additions = items.map((item) => {
              const area = ideateStore?.dreams.find((dream) => dream.id === item.lifeAreaId);
              return {
                id: newFocusTaskId(),
                text: item.title,
                done: false,
                lifeAreaId: item.lifeAreaId,
                lifeAreaTitle: area?.title?.trim() || null,
                ideateKind: "tracker" as const,
                ideateId: item.id,
              };
            });
            if (additions.length) appendTasks(additions);
            setManifestOpen(false);
          }}
        />
      ) : null}

    </div>
  );
}
