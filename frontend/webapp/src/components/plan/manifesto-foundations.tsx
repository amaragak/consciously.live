import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import {
  AddQuestionDialog,
  AnswerQuestionDialog,
  QuoteComposerDialog,
  ValuesEditorDialog,
} from "@/components/plan/manifesto-editors";
import { ManifestoSectionHeader } from "@/components/plan/manifesto-section";
import type { IdeateQuote } from "@/lib/ideate-quotes";
import type { IdeateReflectionQuestion } from "@/lib/ideate-reflection-questions";
import type { IdeateValue } from "@/lib/ideate-values";
import { quoteOfDay } from "@/lib/quote-rotation";

const CARD =
  "flex h-full min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-card p-5 shadow-[0_2px_10px_rgba(15,27,45,0.04)]";
const LINK =
  "inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-semibold text-accent-link transition-opacity hover:opacity-80";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[1.4px] text-muted";
const CHIP =
  "inline-flex shrink-0 items-center rounded-full border border-[color-mix(in_srgb,var(--gold)_35%,white)] bg-accent-soft px-[14px] py-[7px] text-[14px] text-foreground";

function countLabel(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function useClamped(text: string) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text]);
  return { ref, clamped };
}

function CardFooter({
  count,
  children,
}: {
  count: string;
  children?: ReactNode;
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-[13px] text-muted">
      <span>{count}</span>
      <span className="flex items-center gap-3">{children}</span>
    </div>
  );
}

function AddLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={LINK}>
      <Plus aria-hidden className="size-3.5" strokeWidth={2} />
      {children}
    </button>
  );
}

export function ManifestoFoundations({
  values,
  quotes,
  questions,
  onValues,
  onQuotes,
  onQuestions,
}: {
  values: IdeateValue[];
  quotes: IdeateQuote[];
  questions: IdeateReflectionQuestion[];
  onValues: (next: IdeateValue[]) => void;
  onQuotes: (next: IdeateQuote[]) => void;
  onQuestions: (next: IdeateReflectionQuestion[]) => void;
}) {
  const [valuesOpen, setValuesOpen] = useState(false);
  const [valuesBlank, setValuesBlank] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [answering, setAnswering] = useState<IdeateReflectionQuestion | null>(
    null,
  );
  const [peek, setPeek] = useState(0);

  const rotation = useMemo(() => quoteOfDay(quotes), [quotes]);
  const shownQuote =
    rotation && rotation.sequence.length > 0
      ? rotation.sequence[peek % rotation.sequence.length]
      : null;

  const unanswered = useMemo(
    () =>
      [...questions]
        .filter((q) => !q.answer.trim())
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [questions],
  );
  const answered = useMemo(
    () => questions.filter((q) => q.answer.trim()),
    [questions],
  );
  const revisit = useMemo(() => {
    if (unanswered.length > 0 || answered.length === 0) return null;
    const day = new Date();
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return answered[h % answered.length] ?? null;
  }, [answered, unanswered.length]);

  const quoteClamp = useClamped(shownQuote?.text ?? "");

  function openValues(blank: boolean) {
    setValuesBlank(blank);
    setValuesOpen(true);
  }

  if (values.length === 0 && quotes.length === 0 && questions.length === 0) {
    return (
      <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
        <div className={CARD}>
          <h2 className="font-display text-[22px] font-normal leading-none text-foreground">
            Start your foundations
          </h2>
          <p className="text-[14px] text-foreground/80">
            Your values, words to keep and questions to come back to.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <OutlineButton onClick={() => openValues(true)}>+ Add values</OutlineButton>
            <OutlineButton onClick={() => setQuoteOpen(true)}>+ Add a quote</OutlineButton>
            <OutlineButton onClick={() => setQuestionOpen(true)}>
              + Add a question
            </OutlineButton>
          </div>
        </div>
        <ValuesEditorDialog
          open={valuesOpen}
          values={values}
          startWithBlank={valuesBlank}
          onClose={() => setValuesOpen(false)}
          onChange={onValues}
        />
        <QuoteComposerDialog
          open={quoteOpen}
          quotes={quotes}
          editing={null}
          onClose={() => setQuoteOpen(false)}
          onChange={onQuotes}
        />
        <AddQuestionDialog
          open={questionOpen}
          questions={questions}
          onClose={() => setQuestionOpen(false)}
          onChange={onQuestions}
        />
      </section>
    );
  }

  const focusQuestion = unanswered[0] ?? null;
  const extraValues = Math.max(0, values.length - 8);

  return (
    <section
      className="mx-auto mt-10 flex max-w-6xl flex-col gap-5 px-4 sm:px-6"
      aria-labelledby="manifesto-foundations-heading"
    >
      <ManifestoSectionHeader
        id="manifesto-foundations-heading"
        title="Foundations"
        subline="What everything else is built on."
      />
      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 md:gap-3.5 xl:grid-cols-3">
        <article className={`${CARD} md:col-span-2 xl:col-span-1`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-[22px] font-normal text-foreground">
              Values
            </h3>
            <button type="button" onClick={() => openValues(false)} className={LINK}>
              Edit
              <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
            </button>
          </div>
          {values.length === 0 ? (
            <p className="text-[14px] text-foreground/80">
              Name a few principles you want to live by.
            </p>
          ) : (
            <>
              <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
                {values.map((v) => (
                  <li key={v.id}>
                    <span className={CHIP}>{v.text}</span>
                  </li>
                ))}
              </ul>
              <ul className="hidden flex-wrap gap-2 md:flex">
                {values.slice(0, 8).map((v) => (
                  <li key={v.id}>
                    <span className={CHIP}>{v.text}</span>
                  </li>
                ))}
                {extraValues > 0 ? (
                  <li>
                    <button type="button" onClick={() => openValues(false)} className={`${CHIP} text-accent-link`}>
                      +{extraValues} more
                    </button>
                  </li>
                ) : null}
              </ul>
            </>
          )}
          <CardFooter count={values.length === 0 ? "" : countLabel(values.length, "value", "values")}>
            <AddLink onClick={() => openValues(true)}>Add</AddLink>
          </CardFooter>
        </article>

        <article className={CARD}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-[22px] font-normal text-foreground">
              Words to keep
            </h3>
            <Link to="/manifest/words" className={LINK}>
              Open
              <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
            </Link>
          </div>
          {shownQuote ? (
            <div className="flex flex-col gap-2">
              <span className={EYEBROW}>Today</span>
              <p
                ref={quoteClamp.ref}
                className="line-clamp-4 font-display text-[19px] font-normal italic leading-[1.42] text-foreground"
              >
                &ldquo;{shownQuote.text}&rdquo;
              </p>
              {shownQuote.attribution?.trim() ? (
                <p className="text-[13px] font-semibold text-accent-link">
                  — {shownQuote.attribution.trim()}
                </p>
              ) : null}
              {quoteClamp.clamped ? (
                <Link
                  to={`/manifest/words#quote-${shownQuote.id}`}
                  className={LINK}
                >
                  Read more
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-[14px] text-foreground/80">
              No quotes yet. Add words that keep you steady.
            </p>
          )}
          <CardFooter
            count={quotes.length === 0 ? "" : countLabel(quotes.length, "quote", "quotes")}
          >
            {quotes.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setPeek((n) => (rotation ? (n + 1) % rotation.sequence.length : n))
                }
                className={LINK}
              >
                <RefreshCw aria-hidden className="size-3.5" strokeWidth={2} />
                Another
              </button>
            ) : null}
            <AddLink onClick={() => setQuoteOpen(true)}>Add</AddLink>
          </CardFooter>
        </article>

        <article className={CARD}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-[22px] font-normal text-foreground">
              Questions to yourself
            </h3>
            <Link to="/manifest/questions" className={LINK}>
              Open
              <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
            </Link>
          </div>
          {focusQuestion ? (
            <div className="flex flex-col items-start gap-3">
              <span className={EYEBROW}>Not answered yet</span>
              <p className="font-display text-[20px] font-normal leading-[1.32] text-foreground">
                {focusQuestion.text}
              </p>
              <OutlineButton onClick={() => setAnswering(focusQuestion)}>
                Answer
              </OutlineButton>
            </div>
          ) : revisit ? (
            <div className="flex flex-col items-start gap-3">
              <span className={EYEBROW}>Revisit</span>
              <p className="font-display text-[20px] font-normal leading-[1.32] text-foreground">
                {revisit.text}
              </p>
              <p className="line-clamp-2 text-[14px] leading-snug text-foreground/80">
                {revisit.answer.trim().split("\n")[0]}
              </p>
              <OutlineButton onClick={() => setAnswering(revisit)}>
                Revisit
              </OutlineButton>
            </div>
          ) : (
            <p className="text-[14px] text-foreground/80">
              No questions yet. Add one to come back to when things feel noisy.
            </p>
          )}
          <CardFooter
            count={
              questions.length === 0
                ? ""
                : `${answered.length} of ${questions.length} answered`
            }
          >
            <AddLink onClick={() => setQuestionOpen(true)}>Add</AddLink>
          </CardFooter>
        </article>
      </div>

      <ValuesEditorDialog
        open={valuesOpen}
        values={values}
        startWithBlank={valuesBlank}
        onClose={() => setValuesOpen(false)}
        onChange={onValues}
      />
      <QuoteComposerDialog
        open={quoteOpen}
        quotes={quotes}
        editing={null}
        onClose={() => setQuoteOpen(false)}
        onChange={onQuotes}
      />
      <AddQuestionDialog
        open={questionOpen}
        questions={questions}
        onClose={() => setQuestionOpen(false)}
        onChange={onQuestions}
      />
      <AnswerQuestionDialog
        question={answering}
        questions={questions}
        onClose={() => setAnswering(null)}
        onChange={onQuestions}
      />
    </section>
  );
}

function OutlineButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[34px] cursor-pointer items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:border-accent/50"
    >
      {children}
    </button>
  );
}
