"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SearchInput } from "@/components/search-input";
import {
  isMedimadeSessionActive,
  searchUserContentRemote,
  type UserContentSearchHit,
} from "@/lib/medimade-api";

const TYPE_LABEL: Record<string, string> = {
  gratitude: "Gratitude",
  journal: "Journal",
  meditation: "Meditation",
  life_area: "Life area",
  goal: "Goal",
  todo: "To Do",
  value: "Value",
  regret: "Regret",
  quote: "Quote",
  manifesto: "Manifesto",
  vision: "Vision",
  resistance: "Resistance",
};

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function AppGlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserContentSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const signedIn = isMedimadeSessionActive();

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    if (!signedIn) {
      setError("Sign in to search your content");
      setHits([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      void searchUserContentRemote(query)
        .then((rows) => {
          if (!cancelled) setHits(rows);
        })
        .catch((e) => {
          if (!cancelled) {
            setHits([]);
            setError(e instanceof Error ? e.message : "Search failed");
          }
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q, open, signedIn]);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-nav hover:text-foreground"
        aria-label="Search"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        title="Search (⌘K)"
      >
        <IconSearch />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center bg-foreground/20 px-3 pt-[12vh] backdrop-blur-[2px] sm:px-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            id={panelId}
            role="dialog"
            aria-label="Search your content"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
          >
            <div className="border-b border-border p-3">
              <SearchInput
                value={q}
                onChange={setQ}
                inputRef={inputRef}
                placeholder="Search journal, gratitudes, Manifest…"
                aria-label="Search query"
              />
            </div>
            <div className="max-h-[min(50vh,22rem)] overflow-y-auto p-2">
              {busy ? (
                <p className="px-2 py-3 text-sm text-muted">Searching…</p>
              ) : null}
              {error ? (
                <p className="px-2 py-3 text-sm text-danger">{error}</p>
              ) : null}
              {!busy && !error && q.trim().length >= 2 && hits.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted">No matches</p>
              ) : null}
              {!busy && q.trim().length < 2 ? (
                <p className="px-2 py-3 text-sm text-muted">
                  Type at least two characters. Results are limited to your
                  account.
                </p>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {hits.map((h) => (
                  <li key={h.objectID}>
                    <Link
                      href={h.href}
                      className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-accent-soft"
                      onClick={() => setOpen(false)}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {TYPE_LABEL[h.type] ?? h.type}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {h.title || "Untitled"}
                      </p>
                      {h.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                          {h.body}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
