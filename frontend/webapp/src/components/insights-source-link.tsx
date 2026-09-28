import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deriveEntryTitle,
  formatJournalEntryDate,
  JOURNAL_STORE_CHANGED,
  loadJournalStore,
  stripHtmlToText,
  type JournalEntry,
} from "@/lib/journal-storage";

export type InsightsSourceEntry = {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  bodyPreview?: string;
};

type Props = {
  entryIds: string[];
  entries?: InsightsSourceEntry[];
  className?: string;
};

function entryPreview(e: InsightsSourceEntry, full?: JournalEntry): string {
  if (e.bodyPreview?.trim()) return e.bodyPreview.trim();
  if (full?.contentHtml) {
    const t = stripHtmlToText(full.contentHtml);
    if (t) return t.length > 120 ? `${t.slice(0, 117)}…` : t;
  }
  return "";
}

function entryTitle(e: InsightsSourceEntry, full?: JournalEntry): string {
  const t = e.title?.trim();
  if (t) return t;
  if (full?.title?.trim()) return full.title.trim();
  if (full?.contentHtml) return deriveEntryTitle(full.contentHtml);
  return "Untitled entry";
}

function entryDate(e: InsightsSourceEntry, full?: JournalEntry): string {
  const iso = e.createdAt ?? full?.createdAt;
  if (!iso) return "—";
  return formatJournalEntryDate(iso);
}

function shortWeekdayDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return formatJournalEntryDate(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return formatJournalEntryDate(iso);
  }
}

function triggerLabel(
  ids: string[],
  resolved: Array<{ meta: InsightsSourceEntry; full?: JournalEntry }>,
): string {
  if (ids.length === 0) return "";
  if (ids.length === 1) {
    const row = resolved[0];
    const iso =
      row?.meta.createdAt ?? row?.full?.createdAt ?? "";
    if (iso) return shortWeekdayDate(iso);
    return "1 entry";
  }
  return `From ${ids.length} entries`;
}

export function InsightsSourceLink({
  entryIds,
  entries: entriesProp,
  className = "",
}: Props) {
  const ids = useMemo(
    () => [...new Set(entryIds.filter(Boolean))],
    [entryIds],
  );
  const [open, setOpen] = useState(false);
  const [storeTick, setStoreTick] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onStore = () => setStoreTick((t) => t + 1);
    window.addEventListener(JOURNAL_STORE_CHANGED, onStore);
    return () => window.removeEventListener(JOURNAL_STORE_CHANGED, onStore);
  }, []);

  const storeById = useMemo(() => {
    void storeTick;
    const map = new Map<string, JournalEntry>();
    for (const e of loadJournalStore().entries) {
      map.set(e.id, e);
    }
    return map;
  }, [storeTick]);

  const resolved = useMemo(() => {
    return ids.map((id) => {
      const fromProp = entriesProp?.find((e) => e.id === id);
      const full = storeById.get(id);
      const meta: InsightsSourceEntry = fromProp ?? { id };
      return { meta, full };
    });
  }, [ids, entriesProp, storeById]);

  const label = triggerLabel(ids, resolved);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        panelRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      ) {
        return;
      }
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (ids.length === 0 || !label) return null;

  return (
    <span className={`relative inline-flex ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer text-xs text-muted underline-offset-2 transition-colors hover:text-accent-link hover:underline"
      >
        {label}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={listId}
          role="dialog"
          aria-label="Source journal entries"
          className="absolute right-0 top-full z-40 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-2 shadow-lg"
        >
          <ul className="max-h-64 list-none overflow-y-auto p-0">
            {resolved.map(({ meta, full }) => {
              const title = entryTitle(meta, full);
              const preview = entryPreview(meta, full);
              const date = entryDate(meta, full);
              return (
                <li key={meta.id} className="border-b border-border/50 last:border-b-0">
                  <Link
                    to={`/journal/my/${encodeURIComponent(meta.id)}`}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent-soft/30"
                  >
                    <span className="block text-xs text-muted">{date}</span>
                    <span className="block text-sm font-medium text-foreground">
                      {title}
                    </span>
                    {preview ? (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                        {preview}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
