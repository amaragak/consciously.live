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
import { CommunityCategoryGrid } from "@/components/community-category-grid";
import { AppPrimaryTabsDesktop } from "@/components/app-primary-tabs";
import { CreateFlowFooterBar } from "@/components/create-flow-footer-bar";
import { CreateFlowNavPill } from "@/components/create-flow-nav-pill";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { CreateOneFlowPickerShell } from "@/components/create-one-flow-picker-shell";
import { CreateOneFlowStepper } from "@/components/create-one-flow-stepper";
import { CreateProgramPicker } from "@/components/create-program-picker";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { JournalReflectPicker } from "@/components/journal-reflect-picker";
import { ManifestGoalPicker } from "@/components/manifest-goal-picker";
import { MeditationLengthSelect } from "@/components/meditation-length-select";
import {
  attachProgramExclusive,
  attachStyleExclusive,
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
  fingerprintShapeStart,
  parseCoachDisplayText,
} from "@/lib/create-one-flow-chat";
import {
  MEDITATION_STYLE_LABELS,
  STYLE_INTAKE_QUESTIONS,
  type MeditationStyleLabel,
} from "@/lib/meditation-style-intake";
import {
  createMeditationAudioJob,
  fetchLibraryCategoryImages,
  getMedimadeSessionJwt,
  listLibraryPrograms,
  streamMedimadeChat,
  type LibraryProgram,
} from "@/lib/medimade-api";
import {
  journalEntryPlainForHandoff,
  loadJournalStore,
  loadJournalStoreRaw,
  type JournalEntry,
  type JournalFolder,
} from "@/lib/journal-storage";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { appendPendingLibraryGeneration } from "@/lib/pending-library-generations";
import { ensurePendingMeditationJobPoller } from "@/lib/poll-pending-meditation-jobs";
import { buildMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";
import {
  CreateSoundStep,
  type CreateSoundStepHandle,
} from "@/components/create-sound-step";

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

function ContextLetterBadge({ letter }: { letter: string }) {
  return (
    <span className="header-gold-sunlit-fill flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold">
      {letter}
    </span>
  );
}

function ContextToken({
  visual,
  name,
  detail,
  onRemove,
}: {
  visual: ReactNode;
  name: string;
  detail?: string | null;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex h-[34px] max-w-full items-center gap-2 rounded-[10px] border border-accent/40 bg-accent-soft/50 py-0 pl-1.5 pr-1.5 text-[13px]">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md">
        {visual}
      </span>
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

  const [picker, setPicker] = useState<PickerKind>(null);
  const [draftStyle, setDraftStyle] = useState<string>("");
  const [draftProgramId, setDraftProgramId] = useState<string | null>(null);
  const [draftJournalId, setDraftJournalId] = useState<string | null>(null);
  const [draftLifeAreaId, setDraftLifeAreaId] = useState<string | null>(null);
  const [draftGoalId, setDraftGoalId] = useState<string | null>(null);
  const [exclusiveNote, setExclusiveNote] = useState<string | null>(null);

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
  const [showAsForm, setShowAsForm] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [briefEditing, setBriefEditing] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const briefTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const threadStickToBottomRef = useRef(true);
  const soundStepRef = useRef<CreateSoundStepHandle | null>(null);
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
    try {
      const store = loadIdeateStore();
      setLifeAreas(
        store.dreams.map((d) => ({
          id: d.id,
          title: d.title?.trim() || "Life area",
          createdAt: d.createdAt ?? new Date().toISOString(),
          dreamText: d.dreamText ?? "",
          obstacleText: d.obstacleText ?? "",
          visionText: d.visionText ?? "",
          preview: d.dreamText ?? "",
          goals: [],
        })),
      );
    } catch {
      setLifeAreas([]);
    }
    setGoalsReady(true);
  }, []);

  const styleQuestions = useMemo(() => {
    if (!state.style) return [] as string[];
    return [...(STYLE_INTAKE_QUESTIONS[state.style.id] ?? [])];
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
    if (step !== "shape" || showAsForm) return;
    scrollShapeThreadToBottom();
    const id = window.requestAnimationFrame(() => scrollShapeThreadToBottom());
    return () => window.cancelAnimationFrame(id);
  }, [visibleChat, state.chat, shapeBusy, step, showAsForm, scrollShapeThreadToBottom]);

  /** Context types not yet attached — for Shape "+ Add" chips. */
  const shapeAddOptions: Array<{
    kind: "style" | "program" | "journal" | "goal";
    label: string;
  }> = [];
  if (!state.style) shapeAddOptions.push({ kind: "style", label: "Style" });
  if (!state.program) shapeAddOptions.push({ kind: "program", label: "Program" });
  if (state.journals.length === 0) {
    shapeAddOptions.push({ kind: "journal", label: "Journal" });
  }
  if (!state.goal) shapeAddOptions.push({ kind: "goal", label: "Goal" });

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
    if (!opts?.midChat) return base;
    return [
      base,
      "",
      "MID-CHAT ATTACH (overrides OPEN NOW / first-reply): The conversation already has prior turns — keep them. Do NOT welcome from scratch, do NOT use the five-bubble OPEN NOW format, do NOT restart. Acknowledge the program in one short sentence, then ask exactly one concrete question for Ask-item 1 of the first selected session (or one spirit question if there are no Ask-items). Prior brief/chat answers still count.",
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

    const writeBubble = (text: string, ready?: boolean) => {
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
        chat[idx] = {
          role: "assistant",
          text,
          ...(ready ? { ready: true } : {}),
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
          writeBubble(parsed.text, parsed.ready);
        },
      );
      if (requestId !== shapeRequestIdRef.current) return;
      const parsed = parseCoachDisplayText(raw);
      writeBubble(parsed.text || rawSoFar, parsed.ready);
    } catch (e) {
      if (requestId !== shapeRequestIdRef.current) return;
      const msg =
        e instanceof Error ? e.message : "Could not reach the guide.";
      writeBubble(rawSoFar.trim() ? parseCoachDisplayText(rawSoFar).text : `Sorry — ${msg}`);
    } finally {
      if (requestId === shapeRequestIdRef.current) {
        setShapeBusy(false);
      }
    }
  }

  function openShapeCoach(s: CreateOneFlowState) {
    const hasAssistant = s.chat.some((m) => m.role === "assistant");
    if (hasAssistant) return;
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
    const label = "Updated from Start";
    const contextTurn: CreateFlowChatTurn = {
      role: "user",
      text: label,
      kind: "context",
      contextKind: "start",
      contextDetail: "Start step changes",
    };
    let nextState: CreateOneFlowState | null = null;
    setState((prev) => {
      nextState = { ...prev, chat: [...prev.chat, contextTurn] };
      return nextState;
    });
    const live = nextState ?? { ...s, chat: [...s.chat, contextTurn] };
    const messages = buildShapeTurnApiMessages({
      chat: live.chat,
      userText:
        "I updated the Start step. Keep the prior chat intact; fold in the Start overrides (system supplement) and continue — do not restart.",
      state: live,
      leanUserTurn: true,
      contextUpdateNote:
        "Creator returned from Start with changes. Prior messages stay. Do not re-ask answered ground.",
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
    }. Keep the prior conversation; this is not a restart.`;
    const messages = buildShapeTurnApiMessages({
      chat: s.chat,
      userText: apiUserText,
      state: s,
      lifeArea: shapeLifeAreaFor(s),
      programBrief: shapeProgramBriefFor(s, {
        midChat: opts.contextKind === "program",
      }),
      contextUpdateNote: opts.note,
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

  function openPicker(kind: Exclude<PickerKind, null>) {
    setExclusiveNote(null);
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
      setState((prev) => {
        const next = attachStyleExclusive(prev, { id: draftStyle });
        if (prev.program) {
          setExclusiveNote("Program removed — a style replaces it.");
        }
        return next;
      });
      contextKind = "style";
      contextLabel = draftStyle;
      contextNote = `Style "${draftStyle}" was just attached. If your last question asked what they need, want, or what kind of practice — treat "${draftStyle}" as their answer. Use its intake aims going forward; do not re-ask what they already answered by attaching this style.`;
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
      };
      setState((prev) => {
        const next = attachProgramExclusive(prev, att);
        if (prev.style) setExclusiveNote("Style removed — a program replaces it.");
        return next;
      });
      contextKind = "program";
      contextLabel = att.title;
      contextImageUrl = att.coverImageUrl ?? null;
      contextNote = `Program "${att.title}" was just attached mid-chat. Keep every prior assistant/user turn visible in history. Do not restart or re-ask the brief question. Treat the program as new context under that thread, then ask the next program Ask-item only.`;
    } else if (picker === "journal") {
      const e = journalEntries.find((x) => x.id === draftJournalId);
      if (!e) return;
      const att: CreateFlowJournalAttachment = {
        id: e.id,
        title: e.title?.trim() || "Journal entry",
        detail: e.mood?.trim() || null,
        bodyPlain: journalEntryPlainForHandoff(e.contentHtml),
      };
      setState((prev) => ({ ...prev, journals: [att] }));
      contextKind = "journal";
      contextLabel = att.title;
      contextDetail = att.detail ?? null;
      contextNote = `Journal "${att.title}" was just attached (full body in context). If your last question asked what is going on or what they need, treat the journal as (part of) their answer. Draw from it; do not re-ask what the entry already covers.`;
    } else if (picker === "goal") {
      const area = lifeAreas.find((g) => g.id === draftLifeAreaId);
      if (!area) return;
      const att: CreateFlowGoalAttachment = {
        lifeAreaId: area.id,
        lifeAreaTitle: area.title.trim() || "Life area",
        goalId: draftGoalId,
        goalTitle: null,
      };
      setState((prev) => ({ ...prev, goal: att }));
      contextKind = "goal";
      contextLabel = att.lifeAreaTitle;
      contextNote = `Life area "${att.lifeAreaTitle}" was just attached. If your last question asked what they need or want, treat this life area / goal as (part of) their answer. Do not re-ask.`;
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
    setShowAsForm(false);
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
    if (!trimmed || shapeBusy) return;
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
      lines.push(`${m.role === "user" ? "User" : "Guide"}: ${m.text.trim()}`);
    }
    if (state.journals[0]) {
      const j = state.journals[0];
      lines.push(
        `Journal context: ${j.title}${j.bodyPlain?.trim() ? `\n${j.bodyPlain.trim()}` : ""}`,
      );
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
      const soundExtras = await soundStepRef.current?.getJobExtras();
      if (!soundExtras?.reference_id) throw new Error("No voice available");

      const styleForJob = state.style?.id ?? null;
      const transcript = buildTranscript();
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

      const { jobId } = await createMeditationAudioJob({
        meditationStyle: styleForJob ?? "General",
        journalMode:
          !state.style ||
          Boolean(state.journals.length || state.goal || state.program),
        meditationTargetMinutes: state.lengthMinutes,
        transcript,
        reference_id: soundExtras.reference_id,
        ttsProvider: "speechify",
        fishTtsModel: "s2.1-pro-free",
        creationProvenance: provenance,
        voiceFxPreset: soundExtras.voiceFxPreset,
        voiceFxDial: soundExtras.voiceFxDial,
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

      appendPendingLibraryGeneration({
        jobId,
        createdAt: new Date().toISOString(),
        title: "",
        description: null,
        meditationStyle: styleForJob,
        speakerName: soundExtras.speakerName,
        speakerModelId: soundExtras.reference_id,
      });
      ensurePendingMeditationJobPoller();
      shapeCachedContextRef.current = null;
      shapeAppliedFingerprintRef.current = null;
      shapeOverridesSupplementRef.current = null;
      clearCreateOneFlowState();
      navigate(
        `/meditate/library/creations?focus=${encodeURIComponent(`pending:${jobId}`)}`,
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
  ): ReactNode => (
    <>
      {state.style ? (
        <ContextToken
          visual={<ContextLetterBadge letter="S" />}
          name={state.style.id}
          onRemove={
            removable
              ? () => setState((p) => ({ ...p, style: null, answers: {} }))
              : undefined
          }
        />
      ) : null}
      {state.program ? (
        <ContextToken
          visual={
            state.program.coverImageUrl ? (
              <img src={state.program.coverImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ContextLetterBadge letter="P" />
            )
          }
          name={state.program.title}
          detail={
            state.program.mode === "one"
              ? "One meditation"
              : `${state.program.sessionIds.length} sessions`
          }
          onRemove={
            removable
              ? () => setState((p) => ({ ...p, program: null }))
              : undefined
          }
        />
      ) : null}
      {state.journals.map((j) => (
        <ContextToken
          key={j.id}
          visual={<ContextLetterBadge letter="J" />}
          name={j.title}
          detail={j.detail}
          onRemove={
            removable
              ? () =>
                  setState((p) => ({
                    ...p,
                    journals: p.journals.filter((x) => x.id !== j.id),
                  }))
              : undefined
          }
        />
      ))}
      {state.goal ? (
        <ContextToken
          visual={<ContextLetterBadge letter="G" />}
          name={state.goal.lifeAreaTitle}
          detail={state.goal.goalTitle}
          onRemove={
            removable
              ? () => setState((p) => ({ ...p, goal: null }))
              : undefined
          }
        />
      ) : null}
    </>
  );

  const stepper = (
    <>
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
      <div className="md:hidden">
        <CreateOneFlowStepper
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
      </div>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {step !== "shape" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3.5 px-4 pb-4 pt-3.5 md:gap-[22px] md:px-6 md:pb-5 md:pt-7">
            {stepper}
          {step === "start" ? (
            <div className="flex w-full flex-col gap-4">
              <div>
                <h1 className="mt-1 min-w-0 font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl md:mt-0">
                  What&apos;s this one for?
                </h1>
                <p className="mt-2 text-[15px] text-foreground md:mt-2">
                  Write a line, attach context, or both — then talk it through or skip to audio.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-3.5 pb-3 pt-3.5 shadow-sm md:gap-3.5 md:rounded-[18px] md:px-5 md:pb-3.5 md:pt-5">
                <textarea
                  ref={textareaRef}
                  value={state.prompt}
                  onChange={(e) =>
                    setState((p) => ({ ...p, prompt: e.target.value }))
                  }
                  placeholder="Can't switch off after work…"
                  rows={3}
                  className="min-h-[72px] w-full resize-none border-0 bg-transparent font-display text-[17px] leading-[1.45] text-foreground outline-none placeholder:text-muted md:min-h-[84px] md:text-xl"
                />
                {exclusiveNote ? (
                  <p className="text-[12px] text-muted">{exclusiveNote}</p>
                ) : null}
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {hasAttachedContext ? (
                      tokens(true)
                    ) : (
                      <p className="text-[14px] text-muted md:text-[15px]">
                        Add context below, or just send
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold uppercase tracking-[1.4px] text-accent-link md:text-[14px]">
                    Add context
                  </p>
                  <button
                    type="button"
                    onClick={surpriseMe}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-[15px] font-semibold text-foreground hover:underline md:text-base"
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
                </div>
                <div className="mt-2 grid w-3/4 grid-cols-2 gap-3.5 md:grid-cols-4 md:gap-5">
                  {(
                    [
                      [
                        "style",
                        "Meditation style",
                        "Pick a practice type — body scan, sleep, breath, and more.",
                        "All",
                      ],
                      [
                        "program",
                        "Program",
                        "Start from a guided course and make selected sessions your own.",
                        "Program",
                      ],
                      [
                        "journal",
                        "Journal entry",
                        "Meditate on a journal entry — reflect what you wrote into a practice.",
                        "Journal",
                      ],
                      [
                        "goal",
                        "Manifest goal",
                        "Ground the practice in a life area or goal from Manifest.",
                        "Manifest",
                      ],
                    ] as const
                  )
                    .filter(([kind]) => {
                      if (kind === "style") return !state.style;
                      if (kind === "program") return !state.program;
                      if (kind === "journal") return state.journals.length === 0;
                      if (kind === "goal") return !state.goal;
                      return true;
                    })
                    .map(([kind, title, line, coverCategory]) => {
                      const coverUrl =
                        categoryImageUrls[coverCategory]?.trim() || "";
                      return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => openPicker(kind)}
                        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm"
                      >
                        <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-gradient-to-br from-accent/25 via-accent-soft/40 to-selected/20">
                          {coverUrl ? (
                            <img
                              src={categoryImageUrlForTile(coverUrl, 360, 360)}
                              alt=""
                              width={360}
                              height={360}
                              decoding="async"
                              className="block h-full w-full object-cover object-center"
                            />
                          ) : null}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/55 text-foreground shadow-sm backdrop-blur-[2px] md:h-8 md:w-8"
                          >
                            <IconPlus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </span>
                        </div>
                        <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-2 md:px-3 md:pb-3">
                          <p className="font-display text-[15px] font-medium leading-snug text-foreground md:text-[16px]">
                            {title}
                          </p>
                          <p className="mt-1 text-[12px] leading-snug text-muted md:text-[13px]">
                            {line}
                          </p>
                        </div>
                      </button>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : null}

          {step === "sound" ? (
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-[14px] border border-accent/35 bg-accent-soft/40 px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                  You&apos;re making
                </p>
                <p className="font-display text-[17px] leading-snug text-foreground md:text-xl md:leading-[1.3]">
                  {summarySentence}
                </p>
                <div className="flex flex-wrap gap-1.5">{tokens(false)}</div>
              </div>
              <CreateSoundStep ref={soundStepRef} disabled={audioBusy} />
              {audioError ? (
                <p className="text-sm text-danger">{audioError}</p>
              ) : null}
            </div>
          ) : null}

        </div>
      </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2.5 px-4 pt-3.5 md:gap-3 md:px-6 md:pt-5">
          <div className="shrink-0">{stepper}</div>
          <div className="flex min-h-0 w-full max-w-[760px] flex-1 flex-col gap-[14px] pb-4 md:gap-[18px] md:pb-4">
            {/* Brief card */}
            <div className="flex shrink-0 flex-col gap-2.5 rounded-[14px] border border-border bg-card px-3 py-2.5 shadow-sm md:gap-2.5 md:px-4 md:py-3">
              <div className="flex items-center gap-2.5">
                {briefEditing ? (
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
                    rows={1}
                    className="min-h-[1.35em] min-w-0 flex-1 resize-none border-0 bg-transparent font-display text-[16px] leading-[1.35] text-foreground outline-none md:text-[18px]"
                  />
                ) : state.prompt.trim() ? (
                  <button
                    type="button"
                    title={state.prompt.trim()}
                    onClick={beginBriefEdit}
                    className="min-w-0 flex-1 cursor-pointer text-left font-display text-[16px] leading-[1.35] text-foreground line-clamp-2 md:truncate md:text-[18px] md:leading-[1.35]"
                  >
                    {state.prompt.trim()}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={beginBriefEdit}
                    className="min-w-0 flex-1 cursor-pointer text-left font-display text-[16px] italic leading-[1.35] text-muted md:text-[18px]"
                  >
                    Add a line about what this is for
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Edit brief"
                  onClick={beginBriefEdit}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted hover:text-foreground"
                >
                  <IconPencil className="h-3.5 w-3.5" />
                </button>
              </div>
              {(state.program
                ? state.journals.length > 0 ||
                  state.goal ||
                  shapeAddOptions.length > 0
                : true) && (
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap">
                    {state.program
                      ? (
                          <>
                            {state.journals.map((j) => (
                              <ContextToken
                                key={j.id}
                                visual={
                                  <ContextLetterBadge letter="J" />
                                }
                                name={j.title}
                                detail={j.detail}
                                onRemove={() =>
                                  setState((p) => ({
                                    ...p,
                                    journals: p.journals.filter(
                                      (x) => x.id !== j.id,
                                    ),
                                  }))
                                }
                              />
                            ))}
                            {state.goal ? (
                              <ContextToken
                                visual={
                                  <ContextLetterBadge letter="G" />
                                }
                                name={state.goal.lifeAreaTitle}
                                detail={state.goal.goalTitle}
                                onRemove={() =>
                                  setState((p) => ({ ...p, goal: null }))
                                }
                              />
                            ) : null}
                          </>
                        )
                      : tokens(true)}
                    {shapeAddOptions.map(({ kind, label }) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => openPicker(kind)}
                        className="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1 rounded-[10px] border border-dashed border-accent/40 px-2.5 text-[13px] text-accent-link"
                      >
                        <IconPlus className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                  {!state.program && state.style ? (
                    <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
                      <span className="text-[12px] text-muted">
                        {state.style.id}
                        {state.chat.some((m) => m.ready)
                          ? " · ready"
                          : " · shaping"}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {state.program ? (
              <div className="flex shrink-0 flex-col gap-3 rounded-[14px] border border-border bg-card px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-accent-soft md:h-11 md:w-11">
                    {state.program.coverImageUrl ? (
                      <img
                        src={state.program.coverImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base text-foreground md:text-[17px]">
                      {state.program.title}
                    </p>
                    <p className="text-[12px] text-muted">
                      {state.program.mode === "one"
                        ? "Making it your own · one meditation"
                        : `Making it your own · ${state.program.sessionIds.length} of ${Object.keys(state.program.sessionTitles).length || state.program.sessionIds.length} sessions`}
                    </p>
                  </div>
                  <div className="hidden items-center rounded-[10px] border border-border/70 bg-accent-soft/25 p-[3px] md:flex">
                    {(
                      [
                        ["one", "One meditation"],
                        ["perSession", "One per session"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          setState((p) =>
                            p.program
                              ? {
                                  ...p,
                                  program: { ...p.program, mode },
                                }
                              : p,
                          )
                        }
                        className={`h-8 cursor-pointer rounded-lg px-2.5 text-[12px] ${
                          state.program?.mode === mode
                            ? "header-gold-sunlit-fill font-semibold"
                            : "text-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="cursor-pointer text-[13px] font-semibold text-accent-link"
                    onClick={() => setSessionsOpen((v) => !v)}
                  >
                    {sessionsOpen ? "Sessions ▴" : "Sessions ▾"}
                  </button>
                </div>
                {sessionsOpen && state.program.mode === "perSession" ? (
                  <div className="grid grid-cols-1 gap-2 border-t border-border pt-2.5 md:grid-cols-2 md:gap-x-5 md:gap-y-2">
                    {Object.entries(state.program.sessionTitles).map(
                      ([id, title], i) => {
                        const checked = state.program!.sessionIds.includes(id);
                        return (
                          <label
                            key={id}
                            className={`flex cursor-pointer items-center gap-2 text-[13px] ${
                              checked ? "text-foreground" : "text-muted"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setState((p) => {
                                  if (!p.program) return p;
                                  const set = new Set(p.program.sessionIds);
                                  if (set.has(id)) set.delete(id);
                                  else set.add(id);
                                  return {
                                    ...p,
                                    program: {
                                      ...p.program,
                                      sessionIds: [...set],
                                    },
                                  };
                                })
                              }
                              className="h-[18px] w-[18px] rounded-[5px] accent-[var(--color-accent)]"
                            />
                            {i + 1}. {title}
                          </label>
                        );
                      },
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showAsForm && state.style ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                  {styleQuestions.map((q, i) => (
                    <label key={i} className="block">
                      <span className="text-[12px] font-semibold text-accent-link">
                        {i + 1}. {q}
                      </span>
                      <textarea
                        value={state.answers[String(i)] ?? ""}
                        onChange={(e) =>
                          setState((p) => ({
                            ...p,
                            answers: {
                              ...p.answers,
                              [String(i)]: e.target.value,
                            },
                          }))
                        }
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div
                ref={threadScrollRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const dist =
                    el.scrollHeight - el.scrollTop - el.clientHeight;
                  threadStickToBottomRef.current = dist < 48;
                }}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
              >
                {visibleChat.map((m, i) =>
                  m.kind === "context" ? (
                    m.contextKind === "program" ? (
                      <div
                        key={`context-${i}`}
                        className="ml-auto flex w-full max-w-[92%] flex-col items-end gap-1.5 md:max-w-[80%]"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
                          Program added
                        </span>
                        <div className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-card px-3 py-2.5 shadow-sm">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
                            {m.contextImageUrl ? (
                              <img
                                src={m.contextImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <ContextLetterBadge letter="P" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate font-display text-[15px] text-foreground md:text-[16px]">
                              {m.text}
                            </p>
                            {m.contextDetail?.trim() ? (
                              <p className="truncate text-[12px] text-muted">
                                {m.contextDetail.trim()}
                              </p>
                            ) : (
                              <p className="truncate text-[12px] text-muted">
                                Making it your own
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={`context-${i}`}
                        className="ml-auto flex max-w-[92%] flex-wrap items-center justify-end gap-2 py-0.5 md:max-w-[80%]"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
                          {m.contextKind === "style"
                            ? "Style added"
                            : m.contextKind === "goal"
                              ? "Goal added"
                              : m.contextKind === "journal"
                                ? "Journal added"
                                : m.contextKind === "start"
                                  ? "Start updated"
                                  : "Context added"}
                        </span>
                        <ContextToken
                          visual={
                            <ContextLetterBadge
                              letter={
                                m.contextKind === "style"
                                  ? "S"
                                  : m.contextKind === "goal"
                                    ? "G"
                                    : m.contextKind === "start"
                                      ? "★"
                                      : "J"
                              }
                            />
                          }
                          name={m.text}
                          detail={m.contextDetail}
                        />
                      </div>
                    )
                  ) : (
                    <div
                      key={`${m.role}-${i}`}
                      className={`rounded-[14px] px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
                        m.role === "user"
                          ? "header-gold-sunlit-fill ml-auto max-w-[80%] rounded-br-sm"
                          : "mr-auto max-w-[92%] rounded-bl-sm border border-border bg-card text-foreground md:max-w-[86%]"
                      }`}
                    >
                      {m.role === "assistant" && state.style ? (
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                          {state.style.id}
                        </p>
                      ) : null}
                      {m.text.trim() ? m.text : shapeBusy ? "…" : null}
                    </div>
                  ),
                )}
              </div>
            )}

            <div className="shrink-0">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-sm">
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
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none md:text-[15px]"
                />
                <DictationMicButton
                  variant="composer"
                  onTranscript={(t) =>
                    setShapeInput((v) => (v ? `${v} ${t}` : t))
                  }
                />
                <button
                  type="button"
                  disabled={shapeBusy || !shapeInput.trim()}
                  onClick={() => sendShapeMessage(shapeInput)}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <IconArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-col items-center gap-2 md:items-start md:pl-4">
                <div className="flex items-center justify-center gap-[18px] text-[12px] md:justify-start md:text-[13px]">
                  {state.style ? (
                    <button
                      type="button"
                      className="cursor-pointer font-semibold text-accent-link"
                      onClick={() => setShowAsForm((v) => !v)}
                    >
                      {showAsForm ? "Show as chat" : "Show as form"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cursor-pointer text-muted"
                    onClick={resetShape}
                  >
                    Reset
                  </button>
                </div>
                {state.program ? (
                  <button
                    type="button"
                    onClick={() => goStep("sound")}
                    className="cursor-pointer text-center text-[12px] font-semibold text-accent-link md:hidden"
                  >
                    {state.program.mode === "one"
                      ? "Create now with what you've said"
                      : `Create ${state.program.sessionIds.length || 1} now with what you've said`}
                  </button>
                ) : null}
              </div>
            </div>
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
          <div className="flex items-center justify-center gap-2.5">
            <MeditationLengthSelect
              value={state.lengthMinutes}
              onChange={(n) =>
                setState((p) => ({
                  ...p,
                  lengthMinutes:
                    n === 2 || n === 5 || n === 10 || n === 20 ? n : 5,
                }))
              }
            />
          </div>
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
              <CreateFlowNavPill
                disabled={audioBusy}
                onClick={() => void generateMeditation()}
                style={PRIMARY_ACCENT_FILL_STYLE}
                className="!border-transparent accent-fill-gradient !text-on-accent hover:!opacity-90"
              >
                <span className="md:hidden">✦ Create</span>
                <span className="hidden md:inline">✦ Create meditation</span>
              </CreateFlowNavPill>
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
        confirmLabel={state.journals.length ? "Save" : "Add to meditation"}
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
          onSelectGoal={(id) => setDraftGoalId(id)}
          guidance=""
          onGuidanceChange={() => {}}
        />
      </CreateOneFlowPickerShell>
    </div>
  );
}
