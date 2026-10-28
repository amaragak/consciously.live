"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import {
  makeImportFileCard,
  processImportBatch,
  revokeImportFileCard,
  type ImportFileCard,
} from "@/lib/journal-import/batch";
import { OCR_LOW_CONFIDENCE, type OcrWord } from "@/lib/journal-import/ocr-browser";
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

type Step = "add" | "review" | "done";

const MIST =
  "inline-flex h-10 items-center justify-center rounded-full border border-[#AFC2DC] px-5 text-[14px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE =
  "inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-[14px] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50";

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

export function JournalImportWorkspace() {
  const [step, setStep] = useState<Step>("add");
  const [cards, setCards] = useState<ImportFileCard[]>([]);
  const [rows, setRows] = useState<JournalImportPreviewRow[]>([]);
  const [existing, setExisting] = useState<JournalEntry[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [readingLabel, setReadingLabel] = useState<string | null>(null);
  const [keepPhotos, setKeepPhotos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doneSummary, setDoneSummary] = useState<{
    imported: number;
    skippedDup: number;
    leftOut: number;
    range: string | null;
    batchId: string;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef({ cancelled: false });
  const draftsByFileId = useRef(new Map<string, JournalImportDraft[]>());
  const processingRef = useRef(false);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  useEffect(() => {
    setExisting(withoutDemoJournalEntries(loadJournalStoreRaw()).entries);
    return () => {
      cancelRef.current.cancelled = true;
      for (const c of cardsRef.current) revokeImportFileCard(c);
    };
  }, []);

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
        // final.drafts only includes files processed in this pass (were queued).
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
        // Nudge a re-render so a mid-pass queue can start.
        setCards((prev) => prev.slice());
      });
  }, [cards]);

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
      setDoneSummary({
        imported: imported.length,
        skippedDup,
        leftOut,
        range,
        batchId,
      });
      setStep("done");
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
          className="flex w-[140px] shrink-0 flex-col gap-1.5 sm:w-[152px]"
        >
          <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-[#F6F1E7]">
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
            {card.status === "ready" ? (
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[#E7F0E4] px-2 py-0.5 text-[11px] font-semibold text-[#2F6B3A]">
                ✓ Ready
              </span>
            ) : null}
            {card.status === "reading" ? (
              <span className="absolute bottom-2 left-2 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                Reading…
              </span>
            ) : null}
            {card.status === "error" ? (
              <span className="absolute bottom-2 left-2 rounded-full bg-[#F8E8E4] px-2 py-0.5 text-[11px] font-semibold text-[#9B3B2E]">
                Error
              </span>
            ) : null}
          </div>
          <p className="truncate text-[12.5px] font-medium text-foreground">
            {card.file.name}
          </p>
          <p className="text-[12px] text-muted">{card.label}</p>
          {card.error ? (
            <p className="text-[11.5px] leading-snug text-[#9B3B2E]">{card.error}</p>
          ) : null}
        </div>
      )),
    [cards],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
            Journal
          </p>
          <h1 className="font-display text-[28px] font-normal text-foreground md:text-[32px]">
            Import
          </h1>
        </div>
        <Link to="/journal/entries" className="text-[13px] font-semibold text-muted">
          Close
        </Link>
      </div>

      {step === "add" ? (
        <section className="rounded-[22px] border border-border bg-card p-5 shadow-[0_2px_14px_rgba(15,27,45,0.05)] md:p-6">
          <h2 className="font-display text-[22px] text-foreground">
            Bring in your old journal
          </h2>
          <p className="mt-1 max-w-xl text-[14px] text-muted">
            Nothing is saved until you’ve checked it in the next step.
          </p>

          <div
            className="mt-5 rounded-2xl border border-dashed border-border bg-[#FFFDF8] px-4 py-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <p className="text-[15px] text-foreground">
              Drop files here, or choose them
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Day One, PDF, text, or photos of handwritten pages — mixed is fine.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className={MIST}
                style={PRIMARY_ACCENT_FILL_STYLE}
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
            <div className="mt-5 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {fileGrid}
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 text-[13px] text-[#9B3B2E]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-[13px] text-muted">
              {readingLabel ||
                (readyCount
                  ? `${readyCount} ready${queuedCount || readingCount ? " · still reading…" : ""}`
                  : "Add files to begin")}
            </p>
            <div className="flex flex-wrap gap-2">
              {busy ? (
                <button
                  type="button"
                  className={OUTLINE}
                  onClick={() => {
                    cancelRef.current.cancelled = true;
                  }}
                >
                  Cancel
                </button>
              ) : null}
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
        </section>
      ) : null}

      {step === "review" && row ? (
        <section className="flex min-h-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="text-[13px] font-semibold text-accent-link"
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
              Import {includedCount} {includedCount === 1 ? "entry" : "entries"}
            </button>
          </div>

          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-[18px] border border-border bg-card p-2">
              {rows.map((r, i) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left ${
                      i === active ? "bg-accent-soft" : "hover:bg-background"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => updateRow(i, { include: e.target.checked })}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-muted">
                        {r.created_at
                          ? formatJournalEntryDate(r.created_at)
                          : "No date found"}
                      </span>
                      <span className="block truncate text-[13.5px] font-semibold text-foreground">
                        {r.title?.trim() || firstLine(r.body) || "Untitled"}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">
                        {firstLine(r.body)}
                      </span>
                      {r.date_uncertain || !r.created_at ? (
                        <span className="mt-0.5 block text-[12px] text-[#9B3B2E]">
                          Using the file’s date
                        </span>
                      ) : null}
                      {r.likelyDuplicate ? (
                        <span className="mt-0.5 block text-[12px] text-muted">
                          Possible duplicate
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="rounded-[18px] border border-border bg-card p-4 md:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[13px]">
                  <span className="font-semibold text-foreground">Date</span>
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
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  />
                </label>
                <label className="block text-[13px]">
                  <span className="font-semibold text-foreground">Title</span>
                  <input
                    type="text"
                    value={row.title ?? ""}
                    onChange={(e) => updateRow(active, { title: e.target.value })}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  />
                </label>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">
                From {sourceFileLabel(row)} · {sourceKindLabel(row)}
              </p>

              {pageImage ? (
                <img
                  src={pageImage}
                  alt="Source page"
                  className="mt-3 max-h-56 w-full rounded-xl border border-border object-contain bg-[#F6F1E7]"
                />
              ) : null}

              <label className="mt-3 block text-[13px]">
                <span className="font-semibold text-foreground">Entry</span>
                <textarea
                  value={row.body}
                  onChange={(e) => updateRow(active, { body: e.target.value })}
                  rows={10}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[14.5px] leading-relaxed text-foreground"
                />
              </label>

              {ocrSpans.some(
                (w) =>
                  w.confidence != null && w.confidence < OCR_LOW_CONFIDENCE,
              ) ? (
                <p className="mt-2 text-[12.5px] text-[#9B3B2E]">
                  Some words were read with low confidence — edit anything that
                  looks off.{" "}
                  <span className="text-muted">
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

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={OUTLINE}
                  disabled={active >= rows.length - 1}
                  onClick={() => mergeWithNext(active)}
                >
                  Merge with next
                </button>
                <button
                  type="button"
                  className={OUTLINE}
                  onClick={() => splitHere(active)}
                >
                  Split here
                </button>
                <button
                  type="button"
                  className={OUTLINE}
                  onClick={() => updateRow(active, { include: false })}
                >
                  Leave out
                </button>
              </div>

              <label className="mt-4 flex items-center gap-2 text-[13.5px] text-foreground">
                <input
                  type="checkbox"
                  checked={keepPhotos}
                  onChange={(e) => setKeepPhotos(e.target.checked)}
                />
                Keep the page photos with their entries
              </label>

              {error ? (
                <p className="mt-3 text-[13px] text-[#9B3B2E]" role="alert">
                  {error}
                </p>
              ) : null}

              <p className="mt-4 text-[12.5px] text-muted md:hidden">
                {active + 1} of {rows.length}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {step === "done" && doneSummary ? (
        <section className="rounded-[22px] border border-border bg-card px-5 py-8 text-center shadow-[0_2px_14px_rgba(15,27,45,0.05)] md:px-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#E7F0E4] text-[#2F6B3A]">
            <svg
              width="22"
              height="22"
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
          </div>
          <h2 className="mt-4 font-display text-[24px] text-foreground">
            {doneSummary.imported}{" "}
            {doneSummary.imported === 1 ? "entry" : "entries"} imported
            {doneSummary.range ? `. ${doneSummary.range}` : ""}, on their
            original dates
            {doneSummary.skippedDup
              ? ` · ${doneSummary.skippedDup} left out as ${
                  doneSummary.skippedDup === 1 ? "a duplicate" : "duplicates"
                }`
              : doneSummary.leftOut
                ? ` · ${doneSummary.leftOut} left out`
                : ""}
            .
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-[14px] text-muted">
            They’re in your entries with an Imported chip, and Insights will
            include them.
          </p>
          <Link
            to={`/journal/entries?imported=${encodeURIComponent(doneSummary.batchId)}`}
            className={`${MIST} mt-6 inline-flex`}
            style={PRIMARY_ACCENT_FILL_STYLE}
          >
            See them in Entries
          </Link>
        </section>
      ) : null}
    </div>
  );
}
