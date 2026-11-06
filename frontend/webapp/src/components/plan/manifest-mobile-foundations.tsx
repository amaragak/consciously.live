/**
 * Mobile Manifest overview · Foundations as one card with three expandable rows.
 * Desktop keeps ManifestoFoundations.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  AnswerQuestionDialog,
  ValuesEditorDialog,
} from "@/components/plan/manifesto-editors";
import { SelectChevron } from "@/components/select-chevron";
import type { IdeateQuote } from "@/lib/ideate-quotes";
import type { IdeateReflectionQuestion } from "@/lib/ideate-reflection-questions";
import type { IdeateValue } from "@/lib/ideate-values";
import {
  loadManifestFoundationsExpand,
  saveManifestFoundationsExpand,
  type ManifestFoundationsExpandState,
} from "@/lib/manifest-foundations-expand";
import { quoteOfDay } from "@/lib/quote-rotation";

const CHIP =
  "inline-flex shrink-0 items-center rounded-full border border-[color-mix(in_srgb,var(--gold)_35%,white)] bg-accent-soft px-3 py-1.5 text-[13px] text-foreground";
const CHIP_GAP = 6;
const FOOT_LINK =
  "inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-semibold text-accent-link";

type RowId = keyof ManifestFoundationsExpandState;

/** One line of full chips (+N for the rest). Never truncates a label. */
function CollapsedValueChips({ values }: { values: IdeateValue[] }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [fitState, setFitState] = useState({ n: 1, plus: false });

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;

    const fit = () => {
      const chips = Array.from(
        root.querySelectorAll<HTMLElement>("[data-chip]"),
      );
      const plus = root.querySelector<HTMLElement>("[data-plus]");
      if (!chips.length) {
        setFitState({ n: 0, plus: false });
        return;
      }
      const budget = root.clientWidth;
      if (budget <= 0) return;
      const widths = chips.map((el) => el.offsetWidth);
      const plusW = plus?.offsetWidth ?? 0;

      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i]!;
        const remaining = widths.length - (i + 1);
        const gap = count > 0 ? CHIP_GAP : 0;
        const next = used + gap + w;
        const total = remaining > 0 ? next + CHIP_GAP + plusW : next;
        if (total > budget + 0.5) break;
        used = next;
        count += 1;
      }

      if (count > 0) {
        setFitState({ n: count, plus: count < widths.length });
        return;
      }
      // Nothing fit with +N — first chip alone, no cramped +N.
      setFitState({ n: 1, plus: false });
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    return () => ro.disconnect();
  }, [values]);

  const shown = values.slice(0, fitState.n);
  const extra = fitState.plus
    ? Math.max(0, values.length - shown.length)
    : 0;

  return (
    <div ref={measureRef} className="relative w-full min-w-0">
      {/* Off-flow measure row at natural chip widths. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex w-full flex-nowrap gap-1.5 opacity-0"
      >
        {values.map((v) => (
          <span key={v.id} data-chip className={CHIP}>
            {v.text}
          </span>
        ))}
        <span data-plus className={`${CHIP} text-muted`}>
          +99
        </span>
      </div>
      <ul className="flex flex-nowrap gap-1.5 overflow-hidden">
        {shown.map((v) => (
          <li key={v.id} className="shrink-0">
            <span className={CHIP}>{v.text}</span>
          </li>
        ))}
        {extra > 0 ? (
          <li className="shrink-0">
            <span className={`${CHIP} text-muted`}>+{extra}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function ManifestMobileFoundations({
  values,
  quotes,
  questions,
  onValues,
  onQuestions,
}: {
  values: IdeateValue[];
  quotes: IdeateQuote[];
  questions: IdeateReflectionQuestion[];
  onValues: (next: IdeateValue[]) => void;
  onQuestions: (next: IdeateReflectionQuestion[]) => void;
}) {
  const [open, setOpen] = useState<ManifestFoundationsExpandState>(() =>
    loadManifestFoundationsExpand(),
  );
  const [valuesOpen, setValuesOpen] = useState(false);
  const [answering, setAnswering] = useState<IdeateReflectionQuestion | null>(
    null,
  );

  const rotation = useMemo(() => quoteOfDay(quotes), [quotes]);
  const todayQuote =
    rotation && rotation.sequence.length > 0 ? rotation.sequence[0] : null;

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
  const nextQuestion = unanswered[0] ?? null;

  function toggle(id: RowId) {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveManifestFoundationsExpand(next);
      return next;
    });
  }

  const questionsCountLabel =
    questions.length === 0
      ? "0"
      : `${answered.length} of ${questions.length} answered`;

  return (
    <section
      className="mx-auto flex max-w-6xl flex-col gap-2.5 px-4"
      aria-labelledby="manifest-foundations-mobile-heading"
    >
      <h2
        id="manifest-foundations-mobile-heading"
        className="text-[11px] font-semibold uppercase tracking-[1.6px] text-[#8A6424]"
      >
        Foundations
      </h2>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgba(15,27,45,0.04)]">
        {/* Values */}
        <FoundationRow
          open={open.values}
          onToggle={() => toggle("values")}
          title="Values"
          count={String(values.length)}
        >
          {values.length === 0 ? (
            <p className="text-[14px] text-muted">No values yet.</p>
          ) : open.values ? (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {values.map((v) => (
                  <li key={v.id}>
                    <span className={CHIP}>{v.text}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setValuesOpen(true)}
                className={`${FOOT_LINK} mt-3`}
              >
                Edit values
                <SelectChevron direction="right" className="text-accent-link" />
              </button>
            </>
          ) : (
            <CollapsedValueChips values={values} />
          )}
        </FoundationRow>

        {/* Words to keep */}
        <FoundationRow
          open={open.quotes}
          onToggle={() => toggle("quotes")}
          title="Words to keep"
          count={
            quotes.length === 0
              ? "0"
              : `${quotes.length} quote${quotes.length === 1 ? "" : "s"}`
          }
          bordered
        >
          {quotes.length === 0 ? (
            <p className="text-[14px] text-muted">No quotes yet.</p>
          ) : open.quotes ? (
            <>
              <ul className="flex flex-col gap-3.5">
                {quotes.map((q) => (
                  <li key={q.id} className="flex flex-col gap-1">
                    <p className="font-display text-[16px] italic leading-[1.4] text-foreground">
                      &ldquo;{q.text}&rdquo;
                    </p>
                    {q.attribution?.trim() ? (
                      <p className="text-[12.5px] font-semibold text-accent-link">
                        — {q.attribution.trim()}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Link to="/manifest/words" className={`${FOOT_LINK} mt-3`}>
                All quotes
                <SelectChevron direction="right" className="text-accent-link" />
              </Link>
            </>
          ) : todayQuote ? (
            <div className="flex flex-col gap-1">
              <p className="line-clamp-2 font-display text-[16px] italic leading-[1.4] text-foreground">
                &ldquo;{todayQuote.text}&rdquo;
              </p>
              {todayQuote.attribution?.trim() ? (
                <p className="text-[12.5px] font-semibold text-accent-link">
                  — {todayQuote.attribution.trim()}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[14px] text-muted">No quotes yet.</p>
          )}
        </FoundationRow>

        {/* Questions */}
        <FoundationRow
          open={open.questions}
          onToggle={() => toggle("questions")}
          title="Questions"
          count={questionsCountLabel}
          bordered
        >
          {questions.length === 0 ? (
            <p className="text-[14px] text-muted">No questions yet.</p>
          ) : open.questions ? (
            <>
              <ul className="flex flex-col gap-3.5">
                {unanswered.map((q) => (
                  <li key={q.id} className="flex flex-col items-start gap-2">
                    <p className="text-[15px] leading-snug text-foreground">
                      {q.text}
                    </p>
                    <button
                      type="button"
                      onClick={() => setAnswering(q)}
                      className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground"
                    >
                      Answer
                    </button>
                  </li>
                ))}
                {answered.map((q) => (
                  <li key={q.id} className="flex flex-col gap-1">
                    <p className="text-[15px] leading-snug text-foreground">
                      {q.text}
                    </p>
                    <p className="line-clamp-3 text-[13.5px] leading-snug text-muted">
                      {q.answer.trim()}
                    </p>
                  </li>
                ))}
              </ul>
              <Link to="/manifest/questions" className={`${FOOT_LINK} mt-3`}>
                All questions
                <SelectChevron direction="right" className="text-accent-link" />
              </Link>
            </>
          ) : nextQuestion ? (
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-[15px] leading-snug text-foreground">
                {nextQuestion.text}
              </p>
              <button
                type="button"
                onClick={() => setAnswering(nextQuestion)}
                className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground"
              >
                Answer
              </button>
            </div>
          ) : answered[0] ? (
            <div className="flex flex-col gap-1">
              <p className="text-[15px] leading-snug text-foreground">
                {answered[0]!.text}
              </p>
              <p className="line-clamp-2 text-[13.5px] leading-snug text-muted">
                {answered[0]!.answer.trim()}
              </p>
            </div>
          ) : (
            <p className="text-[14px] text-muted">No questions yet.</p>
          )}
        </FoundationRow>
      </div>

      <ValuesEditorDialog
        open={valuesOpen}
        values={values}
        startWithBlank={false}
        onClose={() => setValuesOpen(false)}
        onChange={onValues}
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

function FoundationRow({
  open,
  onToggle,
  title,
  count,
  bordered,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  count: string;
  bordered?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={bordered ? "border-t border-border" : undefined}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-foreground">
          {title}
          <span className="ml-1.5 font-normal text-muted">{count}</span>
        </span>
        <SelectChevron open={open} />
      </button>
      <div className="px-4 pb-3.5 pt-0">{children}</div>
    </div>
  );
}
