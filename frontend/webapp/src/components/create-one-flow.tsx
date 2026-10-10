/**
 * One Create flow: Start → Shape → Sound (design: docs/design/app/CreateFlow*).
 * Reuses existing pickers, style questions, and generation API.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconRefresh } from "@tabler/icons-react";
import { CommunityCategoryGrid } from "@/components/community-category-grid";
import { AppPrimaryTabsDesktop } from "@/components/app-primary-tabs";
import { CreateFlowFooterBar } from "@/components/create-flow-footer-bar";
import { CreateFlowNavPill } from "@/components/create-flow-nav-pill";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { CreateOneFlowPickerShell } from "@/components/create-one-flow-picker-shell";
import { SelectChevron } from "@/components/select-chevron";
import { CreateOneFlowStepper } from "@/components/create-one-flow-stepper";
import { CreateProgramPicker } from "@/components/create-program-picker";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { JournalReflectPicker } from "@/components/journal-reflect-picker";
import { ManifestGoalPicker } from "@/components/manifest-goal-picker";
import { ChatMarkdown } from "@/components/chat-markdown";
import { MeditationLengthSelect } from "@/components/meditation-length-select";
import { CreateProgramSessionControl } from "@/components/create-program-session-control";
import {
  attachProgramExclusive,
  attachStyleExclusive,
  coerceMeditationLengthMinutes,
  effectiveSessionMinutes,
  programDefaultSessionMinutes,
  clearCreateOneFlowState,
  createOneFlowHref,
  emptyCreateOneFlowState,
  legacyCreatePathToOneFlow,
  parseCreateOneFlowStep,
  type CreateFlowContextKind,
  type CreateFlowGoalAttachment,
  type CreateFlowJournalAttachment,
  type CreateFlowChatTurn,
  type CreateFlowProgramAttachment,
  type CreateOneFlowState,
  type CreateOneFlowStep,
  type MeditationLengthMinutes,
} from "@/lib/create-one-flow-state";
import { CREATE_MEDITATE_ROOT } from "@/lib/create-meditation-path";
import {
  categoryImageUrlForTile,
  createContextCoverFallbacks,
  peekLibraryCategoryImageMap,
  prefetchLibraryCategoryImages,
  prefetchLibraryCategoryImagesForCreate,
} from "@/lib/library-category-images-cache";
import {
  buildProgramMakeOwnApiContent,
  programHandoffFromLibrary,
} from "@/components/create-program-handoff";
import {
  buildShapeContextBlock,
  buildShapeOpenUserContent,
  buildShapeStartOverridesSupplement,
  buildShapeTurnApiMessages,
  describeShapeStartChanges,
  fingerprintShapeStart,
  parseCoachDisplayText,
  resolveAimMarkers,
  collectStyleAimCoverage,
} from "@/lib/create-one-flow-chat";
import {
  MEDITATION_STYLE_LABELS,
  STYLE_INTAKE_QUESTIONS,
  intakeShortTitlesForStyle,
  type MeditationStyleLabel,
} from "@/lib/meditation-style-intake";
import {
  createMeditationAudioJob,
  coerceVoicePrefs,
  fetchLibraryCategoryImages,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
  listLibraryPrograms,
  streamMedimadeChat,
  type LibraryProgram,
} from "@/lib/medimade-api";
import { fetchUserSettings, patchUserSettings } from "@/lib/settings-api";
import {
  journalEntryPlainForHandoff,
  loadJournalStore,
  loadJournalStoreRaw,
  type JournalEntry,
  type JournalFolder,
} from "@/lib/journal-storage";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import {
  pullIdeateStoreFromCloud,
  subscribeIdeateCloud,
} from "@/lib/ideate-cloud";
import {
  loadIdeateStore,
  sortSubtasks,
  subtasksForProject,
} from "@/lib/plan-ideate-store";
import { appendPendingLibraryGeneration } from "@/lib/pending-library-generations";
import { ensurePendingMeditationJobPoller } from "@/lib/poll-pending-meditation-jobs";
import { buildMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";
import {
  CreateSoundStep,
  clearCreateSoundSessionOverridesLock,
  type CreateSoundSessionOverrideMeta,
  type CreateSoundStepHandle,
  type CreateSoundStepJobExtras,
} from "@/components/create-sound-step";

const EMPTY_SESSION_OVERRIDE_META: CreateSoundSessionOverrideMeta = {
  overrideCount: 0,
  overriddenSessionIds: [],
  focusSessionId: null,
  expanded: false,
  voiceDiffers: false,
  soundDiffers: false,
};

type PickerKind = "style" | "program" | "journal" | "goal" | null;

function isStyleLabel(s: string): s is MeditationStyleLabel {
  return (MEDITATION_STYLE_LABELS as readonly string[]).includes(s);
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function IconArrowLeft({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l4.2 4.2L19 7.5" />
    </svg>
  );
}

function ContextToken({
  visual,
  name,
  detail,
  onRemove,
  kindLabel,
}: {
  visual?: ReactNode;
  name: string;
  detail?: string | null;
  onRemove?: () => void;
  kindLabel?: string;
}) {
  const chip = (
    <span
      className={`inline-flex h-[34px] max-w-full items-center gap-2 rounded-[10px] border border-accent/40 bg-accent-soft/50 py-0 pr-1.5 text-[13px] ${
        visual ? "pl-1.5" : "pl-2.5"
      }`}
    >
      {visual ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md">
          {visual}
        </span>
      ) : null}
      <span className="min-w-0 truncate font-semibold text-foreground">{name}</span>
      {detail ? (
        <span className="hidden min-w-0 truncate text-[12px] text-muted sm:inline">
          {detail}
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </span>
  );
  if (!kindLabel) return chip;
  return (
    <span className="inline-flex min-w-0 max-w-full flex-col gap-0.5">
      <span className="px-0.5 text-[9px] font-semibold uppercase tracking-[1.4px] text-muted">
        {kindLabel}
      </span>
      {chip}
    </span>
  );
}

function ChatTypingIndicator() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 7000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div
      className="mb-1 flex w-full items-center justify-start gap-2.5 px-1 py-2.5"
      aria-live="polite"
      aria-label={slow ? "Taking longer than usual" : "Guide is typing"}
    >
      <div className="flex h-4 items-end gap-1.5">
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
        <span className="chat-typing-dot h-2 w-2 rounded-full bg-accent" />
      </div>
      {slow ? (
        <span className="text-sm text-muted">Taking longer than usual…</span>
      ) : null}
    </div>
  );
}

export function CreateOneFlow({
  seedJournalContext,
  seedPlanContext,
}: {
  seedJournalContext?: boolean;
  seedPlanContext?: boolean;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const step = parseCreateOneFlowStep(searchParams.get("step"));

  const [state, setState] = useState<CreateOneFlowState>(() => {
    clearCreateOneFlowState();
    return emptyCreateOneFlowState(5);
  });

  // Fresh mount has no draft — don't keep a mid-flow ?step= from a prior visit.
  useEffect(() => {
    if (step === "start") return;
    navigate(createOneFlowHref("start"), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchUserSettings()
      .then(({ settings }) => {
        if (!cancelled) setShowCreateHint(settings.meditate.showCreateHint);
      })
      .catch(() => {
        /* keep default true */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [picker, setPicker] = useState<PickerKind>(null);
  const [draftStyle, setDraftStyle] = useState<string>("");
  const [draftProgramId, setDraftProgramId] = useState<string | null>(null);
  const [draftJournalId, setDraftJournalId] = useState<string | null>(null);
  const [draftLifeAreaId, setDraftLifeAreaId] = useState<string | null>(null);
  const [draftGoalId, setDraftGoalId] = useState<string | null>(null);

  const [programs, setPrograms] = useState<LibraryProgram[]>([]);
  const [programsReady, setProgramsReady] = useState(false);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalFolders, setJournalFolders] = useState<JournalFolder[]>([]);
  const [journalReady, setJournalReady] = useState(false);
  const [lifeAreas, setLifeAreas] = useState<
    Array<{
      id: string;
      title: string;
      createdAt: string;
      dreamText: string;
      obstacleText: string;
      visionText: string;
      preview: string;
      goals: Array<{ id: string; title: string; preview: string; done: boolean }>;
    }>
  >([]);
  const [goalsReady, setGoalsReady] = useState(false);

  const [shapeInput, setShapeInput] = useState("");
  const [shapeBusy, setShapeBusy] = useState(false);
  const [programHeaderOpen, setProgramHeaderOpen] = useState(false);
  const [briefEditing, setBriefEditing] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showCreateHint, setShowCreateHint] = useState(true);
  const [soundPreviewPlaying, setSoundPreviewPlaying] = useState(false);
  const [soundSessionMeta, setSoundSessionMeta] =
    useState<CreateSoundSessionOverrideMeta>(EMPTY_SESSION_OVERRIDE_META);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const briefTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const threadStickToBottomRef = useRef(true);
  const soundStepRef = useRef<CreateSoundStepHandle | null>(null);
  useEffect(() => {
    if (step === "sound") return;
    soundStepRef.current?.stopPreviews();
    setSoundSessionMeta(EMPTY_SESSION_OVERRIDE_META);
  }, [step]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const shapeRequestIdRef = useRef(0);
  const programsRef = useRef(programs);
  programsRef.current = programs;
  const lifeAreasRef = useRef(lifeAreas);
  lifeAreasRef.current = lifeAreas;
  /** Byte-stable Start context for Anthropic prompt cache (set on first Shape entry). */
  const shapeCachedContextRef = useRef<string | null>(null);
  /** Fingerprint of Start fields last applied to the coach (seed or overrides). */
  const shapeAppliedFingerprintRef = useRef<string | null>(null);
  /** Uncached Start overrides vs the cached seed (kept until next Start sync). */
  const shapeOverridesSupplementRef = useRef<string | null>(null);

  const goStep = useCallback(
    (next: CreateOneFlowStep) => {
      navigate(createOneFlowHref(next), { replace: next === "start" });
      if (next === "shape") {
        window.setTimeout(() => {
          // Defined below; called after navigation lands on Shape.
          onEnterShapeStepRef.current?.();
        }, 0);
      }
    },
    [navigate],
  );
  const onEnterShapeStepRef = useRef<(() => void) | null>(null);

  const [categoryImageUrls, setCategoryImageUrls] = useState<
    Partial<Record<string, string>>
  >(() => ({
    ...createContextCoverFallbacks(),
    ...peekLibraryCategoryImageMap(),
  }));

  // Warm style-panel + Add context covers as soon as Create mounts.
  useEffect(() => {
    let cancelled = false;
    prefetchLibraryCategoryImagesForCreate();
    void fetchLibraryCategoryImages()
      .then((list) => {
        if (cancelled) return;
        const map: Partial<Record<string, string>> = {
          ...createContextCoverFallbacks(),
          ...peekLibraryCategoryImageMap(),
        };
        for (const img of list) {
          if (img.category && img.imageUrl) {
            map[img.category] = img.imageUrl;
            if (img.category === "All") map.all = img.imageUrl;
          }
        }
        setCategoryImageUrls(map);
        void prefetchLibraryCategoryImages({ force: true }).catch(() => {});
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryImageUrls((prev) => ({
            ...createContextCoverFallbacks(),
            ...prev,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Legacy path → one-flow step
  useEffect(() => {
    const path = window.location.pathname;
    if (!path.startsWith(CREATE_MEDITATE_ROOT)) return;
    if (path === CREATE_MEDITATE_ROOT || path === `${CREATE_MEDITATE_ROOT}/`) {
      return;
    }
    const mapped = legacyCreatePathToOneFlow(path);
    const qs = new URLSearchParams(window.location.search);
    qs.set("step", mapped.step);
    if (mapped.seed) qs.set("seed", mapped.seed);
    navigate(`${CREATE_MEDITATE_ROOT}?${qs.toString()}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const seed = searchParams.get("seed");
    if (seed === "style" || seed === "program" || seed === "journal" || seed === "goal") {
      setPicker(seed);
      const next = new URLSearchParams(searchParams);
      next.delete("seed");
      setSearchParams(next, { replace: true });
    } else if (seed === "chat") {
      goStep("shape");
      const next = new URLSearchParams(searchParams);
      next.delete("seed");
      setSearchParams(next, { replace: true });
    } else if (seedJournalContext) {
      setPicker("journal");
    } else if (seedPlanContext) {
      setPicker("goal");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot handoff seeds

  useEffect(() => {
    let cancelled = false;
    void listLibraryPrograms()
      .then((list) => {
        if (!cancelled) {
          setPrograms(list);
          setProgramsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setProgramsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const signedIn = Boolean(getMedimadeSessionJwt());
    const local = signedIn ? loadJournalStoreRaw() : loadJournalStore();
    setJournalEntries(local.entries);
    setJournalFolders(local.folders ?? []);
    setJournalReady(true);
  }, []);

  useEffect(() => {
    const syncLifeAreas = () => {
      try {
        const store = loadIdeateStore();
        const dreams = store.dreams.filter((d) => !isDemoIdeateDream(d));
        setLifeAreas(
          dreams.map((d) => {
            const goals = sortSubtasks(
              subtasksForProject(store, d.id),
              "updated_desc",
            ).map((s) => ({
              id: s.id,
              title: s.title,
              preview: (
                s.dreamText.trim() ||
                s.visionText.trim() ||
                s.resistanceText.trim() ||
                ""
              ).slice(0, 160),
              done: s.status === "done",
            }));
            return {
              id: d.id,
              title: d.title?.trim() || "Life area",
              createdAt: d.createdAt ?? new Date().toISOString(),
              dreamText: d.dreamText ?? "",
              obstacleText: d.obstacleText ?? "",
              visionText: d.visionText ?? "",
              preview: d.dreamText ?? "",
              goals,
            };
          }),
        );
      } catch {
        setLifeAreas([]);
      }
      setGoalsReady(true);
    };
    syncLifeAreas();
    const unsub = subscribeIdeateCloud(syncLifeAreas);
    if (isMedimadeSessionActive()) {
      void pullIdeateStoreFromCloud().finally(syncLifeAreas);
    }
    window.addEventListener("medimade-session-changed", syncLifeAreas);
    return () => {
      unsub();
      window.removeEventListener("medimade-session-changed", syncLifeAreas);
    };
  }, []);

  const styleQuestions = useMemo(() => {
    if (!state.style) return [] as string[];
    return [...(STYLE_INTAKE_QUESTIONS[state.style.id] ?? [])];
  }, [state.style]);

  const styleQuestionShortTitles = useMemo(() => {
    if (!state.style) return [] as string[];
    return [...intakeShortTitlesForStyle(state.style.id)];
  }, [state.style]);

  /** Skip legacy first user bubble that duplicated the Start brief. */
  const visibleChat = useMemo(() => {
    const prompt = state.prompt.trim();
    if (
      state.chat.length > 0 &&
      state.chat[0]?.role === "user" &&
      prompt &&
      state.chat[0].text.trim() === prompt
    ) {
      return state.chat.slice(1);
    }
    return state.chat;
  }, [state.chat, state.prompt]);

  const styleQuestionStatuses = useMemo(() => {
    const { covered, ready } = collectStyleAimCoverage(
      state.chat,
      styleQuestions,
      styleQuestionShortTitles,
    );
    return styleQuestions.map((_, i) => {
      if (ready) return true;
      return Boolean(state.answers[String(i)]?.trim()) || covered.has(i);
    });
  }, [styleQuestions, styleQuestionShortTitles, state.answers, state.chat]);

  const styleQuestionDoneCount = styleQuestionStatuses.filter(Boolean).length;
  const styleQuestionCurrentIndex = styleQuestionStatuses.findIndex((d) => !d);
  const styleQuestionProgressLabel =
    styleQuestions.length === 0
      ? ""
      : `${styleQuestionDoneCount} of ${styleQuestions.length}`;
  const shapeCanProceedToSound =
    state.chat.some((m) => m.role === "assistant" && m.ready) ||
    (styleQuestions.length > 0 && styleQuestionStatuses.every(Boolean));

  useEffect(() => {
    if (!briefEditing) return;
    const el = briefTextareaRef.current;
    if (!el) return;
    el.focus();
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [briefEditing, briefDraft]);

  const scrollShapeThreadToBottom = useCallback(() => {
    threadStickToBottomRef.current = true;
    const el = threadScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (step !== "shape") return;
    scrollShapeThreadToBottom();
    const id = window.requestAnimationFrame(() => scrollShapeThreadToBottom());
    return () => window.cancelAnimationFrame(id);
  }, [visibleChat, state.chat, shapeBusy, step, scrollShapeThreadToBottom]);

  /** Add chips on Shape — format + context (thin header & cards). */
  const shapeAddOptions: Array<{
    kind: "style" | "program" | "journal" | "goal";
    label: string;
  }> = [];
  // Style and Program are exclusive — only offer either when neither is attached.
  if (!state.style && !state.program) {
    shapeAddOptions.push({ kind: "style", label: "Style" });
    shapeAddOptions.push({ kind: "program", label: "Program" });
  }
  shapeAddOptions.push({ kind: "journal", label: "Journal" });
  if (!state.goal) shapeAddOptions.push({ kind: "goal", label: "Goal" });
  const shapeFormatAddOptions = shapeAddOptions.filter(
    (o) => o.kind === "style" || o.kind === "program",
  );
  const shapeContextAddOptions = shapeAddOptions.filter(
    (o) => o.kind === "journal" || o.kind === "goal",
  );

  const attachedProgramDays = useMemo(() => {
    if (!state.program) return [];
    return programs.find((p) => p.id === state.program!.id)?.days ?? [];
  }, [programs, state.program]);

  function sessionDefaultMinutes(sessionId: string): MeditationLengthMinutes {
    return programDefaultSessionMinutes(attachedProgramDays, sessionId);
  }

  function sessionEffectiveMinutes(sessionId: string): MeditationLengthMinutes {
    if (!state.program) return 5;
    return effectiveSessionMinutes(
      state.program,
      sessionId,
      sessionDefaultMinutes(sessionId),
    );
  }

  const programSelectedMinutesSum = useMemo(() => {
    if (!state.program || state.program.mode !== "perSession") return 0;
    return state.program.sessionIds.reduce(
      (sum, id) => sum + sessionEffectiveMinutes(id),
      0,
    );
    // sessionEffectiveMinutes closes over state.program + days
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.program, attachedProgramDays]);

  /** Chip label when a Program is attached (ProgramLengthChip). */
  const lengthChipLabel = useMemo(() => {
    if (!state.program) return undefined;
    if (state.program.mode === "one") {
      return `One meditation · ${state.lengthMinutes} min`;
    }
    const k = state.program.sessionIds.length;
    return `${k} session${k === 1 ? "" : "s"} · ≈${programSelectedMinutesSum} min`;
  }, [state.program, state.lengthMinutes, programSelectedMinutesSum]);

  function resetProgramToDefaults() {
    setState((p) => {
      if (!p.program) return p;
      return {
        ...p,
        lengthMinutes: 5,
        program: {
          ...p.program,
          mode: "perSession",
          sessionIds: Object.keys(p.program.sessionTitles),
          sessionLengthOverrides: {},
        },
      };
    });
  }

  const programSessionControl =
    state.program ? (
      <CreateProgramSessionControl
        mode={state.program.mode}
        onModeChange={setProgramMode}
        sessions={Object.entries(state.program.sessionTitles).map(
          ([id, title]) => ({ id, title }),
        )}
        selectedIds={state.program.sessionIds}
        onToggleSession={toggleProgramSession}
        onSelectAll={setAllProgramSessions}
        selectedMinutesSum={programSelectedMinutesSum}
        sessionDefaultMinutes={sessionDefaultMinutes}
        sessionEffectiveMinutes={sessionEffectiveMinutes}
        onSessionLengthChange={setSessionLengthOverride}
        onSessionLengthReset={(id) => setSessionLengthOverride(id, null)}
        oneMeditationMinutes={state.lengthMinutes}
        onOneMeditationMinutesChange={(mins) =>
          setState((p) => ({ ...p, lengthMinutes: mins }))
        }
      />
    ) : null;

  const renderLengthChip = (
    size: "default" | "compact" = "default",
    opts?: { disabled?: boolean },
  ) => {
    const disabled = Boolean(opts?.disabled);
    const programPanel =
      state.program && !disabled
        ? {
            width: 320,
            content: (
              <>
                {programSessionControl}
                <div className="flex items-center justify-between gap-2 border-t border-border px-1 pb-0.5 pt-2.5 text-[13px]">
                  <span className="text-muted">
                    {state.program.mode === "perSession"
                      ? `Total ≈ ${programSelectedMinutesSum} min`
                      : `1 meditation · ${state.lengthMinutes} min`}
                  </span>
                  <button
                    type="button"
                    onClick={resetProgramToDefaults}
                    className="cursor-pointer font-semibold text-accent-link"
                  >
                    Reset to program
                  </button>
                </div>
              </>
            ),
          }
        : undefined;
    return (
      <MeditationLengthSelect
        size={size}
        disabled={disabled}
        value={state.lengthMinutes}
        displayLabel={lengthChipLabel}
        panel={programPanel}
        onChange={(n) => {
          const mins = coerceMeditationLengthMinutes(n);
          setState((p) => ({ ...p, lengthMinutes: mins }));
        }}
      />
    );
  };

  function setSessionLengthOverride(
    sessionId: string,
    mins: MeditationLengthMinutes | null,
  ) {
    setState((p) => {
      if (!p.program) return p;
      const next = { ...(p.program.sessionLengthOverrides ?? {}) };
      if (mins == null) delete next[sessionId];
      else next[sessionId] = mins;
      return { ...p, program: { ...p.program, sessionLengthOverrides: next } };
    });
  }

  function shapeLifeAreaFor(s: CreateOneFlowState) {
    if (!s.goal) return null;
    const area = lifeAreasRef.current.find((g) => g.id === s.goal!.lifeAreaId);
    if (!area) {
      return {
        id: s.goal.lifeAreaId,
        title: s.goal.lifeAreaTitle,
      };
    }
    return {
      id: area.id,
      title: area.title,
      dreamText: area.dreamText,
      obstacleText: area.obstacleText,
      visionText: area.visionText,
    };
  }

  function shapeProgramBriefFor(
    s: CreateOneFlowState,
    opts?: { midChat?: boolean },
  ): string | null {
    if (!s.program) return null;
    const src = programsRef.current.find((p) => p.id === s.program!.id);
    if (!src) return null;
    const base = buildProgramMakeOwnApiContent({
      program: programHandoffFromLibrary(src),
      selectedDayIds: new Set(s.program.sessionIds),
      generateMode: s.program.mode === "perSession" ? "perSession" : "single",
    });
    const lengthLine = s.program.sessionIds
      .map((id) => {
        const title = s.program!.sessionTitles[id] || id;
        const mins = effectiveSessionMinutes(
          s.program!,
          id,
          programDefaultSessionMinutes(src.days, id),
        );
        return `${title}: ${mins} min`;
      })
      .join("; ");
    const withLengths = lengthLine
      ? `${base}\n\nSession lengths (use these for the eventual meditations): ${lengthLine}`
      : base;
    if (!opts?.midChat) return withLengths;
    return [
      withLengths,
      "",
      "MID-CHAT ATTACH (overrides OPEN NOW / first-reply): The conversation already has prior turns — keep them. Do NOT welcome from scratch, do NOT use the five-bubble OPEN NOW format, do NOT restart. Acknowledge the program by name and say how you will use it in the meditation. Scan Ask-items against prior brief/chat/journal/goal: skip any clearly answered (confirm how you'll use that answer). Ask exactly one concrete question for the first unanswered Ask-item of the first selected session (or one spirit question if there are no Ask-items). If every Ask-item is already covered, confirm-only and [[READY]].",
    ].join("\n");
  }

  function coachParamsFor(s: CreateOneFlowState) {
    const style = s.style?.id?.trim() || "General";
    return {
      meditationStyle: style,
      journalMode: !s.style,
      fromProgram: Boolean(s.program),
      meditationTargetMinutes: s.lengthMinutes,
      ...(shapeCachedContextRef.current
        ? { systemCachedExtra: shapeCachedContextRef.current }
        : {}),
      ...(shapeOverridesSupplementRef.current
        ? { systemSupplement: shapeOverridesSupplementRef.current }
        : {}),
    };
  }

  function buildLiveShapeContext(s: CreateOneFlowState): string {
    return buildShapeContextBlock({
      state: s,
      lifeArea: shapeLifeAreaFor(s),
      programBrief: shapeProgramBriefFor(s),
    });
  }

  async function streamShapeAssistant(opts: {
    messages: Parameters<typeof streamMedimadeChat>[0]["messages"];
    stateSnapshot: CreateOneFlowState;
    /** When true, append a new assistant bubble; otherwise replace the trailing empty one. */
    appendBubble: boolean;
  }): Promise<void> {
    const requestId = ++shapeRequestIdRef.current;
    setShapeBusy(true);
    let rawSoFar = "";
    let bubbleIndex = -1;
    setState((prev) => {
      const chat = [...prev.chat];
      if (
        !opts.appendBubble &&
        chat[chat.length - 1]?.role === "assistant" &&
        !chat[chat.length - 1]!.text.trim()
      ) {
        bubbleIndex = chat.length - 1;
        return prev;
      }
      bubbleIndex = chat.length;
      chat.push({ role: "assistant", text: "" });
      return { ...prev, chat };
    });

    const writeBubble = (parsed: {
      text: string;
      ready?: boolean;
      aimCovered?: number[];
      aimAsking?: number;
    }) => {
      setState((prev) => {
        const chat = [...prev.chat];
        const idx =
          bubbleIndex >= 0 && chat[bubbleIndex]?.role === "assistant"
            ? bubbleIndex
            : (() => {
                for (let i = chat.length - 1; i >= 0; i -= 1) {
                  if (chat[i]?.role === "assistant") return i;
                }
                return -1;
              })();
        if (idx < 0) return prev;
        const resolved = resolveAimMarkers(
          {
            text: parsed.text,
            ready: Boolean(parsed.ready || chat[idx]!.ready),
            aimCovered: parsed.aimCovered ?? [],
            aimAsking: parsed.aimAsking,
          },
          opts.stateSnapshot.style?.id,
        );
        chat[idx] = {
          role: "assistant",
          text: parsed.text,
          ...(resolved.ready ? { ready: true } : {}),
          ...(resolved.aimCovered.length > 0
            ? { aimCovered: resolved.aimCovered }
            : {}),
          ...(resolved.aimAsking != null ? { aimAsking: resolved.aimAsking } : {}),
        };
        return { ...prev, chat };
      });
    };

    try {
      const raw = await streamMedimadeChat(
        {
          ...coachParamsFor(opts.stateSnapshot),
          messages: opts.messages,
        },
        (chunk) => {
          if (requestId !== shapeRequestIdRef.current) return;
          rawSoFar += chunk;
          const parsed = parseCoachDisplayText(rawSoFar);
          writeBubble(parsed);
        },
      );
      if (requestId !== shapeRequestIdRef.current) return;
      const parsed = parseCoachDisplayText(raw);
      writeBubble({ ...parsed, text: parsed.text || rawSoFar });
    } catch (e) {
      if (requestId !== shapeRequestIdRef.current) return;
      const msg =
        e instanceof Error ? e.message : "Could not reach the guide.";
      writeBubble(
        rawSoFar.trim()
          ? parseCoachDisplayText(rawSoFar)
          : { text: `Sorry — ${msg}`, ready: false, aimCovered: [] },
      );
    } finally {
      if (requestId === shapeRequestIdRef.current) {
        setShapeBusy(false);
      }
    }
  }

  function openShapeCoach(s: CreateOneFlowState) {
    const hasAssistant = s.chat.some((m) => m.role === "assistant");
    if (hasAssistant) return;
    // Always stream the first Shape turn — never seed a hardcoded assistant line.
    const lean = Boolean(shapeCachedContextRef.current);
    const content = buildShapeOpenUserContent({
      state: s,
      lifeArea: shapeLifeAreaFor(s),
      programBrief: shapeProgramBriefFor(s),
      leanOpen: lean,
    });
    void streamShapeAssistant({
      messages: [{ role: "user", content }],
      stateSnapshot: s,
      appendBubble: true,
    });
  }

  function applyStartEditsKeepingChat(s: CreateOneFlowState) {
    const cached = shapeCachedContextRef.current;
    if (!cached) return;
    const prevFp = shapeAppliedFingerprintRef.current;
    const changeSummary = describeShapeStartChanges(prevFp, s);
    const supplement = buildShapeStartOverridesSupplement({
      cachedContext: cached,
      state: s,
      lifeArea: shapeLifeAreaFor(s),
      programBrief: shapeProgramBriefFor(s),
    });
    shapeOverridesSupplementRef.current = supplement;
    shapeAppliedFingerprintRef.current = fingerprintShapeStart(s);
    if (!supplement) return;
    if (!s.chat.some((m) => m.role === "assistant" || m.role === "user")) {
      openShapeCoach(s);
      return;
    }
    scrollShapeThreadToBottom();
    const contextTurn: CreateFlowChatTurn = {
      role: "user",
      text: changeSummary,
      kind: "context",
      contextKind: "start",
      contextDetail: null,
    };
    let nextState: CreateOneFlowState | null = null;
    setState((prev) => {
      nextState = { ...prev, chat: [...prev.chat, contextTurn] };
      return nextState;
    });
    const live = nextState ?? { ...s, chat: [...s.chat, contextTurn] };
    const messages = buildShapeTurnApiMessages({
      chat: live.chat,
      userText: `I updated the Start step (${changeSummary}). Keep the prior chat intact; fold in the Start overrides (system supplement) and continue — do not restart.`,
      state: live,
      leanUserTurn: true,
      contextUpdateNote: `Creator returned from Start with changes: ${changeSummary}. Prior messages stay. Do not re-ask answered ground.`,
    });
    void streamShapeAssistant({
      messages,
      stateSnapshot: live,
      appendBubble: true,
    });
  }

  function onEnterShapeStep() {
    const s = stateRef.current;
    const fp = fingerprintShapeStart(s);
    if (!shapeCachedContextRef.current) {
      // First Start → Shape: cache the initial prompt context.
      shapeCachedContextRef.current = buildLiveShapeContext(s);
      shapeAppliedFingerprintRef.current = fp;
      shapeOverridesSupplementRef.current = null;
      openShapeCoach(s);
      return;
    }
    if (fp !== shapeAppliedFingerprintRef.current) {
      // Back from Start with edits: uncached overrides; keep chat.
      applyStartEditsKeepingChat(s);
      return;
    }
    // Re-entering Shape with no Start changes — leave chat alone.
  }
  onEnterShapeStepRef.current = onEnterShapeStep;

  function nudgeShapeAfterContext(opts: {
    note: string;
    label: string;
    contextKind: CreateFlowContextKind;
    detail?: string | null;
    imageUrl?: string | null;
  }) {
    if (step !== "shape") return;
    const live = stateRef.current;
    if (!live.chat.some((m) => m.role === "assistant" || m.role === "user")) {
      openShapeCoach(live);
      return;
    }
    scrollShapeThreadToBottom();
    const label = opts.label.trim();
    const contextTurn: CreateFlowChatTurn = {
      role: "user",
      text: label,
      kind: "context",
      contextKind: opts.contextKind,
      contextDetail: opts.detail ?? null,
      contextImageUrl: opts.imageUrl ?? null,
    };
    // Append onto live chat — never replace with a stale snapshot (that wiped prior Qs).
    let nextState: CreateOneFlowState | null = null;
    setState((prev) => {
      nextState = {
        ...prev,
        chat: [...prev.chat, contextTurn],
      };
      return nextState;
    });
    const s = nextState ?? {
      ...live,
      chat: [...live.chat, contextTurn],
    };
    const apiUserText = `I added ${opts.contextKind} context: ${label}${
      opts.detail?.trim() ? ` (${opts.detail.trim()})` : ""
    }. Keep the prior conversation; this is not a restart. This is not a spoken answer to your last question unless the attached material clearly addresses that question.`;
    const pendingAskGuard =
      s.program && opts.contextKind !== "program"
        ? " OUTSTANDING PROGRAM ASK: this attach is not a spoken answer to the last Ask-item unless it clearly covers that Ask-item. Do not mark the Ask-item done. Do not emit [[READY]]. Acknowledge the new context by name, then ask ONE question that still serves that Ask-item and, when it fits, ties it to the new context (e.g. how the session's struggle shows up around the attached goal)."
        : "";
    const messages = buildShapeTurnApiMessages({
      chat: s.chat,
      userText: apiUserText,
      state: s,
      lifeArea: shapeLifeAreaFor(s),
      programBrief: shapeProgramBriefFor(s, {
        midChat: opts.contextKind === "program",
      }),
      contextUpdateNote: `${opts.note}${pendingAskGuard}`,
      leanUserTurn: Boolean(shapeCachedContextRef.current),
    });
    // Mid-chat attaches update live state; refresh uncached overrides so the
    // coach sees current attachments without rewriting the cached Start seed.
    if (shapeCachedContextRef.current) {
      shapeOverridesSupplementRef.current = buildShapeStartOverridesSupplement({
        cachedContext: shapeCachedContextRef.current,
        state: s,
        lifeArea: shapeLifeAreaFor(s),
        programBrief: shapeProgramBriefFor(s, {
          midChat: opts.contextKind === "program",
        }),
      });
      shapeAppliedFingerprintRef.current = fingerprintShapeStart(s);
    }
    void streamShapeAssistant({
      messages,
      stateSnapshot: s,
      appendBubble: true,
    });
  }

  /** After removing format/context on Shape — coach acknowledges; may check direction. */
  function nudgeShapeAfterContextRemoval(opts: {
    label: string;
    contextKind: CreateFlowContextKind;
    detail?: string | null;
    /** State already with the attachment removed. */
    nextState: CreateOneFlowState;
  }) {
    if (step !== "shape") return;
    const live = opts.nextState;
    if (!live.chat.some((m) => m.role === "assistant" || m.role === "user")) {
      return;
    }
    scrollShapeThreadToBottom();
    const label = opts.label.trim();
    const removalTurn: CreateFlowChatTurn = {
      role: "user",
      text: label,
      kind: "context-removed",
      contextKind: opts.contextKind,
      contextDetail: opts.detail ?? null,
    };
    let nextState: CreateOneFlowState | null = null;
    setState((prev) => {
      nextState = {
        ...prev,
        chat: [...prev.chat, removalTurn],
      };
      return nextState;
    });
    const s = nextState ?? {
      ...live,
      chat: [...live.chat, removalTurn],
    };
    const isFormat =
      opts.contextKind === "style" || opts.contextKind === "program";
    const stillHasFormat = Boolean(s.style || s.program);
    const stillHasPersonalContext = Boolean(
      s.journals.length > 0 || s.goal || s.prompt.trim(),
    );
    const note = [
      `The creator just REMOVED ${opts.contextKind} "${label}"${
        opts.detail?.trim() ? ` (${opts.detail.trim()})` : ""
      }. Acknowledge the removal briefly by name.`,
      isFormat
        ? stillHasFormat
          ? "They still have another format attached — acknowledge and continue from remaining required items; do not restart."
          : "That was their Format (style or program). If the chat was clearly building around it, ask ONE short check: whether they meant to leave that direction, and whether they want a new direction or a different format — keep prior answers that still apply. If the brief + remaining context already make a clear general practice, acknowledge and continue (confirm-only or the next open gap) without forcing a re-orientation."
        : stillHasPersonalContext && (s.style || s.program || s.prompt.trim())
          ? "Personal context was removed. If the conversation was relying on it for theme/direction, ask ONE short check whether they meant to drop that thread or want a new direction; otherwise acknowledge and continue."
          : "Personal context was removed and little else remains for direction — ask whether they want a new direction or to add different context, without restarting answered ground that still applies.",
      "Do not emit [[READY]] merely because something was removed. Do not re-ask answered ground that still applies without the removed item.",
    ].join(" ");
    const apiUserText = `I removed ${opts.contextKind} context: ${label}${
      opts.detail?.trim() ? ` (${opts.detail.trim()})` : ""
    }. Keep the prior conversation; this is not a restart.`;
    const messages = buildShapeTurnApiMessages({
      chat: s.chat,
      userText: apiUserText,
      state: s,
      lifeArea: shapeLifeAreaFor(s),
      programBrief: shapeProgramBriefFor(s),
      contextUpdateNote: note,
      leanUserTurn: Boolean(shapeCachedContextRef.current),
    });
    if (shapeCachedContextRef.current) {
      shapeOverridesSupplementRef.current = buildShapeStartOverridesSupplement({
        cachedContext: shapeCachedContextRef.current,
        state: s,
        lifeArea: shapeLifeAreaFor(s),
        programBrief: shapeProgramBriefFor(s),
      });
      shapeAppliedFingerprintRef.current = fingerprintShapeStart(s);
    }
    void streamShapeAssistant({
      messages,
      stateSnapshot: s,
      appendBubble: true,
    });
  }

  function removeShapeAttachment(opts: {
    contextKind: CreateFlowContextKind;
    label: string;
    detail?: string | null;
    apply: (prev: CreateOneFlowState) => CreateOneFlowState;
  }) {
    const live = stateRef.current;
    const next = opts.apply(live);
    setState(() => next);
    nudgeShapeAfterContextRemoval({
      label: opts.label,
      contextKind: opts.contextKind,
      detail: opts.detail,
      nextState: next,
    });
  }

  function openPicker(kind: Exclude<PickerKind, null>) {
    if (kind === "style") setDraftStyle(state.style?.id ?? "");
    if (kind === "program") setDraftProgramId(state.program?.id ?? null);
    if (kind === "journal") {
      setDraftJournalId(state.journals[0]?.id ?? null);
    }
    if (kind === "goal") {
      setDraftLifeAreaId(state.goal?.lifeAreaId ?? null);
      setDraftGoalId(state.goal?.goalId ?? null);
    }
    setPicker(kind);
  }

  function confirmPicker() {
    let contextNote: string | null = null;
    let contextLabel: string | null = null;
    let contextKind: CreateFlowContextKind | null = null;
    let contextDetail: string | null = null;
    let contextImageUrl: string | null = null;
    if (picker === "style") {
      if (!isStyleLabel(draftStyle)) return;
      setState((prev) =>
        attachStyleExclusive({ ...prev, program: null }, { id: draftStyle }),
      );
      contextKind = "style";
      contextLabel = draftStyle;
      contextNote = `Style "${draftStyle}" was just attached. Acknowledge the style by name. Treat it as their answer only if your last question was about what they need, want, or what kind of practice. Otherwise keep that last question open and ask one question that still gathers it, using the new style if relevant.`;
    } else if (picker === "program") {
      const p = programs.find((x) => x.id === draftProgramId);
      if (!p) return;
      const sessionIds = p.days.map((d) => d.id);
      const titles: Record<string, string> = {};
      for (const d of p.days) titles[d.id] = d.title;
      const att: CreateFlowProgramAttachment = {
        id: p.id,
        title: p.title.trim() || "Program",
        coverImageUrl: p.coverImageUrl,
        mode: "perSession",
        sessionIds,
        sessionTitles: titles,
        sessionLengthOverrides: {},
        speakerModelId: p.speakerModelId,
        preferredEnergy: p.preferredEnergy,
        preferredPitch: p.preferredPitch,
        preferredGender: p.preferredGender,
        preferredAccent: p.preferredAccent,
      };
      setState((prev) => attachProgramExclusive(prev, att));
      contextKind = "program";
      contextLabel = att.title;
      contextImageUrl = att.coverImageUrl ?? null;
      contextNote = `Program "${att.title}" was just attached mid-chat. Keep every prior assistant/user turn visible in history. Do not restart. Acknowledge the program and how you will use it in the meditation. Scan Ask-items against prior brief/chat/journal/goal — skip clearly answered ones (confirm how you'll use them). Ask the first unanswered Ask-item only; if none remain, confirm-only + [[READY]].`;
    } else if (picker === "journal") {
      const e = journalEntries.find((x) => x.id === draftJournalId);
      if (!e) return;
      const att: CreateFlowJournalAttachment = {
        id: e.id,
        title: e.title?.trim() || "Journal entry",
        detail: null,
        bodyPlain: journalEntryPlainForHandoff(e.contentHtml),
      };
      setState((prev) => {
        if (prev.journals.some((j) => j.id === att.id)) return prev;
        return { ...prev, journals: [...prev.journals, att] };
      });
      contextKind = "journal";
      contextLabel = att.title;
      contextDetail = null;
      contextNote = `Journal "${att.title}" was just attached (full body in context). Acknowledge it by name and say how you will use it in the meditation. Treat it as answering your last question only if the entry clearly covers it — then mark that item done. If required items remain, ask one question for the next gap (drawing on the journal where relevant). If everything required is covered, confirm-only and invite extras as statements, then [[READY]].`;
    } else if (picker === "goal") {
      const area = lifeAreas.find((g) => g.id === draftLifeAreaId);
      if (!area) return;
      const selectedGoal = draftGoalId
        ? area.goals.find((g) => g.id === draftGoalId) ?? null
        : null;
      const att: CreateFlowGoalAttachment = {
        lifeAreaId: area.id,
        lifeAreaTitle: area.title.trim() || "Life area",
        goalId: selectedGoal?.id ?? null,
        goalTitle: selectedGoal?.title?.trim() || null,
      };
      setState((prev) => ({ ...prev, goal: att }));
      contextKind = "goal";
      contextLabel = att.lifeAreaTitle;
      contextDetail = att.goalTitle ?? null;
      contextNote = att.goalTitle
        ? `Life area "${att.lifeAreaTitle}" (goal: "${att.goalTitle}") was just attached. Acknowledge this goal by name and say how you will use it in the meditation. It does NOT complete your last question unless it clearly covers that question — if it does, mark that item done. If a required Ask-item/AIM is still unanswered, ask ONE question that still serves it and ties it to this goal. If everything required is covered, confirm-only + [[READY]].`
        : `Life area "${att.lifeAreaTitle}" was just attached. Acknowledge this life area by name and say how you will use it in the meditation. It does NOT complete your last question unless it clearly covers that question — if it does, mark that item done. If a required Ask-item/AIM is still unanswered, ask ONE question that still serves it and ties it to this life area. If everything required is covered, confirm-only + [[READY]].`;
    }
    setPicker(null);
    if (contextNote && contextLabel && contextKind) {
      const note = contextNote;
      const label = contextLabel;
      const kind = contextKind;
      const detail = contextDetail;
      const imageUrl = contextImageUrl;
      // Wait a tick so stateRef has the attachment; nudge appends onto live chat.
      window.setTimeout(
        () =>
          nudgeShapeAfterContext({
            note,
            label,
            contextKind: kind,
            detail,
            imageUrl,
          }),
        0,
      );
    }
  }

  function enterShape(_fromPrompt: boolean) {
    // Brief stays on the card — do not inject Start text as a chat bubble.
    // goStep("shape") triggers onEnterShapeStep (cache seed or Start overrides).
    goStep("shape");
  }

  function beginBriefEdit() {
    setBriefDraft(state.prompt);
    setBriefEditing(true);
  }

  function commitBriefEdit() {
    const next = briefDraft.trim();
    setState((p) => ({ ...p, prompt: next }));
    setBriefEditing(false);
  }

  function cancelBriefEdit() {
    setBriefDraft(state.prompt);
    setBriefEditing(false);
  }

  function surpriseMe() {
    const styles = MEDITATION_STYLE_LABELS;
    const style = styles[Math.floor(Math.random() * styles.length)]!;
    const seed = `User: Surprise me with a ${style.toLowerCase()} practice.\n\nGuide: Let's begin.`;
    shapeCachedContextRef.current = null;
    shapeAppliedFingerprintRef.current = null;
    shapeOverridesSupplementRef.current = null;
    setState((prev) => ({
      ...attachStyleExclusive(prev, { id: style }),
      surpriseScript: seed,
      prompt: prev.prompt.trim() || `A spontaneous ${style.toLowerCase()}`,
      chat: [],
      answers: {},
    }));
    goStep("sound");
  }

  function createNow() {
    goStep("sound");
  }

  function resetShape() {
    shapeRequestIdRef.current += 1;
    setShapeBusy(false);
    setProgramHeaderOpen(false);
    setShapeInput("");
    // Keep the cached Start seed; only clear the thread and reopen against it.
    setState((prev) => {
      const next = {
        ...prev,
        chat: [] as CreateFlowChatTurn[],
        answers: {},
        surpriseScript: null,
      };
      window.setTimeout(() => openShapeCoach(next), 0);
      return next;
    });
  }

  function sendShapeMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (shapeBusy) {
      shapeRequestIdRef.current += 1;
      setShapeBusy(false);
    }
    setProgramHeaderOpen(false);
    setShapeInput("");
    scrollShapeThreadToBottom();
    const prev = stateRef.current;
    const chat = [...prev.chat, { role: "user" as const, text: trimmed }];
    const nextState = { ...prev, chat };
    setState(nextState);
    const messages = buildShapeTurnApiMessages({
      chat,
      userText: trimmed,
      state: nextState,
      lifeArea: shapeLifeAreaFor(nextState),
      programBrief: shapeProgramBriefFor(nextState),
      leanUserTurn: Boolean(shapeCachedContextRef.current),
    });
    void streamShapeAssistant({
      messages,
      stateSnapshot: nextState,
      appendBubble: true,
    });
  }

  function buildTranscript(): string {
    if (state.surpriseScript?.trim()) return state.surpriseScript.trim();
    const lines: string[] = [];
    if (state.prompt.trim()) lines.push(`User: ${state.prompt.trim()}`);
    if (state.style) {
      const qs = STYLE_INTAKE_QUESTIONS[state.style.id] ?? [];
      qs.forEach((q, i) => {
        const a = state.answers[String(i)]?.trim();
        if (a) {
          lines.push(`Guide: ${q}`);
          lines.push(`User: ${a}`);
        }
      });
    }
    for (const m of state.chat) {
      if (!m.text.trim()) continue;
      if (m.kind === "context") {
        lines.push(
          `User: [Context added · ${m.contextKind ?? "context"}] ${m.text.trim()}${
            m.contextDetail?.trim() ? ` (${m.contextDetail.trim()})` : ""
          }`,
        );
        continue;
      }
      if (m.kind === "context-removed") {
        lines.push(
          `User: [Context removed · ${m.contextKind ?? "context"}] ${m.text.trim()}${
            m.contextDetail?.trim() ? ` (${m.contextDetail.trim()})` : ""
          }`,
        );
        continue;
      }
      lines.push(`${m.role === "user" ? "User" : "Guide"}: ${m.text.trim()}`);
    }
    if (state.journals.length > 0) {
      for (const j of state.journals) {
        lines.push(
          `Journal context: ${j.title}${j.bodyPlain?.trim() ? `\n${j.bodyPlain.trim()}` : ""}`,
        );
      }
    }
    if (state.goal) {
      lines.push(`Life area: ${state.goal.lifeAreaTitle}`);
    }
    if (state.program) {
      lines.push(
        `Program: ${state.program.title} (${state.program.mode === "one" ? "one meditation" : `${state.program.sessionIds.length} sessions`})`,
      );
    }
    if (lines.length === 0) {
      return "User: I want a guided meditation.\n\nGuide: Let's begin.";
    }
    return lines.join("\n\n");
  }

  async function generateMeditation() {
    if (audioBusy) return;
    setAudioBusy(true);
    setAudioError(null);
    try {
      soundStepRef.current?.stopPreviews();
      // Per-session voice/sound: resolve each session's settings up front
      // (All = null) so a bad voice fails before any job is submitted.
      const soundStep = soundStepRef.current;
      const allExtras = await soundStep?.getJobExtrasForSession(null);
      if (!allExtras?.reference_id) throw new Error("No voice available");

      const styleForJob = state.style?.id ?? null;
      const provenance = buildMeditationCreationProvenance({
        creationPath: state.program
          ? "fromProgram"
          : state.journals.length
            ? "journalReflect"
            : state.goal
              ? "goal"
              : state.style
                ? "style"
                : "freeflow",
        randomScript: Boolean(state.surpriseScript),
        meditationStyle: styleForJob,
        styleQuestionAnswers: styleQuestions.map(
          (_, i) => state.answers[String(i)] ?? "",
        ),
        chatMessages: state.chat.map((m) => ({
          role: m.role,
          text: m.text,
        })),
        directPrompt: state.prompt.trim() || undefined,
      });

      const perSession =
        Boolean(state.program) && state.program?.mode === "perSession";
      const sessionJobs: Array<string | null> = perSession
        ? [...(state.program?.sessionIds ?? [])]
        : [null];
      if (perSession && sessionJobs.length === 0) {
        throw new Error("Select at least one session");
      }

      const extrasBySession = new Map<string, CreateSoundStepJobExtras>();
      if (perSession) {
        for (const sessionId of sessionJobs) {
          if (!sessionId) continue;
          const extras = await soundStep?.getJobExtrasForSession(sessionId);
          if (!extras?.reference_id) throw new Error("No voice available");
          extrasBySession.set(sessionId, extras);
        }
      }

      const baseTranscript = buildTranscript();
      let firstJobId: string | null = null;

      for (const sessionId of sessionJobs) {
        // Single job → All; per-session program → that session's resolved settings.
        const soundExtras =
          (sessionId ? extrasBySession.get(sessionId) : null) ?? allExtras;
        const minutes: MeditationLengthMinutes =
          sessionId && state.program
            ? sessionEffectiveMinutes(sessionId)
            : coerceMeditationLengthMinutes(state.lengthMinutes);
        const sessionTitle =
          sessionId && state.program
            ? state.program.sessionTitles[sessionId] || "Session"
            : null;
        const transcript = sessionTitle
          ? `${baseTranscript}\n\nProgram session: ${sessionTitle} (target ${minutes} min)`
          : baseTranscript;

        const { jobId } = await createMeditationAudioJob({
          meditationStyle: styleForJob ?? "General",
          journalMode:
            !state.style ||
            Boolean(state.journals.length || state.goal || state.program),
          meditationTargetMinutes: minutes,
          transcript,
          reference_id: soundExtras.reference_id,
          ttsProvider: "speechify",
          fishTtsModel: "s2.1-pro-free",
          creationProvenance: provenance,
          voiceFxPreset: soundExtras.voiceFxPreset,
          voiceFxDial: soundExtras.voiceFxDial,
          leadInSeconds: soundExtras.leadInSeconds,
          fadeOut: soundExtras.fadeOut,
          speed: soundExtras.speed,
          ...(soundExtras.claudeModel
            ? { claudeModel: soundExtras.claudeModel }
            : {}),
          ...(soundExtras.fishPauseMode
            ? { fishPauseMode: soundExtras.fishPauseMode }
            : {}),
          ...(soundExtras.skipVoiceFx ? { skipVoiceFx: true } : {}),
          ...(soundExtras.skipSpeechifyLoudnorm
            ? { skipSpeechifyLoudnorm: true }
            : {}),
          ...(soundExtras.speechifyEmotionVariants
            ? { speechifyEmotionVariants: true }
            : {}),
          ...(typeof soundExtras.speechifyRate === "number"
            ? { speechifyRate: soundExtras.speechifyRate }
            : {}),
          ...(soundExtras.longerBreaks ? { longerBreaks: true } : {}),
          ...(state.goal?.lifeAreaId
            ? { lifeAreaId: state.goal.lifeAreaId }
            : {}),
          ...(soundExtras.backgroundNatureKey
            ? {
                backgroundNatureKey: soundExtras.backgroundNatureKey,
                backgroundNatureGain: soundExtras.backgroundNatureGain,
              }
            : {}),
          ...(soundExtras.backgroundMusicKey
            ? {
                backgroundMusicKey: soundExtras.backgroundMusicKey,
                backgroundMusicGain: soundExtras.backgroundMusicGain,
              }
            : {}),
          ...(soundExtras.backgroundDrumsKey
            ? {
                backgroundDrumsKey: soundExtras.backgroundDrumsKey,
                backgroundDrumsGain: soundExtras.backgroundDrumsGain,
              }
            : {}),
          ...(soundExtras.backgroundNoiseKey
            ? {
                backgroundNoiseKey: soundExtras.backgroundNoiseKey,
                backgroundNoiseGain: soundExtras.backgroundNoiseGain,
              }
            : {}),
        });

        if (!firstJobId) firstJobId = jobId;
        appendPendingLibraryGeneration({
          jobId,
          createdAt: new Date().toISOString(),
          title: sessionTitle ?? "",
          description: null,
          meditationStyle: styleForJob,
          speakerName: soundExtras.speakerName,
          speakerModelId: soundExtras.reference_id,
          speakerPortraitUrl: soundExtras.speakerPortraitUrl,
        });
      }

      if (!firstJobId) throw new Error("Generation failed");
      ensurePendingMeditationJobPoller();
      shapeCachedContextRef.current = null;
      shapeAppliedFingerprintRef.current = null;
      shapeOverridesSupplementRef.current = null;
      clearCreateSoundSessionOverridesLock();
      clearCreateOneFlowState();
      navigate(
        `/meditate/library/creations?focus=${encodeURIComponent(`pending:${firstJobId}`)}`,
      );
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : "Generation failed");
      setAudioBusy(false);
    }
  }

  const summarySentence = useMemo(() => {
    if (state.prompt.trim()) {
      const t = state.prompt.trim();
      return t.length > 120 ? `${t.slice(0, 117)}…` : t;
    }
    if (state.style) return `A ${state.style.id.toLowerCase()} practice`;
    if (state.program) return `Making ${state.program.title} your own`;
    return "A guided meditation";
  }, [state.prompt, state.style, state.program]);

  const hasAttachedContext = Boolean(
    state.style ||
      state.program ||
      state.journals.length > 0 ||
      state.goal,
  );

  const tokens = (
    removable: boolean,
    opts?: {
      includeStyle?: boolean;
      includeProgram?: boolean;
      includeJournal?: boolean;
      includeGoal?: boolean;
      kindLabels?: boolean;
    },
  ): ReactNode => (
    <>
      {opts?.includeStyle !== false && state.style ? (
        <ContextToken
          name={state.style.id}
          kindLabel={opts?.kindLabels ? "Style" : undefined}
          onRemove={
            removable
              ? () => {
                  const id = state.style!.id;
                  removeShapeAttachment({
                    contextKind: "style",
                    label: id,
                    apply: (p) => ({ ...p, style: null, answers: {} }),
                  });
                }
              : undefined
          }
        />
      ) : null}
      {opts?.includeProgram !== false && state.program ? (
        <ContextToken
          visual={
            state.program.coverImageUrl ? (
              <img src={state.program.coverImageUrl} alt="" className="h-full w-full object-cover" />
            ) : undefined
          }
          name={state.program.title}
          kindLabel={opts?.kindLabels ? "Program" : undefined}
          detail={
            state.program.mode === "one"
              ? "One meditation"
              : `${state.program.sessionIds.length} sessions`
          }
          onRemove={
            removable
              ? () => {
                  const title = state.program!.title;
                  const detail =
                    state.program!.mode === "one"
                      ? "One meditation"
                      : `${state.program!.sessionIds.length} sessions`;
                  removeShapeAttachment({
                    contextKind: "program",
                    label: title,
                    detail,
                    apply: (p) => ({ ...p, program: null }),
                  });
                }
              : undefined
          }
        />
      ) : null}
      {opts?.includeJournal !== false &&
        state.journals.map((j) => (
        <ContextToken
          key={j.id}
          name={j.title}
          kindLabel={opts?.kindLabels ? "Journal" : undefined}
          onRemove={
            removable
              ? () => {
                  const title = j.title;
                  const id = j.id;
                  removeShapeAttachment({
                    contextKind: "journal",
                    label: title,
                    apply: (p) => ({
                      ...p,
                      journals: p.journals.filter((x) => x.id !== id),
                    }),
                  });
                }
              : undefined
          }
        />
      ))}
      {opts?.includeGoal !== false && state.goal ? (
        <ContextToken
          name={state.goal.lifeAreaTitle}
          detail={state.goal.goalTitle}
          kindLabel={opts?.kindLabels ? "Goal" : undefined}
          onRemove={
            removable
              ? () => {
                  const area = state.goal!.lifeAreaTitle;
                  const goalTitle = state.goal!.goalTitle;
                  removeShapeAttachment({
                    contextKind: "goal",
                    label: area,
                    detail: goalTitle,
                    apply: (p) => ({ ...p, goal: null }),
                  });
                }
              : undefined
          }
        />
      ) : null}
    </>
  );

  /** Session ids for Sound per-session UI — hidden in One meditation mode. */
  const soundSessionIds =
    state.program &&
    state.program.mode === "perSession" &&
    state.program.sessionIds.length >= 1
      ? state.program.sessionIds
      : null;
  const soundFocusIndex =
    soundSessionIds && soundSessionMeta.focusSessionId
      ? soundSessionIds.indexOf(soundSessionMeta.focusSessionId)
      : -1;
  const soundPreviewLabel =
    soundFocusIndex >= 0 ? `Preview session ${soundFocusIndex + 1}` : "Preview mix";
  const soundPreviewStopLabel =
    soundFocusIndex >= 0
      ? `Stop preview session ${soundFocusIndex + 1}`
      : "Stop preview mix";
  const soundCreateCount =
    state.program?.mode === "perSession"
      ? state.program.sessionIds.length
      : 1;
  const soundCreateLabel =
    soundCreateCount > 1
      ? `✦ Create ${soundCreateCount} meditations`
      : "✦ Create meditation";

  const journalSelected = state.journals.length > 0;
  const goalSelected = Boolean(state.goal);

  const renderStartTile = (
    kind: "style" | "program" | "journal" | "goal",
    title: string,
    line: string,
    coverCategory: string,
    opts: { selected: boolean; dimmed: boolean },
  ) => {
    const coverUrl = categoryImageUrls[coverCategory]?.trim() || "";
    return (
      <button
        key={kind}
        type="button"
        aria-pressed={opts.selected}
        onClick={() => openPicker(kind)}
        className={`relative flex h-[88px] w-full flex-row overflow-hidden rounded-xl bg-card text-left shadow-sm transition md:h-full md:flex-col ${
          opts.selected
            ? "border-[1.5px] border-accent md:border md:border-accent"
            : "border border-border"
        } ${opts.dimmed ? "opacity-40 grayscale" : ""}`}
      >
        <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden bg-gradient-to-br from-accent/25 via-accent-soft/40 to-selected/20 md:aspect-[4/3] md:h-auto md:w-full">
          {coverUrl ? (
            <img
              src={categoryImageUrlForTile(coverUrl, 480, 360)}
              alt=""
              width={480}
              height={360}
              decoding="async"
              className="block h-full w-full object-cover object-[center_40%]"
            />
          ) : null}
          {opts.selected ? (
            <div
              className="absolute inset-0 flex items-center justify-center bg-foreground/45"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                className="h-10 w-10 text-card drop-shadow-sm md:h-16 md:w-16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l5 5L20 7" />
              </svg>
            </div>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-full bg-white/55 text-foreground shadow-sm backdrop-blur-[2px] md:flex"
            >
              <IconPlus className="h-4 w-4" />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[3px] py-2.5 pl-3 pr-[34px] md:flex-none md:gap-0 md:px-3 md:pb-3 md:pt-2 md:pr-3">
          <p className="font-display text-[16px] font-medium leading-snug text-foreground">
            {title}
          </p>
          <p className="line-clamp-2 text-[12px] leading-[1.35] text-muted md:mt-1 md:line-clamp-none md:text-[13px] md:leading-snug">
            {line}
          </p>
        </div>
        {!opts.selected ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/55 text-foreground shadow-sm backdrop-blur-[2px] md:hidden"
          >
            <IconPlus className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </button>
    );
  };

  const startTileSlotClass = "min-w-0 min-h-0 md:flex-1";

  const renderSurpriseMe = () => (
    <button
      type="button"
      onClick={surpriseMe}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[15px] font-semibold text-foreground hover:underline md:text-base"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[1.1em] w-[1.1em] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M9.2 14.2c.85 1.15 1.9 1.7 2.8 1.7s1.95-.55 2.8-1.7" />
      </svg>
      Surprise me
    </button>
  );

  const stepper = (
    <AppPrimaryTabsDesktop>
      <CreateOneFlowStepper
        compact
        step={step}
        onStepClick={(s) => {
          if (
            s === "start" ||
            (s === "shape" && step !== "start") ||
            s === step
          ) {
            goStep(s);
          }
        }}
      />
    </AppPrimaryTabsDesktop>
  );

  const renderShapeAddChips = (
    options: Array<{
      kind: "style" | "program" | "journal" | "goal";
      label: string;
    }>,
  ) => (
    <>
      {options.map(({ kind, label }) => (
        <button
          key={kind}
          type="button"
          onClick={() => openPicker(kind)}
          className="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1 rounded-[10px] border border-dashed border-accent/40 px-2.5 text-[13px] text-accent-link"
        >
          <IconPlus className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </>
  );
  const shapeAddChips = renderShapeAddChips(shapeAddOptions);
  const shapeFormatAddChips = renderShapeAddChips(shapeFormatAddOptions);
  const shapeContextAddChips = renderShapeAddChips(shapeContextAddOptions);

  const shapeBriefBody = (clamp: "none" | "one" | "two") => {
    const textClass =
      clamp === "none"
        ? "w-full text-left font-display text-[17px] leading-[1.4] text-foreground"
        : clamp === "one"
          ? "min-w-0 flex-1 cursor-pointer truncate text-left font-display text-[18px] leading-[1.35] text-foreground"
          : "min-w-0 flex-1 cursor-pointer text-left font-display text-[16px] leading-[1.35] text-foreground line-clamp-2 md:truncate md:text-[18px]";
    if (briefEditing) {
      return (
        <textarea
          ref={briefTextareaRef}
          value={briefDraft}
          onChange={(e) => setBriefDraft(e.target.value)}
          onBlur={() => commitBriefEdit()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitBriefEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelBriefEdit();
            }
          }}
          rows={clamp === "none" ? 3 : 1}
          className={`min-h-[1.35em] min-w-0 resize-none border-0 bg-transparent font-display leading-[1.4] text-foreground outline-none ${
            clamp === "none" ? "w-full text-[17px]" : "flex-1 text-[16px] md:text-[18px]"
          }`}
        />
      );
    }
    if (state.prompt.trim()) {
      return (
        <button
          type="button"
          title={state.prompt.trim()}
          onClick={beginBriefEdit}
          className={textClass}
        >
          {state.prompt.trim()}
        </button>
      );
    }
    return (
      <button type="button" onClick={beginBriefEdit} className={`${textClass} italic text-muted`}>
        Add a line about what this is for
      </button>
    );
  };

  function setProgramMode(mode: "one" | "perSession") {
    setState((p) =>
      p.program ? { ...p, program: { ...p.program, mode } } : p,
    );
  }

  function toggleProgramSession(id: string) {
    setState((p) => {
      if (!p.program) return p;
      const set = new Set(p.program.sessionIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return {
        ...p,
        program: { ...p.program, sessionIds: [...set] },
      };
    });
  }

  function setAllProgramSessions(all: boolean) {
    setState((p) => {
      if (!p.program) return p;
      return {
        ...p,
        program: {
          ...p.program,
          sessionIds: all ? Object.keys(p.program.sessionTitles) : [],
        },
      };
    });
  }

  function removeProgram() {
    setProgramHeaderOpen(false);
    const prog = stateRef.current.program;
    if (!prog) return;
    removeShapeAttachment({
      contextKind: "program",
      label: prog.title,
      detail:
        prog.mode === "one"
          ? "One meditation"
          : `${prog.sessionIds.length} sessions`,
      apply: (p) => ({ ...p, program: null }),
    });
  }

  const programSessionEntries = state.program
    ? Object.entries(state.program.sessionTitles)
    : [];
  const programSelectedCount = state.program?.sessionIds.length ?? 0;
  const programTotalCount = programSessionEntries.length;

  const shapeProgramSessionsBlock = state.program ? (
    <CreateProgramSessionControl
      mode={state.program.mode}
      onModeChange={setProgramMode}
      sessions={programSessionEntries.map(([id, title]) => ({ id, title }))}
      selectedIds={state.program.sessionIds}
      onToggleSession={toggleProgramSession}
      onSelectAll={setAllProgramSessions}
      selectedMinutesSum={programSelectedMinutesSum}
      sessionDefaultMinutes={sessionDefaultMinutes}
      sessionEffectiveMinutes={sessionEffectiveMinutes}
      onSessionLengthChange={setSessionLengthOverride}
      onSessionLengthReset={(id) => setSessionLengthOverride(id, null)}
      oneMeditationMinutes={state.lengthMinutes}
      onOneMeditationMinutesChange={(mins) =>
        setState((p) => ({ ...p, lengthMinutes: mins }))
      }
    />
  ) : null;

  const shapeProgramCard = state.program ? (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
          {state.program.coverImageUrl ? (
            <img
              src={state.program.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-display text-[16px] leading-[1.25] text-foreground">
            {state.program.title}
          </p>
          <p className="text-[12px] text-muted">Making it your own</p>
        </div>
        <button
          type="button"
          aria-label="Remove format"
          onClick={removeProgram}
          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center text-muted hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <CreateProgramSessionControl
        mode={state.program.mode}
        onModeChange={setProgramMode}
        sessions={programSessionEntries.map(([id, title]) => ({ id, title }))}
        selectedIds={state.program.sessionIds}
        onToggleSession={toggleProgramSession}
        onSelectAll={setAllProgramSessions}
        selectedMinutesSum={programSelectedMinutesSum}
        sessionDefaultMinutes={sessionDefaultMinutes}
        sessionEffectiveMinutes={sessionEffectiveMinutes}
        onSessionLengthChange={setSessionLengthOverride}
        onSessionLengthReset={(id) => setSessionLengthOverride(id, null)}
        oneMeditationMinutes={state.lengthMinutes}
        onOneMeditationMinutesChange={(mins) =>
          setState((p) => ({ ...p, lengthMinutes: mins }))
        }
        sessionListClassName="min-h-0 max-h-[186px] overflow-y-auto"
      />
    </div>
  ) : null;

  const shapeQuestionRows = styleQuestions.map((_, i) => {
    const done = styleQuestionStatuses[i];
    const current = styleQuestionCurrentIndex === i;
    const title = styleQuestionShortTitles[i] ?? `Question ${i + 1}`;
    return (
      <div
        key={i}
        className={`flex items-center gap-2.5 text-[13px] ${
          done
            ? "text-foreground"
            : current
              ? "font-semibold text-foreground"
              : "text-muted"
        }`}
      >
        {done ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent bg-accent-soft text-accent-link">
            <IconCheck className="h-3 w-3" />
          </span>
        ) : current ? (
          <span className="header-gold-sunlit-fill flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
            {i + 1}
          </span>
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] text-muted">
            {i + 1}
          </span>
        )}
        {title}
      </div>
    );
  });

  const shapeThread = (
    <div
      ref={threadScrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        threadStickToBottomRef.current = dist < 48;
      }}
      className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-3 py-3.5 md:gap-3 md:px-6 md:py-5"
    >
      {visibleChat.map((m, i) =>
        m.role === "assistant" && !m.text.trim() ? null :
        m.kind === "context" || m.kind === "context-removed" ? (
          (() => {
            const removed = m.kind === "context-removed";
            const kindLabel =
              m.contextKind === "style"
                ? removed
                  ? "Style removed"
                  : "Style added"
                : m.contextKind === "program"
                  ? removed
                    ? "Program removed"
                    : "Program added"
                  : m.contextKind === "goal"
                    ? removed
                      ? "Goal removed"
                      : "Goal added"
                    : m.contextKind === "journal"
                      ? removed
                        ? "Journal removed"
                        : "Journal added"
                      : m.contextKind === "start"
                        ? "Start updated"
                        : removed
                          ? "Context removed"
                          : "Context added";
            if (!removed && m.contextKind === "program") {
              return (
                <div
                  key={`context-${i}`}
                  className="ml-auto flex flex-col items-end gap-1.5"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
                    {kindLabel}
                  </span>
                  <span className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent/40 bg-accent-soft/50 py-0 pl-[3px] pr-2.5 text-[12px] font-semibold text-foreground">
                    <span className="flex h-[22px] w-[22px] shrink-0 overflow-hidden rounded-md bg-accent-soft">
                      {m.contextImageUrl ? (
                        <img
                          src={m.contextImageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] font-bold">
                          P
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 truncate">{m.text}</span>
                  </span>
                </div>
              );
            }
            if (m.contextKind === "start") {
              return (
                <div
                  key={`context-${i}`}
                  className="ml-auto flex max-w-[92%] flex-col items-end gap-1 py-0.5 md:max-w-[80%]"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
                    {kindLabel}
                  </span>
                  <span className="rounded-[10px] border border-accent/40 bg-accent-soft/50 px-2.5 py-1.5 text-right text-[13px] font-semibold leading-snug text-foreground">
                    {m.text.trim() || "Start step updated"}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={`context-${i}`}
                className="ml-auto flex max-w-[92%] flex-wrap items-center justify-end gap-2 py-0.5 md:max-w-[80%]"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
                  {kindLabel}
                </span>
                <ContextToken
                  name={m.text}
                  detail={m.contextKind === "journal" ? null : m.contextDetail}
                />
              </div>
            );
          })()
        ) : m.role === "user" ? (
          <div
            key={`${m.role}-${i}`}
            className="header-gold-sunlit-fill ml-auto max-w-[85%] whitespace-pre-wrap rounded-[14px] rounded-br-sm px-3.5 py-[11px] text-[16px] leading-[1.5] shadow-sm md:max-w-[78%]"
          >
            {m.text.trim() ? m.text : null}
          </div>
        ) : (
          <div
            key={`${m.role}-${i}`}
            className="mr-auto max-w-[92%] py-1 text-foreground md:max-w-[84%]"
          >
            {state.style ? (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                {state.style.id}
              </p>
            ) : null}
            {m.text.trim() ? (
              <ChatMarkdown
                text={m.text}
                className="text-[16px] font-normal leading-[1.5] text-foreground"
              />
            ) : null}
          </div>
        ),
      )}
      {shapeBusy &&
      !(
        visibleChat[visibleChat.length - 1]?.role === "assistant" &&
        Boolean(visibleChat[visibleChat.length - 1]?.text.trim())
      ) ? (
        <ChatTypingIndicator />
      ) : null}
      {shapeCanProceedToSound && !shapeBusy ? (
        <div className="flex w-full justify-start pt-0.5">
          <CreateFlowNavPill onClick={() => goStep("sound")}>
            <span>Proceed to Sound</span>
            <IconChevronRight className="text-accent-link" />
          </CreateFlowNavPill>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {step !== "shape" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3.5 px-4 pb-4 pt-3.5 md:gap-[22px] md:px-6 md:pb-5 md:pt-7">
            {stepper}
          {step === "start" ? (
            <div className="flex w-full flex-col gap-4">
              <h1 className="sr-only">Create</h1>
              {showCreateHint ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-accent/35 bg-accent-soft px-3.5 py-2.5 text-[14px] text-foreground">
                  <span className="shrink-0 text-accent-link" aria-hidden>
                    ✦
                  </span>
                  <p className="min-w-0 flex-1 leading-snug">
                    Write a line, choose a format, add context, or any mix. Then
                    talk it through or skip to audio.
                  </p>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => {
                      setShowCreateHint(false);
                      void patchUserSettings({
                        meditate: { showCreateHint: false },
                      }).catch(() => {
                        /* local hide still applied */
                      });
                    }}
                    className="ml-auto flex shrink-0 cursor-pointer items-center text-muted hover:text-foreground"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[14px] w-[14px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-3.5 pb-3 pt-3.5 shadow-sm md:gap-3.5 md:rounded-[18px] md:px-5 md:pb-3.5 md:pt-5">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="create-start-brief"
                    className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link"
                  >
                    Brief
                  </label>
                  <textarea
                    id="create-start-brief"
                    ref={textareaRef}
                    value={state.prompt}
                    onChange={(e) =>
                      setState((p) => ({ ...p, prompt: e.target.value }))
                    }
                    placeholder="What's this one for? e.g. can't switch off after work…"
                    rows={3}
                    className="min-h-[72px] w-full resize-none border-0 bg-transparent font-display text-[17px] leading-[1.45] text-foreground outline-none placeholder:text-muted md:min-h-[84px] md:text-xl"
                  />
                </div>
                <div className="flex items-end justify-between gap-2 border-t border-border pt-1">
                  <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1.5">
                    {hasAttachedContext ? (
                      tokens(true, { kindLabels: true })
                    ) : (
                      <p className="py-[7px] text-[14px] text-muted md:text-[15px]">
                        Add context below, or just send
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="mr-1">{renderLengthChip()}</div>
                    <DictationMicButton
                      variant="composer"
                      onTranscript={(t) =>
                        setState((p) => ({
                          ...p,
                          prompt: p.prompt.trim() ? `${p.prompt.trim()} ${t}` : t,
                        }))
                      }
                    />
                    <button
                      type="button"
                      aria-label="Talk it through"
                      onClick={() => enterShape(true)}
                      style={PRIMARY_ACCENT_FILL_STYLE}
                      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent transition-opacity hover:opacity-90 md:h-10 md:w-10"
                    >
                      <IconArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-1.5">
                <div className="mt-2 grid grid-cols-1 gap-y-2 md:grid-cols-2 md:gap-x-6">
                  <div className="flex min-h-8 items-center justify-between gap-2 md:col-start-1 md:row-start-1">
                    <p className="leading-none">
                      <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                        Format
                      </span>
                      <span className="text-[11px] font-medium tracking-[1px] text-muted">
                        {" "}
                        (optional)
                      </span>
                    </p>
                    <div className="md:hidden">{renderSurpriseMe()}</div>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Format"
                    className="relative grid grid-cols-1 gap-3 rounded-[14px] bg-accent-soft p-1.5 sm:grid-cols-2 md:col-start-1 md:row-start-2 md:flex md:items-stretch md:gap-3 md:p-2"
                  >
                    <div className={startTileSlotClass}>
                      {renderStartTile(
                        "style",
                        "Meditation style",
                        "Pick a practice type — body scan, sleep, breath, and more.",
                        "All",
                        {
                          selected: Boolean(state.style),
                          dimmed: Boolean(state.program),
                        },
                      )}
                    </div>
                    <div className={startTileSlotClass}>
                      {renderStartTile(
                        "program",
                        "Program",
                        "Start from a guided course and make selected sessions your own.",
                        "Program",
                        {
                          selected: Boolean(state.program),
                          dimmed: Boolean(state.style),
                        },
                      )}
                    </div>
                    {/* Below md: centre of the group (gap between stacked / side-by-side row tiles). */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-[1] md:hidden"
                    >
                      <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent/35 bg-card text-[11px] font-semibold tracking-[0.5px] text-accent-link">
                        or
                      </span>
                    </div>
                    {/* md+: centred on the image band between tall tiles. */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-2 z-[1] hidden aspect-[4/3] w-[calc((100%-16px-12px)/2)] -translate-x-1/2 md:block"
                    >
                      <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent/35 bg-card text-[11px] font-semibold tracking-[0.5px] text-accent-link">
                        or
                      </span>
                    </div>
                  </div>
                  <div className="flex min-h-8 items-center justify-between gap-2 md:col-start-2 md:row-start-1">
                    <p className="leading-none">
                      <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                        Context
                      </span>
                      <span className="text-[11px] font-medium tracking-[1px] text-muted">
                        {" "}
                        (optional)
                      </span>
                    </p>
                    <div className="hidden md:block">{renderSurpriseMe()}</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 px-1.5 sm:grid-cols-2 md:col-start-2 md:row-start-2 md:flex md:items-stretch md:gap-3 md:p-2 md:px-2">
                    <div className={startTileSlotClass}>
                      {renderStartTile(
                        "journal",
                        "Journal entry",
                        "Meditate on a journal entry — reflect what you wrote into a practice.",
                        "Journal",
                        {
                          selected: journalSelected,
                          dimmed: false,
                        },
                      )}
                    </div>
                    <div className={startTileSlotClass}>
                      {renderStartTile(
                        "goal",
                        "Manifest goal",
                        "Ground the practice in a life area or goal from Manifest.",
                        "Manifest",
                        {
                          selected: goalSelected,
                          dimmed: false,
                        },
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === "sound" ? (
            <div className="flex w-full flex-col gap-4">
              <div className="rounded-[10px] border border-accent/35 bg-accent-soft/40">
                <div className="flex min-w-0 items-start gap-2.5 px-3.5 py-2.5">
                  <span className="mt-0.5 shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                    <span className="md:hidden">Making</span>
                    <span className="hidden md:inline">You&apos;re making</span>
                  </span>
                  <span
                    title={state.prompt.trim() || undefined}
                    className={`min-w-0 flex-1 font-display text-[15px] leading-[1.35] text-foreground line-clamp-2 md:truncate md:text-[16px] ${
                      state.prompt.trim() ? "" : "italic text-muted"
                    }`}
                  >
                    {state.prompt.trim() || summarySentence}
                  </span>
                  <div className="shrink-0 self-center">
                    {renderLengthChip("compact", {
                      disabled: !state.program,
                    })}
                  </div>
                </div>
                {soundSessionIds && state.program ? (
                  <>
                    <div className="flex min-w-0 flex-col gap-1 border-t border-accent/20 px-3.5 py-2.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[1.4px] text-muted">
                        Program
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-y-2">
                        {tokens(false, {
                          includeStyle: false,
                          includeJournal: false,
                          includeGoal: false,
                        })}
                        {soundSessionMeta.expanded ? (
                          <div
                            role="group"
                            aria-label="Voice and sound target"
                            className="ml-4 flex min-w-0 items-center gap-1.5 border-l border-accent/35 pl-4 max-md:order-last max-md:ml-0 max-md:w-full max-md:overflow-x-auto max-md:border-l-0 max-md:py-1 max-md:pl-0 max-md:pr-1"
                          >
                            {[
                              { id: null as string | null, label: "All sessions" },
                              ...soundSessionIds.map((id, i) => ({
                                id: id as string | null,
                                label: String(i + 1),
                              })),
                            ].map(({ id, label }) => {
                              const selected = soundSessionMeta.focusSessionId === id;
                              const overridden =
                                id != null &&
                                soundSessionMeta.overriddenSessionIds.includes(id);
                              return (
                                <button
                                  key={id ?? "all"}
                                  type="button"
                                  aria-pressed={selected}
                                  disabled={audioBusy}
                                  onClick={() =>
                                    soundStepRef.current?.setFocusSessionId(id)
                                  }
                                  className={`relative inline-flex h-[34px] min-w-[34px] shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full bg-card px-[14px] text-[13px] disabled:cursor-not-allowed disabled:opacity-50 ${
                                    selected
                                      ? "border-[1.5px] border-accent font-semibold text-foreground"
                                      : "border border-border text-muted"
                                  }`}
                                >
                                  {label}
                                  {overridden ? (
                                    <span
                                      aria-hidden
                                      className="absolute -right-0.5 -top-0.5 h-[9px] w-[9px] rounded-full bg-accent ring-2 ring-background"
                                    />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2 pl-3 text-[13px]">
                          {soundSessionMeta.expanded ? (
                            <>
                              {soundSessionMeta.overrideCount > 0 ? (
                                <>
                                  <span className="text-muted">
                                    {soundSessionMeta.overrideCount === 1
                                      ? "1 session differs"
                                      : `${soundSessionMeta.overrideCount} sessions differ`}
                                  </span>
                                  <span aria-hidden className="text-border">
                                    ·
                                  </span>
                                  <button
                                    type="button"
                                    disabled={audioBusy}
                                    onClick={() =>
                                      soundStepRef.current?.clearAllSessionOverrides()
                                    }
                                    className="cursor-pointer font-semibold text-accent-link disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Reset all
                                  </button>
                                  <span aria-hidden className="text-border">
                                    ·
                                  </span>
                                </>
                              ) : null}
                              <button
                                type="button"
                                disabled={audioBusy}
                                onClick={() =>
                                  soundStepRef.current?.setSessionPickerExpanded(false)
                                }
                                className="cursor-pointer font-semibold text-accent-link disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Done
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-muted">
                                {soundSessionMeta.overrideCount > 0
                                  ? soundSessionMeta.overrideCount === 1
                                    ? "1 session customised"
                                    : `${soundSessionMeta.overrideCount} sessions customised`
                                  : soundSessionIds.length === 1
                                    ? "Voice and sound apply to your session"
                                    : `Voice and sound apply to all ${soundSessionIds.length} sessions`}
                              </span>
                              <span aria-hidden className="text-border">
                                ·
                              </span>
                              <button
                                type="button"
                                disabled={audioBusy}
                                onClick={() =>
                                  soundStepRef.current?.setSessionPickerExpanded(true)
                                }
                                className="cursor-pointer font-semibold text-accent-link disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {soundSessionMeta.overrideCount > 0
                                  ? "Edit"
                                  : "Set per session ›"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {state.style ||
                    state.journals.length > 0 ||
                    state.goal ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-accent/20 px-3.5 py-2.5">
                        {tokens(false, { kindLabels: true, includeProgram: false })}
                      </div>
                    ) : null}
                  </>
                ) : hasAttachedContext ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-accent/20 px-3.5 py-2.5">
                    {tokens(false, { kindLabels: true })}
                  </div>
                ) : null}
              </div>
              <CreateSoundStep
                ref={soundStepRef}
                disabled={audioBusy}
                meditationStyle={state.style?.id ?? null}
                programSpeakerModelId={state.program?.speakerModelId ?? null}
                programTitle={state.program?.title ?? null}
                programVoicePrefs={
                  state.program
                    ? coerceVoicePrefs({
                        energy: state.program.preferredEnergy,
                        pitch: state.program.preferredPitch,
                        gender: state.program.preferredGender,
                        accent: state.program.preferredAccent,
                      })
                    : null
                }
                onPreviewMixPlayingChange={setSoundPreviewPlaying}
                programId={soundSessionIds ? (state.program?.id ?? null) : null}
                programSessionIds={soundSessionIds}
                onSessionOverrideMetaChange={setSoundSessionMeta}
              />
              {audioError ? (
                <p className="text-sm text-danger">{audioError}</p>
              ) : null}
            </div>
          ) : null}

        </div>
      </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 px-3 pt-3 md:gap-0 md:px-6 md:pt-6">
          {stepper}
          <div className="flex min-h-0 w-full flex-1 flex-col pb-4 xl:flex-row xl:items-stretch xl:gap-5 xl:pb-4">
            <div className="flex min-h-0 min-w-0 w-full max-w-[760px] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_4px_18px_rgb(0_0_0_/_0.08)] md:rounded-[18px]">
              <div className="flex shrink-0 flex-col border-b border-border">
                <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 md:px-5 md:py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                    Chat
                  </span>
                  <button
                    type="button"
                    onClick={resetShape}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-foreground md:text-[13px]"
                  >
                    <IconRefresh className="h-3.5 w-3.5" stroke={1.8} />
                    Reset
                  </button>
                </div>
                <div className="flex flex-col gap-2.5 px-3.5 pb-3 md:px-5 md:pb-4 xl:hidden">
                  <div className="flex items-center gap-2.5">
                    {shapeBriefBody("two")}
                    <button
                      type="button"
                      aria-label="Edit brief"
                      onClick={beginBriefEdit}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted hover:text-foreground"
                    >
                      <IconPencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {state.program ? (
                    <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
                        {state.program.coverImageUrl ? (
                          <img
                            src={state.program.coverImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-[15px] leading-[1.25] text-foreground md:text-[16px]">
                          {state.program.title}
                        </p>
                        <p className="text-[12px] text-muted">
                          {programSelectedCount} of {programTotalCount} sessions
                          {" · "}
                          {state.program.mode === "one"
                            ? "One meditation"
                            : "One per session"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProgramHeaderOpen((v) => !v)}
                        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground"
                      >
                        {programHeaderOpen ? "Done" : "Edit"}
                        <SelectChevron open={programHeaderOpen} />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove program"
                        onClick={removeProgram}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted hover:text-foreground"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            d="M6 6l12 12M18 6L6 18"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible">
                      {tokens(true, { includeProgram: false })}
                      {shapeAddChips}
                    </div>
                    {state.style && !state.program ? (
                      <div className="hidden shrink-0 items-center gap-2 md:flex">
                        <div className="flex items-center gap-1">
                          {styleQuestions.map((_, i) => (
                            <span
                              key={i}
                              className={`h-1.5 w-3.5 rounded-full ${
                                styleQuestionStatuses[i] ||
                                styleQuestionCurrentIndex === i
                                  ? "header-gold-sunlit-fill"
                                  : "bg-border"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[12px] text-muted">
                          {styleQuestionProgressLabel}
                        </span>
                      </div>
                    ) : null}
                    <div className="ml-auto shrink-0">{renderLengthChip()}</div>
                  </div>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                {state.program && programHeaderOpen ? (
                  <div className="absolute inset-x-0 top-0 z-20 max-h-full overflow-y-auto border-b border-border bg-background px-3.5 py-3 shadow-[0_8px_24px_rgb(0_0_0_/_0.12)] md:px-5 xl:hidden">
                    <div className="flex flex-col gap-2.5">
                      {shapeProgramSessionsBlock}
                      <button
                        type="button"
                        onClick={removeProgram}
                        className="cursor-pointer text-left text-[12px] font-semibold text-muted"
                      >
                        Remove program
                      </button>
                    </div>
                  </div>
                ) : null}
                {shapeThread}
              </div>

              <div className="relative z-20 flex shrink-0 flex-col gap-2 border-t border-border bg-card px-3 py-2.5 md:px-5 md:py-3.5 md:pb-3">
                <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5">
                  <input
                    value={shapeInput}
                    onChange={(e) => setShapeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendShapeMessage(shapeInput);
                      }
                    }}
                    placeholder="Type or tap an answer"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[16px] leading-[1.45] outline-none placeholder:text-[16px]"
                  />
                  <DictationMicButton
                    variant="composer"
                    onTranscript={(t) =>
                      setShapeInput((v) => (v ? `${v} ${t}` : t))
                    }
                  />
                  <button
                    type="button"
                    disabled={!shapeInput.trim()}
                    onClick={() => sendShapeMessage(shapeInput)}
                    style={PRIMARY_ACCENT_FILL_STYLE}
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <aside
              aria-label="This meditation"
              className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto xl:flex"
            >
              <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card px-4 py-3.5 shadow-[0_4px_18px_rgb(0_0_0_/_0.08)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                    You&apos;re making
                  </span>
                  <button
                    type="button"
                    aria-label="Edit brief"
                    onClick={beginBriefEdit}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted hover:text-foreground"
                  >
                    <IconPencil className="h-[13px] w-[13px]" />
                  </button>
                </div>
                {shapeBriefBody("none")}
                <div className="flex flex-wrap items-center gap-1.5">
                  {renderLengthChip()}
                </div>
              </div>

              <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card px-4 py-3.5 shadow-[0_4px_18px_rgb(0_0_0_/_0.08)]">
                {state.program ? (
                  <>
                    <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                      Format · Program
                    </span>
                    {shapeProgramCard}
                    {shapeFormatAddOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {shapeFormatAddChips}
                      </div>
                    ) : null}
                  </>
                ) : state.style ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                        Format · Style
                      </span>
                      <span className="text-[12px] text-muted">
                        {styleQuestionProgressLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
                        {(() => {
                          const url =
                            categoryImageUrls[state.style.id]?.trim() ||
                            categoryImageUrls.All?.trim() ||
                            categoryImageUrls.all?.trim() ||
                            "";
                          return url ? (
                            <img
                              src={categoryImageUrlForTile(url, 72, 72)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null;
                        })()}
                      </div>
                      <p className="min-w-0 flex-1 font-display text-[16px] leading-[1.25] text-foreground">
                        {state.style.id}
                      </p>
                      <button
                        type="button"
                        aria-label="Remove format"
                        onClick={() => {
                          const id = state.style?.id;
                          if (!id) return;
                          removeShapeAttachment({
                            contextKind: "style",
                            label: id,
                            apply: (p) => ({
                              ...p,
                              style: null,
                              answers: {},
                            }),
                          });
                        }}
                        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center text-muted hover:text-foreground"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    <div className="h-px bg-border" />
                    {shapeQuestionRows}
                    {shapeFormatAddOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {shapeFormatAddChips}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                      Format
                      <span className="font-medium tracking-[1px] text-muted">
                        {" "}
                        (optional)
                      </span>
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {shapeFormatAddChips}
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card px-4 py-3.5 shadow-[0_4px_18px_rgb(0_0_0_/_0.08)]">
                <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                  Context
                  <span className="font-medium tracking-[1px] text-muted">
                    {" "}
                    (optional)
                  </span>
                </span>
                <div className="flex flex-col items-start gap-2">
                  {state.journals.length > 0 || state.goal ? (
                    <div className="flex flex-wrap gap-2">
                      {tokens(true, {
                        includeStyle: false,
                        includeProgram: false,
                      })}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {shapeContextAddChips}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      <CreateFlowFooterBar className="!pt-0 !pb-0">
        <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 md:h-[68px] md:gap-2.5 md:px-1">
          <div className="flex justify-start">
            {step !== "start" ? (
              <CreateFlowNavPill
                onClick={() => goStep(step === "sound" ? "shape" : "start")}
              >
                <IconArrowLeft className="h-4 w-4" />
                {step === "sound" ? "Shape" : "Start"}
              </CreateFlowNavPill>
            ) : null}
          </div>
          {/* Empty centre column keeps Back / actions positions (LengthBrief). */}
          <div className="flex items-center justify-center gap-2.5" aria-hidden />
          <div className="flex justify-end gap-2.5">
            {step === "start" ? (
              <>
                <CreateFlowNavPill onClick={createNow}>
                  Skip to audio
                </CreateFlowNavPill>
                <CreateFlowNavPill
                  onClick={() => enterShape(true)}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  className="!border-transparent accent-fill-gradient !text-on-accent hover:!opacity-90"
                >
                  <span className="md:hidden">Talk →</span>
                  <span className="hidden md:inline">Talk it through →</span>
                </CreateFlowNavPill>
              </>
            ) : null}
            {step === "shape" ? (
              <>
                {state.program ? (
                  <CreateFlowNavPill
                    onClick={() => goStep("sound")}
                    className="hidden md:inline-flex"
                  >
                    {state.program.mode === "one"
                      ? "Create now"
                      : `Create ${state.program.sessionIds.length || 1} now`}
                  </CreateFlowNavPill>
                ) : null}
                <CreateFlowNavPill
                  onClick={() => goStep("sound")}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  className="!border-transparent accent-fill-gradient !text-on-accent hover:!opacity-90"
                >
                  Sound →
                </CreateFlowNavPill>
              </>
            ) : null}
            {step === "sound" ? (
              <>
                <CreateFlowNavPill
                  disabled={audioBusy}
                  onClick={() => soundStepRef.current?.togglePreviewMix()}
                  className="hidden !h-11 !py-0 !pl-1.5 !pr-4 md:inline-flex"
                  aria-label={
                    soundPreviewPlaying ? soundPreviewStopLabel : soundPreviewLabel
                  }
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full accent-fill-gradient text-on-accent"
                    style={PRIMARY_ACCENT_FILL_STYLE}
                  >
                    {soundPreviewPlaying ? (
                      <span className="block h-2.5 w-2.5 rounded-[1px] bg-current" />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    )}
                  </span>
                  {soundPreviewLabel}
                </CreateFlowNavPill>
                <button
                  type="button"
                  disabled={audioBusy}
                  aria-label={
                    soundPreviewPlaying ? soundPreviewStopLabel : soundPreviewLabel
                  }
                  onClick={() => soundStepRef.current?.togglePreviewMix()}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm md:hidden"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[18px] w-[18px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 14v-4a2 2 0 0 1 2-2h1l3-3v14l-3-3H5a2 2 0 0 1-2-2z" />
                    <path d="M16 8a5 5 0 0 1 0 8" />
                    <path d="M18.5 5.5a8.5 8.5 0 0 1 0 13" />
                  </svg>
                </button>
                <CreateFlowNavPill
                  disabled={audioBusy}
                  onClick={() => void generateMeditation()}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  className="!border-transparent accent-fill-gradient !text-on-accent hover:!opacity-90"
                >
                  <span className="md:hidden">
                    {soundCreateCount > 1
                      ? `✦ Create ${soundCreateCount}`
                      : "✦ Create"}
                  </span>
                  <span className="hidden md:inline">{soundCreateLabel}</span>
                </CreateFlowNavPill>
              </>
            ) : null}
          </div>
        </div>
      </CreateFlowFooterBar>

      <CreateOneFlowPickerShell
        open={picker === "style"}
        eyebrow="Add · Style"
        title="Pick a meditation style"
        subtitle="Each style asks a few questions in the chat."
        footSummary={
          draftStyle ? `${draftStyle} selected` : "None selected"
        }
        confirmLabel={state.style ? "Save" : "Add to meditation"}
        confirmDisabled={!draftStyle}
        onClose={() => setPicker(null)}
        onConfirm={confirmPicker}
      >
        <CommunityCategoryGrid
          selected={draftStyle}
          onSelect={(v) => setDraftStyle(v)}
          includeAll={false}
          variant="picker"
        />
      </CreateOneFlowPickerShell>

      <CreateOneFlowPickerShell
        open={picker === "program"}
        eyebrow="Add · Program"
        title="Pick a program"
        subtitle="Make an existing program your own."
        footSummary={
          programs.find((p) => p.id === draftProgramId)?.title ?? "None selected"
        }
        confirmLabel={state.program ? "Save" : "Add to meditation"}
        confirmDisabled={!draftProgramId}
        onClose={() => setPicker(null)}
        onConfirm={confirmPicker}
      >
        <CreateProgramPicker
          programs={programs}
          listReady={programsReady}
          selectedId={draftProgramId}
          onSelect={setDraftProgramId}
        />
      </CreateOneFlowPickerShell>

      <CreateOneFlowPickerShell
        open={picker === "journal"}
        eyebrow="Add · Journal"
        title="Pick a journal entry"
        confirmLabel="Add to meditation"
        confirmDisabled={!draftJournalId}
        onClose={() => setPicker(null)}
        onConfirm={confirmPicker}
      >
        <JournalReflectPicker
          entries={journalEntries}
          folders={journalFolders}
          listReady={journalReady}
          selectedId={draftJournalId}
          onSelect={(id) => setDraftJournalId(id)}
          guidance=""
          onGuidanceChange={() => {}}
        />
      </CreateOneFlowPickerShell>

      <CreateOneFlowPickerShell
        open={picker === "goal"}
        eyebrow="Add · Goal"
        title="Pick a life area"
        confirmLabel={state.goal ? "Save" : "Add to meditation"}
        confirmDisabled={!draftLifeAreaId}
        onClose={() => setPicker(null)}
        onConfirm={confirmPicker}
      >
        <ManifestGoalPicker
          lifeAreas={lifeAreas}
          listReady={goalsReady}
          selectedLifeAreaId={draftLifeAreaId}
          selectedGoalId={draftGoalId}
          onSelectLifeArea={(id) => {
            setDraftLifeAreaId(id);
            setDraftGoalId(null);
          }}
          onSelectGoal={(lifeAreaId, goalId) => {
            setDraftLifeAreaId(lifeAreaId);
            setDraftGoalId((prev) => (prev === goalId ? null : goalId));
          }}
          guidance=""
          onGuidanceChange={() => {}}
        />
      </CreateOneFlowPickerShell>
    </div>
  );
}
