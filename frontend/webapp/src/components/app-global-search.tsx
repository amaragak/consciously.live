"use client";

import { Link, useRouter } from "@/lib/spa-nav";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Book,
  Clock,
  Heart,
  LayoutGrid,
  MessageCircle,
  Sparkles,
  User,
} from "lucide-react";
import { formatDuration } from "@/components/library-meditation-card";
import {
  insightsCreateMeditationHref,
  writeInsightsMeditationPrompt,
} from "@/lib/insights-meditation-handoff";
import {
  isMedimadeSessionActive,
  listLibraryMeditations,
  listLibraryPrograms,
  searchUserContentRemote,
  type LibraryMeditationItem,
  type LibraryProgram,
  type UserContentSearchHit,
} from "@/lib/medimade-api";
import { loadJournalStore } from "@/lib/journal-storage";

type QuickAction = {
  id: string;
  title: string;
  body: string;
  href: string;
  keywords: string[];
  shortcut?: string;
  /** Primary create CTA — mist “+” chip. */
  primary?: boolean;
  icon: "plus" | "journal" | "heart" | "grid" | "sparkles" | "chat";
};

const EMPTY_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "create-meditation",
    title: "Create a meditation",
    body: "Meditate.",
    href: "/meditate/create",
    keywords: ["create", "meditation", "meditate", "new", "make"],
    shortcut: "↵",
    primary: true,
    icon: "plus",
  },
  {
    id: "add-journal",
    title: "New journal entry",
    body: "Journal.",
    href: "/journal/my?new=1",
    keywords: ["journal", "entry", "write", "new", "add", "note"],
    shortcut: "J",
    icon: "journal",
  },
  {
    id: "new-gratitude",
    title: "Add a gratitude",
    body: "Journal.",
    href: "/journal/my/gratitudes?new=1",
    keywords: ["gratitude", "grateful", "thanks"],
    shortcut: "G",
    icon: "heart",
  },
  {
    id: "vision-board",
    title: "Open vision board",
    body: "Manifest.",
    href: "/manifest/my/vision-board",
    keywords: ["vision", "board", "manifest", "ideate", "dream"],
    icon: "grid",
  },
  {
    id: "insights",
    title: "Open insights",
    body: "Journal · letters and patterns.",
    href: "/journal/my/insights",
    keywords: ["insights", "letter", "patterns", "reflect"],
    icon: "sparkles",
  },
];

type RecentItem = {
  id: string;
  title: string;
  body: string;
  href: string;
};

type FlyoutRow = {
  id: string;
  title: string;
  body: string;
  href: string;
  imageUrl?: string;
  icon?: QuickAction["icon"] | "clock" | "user";
  primary?: boolean;
  shortcut?: string;
  onNavigate?: () => void;
};

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

function highlightMatch(text: string, q: string): ReactNode {
  if (!q.trim()) return text;
  const lower = text.toLowerCase();
  const needle = q.trim().toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-gold/35 px-0.5 text-inherit">
        {text.slice(idx, idx + needle.length)}
      </mark>
      {highlightMatch(text.slice(idx + needle.length), q)}
    </>
  );
}

function formatRelativeDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
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

function MistPlusChip() {
  return (
    <span
      aria-hidden
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-on-accent shadow-[0_1px_4px_rgb(15_27_45_/_0.1)]"
      style={{
        backgroundColor: "var(--accent-button)",
        backgroundImage: "var(--accent-gradient-button)",
      }}
    >
      +
    </span>
  );
}

function SoftIcon({
  icon,
}: {
  icon: NonNullable<FlyoutRow["icon"]>;
}) {
  const cls = "size-4 text-muted";
  let glyph: ReactNode = null;
  if (icon === "journal") glyph = <Book className={cls} strokeWidth={1.75} />;
  else if (icon === "heart") glyph = <Heart className={cls} strokeWidth={1.75} />;
  else if (icon === "grid")
    glyph = <LayoutGrid className={cls} strokeWidth={1.75} />;
  else if (icon === "sparkles")
    glyph = <Sparkles className={cls} strokeWidth={1.75} />;
  else if (icon === "chat")
    glyph = <MessageCircle className={cls} strokeWidth={1.75} />;
  else if (icon === "clock") glyph = <Clock className={cls} strokeWidth={1.75} />;
  else if (icon === "user") glyph = <User className={cls} strokeWidth={1.75} />;
  else glyph = <Sparkles className={cls} strokeWidth={1.75} />;

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
      {glyph}
    </span>
  );
}

function SectionLabel({
  children,
  end,
}: {
  children: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-1 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        {children}
      </p>
      {end}
    </div>
  );
}

function ResultRow({
  row,
  active,
  query,
  onActivate,
}: {
  row: FlyoutRow;
  active: boolean;
  query: string;
  onActivate: () => void;
}) {
  return (
    <Link
      href={row.href}
      role="option"
      aria-selected={active}
      onClick={() => {
        row.onNavigate?.();
        onActivate();
      }}
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${
        active ? "bg-accent-soft/70" : "hover:bg-accent-soft/50"
      }`}
    >
      {row.primary ? (
        <MistPlusChip />
      ) : row.imageUrl ? (
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          <img
            src={row.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </span>
      ) : (
        <SoftIcon icon={row.icon ?? "sparkles"} />
      )}
      <span className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {highlightMatch(row.title, query)}
        </p>
        {row.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
            {highlightMatch(row.body, query)}
          </p>
        ) : null}
      </span>
      {row.shortcut ? (
        <kbd className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted">
          {row.shortcut}
        </kbd>
      ) : null}
    </Link>
  );
}

export function AppGlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserContentSearchHit[]>([]);
  const [programs, setPrograms] = useState<LibraryProgram[]>([]);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const catalogLoaded = useRef(false);
  const panelId = useId();
  const signedIn = isMedimadeSessionActive();
  const query = q.trim().toLowerCase();
  const rawQuery = q.trim();

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || catalogLoaded.current) return;
    catalogLoaded.current = true;
    void listLibraryPrograms()
      .then((rows) => setPrograms(rows))
      .catch(() => {
        /* optional */
      });
    void listLibraryMeditations()
      .then((rows: LibraryMeditationItem[]) => {
        const meds = rows
          .filter((m) => !m.isDraft && !m.archived)
          .sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || ""),
          )
          .slice(0, 4)
          .map((m) => ({
            id: `med-${m.sk || m.id || m.s3Key}`,
            title: m.title || "Meditation",
            body: [
              "Meditation",
              m.durationSeconds != null
                ? formatDuration(m.durationSeconds)
                : null,
              formatRelativeDay(m.createdAt),
            ]
              .filter(Boolean)
              .join(" · "),
            href: m.id
              ? `/meditate/library/creations?play=${encodeURIComponent(m.id)}`
              : "/meditate/library/creations",
          }));
        let journal: RecentItem[] = [];
        try {
          const store = loadJournalStore();
          journal = [...store.entries]
            .sort((a, b) =>
              (b.updatedAt || b.createdAt).localeCompare(
                a.updatedAt || a.createdAt,
              ),
            )
            .slice(0, 3)
            .map((e) => ({
              id: `j-${e.id}`,
              title: e.title?.trim() || "Journal entry",
              body: `Journal entry · ${formatRelativeDay(e.updatedAt || e.createdAt)}`,
              href: `/journal/my?entry=${encodeURIComponent(e.id)}`,
            }));
        } catch {
          /* ignore */
        }
        setRecents([...meds.slice(0, 2), ...journal.slice(0, 2)].slice(0, 4));
      })
      .catch(() => {
        try {
          const store = loadJournalStore();
          setRecents(
            [...store.entries]
              .sort((a, b) =>
                (b.updatedAt || b.createdAt).localeCompare(
                  a.updatedAt || a.createdAt,
                ),
              )
              .slice(0, 3)
              .map((e) => ({
                id: `j-${e.id}`,
                title: e.title?.trim() || "Journal entry",
                body: `Journal entry · ${formatRelativeDay(e.updatedAt || e.createdAt)}`,
                href: `/journal/my?entry=${encodeURIComponent(e.id)}`,
              })),
          );
        } catch {
          /* ignore */
        }
      });
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

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

  const programHits = useMemo(() => {
    if (!query || query.length < 2) return [] as FlyoutRow[];
    return programs
      .filter(
        (p) =>
          matchesQuery(p.title, query) || matchesQuery(p.description, query),
      )
      .slice(0, 6)
      .map((p) => ({
        id: `program:${p.id}`,
        title: p.title,
        body: p.description
          ? `Program · ${p.description}`
          : "Program",
        href: `/meditate/library/programs/${encodeURIComponent(
          programUrlSlug(p, programs),
        )}`,
        icon: "user" as const,
        ...(p.coverImageUrl?.trim()
          ? { imageUrl: p.coverImageUrl.trim() }
          : {}),
      }));
  }, [programs, query]);

  const meditationHits = useMemo(() => {
    if (query.length < 2) return [] as FlyoutRow[];
    return hits
      .filter((h) => h.type === "meditation")
      .slice(0, 8)
      .map((h) => ({
        id: h.objectID,
        title: h.title || "Untitled",
        body: h.body || "Meditation",
        href: h.href,
        icon: "user" as const,
        ...(h.imageUrl ? { imageUrl: h.imageUrl } : {}),
      }));
  }, [hits, query]);

  const journalHits = useMemo(() => {
    if (query.length < 2) return [] as FlyoutRow[];
    return hits
      .filter((h) => h.type === "journal" || h.type === "gratitude")
      .slice(0, 6)
      .map((h) => ({
        id: h.objectID,
        title: h.title || "Untitled",
        body: h.body || (h.type === "gratitude" ? "Gratitude" : "Journal entry"),
        href: h.href,
        icon: "journal" as const,
      }));
  }, [hits, query]);

  const askOrCreate = useMemo((): FlyoutRow[] => {
    if (!rawQuery) return [];
    const quoted = `'${rawQuery}'`;
    return [
      {
        id: "ask-create-meditation",
        title: `Create a meditation about ${quoted}`,
        body: "Meditate · opens Create with this filled in.",
        href: insightsCreateMeditationHref(),
        primary: true,
        onNavigate: () => {
          writeInsightsMeditationPrompt(
            `Please write a complete guided meditation about: ${rawQuery}`,
          );
        },
      },
      {
        id: "ask-chat",
        title: `Ask Chat about ${quoted}`,
        body: "Chat.",
        href: "/chat/my",
        icon: "chat",
      },
    ];
  }, [rawQuery]);

  const emptyQuickRows = useMemo(
    (): FlyoutRow[] =>
      EMPTY_QUICK_ACTIONS.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        href: a.href,
        icon: a.icon,
        primary: a.primary,
        shortcut: a.shortcut,
      })),
    [],
  );

  const recentRows = useMemo(
    (): FlyoutRow[] =>
      recents.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        href: r.href,
        icon: "clock",
      })),
    [recents],
  );

  const typing = query.length >= 2;
  const flatRows = useMemo(() => {
    if (!typing) return [...emptyQuickRows, ...recentRows];
    return [
      ...programHits,
      ...meditationHits,
      ...journalHits,
      ...askOrCreate,
    ];
  }, [
    typing,
    emptyQuickRows,
    recentRows,
    programHits,
    meditationHits,
    journalHits,
    askOrCreate,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) =>
          flatRows.length ? (i + 1) % flatRows.length : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          flatRows.length
            ? (i - 1 + flatRows.length) % flatRows.length
            : 0,
        );
        return;
      }
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "j") {
          e.preventDefault();
          close();
          router.push("/journal/my?new=1");
          return;
        }
        if (key === "g") {
          e.preventDefault();
          close();
          router.push("/journal/my/gratitudes?new=1");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, flatRows.length, typing, router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const row = flatRows[activeIndex] ?? flatRows[0];
    if (!row) return;
    row.onNavigate?.();
    close();
    router.push(row.href);
  }

  const meditationSeeAll =
    meditationHits.length > 2 ? meditationHits.length : 0;

  return (
    <div ref={rootRef} className="relative flex items-center justify-end">
      <form
        onSubmit={onSubmit}
        className={`relative flex items-center overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out ${
          open
            ? "mr-1 max-w-[min(52vw,16.5rem)] opacity-100 sm:max-w-[18rem]"
            : "mr-0 max-w-0 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or jump to…"
          aria-label="Search or jump to"
          aria-controls={panelId}
          aria-expanded={open}
          aria-activedescendant={
            flatRows[activeIndex]
              ? `${panelId}-opt-${flatRows[activeIndex]!.id}`
              : undefined
          }
          tabIndex={open ? 0 : -1}
          className="app-search-input h-9 w-[min(52vw,16.5rem)] min-w-[10rem] rounded-full border border-[rgb(246_241_231_/_0.18)] bg-white/[0.08] py-0 pl-3.5 pr-9 text-sm text-nav-foreground outline-none placeholder:text-nav-muted focus:border-[rgb(246_241_231_/_0.35)] focus:bg-white/[0.12] sm:w-[18rem] hybrid:border-border hybrid:bg-background hybrid:text-foreground hybrid:placeholder:text-muted hybrid:focus:border-accent/40"
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

      {open ? (
        <div
          id={panelId}
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 top-[calc(100%+0.45rem)] z-[220] w-[min(calc(100vw-1.25rem),24rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        >
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto px-1.5 pb-1.5 pt-1">
            {!typing ? (
              <>
                <SectionLabel>Quick actions</SectionLabel>
                <ul className="flex flex-col gap-0.5">
                  {emptyQuickRows.map((row, i) => (
                    <li key={row.id} id={`${panelId}-opt-${row.id}`}>
                      <ResultRow
                        row={row}
                        active={i === activeIndex}
                        query=""
                        onActivate={close}
                      />
                    </li>
                  ))}
                </ul>
                {recentRows.length > 0 ? (
                  <>
                    <SectionLabel>Recent</SectionLabel>
                    <ul className="flex flex-col gap-0.5">
                      {recentRows.map((row, i) => {
                        const idx = emptyQuickRows.length + i;
                        return (
                          <li key={row.id} id={`${panelId}-opt-${row.id}`}>
                            <ResultRow
                              row={row}
                              active={idx === activeIndex}
                              query=""
                              onActivate={close}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {busy ? (
                  <p className="px-2.5 py-3 text-sm text-muted">Searching…</p>
                ) : null}
                {error ? (
                  <p className="px-2.5 py-3 text-sm text-danger">{error}</p>
                ) : null}

                {programHits.length > 0 ? (
                  <>
                    <SectionLabel>Programs</SectionLabel>
                    <ul className="flex flex-col gap-0.5">
                      {programHits.map((row) => {
                        const idx = flatRows.findIndex((r) => r.id === row.id);
                        return (
                          <li key={row.id} id={`${panelId}-opt-${row.id}`}>
                            <ResultRow
                              row={row}
                              active={idx === activeIndex}
                              query={rawQuery}
                              onActivate={close}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}

                {meditationHits.length > 0 ? (
                  <>
                    <SectionLabel
                      end={
                        meditationSeeAll > 2 ? (
                          <Link
                            href="/meditate/library/creations"
                            onClick={close}
                            className="text-[11px] font-semibold text-accent-link hover:underline"
                          >
                            See all {meditationSeeAll}
                          </Link>
                        ) : null
                      }
                    >
                      Meditations
                    </SectionLabel>
                    <ul className="flex flex-col gap-0.5">
                      {meditationHits.slice(0, 2).map((row) => {
                        const idx = flatRows.findIndex((r) => r.id === row.id);
                        return (
                          <li key={row.id} id={`${panelId}-opt-${row.id}`}>
                            <ResultRow
                              row={row}
                              active={idx === activeIndex}
                              query={rawQuery}
                              onActivate={close}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}

                {journalHits.length > 0 ? (
                  <>
                    <SectionLabel>Journal entries</SectionLabel>
                    <ul className="flex flex-col gap-0.5">
                      {journalHits.map((row) => {
                        const idx = flatRows.findIndex((r) => r.id === row.id);
                        return (
                          <li key={row.id} id={`${panelId}-opt-${row.id}`}>
                            <ResultRow
                              row={row}
                              active={idx === activeIndex}
                              query={rawQuery}
                              onActivate={close}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}

                <SectionLabel>Ask or create</SectionLabel>
                <ul className="flex flex-col gap-0.5">
                  {askOrCreate.map((row) => {
                    const idx = flatRows.findIndex((r) => r.id === row.id);
                    return (
                      <li key={row.id} id={`${panelId}-opt-${row.id}`}>
                        <ResultRow
                          row={row}
                          active={idx === activeIndex}
                          query=""
                          onActivate={close}
                        />
                      </li>
                    );
                  })}
                </ul>

                {!busy &&
                !error &&
                programHits.length === 0 &&
                meditationHits.length === 0 &&
                journalHits.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-muted">
                    No matches in your library — create or ask instead.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle bg-surface-2/60 px-3 py-2 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1 font-sans">
                ↑
              </kbd>
              <kbd className="rounded border border-border bg-card px-1 font-sans">
                ↓
              </kbd>
              to move
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1 font-sans">
                ↵
              </kbd>
              to open
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1 font-sans">
                esc
              </kbd>
              to close
            </span>
            <span className="ml-auto inline-flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1 font-sans">
                ⌘K
              </kbd>
              anywhere
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
