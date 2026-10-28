"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import {
  makeImportFileCard,
  processImportBatch,
  revokeImportFileCard,
  type ImportFileCard,
} from "@/lib/journal-import/batch";
import {
  OCR_LOW_CONFIDENCE,
  type OcrWord,
} from "@/lib/journal-import/ocr-browser";
import {
  flagDuplicates,
  mergeImportedEntries,
  previewRowsToEntries,
} from "@/lib/journal-import/pipeline";
import type {
  JournalImportDraft,
  JournalImportPreviewRow,
} from "@/lib/journal-import/types";
import {
  formatJournalEntryDate,
  loadJournalStoreRaw,
  saveJournalStore,
  withoutDemoJournalEntries,
  type JournalEntry,
} from "@/lib/journal-storage";
import { putJournalStoreRemote } from "@/lib/medimade-api";

type Step = "add" | "review";

export type JournalImportDoneSummary = {
  imported: number;
  skippedDup: number;
  leftOut: number;
  range: string | null;
  batchId: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (summary: JournalImportDoneSummary) => void;
};

const MIST =
  "inline-flex h-11 items-center justify-center rounded-full border border-[#AFC2DC] px-5 text-[14px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE =
  "inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-[14px] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50";
const GHOST =
  "inline-flex h-10 items-center justify-center rounded-full px-3 text-[14px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function spansFromMeta(meta: Record<string, unknown>): OcrWord[] {
  const raw = meta.ocr_spans;
  if (!Array.isArray(raw)) return [];
  const out: OcrWord[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text) continue;
    out.push({
      text: o.text,
      confidence: typeof o.confidence === "number" ? o.confidence : null,
    });
  }
  return out;
}

function firstLine(body: string): string {
  return body.trim().split(/\n/)[0]?.trim() ?? "";
}

function sourceFileLabel(row: JournalImportPreviewRow): string {
  const meta = row.source_metadata;
  if (typeof meta.filename === "string") return meta.filename;
  if (Array.isArray(meta.filenames) && typeof meta.filenames[0] === "string") {
    return meta.filenames[0];
  }
  return sourceKindLabel(row);
}

function sourceKindLabel(row: JournalImportPreviewRow): string {
  if (row.source === "day_one") return "Day One";
  if (row.source === "handwritten_photo") {
    return row.source_metadata.pdf_mode === "scanned"
      ? "Scanned PDF"
      : "Handwritten page";
  }
  if (row.source === "pdf_annotations") return "Typed PDF";
  if (row.source === "plaintext") return "Text file";
  return "Text file";
}

function StepIndicator({ step }: { step: Step }) {
  const addActive = step === "add";
  const reviewActive = step === "review";
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-2">
        <span
          className={`flex size-6 items-center justify-center rounded-full text-[12px] font-semibold ${
            addActive
              ? "bg-[#C8A46A] text-[#0F1B2D]"
              : "border border-[#E6D3AE] bg-[#F6EEDD] text-[#8A6424]"
          }`}
        >
          {addActive ? (
            "1"
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12l5 5 9-10" />
            </svg>
          )}
        </span>
        <span
          className={`text-[14px] ${
            addActive ? "font-semibold text-foreground" : "font-medium text-muted"
          }`}
        >
          Add files
        </span>
      </span>
      <span className="h-px w-10 bg-border" aria-hidden />
      <span className="inline-flex items-center gap-2">
        <span
          className={`flex size-6 items-center justify-center rounded-full text-[12px] font-semibold ${
            reviewActive
              ? "bg-[#C8A46A] text-[#0F1B2D]"
              : "border border-border text-muted"
          }`}
        >
          2
        </span>
        <span
          className={`text-[14px] ${
            reviewActive
              ? "font-semibold text-foreground"
              : "font-medium text-muted"
          }`}
        >
          Review
        </span>
      </span>
    </div>
  );
}

export function JournalImportWorkspace({ open, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("add");
  const [cards, setCards] = useState<ImportFileCard[]>([]);
  const [rows, setRows] = useState<JournalImportPreviewRow[]>([]);
  const [existing, setExisting] = useState<JournalEntry[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [readingLabel, setReadingLabel] = useState<string | null>(null);
  const [keepPhotos, setKeepPhotos] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef({ cancelled: false });
  const draftsByFileId = useRef(new Map<string, JournalImportDraft[]>());
  const processingRef = useRef(false);
  const cardsRef = useRef(cards);
  const importedRef = useRef(false);
  cardsRef.current = cards;

  const reset = useCallback(() => {
    cancelRef.current.cancelled = true;
    for (const c of cardsRef.current) revokeImportFileCard(c);
    setStep("add");
    setCards([]);
    setRows([]);
    setActive(0);
    setBusy(false);
    setReadingLabel(null);
    setKeepPhotos(true);
    setError(null);
    draftsByFileId.current.clear();
    processingRef.current = false;
    importedRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    cancelRef.current = { cancelled: false };
    setExisting(withoutDemoJournalEntries(loadJournalStoreRaw()).entries);
  }, [open, reset]);

  const requestClose = useCallback(() => {
    const dirty = cardsRef.current.length > 0 && !importedRef.current;
    if (
      dirty &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Leave without importing? Nothing has been saved yet.",
      )
    ) {
      return;
    }
    cancelRef.current.cancelled = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  const readyCount = cards.filter((c) => c.status === "ready").length;
  const readingCount = cards.filter((c) => c.status === "reading").length;
  const queuedCount = cards.filter((c) => c.status === "queued").length;
  const includedCount = rows.filter((r) => r.include).length;
  const draftCount = [...draftsByFileId.current.values()].reduce(
    (n, d) => n + d.length,
    0,
  );

  const addFiles = useCallback((list: File[]) => {
    if (!list.length) return;
    setError(null);
    setCards((prev) => [...prev, ...list.map(makeImportFileCard)]);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (processingRef.current) return;
    if (!cards.some((c) => c.status === "queued")) return;

    processingRef.current = true;
    cancelRef.current = { cancelled: false };
    setBusy(true);
    setReadingLabel("Reading…");

    const snapshot = cardsRef.current;
    const knownReady = new Set(
      snapshot.filter((c) => c.status === "ready").map((c) => c.id),
    );

    void processImportBatch(
      snapshot,
      (state) => {
        setCards((prev) => {
          const byId = new Map(state.cards.map((c) => [c.id, c]));
          return prev.map((c) => byId.get(c.id) ?? c);
        });
        setReadingLabel(
          state.readingTotal
            ? `Reading ${state.readingIndex} of ${state.readingTotal} files…`
            : null,
        );
      },
      cancelRef.current,
    )
      .then((final) => {
        let offset = 0;
        for (const card of final.cards) {
          if (knownReady.has(card.id)) continue;
          if (card.status !== "ready" || card.draftCount <= 0) continue;
          draftsByFileId.current.set(
            card.id,
            final.drafts.slice(offset, offset + card.draftCount),
          );
          offset += card.draftCount;
        }
        setCards((prev) => {
          const byId = new Map(final.cards.map((c) => [c.id, c]));
          return prev.map((c) => byId.get(c.id) ?? c);
        });
      })
      .finally(() => {
        processingRef.current = false;
        setBusy(false);
        setReadingLabel(null);
        setCards((prev) => prev.slice());
      });
  }, [cards, open]);

  function goReview() {
    const drafts = [...draftsByFileId.current.values()].flat();
    if (!drafts.length) {
      setError("Nothing ready to review yet.");
      return;
    }
    setRows(flagDuplicates(drafts, existing));
    setActive(0);
    setStep("review");
    setError(null);
  }

  function updateRow(index: number, patch: Partial<JournalImportPreviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function mergeWithNext(index: number) {
    setRows((prev) => {
      const a = prev[index];
      const b = prev[index + 1];
      if (!a || !b) return prev;
      const merged: JournalImportPreviewRow = {
        ...a,
        body: `${a.body.trim()}\n\n${b.body.trim()}`.trim(),
        title: a.title || b.title,
        created_at: a.created_at || b.created_at,
        date_uncertain: a.date_uncertain && b.date_uncertain,
        media_refs: [...a.media_refs, ...b.media_refs],
        include: a.include || b.include,
        likelyDuplicate: a.likelyDuplicate && b.likelyDuplicate,
        duplicateHint: a.duplicateHint || b.duplicateHint,
      };
      return [...prev.slice(0, index), merged, ...prev.slice(index + 2)];
    });
  }

  function splitHere(index: number) {
    setRows((prev) => {
      const row = prev[index];
      if (!row) return prev;
      const mid = Math.floor(row.body.length / 2);
      const left = row.body.slice(0, mid).trim();
      const right = row.body.slice(mid).trim();
      if (!left || !right) return prev;
      const a: JournalImportPreviewRow = { ...row, body: left, key: `${row.key}_a` };
      const b: JournalImportPreviewRow = {
        ...row,
        body: right,
        title: firstLine(right) || row.title,
        media_refs: [],
        key: `${row.key}_b`,
        include: true,
        likelyDuplicate: false,
        duplicateHint: null,
      };
      return [...prev.slice(0, index), a, b, ...prev.slice(index + 1)];
    });
  }

  async function commit() {
    const toSave = rows.filter((r) => r.include);
    if (!toSave.length) {
      setError("Tick at least one entry to import.");
      return;
    }
    if (toSave.some((r) => !r.created_at)) {
      setError("A few pages still need a date. Fill those in, or leave them out.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const batchId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `imp_${Date.now()}`;
      const imported = previewRowsToEntries(rows, batchId, { keepPhotos });
      const store = withoutDemoJournalEntries(loadJournalStoreRaw());
      const nextStore = {
        ...store,
        entries: mergeImportedEntries(store.entries, imported),
      };
      saveJournalStore(nextStore);
      if (isMedimadeSessionActive()) {
        void putJournalStoreRemote(nextStore).catch(() => undefined);
      }
      const skippedDup = rows.filter((r) => !r.include && r.likelyDuplicate).length;
      const leftOut = rows.filter((r) => !r.include).length;
      const times = imported
        .map((e) => new Date(e.createdAt).getTime())
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      let range: string | null = null;
      if (times.length) {
        const a = new Date(times[0]!).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        const b = new Date(times[times.length - 1]!).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        range = a === b ? a : `${a} – ${b}`;
      }
      const summary: JournalImportDoneSummary = {
        imported: imported.length,
        skippedDup,
        leftOut,
        range,
        batchId,
      };
      importedRef.current = true;
      onImported(summary);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save those entries.");
    } finally {
      setBusy(false);
    }
  }

  const row = rows[active] ?? null;
  const ocrSpans = row ? spansFromMeta(row.source_metadata) : [];
  const pageImage =
    row?.media_refs.find((s) => s.startsWith("data:image")) ?? null;

  const fileGrid = useMemo(
    () =>
      cards.map((card) => (
        <div
          key={card.id}
          className="flex w-[140px] shrink-0 flex-col gap-1.5 sm:w-[150px]"
        >
          <div className="relative h-[110px] overflow-hidden rounded-[10px] border border-border bg-[#F6F1E7]">
            {card.previewUrl ? (
              <img
                src={card.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center text-[12px] text-muted">
                {card.file.name}
              </div>
            )}
          </div>
          <p className="truncate text-[12.5px] text-foreground">{card.file.name}</p>
          <p className="text-[11.5px] font-semibold text-[#8A6424]">{card.label}</p>
          {card.status === "ready" ? (
            <p className="inline-flex items-center gap-1 text-[12px] text-[#5F7350]">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12l5 5 9-10" />
              </svg>
              Read
            </p>
          ) : null}
          {card.status === "reading" || card.status === "queued" ? (
            <span className="h-1 overflow-hidden rounded bg-border">
              <span
                className="block h-full bg-[#C8A46A] transition-[width]"
                style={{
                  width: card.status === "reading" ? "60%" : "20%",
                }}
              />
            </span>
          ) : null}
          {card.error ? (
            <p className="text-[11.5px] leading-snug text-[#9B3B2E]">{card.error}</p>
          ) : null}
        </div>
      )),
    [cards],
  );

  if (!open || typeof document === "undefined") return null;

  const panelWidth =
    step === "review"
      ? "w-full max-w-[min(1120px,calc(100vw-2rem))]"
      : "w-full max-w-[760px]";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-center bg-[rgba(15,27,45,0.45)] p-0 sm:items-center sm:p-6"
      role="presentation"
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-import-modal-title"
        className={`flex h-full max-h-none flex-col overflow-hidden rounded-none border-0 bg-[#F6F1E7] shadow-[0_30px_80px_rgba(15,27,45,0.35)] sm:h-auto sm:max-h-[min(900px,calc(100vh-3rem))] sm:rounded-[22px] sm:border sm:border-border ${panelWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-5 sm:px-6">
          <StepIndicator step={step} />
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-black/5 hover:text-foreground"
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {step === "add" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
            <div>
              <h2
                id="journal-import-modal-title"
                className="font-display text-[26px] font-normal text-foreground"
              >
                Bring in your old journal
              </h2>
              <p className="mt-1 text-[15px] text-muted">
                Nothing is saved until you’ve checked it in the next step.
              </p>
            </div>

            <div
              className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-dashed border-[#E6D3AE] bg-white px-4 py-4 sm:flex-row sm:items-center sm:gap-3.5 sm:px-[18px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#F6EEDD] text-[#8A6424]">
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold text-foreground">
                  Drop files here, or choose them
                </p>
                <p className="mt-0.5 text-[13.5px] text-muted">
                  Photos of handwritten pages, PDFs (typed or scanned), text
                  files (.txt, .md, .docx) or a Day One export (.zip). We work
                  out which is which.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                <button
                  type="button"
                  className={OUTLINE}
                  onClick={() => fileRef.current?.click()}
                >
                  Choose files
                </button>
                <button
                  type="button"
                  className={OUTLINE}
                  onClick={() => cameraRef.current?.click()}
                >
                  Take photos
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".zip,.json,.pdf,.md,.markdown,.txt,.text,.docx,image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>

            {cards.length > 0 ? (
              <div className="flex gap-3.5 overflow-x-auto rounded-2xl border-[1.5px] border-dashed border-[#E6D3AE] bg-[#F6EEDD] p-[18px] [scrollbar-width:thin]">
                {fileGrid}
              </div>
            ) : null}

            {error ? (
              <p className="text-[13px] text-[#9B3B2E]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <p className="text-[13.5px] text-muted">
                  {readingLabel ||
                    (readyCount
                      ? `${readyCount} ready${
                          queuedCount || readingCount ? " · still reading…" : ""
                        }`
                      : "Add files to begin")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={GHOST} onClick={requestClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={MIST}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  disabled={draftCount === 0 && readyCount === 0}
                  onClick={goReview}
                >
                  Review what’s ready
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "review" && row ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-0 pt-2 sm:px-6">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:gap-3.5">
              <div className="flex max-h-[40vh] w-full shrink-0 flex-col overflow-hidden border-b border-border pb-3 lg:max-h-none lg:w-[380px] lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3.5">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-[14px] font-semibold text-foreground">
                    {rows.length} {rows.length === 1 ? "entry" : "entries"} found
                  </span>
                  <span className="text-[12.5px] text-muted">
                    {includedCount} selected
                  </span>
                </div>
                <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                  {rows.map((r, i) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        onClick={() => setActive(i)}
                        className={`flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left ${
                          i === active
                            ? "border border-[#E6D3AE] bg-[#FFFDF8] shadow-[inset_3px_0_0_#C8A46A]"
                            : "border border-transparent hover:bg-[#FFFDF8]/60"
                        } ${!r.include ? "opacity-55" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) =>
                            updateRow(i, { include: e.target.checked })
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[12.5px] font-semibold ${
                                !r.created_at || r.date_uncertain
                                  ? "text-[#9A4B2E]"
                                  : "text-[#8A6424]"
                              }`}
                            >
                              {r.created_at
                                ? formatJournalEntryDate(r.created_at)
                                : "No date found"}
                            </span>
                            {!r.created_at || r.date_uncertain ? (
                              <span className="inline-flex h-[22px] items-center rounded-full bg-[#F6E7DD] px-2 text-[11.5px] font-semibold text-[#9A4B2E]">
                                Using the photo’s date
                              </span>
                            ) : null}
                            {r.likelyDuplicate ? (
                              <span className="inline-flex h-[22px] items-center rounded-full bg-[#F6E7DD] px-2 text-[11.5px] font-semibold text-[#9A4B2E]">
                                Possible duplicate
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[14.5px] font-semibold text-foreground">
                            {r.title?.trim() || firstLine(r.body) || "Untitled"}
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] text-muted">
                            {firstLine(r.body)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-3 pl-0.5">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <input
                    type="date"
                    value={isoToDateInput(row.created_at)}
                    onChange={(e) => {
                      const iso = dateInputToIso(e.target.value);
                      updateRow(active, {
                        created_at: iso,
                        date_uncertain: !iso,
                      });
                    }}
                    className="h-9 shrink-0 rounded-[10px] border border-border bg-white px-3 text-[14px] text-foreground"
                  />
                  <input
                    type="text"
                    value={row.title ?? ""}
                    onChange={(e) => updateRow(active, { title: e.target.value })}
                    className="h-9 min-w-0 flex-1 rounded-[10px] border border-border bg-white px-3 text-[14px] font-semibold text-foreground"
                    placeholder="Title"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[12.5px] text-muted">
                    From {sourceFileLabel(row)} · {sourceKindLabel(row)}
                    {row.source === "handwritten_photo" ? " · Haiku" : ""}
                  </p>
                </div>

                <div className="flex min-h-0 flex-col gap-3.5 md:flex-row">
                  {pageImage ? (
                    <div className="relative w-full shrink-0 overflow-hidden rounded-xl border border-border bg-[#F7EFDF] md:w-[44%]">
                      <img
                        src={pageImage}
                        alt="Source page"
                        className="max-h-64 w-full object-contain md:max-h-[min(420px,50vh)]"
                      />
                      <span className="absolute bottom-2.5 left-2.5 inline-flex h-6 items-center rounded-full bg-[rgba(15,27,45,0.7)] px-2 text-[11.5px] text-white">
                        {sourceFileLabel(row)}
                      </span>
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={row.body}
                      onChange={(e) => updateRow(active, { body: e.target.value })}
                      rows={pageImage ? 12 : 16}
                      className="h-full min-h-[180px] w-full rounded-xl border border-border bg-white px-4 py-3.5 text-[15px] leading-[1.65] text-foreground"
                    />
                  </div>
                </div>

                {ocrSpans.some(
                  (w) =>
                    w.confidence != null && w.confidence < OCR_LOW_CONFIDENCE,
                ) ? (
                  <p className="flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-3.5 bg-[#F6E7DD] [border-bottom:1.5px_dotted_#9A4B2E]" />
                      Not sure of this word: tap to fix
                    </span>
                    <span className="text-[#9A4B2E]">
                      (
                      {ocrSpans
                        .filter(
                          (w) =>
                            w.confidence != null &&
                            w.confidence < OCR_LOW_CONFIDENCE,
                        )
                        .slice(0, 8)
                        .map((w) => w.text)
                        .join(", ")}
                      )
                    </span>
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3.5 text-[13px] font-semibold text-foreground">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 disabled:opacity-40"
                    disabled={active >= rows.length - 1}
                    onClick={() => mergeWithNext(active)}
                  >
                    Merge with next
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5"
                    onClick={() => splitHere(active)}
                  >
                    Split here
                  </button>
                  <button
                    type="button"
                    className="ml-auto font-medium text-muted"
                    onClick={() => updateRow(active, { include: false })}
                  >
                    Leave out
                  </button>
                </div>

                {error ? (
                  <p className="text-[13px] text-[#9B3B2E]" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border py-3.5">
              <label className="inline-flex items-center gap-2.5 text-[14px] text-foreground">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={keepPhotos}
                  onChange={(e) => setKeepPhotos(e.target.checked)}
                />
                <span
                  className={`relative inline-block h-[22px] w-[38px] shrink-0 rounded-full ${
                    keepPhotos ? "bg-[#0F1B2D]" : "bg-border"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`absolute top-[3px] size-4 rounded-full bg-white transition-[left] ${
                      keepPhotos ? "left-[18px]" : "left-[3px]"
                    }`}
                  />
                </span>
                Keep the page photos with their entries
              </label>
              <button
                type="button"
                className={`${GHOST} ml-auto`}
                onClick={() => setStep("add")}
              >
                Back
              </button>
              <button
                type="button"
                className={MIST}
                style={PRIMARY_ACCENT_FILL_STYLE}
                disabled={busy || includedCount === 0}
                onClick={() => void commit()}
              >
                Import {includedCount}{" "}
                {includedCount === 1 ? "entry" : "entries"}
              </button>
            </div>
          </div>
        ) : null}

        {step === "review" && !row ? (
          <div className="px-6 py-10 text-center text-[14px] text-muted">
            No entries to review.{" "}
            <button
              type="button"
              className="font-semibold text-accent-link"
              onClick={() => setStep("add")}
            >
              Add files
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
