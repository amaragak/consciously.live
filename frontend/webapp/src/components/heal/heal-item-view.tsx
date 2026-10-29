import { Leaf, Mail, MoreHorizontal, Pencil, PenLine, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AttachedJournalList } from "@/components/attached-journal-list";
import { AppTopBarTrailingPortal } from "@/components/app-primary-tabs";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { appendSpokenText } from "@/hooks/use-whisper-dictation";
import { LogoMark } from "@/components/logo-mark";
import { MeditationReflectionLink } from "@/components/meditation-reflection-link";
import { SelectChevron } from "@/components/select-chevron";
import {
  HEAL_OUTLINE,
  HEAL_PAGE,
  HEAL_PRIMARY,
  HealOverlay,
  HealRiskPill,
  rememberRisk,
  useHealStore,
} from "@/components/heal/heal-bits";
import { HEAL_TYPES, healTypeLabel } from "@/lib/heal-copy";
import { healAfterUpdate, healLenses, healSetup, healSuggestMore } from "@/lib/heal-ai";
import { meditationIdFromLibraryItem } from "@/lib/journal-meditation-reflect";
import {
  capWords,
  journalContextForHealItem,
  journalNewEntryHref,
  journalRowsForHealItem,
  subscribeJournalEntries,
  subscribeMeditationOrigins,
} from "@/lib/journal-links";
import { listLibraryMeditations, type LibraryMeditationItem } from "@/lib/medimade-api";
import { loadIdeateStore, saveIdeateStore } from "@/lib/plan-ideate-store";
import {
  healMeditationsForItem,
} from "@/lib/heal-meditation-links";
import { useRouter } from "@/lib/spa-nav";
import { addTrackerItem, patchTrackerItem } from "@/lib/tracker-items";
import {
  actionsForItem,
  addHealAction,
  addHealEntry,
  addHealExercises,
  addHealUpdate,
  addHealView,
  currentView,
  deleteHealUpdate,
  descriptionForItem,
  entriesForItem,
  exercisesForItem,
  fallbackExerciseQuestions,
  formatHealDate,
  healRelative,
  healUpdateNarrative,
  laterUpdatesForItem,
  loadHealStore,
  patchHealUpdate,
  patchHealAction,
  patchHealExercise,
  patchHealItem,
  setHealItemStatus,
  updatesForItem,
  viewsForSide,
  type HealCanDo,
  type HealEntry,
  type HealExercise,
  type HealItem,
  type HealSeeLens,
  type HealStoreV1,
  type HealView,
} from "@/lib/heal-store";
import { healItemHref, lifeAreaHrefById } from "@/lib/entity-href";

const SEE_LENSES: { id: HealSeeLens; label: string }[] = [
  { id: "kind", label: "Be kind to myself" },
  { id: "forgive", label: "Forgive" },
  { id: "accept", label: "Accept" },
  { id: "long", label: "The long view" },
];

const KIND_BLURB: Record<string, string> = {
  shame: "Something I'm ashamed of",
};

const HERO_NAVY = "#1E232E";
const HERO_IVORY = "#F3EDE2";
const HERO_GHOST =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[rgb(243_237_226_/_0.35)] bg-[rgb(243_237_226_/_0.06)] px-3.5 text-[13px] font-semibold text-[#F3EDE2]";

function MeditationMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="2" />
      <path d="M21 16v-2c-2.24 0-4.16-.96-5.6-2.68l-1.34-1.6A1.98 1.98 0 0 0 12.53 9h-1.05c-.59 0-1.15.26-1.53.72l-1.34 1.6C7.16 13.04 5.24 14 3 14v2c2.77 0 5.19-1.17 7-3.25V15l-3.88 1.55c-.67.27-1.12.93-1.12 1.66C5 19.2 5.8 20 6.79 20H9v-.5a2.5 2.5 0 0 1 2.5-2.5h3c.28 0 .5.22.5.5s-.22.5-.5.5h-3c-.83 0-1.5.67-1.5 1.5v.5h7.21c.99 0 1.79-.8 1.79-1.79 0-.73-.45-1.39-1.12-1.66L14 15v-2.25c1.81 2.08 4.23 3.25 7 3.25z" />
    </svg>
  );
}

function HealMeditationCard({
  itemId,
  viewId,
  onCreate,
}: {
  itemId: string;
  viewId: string | null;
  onCreate: () => void;
}) {
  const router = useRouter();
  const latest = healMeditationsForItem(itemId)[0] ?? null;
  const [libraryItem, setLibraryItem] = useState<LibraryMeditationItem | null>(null);
  const changed = Boolean(latest && viewId && latest.viewId && latest.viewId !== viewId);
  useEffect(() => {
    if (!latest) return;
    let live = true;
    void listLibraryMeditations()
      .then((items) => {
        if (!live) return;
        setLibraryItem(items.find((row) => row.jobId === latest.jobId) ?? null);
      })
      .catch(() => {
        if (live) setLibraryItem(null);
      });
    return () => {
      live = false;
    };
  }, [latest]);
  const minutes = libraryItem?.durationSeconds
    ? Math.max(1, Math.round(libraryItem.durationSeconds / 60))
    : null;
  const cover = libraryItem?.coverImageUrl || "";
  function play() {
    if (!latest) return;
    router.push(
      `/meditate/library/creations?source=heal&healItem=${encodeURIComponent(itemId)}&focus=pending:${encodeURIComponent(latest.jobId)}&play=1`,
    );
  }
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]">
      <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Meditation</h2>
      {!latest ? (
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <p className="text-sm text-foreground">No meditation for this yet.</p>
          <button type="button" className={HEAL_OUTLINE} onClick={onCreate}>
            <MeditationMark />
            Create meditation
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3.5 flex items-center gap-4">
            <button
              type="button"
              className="relative size-[84px] shrink-0 cursor-pointer overflow-hidden rounded-[14px] bg-background"
              aria-label="Play"
              onClick={play}
            >
              {cover ? <img src={cover} alt="" className="size-full object-cover" /> : null}
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-9 place-items-center rounded-full bg-white/90 text-[#0F1B2D]">
                  <Play className="size-3.5 fill-current" aria-hidden />
                </span>
              </span>
            </button>
            <div className="min-w-0">
              <p className="font-display text-[19px] leading-snug text-foreground">{latest.title}</p>
              <p className="text-[12px] text-muted">
                {minutes ? `${minutes} min · ` : ""}made {healRelative(latest.createdAt)}, from your good-day view
              </p>
            </div>
          </div>
          {libraryItem ? (
            <div className="mt-3">
              <MeditationReflectionLink
                meditationId={meditationIdFromLibraryItem(libraryItem)}
                item={libraryItem}
              />
            </div>
          ) : null}
          {changed ? (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-[13px] text-muted">Your good-day view has changed since.</p>
              <button type="button" className={HEAL_OUTLINE} onClick={onCreate}>
                <MeditationMark />
                Create meditation
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function HealItemView({ itemId }: { itemId: string }) {
  const [store, setStore] = useHealStore();
  const router = useRouter();
  const item = store.items.find((row) => row.id === itemId) ?? null;
  const setupStarted = useRef(false);
  const [settingUp, setSettingUp] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const descriptionLock = useRef(false);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [openUpdateId, setOpenUpdateId] = useState<string | null>(null);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [updateEditDraft, setUpdateEditDraft] = useState("");
  const [addingUpdate, setAddingUpdate] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [writingNote, setWritingNote] = useState(false);
  const [goodEdit, setGoodEdit] = useState<{ token: number; text: string } | null>(null);
  const [editSide, setEditSide] = useState<"bad" | "good" | null>(null);
  const [lensSource, setLensSource] = useState<string | null>(null);
  const [lensesOpen, setLensesOpen] = useState(false);
  const [lens, setLens] = useState<HealSeeLens>("kind");
  const [lensText, setLensText] = useState<Partial<Record<HealSeeLens, string>>>({});
  const [lensBusy, setLensBusy] = useState(false);
  const [consentThen, setConsentThen] = useState<(() => void) | null>(null);
  const [exercise, setExercise] = useState<HealExercise | null>(null);
  const [answer, setAnswer] = useState("");
  const [endStep, setEndStep] = useState<{ question: string; text: string; entryId: string } | null>(null);
  const [goodNow, setGoodNow] = useState("");
  const [ownQuestion, setOwnQuestion] = useState("");
  const [addingOwn, setAddingOwn] = useState(false);
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const mobileMenuBtn = useRef<HTMLButtonElement>(null);
  const [mobileMenuPos, setMobileMenuPos] = useState({ top: 0, right: 0 });
  const [actionText, setActionText] = useState("");
  const [addingAction, setAddingAction] = useState(false);
  const [areaPick, setAreaPick] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [journalTick, setJournalTick] = useState(0);
  useEffect(() => {
    const stopEntries = subscribeJournalEntries(() => setJournalTick((n) => n + 1));
    const stopOrigins = subscribeMeditationOrigins(() => setJournalTick((n) => n + 1));
    return () => {
      stopEntries();
      stopOrigins();
    };
  }, []);

  useEffect(() => {
    if (!item) return;
    const badNow = currentView(loadHealStore(), item.id, "bad");
    const goodNow = currentView(loadHealStore(), item.id, "good");
    setEditSide(goodNow ? (badNow ? null : "bad") : "good");
  }, [item?.id]);

  useEffect(() => {
    if (!item || setupStarted.current) return;
    if (exercisesForItem(store, item.id).length > 0) return;
    const first = updatesForItem(store, item.id)[0];
    if (!first) return;
    setupStarted.current = true;
    setSettingUp(true);
    void runSetup(item, first.text, first.id);
    // setup runs once per item mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) {
    return (
      <div className={HEAL_PAGE}>
        <p className="text-sm text-muted">This isn&apos;t here anymore.</p>
      </div>
    );
  }

  const current = item;
  const updates = updatesForItem(store, current.id);
  const latestUpdate = updates[0] ?? null;
  const description = descriptionForItem(store, current.id);
  const laterUpdates = laterUpdatesForItem(store, current.id);
  const shownUpdates = showAllUpdates ? laterUpdates : laterUpdates.slice(0, 3);
  const bad = currentView(store, current.id, "bad");
  const good = currentView(store, current.id, "good");
  const exercises = exercisesForItem(store, current.id);
  const active = [
    ...exercises.filter((row) => row.status === "active" && !row.answeredEntryId),
    ...exercises.filter((row) => row.status === "active" && row.answeredEntryId),
  ];
  const entries = entriesForItem(store, current.id);
  void journalTick;
  const journalRows = journalRowsForHealItem(current.id);
  const timeline = entries
    .map((entry) => ({ at: entry.createdAt, entry }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const actions = actionsForItem(store, current.id);
  const dreams = loadIdeateStore().dreams;
  const areaId = current.linkedLifeAreaIds[0] || current.sourceObstacleId?.split("::")[0] || "";

  function commit(next: HealStoreV1) {
    setStore(next);
  }

  function enableAi(then: () => void) {
    if (loadHealStore().items.find((row) => row.id === current.id)?.aiEnabled) {
      then();
      return;
    }
    setConsentThen(() => then);
  }

  async function runSetup(target: HealItem, update: string, updateId: string) {
    let next = loadHealStore();
    if (target.aiEnabled) {
      const result = await healSetup({ title: target.title, update, extra: comesUpContext(target) });
      if (result && result.exercises.length) {
        if (result.badDayText) {
          next = addHealView(next, { itemId: target.id, side: "bad", text: result.badDayText, source: "setup" });
        }
        if (result.goodDayText) {
          next = addHealView(next, { itemId: target.id, side: "good", text: result.goodDayText, source: "setup" });
        }
        next = patchHealItem(next, target.id, { type: result.type, canDo: result.canDo, askedQuestions: result.exercises });
        next = addHealExercises(
          next,
          result.exercises.map((question, index) => ({
            itemId: target.id,
            question,
            status: index < 4 ? "active" : "pool",
            source: "ai" as const,
            createdFromUpdateId: updateId,
            answeredEntryId: null,
          })),
        );
        commit(next);
        setSettingUp(false);
        return;
      }
    }
    seedFallbacks(target.id, target.canDo, updateId);
    setSettingUp(false);
  }

  function seedFallbacks(itemId: string, canDo: HealCanDo | null, updateId: string | null, onlyPool = false) {
    const questions = fallbackExerciseQuestions(canDo);
    const existing = new Set(exercisesForItem(loadHealStore(), itemId).map((row) => row.question));
    const fresh = questions.filter((question) => !existing.has(question));
    let next = loadHealStore();
    next = addHealExercises(
      next,
      fresh.map((question, index) => ({
        itemId,
        question,
        status: !onlyPool && index < 4 ? "active" : "pool",
        source: "fallback" as const,
        createdFromUpdateId: updateId,
        answeredEntryId: null,
      })),
    );
    next = patchHealItem(next, itemId, {
      askedQuestions: [...(next.items.find((row) => row.id === itemId)?.askedQuestions ?? []), ...fresh],
    });
    commit(next);
  }

  async function suggestMore() {
    const latest = loadHealStore();
    const row = latest.items.find((item) => item.id === current.id);
    if (!row) return;
    const asked = new Set(row.askedQuestions);
    let questions: string[] = [];
    if (row.aiEnabled) {
      questions = await healSuggestMore({
        type: row.type,
        title: row.title,
        canDo: row.canDo,
        context: contextFor(latest, row),
      });
      questions = questions.filter((question) => !asked.has(question));
    }
    if (!questions.length) {
      questions = fallbackExerciseQuestions(row.canDo).filter((question) => !asked.has(question)).slice(0, 3);
    }
    if (!questions.length) return;
    let next = addHealExercises(
      loadHealStore(),
      questions.map((question) => ({
        itemId: row.id,
        question,
        status: "active" as const,
        source: row.aiEnabled ? ("ai" as const) : ("fallback" as const),
        createdFromUpdateId: updatesForItem(loadHealStore(), row.id)[0]?.id ?? null,
        answeredEntryId: null,
      })),
    );
    next = patchHealItem(next, row.id, { askedQuestions: [...row.askedQuestions, ...questions] });
    const added = next.exercises.slice(-questions.length).map((exercise) => exercise.id);
    setFreshIds((ids) => [...ids, ...added]);
    commit(next);
  }

  function saveDescription() {
    setEditingDescription(false);
    if (!description) return;
    const text = descriptionDraft.trim();
    if (!text || text === description.text) return;
    commit(patchHealUpdate(loadHealStore(), description.id, text));
    void rememberRisk(current.id, text, commit);
  }

  function onDescriptionKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      descriptionLock.current = true;
      setEditingDescription(false);
    } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      descriptionLock.current = true;
      saveDescription();
    }
  }

  function saveEditedUpdate(rowId: string) {
    const text = updateEditDraft.trim();
    setEditingUpdateId(null);
    if (!text) return;
    commit(patchHealUpdate(loadHealStore(), rowId, text));
  }

  function saveUpdate() {
    if (!updateText.trim()) return;
    const before = currentView(store, current.id, "good")?.text ?? "";
    let next = addHealUpdate(store, current.id, updateText);
    commit(next);
    const saved = updatesForItem(next, current.id)[0];
    setUpdateText("");
    setAddingUpdate(false);
    void rememberRisk(current.id, updateText, commit);
    if (!current.aiEnabled || !saved) return;
    void healAfterUpdate({
      type: current.type,
      title: current.title,
      canDo: current.canDo,
      context: `${narrativeWithJournal(store, current.id)}\n\nNew:\n${saved.text}\n\nUnanswered:\n${unansweredContext(next, current.id)}\n\nBad day:\n${currentView(next, current.id, "bad")?.text ?? ""}\n\nGood day:\n${before}${comesUpContext(current)}`,
    }).then((result) => {
      if (!result) return;
      applyExerciseChange(result.retire, result.add, "Your update changed things");
      if (result.goodDayConflict && result.topic) setConflict(result.topic);
    });
  }

  function applyExerciseChange(retire: string[], add: string[], lead: string) {
    let next = loadHealStore();
    const live = exercisesForItem(next, current.id);
    for (const id of retire) {
      const row = live.find((exercise) => exercise.id === id && !exercise.answeredEntryId);
      if (row) next = patchHealExercise(next, id, { status: "dismissed" });
    }
    const asked = next.items.find((row) => row.id === current.id)?.askedQuestions ?? [];
    const fresh = add.filter((question) => !asked.includes(question));
    next = addHealExercises(
      next,
      fresh.map((question) => ({
        itemId: current.id,
        question,
        status: "active" as const,
        source: "ai" as const,
        createdFromUpdateId: updatesForItem(next, current.id)[0]?.id ?? null,
        answeredEntryId: null,
      })),
    );
    next = patchHealItem(next, current.id, { askedQuestions: [...asked, ...fresh] });
    const addedIds = next.exercises.slice(-fresh.length).map((row) => row.id);
    setFreshIds((ids) => [...ids, ...addedIds]);
    const n = retire.length + fresh.length;
    if (n) {
      setNotice(`${lead}, so ${n} exercise${n === 1 ? " was" : "s were"} ${fresh.length && retire.length ? "added and replaced" : fresh.length ? "added" : "replaced"}. Answers you've already written stay as they were.`);
    }
    commit(next);
  }

  function changeCanDo(value: HealCanDo) {
    let next = patchHealItem(store, current.id, { canDo: value });
    const pool = exercisesForItem(next, current.id).filter((row) => row.status === "pool");
    for (const row of pool) next = patchHealExercise(next, row.id, { status: "dismissed" });
    commit(next);
    const questions = fallbackExerciseQuestions(value).slice(4);
    next = addHealExercises(
      loadHealStore(),
      questions.map((question) => ({
        itemId: current.id,
        question,
        status: "pool" as const,
        source: "fallback" as const,
        createdFromUpdateId: null,
        answeredEntryId: null,
      })),
    );
    commit(next);
    if (!current.aiEnabled) {
      setNotice("Your answer changed your exercises. Answers you've already written stay as they were.");
      return;
    }
    void healAfterUpdate({
      type: current.type,
      title: current.title,
      canDo: value,
      context: `canDo is now ${value}.\n\nUnanswered:\n${unansweredContext(loadHealStore(), current.id)}${comesUpContext(current)}`,
    }).then((result) => {
      if (!result) return;
      applyExerciseChange(result.retire, result.add, "Your answer changed your exercises");
    });
  }

  function dismissExercise(row: HealExercise) {
    let next = patchHealExercise(store, row.id, { status: "dismissed" });
    const pool = exercisesForItem(next, current.id).find((exercise) => exercise.status === "pool");
    if (pool) next = patchHealExercise(next, pool.id, { status: "active" });
    commit(next);
    if (!pool) void suggestMore();
  }

  function saveAnswer() {
    if (!exercise || !answer.trim()) return;
    const saved = addHealEntry(loadHealStore(), {
      itemId: current.id,
      kind: "exercise",
      promptKey: null,
      exerciseId: exercise.id,
      text: answer.trim(),
    });
    const next = patchHealExercise(saved.store, exercise.id, { answeredEntryId: saved.entry.id });
    commit(next);
    setEndStep({ question: exercise.question, text: answer.trim(), entryId: saved.entry.id });
    setGoodNow(currentView(next, current.id, "good")?.text ?? "");
    setExercise(null);
    setAnswer("");
    void rememberRisk(current.id, answer, commit);
  }

  function saveGood(text: string, entryId: string | null, source: "user" | "lens", lensName: string | null) {
    const next = addHealView(loadHealStore(), {
      itemId: current.id,
      side: "good",
      text,
      source,
      lens: lensName,
      sourceEntryId: entryId,
    });
    commit(next);
  }

  function lifeAreaOf(id: string) {
    return dreams.find((dream) => dream.id === id) ?? null;
  }

  function sendToTracker(actionId: string, lifeAreaId: string) {
    const action = actionsForItem(loadHealStore(), current.id).find((row) => row.id === actionId);
    if (!action) return;
    const added = addTrackerItem(loadIdeateStore(), {
      lifeAreaId,
      parentId: null,
      title: action.text,
      kind: "task",
    });
    saveIdeateStore(added.store);
    const next = patchHealItem(loadHealStore(), current.id, {
      linkedLifeAreaIds: current.linkedLifeAreaIds.includes(lifeAreaId)
        ? current.linkedLifeAreaIds
        : [...current.linkedLifeAreaIds, lifeAreaId],
    });
    commit(patchHealAction(next, actionId, { trackerItemId: added.id }));
    setAreaPick(null);
  }

  function toggleAction(actionId: string, done: boolean) {
    const action = actions.find((row) => row.id === actionId);
    let next = patchHealAction(store, actionId, { done });
    commit(next);
    if (action?.trackerItemId) {
      saveIdeateStore(patchTrackerItem(loadIdeateStore(), action.trackerItemId, { status: done ? "done" : null }));
    }
  }

  function createMeditation() {
    router.push(
      `/meditate/create?step=shape&fromHeal=${encodeURIComponent(current.urlSlug || current.id)}`,
    );
  }

  async function loadLenses(which?: HealSeeLens) {
    setLensBusy(true);
    const result = await healLenses({
      type: current.type,
      title: current.title,
      lens: which,
      context: `Bad day:\n${bad?.text ?? ""}\n\n${narrativeWithJournal(store, current.id)}\n\nGood day:\n${good?.text ?? ""}${comesUpContext(current)}`,
    });
    if (result) setLensText((currentText) => ({ ...currentText, ...result }));
    setLensBusy(false);
  }

  const restBody =
    current.canDo === "yes"
      ? "Do this when you've done what you can and bad days don't feel like this any more."
      : current.canDo === "no"
        ? "Do this when you've made peace with it."
        : "Do this when it doesn't weigh on you like it did.";

  return (
    <div className={HEAL_PAGE}>
      <AppTopBarTrailingPortal>
        <button
          ref={mobileMenuBtn}
          type="button"
          aria-label="More"
          aria-expanded={mobileMenu}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-nav-foreground lg:hidden"
          onClick={() => {
            const rect = mobileMenuBtn.current?.getBoundingClientRect();
            if (rect) {
              setMobileMenuPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
            }
            setMobileMenu((open) => !open);
          }}
        >
          <MoreHorizontal className="size-5" aria-hidden />
        </button>
      </AppTopBarTrailingPortal>
      {mobileMenu
        ? createPortal(
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-[140] cursor-default" onClick={() => setMobileMenu(false)} />
              <div
                className="fixed z-[141] w-52 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
                style={{ top: mobileMenuPos.top, right: mobileMenuPos.right }}
              >
                <button
                  type="button"
                  className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-semibold"
                  onClick={() => {
                    setMobileMenu(false);
                    setVersions(true);
                  }}
                >
                  Earlier versions ({viewsForSide(store, current.id, "bad").length + viewsForSide(store, current.id, "good").length})
                </button>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-semibold"
                  onClick={() => {
                    setMobileMenu(false);
                    setRestOpen(true);
                  }}
                >
                  <Leaf className="size-3.5" aria-hidden />
                  Lay to rest
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
      {current.riskAt ? (
        <div className="mb-3 flex justify-end">
          <HealRiskPill show />
        </div>
      ) : null}
      {conflict ? (
        <section className="mb-3 rounded-2xl border border-border bg-card p-4 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]">
          <p className="text-sm text-foreground">Your good-day view mentions {conflict}. Is it still true on a good day?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={HEAL_OUTLINE}
              onClick={() => {
                setGoodEdit({ token: Date.now(), text: good?.text ?? "" });
                setConflict(null);
                document.getElementById("heal-views")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Edit good-day view
            </button>
            <button type="button" className={HEAL_OUTLINE} onClick={() => setConflict(null)}>
              Still true
            </button>
          </div>
        </section>
      ) : null}

      <section
        id="heal-views"
        className="relative overflow-hidden rounded-[18px] p-4 shadow-[0_8px_30px_rgb(15_27_45_/_0.16)] lg:rounded-[20px] lg:px-[30px] lg:pb-[22px] lg:pt-[26px]"
        style={{ backgroundColor: HERO_NAVY, color: HERO_IVORY }}
      >
        <div className="navy-paisley-plate" aria-hidden />
        <div className="relative flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="min-w-0">
              <button
                type="button"
                className="cursor-pointer text-[11px] font-semibold uppercase tracking-[1.6px] text-[rgb(243_237_226_/_0.55)]"
                onClick={() => setKindOpen(true)}
              >
                {healTypeLabel(current.type)}
                {current.since ? ` · since ${formatHealDate(current.since)}` : ""}
              </button>
              <h2 className="font-display text-[26px] leading-[1.1] lg:text-[36px] lg:leading-[1.05]">{current.title}</h2>
              {current.linkedObstacles.length ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-[1.2px] text-[rgb(243_237_226_/_0.5)]">
                    Comes up in
                  </span>
                  {current.linkedObstacles.map((link) => {
                    const area = dreams.find((dream) => dream.id === link.lifeAreaId)?.title?.trim() || "another area";
                    return (
                      <button
                        key={`${link.lifeAreaId}::${link.label}`}
                        type="button"
                        className="inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-full border border-[rgb(243_237_226_/_0.25)] px-2.5 text-xs text-[rgb(243_237_226_/_0.85)]"
                        onClick={() => router.push(lifeAreaHrefById(link.lifeAreaId))}
                      >
                        {link.label}
                        <span className="text-[rgb(243_237_226_/_0.5)]">· {area}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="ml-auto hidden items-center gap-3.5 lg:flex">
              <button type="button" className="cursor-pointer text-[13px] font-semibold text-[rgb(243_237_226_/_0.7)]" onClick={() => setVersions(true)}>
                Earlier versions ({viewsForSide(store, current.id, "bad").length + viewsForSide(store, current.id, "good").length})
              </button>
              <button type="button" className={HERO_GHOST} onClick={() => setRestOpen(true)}>
                <Leaf className="size-3.5" aria-hidden />
                Lay to rest
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-5">
            <ViewBox
              label="On a bad day, I think…"
              help="The worst way you could see it. Write it exactly as it sounds in your head."
              view={bad}
              empty="On a bad day, what do you tell yourself about it?"
              accent={false}
              editing={editSide === "bad"}
              onEdit={() => setEditSide("bad")}
              onClose={() => setEditSide((side) => (side === "bad" ? null : side))}
              onSave={(text) => commit(addHealView(loadHealStore(), { itemId: current.id, side: "bad", text, source: "user" }))}
            />
            <div className="relative flex h-11 items-center justify-center lg:hidden" aria-hidden>
              <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-[linear-gradient(90deg,transparent,rgb(200_164_106_/_0.9),transparent)]" />
              <span className="relative grid size-10 place-items-center rounded-full" style={{ backgroundColor: HERO_NAVY }}>
                <LogoMark size={26} fill="#C8A46A" />
              </span>
            </div>
            <div className="relative hidden w-14 shrink-0 items-center justify-center self-stretch lg:flex" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgb(200_164_106_/_0.9)_50%,transparent)]" />
              <span className="relative grid size-11 place-items-center rounded-full" style={{ backgroundColor: HERO_NAVY }}>
                <LogoMark size={30} fill="#C8A46A" />
              </span>
            </div>
            <ViewBox
              label="On a good day, I think…"
              help="The best way you could honestly see it. Still true, just at its most hopeful."
              view={good}
              empty="Not yet. On a good day, how do you see it?"
              accent
              editing={editSide === "good"}
              onEdit={() => setEditSide("good")}
              onClose={() => setEditSide((side) => (side === "good" ? null : side))}
              editRequest={goodEdit}
              onSave={(text) => {
                saveGood(text, null, lensSource ? "lens" : "user", lensSource);
                setLensSource(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-[rgb(243_237_226_/_0.12)] pt-4 lg:flex-row lg:items-center lg:gap-6">
            <p className="flex items-start gap-2 text-[13px] leading-[1.5] text-[rgb(243_237_226_/_0.7)] lg:text-[14px]">
              <LogoMark size={16} fill="#C8A46A" className="mt-0.5 shrink-0" />
              Hold both at once. Neither one is the whole truth; seeing them together gives you a fuller view of how things really are.
            </p>
            <button
              type="button"
              className={`${HERO_GHOST} w-full shrink-0 lg:ml-auto lg:w-auto`}
              onClick={() =>
                enableAi(() => {
                  setLensesOpen(true);
                  if (!lensText.kind) void loadLenses();
                })
              }
            >
              <Sparkles className="size-3.5" aria-hidden />
              Show other ways to see it
            </button>
          </div>

          {lensesOpen ? (
            <div className="border-t border-[rgb(243_237_226_/_0.12)] pt-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-[rgb(243_237_226_/_0.7)]" aria-hidden />
                <p className="text-[15px] font-semibold">Other ways to see it</p>
                <button type="button" className="ml-auto cursor-pointer text-[13px] text-[rgb(243_237_226_/_0.7)]" onClick={() => setLensesOpen(false)}>
                  Close
                </button>
              </div>
              <p className="mt-1 text-[13px] text-[rgb(243_237_226_/_0.5)]">AI&apos;s take on your bad-day line, using only what you&apos;ve written. A starting point, not an answer.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SEE_LENSES.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setLens(row.id)}
                    className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold ${
                      lens === row.id
                        ? "bg-[#F3EDE2] text-[#1E232E]"
                        : "border border-[rgb(243_237_226_/_0.35)] bg-[rgb(243_237_226_/_0.06)] text-[#F3EDE2]"
                    }`}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 font-display text-[19px] italic leading-snug text-[#F3EDE2]">
                {lensBusy ? "…" : lensText[lens] || "Nothing yet."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={HERO_GHOST}
                  disabled={!lensText[lens]}
                  onClick={() => {
                    setLensSource(lens);
                    setGoodEdit({ token: Date.now(), text: lensText[lens] ?? "" });
                  }}
                >
                  <PenLine className="size-3.5" aria-hidden />
                  Start from this
                </button>
                <button type="button" className={HERO_GHOST} onClick={() => void loadLenses(lens)}>
                  Another
                </button>
              </div>
              <p className="mt-2 text-[12px] text-[rgb(243_237_226_/_0.5)]">Start from this opens your good-day view with this text in it, for you to change and save.</p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-4 grid items-start gap-[18px] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] sm:px-6">
          <div className="flex items-end justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">What&apos;s going on</p>
            <div className="flex items-center gap-2">
              {description ? <p className="text-[12px] text-muted">Written {formatHealDate(description.createdAt)}</p> : null}
              <button
                type="button"
                aria-label="Edit description"
                className="grid size-7 cursor-pointer place-items-center rounded-full text-muted"
                onClick={() => {
                  setDescriptionDraft(description?.text ?? "");
                  setEditingDescription(true);
                }}
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
          {editingDescription ? (
            <div className="relative mt-2">
              <GrowField
                value={descriptionDraft}
                onChange={setDescriptionDraft}
                onKeyDown={onDescriptionKey}
                onBlur={() => {
                  if (descriptionLock.current) {
                    descriptionLock.current = false;
                    return;
                  }
                  saveDescription();
                }}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 pr-12 font-display text-[16px] leading-relaxed outline-none"
              />
              <span className="absolute bottom-2 right-2">
                <DictationMicButton variant="inset" onTranscript={(spoken) => setDescriptionDraft((value) => appendSpokenText(value, spoken))} />
              </span>
              <div className="mt-2 flex items-center gap-3">
                <button type="button" className={HEAL_OUTLINE} onClick={saveDescription}>Save</button>
                <button
                  type="button"
                  className="cursor-pointer text-[13px] font-semibold text-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setEditingDescription(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : description ? (
            <div
              className="cursor-text"
              onClick={() => {
                setDescriptionDraft(description.text);
                setEditingDescription(true);
              }}
            >
              <ClampedText text={description.text} open={descriptionOpen} onToggle={() => setDescriptionOpen((open) => !open)} />
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold text-muted">Updates</p>
            <button type="button" className="cursor-pointer text-[13px] font-semibold text-heal-accent" onClick={() => setAddingUpdate(true)}>
              + Add an update
            </button>
          </div>
          {addingUpdate ? (
            <div className="relative mt-2">
              <GrowField
                value={updateText}
                onChange={setUpdateText}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 pr-12 font-display text-[16px] leading-relaxed outline-none"
              />
              <span className="absolute bottom-2 right-2">
                <DictationMicButton variant="inset" onTranscript={(spoken) => setUpdateText((value) => appendSpokenText(value, spoken))} />
              </span>
              <div className="mt-2 flex items-center gap-3">
                <button type="button" className={HEAL_OUTLINE} onClick={saveUpdate}>Save</button>
                <button
                  type="button"
                  className="cursor-pointer text-[13px] font-semibold text-muted"
                  onClick={() => {
                    setUpdateText("");
                    setAddingUpdate(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <ul className="mt-1">
            {shownUpdates.map((row) => {
              const open = openUpdateId === row.id;
              return (
                <li key={row.id} className="border-t border-border/70">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-baseline gap-3 py-2 text-left text-[13px]"
                    onClick={() => setOpenUpdateId(open ? null : row.id)}
                  >
                    <span className="w-11 shrink-0 text-muted">{updateWhen(row.createdAt)}</span>
                    <span className={`min-w-0 text-foreground ${open ? "" : "truncate"}`}>{row.text}</span>
                  </button>
                  {open ? (
                    <div className="pb-2">
                      {editingUpdateId === row.id ? (
                        <GrowField
                          value={updateEditDraft}
                          onChange={setUpdateEditDraft}
                          onBlur={() => saveEditedUpdate(row.id)}
                          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-[16px] leading-relaxed outline-none"
                        />
                      ) : (
                        <p className="text-[13px] leading-relaxed text-foreground">{row.text}</p>
                      )}
                      <div className="mt-1 flex gap-3">
                        <button
                          type="button"
                          className="cursor-pointer text-[12px] font-semibold"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setUpdateEditDraft(row.text);
                            setEditingUpdateId(row.id);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="cursor-pointer text-[12px] font-semibold text-muted"
                          onClick={() => {
                            commit(deleteHealUpdate(loadHealStore(), row.id));
                            setOpenUpdateId(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {laterUpdates.length > 3 ? (
            <button type="button" className="mt-1 cursor-pointer text-[13px] font-semibold" onClick={() => setShowAllUpdates((open) => !open)}>
              {showAllUpdates ? "Show less" : `Show all ${laterUpdates.length}`}
            </button>
          ) : null}
        </section>

        <div className="flex flex-col gap-[18px]">
          <HealMeditationCard itemId={current.id} viewId={good?.id ?? null} onCreate={createMeditation} />
          <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]">
            <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Can you do anything about it?</h2>
            <div className="mt-3 inline-flex w-fit max-w-full rounded-full border border-border p-1">
              {(
                [
                  ["yes", "Yes"],
                  ["no", "No, it's done"],
                  ["not_sure", "Not sure"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeCanDo(value)}
                  className={`h-8 cursor-pointer rounded-full px-3.5 text-[13px] font-semibold ${current.canDo === value ? "bg-foreground text-white" : "text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted">
              {current.canDo === "yes"
                ? "Exercises include next steps as well as acceptance."
                : current.canDo === "no"
                  ? "Exercises focus on accepting it and forgiving yourself where you can."
                  : current.canDo === "not_sure"
                    ? "One of your exercises will help you work it out."
                    : "Your answer changes which exercises you get."}
            </p>
            {current.canDo === "yes" ? (
              <div className="mt-3">
                {actions.map((action) => {
                  const area = action.trackerItemId ? lifeAreaOf(areaId) : null;
                  return (
                    <label key={action.id} className="flex items-start gap-2 border-t border-border/70 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={action.done}
                        onChange={(event) => toggleAction(action.id, event.target.checked)}
                        className="mt-0.5 size-5 rounded"
                      />
                      <span className={`min-w-0 flex-1 ${action.done ? "text-muted line-through" : ""}`}>{action.text}</span>
                      {action.trackerItemId ? (
                        <span className="text-[12px] text-muted">In Tracker · {area?.title || "life area"}</span>
                      ) : (
                        <button
                          type="button"
                          className="cursor-pointer text-[12px] font-semibold"
                          onClick={(event) => {
                            event.preventDefault();
                            if (areaId) sendToTracker(action.id, areaId);
                            else setAreaPick(action.id);
                          }}
                        >
                          Add to Tracker
                        </button>
                      )}
                    </label>
                  );
                })}
                {addingAction ? (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      commit(addHealAction(loadHealStore(), current.id, actionText));
                      setActionText("");
                      setAddingAction(false);
                    }}
                  >
                    <input value={actionText} onChange={(event) => setActionText(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-sm" />
                    <button type="submit" className={HEAL_OUTLINE}>Add</button>
                  </form>
                ) : (
                  <button type="button" className="mt-2 cursor-pointer text-[13px] font-semibold text-heal-accent" onClick={() => setAddingAction(true)}>
                    + Add something you could do
                  </button>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Journal entries</h2>
          <button
            type="button"
            className={HEAL_OUTLINE}
            onClick={() =>
              router.push(
                journalNewEntryHref({
                  targetType: "heal_item",
                  targetId: current.id,
                  label: current.title,
                }),
              )
            }
          >
            <PenLine className="size-3.5" aria-hidden />
            New entry
          </button>
        </div>
        <div className="mt-3.5 rounded-2xl border border-border bg-card px-5 pb-4 pt-5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] sm:px-6">
          {journalRows.length ? (
            <>
              <p className="pb-1 text-[13px] text-muted">
                Entries and reflections you&apos;ve attached this to in Journal, newest first.
              </p>
              <AttachedJournalList
                rows={journalRows}
                current={{ targetType: "heal_item", targetId: current.id }}
              />
            </>
          ) : (
            <>
              <p className="font-display text-[19px] text-foreground">Nothing from your journal yet.</p>
              <p className="mt-1.5 text-[13px] leading-normal text-muted">
                Attach {current.title.trim() || "this"} to an entry in Journal and it shows up here. New entry starts one with it already attached.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Your exercises</h2>
          <div className="flex flex-wrap gap-4">
            {(current.aiEnabled || fallbackExerciseQuestions(current.canDo).some((question) => !current.askedQuestions.includes(question))) ? (
              <button type="button" className="cursor-pointer text-[13px] font-semibold text-heal-accent" onClick={() => void suggestMore()}>
                + Suggest more
              </button>
            ) : null}
            <button type="button" className="cursor-pointer text-[13px] font-semibold text-heal-accent" onClick={() => setAddingOwn(true)}>
              + Add your own
            </button>
          </div>
        </div>
        {notice ? <p className="mt-2 text-[13px] text-muted">{notice}</p> : null}
        {settingUp ? (
          <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-36 animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : (
          <ul className="mt-3.5 grid items-stretch gap-3.5 lg:grid-cols-2">
            {active.map((row, index) => {
              const answered = entries.find((entry) => entry.id === row.answeredEntryId);
              const stale = answered && latestUpdate && answered.createdAt < latestUpdate.createdAt;
              return (
                <li
                  key={row.id}
                  className={`flex h-full flex-col gap-3 rounded-2xl border border-border px-[22px] py-5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] ${
                    answered ? "bg-[var(--surface)]" : "bg-card"
                  }`}
                >
                  <span className="font-display text-[26px] leading-none text-accent">{String(index + 1).padStart(2, "0")}</span>
                  <p className="font-display text-[19px] leading-snug text-foreground">{row.question}</p>
                  {answered ? (
                    <p className="line-clamp-2 font-display text-[15px] italic leading-snug text-foreground">&quot;{answered.text}&quot;</p>
                  ) : null}
                  <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3">
                    {answered ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                          <span className="grid size-[18px] place-items-center rounded-full bg-foreground text-white">
                            <span className="text-[10px] leading-none">✓</span>
                          </span>
                          Answered {healRelative(answered.createdAt)}
                          {stale ? ", before your update" : ""}
                        </span>
                        <button
                          type="button"
                          className="ml-auto cursor-pointer text-[13px] font-semibold text-foreground"
                          onClick={() => {
                            setExercise(row);
                            setAnswer(answered.text);
                          }}
                        >
                          Read
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="inline-flex cursor-pointer items-center text-[13px] font-semibold text-foreground"
                          onClick={() => {
                            setExercise(row);
                            setAnswer("");
                          }}
                        >
                          Write your answer
                          <SelectChevron direction="right" className="text-foreground" />
                        </button>
                        <button
                          type="button"
                          className="ml-auto cursor-pointer text-[12px] font-semibold text-muted"
                          onClick={() => dismissExercise(row)}
                        >
                          Not for me
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {addingOwn ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!ownQuestion.trim()) return;
              const next = addHealExercises(loadHealStore(), [
                {
                  itemId: current.id,
                  question: ownQuestion.trim(),
                  status: "active",
                  source: "user",
                  createdFromUpdateId: null,
                  answeredEntryId: null,
                },
              ]);
              commit(patchHealItem(next, current.id, { askedQuestions: [...current.askedQuestions, ownQuestion.trim()] }));
              setOwnQuestion("");
              setAddingOwn(false);
            }}
          >
            <input value={ownQuestion} onChange={(event) => setOwnQuestion(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm" />
            <button type="submit" className={HEAL_OUTLINE}>Add</button>
          </form>
        ) : null}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Your writing</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={HEAL_OUTLINE} onClick={() => setWritingNote(true)}>
              <PenLine className="size-3.5" aria-hidden />
              Write a note
            </button>
            <button type="button" className={HEAL_OUTLINE} onClick={() => router.push(`${healItemHref(current)}/letter`)}>
              <Mail className="size-3.5" aria-hidden />
              Write a letter you won&apos;t send
            </button>
          </div>
        </div>
        <div className="mt-3.5 rounded-2xl border border-border bg-card px-5 pb-1 pt-6 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] sm:px-6">
          <p className="pb-4 text-[13px] text-muted">
            Exercise answers, notes, and unsent letters, newest first. Only you can see these.
          </p>
          {writingNote ? (
            <div className="relative mb-4">
              <GrowField
                value={note}
                onChange={setNote}
                placeholder={`Anything else about ${current.title} on your mind? Negative is fine.`}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 pr-12 font-display text-[17px] outline-none"
              />
              <span className="absolute bottom-2 right-2">
                <DictationMicButton variant="inset" onTranscript={(spoken) => setNote((value) => appendSpokenText(value, spoken))} />
              </span>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  className={HEAL_OUTLINE}
                  onClick={() => {
                    if (!note.trim()) return;
                    const saved = addHealEntry(loadHealStore(), {
                      itemId: current.id,
                      kind: "note",
                      promptKey: null,
                      text: note.trim(),
                    });
                    commit(saved.store);
                    setNote("");
                    setWritingNote(false);
                    void rememberRisk(current.id, note, commit);
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="cursor-pointer text-[13px] font-semibold text-muted"
                  onClick={() => {
                    setNote("");
                    setWritingNote(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <ul>
            {timeline.map((item, index) => (
              <EntryRow
                key={item.entry.id}
                entry={item.entry}
                store={store}
                itemId={current.id}
                last={index === timeline.length - 1}
              />
            ))}
          </ul>
        </div>
      </section>

      {kindOpen ? (
        <HealOverlay title="Kind" onClose={() => setKindOpen(false)}>
          <div className="flex flex-col gap-1 overflow-y-auto p-3">
            {HEAL_TYPES.map((row) => (
              <button
                key={row.id}
                type="button"
                className="rounded-xl px-3 py-2 text-left hover:bg-background"
                onClick={() => {
                  commit(patchHealItem(loadHealStore(), current.id, { type: row.id }));
                  setKindOpen(false);
                }}
              >
                <span className="block text-sm font-semibold">{row.label}</span>
                {KIND_BLURB[row.id] ? <span className="text-[12px] text-muted">{KIND_BLURB[row.id]}</span> : null}
              </button>
            ))}
          </div>
        </HealOverlay>
      ) : null}

      {exercise ? (
        <HealOverlay title={exercise.question} onClose={() => setExercise(null)} wide>
          <div className="overflow-y-auto px-5 py-5">
            <p className="font-display text-[20px] leading-snug">{exercise.question}</p>
            <div className="relative mt-3">
              <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={6} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 pr-12 font-display text-[17px] outline-none" />
              <span className="absolute bottom-2 right-2">
                <DictationMicButton variant="inset" onTranscript={(spoken) => setAnswer((value) => appendSpokenText(value, spoken))} />
              </span>
            </div>
            <button type="button" className={`${HEAL_PRIMARY} mt-3`} disabled={!answer.trim()} onClick={saveAnswer}>
              Save
            </button>
          </div>
        </HealOverlay>
      ) : null}

      {endStep ? (
        <HealOverlay title="Does this change how you see it?" onClose={() => setEndStep(null)} wide>
          <div className="overflow-y-auto px-5 py-5">
            <p className="text-[12px] font-semibold text-heal-accent">{endStep.question}</p>
            <div className="mt-2 rounded-xl bg-background px-3 py-2 text-sm">{endStep.text}</div>
            <h2 className="mt-4 font-display text-[24px]">Does this change how you see it?</h2>
            <p className="mt-1 text-[13px] text-muted">
              On a bad day you think: &quot;{bad?.text || "…"}&quot; Edit your good-day view, in your own words. The earlier version is kept.
            </p>
            <textarea
              autoFocus
              value={goodNow}
              onChange={(event) => setGoodNow(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none rounded-xl border-[1.5px] border-heal-accent bg-card px-3 py-2 font-display text-[18px] outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={HEAL_PRIMARY}
                disabled={!goodNow.trim() || goodNow.trim() === (good?.text ?? "")}
                onClick={() => {
                  saveGood(goodNow, endStep.entryId, "user", null);
                  setEndStep(null);
                }}
              >
                Update my good-day view
              </button>
              <button type="button" className={HEAL_OUTLINE} onClick={() => setEndStep(null)}>
                Not yet
              </button>
              <p className="text-[12px] text-muted sm:ml-auto">Your answer is saved either way</p>
            </div>
          </div>
        </HealOverlay>
      ) : null}

      {versions ? (
        <HealOverlay title="Earlier versions" onClose={() => setVersions(false)} wide>
          <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2">
            <VersionColumn title="On a bad day" rows={viewsForSide(store, current.id, "bad")} />
            <VersionColumn title="On a good day" rows={viewsForSide(store, current.id, "good")} />
          </div>
        </HealOverlay>
      ) : null}

      {restOpen ? (
        <HealOverlay title="Lay to rest" onClose={() => setRestOpen(false)}>
          <div className="px-5 py-5">
            <h2 className="font-display text-[22px]">Lay {current.title} to rest?</h2>
            <p className="mt-2 text-sm text-foreground">{restBody} It moves to Laid to rest. Nothing is deleted.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={HEAL_PRIMARY}
                onClick={() => {
                  commit(setHealItemStatus(loadHealStore(), current.id, "at_peace"));
                  router.push("/heal/rested");
                }}
              >
                Lay to rest
              </button>
              <button type="button" className={HEAL_OUTLINE} onClick={() => setRestOpen(false)}>
                Back
              </button>
            </div>
          </div>
        </HealOverlay>
      ) : null}

      {consentThen ? (
        <HealOverlay title="Let AI read this" onClose={() => setConsentThen(null)}>
          <div className="px-5 py-5">
            <p className="text-sm">Let AI read this item&apos;s writing to suggest exercises and other ways to see it. Only this item is used.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className={HEAL_PRIMARY}
                onClick={() => {
                  commit(patchHealItem(loadHealStore(), current.id, { aiEnabled: true }));
                  const next = consentThen;
                  setConsentThen(null);
                  next();
                }}
              >
                Allow
              </button>
              <button type="button" className={HEAL_OUTLINE} onClick={() => setConsentThen(null)}>
                Not now
              </button>
            </div>
          </div>
        </HealOverlay>
      ) : null}

      {areaPick ? (
        <HealOverlay title="Which life area?" onClose={() => setAreaPick(null)}>
          <div className="flex flex-col gap-1 p-3">
            {dreams.map((dream) => (
              <button key={dream.id} type="button" className="rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-background" onClick={() => sendToTracker(areaPick, dream.id)}>
                {dream.title}
              </button>
            ))}
          </div>
        </HealOverlay>
      ) : null}
    </div>
  );
}

function updateWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === new Date().toDateString()) return "Today";
  return formatHealDate(iso);
}

function GrowField({
  value,
  onChange,
  onBlur,
  onKeyDown,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      autoFocus
      rows={2}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
}

function ClampedText({ text, open, onToggle }: { text: string; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <>
      <p ref={ref} className={`mt-2 font-display text-[16px] leading-[1.6] text-foreground ${open ? "" : "line-clamp-4"}`}>
        {text}
      </p>
      {overflows || open ? (
        <button
          type="button"
          className="mt-1 cursor-pointer text-[13px] font-semibold"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </>
  );
}

function ViewBox({
  label,
  help,
  view,
  empty,
  accent,
  editing,
  onEdit,
  onClose,
  editRequest,
  onSave,
}: {
  label: string;
  help: string;
  view: HealView | null;
  empty: string;
  accent: boolean;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  editRequest?: { token: number; text: string } | null;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(view?.text ?? "");
  const seen = useRef(0);
  const startedEmpty = useRef(!view);
  useEffect(() => {
    if (!editRequest || editRequest.token === seen.current) return;
    seen.current = editRequest.token;
    setDraft(editRequest.text);
    onEdit();
  }, [editRequest, onEdit]);
  useEffect(() => {
    if (editing) return;
    setDraft(view?.text ?? "");
  }, [editing, view]);
  useEffect(() => {
    if (!startedEmpty.current || !view || !editing || draft.trim()) return;
    setDraft(view.text);
    onClose();
  }, [view, editing, draft, onClose]);
  const meta = !view
    ? ""
    : view.side === "bad"
      ? view.source === "setup"
        ? `From what you wrote · ${formatHealDate(view.createdAt)}`
        : `Your words · ${formatHealDate(view.createdAt)}`
      : view.source === "setup"
        ? "Suggested from what you wrote"
        : `Your words · updated ${healRelative(view.createdAt)}`;
  function cancel() {
    if (!view) {
      setDraft("");
      return;
    }
    setDraft(view.text);
    onClose();
  }
  function save() {
    const text = draft.trim();
    if (text && text !== (view?.text ?? "")) onSave(text);
    if (!view && !text) return;
    onClose();
  }
  const textClass = accent
    ? "font-display text-[24px] leading-[1.45] text-[#F3EDE2]"
    : "font-display text-[22px] leading-[1.45] text-[#F3EDE2]";
  return (
    <div
      className="relative min-w-0 flex-1 cursor-text"
      onClick={() => {
        if (editing) return;
        setDraft(view?.text ?? "");
        onEdit();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[11px] font-semibold uppercase tracking-[1.6px] ${accent ? "text-header-gold" : "text-[rgb(243_237_226_/_0.9)]"}`}>{label}</p>
        {editing ? null : <Pencil className="size-3.5 shrink-0 text-[rgb(243_237_226_/_0.45)]" aria-hidden />}
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.45] text-[rgb(243_237_226_/_0.55)]">{help}</p>
      {editing ? (
        <>
          <textarea
            autoFocus
            value={draft}
            rows={3}
            placeholder={empty}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            className="mt-2.5 min-h-[104px] w-full resize-y rounded-xl border-[1.5px] border-[#C8A46A] bg-[rgb(243_237_226_/_0.08)] px-4 py-3.5 font-display text-[19px] leading-[1.45] text-[#F3EDE2] outline-none placeholder:text-[rgb(243_237_226_/_0.45)]"
          />
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              className={HEAL_PRIMARY}
              onClick={(event) => {
                event.stopPropagation();
                save();
              }}
            >
              Save
            </button>
            <button
              type="button"
              className={HERO_GHOST}
              onClick={(event) => {
                event.stopPropagation();
                cancel();
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <p className={`mt-2.5 ${view ? textClass : "font-display text-[22px] leading-[1.45] text-[rgb(243_237_226_/_0.55)]"}`}>
          {view?.text || empty}
        </p>
      )}
      {view && !editing ? <p className="mt-2.5 text-[12px] text-[rgb(243_237_226_/_0.45)]">{meta}</p> : null}
    </div>
  );
}

function VersionColumn({ title, rows }: { title: string; rows: HealView[] }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[1.2px] text-muted">{title}</p>
      <ul className="mt-2 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <p className="text-[12px] text-muted">{formatHealDate(row.createdAt)}</p>
            <p className="font-display text-[15px]">{row.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryRow({
  entry,
  store,
  itemId,
  last,
}: {
  entry: HealEntry;
  store: HealStoreV1;
  itemId: string;
  last: boolean;
}) {
  const exercise = store.exercises.find((row) => row.id === entry.exerciseId);
  const goods = viewsForSide(store, itemId, "good");
  const current = goods[0];
  const ledNow = current?.sourceEntryId === entry.id;
  const ledEarlier = goods.slice(1).some((row) => row.sourceEntryId === entry.id);
  const kind = entry.kind === "letter" ? "Unsent letter" : entry.kind === "exercise" ? "Exercise" : "Note";
  const when = healRelative(entry.createdAt);
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3.5 lg:grid-cols-[110px_20px_minmax(0,1fr)]">
      <p className="hidden pt-0.5 text-[12px] text-muted lg:block">{when}</p>
      <span className="flex flex-col items-center">
        <span className="mt-1.5 size-[9px] shrink-0 rounded-full bg-accent" />
        {last ? null : <span className="mt-1 w-px flex-1 bg-border" />}
      </span>
      <div className="flex flex-col gap-1.5 pb-5">
        <p className="text-[12px] text-muted lg:hidden">{when}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-muted">{kind}</p>
        {exercise ? <p className="text-[14px] font-semibold">{exercise.question}</p> : null}
        <p className="font-display text-[17px] leading-[1.55]">{entry.text}</p>
        {ledNow || ledEarlier ? (
          <a href="#heal-views" className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[12px] font-semibold text-foreground">
            <Leaf className="size-3" aria-hidden />
            {ledNow ? "Led to my good-day view" : "Led to an earlier view"}
          </a>
        ) : null}
      </div>
    </li>
  );
}

function narrativeWithJournal(store: HealStoreV1, itemId: string): string {
  return capWords(
    [healUpdateNarrative(store, itemId, 10_000), journalContextForHealItem(itemId)]
      .filter(Boolean)
      .join("\n\n"),
    600,
  );
}

function contextFor(store: HealStoreV1, item: HealItem): string {
  const narrative = narrativeWithJournal(store, item.id);
  const bad = currentView(store, item.id, "bad")?.text ?? "";
  const good = currentView(store, item.id, "good")?.text ?? "";
  const writing = entriesForItem(store, item.id)
    .slice(0, 10)
    .map((entry) => entry.text)
    .join("\n");
  return `${narrative}\n\nBad day:\n${bad}\n\nGood day:\n${good}\n\nWriting:\n${writing}\n\nAsked:\n${item.askedQuestions.join("\n")}${comesUpContext(item)}`;
}

function comesUpContext(item: HealItem): string {
  if (!item.linkedObstacles.length) return "";
  const dreams = loadIdeateStore().dreams;
  const lines = item.linkedObstacles.map((link) => {
    const area = dreams.find((dream) => dream.id === link.lifeAreaId)?.title?.trim() || "a life area";
    return `${link.label} — ${area}`;
  });
  return `\n\nComes up as what's in the way:\n${lines.join("\n")}\nYou may mention these. Their wording is separate from this item's name.`;
}

function unansweredContext(store: HealStoreV1, itemId: string): string {
  return exercisesForItem(store, itemId)
    .filter((row) => row.status === "active" && !row.answeredEntryId)
    .map((row) => `${row.id}: ${row.question}`)
    .join("\n");
}
