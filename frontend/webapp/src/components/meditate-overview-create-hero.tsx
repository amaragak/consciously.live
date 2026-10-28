import { useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconPlus } from "@tabler/icons-react";
import { CommunityCategoryGrid } from "@/components/community-category-grid";
import { CreateOneFlowPickerShell } from "@/components/create-one-flow-picker-shell";
import { CreateProgramPicker } from "@/components/create-program-picker";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { HealAvatar, useHealStore } from "@/components/heal/heal-bits";
import { JournalReflectPicker } from "@/components/journal-reflect-picker";
import { ManifestGoalPicker } from "@/components/manifest-goal-picker";
import { MeditationLengthSelect } from "@/components/meditation-length-select";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { getMedimadeSessionJwt } from "@/lib/auth-session";
import {
  attachProgramExclusive,
  attachStyleExclusive,
  coerceMeditationLengthMinutes,
  createOneFlowHref,
  emptyCreateOneFlowState,
  type CreateFlowGoalAttachment,
  type CreateFlowHealAttachment,
  type CreateFlowJournalAttachment,
  type CreateFlowProgramAttachment,
  type CreateOneFlowState,
  type MeditationLengthMinutes,
} from "@/lib/create-one-flow-state";
import { healTypeLabel } from "@/lib/heal-copy";
import { healCreateAttachment } from "@/lib/heal-meditation-links";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import {
  journalEntryPlainForHandoff,
  loadJournalStore,
  loadJournalStoreRaw,
  type JournalEntry,
  type JournalFolder,
} from "@/lib/journal-storage";
import {
  listLibraryPrograms,
  type LibraryProgram,
} from "@/lib/medimade-api";
import {
  MEDITATION_STYLE_LABELS,
  type MeditationStyleLabel,
} from "@/lib/meditation-style-intake";
import { writeMeditateOverviewCreateHandoff } from "@/lib/meditate-overview-create-handoff";
import {
  loadIdeateStore,
  sortSubtasks,
  subtasksForProject,
} from "@/lib/plan-ideate-store";
import { useRouter } from "@/lib/spa-nav";

type PickerKind =
  | null
  | "format-menu"
  | "context-menu"
  | "style"
  | "program"
  | "journal"
  | "goal"
  | "heal";

function isStyleLabel(s: string): s is MeditationStyleLabel {
  return (MEDITATION_STYLE_LABELS as readonly string[]).includes(s);
}

/** Journal / Goal / Heal only — Format is separate. */
function contextAttachmentCount(state: CreateOneFlowState): number {
  let n = state.journals.length;
  if (state.goal) n += 1;
  if (state.heal) n += 1;
  return n;
}

function TokenChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-[34px] max-w-full items-center gap-1.5 rounded-[10px] border border-accent/40 bg-accent-soft/50 py-0 pl-2.5 pr-1.5 text-[13px]">
      <span className="min-w-0 truncate font-semibold text-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:text-foreground"
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
    </span>
  );
}

export function MeditateOverviewCreateHero() {
  const router = useRouter();
  const [state, setState] = useState<CreateOneFlowState>(() =>
    emptyCreateOneFlowState(5),
  );
  const [picker, setPicker] = useState<PickerKind>(null);
  const [draftStyle, setDraftStyle] = useState("");
  const [draftProgramId, setDraftProgramId] = useState<string | null>(null);
  const [draftJournalId, setDraftJournalId] = useState<string | null>(null);
  const [draftLifeAreaId, setDraftLifeAreaId] = useState<string | null>(null);
  const [draftGoalId, setDraftGoalId] = useState<string | null>(null);
  const [draftHealId, setDraftHealId] = useState<string | null>(null);

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
  const [healStore] = useHealStore();

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
            ).slice(0, 120),
            done: s.status === "done",
          }));
          return {
            id: d.id,
            title: d.title.trim() || "Life area",
            createdAt: d.createdAt,
            dreamText: d.dreamText,
            obstacleText: d.obstacleText,
            visionText: d.visionText,
            preview: (d.dreamText.trim() || d.visionText.trim() || "").slice(
              0,
              120,
            ),
            goals,
          };
        }),
      );
    } catch {
      setLifeAreas([]);
    }
    setGoalsReady(true);
  }, []);

  const contextAttached = useMemo(
    () => contextAttachmentCount(state),
    [state],
  );
  const formatLabel = state.style?.id ?? state.program?.title ?? null;
  const hasFormat = Boolean(formatLabel);

  function openPicker(
    kind: Exclude<PickerKind, null | "format-menu" | "context-menu">,
  ) {
    if (kind === "style") setDraftStyle(state.style?.id ?? "");
    if (kind === "program") setDraftProgramId(state.program?.id ?? null);
    if (kind === "journal") setDraftJournalId(state.journals[0]?.id ?? null);
    if (kind === "goal") {
      setDraftLifeAreaId(state.goal?.lifeAreaId ?? null);
      setDraftGoalId(state.goal?.goalId ?? null);
    }
    if (kind === "heal") setDraftHealId(state.heal?.itemId ?? null);
    setPicker(kind);
  }

  function confirmPicker() {
    if (picker === "style") {
      if (!isStyleLabel(draftStyle)) return;
      setState((prev) =>
        attachStyleExclusive({ ...prev, program: null }, { id: draftStyle }),
      );
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
    } else if (picker === "heal") {
      const item = healStore.items.find(
        (row) => row.id === draftHealId && row.status !== "at_peace",
      );
      if (!item) return;
      const att: CreateFlowHealAttachment = healCreateAttachment(
        item,
        healStore,
      );
      setState((prev) => ({ ...prev, heal: att }));
    }
    setPicker(null);
  }

  function goToCreate(
    step: "shape" | "sound",
    nextState: CreateOneFlowState = state,
  ) {
    writeMeditateOverviewCreateHandoff({ v: 1, step, state: nextState });
    router.push(createOneFlowHref(step));
  }

  function onArrow() {
    goToCreate("shape");
  }

  /* Random removed from overview hero (Format/Context pack).
  function surpriseMe() { ... goToCreate("sound", next); }
  */

  const formatChipsHidden = hasFormat;
  const contextChips: Array<{
    kind: "journal" | "goal" | "heal";
    label: string;
    hidden: boolean;
  }> = [
    {
      kind: "journal",
      label: "Journal",
      hidden: state.journals.length > 0,
    },
    { kind: "goal", label: "Goal", hidden: Boolean(state.goal) },
    { kind: "heal", label: "Heal", hidden: Boolean(state.heal) },
  ];

  function clearFormat() {
    setState((p) => ({ ...p, style: null, program: null, answers: {} }));
  }

  const tokens = (
    <>
      {state.style ? (
        <TokenChip label={state.style.id} onRemove={clearFormat} />
      ) : null}
      {state.program ? (
        <TokenChip label={state.program.title} onRemove={clearFormat} />
      ) : null}
      {state.journals.map((j) => (
        <TokenChip
          key={j.id}
          label={`Journal · ${j.title}`}
          onRemove={() =>
            setState((p) => ({
              ...p,
              journals: p.journals.filter((x) => x.id !== j.id),
            }))
          }
        />
      ))}
      {state.goal ? (
        <TokenChip
          label={
            state.goal.goalTitle
              ? `${state.goal.lifeAreaTitle} · ${state.goal.goalTitle}`
              : state.goal.lifeAreaTitle
          }
          onRemove={() => setState((p) => ({ ...p, goal: null }))}
        />
      ) : null}
      {state.heal ? (
        <TokenChip
          label={state.heal.title}
          onRemove={() => setState((p) => ({ ...p, heal: null }))}
        />
      ) : null}
    </>
  );

  /** Context tokens only — mobile Format choice lives on the Format button. */
  const contextTokens = (
    <>
      {state.journals.map((j) => (
        <TokenChip
          key={j.id}
          label={`Journal · ${j.title}`}
          onRemove={() =>
            setState((p) => ({
              ...p,
              journals: p.journals.filter((x) => x.id !== j.id),
            }))
          }
        />
      ))}
      {state.goal ? (
        <TokenChip
          label={
            state.goal.goalTitle
              ? `${state.goal.lifeAreaTitle} · ${state.goal.goalTitle}`
              : state.goal.lifeAreaTitle
          }
          onRemove={() => setState((p) => ({ ...p, goal: null }))}
        />
      ) : null}
      {state.heal ? (
        <TokenChip
          label={state.heal.title}
          onRemove={() => setState((p) => ({ ...p, heal: null }))}
        />
      ) : null}
    </>
  );

  const lengthChip = (
    <MeditationLengthSelect
      value={state.lengthMinutes}
      onChange={(n) => {
        const mins = coerceMeditationLengthMinutes(n) as MeditationLengthMinutes;
        setState((p) => ({ ...p, lengthMinutes: mins }));
      }}
      size="compact"
    />
  );

  /* Random control commented out.
  const randomBtn = ( ... );
  */

  const formatMenuItems: Array<{
    kind: "style" | "program";
    title: string;
    line: string;
  }> = [
    {
      kind: "style",
      title: "Meditation style",
      line: "Body scan, sleep, breath, and more",
    },
    {
      kind: "program",
      title: "Program",
      line: "Start from a guided course",
    },
  ];

  const contextMenuItems: Array<{
    kind: "journal" | "goal" | "heal";
    title: string;
    line: string;
  }> = [
    {
      kind: "journal",
      title: "Journal entry",
      line: "Meditate on something you wrote",
    },
    {
      kind: "goal",
      title: "Manifest goal",
      line: "A life area or goal from Manifest",
    },
    {
      kind: "heal",
      title: "Heal",
      line: "Something you're carrying",
    },
  ];

  const chipClass =
    "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[rgb(243_237_226_/_0.2)] bg-[rgb(243_237_226_/_0.08)] px-3 pl-2.5 text-[13px] font-semibold text-[#F3EDE2]";
  /** Same muted inline labels as Create Start / design board — not accent eyebrows. */
  const groupLabelClass =
    "shrink-0 whitespace-nowrap text-[12px] text-[rgb(243_237_226_/_0.6)]";
  const mobileBtnClass =
    "inline-flex h-9 max-w-[46%] cursor-pointer items-center gap-1.5 rounded-[10px] border border-[rgb(243_237_226_/_0.22)] bg-[rgb(243_237_226_/_0.08)] px-3 text-[13px] font-semibold text-[#F3EDE2]";

  return (
    <>
      <section
        className="relative flex flex-col overflow-hidden rounded-[22px] p-4 shadow-[0_12px_34px_rgba(15,27,45,0.18)] md:p-5"
        style={{ backgroundColor: "#0F1B2D" }}
      >
        <div className="navy-paisley-plate" aria-hidden />
        <div className="relative flex flex-col gap-3 md:gap-3.5">
          <h1 className="truncate font-display text-[20px] leading-[1.15] text-[#F3EDE2] md:text-[24px]">
            What do you need right now?
          </h1>

          <div className="flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-4 pr-1 shadow-[0_6px_18px_rgba(0,0,0,0.18)] md:gap-2 md:pl-5 md:pr-1">
            <input
              value={state.prompt}
              onChange={(e) =>
                setState((p) => ({ ...p, prompt: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onArrow();
                }
              }}
              placeholder="Calm before my big pitch, confidence for launch day…"
              aria-label="Brief"
              className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted md:text-[15px]"
            />
            <DictationMicButton
              variant="round"
              onTranscript={(text) =>
                setState((p) => ({
                  ...p,
                  prompt: p.prompt.trim()
                    ? `${p.prompt.trim()} ${text.trim()}`
                    : text.trim(),
                }))
              }
            />
            <button
              type="button"
              aria-label="Talk it through"
              onClick={onArrow}
              style={PRIMARY_ACCENT_FILL_STYLE}
              className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent md:size-9"
            >
              <IconArrowRight className="h-4 w-4 md:h-[18px] md:w-[18px]" />
            </button>
          </div>

          {/* Desktop: Format + Context flush left under the brief; Length on the right */}
          <div className="hidden w-full items-center gap-3 md:flex">
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-x-4 gap-y-1.5">
              {tokens}
              <span className="inline-flex flex-wrap items-center justify-start gap-1.5">
                <span className={groupLabelClass}>Format</span>
                {!formatChipsHidden ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openPicker("style")}
                      className={chipClass}
                    >
                      <IconPlus className="h-3.5 w-3.5" /> Style
                    </button>
                    <span className="px-0.5 font-display text-[12px] italic text-[rgb(243_237_226_/_0.55)]">
                      or
                    </span>
                    <button
                      type="button"
                      onClick={() => openPicker("program")}
                      className={chipClass}
                    >
                      <IconPlus className="h-3.5 w-3.5" /> Program
                    </button>
                  </>
                ) : null}
              </span>
              <span className="inline-flex flex-wrap items-center justify-start gap-1.5">
                <span className={groupLabelClass}>Context</span>
                {contextChips
                  .filter((c) => !c.hidden)
                  .map((c) => (
                    <button
                      key={c.kind}
                      type="button"
                      onClick={() => openPicker(c.kind)}
                      className={chipClass}
                    >
                      <IconPlus className="h-3.5 w-3.5" /> {c.label}
                    </button>
                  ))}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* {randomBtn} */}
              {lengthChip}
            </div>
          </div>

          {/* Mobile: + Format · + Context · Length */}
          <div className="flex items-center justify-between gap-2 md:hidden">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setPicker("format-menu")}
                className={mobileBtnClass}
              >
                {hasFormat ? (
                  <span className="min-w-0 truncate">{formatLabel}</span>
                ) : (
                  <>
                    <IconPlus className="h-3.5 w-3.5 shrink-0" />
                    Format
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPicker("context-menu")}
                className={mobileBtnClass}
              >
                <IconPlus className="h-3.5 w-3.5 shrink-0" />
                {contextAttached > 0
                  ? `Context · ${contextAttached}`
                  : "Context"}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* {randomBtn} */}
              {lengthChip}
            </div>
          </div>

          {contextAttached > 0 ? (
            <div className="flex flex-wrap gap-1.5 md:hidden">
              {contextTokens}
            </div>
          ) : null}
        </div>
      </section>

      <CreateOneFlowPickerShell
        open={picker === "format-menu"}
        host="viewport"
        eyebrow="Add · Format"
        title="Style or program"
        subtitle="Pick one — Style and Program replace each other."
        confirmLabel={hasFormat ? "Remove format" : "Close"}
        confirmDisabled={false}
        onClose={() => setPicker(null)}
        onConfirm={() => {
          if (hasFormat) clearFormat();
          setPicker(null);
        }}
      >
        <ul className="flex flex-col">
          {formatMenuItems.map((item) => (
            <li key={item.kind}>
              <button
                type="button"
                onClick={() => openPicker(item.kind)}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-1 py-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] text-foreground">
                    {item.title}
                  </span>
                  <span className="block text-[13px] text-muted">
                    {item.line}
                  </span>
                </span>
                <IconPlus className="h-4 w-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </CreateOneFlowPickerShell>

      <CreateOneFlowPickerShell
        open={picker === "context-menu"}
        host="viewport"
        eyebrow="Add · Context"
        title="What do you want to add?"
        confirmLabel="Close"
        confirmDisabled={false}
        onClose={() => setPicker(null)}
        onConfirm={() => setPicker(null)}
      >
        <ul className="flex flex-col">
          {contextMenuItems.map((item) => (
            <li key={item.kind}>
              <button
                type="button"
                onClick={() => openPicker(item.kind)}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-1 py-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] text-foreground">
                    {item.title}
                  </span>
                  <span className="block text-[13px] text-muted">
                    {item.line}
                  </span>
                </span>
                <IconPlus className="h-4 w-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </CreateOneFlowPickerShell>

      <CreateOneFlowPickerShell
        open={picker === "style"}
        host="viewport"
        eyebrow="Add · Style"
        title="Pick a meditation style"
        subtitle="Each style asks a few questions in the chat."
        footSummary={draftStyle ? `${draftStyle} selected` : "None selected"}
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
        host="viewport"
        eyebrow="Add · Program"
        title="Pick a program"
        subtitle="Make an existing program your own."
        footSummary={
          programs.find((p) => p.id === draftProgramId)?.title ??
          "None selected"
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
        host="viewport"
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
        host="viewport"
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

      <CreateOneFlowPickerShell
        open={picker === "heal"}
        host="viewport"
        eyebrow="Add · Heal"
        title="Pick something from Heal"
        confirmLabel="Add to meditation"
        confirmDisabled={!draftHealId}
        onClose={() => setPicker(null)}
        onConfirm={confirmPicker}
      >
        {healStore.items.filter((row) => row.status !== "at_peace").length ===
        0 ? (
          <div className="px-1 py-6 text-center">
            <p className="text-sm text-muted">Nothing in Heal yet</p>
            <button
              type="button"
              onClick={() => router.push("/heal")}
              className="mt-3 cursor-pointer text-sm font-semibold"
            >
              Go to Heal
            </button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {healStore.items
              .filter((row) => row.status !== "at_peace")
              .map((row) => {
                const selected = draftHealId === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setDraftHealId(row.id)}
                      className={`flex w-full cursor-pointer items-center gap-3 border-b border-border px-1 py-3 text-left ${
                        selected ? "bg-accent-soft/40" : ""
                      }`}
                    >
                      <HealAvatar item={row} store={healStore} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-[1.2px] text-muted">
                          {healTypeLabel(row.type)}
                        </span>
                        <span className="block truncate font-display text-[17px]">
                          {row.title}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </CreateOneFlowPickerShell>
    </>
  );
}
