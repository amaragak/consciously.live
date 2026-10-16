import { useEffect, useMemo, useState } from "react";
import { GripVertical, MoreHorizontal, Pin } from "lucide-react";
import { IdeateCloudProvider, useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { QuoteComposerDialog } from "@/components/plan/manifesto-editors";
import { ManifestoSubpageHeader } from "@/components/plan/manifesto-section";
import {
  loadIdeateQuotesStore,
  removeIdeateQuote,
  saveIdeateQuotesStore,
  setIdeateQuotePinned,
  type IdeateQuote,
} from "@/lib/ideate-quotes";

const CARD =
  "relative flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-[0_2px_10px_rgba(15,27,45,0.04)]";

function clusterPinned(quotes: IdeateQuote[]): IdeateQuote[] {
  return [
    ...quotes.filter((q) => q.pinned),
    ...quotes.filter((q) => !q.pinned),
  ];
}

function moveItem(items: IdeateQuote[], fromId: string, toId: string): IdeateQuote[] {
  if (fromId === toId) return items;
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return clusterPinned(next);
}

function WordsPageBody() {
  const { ready, revision } = useIdeateCloud();
  const [quotes, setQuotes] = useState<IdeateQuote[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IdeateQuote | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setQuotes(clusterPinned(loadIdeateQuotesStore().quotes));
  }, [ready, revision]);

  function persist(next: IdeateQuote[]) {
    const ordered = clusterPinned(next);
    saveIdeateQuotesStore({ v: 1, quotes: ordered });
    setQuotes(ordered);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        (item.attribution ?? "").toLowerCase().includes(q),
    );
  }, [quotes, query]);

  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "center" });
  }, [ready, quotes]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <ManifestoSubpageHeader
        title="Words to keep"
        subline="Words you want to keep close."
        action={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setAdding(true);
            }}
            className="accent-fill-gradient inline-flex h-11 cursor-pointer items-center rounded-full px-[18px] text-sm font-semibold text-on-accent"
          >
            + Add quote
          </button>
        }
      />

      {quotes.length > 8 ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search quotes"
          aria-label="Search quotes"
          className="w-full max-w-md rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none ring-accent/30 focus:ring-2"
        />
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-[14px] text-foreground/80">
          {quotes.length === 0
            ? "No quotes yet. Add words that keep you steady."
            : "No quotes match that search."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {filtered.map((q) => (
            <li
              key={q.id}
              id={`quote-${q.id}`}
              className={`group ${CARD} scroll-mt-24`}
              onDragOver={(e) => {
                if (!searching) e.preventDefault();
              }}
              onDrop={(e) => {
                if (searching) return;
                e.preventDefault();
                const fromId = e.dataTransfer.getData("text/plain") || dragId;
                if (!fromId) return;
                persist(moveItem(quotes, fromId, q.id));
                setDragId(null);
              }}
            >
              <div className="absolute right-3 top-3 flex items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={Boolean(q.pinned)}
                  aria-label={q.pinned ? "Unpin quote" : "Pin quote"}
                  onClick={() =>
                    persist(
                      setIdeateQuotePinned({ v: 1, quotes }, q.id, !q.pinned)
                        .quotes,
                    )
                  }
                  className={`inline-flex size-[30px] cursor-pointer items-center justify-center rounded-full border ${
                    q.pinned
                      ? "border-transparent bg-accent-soft text-accent-link"
                      : "border-border bg-card text-muted hover:text-foreground"
                  }`}
                >
                  <Pin aria-hidden className="size-3.5" strokeWidth={1.75} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Quote actions"
                    aria-expanded={menuId === q.id}
                    onClick={() => setMenuId((id) => (id === q.id ? null : q.id))}
                    className="inline-flex size-[30px] cursor-pointer items-center justify-center rounded-full text-muted opacity-0 hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <MoreHorizontal aria-hidden className="size-4" />
                  </button>
                  {menuId === q.id ? (
                    <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                      <button
                        type="button"
                        className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                        onClick={() => {
                          setMenuId(null);
                          setAdding(false);
                          setEditing(q);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                        onClick={() => {
                          setMenuId(null);
                          persist(removeIdeateQuote({ v: 1, quotes }, q.id).quotes);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                draggable={!searching}
                aria-label="Drag to reorder"
                onDragStart={(e) => {
                  setDragId(q.id);
                  e.dataTransfer.setData("text/plain", q.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragId(null)}
                className="absolute left-2 top-3 flex h-8 w-6 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
              <p className="pr-16 pl-6 font-display text-[22px] font-normal italic leading-[1.42] text-foreground">
                &ldquo;{q.text}&rdquo;
              </p>
              {q.attribution?.trim() ? (
                <p className="pl-6 text-[13px] font-semibold text-accent-link">
                  — {q.attribution.trim()}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <QuoteComposerDialog
        open={adding || Boolean(editing)}
        quotes={quotes}
        editing={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onChange={persist}
      />
    </div>
  );
}

export function ManifestWordsPage() {
  return (
    <IdeateCloudProvider>
      <WordsPageBody />
    </IdeateCloudProvider>
  );
}
