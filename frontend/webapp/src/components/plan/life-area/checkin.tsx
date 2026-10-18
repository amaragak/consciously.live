import { useEffect, useRef, useState } from "react";
import { useWhisperDictation } from "@/hooks/use-whisper-dictation";
import {
  AREA_LABEL,
  MIST,
  OUTLINE,
  guessThoughtKind,
} from "@/components/plan/life-area/kit";
import { newDreamId, type LifeAreaCheckIn, type PlanDream } from "@/lib/plan-dreams";
import {
  createSubtask,
  createTodo,
  loadIdeateStore,
  recomputeSubtaskStatus,
  saveIdeateStore,
  todosForSubtask,
  upsertDream,
  upsertSubtask,
  upsertTodo,
} from "@/lib/plan-ideate-store";

type Phase = "talk" | "sorting" | "summary" | "review";

type Proposal = {
  id: string;
  on: boolean;
  areaId: string;
  areaTitle: string;
  label: string;
  bucket: "done" | "plans" | "thoughts" | "vision";
  apply: () => { undo: NonNullable<LifeAreaCheckIn["undo"]> };
};

type Props = {
  dream: PlanDream;
  onClose: () => void;
  onPatch: (partial: Partial<PlanDream>) => void;
  onRefresh: () => void;
  onFilled: (message: string, undo: () => void) => void;
};

const STEPS = [
  "Transcribing",
  "Matching to your life areas",
  "Finding what you've done",
  "Spotting plans and new goals",
  "Sorting thoughts by type",
];

export function VoiceCheckIn({
  dream,
  onClose,
  onPatch,
  onRefresh,
  onFilled,
}: Props) {
  const [phase, setPhase] = useState<Phase>("talk");
  const [typed, setTyped] = useState(false);
  const [draft, setDraft] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [step, setStep] = useState(0);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const dictation = useWhisperDictation();
  const started = useRef(false);

  useEffect(() => {
    if (phase !== "talk" || typed || !dictation.recording) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [dictation.recording, phase, typed]);

  async function finishTalk() {
    let text = draft.trim();
    if (dictation.recording) {
      const heard = await dictation.stopAndTranscribe();
      if (heard) text = text ? `${text} ${heard}` : heard;
    }
    setDraft(text);
    setPhase("sorting");
    setStep(0);
    const built = buildProposals(text, dream);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= STEPS.length) {
        window.clearInterval(timer);
        setProposals(built);
        setPhase("summary");
      }
    }, 350);
  }

  function fill(list: Proposal[]) {
    const chosen = list.filter((p) => p.on && p.bucket !== "vision");
    const vision = list.find((p) => p.on && p.bucket === "vision");
    const undoParts: NonNullable<LifeAreaCheckIn["undo"]> = {
      todoWasChecked: [],
      addedTodoIds: [],
      addedSubtaskIds: [],
      addedThoughtIds: [],
    };
    for (const item of chosen) {
      const piece = item.apply();
      undoParts.todoWasChecked?.push(...(piece.undo.todoWasChecked ?? []));
      undoParts.addedTodoIds?.push(...(piece.undo.addedTodoIds ?? []));
      undoParts.addedSubtaskIds?.push(...(piece.undo.addedSubtaskIds ?? []));
      undoParts.addedThoughtIds?.push(...(piece.undo.addedThoughtIds ?? []));
    }
    if (vision) {
      onPatch({ visionSuggestion: vision.label });
    }
    const areas = new Set(chosen.map((p) => p.areaTitle));
    const checkIn: LifeAreaCheckIn = {
      id: newDreamId().replace(/^dream_/, "checkin_"),
      note: draft.slice(0, 280),
      transcript: draft,
      createdAt: new Date().toISOString(),
      undo: undoParts,
    };
    const current = loadIdeateStore().dreams.find((d) => d.id === dream.id) ?? dream;
    onPatch({
      checkIns: [checkIn, ...(current.checkIns ?? [])].slice(0, 40),
      ...(vision ? { visionSuggestion: vision.label } : {}),
    });
    onRefresh();
    onFilled(
      `Filled in ${chosen.length} updates across ${[...areas].join(", ") || dream.title}`,
      () => {
        let store = loadIdeateStore();
        for (const row of undoParts.todoWasChecked ?? []) {
          const todo = store.todos.find((t) => t.id === row.id);
          if (!todo) continue;
          store = upsertTodo(store, {
            ...todo,
            isChecked: row.isChecked,
            checkedAt: row.checkedAt,
          });
          store = recomputeSubtaskStatus(store, todo.subtaskId);
        }
        for (const id of undoParts.addedTodoIds ?? []) {
          store = { ...store, todos: store.todos.filter((t) => t.id !== id) };
        }
        for (const id of undoParts.addedSubtaskIds ?? []) {
          store = {
            ...store,
            subtasks: store.subtasks.filter((s) => s.id !== id),
          };
        }
        store = {
          ...store,
          dreams: store.dreams.map((d) =>
            d.id === dream.id
              ? {
                  ...d,
                  dreamEntries: (d.dreamEntries ?? []).filter(
                    (e) => !(undoParts.addedThoughtIds ?? []).includes(e.id),
                  ),
                  checkIns: (d.checkIns ?? []).filter((c) => c.id !== checkIn.id),
                  visionSuggestion: null,
                }
              : d,
          ),
        };
        saveIdeateStore(store);
        onRefresh();
      },
    );
    onClose();
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-overlay/45 md:items-center">
      <div className="flex max-h-[100dvh] w-full flex-col rounded-t-[20px] bg-card p-5 md:max-h-[90vh] md:max-w-[560px] md:rounded-[20px]">
        {phase === "talk" ? (
          <>
            <header className="flex items-start justify-between">
              <div>
                <p className={AREA_LABEL}>Check in</p>
                <p className="font-display text-lg text-foreground">{dream.title}</p>
              </div>
              <button type="button" aria-label="Close" onClick={onClose}>
                ×
              </button>
            </header>
            {typed ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="mt-4 min-h-40 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none"
                placeholder="Type what's on your mind."
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (dictation.recording) void dictation.stopAndTranscribe().then((t) => {
                      if (t) setDraft((d) => (d ? `${d} ${t}` : t));
                    });
                    else {
                      started.current = true;
                      void dictation.start();
                    }
                  }}
                  className="mx-auto mt-6 flex size-[72px] items-center justify-center rounded-full bg-accent-soft text-2xl text-accent-link ring-8 ring-accent/15"
                >
                  {dictation.recording ? "■" : "●"}
                </button>
                <p className="mt-2 text-center text-sm tabular-nums text-muted">
                  {mins}:{secs.toString().padStart(2, "0")}
                </p>
                <div className="mt-3 max-h-28 overflow-y-auto rounded-xl border border-border bg-background p-3 text-sm">
                  {draft || "The transcript shows up here."}
                </div>
                <p className="mt-3 font-display text-base italic">
                  Say whatever's on your mind.
                </p>
                <p className="text-xs text-muted">
                  Updates, wins, worries, ideas, plans, any life area. It doesn't need to be organised; I'll sort it afterwards.
                </p>
              </>
            )}
            <footer className="mt-4 flex items-center gap-2">
              <button type="button" className="text-sm text-accent-link" onClick={() => setTyped(true)}>
                Type instead
              </button>
              <button
                type="button"
                className={`${OUTLINE} ml-auto h-10 px-4 text-sm`}
                onClick={() => {
                  if (dictation.recording) dictation.cancel();
                }}
              >
                Pause
              </button>
              <button type="button" onClick={() => void finishTalk()} className={`${MIST} h-10 px-4 text-sm`}>
                Done
              </button>
            </footer>
          </>
        ) : null}
        {phase === "sorting" ? (
          <div>
            <p className="font-display text-xl">Sorting through what you said…</p>
            <p className="text-sm text-muted">
              {mins} min {secs} s of talking
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-accent"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
            <ul className="mt-4 text-sm">
              {STEPS.map((label, i) => (
                <li key={label} className={i === step ? "font-semibold" : "text-muted"}>
                  {i < step ? "✓ " : ""}
                  {label}
                </li>
              ))}
            </ul>
            {draft ? (
              <p className="mt-4 rounded-xl bg-background p-3 text-sm text-muted">{draft}</p>
            ) : null}
          </div>
        ) : null}
        {phase === "summary" || phase === "review" ? (
          <Summary
            draft={draft}
            proposals={proposals}
            review={phase === "review"}
            onToggle={(id) =>
              setProposals((rows) =>
                rows.map((r) => (r.id === id ? { ...r, on: !r.on } : r)),
              )
            }
            onReview={() => setPhase("review")}
            onFill={() => fill(proposals)}
            onClose={onClose}
          />
        ) : null}
      </div>
    </div>
  );
}

function Summary({
  draft,
  proposals,
  review,
  onToggle,
  onReview,
  onFill,
  onClose,
}: {
  draft: string;
  proposals: Proposal[];
  review: boolean;
  onToggle: (id: string) => void;
  onReview: () => void;
  onFill: () => void;
  onClose: () => void;
}) {
  const count = (bucket: Proposal["bucket"]) =>
    proposals.filter((p) => p.bucket === bucket).length;
  const areas = [...new Set(proposals.map((p) => p.areaTitle))];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start justify-between">
        <div>
          <p className={AREA_LABEL}>Check in · Here's what I found</p>
          <p className="mt-2 font-display text-lg text-foreground">
            {draft.trim()
              ? "I sorted what you said into steps, thoughts, and ideas."
              : "There wasn't much to sort. You can still keep the check-in."}
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {(
          [
            ["done", "Done"],
            ["plans", "Plans"],
            ["thoughts", "Thoughts"],
            ["vision", "Vision"],
          ] as const
        ).map(([id, label]) => (
          <div key={id} className="rounded-xl bg-background p-2 text-center">
            <p className="font-display text-xl">{count(id)}</p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {areas.map((area) => (
          <span key={area} className="rounded-full bg-accent-soft px-2 py-1 text-xs">
            {area} · {proposals.filter((p) => p.areaTitle === area).length}
          </span>
        ))}
      </div>
      {review ? (
        <ul className="mt-3 flex-1 overflow-y-auto">
          {proposals.map((p) => (
            <li key={p.id} className="flex items-start gap-2 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={p.on}
                onChange={() => onToggle(p.id)}
              />
              <span>
                <span className="text-muted">{p.areaTitle} · </span>
                {p.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-muted">
        Vision tweaks are only suggested, never filled in.
      </p>
      <footer className="mt-3 flex items-center gap-2">
        {!review ? (
          <button type="button" className="text-sm font-semibold text-accent-link" onClick={onReview}>
            Check the details first
          </button>
        ) : null}
        <button type="button" onClick={onFill} className={`${MIST} ml-auto h-10 px-4 text-sm`}>
          Fill it in
        </button>
      </footer>
    </div>
  );
}

function buildProposals(text: string, dream: PlanDream): Proposal[] {
  const store = loadIdeateStore();
  const sentences = text
    .split(/[.!\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  const out: Proposal[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const area =
      store.dreams.find((d) => lower.includes(d.title.toLowerCase())) ?? dream;
    const todos = store.subtasks
      .filter((s) => s.projectId === area.id)
      .flatMap((s) => todosForSubtask(store, s.id));
    const hit = todos.find((t) => {
      const word = t.title.toLowerCase().split(/\s+/).find((w) => w.length > 4);
      return word ? lower.includes(word) : false;
    });
    if (hit && /\b(did|done|finished|completed|ticked)\b/.test(lower)) {
      out.push({
        id: `tick-${hit.id}`,
        on: true,
        areaId: area.id,
        areaTitle: area.title,
        label: `Tick “${hit.title}”`,
        bucket: "done",
        apply: () => {
          const current = loadIdeateStore();
          const todo = current.todos.find((t) => t.id === hit.id);
          if (!todo) return { undo: {} };
          const undo = {
            todoWasChecked: [
              {
                id: todo.id,
                isChecked: todo.isChecked,
                checkedAt: todo.checkedAt,
              },
            ],
          };
          let next = upsertTodo(current, {
            ...todo,
            isChecked: true,
            checkedAt: new Date().toISOString(),
          });
          next = recomputeSubtaskStatus(next, todo.subtaskId);
          saveIdeateStore(next);
          return { undo };
        },
      });
      continue;
    }
    if (/\b(i will|i'll|going to|next)\b/.test(lower)) {
      const goal = store.subtasks.find(
        (s) => s.projectId === area.id && s.status !== "done",
      );
      if (goal) {
        out.push({
          id: `step-${sentence.slice(0, 12)}`,
          on: true,
          areaId: area.id,
          areaTitle: area.title,
          label: sentence,
          bucket: "plans",
          apply: () => {
            const todo = createTodo(
              goal.id,
              sentence,
              todosForSubtask(loadIdeateStore(), goal.id).length,
            );
            saveIdeateStore(upsertTodo(loadIdeateStore(), todo));
            return { undo: { addedTodoIds: [todo.id] } };
          },
        });
      } else {
        out.push({
          id: `goal-${sentence.slice(0, 12)}`,
          on: true,
          areaId: area.id,
          areaTitle: area.title,
          label: sentence,
          bucket: "plans",
          apply: () => {
            const sub = createSubtask(area.id, sentence.slice(0, 80));
            let next = upsertSubtask(loadIdeateStore(), sub);
            const areaDream = next.dreams.find((d) => d.id === area.id);
            if (areaDream) next = upsertDream(next, areaDream);
            saveIdeateStore(next);
            return { undo: { addedSubtaskIds: [sub.id] } };
          },
        });
      }
      continue;
    }
    if (/\b(dream|vision|want)\b/.test(lower)) {
      out.push({
        id: `vision-${sentence.slice(0, 12)}`,
        on: true,
        areaId: area.id,
        areaTitle: area.title,
        label: sentence,
        bucket: "vision",
        apply: () => ({ undo: {} }),
      });
      continue;
    }
    out.push({
      id: `thought-${sentence.slice(0, 16)}`,
      on: true,
      areaId: area.id,
      areaTitle: area.title,
      label: sentence,
      bucket: "thoughts",
      apply: () => {
        const id = newDreamId().replace(/^dream_/, "thought_");
        const current = loadIdeateStore();
        const target = current.dreams.find((d) => d.id === area.id);
        if (!target) return { undo: {} };
        saveIdeateStore(
          upsertDream(current, {
            ...target,
            dreamEntries: [
              ...(target.dreamEntries ?? []),
              {
                id,
                text: sentence,
                createdAt: new Date().toISOString(),
                coachReply: "",
                kind: guessThoughtKind(sentence),
              },
            ],
          }),
        );
        return { undo: { addedThoughtIds: [id] } };
      },
    });
  }
  return out;
}
