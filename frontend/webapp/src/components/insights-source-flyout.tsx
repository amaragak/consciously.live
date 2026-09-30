import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deriveEntryTitle,
  formatJournalEntryDate,
  JOURNAL_STORE_CHANGED,
  loadJournalStore,
  stripHtmlToText,
  type JournalEntry,
} from "@/lib/journal-storage";
import {
  isJournalMoodId,
  journalMoodLabel,
  JOURNAL_MOOD_PILL,
} from "@/lib/journal-moods";
import {
  quoteWithContext,
  type InsightSourceRef,
} from "@/lib/insight-sources";

export type InsightsFlyoutEntry = {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  mood?: string | null;
  /** Mood came from Insights inference, not a user journal tag. */
  moodInferred?: boolean;
  quote?: string;
};

type Props = {
  sources?: InsightSourceRef[];
  /** Convenience when only ids are known (no quotes). */
  entryIds?: string[];
  entries?: InsightsFlyoutEntry[];
  header?: string;
  footerHref?: string;
  footerLabel?: string;
  /** Custom trigger; defaults to a text chip. */
  children?: ReactNode;
  className?: string;
  /** Accessible name for the trigger when children are not self-labelled. */
  triggerLabel?: string;
  /** If set, primary click navigates here (hover still opens the flyout). */
  clickHref?: string;
};

function resolveSources(
  sources?: InsightSourceRef[],
  entryIds?: string[],
): InsightSourceRef[] {
  if (sources?.length) return sources;
  if (entryIds?.length) {
    return [...new Set(entryIds.filter(Boolean))].map((entryId) => ({
      entryId,
    }));
  }
  return [];
}

function entryHref(id: string, quote?: string): string {
  const base = `/journal/my/${encodeURIComponent(id)}`;
  if (!quote?.trim()) return base;
  return `${base}?highlight=${encodeURIComponent(quote.trim())}`;
}

function useHoverCapable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setOk(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return ok;
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return narrow;
}

/**
 * Shared Insights v8 source flyout — hover (pointer) + click/keyboard;
 * bottom sheet on small screens.
 */
export function InsightsSourceFlyout({
  sources: sourcesProp,
  entryIds,
  entries: entriesProp,
  header,
  footerHref,
  footerLabel,
  children,
  className = "",
  triggerLabel,
  clickHref,
}: Props) {
  const sources = useMemo(
    () => resolveSources(sourcesProp, entryIds),
    [sourcesProp, entryIds],
  );
  const [open, setOpen] = useState(false);
  const [storeTick, setStoreTick] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const listId = useId();
  const hoverCapable = useHoverCapable();
  const narrow = useIsNarrow();
  const navigate = useNavigate();

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
    const out: Array<{
      ref: InsightSourceRef;
      full?: JournalEntry;
      meta?: InsightsFlyoutEntry;
    }> = [];
    for (const ref of sources) {
      const full = storeById.get(ref.entryId);
      if (!full && !entriesProp?.some((e) => e.id === ref.entryId)) {
        // Deleted entry — skip
        continue;
      }
      const meta = entriesProp?.find((e) => e.id === ref.entryId);
      let quote = ref.quote;
      if (quote && full) {
        const plain = stripHtmlToText(full.contentHtml);
        if (!quoteWithContext(plain, quote)) quote = undefined;
      }
      out.push({ ref: { ...ref, quote }, full, meta });
    }
    return out;
  }, [sources, storeById, entriesProp]);

  const clearTimers = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    hoverTimer.current = null;
    leaveTimer.current = null;
  };

  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const openNow = useCallback(() => {
    clearTimers();
    setOpen(true);
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

  useEffect(() => {
    if (!open || narrow) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger) return;
    const tr = trigger.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    let top = tr.bottom + 8;
    let left = tr.left;
    if (left + pr.width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - pr.width - 12);
    }
    if (top + pr.height > window.innerHeight - 12) {
      top = Math.max(12, tr.top - pr.height - 8);
    }
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }, [open, narrow, resolved.length]);

  if (resolved.length === 0) return null;

  const defaultChip =
    triggerLabel ||
    (resolved.length === 1
      ? (() => {
          const iso =
            resolved[0]?.meta?.createdAt ?? resolved[0]?.full?.createdAt ?? "";
          if (!iso) return "1 entry";
          try {
            return new Date(iso).toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
            });
          } catch {
            return "1 entry";
          }
        })()
      : `${resolved.length} entries`);

  const onTriggerEnter = () => {
    if (!hoverCapable) return;
    clearTimers();
    hoverTimer.current = window.setTimeout(() => openNow(), 150);
  };
  const onTriggerLeave = () => {
    if (!hoverCapable) return;
    clearTimers();
    leaveTimer.current = window.setTimeout(() => setOpen(false), 200);
  };

  const panel = open ? (
    <div
      ref={panelRef}
      id={listId}
      role="dialog"
      aria-label={header || "Source journal entries"}
      onMouseEnter={() => {
        if (!hoverCapable) return;
        clearTimers();
      }}
      onMouseLeave={onTriggerLeave}
      className={
        narrow
          ? "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-border bg-card p-3 shadow-xl"
          : "fixed z-50 w-[min(340px,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-2 shadow-lg"
      }
    >
      {narrow ? (
        <div className="mb-2 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
      ) : null}
      {header ? (
        <p className="mb-2 px-2 text-xs font-medium text-muted">{header}</p>
      ) : null}
      <ul className="max-h-72 list-none overflow-y-auto p-0">
        {resolved.map(({ ref, full, meta }) => {
          const title =
            meta?.title?.trim() ||
            full?.title?.trim() ||
            (full ? deriveEntryTitle(full.contentHtml) : "Untitled entry");
          const iso = meta?.createdAt ?? full?.createdAt ?? "";
          const date = iso ? formatJournalEntryDate(iso) : "—";
          const moodId =
            (meta?.mood && isJournalMoodId(meta.mood) && meta.mood) ||
            (!meta?.moodInferred &&
              full?.mood &&
              isJournalMoodId(full.mood) &&
              full.mood) ||
            null;
          const moodInferred = Boolean(meta?.moodInferred && moodId);
          const plain = full ? stripHtmlToText(full.contentHtml) : "";
          const ctx =
            ref.quote && plain
              ? quoteWithContext(plain, ref.quote)
              : null;
          const preview =
            !ctx && plain
              ? plain.length > 120
                ? `${plain.slice(0, 117)}…`
                : plain
              : "";
          return (
            <li key={`${ref.entryId}-${ref.quote ?? ""}`} className="border-b border-border/50 last:border-b-0">
              <Link
                to={entryHref(ref.entryId, ref.quote)}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent-soft/40 focus:bg-accent-soft/40 focus:outline-none"
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">{date}</span>
                  {moodId ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: JOURNAL_MOOD_PILL[moodId].background,
                        color: JOURNAL_MOOD_PILL[moodId].color,
                      }}
                    >
                      {journalMoodLabel(moodId)}
                      {moodInferred ? " · inferred" : ""}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-foreground">
                  {title}
                </span>
                {ctx ? (
                  <span className="mt-0.5 line-clamp-3 block text-xs text-muted">
                    {ctx.before}
                    <mark className="rounded-sm bg-accent-soft/80 px-0.5 text-foreground">
                      {ctx.match}
                    </mark>
                    {ctx.after}
                  </span>
                ) : preview ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                    {preview}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {footerHref && footerLabel ? (
        <Link
          to={footerHref}
          onClick={() => setOpen(false)}
          className="mt-2 block px-2 py-1.5 text-xs font-medium text-accent-link hover:underline"
        >
          {footerLabel}
        </Link>
      ) : null}
    </div>
  ) : null;

  return (
    <span className={`relative inline-flex ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={typeof children === "string" ? undefined : triggerLabel || defaultChip}
        onClick={() => {
          if (clickHref) {
            navigate(clickHref);
            return;
          }
          open ? close() : openNow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open ? close() : openNow();
          }
        }}
        onMouseEnter={onTriggerEnter}
        onMouseLeave={onTriggerLeave}
        className="cursor-pointer text-left"
      >
        {children ?? (
          <span className="text-xs font-medium text-muted underline-offset-2 hover:text-accent-link hover:underline">
            {defaultChip}
          </span>
        )}
      </button>
      {narrow && open ? (
        <button
          type="button"
          aria-label="Close"
          className="fixed inset-0 z-40 bg-black/25"
          onClick={close}
        />
      ) : null}
      {panel}
    </span>
  );
}
