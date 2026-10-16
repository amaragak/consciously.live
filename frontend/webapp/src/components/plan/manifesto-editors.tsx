import { useEffect, useState, type ReactNode } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { GripVertical } from "lucide-react";
import {
  addCustomQuestion,
  addPresetQuestion,
  availablePresets,
  patchQuestionAnswer,
  patchQuestionText,
  removeIdeateReflectionQuestion,
  type IdeateReflectionQuestion,
} from "@/lib/ideate-reflection-questions";
import {
  addIdeateValue,
  patchIdeateValue,
  removeIdeateValue,
  type IdeateValue,
} from "@/lib/ideate-values";
import {
  addIdeateQuote,
  addIdeateQuotes,
  patchIdeateQuote,
  type IdeateQuote,
} from "@/lib/ideate-quotes";
import { fetchFamousQuotes } from "@/lib/medimade-api";

function EditorShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[min(92vh,44rem)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-medium text-foreground">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function moveItem<T extends { id: string }>(items: T[], fromId: string, toId: string): T[] {
  if (fromId === toId) return items;
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return next;
}

export function ValuesEditorDialog({
  open,
  values,
  startWithBlank,
  onClose,
  onChange,
}: {
  open: boolean;
  values: IdeateValue[];
  startWithBlank: boolean;
  onClose: () => void;
  onChange: (next: IdeateValue[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft("");
    setEditingId(null);
    setEditDraft("");
  }, [open, startWithBlank]);

  return (
    <EditorShell open={open} title="Values" onClose={onClose}>
      <ul className="flex flex-col gap-2">
        {values.map((v) => (
          <li
            key={v.id}
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-2 py-1.5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const fromId = e.dataTransfer.getData("text/plain") || dragId;
              if (!fromId) return;
              onChange(moveItem(values, fromId, v.id));
              setDragId(null);
            }}
          >
            <button
              type="button"
              draggable
              aria-label={`Reorder ${v.text}`}
              onDragStart={(e) => {
                setDragId(v.id);
                e.dataTransfer.setData("text/plain", v.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragId(null)}
              className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
            {editingId === v.id ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onChange(
                    patchIdeateValue({ v: 1, values }, v.id, editDraft).values,
                  );
                  setEditingId(null);
                }}
              >
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  maxLength={120}
                  aria-label="Edit value"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 font-display text-lg outline-none ring-accent/30 focus:ring-2"
                />
                <button
                  type="submit"
                  disabled={!editDraft.trim()}
                  className="rounded-full accent-fill-gradient px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(v.id);
                  setEditDraft(v.text);
                }}
                className="min-w-0 flex-1 cursor-pointer truncate text-left font-display text-lg text-foreground"
              >
                {v.text}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onChange(removeIdeateValue({ v: 1, values }, v.id).values)
              }
              className="shrink-0 cursor-pointer px-1 text-xs text-muted hover:text-foreground"
              aria-label={`Remove ${v.text}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = addIdeateValue({ v: 1, values }, draft);
          if (next.values.length === values.length) return;
          onChange(next.values);
          setDraft("");
        }}
      >
        <label className="sr-only" htmlFor="foundations-value-new">
          New value
        </label>
        <input
          id="foundations-value-new"
          autoFocus={startWithBlank}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Honesty, Presence, Craft"
          maxLength={120}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-display text-lg outline-none ring-accent/30 focus:ring-2"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
          >
            Done
          </button>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </form>
    </EditorShell>
  );
}

type QuoteMode = "choose" | "author" | "work" | "original";

export function QuoteComposerDialog({
  open,
  quotes,
  editing,
  onClose,
  onChange,
}: {
  open: boolean;
  quotes: IdeateQuote[];
  editing: IdeateQuote | null;
  onClose: () => void;
  onChange: (next: IdeateQuote[]) => void;
}) {
  const [mode, setMode] = useState<QuoteMode>("choose");
  const [text, setText] = useState("");
  const [attribution, setAttribution] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResolved(null);
    setFound([]);
    setSelected(new Set());
    setQuery("");
    setLoading(false);
    if (editing) {
      setMode("original");
      setText(editing.text);
      setAttribution(editing.attribution ?? "");
    } else {
      setMode("choose");
      setText("");
      setAttribution("");
    }
  }, [open, editing]);

  async function findQuotes(kind: "author" | "work") {
    const q = query.trim();
    if (q.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    setFound([]);
    setSelected(new Set());
    setResolved(null);
    try {
      const result = await fetchFamousQuotes({ kind, query: q });
      setResolved(result.attribution);
      setFound(result.quotes);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : kind === "work"
            ? "Could not find quotes for that work"
            : "Could not find quotes for that person",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <EditorShell
      open={open}
      title={editing ? "Edit quote" : "Add a quote"}
      onClose={onClose}
    >
      {mode === "choose" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setMode("author")}
            className="cursor-pointer rounded-full border border-border px-4 py-2 font-sans text-sm font-medium text-foreground hover:border-gold/60 hover:bg-accent-soft/30"
          >
            From a thinker
          </button>
          <button
            type="button"
            onClick={() => setMode("work")}
            className="cursor-pointer rounded-full border border-border px-4 py-2 font-sans text-sm font-medium text-foreground hover:border-gold/60 hover:bg-accent-soft/30"
          >
            From a work
          </button>
          <button
            type="button"
            onClick={() => setMode("original")}
            className="cursor-pointer rounded-full border border-border px-4 py-2 font-sans text-sm font-medium text-foreground hover:border-gold/60 hover:bg-accent-soft/30"
          >
            Write your own
          </button>
        </div>
      ) : null}

      {mode === "author" || mode === "work" ? (
        <div className="flex flex-col gap-3">
          <p className="max-w-xl font-sans text-[13px] text-muted">
            {mode === "work"
              ? "Type a book, scripture, poem, play, or film — we'll find ten well-known lines."
              : "Type a famous person — we'll find ten well-known lines."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void findQuotes(mode);
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "work"
                  ? "e.g. On the Road, the Bible, Meditations…"
                  : "e.g. Alan Watts, Maya Angelou…"
              }
              maxLength={80}
              disabled={loading}
              aria-label={mode === "work" ? "Work title" : "Famous person"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={query.trim().length < 2 || loading}
              className="inline-flex items-center justify-center gap-2 rounded-full accent-fill-gradient px-4 py-2 text-xs font-medium text-on-accent disabled:opacity-40"
            >
              {loading ? (
                <>
                  <IconLoader2 size={14} stroke={1.75} className="animate-spin" aria-hidden />
                  Finding…
                </>
              ) : (
                "Find quotes"
              )}
            </button>
          </form>
          {error ? (
            <p className="font-sans text-sm text-red-700/80 dark:text-red-300/90">
              {error}
            </p>
          ) : null}
          {resolved && found.length > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="font-sans text-[13px] text-muted">
                Quotes from{" "}
                <span className="font-medium text-foreground">{resolved}</span>.
                Pick the ones to keep.
              </p>
              <ul className="flex flex-col gap-2">
                {found.map((line) => {
                  const on = selected.has(line);
                  return (
                    <li key={line}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 px-3 py-2.5 hover:border-gold/45">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(line)) next.delete(line);
                              else next.add(line);
                              return next;
                            });
                          }}
                          className="mt-1.5 shrink-0"
                        />
                        <span className="min-w-0 font-display text-[17px] font-normal italic leading-[1.4] text-foreground">
                          &ldquo;{line}&rdquo;
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={selected.size === 0 || !resolved}
                  onClick={() => {
                    if (!resolved || selected.size === 0) return;
                    const existing = new Set(
                      quotes.map((q) => q.text.trim().toLowerCase()),
                    );
                    const inputs = found
                      .filter((t) => selected.has(t))
                      .filter((t) => !existing.has(t.trim().toLowerCase()))
                      .map((line) => ({ text: line, attribution: resolved }));
                    if (inputs.length > 0) {
                      onChange(addIdeateQuotes({ v: 1, quotes }, inputs).quotes);
                    }
                    onClose();
                  }}
                  className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
                >
                  Add selected ({selected.size})
                </button>
              </div>
            </div>
          ) : !loading ? (
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="self-start rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              Back
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "original" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (editing) {
              onChange(
                patchIdeateQuote({ v: 1, quotes }, editing.id, {
                  text,
                  attribution: attribution.trim() ? attribution : null,
                }).quotes,
              );
            } else {
              const next = addIdeateQuote(
                { v: 1, quotes },
                { text, attribution },
              );
              if (next.quotes.length === quotes.length) return;
              onChange(next.quotes);
            }
            onClose();
          }}
        >
          <label className="sr-only" htmlFor="foundations-quote-text">
            Quote
          </label>
          <textarea
            id="foundations-quote-text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A line that keeps you oriented…"
            rows={3}
            maxLength={400}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 font-display text-xl outline-none ring-accent/30 focus:ring-2"
          />
          <label className="sr-only" htmlFor="foundations-quote-attr">
            Attribution
          </label>
          <input
            id="foundations-quote-attr"
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            placeholder="Attribution (optional)"
            maxLength={80}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm outline-none ring-accent/30 focus:ring-2"
          />
          <div className="flex gap-2">
            {editing ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={!text.trim()}
              className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
            >
              {editing ? "Save" : "Add"}
            </button>
          </div>
        </form>
      ) : null}
    </EditorShell>
  );
}

export function AddQuestionDialog({
  open,
  questions,
  onClose,
  onChange,
}: {
  open: boolean;
  questions: IdeateReflectionQuestion[];
  onClose: () => void;
  onChange: (next: IdeateReflectionQuestion[]) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const presets = availablePresets({ v: 1, questions });

  useEffect(() => {
    if (!open) return;
    setWriting(false);
    setDraft("");
  }, [open]);

  return (
    <EditorShell open={open} title="Add a question" onClose={onClose}>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-border">
        {presets.length === 0 ? (
          <li className="px-3 py-2.5 text-sm text-muted">
            All suggested questions are already added.
          </li>
        ) : (
          presets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(addPresetQuestion({ v: 1, questions }, p.id).questions);
                  onClose();
                }}
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm text-foreground hover:bg-accent-soft/25"
              >
                <span className="min-w-0 flex-1 leading-snug">{p.text}</span>
                <span className="shrink-0 text-base font-medium text-accent-link" aria-hidden>
                  +
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="mt-3">
        {writing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const next = addCustomQuestion({ v: 1, questions }, draft);
              if (next.questions.length === questions.length) return;
              onChange(next.questions);
              onClose();
            }}
            className="flex flex-col gap-2"
          >
            <label className="sr-only" htmlFor="foundations-custom-q">
              Write your own question
            </label>
            <input
              id="foundations-custom-q"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Your question…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-accent/30 focus:ring-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWriting(false);
                  setDraft("");
                }}
                className="rounded-full px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-full accent-fill-gradient px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="cursor-pointer text-sm font-semibold text-accent-link"
          >
            Write your own
          </button>
        )}
      </div>
    </EditorShell>
  );
}

export function AnswerQuestionDialog({
  question,
  questions,
  onClose,
  onChange,
}: {
  question: IdeateReflectionQuestion | null;
  questions: IdeateReflectionQuestion[];
  onClose: () => void;
  onChange: (next: IdeateReflectionQuestion[]) => void;
}) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(question?.answer ?? "");
  }, [question]);

  return (
    <EditorShell
      open={Boolean(question)}
      title={question?.text ?? "Question"}
      onClose={onClose}
    >
      {question?.description ? (
        <p className="-mt-2 mb-3 text-sm text-muted">{question.description}</p>
      ) : null}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write freely — no need to polish."
        rows={8}
        autoFocus
        className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none ring-accent/25 focus:ring-2"
      />
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (!question) return;
            onChange(
              removeIdeateReflectionQuestion(
                { v: 1, questions },
                question.id,
              ).questions,
            );
            onClose();
          }}
          className="cursor-pointer text-sm font-medium text-muted hover:text-foreground"
        >
          Remove question
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-accent-soft/30 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!question) return;
              onChange(
                patchQuestionAnswer(
                  { v: 1, questions },
                  question.id,
                  draft,
                ).questions,
              );
              onClose();
            }}
            className="rounded-full accent-fill-gradient px-4 py-2 text-sm font-medium text-on-accent"
          >
            Save
          </button>
        </div>
      </div>
    </EditorShell>
  );
}

export function EditQuestionDialog({
  question,
  questions,
  onClose,
  onChange,
}: {
  question: IdeateReflectionQuestion | null;
  questions: IdeateReflectionQuestion[];
  onClose: () => void;
  onChange: (next: IdeateReflectionQuestion[]) => void;
}) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(question?.text ?? "");
  }, [question]);

  return (
    <EditorShell open={Boolean(question)} title="Edit question" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!question) return;
          onChange(
            patchQuestionText({ v: 1, questions }, question.id, draft).questions,
          );
          onClose();
        }}
      >
        <label className="sr-only" htmlFor="foundations-edit-question">
          Question
        </label>
        <textarea
          id="foundations-edit-question"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-lg outline-none ring-accent/30 focus:ring-2"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-full accent-fill-gradient px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </EditorShell>
  );
}
