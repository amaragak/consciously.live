import { Leaf, Mail, PenLine, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { appendSpokenText } from "@/hooks/use-whisper-dictation";
import { SelectChevron } from "@/components/select-chevron";
import {
  HEAL_OUTLINE,
  HEAL_PAGE,
  HEAL_PRIMARY,
  HealAvatar,
  HealOverlay,
  HealRiskPill,
  rememberRisk,
  useHealStore,
} from "@/components/heal/heal-bits";
import { HEAL_TYPES, healTypeLabel } from "@/lib/heal-copy";
import { healAfterUpdate, healLenses, healSetup, healSuggestMore } from "@/lib/heal-ai";
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
  entriesForItem,
  exercisesForItem,
  fallbackExerciseQuestions,
  formatHealDate,
  healRelative,
  loadHealStore,
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

const SEE_LENSES: { id: HealSeeLens; label: string }[] = [
  { id: "kind", label: "Be kind to myself" },
  { id: "forgive", label: "Forgive" },
  { id: "accept", label: "Accept" },
  { id: "long", label: "The long view" },
];

const KIND_BLURB: Record<string, string> = {
  shame: "Something I'm ashamed of",
};

function HealMeditationStrip({
  itemId,
  viewId,
  onCreate,
}: {
  itemId: string;
  viewId: string | null;
  onCreate: () => void;
}) {
  const router = useRouter();
  const links = healMeditationsForItem(itemId);
  const latest = links[0] ?? null;
  const changed = Boolean(latest && viewId && latest.viewId && latest.viewId !== viewId);
  const made = latest
    ? new Date(latest.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  if (!latest) {
    return (
      <>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px]">No meditation for this yet</p>
        </div>
        <button type="button" className={HEAL_OUTLINE} onClick={onCreate}>
          Create meditation
        </button>
      </>
    );
  }
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[17px]">Meditation · {latest.title}</p>
        <p className="text-[12px] text-muted">Made {made}</p>
        {changed ? (
          <p className="mt-1 text-[12px] text-muted">Your good-day view has changed since this was made.</p>
        ) : null}
      </div>
      <button
        type="button"
        className={HEAL_OUTLINE}
        aria-label="Play"
        onClick={() =>
          router.push(
            `/meditate/library/creations?source=heal&healItem=${encodeURIComponent(itemId)}&focus=pending:${encodeURIComponent(latest.jobId)}&play=1`,
          )
        }
      >
        <Play className="size-3.5" aria-hidden />
      </button>
      {links.length > 1 ? (
        <button
          type="button"
          className="cursor-pointer text-[13px] font-semibold"
          onClick={() =>
            router.push(
              `/meditate/library/creations?source=heal&healItem=${encodeURIComponent(itemId)}`,
            )
          }
        >
          {links.length - 1} more
        </button>
      ) : null}
      {changed ? (
        <button type="button" className={HEAL_OUTLINE} onClick={onCreate}>
          Create meditation
        </button>
      ) : null}
    </>
  );
}

export function HealItemView({ itemId }: { itemId: string }) {
  const [store, setStore] = useHealStore();
  const router = useRouter();
  const item = store.items.find((row) => row.id === itemId) ?? null;
  const setupStarted = useRef(false);
  const [settingUp, setSettingUp] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [addingUpdate, setAddingUpdate] = useState(false);
  const [updateText, setUpdateText] = useState("");
  const [editing, setEditing] = useState(false);
  const [badDraft, setBadDraft] = useState("");
  const [goodDraft, setGoodDraft] = useState("");
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
  const [actionText, setActionText] = useState("");
  const [addingAction, setAddingAction] = useState(false);
  const [areaPick, setAreaPick] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);

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
  const bad = currentView(store, current.id, "bad");
  const good = currentView(store, current.id, "good");
  const exercises = exercisesForItem(store, current.id);
  const active = [
    ...exercises.filter((row) => row.status === "active" && !row.answeredEntryId),
    ...exercises.filter((row) => row.status === "active" && row.answeredEntryId),
  ];
  const entries = entriesForItem(store, current.id);
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
      const result = await healSetup({ title: target.title, update });
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
    const previous = updates[0]?.text ?? "";
    void healAfterUpdate({
      type: current.type,
      title: current.title,
      canDo: current.canDo,
      context: `Previous:\n${previous}\n\nNew:\n${saved.text}\n\nUnanswered:\n${unansweredContext(next, current.id)}\n\nBad day:\n${currentView(next, current.id, "bad")?.text ?? ""}\n\nGood day:\n${before}`,
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
      context: `canDo is now ${value}.\n\nUnanswered:\n${unansweredContext(loadHealStore(), current.id)}`,
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
      `/meditate/create?step=shape&fromHeal=${encodeURIComponent(current.id)}`,
    );
  }

  async function loadLenses(which?: HealSeeLens) {
    setLensBusy(true);
    const result = await healLenses({
      type: current.type,
      title: current.title,
      lens: which,
      context: `Bad day:\n${bad?.text ?? ""}\n\nLatest:\n${latestUpdate?.text ?? ""}\n\nGood day:\n${good?.text ?? ""}`,
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
      <HealRiskPill show={Boolean(current.riskAt)} />
      {conflict ? (
        <section className="mb-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-foreground">Your good-day view mentions {conflict}. Is it still true on a good day?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={HEAL_OUTLINE}
              onClick={() => {
                setEditing(true);
                setBadDraft(bad?.text ?? "");
                setGoodDraft(good?.text ?? "");
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

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <HealAvatar item={current} store={store} size={64} />
          <div className="min-w-0 flex-1">
            <button type="button" className="cursor-pointer text-[12px] font-semibold uppercase tracking-[1.2px] text-heal-accent" onClick={() => setKindOpen(true)}>
              {healTypeLabel(current.type)}
              {current.since ? ` · since ${formatHealDate(current.since)}` : ""}
            </button>
            <h2 className="font-display text-[32px] leading-none text-foreground">{current.title}</h2>
          </div>
          <button type="button" className={HEAL_OUTLINE} onClick={() => setRestOpen(true)}>
            <Leaf className="size-3.5" aria-hidden />
            Lay to rest
          </button>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">What&apos;s going on</p>
            <p className="text-[12px] text-muted">
              {latestUpdate
                ? updates.length > 1
                  ? `Updated ${healRelative(latestUpdate.createdAt)}`
                  : `Written ${formatHealDate(latestUpdate.createdAt)}`
                : ""}
            </p>
          </div>
          {latestUpdate ? (
            <p className={`mt-2 font-display text-[16px] leading-relaxed text-foreground ${updatesOpen ? "" : "line-clamp-3"}`}>
              {latestUpdate.text}
            </p>
          ) : null}
          {updatesOpen
            ? updates.slice(1).map((row) => (
                <p key={row.id} className="mt-3 border-t border-border/70 pt-3 font-display text-[16px] text-foreground">
                  <span className="mb-1 block text-[12px] text-muted">{formatHealDate(row.createdAt)}</span>
                  {row.text}
                </p>
              ))
            : null}
          {addingUpdate ? (
            <div className="relative mt-3">
              <textarea
                value={updateText}
                onChange={(event) => setUpdateText(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 pr-12 font-display text-[16px] outline-none"
              />
              <span className="absolute bottom-2 right-2">
                <DictationMicButton variant="inset" onTranscript={(spoken) => setUpdateText((value) => appendSpokenText(value, spoken))} />
              </span>
              <button type="button" className={`${HEAL_OUTLINE} mt-2`} onClick={saveUpdate}>
                Save
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <button type="button" className={HEAL_OUTLINE} onClick={() => setAddingUpdate(true)}>
                Add an update
              </button>
              {updates.length > 1 ? (
                <button type="button" className="cursor-pointer text-[13px] font-semibold text-foreground" onClick={() => setUpdatesOpen((open) => !open)}>
                  {updatesOpen ? "Show less" : "Show all"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section id="heal-views" className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">How you see it</h2>
          <button type="button" className="cursor-pointer text-[13px] font-semibold text-foreground" onClick={() => setVersions(true)}>
            Earlier versions ({viewsForSide(store, current.id, "bad").length + viewsForSide(store, current.id, "good").length})
          </button>
        </div>
        <div className="mt-3 flex flex-col items-stretch gap-2 md:flex-row md:items-stretch">
          <ViewBox
            label="On a bad day, I think…"
            view={bad}
            editing={editing}
            draft={badDraft}
            onDraft={setBadDraft}
            empty="On a bad day, what do you tell yourself about it?"
            accent={false}
          />
          <span className="self-center text-muted md:px-1" aria-hidden>
            <span className="md:hidden">↓</span>
            <span className="hidden md:inline">→</span>
          </span>
          <ViewBox
            label="On a good day, I think…"
            view={good}
            editing={editing}
            draft={goodDraft}
            onDraft={setGoodDraft}
            empty="Not yet. On a good day, how do you see it?"
            accent
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={HEAL_OUTLINE}
            onClick={() => {
              if (editing) {
                if (badDraft.trim() && badDraft.trim() !== (bad?.text ?? "")) {
                  commit(addHealView(loadHealStore(), { itemId: current.id, side: "bad", text: badDraft, source: "user" }));
                }
                if (goodDraft.trim() && goodDraft.trim() !== (good?.text ?? "")) {
                  saveGood(goodDraft, null, lensSource ? "lens" : "user", lensSource);
                }
                setLensSource(null);
                setEditing(false);
              } else {
                setBadDraft(bad?.text ?? "");
                setGoodDraft(good?.text ?? "");
                setEditing(true);
              }
            }}
          >
            <PenLine className="size-3.5" aria-hidden />
            {editing ? "Save" : "Edit"}
          </button>
          <button
            type="button"
            className={HEAL_OUTLINE}
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
        <p className="mt-2 text-[13px] text-muted">Each exercise below ends by asking if it changes your good-day view.</p>
        {lensesOpen ? (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-heal-accent" aria-hidden />
              <p className="text-[15px] font-semibold">Other ways to see it</p>
              <button type="button" className="ml-auto cursor-pointer text-[13px] text-muted" onClick={() => setLensesOpen(false)}>
                Close
              </button>
            </div>
            <p className="mt-1 text-[13px] text-muted">AI&apos;s take on your bad-day line, using only what you&apos;ve written. A starting point, not an answer.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SEE_LENSES.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setLens(row.id)}
                  className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold ${lens === row.id ? "bg-foreground text-white" : "border border-border bg-card"}`}
                >
                  {row.label}
                </button>
              ))}
            </div>
            <p className="mt-3 font-display text-[19px] italic leading-snug text-foreground">
              {lensBusy ? "…" : lensText[lens] || "Nothing yet."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={HEAL_OUTLINE}
                disabled={!lensText[lens]}
                onClick={() => {
                  setGoodDraft(lensText[lens] ?? "");
                  setBadDraft(bad?.text ?? "");
                  setLensSource(lens);
                  setEditing(true);
                }}
              >
                <PenLine className="size-3.5" aria-hidden />
                Start from this
              </button>
              <button type="button" className={HEAL_OUTLINE} onClick={() => void loadLenses(lens)}>
                Another
              </button>
            </div>
            <p className="mt-2 text-[12px] text-muted">Start from this opens your good-day view with this text in it, for you to change and save.</p>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Can you do anything about it?</h2>
        <div className="mt-3 flex rounded-full border border-border p-1">
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
              className={`h-9 flex-1 cursor-pointer rounded-full text-[13px] font-semibold ${current.canDo === value ? "bg-foreground text-white" : "text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">
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
              const area = action.trackerItemId
                ? lifeAreaOf(areaId)
                : null;
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
              <button type="button" className="mt-2 cursor-pointer text-[13px] font-semibold" onClick={() => setAddingAction(true)}>
                + Add something you could do
              </button>
            )}
          </div>
        ) : null}
      </section>

      <section className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <HealAvatar item={current} store={store} size={48} />
        <HealMeditationStrip itemId={current.id} viewId={good?.id ?? null} onCreate={createMeditation} />
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Your exercises</h2>
          <p className="text-[12px] text-muted">Suggested from what you wrote</p>
        </div>
        {notice ? <p className="mt-2 text-[13px] text-muted">{notice}</p> : null}
        {settingUp ? (
          <div className="mt-3 flex flex-col gap-2">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-xl bg-background" />
            ))}
          </div>
        ) : (
          <ul className="mt-2">
            {active.map((row) => {
              const answered = entries.find((entry) => entry.id === row.answeredEntryId);
              const stale = answered && latestUpdate && answered.createdAt < latestUpdate.createdAt;
              return (
                <li key={row.id} className="border-t border-border/70 py-3">
                  <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => { setExercise(row); setAnswer(answered?.text ?? ""); }}>
                    <span className={`mt-1 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border ${row.answeredEntryId ? "border-foreground bg-foreground text-white" : "border-border"}`}>
                      {row.answeredEntryId ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[17px] leading-snug">{row.question}</span>
                      <span className="mt-1 block text-[12px] text-muted">
                        {freshIds.includes(row.id)
                          ? "New · from your update"
                          : answered
                            ? `Answered ${healRelative(answered.createdAt)}${stale ? ", before your update" : ""}`
                            : "Not answered yet"}
                      </span>
                    </span>
                    <SelectChevron direction="right" />
                  </button>
                  {!row.answeredEntryId ? (
                    <button type="button" className="mt-1 cursor-pointer pl-8 text-[13px] font-semibold" onClick={() => dismissExercise(row)}>
                      Not for me
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-3">
          {(current.aiEnabled || fallbackExerciseQuestions(current.canDo).some((question) => !current.askedQuestions.includes(question))) ? (
            <button type="button" className="cursor-pointer text-[13px] font-semibold" onClick={() => void suggestMore()}>
              + Suggest more exercises
            </button>
          ) : null}
          <button type="button" className="cursor-pointer text-[13px] font-semibold" onClick={() => setAddingOwn(true)}>
            + Add your own
          </button>
        </div>
        {addingOwn ? (
          <form
            className="mt-2 flex gap-2"
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
            <input value={ownQuestion} onChange={(event) => setOwnQuestion(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-sm" />
            <button type="submit" className={HEAL_OUTLINE}>Add</button>
          </form>
        ) : null}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Writing</h2>
          <p className="text-[12px] text-muted">Your answers and notes, newest first</p>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={`Anything else about ${current.title} on your mind? Negative is fine.`}
          rows={3}
          className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-[17px] outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" className={HEAL_OUTLINE} onClick={() => router.push(`/heal/${current.id}/letter`)}>
            <Mail className="size-3.5" aria-hidden />
            Write a letter you won&apos;t send
          </button>
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
              void rememberRisk(current.id, note, commit);
            }}
          >
            Save
          </button>
        </div>
        <ul className="mt-4 flex flex-col gap-4">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} store={store} itemId={current.id} />
          ))}
        </ul>
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

function ViewBox({
  label,
  view,
  editing,
  draft,
  onDraft,
  empty,
  accent,
}: {
  label: string;
  view: HealView | null;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  empty: string;
  accent: boolean;
}) {
  const meta = !view
    ? ""
    : view.side === "bad"
      ? view.source === "setup"
        ? `From what you wrote · ${formatHealDate(view.createdAt)}`
        : `Your words · ${formatHealDate(view.createdAt)}`
      : view.source === "setup"
        ? "Suggested from what you wrote"
        : `Your words · updated ${healRelative(view.createdAt)}`;
  return (
    <div className={`min-w-0 flex-1 rounded-[14px] border bg-background p-3 ${accent ? "border-[1.5px] border-heal-accent" : "border-heal-border"}`}>
      <p className={`text-[12px] font-semibold ${accent ? "text-heal-accent" : "text-muted"}`}>{label}</p>
      {editing ? (
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} rows={4} className="mt-2 w-full resize-none bg-transparent font-display text-[20px] leading-snug outline-none" />
      ) : (
        <p className={`mt-2 font-display text-[20px] leading-snug ${view ? "text-foreground" : "text-muted"}`}>{view?.text || empty}</p>
      )}
      {view && !editing ? <p className="mt-2 text-[12px] text-muted">{meta}</p> : null}
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

function EntryRow({ entry, store, itemId }: { entry: HealEntry; store: HealStoreV1; itemId: string }) {
  const exercise = store.exercises.find((row) => row.id === entry.exerciseId);
  const goods = viewsForSide(store, itemId, "good");
  const current = goods[0];
  const ledNow = current?.sourceEntryId === entry.id;
  const ledEarlier = goods.slice(1).some((row) => row.sourceEntryId === entry.id);
  const kind = entry.kind === "letter" ? "Unsent letter" : entry.kind === "exercise" ? "Exercise" : "Note";
  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-muted">{kind}</p>
        <p className="text-[12px] text-muted">{formatHealDate(entry.createdAt)}</p>
      </div>
      {exercise ? <p className="mt-1 text-[14px] font-semibold">{exercise.question}</p> : null}
      <p className="mt-1 font-display text-[17px] leading-relaxed">{entry.text}</p>
      {ledNow || ledEarlier ? (
        <a href="#heal-views" className="mt-2 inline-flex rounded-full border border-border px-2 py-0.5 text-[12px]">
          {ledNow ? "Led to my good-day view" : "Led to an earlier view"}
        </a>
      ) : null}
    </li>
  );
}

function contextFor(store: HealStoreV1, item: HealItem): string {
  const update = updatesForItem(store, item.id)[0]?.text ?? "";
  const bad = currentView(store, item.id, "bad")?.text ?? "";
  const good = currentView(store, item.id, "good")?.text ?? "";
  const writing = entriesForItem(store, item.id)
    .slice(0, 10)
    .map((entry) => entry.text)
    .join("\n");
  return `Update:\n${update}\n\nBad day:\n${bad}\n\nGood day:\n${good}\n\nWriting:\n${writing}\n\nAsked:\n${item.askedQuestions.join("\n")}`;
}

function unansweredContext(store: HealStoreV1, itemId: string): string {
  return exercisesForItem(store, itemId)
    .filter((row) => row.status === "active" && !row.answeredEntryId)
    .map((row) => `${row.id}: ${row.question}`)
    .join("\n");
}
