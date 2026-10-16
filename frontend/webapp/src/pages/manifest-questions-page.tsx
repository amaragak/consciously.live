import { useEffect, useMemo, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { IdeateCloudProvider, useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import {
  AddQuestionDialog,
  AnswerQuestionDialog,
  EditQuestionDialog,
} from "@/components/plan/manifesto-editors";
import { ManifestoSubpageHeader } from "@/components/plan/manifesto-section";
import {
  loadIdeateReflectionQuestionsStore,
  removeIdeateReflectionQuestion,
  saveIdeateReflectionQuestionsStore,
  type IdeateReflectionQuestion,
} from "@/lib/ideate-reflection-questions";

const CARD =
  "relative flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5";

function QuestionsPageBody() {
  const { ready, revision } = useIdeateCloud();
  const [questions, setQuestions] = useState<IdeateReflectionQuestion[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IdeateReflectionQuestion | null>(null);
  const [answering, setAnswering] = useState<IdeateReflectionQuestion | null>(
    null,
  );
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setQuestions(loadIdeateReflectionQuestionsStore().questions);
  }, [ready, revision]);

  function persist(next: IdeateReflectionQuestion[]) {
    saveIdeateReflectionQuestionsStore({ v: 1, questions: next });
    setQuestions(next);
  }

  const { open, answered } = useMemo(() => {
    const sorted = [...questions].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return {
      open: sorted.filter((q) => !q.answer.trim()),
      answered: sorted.filter((q) => q.answer.trim()),
    };
  }, [questions]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <ManifestoSubpageHeader
        title="Questions to yourself"
        subline="Come back to these when things feel noisy."
        action={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="accent-fill-gradient inline-flex h-11 cursor-pointer items-center rounded-full px-[18px] text-sm font-semibold text-on-accent"
          >
            + Add question
          </button>
        }
      />

      {questions.length === 0 ? (
        <p className="text-[14px] text-foreground/80">
          No questions yet. Add one to come back to when things feel noisy.
        </p>
      ) : null}

      <QuestionSection
        label="Not answered yet"
        items={open}
        menuId={menuId}
        setMenuId={setMenuId}
        onAnswer={setAnswering}
        onEdit={setEditing}
        onRemove={(id) =>
          persist(removeIdeateReflectionQuestion({ v: 1, questions }, id).questions)
        }
      />
      <QuestionSection
        label="Answered"
        items={answered}
        menuId={menuId}
        setMenuId={setMenuId}
        onAnswer={setAnswering}
        onEdit={setEditing}
        onRemove={(id) =>
          persist(removeIdeateReflectionQuestion({ v: 1, questions }, id).questions)
        }
      />

      <AddQuestionDialog
        open={adding}
        questions={questions}
        onClose={() => setAdding(false)}
        onChange={persist}
      />
      <EditQuestionDialog
        question={editing}
        questions={questions}
        onClose={() => setEditing(null)}
        onChange={persist}
      />
      <AnswerQuestionDialog
        question={answering}
        questions={questions}
        onClose={() => setAnswering(null)}
        onChange={persist}
      />
    </div>
  );
}

function QuestionSection({
  label,
  items,
  menuId,
  setMenuId,
  onAnswer,
  onEdit,
  onRemove,
}: {
  label: string;
  items: IdeateReflectionQuestion[];
  menuId: string | null;
  setMenuId: (id: string | null) => void;
  onAnswer: (q: IdeateReflectionQuestion) => void;
  onEdit: (q: IdeateReflectionQuestion) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[1.6px] text-accent-link">
        {label}
      </h2>
      <ul className="flex flex-col gap-3.5">
        {items.map((q) => {
          const hasAnswer = Boolean(q.answer.trim());
          return (
            <li
              key={q.id}
              className={`${CARD} ${
                hasAnswer
                  ? "shadow-[inset_3px_0_0_var(--gold),0_2px_10px_rgba(15,27,45,0.04)]"
                  : "shadow-[inset_3px_0_0_color-mix(in_srgb,var(--gold)_45%,white),0_2px_10px_rgba(15,27,45,0.04)]"
              }`}
            >
              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  aria-label="Question actions"
                  aria-expanded={menuId === q.id}
                  onClick={() => setMenuId(menuId === q.id ? null : q.id)}
                  className="inline-flex size-[30px] cursor-pointer items-center justify-center rounded-full text-muted hover:text-foreground"
                >
                  <MoreHorizontal aria-hidden className="size-4" />
                </button>
                {menuId === q.id ? (
                  <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                    <button
                      type="button"
                      className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                      onClick={() => {
                        setMenuId(null);
                        onEdit(q);
                      }}
                    >
                      Edit question
                    </button>
                    <button
                      type="button"
                      className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                      onClick={() => {
                        setMenuId(null);
                        onRemove(q.id);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="pr-10 font-display text-[22px] font-normal leading-[1.3] text-foreground">
                {q.text}
              </p>
              {hasAnswer ? (
                <p className="whitespace-pre-wrap text-[15px] leading-[1.6] text-foreground/80">
                  {q.answer}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => onAnswer(q)}
                  className="inline-flex w-fit cursor-pointer items-center gap-0.5 text-[14px] font-semibold text-accent-link"
                >
                  Add your answer
                  <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ManifestQuestionsPage() {
  return (
    <IdeateCloudProvider>
      <QuestionsPageBody />
    </IdeateCloudProvider>
  );
}
