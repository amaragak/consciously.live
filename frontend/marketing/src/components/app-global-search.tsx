"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  isMedimadeSessionActive,
  listLibraryPrograms,
  searchUserContentRemote,
  type LibraryProgram,
  type UserContentSearchHit,
} from "@/lib/medimade-api";

const TYPE_LABEL: Record<string, string> = {
  gratitude: "Gratitude",
  journal: "Journal",
  meditation: "Meditation",
  program: "Program",
  life_area: "Life area",
  goal: "Goal",
  todo: "To Do",
  value: "Value",
  regret: "Regret",
  quote: "Quote",
  manifesto: "Manifesto",
  vision: "Vision",
  resistance: "Resistance",
  action: "Quick link",
};

type QuickAction = {
  id: string;
  title: string;
  body: string;
  href: string;
  keywords: string[];
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "create-meditation",
    title: "Create meditation",
    body: "Start a new guided meditation",
    href: "/meditate/create",
    keywords: ["create", "meditation", "meditate", "new", "make"],
  },
  {
    id: "add-journal",
    title: "Add journal entry",
    body: "Write a new journal entry",
    href: "/journal/my?new=1",
    keywords: ["journal", "entry", "write", "new", "add", "note"],
  },
  {
    id: "vision-board",
    title: "Open vision board",
    body: "Manifest · vision board",
    href: "/manifest/my/vision-board",
    keywords: ["vision", "board", "manifest", "ideate", "dream"],
  },
  {
    id: "new-gratitude",
    title: "Add gratitude",
    body: "Log something you’re grateful for",
    href: "/journal/my/gratitudes?new=1",
    keywords: ["gratitude", "grateful", "thanks"],
  },
  {
    id: "insights",
    title: "Open insights",
    body: "Letters and patterns from your journal",
    href: "/journal/my/insights",
    keywords: ["insights", "letter", "patterns", "reflect"],
  },
  {
    id: "library",
    title: "Open library",
    body: "Your meditations and programs",
    href: "/meditate/library/creations",
    keywords: ["library", "listen", "creations", "programs"],
  },
  {
    id: "focus",
    title: "Open focus timer",
    body: "Timer and tasks",
    href: "/focus",
    keywords: ["focus", "timer", "pomodoro", "tasks"],
  },
];

function slugifyProgramTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "program";
}

function programUrlSlug(program: LibraryProgram, all: LibraryProgram[]): string {
  const base = slugifyProgramTitle(program.title);
  const collisions = all.filter((p) => slugifyProgramTitle(p.title) === base);
  if (collisions.length <= 1) return base;
  const idx = collisions.findIndex((p) => p.id === program.id);
  return idx > 0 ? `${base}-${idx + 1}` : base;
}

function matchesQuery(text: string, q: string): boolean {
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserContentSearchHit[]>([]);
  const [programs, setPrograms] = useState<LibraryProgram[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const programsLoaded = useRef(false);
  const panelId = useId();
  const signedIn = isMedimadeSessionActive();
  const query = q.trim().toLowerCase();

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    const update = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      setPanelPos({
        top: r.bottom + 7,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || programsLoaded.current) return;
    programsLoaded.current = true;
    void listLibraryPrograms()
      .then((rows) => setPrograms(rows))
      .catch(() => {
        /* optional */
      });
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (query.length < 2) {
      setHits([]);
      setError(null);
      setBusy(false);
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
  }, [query, open, signedIn]);

  const filteredActions = useMemo(() => {
    if (!query) return QUICK_ACTIONS;
    return QUICK_ACTIONS.filter(
      (a) =>
        matchesQuery(a.title, query) ||
        matchesQuery(a.body, query) ||
        a.keywords.some((k) => k.includes(query) || query.includes(k)),
    );
  }, [query]);

  const programHits = useMemo(() => {
    if (!query || query.length < 2) return [];
    return programs
      .filter(
        (p) =>
          matchesQuery(p.title, query) || matchesQuery(p.description, query),
      )
      .slice(0, 8)
      .map((p) => ({
        objectID: `program:${p.id}`,
        type: "program",
        title: p.title,
        body: p.description,
        href: `/meditate/library/programs/${encodeURIComponent(
          programUrlSlug(p, programs),
        )}`,
        ...(p.coverImageUrl?.trim()
          ? { imageUrl: p.coverImageUrl.trim() }
          : {}),
      }));
  }, [programs, query]);

  const contentHits = useMemo(() => {
    const fromApi = hits.filter((h) =>
      [
        "journal",
        "gratitude",
        "meditation",
        "life_area",
        "goal",
        "vision",
        "manifesto",
        "todo",
        "value",
        "regret",
        "quote",
        "resistance",
      ].includes(h.type),
    );
    return [...programHits, ...fromApi].slice(0, 24);
  }, [hits, programHits]);

  function close() {
    setOpen(false);
    setQ("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const first =
      filteredActions[0] ??
      (contentHits[0] ? { href: contentHits[0]!.href } : null);
    if (!first) return;
    close();
    router.push(first.href);
  }

  return (
    // Root width is always the icon button — the field expands left out of
    // flow so search↔bell spacing stays identical to bell↔menu.
    <div ref={rootRef} className="relative flex shrink-0 items-center">
      <form
        onSubmit={onSubmit}
        className={`absolute right-full top-1/2 mr-1 flex -translate-y-1/2 items-center overflow-hidden transition-[width,opacity] duration-200 ease-out ${
          open
            ? "w-[min(52vw,16.5rem)] opacity-100 sm:w-[18rem]"
            : "pointer-events-none w-0 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          aria-label="Search journal, meditations, programs…"
          aria-controls={panelId}
          aria-expanded={open}
          tabIndex={open ? 0 : -1}
          className="app-search-input h-9 w-full min-w-0 rounded-full border border-[rgb(246_241_231_/_0.18)] bg-white/[0.08] py-0 pl-3.5 pr-9 text-sm text-nav-foreground outline-none placeholder:text-nav-muted focus:border-[rgb(246_241_231_/_0.35)] focus:bg-white/[0.12] hybrid:border-border hybrid:bg-background hybrid:text-foreground hybrid:placeholder:text-muted hybrid:focus:border-accent/40"
        />
        {open && q ? (
          <button
            type="button"
            aria-label="Clear search"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-[#A39C8C] text-[#1E2530] transition-colors hover:bg-[#8A8478]"
          >
            <svg
              viewBox="0 0 12 12"
              width="8"
              height="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M3 3l6 6M9 3L3 9" />
            </svg>
          </button>
        ) : null}
      </form>

      <button
        type="button"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-nav-muted transition-colors hover:bg-nav-active hover:text-nav-foreground"
        aria-label={open ? "Close search" : "Search"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        title="Search (⌘K)"
      >
        <IconSearch />
      </button>

      {open && panelPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="listbox"
              aria-label="Search results"
              style={{
                position: "fixed",
                top: panelPos.top,
                right: panelPos.right,
              }}
              className="z-[300] w-[min(calc(100vw-1.25rem),22rem)] overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
            >
          <div className="max-h-[min(70vh,26rem)] overflow-y-auto p-2">
            {filteredActions.length > 0 ? (
              <div className="mb-1">
                <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Quick links
                </p>
                <ul className="flex flex-col gap-0.5">
                  {filteredActions.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={a.href}
                        className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-accent-soft"
                        onClick={close}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {TYPE_LABEL.action}
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {a.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{a.body}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {query.length >= 2 ? (
              <div className="mt-1 border-t border-border-subtle pt-1">
                <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Your content
                </p>
                {busy ? (
                  <p className="px-2 py-3 text-sm text-muted">Searching…</p>
                ) : null}
                {error ? (
                  <p className="px-2 py-3 text-sm text-danger">{error}</p>
                ) : null}
                {!busy && !error && contentHits.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted">No matches</p>
                ) : null}
                <ul className="flex flex-col gap-0.5">
                  {contentHits.map((h) => (
                    <li key={h.objectID}>
                      <Link
                        href={h.href}
                        className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent-soft"
                        onClick={close}
                      >
                        {h.imageUrl ? (
                          <span className="mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-md bg-surface-2">
                            <img
                              src={h.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1">
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
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="px-2.5 py-2 text-xs text-muted">
                Search journal entries, meditations, programs, life areas, and
                goals — or pick a quick link above.
              </p>
            )}
          </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
