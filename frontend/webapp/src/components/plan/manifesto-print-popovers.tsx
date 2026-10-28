import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ImagePlus, Loader2, Plus } from "lucide-react";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import { useMinWidth } from "@/hooks/use-min-width";
import type { IdeateReflectionQuestion } from "@/lib/ideate-reflection-questions";
import type { VisionBoardItem } from "@/lib/ideate-vision-board";

/* --------------------------------------------------------------- shared UI */

const FIELD_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted focus:ring-2";
const LABEL_CLASS =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[1.4px] text-muted";

function PrimaryButton({
  children,
  disabled,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="accent-fill-gradient inline-flex h-9 cursor-pointer items-center justify-center rounded-full px-4 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 cursor-pointer items-center rounded-full px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- popover */

/**
 * Small popover anchored to an element (desktop); a bottom sheet below `md`.
 * Closes on outside press and Escape.
 */
export function AnchoredPopover({
  anchor,
  onClose,
  width = 320,
  label,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  width?: number;
  label: string;
  children: ReactNode;
}) {
  const wide = useMinWidth(768);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!wide) return;
    const place = () => {
      const el = ref.current;
      if (!el || !anchor) return;
      const r = anchor.getBoundingClientRect();
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(8, Math.min(left, vw - width - 8));
      let top = r.bottom + 8;
      if (top + h > vh - 8) top = Math.max(8, r.top - h - 8);
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, wide, width]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDown, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  if (!wide) {
    return createPortal(
      <div
        className="fixed inset-0 z-[210] flex items-end bg-overlay/45 backdrop-blur-[2px]"
        role="presentation"
        onClick={onClose}
      >
        <div
          ref={ref}
          role="dialog"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-6 shadow-xl"
        >
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="fixed z-[210] max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-[0_12px_40px_rgba(30,37,48,0.18)]"
      style={{
        width,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------- text edit / add */

/** Inline text field in a small popover, with Save and Cancel. */
export function TextEditPopover({
  anchor,
  title,
  value,
  placeholder,
  multiline = false,
  submitLabel = "Save",
  allowEmpty = false,
  maxLength,
  onSave,
  onClose,
}: {
  anchor: HTMLElement | null;
  title: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  submitLabel?: string;
  /** Allow saving an empty string (clears an optional field). */
  allowEmpty?: boolean;
  /** Hard character cap (shows a counter when set). */
  maxLength?: number;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const canSave = allowEmpty || draft.trim().length > 0;
  const setCapped = (next: string) => {
    setDraft(
      typeof maxLength === "number" ? next.slice(0, maxLength) : next,
    );
  };
  const submit = () => {
    if (!canSave) return;
    onSave(draft);
  };
  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label={title}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className={LABEL_CLASS}>{title}</span>
          {multiline ? (
            <textarea
              autoFocus
              rows={4}
              maxLength={maxLength}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setCapped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              className={`${FIELD_CLASS} resize-none leading-relaxed`}
            />
          ) : (
            <input
              autoFocus
              maxLength={maxLength}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setCapped(e.target.value)}
              className={FIELD_CLASS}
            />
          )}
        </label>
        <div className="flex items-center justify-end gap-1">
          {typeof maxLength === "number" ? (
            <span
              className={`mr-auto text-[11px] tabular-nums ${
                draft.length >= maxLength ? "text-accent" : "text-muted"
              }`}
            >
              {draft.length}/{maxLength}
            </span>
          ) : null}
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={!canSave}>
            {submitLabel}
          </PrimaryButton>
        </div>
      </form>
    </AnchoredPopover>
  );
}

/* --------------------------------------------------------------- note menu */

/** Pencil on a note: Edit / Remove from print. */
export function NoteMenuPopover({
  anchor,
  onEdit,
  onRemoveFromPrint,
  onClose,
}: {
  anchor: HTMLElement | null;
  onEdit: () => void;
  onRemoveFromPrint: () => void;
  onClose: () => void;
}) {
  const item =
    "w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent-soft/40";
  return (
    <AnchoredPopover
      anchor={anchor}
      onClose={onClose}
      width={200}
      label="Note options"
    >
      <div role="menu" className="-m-2 flex flex-col gap-0.5">
        <button type="button" role="menuitem" onClick={onEdit} className={item}>
          Edit
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onRemoveFromPrint}
          className={item}
        >
          Remove from print
        </button>
      </div>
    </AnchoredPopover>
  );
}

/** Click a life-area print image: promote to main (large / leading) tile. */
export function ImageMenuPopover({
  anchor,
  isMain,
  onUseAsMain,
  onClose,
}: {
  anchor: HTMLElement | null;
  isMain: boolean;
  onUseAsMain: () => void;
  onClose: () => void;
}) {
  const item =
    "w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent-soft/40 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent";
  return (
    <AnchoredPopover
      anchor={anchor}
      onClose={onClose}
      width={220}
      label="Image options"
    >
      <div role="menu" className="-m-2 flex flex-col gap-0.5">
        <button
          type="button"
          role="menuitem"
          disabled={isMain}
          onClick={onUseAsMain}
          className={item}
        >
          {isMain ? "Main image" : "Use as main image"}
        </button>
      </div>
    </AnchoredPopover>
  );
}

/* ---------------------------------------------------------------- add note */

type NoteTab = "quote" | "answer";

export type NoteEditTarget =
  | { kind: "quote"; id: string; text: string; source: string }
  | { kind: "answer"; id: string };

/** Add (or edit) a note: Quote tab (text + source) or Answer a question. */
export function NotePopover({
  anchor,
  questions,
  editing,
  onSaveQuote,
  onSaveAnswer,
  onClose,
}: {
  anchor: HTMLElement | null;
  questions: IdeateReflectionQuestion[];
  editing?: NoteEditTarget | null;
  onSaveQuote: (input: { id: string | null; text: string; source: string }) => void;
  onSaveAnswer: (input: { id: string; answer: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<NoteTab>(
    editing?.kind === "answer" ? "answer" : "quote",
  );
  const [text, setText] = useState(editing?.kind === "quote" ? editing.text : "");
  const [source, setSource] = useState(
    editing?.kind === "quote" ? editing.source : "",
  );
  const [questionId, setQuestionId] = useState<string | null>(
    editing?.kind === "answer" ? editing.id : null,
  );
  const picked = questions.find((q) => q.id === questionId) ?? null;
  const [answer, setAnswer] = useState(picked?.answer ?? "");

  const isEdit = Boolean(editing);
  const lockedTab = isEdit; // editing a note keeps its kind

  return (
    <AnchoredPopover
      anchor={anchor}
      onClose={onClose}
      width={340}
      label={isEdit ? "Edit note" : "Add a note"}
    >
      <div className="flex flex-col gap-3">
        {lockedTab ? null : (
          <SegmentedPillTabs<NoteTab>
            aria-label="Note type"
            value={tab}
            onChange={setTab}
            equalWidth
            options={[
              { id: "quote", label: "Quote" },
              { id: "answer", label: "Answer a question" },
            ]}
          />
        )}

        {tab === "quote" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              onSaveQuote({
                id: editing?.kind === "quote" ? editing.id : null,
                text,
                source,
              });
            }}
          >
            <label className="block">
              <span className={LABEL_CLASS}>Quote</span>
              <textarea
                autoFocus
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="A line you want to keep close"
                className={`${FIELD_CLASS} resize-none leading-relaxed`}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Source (optional)</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Who said it"
                className={FIELD_CLASS}
              />
            </label>
            <div className="flex items-center justify-end gap-1">
              <GhostButton onClick={onClose}>Cancel</GhostButton>
              <PrimaryButton type="submit" disabled={!text.trim()}>
                {isEdit ? "Save" : "Add"}
              </PrimaryButton>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            {!picked ? (
              questions.length === 0 ? (
                <p className="text-sm text-muted">
                  You haven’t added any questions yet. Add one from the Edit
                  view, then answer it here.
                </p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                  {questions.map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setQuestionId(q.id);
                          setAnswer(q.answer);
                        }}
                        className="flex w-full cursor-pointer items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent-soft/40"
                      >
                        <span className="min-w-0">{q.text}</span>
                        {q.answer.trim() ? (
                          <span className="shrink-0 text-[11px] font-semibold text-accent-link">
                            answered
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!answer.trim()) return;
                  onSaveAnswer({ id: picked.id, answer });
                }}
              >
                <label className="block">
                  <span className={LABEL_CLASS}>{picked.text}</span>
                  <textarea
                    autoFocus
                    rows={4}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Write freely — no need to polish."
                    className={`${FIELD_CLASS} resize-none leading-relaxed`}
                  />
                </label>
                <div className="flex items-center justify-between gap-1">
                  {isEdit ? (
                    <span />
                  ) : (
                    <GhostButton onClick={() => setQuestionId(null)}>
                      Back
                    </GhostButton>
                  )}
                  <div className="flex items-center gap-1">
                    <GhostButton onClick={onClose}>Cancel</GhostButton>
                    <PrimaryButton type="submit" disabled={!answer.trim()}>
                      {isEdit ? "Save" : "Add"}
                    </PrimaryButton>
                  </div>
                </div>
              </form>
            )}
            {!picked ? (
              <div className="flex justify-end">
                <GhostButton onClick={onClose}>Cancel</GhostButton>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AnchoredPopover>
  );
}

/* ------------------------------------------------------------- add life area */

/** Name + dream only; "Full setup ›" creates the area and opens its page. */
export function AddAreaPopover({
  anchor,
  onCreate,
  onFullSetup,
  onClose,
}: {
  anchor: HTMLElement | null;
  onCreate: (input: { title: string; dream: string }) => void;
  onFullSetup: (input: { title: string; dream: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dream, setDream] = useState("");
  const canSave = title.trim().length > 0;
  return (
    <AnchoredPopover
      anchor={anchor}
      onClose={onClose}
      width={340}
      label="Add a life area"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onCreate({ title, dream });
        }}
      >
        <label className="block">
          <span className={LABEL_CLASS}>Name</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Music, Health, This app"
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>Dream</span>
          <textarea
            rows={3}
            value={dream}
            onChange={(e) => setDream(e.target.value)}
            placeholder="Say it messy. No one is grading this."
            className={`${FIELD_CLASS} resize-none leading-relaxed`}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onFullSetup({ title, dream })}
            className="inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-semibold text-accent-link transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Full setup
            <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-1">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton type="submit" disabled={!canSave}>
              Add
            </PrimaryButton>
          </div>
        </div>
      </form>
    </AnchoredPopover>
  );
}

/* ------------------------------------------------------------ add image sheet */

/**
 * "Choose from your Vision board" (multi-select) + "Upload". The chosen
 * images get the area's id in `lifeAreaIds`.
 */
export function AddImageSheet({
  areaTitle,
  areaId,
  items,
  urls,
  uploading,
  uploadError,
  onUpload,
  onConfirm,
  onClose,
}: {
  areaTitle: string;
  areaId: string;
  items: VisionBoardItem[];
  urls: Record<string, string>;
  uploading: boolean;
  uploadError: string | null;
  onUpload: (file: File) => void;
  onConfirm: (selectedItemIds: string[]) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const candidates = useMemo(
    () =>
      items.filter(
        (i) => urls[i.id] && !(i.lifeAreaIds ?? []).includes(areaId),
      ),
    [items, urls, areaId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-overlay/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="manifesto-add-image-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(88vh,40rem)] w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <h2
          id="manifesto-add-image-title"
          className="font-display text-xl font-medium text-foreground"
        >
          Add an image to {areaTitle}
        </h2>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className={`${LABEL_CLASS} mb-0`}>
            Choose from your Vision board
          </span>
          {selected.size > 0 ? (
            <span className="text-xs text-muted">{selected.size} selected</span>
          ) : null}
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              {items.some((i) => urls[i.id])
                ? "Every Vision board image is already on this area."
                : "No Vision board images yet. Upload one below."}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {candidates.map((item) => {
                const on = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                      className={`relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border-2 transition-[border-color,box-shadow] ${
                        on
                          ? "border-accent shadow-[0_0_0_2px_var(--accent-soft)]"
                          : "border-transparent hover:border-accent/40"
                      }`}
                    >
                      <img
                        src={urls[item.id]}
                        alt={item.label}
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      {on ? (
                        <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <ImagePlus aria-hidden className="size-4" strokeWidth={1.75} />
            )}
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {uploadError ? (
            <p className="text-xs text-danger" role="alert">
              {uploadError}
            </p>
          ) : null}
          <div className="mt-1 flex items-center justify-end gap-1">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton
              disabled={selected.size === 0}
              onClick={() => onConfirm([...selected])}
            >
              <Plus aria-hidden className="mr-1 size-3.5" strokeWidth={2} />
              Add {selected.size > 0 ? selected.size : ""} to print
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
