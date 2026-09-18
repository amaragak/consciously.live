import { useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JournalInsightsView } from "@/components/journal-insights-view";
import { scheduleJournalInsightsRefreshAfterLeavingEditor } from "@/components/journal-insights-autorefresh";
import {
  clearJournalRemoteSessionCache,
  markJournalStorePulledThisSession,
  wasJournalStorePulledThisSession,
} from "@/lib/journal-remote-cache";
import { JournalRichEditor } from "@/components/journal-rich-editor";
import { JournalGratitudeEditor } from "@/components/journal-gratitude-editor";
import { JournalEntryMeta } from "@/components/journal-entry-meta";
import { JournalSettingsDialog } from "@/components/journal-settings-dialog";
import { JournalImportDialog } from "@/components/journal-import-dialog";
import {
  mergeImportedEntries,
  previewRowsToEntries,
  type JournalImportPreviewRow,
} from "@/lib/journal-import";
import { SearchInput } from "@/components/search-input";
import { Calendar, Folder } from "lucide-react";
import { JournalLockGate } from "@/components/journal-lock-gate";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import {
  fetchJournalStoreRemote,
  getMedimadeApiBase,
  putJournalStoreRemote,
  runJournalInsightsRemote,
} from "@/lib/medimade-api";
import {
  sortByAlgoliaOrder,
  useUserContentSearchIds,
} from "@/lib/use-user-content-search";
import {
  emptyGratitudeLines,
  entriesForCloudPut,
  findGratitudeEntryForLocalDate,
  formatJournalEntryDate,
  gratitudeLinesToHtml,
  groupJournalEntriesByWeek,
  groupJournalEntriesForSidebar,
  deriveEntryTitle,
  isDemoJournalEntry,
  isDemoOnlyStore,
  isGratitudeEntry,
  journalEntryDraftChanged,
  journalEntryHasMeaningfulContent,
  journalEntryPlainForHandoff,
  armJournalMeditationHandoffJson,
  JOURNAL_MEDITATION_PAYLOAD_KEY,
  loadJournalStoreRaw,
  localDateKey,
  localDateKeyFromIso,
  mostRecentlyUpdatedId,
  mergeRemoteJournalKeepingLocalOnly,
  newGratitudeJournalEntry,
  newJournalEntry,
  newJournalFolder,
  pruneEmptyJournalEntries,
  readJournalStoreSnapshot,
  saveJournalStore,
  subscribeJournalStore,
  stripHtmlToText,
  withoutDemoJournalEntries,
  type JournalEntry,
  type JournalFolder,
  type JournalGratitudeLines,
  type JournalStoreV2,
} from "@/lib/journal-storage";
import {
  clearJournalEntryLiveTitle,
  setJournalEntryLiveTitle,
} from "@/lib/journal-entry-live-title";
import {
  journalMoodDotColor,
} from "@/lib/journal-moods";
import { journalEntriesLinkedToLifeArea } from "@/lib/plan-life-area-links";
import { loadPlanDreamsStore, type PlanDream } from "@/lib/plan-dreams";

const JOURNAL_SIDEBAR_COLLAPSED_KEY = "mm_journal_sidebar_collapsed";

function loadJournalSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(JOURNAL_SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveJournalSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      JOURNAL_SIDEBAR_COLLAPSED_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    /* */
  }
}

function JournalSidebarChevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

type JournalMainTab = "journal" | "gratitude";
type JournalSection = JournalMainTab | "insights";

const JOURNAL_SECTION_HREF = {
  journal: "/journal/my",
  gratitude: "/journal/my/gratitudes",
  insights: "/journal/my/insights",
} as const;

const JOURNAL_SECTION_TABS = [
  { id: "journal" as const, label: "Journal" },
  { id: "gratitude" as const, label: "Gratitudes" },
  { id: "insights" as const, label: "Insights" },
];

function journalSectionFromPath(pathname: string): JournalSection {
  if (
    pathname === "/journal/my/insights" ||
    pathname.startsWith("/journal/my/insights/")
  ) {
    return "insights";
  }
  if (
    pathname === "/journal/my/gratitudes" ||
    pathname.startsWith("/journal/my/gratitudes/")
  ) {
    return "gratitude";
  }
  return "journal";
}

/** Entry id from `/journal/:entryId` (not gratitudes/insights). */
function journalEntryIdFromPath(pathname: string): string | null {
  if (
    pathname === "/journal/my" ||
    pathname === "/journal/my/" ||
    pathname.startsWith("/journal/my/gratitudes") ||
    pathname.startsWith("/journal/my/insights")
  ) {
    return null;
  }
  const m = /^\/journal\/my\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Entry id from `/journal/my/gratitudes/:entryId`. */
function gratitudeEntryIdFromPath(pathname: string): string | null {
  const m = /^\/journal\/my\/gratitudes\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function IconEntryMore({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

function JournalChromeMoreMenu({
  onImport,
  onSettings,
}: {
  onImport: () => void;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="Journal options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted transition-colors hover:border-accent/40 hover:text-foreground"
      >
        <IconEntryMore />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[9rem] rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onImport();
            }}
            className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-accent-soft/30"
          >
            Import
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-accent-soft/30"
          >
            Settings
          </button>
        </div>
      ) : null}
    </div>
  );
}

const FOLDER_ALL = "";

function entryPreview(entry: JournalEntry, opts?: { untruncated?: boolean }): string {
  if (isGratitudeEntry(entry)) {
    const t = (entry.gratitude ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" · ");
    if (!t) return "No gratitudes yet";
    if (opts?.untruncated) return t;
    return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  }
  const t = stripHtmlToText(entry.contentHtml);
  if (!t) return "Empty entry";
  if (opts?.untruncated) return t;
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

function sidebarEntryTitle(title: string): string {
  const t = title.trim();
  return t || "Untitled entry";
}

function lifeAreaForJournalEntry(
  entry: JournalEntry,
  dreams: PlanDream[],
): PlanDream | null {
  for (const dream of dreams) {
    if (journalEntriesLinkedToLifeArea(dream, [entry]).length > 0) {
      return dream;
    }
  }
  const tags = (entry.tags ?? []).map((t) => t.trim().toLowerCase());
  if (!tags.length) return null;
  for (const dream of dreams) {
    const title = dream.title.trim().toLowerCase();
    if (title && tags.includes(title)) return dream;
  }
  return null;
}

function activeIdForJournalTab(
  entries: JournalEntry[],
  preferred: string | null,
): string | null {
  const free = entries.filter((e) => !isGratitudeEntry(e));
  const preferredEntry = preferred
    ? free.find((e) => e.id === preferred)
    : undefined;
  if (preferredEntry) return preferredEntry.id;
  return mostRecentlyUpdatedId(free);
}

function JumpToDayPopover({
  jumpDate,
  onPick,
  onClear,
}: {
  jumpDate: string;
  onPick: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      className="absolute left-0 z-30 mt-1 w-52 rounded-xl border border-border bg-card p-2 shadow-lg"
      role="dialog"
      aria-label="Jump to a day"
    >
      <p className="text-sm font-medium text-foreground">Jump to a day</p>
      <p className="mt-0.5 text-xs text-muted">
        Pick a date to see the entry from that day.
      </p>
      <input
        type="date"
        value={jumpDate}
        onChange={(ev) => onPick(ev.target.value)}
        className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent/50"
      />
      {jumpDate ? (
        <button
          type="button"
          className="mt-1.5 cursor-pointer text-xs font-medium text-accent-link underline-offset-2 hover:underline"
          onClick={onClear}
        >
          Clear date
        </button>
      ) : null}
    </div>
  );
}

export function JournalView() {
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  /** Bumps when chat (or another tab) updates the open entry so the editor remounts. */
  const [editorExternalSyncKey, setEditorExternalSyncKey] = useState(0);
  const [folders, setFolders] = useState<JournalFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(FOLDER_ALL);
  const [namingFolder, setNamingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [sidebarMenu, setSidebarMenu] = useState<
    null | "folder" | "date" | "filters"
  >(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const { pathname: pathnameRaw } = useLocation();
  const pathname = pathnameRaw || "/journal/my";
  const navigate = useNavigate();
  const section = journalSectionFromPath(pathname);
  const routeEntryId = journalEntryIdFromPath(pathname);
  const routeGratitudeId = gratitudeEntryIdFromPath(pathname);
  /** Mobile journal: editor is its own full-screen route (`/journal/:id`). */
  const mobileJournalEditor =
    section === "journal" && Boolean(routeEntryId);
  /** Mobile gratitudes: compose is `/journal/my/gratitudes/:id`. */
  const mobileGratitudeCompose =
    section === "gratitude" && Boolean(routeGratitudeId);
  /** Mobile insights: letter detail is `/journal/my/insights/:weekKey`. */
  const mobileInsightsLetter =
    section === "insights" &&
    Boolean(/^\/journal\/insights\/[^/]+\/?$/.test(pathname));
  const mobileComposeChrome =
    mobileJournalEditor || mobileGratitudeCompose || mobileInsightsLetter;
  const insightsOpen = section === "insights";
  const [insightsMounted, setInsightsMounted] = useState(insightsOpen);
  const [listTab, setListTab] = useState<JournalMainTab>(() =>
    section === "gratitude" ? "gratitude" : "journal",
  );
  const journalTab: JournalMainTab =
    section === "gratitude"
      ? "gratitude"
      : section === "journal"
        ? "journal"
        : listTab;
  const [gratitudeDraft, setGratitudeDraft] = useState<JournalGratitudeLines>(
    emptyGratitudeLines(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [jumpDate, setJumpDate] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const prevSectionRef = useRef<JournalSection | null>(null);
  /** After first journal GET attempt (or skip if no API URL); avoids PUT before pull completes. */
  const [remoteJournalChecked, setRemoteJournalChecked] = useState(false);
  const entriesRef = useRef<JournalEntry[]>([]);
  const foldersRef = useRef<JournalFolder[]>([]);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const dateMenuRef = useRef<HTMLDivElement | null>(null);
  const filtersMenuRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const latestHtmlRef = useRef("<p></p>");
  const latestTitleRef = useRef("");
  const latestGratitudeRef = useRef<JournalGratitudeLines>(emptyGratitudeLines());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipCloudPushRef = useRef(false);

  entriesRef.current = entries;
  foldersRef.current = folders;
  activeIdRef.current = activeEntryId;

  useEffect(() => {
    if (section === "journal" || section === "gratitude") {
      setListTab(section);
    }
    if (section === "insights") {
      setInsightsMounted(true);
    }
  }, [section]);

  useEffect(() => {
    const sync = () => {
      // Cloud journal only when we actually have an access JWT. Sticky ACTIVE_KEY
      // without a token used to strip demos and leave an empty journal while the
      // user effectively could not use the account.
      const next =
        isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
      setSignedIn((prev) => {
        if (prev !== next) {
          clearJournalRemoteSessionCache();
          setRemoteJournalChecked(false);
          setHydrated(false);
        }
        return next;
      });
      setAuthReady(true);
    };
    void import("@/lib/auth-session").then((m) =>
      m.ensureMedimadeSession().finally(sync),
    );
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  useEffect(() => {
    if (prevSectionRef.current === "insights" && section !== "insights") {
      scheduleJournalInsightsRefreshAfterLeavingEditor();
    }
    prevSectionRef.current = section;
  }, [section]);

  useEffect(() => {
    if (!sidebarMenu) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (
        folderMenuRef.current?.contains(t) ||
        dateMenuRef.current?.contains(t) ||
        filtersMenuRef.current?.contains(t)
      ) {
        return;
      }
      setSidebarMenu(null);
      setNamingFolder(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSidebarMenu(null);
        setNamingFolder(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [sidebarMenu]);

  useEffect(() => {
    setSidebarCollapsed(loadJournalSidebarCollapsed());
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      saveJournalSidebarCollapsed(next);
      return next;
    });
  }, []);

  const persist = useCallback(
    (
      nextEntries: JournalEntry[],
      nextActive: string | null,
      nextFolders?: JournalFolder[],
    ) => {
      const foldersNext = nextFolders ?? foldersRef.current;
      saveJournalStore(
        {
          version: 2,
          activeEntryId: nextActive,
          entries: nextEntries,
          ...(foldersNext.length ? { folders: foldersNext } : {}),
        },
        { source: "journal-view" },
      );
    },
    [],
  );

  useEffect(() => {
    if (!authReady) return;
    // Never seed journal from the UI. Signed-in: strip leftover demo rows and
    // wait for cloud GET. Unsigned: show local cache as-is (often empty).
    const rawSignedIn = signedIn
      ? withoutDemoJournalEntries(loadJournalStoreRaw())
      : null;
    const store = signedIn
      ? pruneEmptyJournalEntries(rawSignedIn!)
      : loadJournalStoreRaw();
    const nextActive = activeIdForJournalTab(
      store.entries,
      store.activeEntryId,
    );
    setEntries(store.entries);
    setFolders(store.folders ?? []);
    foldersRef.current = store.folders ?? [];
    setActiveEntryId(nextActive);
    const active = store.entries.find((e) => e.id === nextActive);
    latestHtmlRef.current = active?.contentHtml ?? "<p></p>";
    latestTitleRef.current = active?.title ?? "";
    latestGratitudeRef.current = active?.gratitude ?? emptyGratitudeLines();
    setGratitudeDraft(latestGratitudeRef.current);
    setHydrated(true);
    if (
      nextActive !== store.activeEntryId ||
      (rawSignedIn && rawSignedIn.entries.length !== store.entries.length)
    ) {
      persist(store.entries, nextActive, store.folders ?? []);
    }
    if (signedIn) {
      // Don't allow a previous guest "checked" skip to fire an empty PUT.
      setRemoteJournalChecked(false);
    }
  }, [authReady, signedIn, persist]);

  // Same-tab (Chat) + cross-tab: re-read local cache only — no import, no cloud fetch.
  useEffect(() => {
    if (!hydrated) return;
    const applyExternal = () => {
      const store = readJournalStoreSnapshot({ signedIn });
      skipCloudPushRef.current = true;
      entriesRef.current = store.entries;
      setEntries(store.entries);
      setFolders(store.folders ?? []);
      foldersRef.current = store.folders ?? [];

      const openId = activeIdRef.current;
      const open = openId
        ? store.entries.find((e) => e.id === openId)
        : undefined;
      if (open) {
        latestHtmlRef.current = open.contentHtml;
        latestTitleRef.current = open.title;
        latestGratitudeRef.current = open.gratitude ?? emptyGratitudeLines();
        setGratitudeDraft(latestGratitudeRef.current);
        setEditorExternalSyncKey((n) => n + 1);
      }
    };
    return subscribeJournalStore(applyExternal, {
      ignoreSources: ["journal-view"],
    });
  }, [hydrated, signedIn]);

  /** Pull cloud journal when a session JWT is active (including Continue as guest). */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const base = getMedimadeApiBase();
    if (!signedIn || !base) {
      setRemoteJournalChecked(true);
      return;
    }
    if (wasJournalStorePulledThisSession()) {
      setRemoteJournalChecked(true);
      return;
    }
    void (async () => {
      try {
        const remote = await fetchJournalStoreRemote();
        if (cancelled) return;
        const localEntries = entriesRef.current;
        const localIsDemoOnly =
          localEntries.length === 0 || isDemoOnlyStore({
            version: 2,
            activeEntryId: null,
            entries: localEntries,
          });

        if (!remote?.entries?.length) {
          // Empty cloud: keep personal local rows and let push upload them.
          // Never invent starter journals from the UI.
          if (localIsDemoOnly || localEntries.some(isDemoJournalEntry)) {
            // Demo-only leftovers on a real account → clear them from the cache.
            // Guest Continue-as-guest is a normal account; do not special-seed it.
            skipCloudPushRef.current = true;
            entriesRef.current = [];
            setEntries([]);
            setFolders([]);
            foldersRef.current = [];
            setActiveEntryId(null);
            latestHtmlRef.current = "<p></p>";
            latestTitleRef.current = "";
            latestGratitudeRef.current = emptyGratitudeLines();
            setGratitudeDraft(latestGratitudeRef.current);
            persist([], null, []);
          } else {
            // Cache already has personal rows with empty remote — keep showing
            // them and let the push effect upload (first sync of this device).
            const pruned = pruneEmptyJournalEntries({
              version: 2,
              activeEntryId: activeIdRef.current,
              entries: localEntries,
              ...(foldersRef.current.length
                ? { folders: foldersRef.current }
                : {}),
            });
            if (pruned.entries.length !== localEntries.length) {
              skipCloudPushRef.current = true;
              entriesRef.current = pruned.entries;
              setEntries(pruned.entries);
              setActiveEntryId(pruned.activeEntryId);
              persist(pruned.entries, pruned.activeEntryId, foldersRef.current);
            }
            skipCloudPushRef.current = false;
          }
          return;
        }

        // Cloud wins: replace device cache (including any leftover demos).
        skipCloudPushRef.current = true;
        const merged = pruneEmptyJournalEntries(
          mergeRemoteJournalKeepingLocalOnly(remote, localEntries),
        );
        const preferred =
          merged.activeEntryId &&
          merged.entries.some((e) => e.id === merged.activeEntryId)
            ? merged.activeEntryId
            : null;
        const nextActive = activeIdForJournalTab(merged.entries, preferred);
        entriesRef.current = merged.entries;
        setEntries(merged.entries);
        setFolders(merged.folders ?? []);
        foldersRef.current = merged.folders ?? [];
        setActiveEntryId(nextActive);
        const nextEntry = merged.entries.find((e) => e.id === nextActive);
        latestHtmlRef.current = nextEntry?.contentHtml ?? "<p></p>";
        latestTitleRef.current = nextEntry?.title ?? "";
        latestGratitudeRef.current =
          nextEntry?.gratitude ?? emptyGratitudeLines();
        setGratitudeDraft(latestGratitudeRef.current);
        persist(merged.entries, nextActive, merged.folders ?? []);
      } catch {
        /* offline — keep non-demo local cache if any */
        const cleaned = withoutDemoJournalEntries({
          version: 2,
          activeEntryId: activeIdRef.current,
          entries: entriesRef.current,
          ...(foldersRef.current.length
            ? { folders: foldersRef.current }
            : {}),
        });
        if (cleaned.entries.length !== entriesRef.current.length) {
          skipCloudPushRef.current = true;
          entriesRef.current = cleaned.entries;
          setEntries(cleaned.entries);
          setActiveEntryId(cleaned.activeEntryId);
          persist(cleaned.entries, cleaned.activeEntryId, foldersRef.current);
        }
      } finally {
        if (!cancelled) {
          markJournalStorePulledThisSession();
          setRemoteJournalChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, persist, signedIn]);

  const cloudPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Debounced `PUT /journal/store` (server writes per-entry DynamoDB rows) when API URL is set. */
  useEffect(() => {
    if (!signedIn) return;
    if (!hydrated || !remoteJournalChecked) return;
    if (skipCloudPushRef.current) {
      skipCloudPushRef.current = false;
      return;
    }
    const base = getMedimadeApiBase();
    if (!base) return;
    if (!getMedimadeSessionJwt()) return;
    const cloudEntries = entriesForCloudPut(entries);
    // Never push an empty body while starter-import rows are still on screen (would wipe cloud).
    if (
      cloudEntries.length === 0 &&
      entries.some(isDemoJournalEntry)
    ) {
      return;
    }
    // Never push an empty store unless the user actually has zero local entries
    // (avoids accidental cloud wipe after a bad local rewrite).
    if (cloudEntries.length === 0 && entries.length > 0) {
      return;
    }
    if (cloudPushTimerRef.current) clearTimeout(cloudPushTimerRef.current);
    cloudPushTimerRef.current = setTimeout(() => {
      cloudPushTimerRef.current = null;
      const store: JournalStoreV2 = {
        version: 2,
        activeEntryId: cloudEntries.some((e) => e.id === activeEntryId)
          ? activeEntryId
          : (cloudEntries[0]?.id ?? null),
        entries: cloudEntries,
        ...(folders.length ? { folders } : {}),
      };
      void putJournalStoreRemote(store).catch(() => {
        /* offline or quota */
      });
    }, 1200);
    return () => {
      if (cloudPushTimerRef.current) {
        clearTimeout(cloudPushTimerRef.current);
        cloudPushTimerRef.current = null;
      }
    };
  }, [signedIn, hydrated, remoteJournalChecked, entries, activeEntryId, folders]);

  const flushSaveSync = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = activeIdRef.current;
    if (!id) return;
    const html = latestHtmlRef.current;
    const title = latestTitleRef.current;
    const gratitude = latestGratitudeRef.current;
    const prev = entriesRef.current;
    const prevEntry = prev.find((e) => e.id === id);
    if (!prevEntry) return;
    if (
      !journalEntryDraftChanged(prevEntry, {
        contentHtml: html,
        title,
        gratitude,
      })
    ) {
      return;
    }
    const next = prev.map((e) =>
      e.id === id
        ? {
            ...e,
            contentHtml: html,
            title,
            updatedAt: new Date().toISOString(),
            ...(isGratitudeEntry(e) ? { kind: "gratitude" as const, gratitude } : {}),
          }
        : e,
    );
    entriesRef.current = next;
    setEntries(next);
    persist(next, id);
  }, [persist]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const id = activeIdRef.current;
      if (!id) return;
      const html = latestHtmlRef.current;
      const title = latestTitleRef.current;
      const gratitude = latestGratitudeRef.current;
      const prev = entriesRef.current;
      const prevEntry = prev.find((e) => e.id === id);
      if (
        !prevEntry ||
        !journalEntryDraftChanged(prevEntry, {
          contentHtml: html,
          title,
          gratitude,
        })
      ) {
        return;
      }
      const next = prev.map((e) =>
        e.id === id
          ? {
              ...e,
              contentHtml: html,
              title,
              updatedAt: new Date().toISOString(),
              ...(isGratitudeEntry(e)
                ? { kind: "gratitude" as const, gratitude }
                : {}),
            }
          : e,
      );
      entriesRef.current = next;
      setEntries(next);
      // Persist after setState — never inside an updater (notifies AppTopBar).
      persist(next, id);
    }, 450);
  }, [persist]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const id = activeIdRef.current;
      if (!id) return;
      const html = latestHtmlRef.current;
      const title = latestTitleRef.current;
      const gratitude = latestGratitudeRef.current;
      const prevEntry = entriesRef.current.find((e) => e.id === id);
      if (
        !prevEntry ||
        !journalEntryDraftChanged(prevEntry, {
          contentHtml: html,
          title,
          gratitude,
        })
      ) {
        return;
      }
      const next = entriesRef.current.map((e) =>
        e.id === id
          ? {
              ...e,
              contentHtml: html,
              title,
              updatedAt: new Date().toISOString(),
              ...(isGratitudeEntry(e)
                ? { kind: "gratitude" as const, gratitude }
                : {}),
            }
          : e,
      );
      saveJournalStore(
        {
          version: 2,
          activeEntryId: id,
          entries: next,
          ...(foldersRef.current.length ? { folders: foldersRef.current } : {}),
        },
        { source: "journal-view" },
      );
    };
  }, []);

  const activeEntry = useMemo(
    () => entries.find((e) => e.id === activeEntryId) ?? null,
    [entries, activeEntryId],
  );

  const tabEntries = useMemo(
    () =>
      journalTab === "gratitude"
        ? entries.filter(isGratitudeEntry)
        : entries.filter((e) => !isGratitudeEntry(e)),
    [entries, journalTab],
  );

  const algoliaType = journalTab === "gratitude" ? "gratitude" : "journal";
  const {
    ids: algoliaIds,
    orderedIds: algoliaOrderedIds,
  } = useUserContentSearchIds(searchQuery, algoliaType);

  const filteredTabEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = tabEntries.filter((e) => {
      if (jumpDate && localDateKeyFromIso(e.createdAt) !== jumpDate) {
        return false;
      }
      if (importBatchId && e.importBatchId !== importBatchId) {
        return false;
      }
      if (
        journalTab === "journal" &&
        selectedFolderId &&
        e.folderId !== selectedFolderId
      ) {
        return false;
      }
      if (!q) return true;
      if (algoliaIds) return algoliaIds.has(e.id);
      const hay = [
        e.title,
        stripHtmlToText(e.contentHtml),
        ...(e.tags ?? []),
        e.mood ?? "",
        ...(e.gratitude ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return sortByAlgoliaOrder(filtered, algoliaOrderedIds, (e) => e.id);
  }, [
    tabEntries,
    searchQuery,
    jumpDate,
    importBatchId,
    journalTab,
    selectedFolderId,
    algoliaIds,
    algoliaOrderedIds,
  ]);

  const sidebarGroups = useMemo(() => {
    if (journalTab === "journal") {
      return groupJournalEntriesByWeek(filteredTabEntries);
    }
    return groupJournalEntriesForSidebar(filteredTabEntries);
  }, [filteredTabEntries, journalTab]);

  const planDreams = useMemo(() => {
    if (typeof window === "undefined" || !hydrated) return [] as PlanDream[];
    try {
      return loadPlanDreamsStore().dreams;
    } catch {
      return [] as PlanDream[];
    }
  }, [hydrated, entries]);

  const activeLifeArea = useMemo(() => {
    if (!activeEntry || isGratitudeEntry(activeEntry)) return null;
    return lifeAreaForJournalEntry(activeEntry, planDreams);
  }, [activeEntry, planDreams]);

  const patchActive = useCallback(
    (partial: Partial<JournalEntry>) => {
      const id = activeIdRef.current;
      if (!id) return;
      const next = entriesRef.current.map((e) =>
        e.id === id
          ? { ...e, ...partial, updatedAt: new Date().toISOString() }
          : e,
      );
      entriesRef.current = next;
      setEntries(next);
      persist(next, id);
    },
    [persist],
  );

  const deleteActive = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    if (!window.confirm("Delete this entry from this device?")) return;
    const remaining = entriesRef.current.filter((e) => e.id !== id);
    const nextId =
      remaining.find((e) =>
        journalTab === "gratitude" ? isGratitudeEntry(e) : !isGratitudeEntry(e),
      )?.id ??
      mostRecentlyUpdatedId(remaining) ??
      null;
    entriesRef.current = remaining;
    setEntries(remaining);
    setActiveEntryId(nextId);
    const next = remaining.find((e) => e.id === nextId);
    latestHtmlRef.current = next?.contentHtml ?? "<p></p>";
    latestTitleRef.current = next?.title ?? "";
    latestGratitudeRef.current = next?.gratitude ?? emptyGratitudeLines();
    setGratitudeDraft(latestGratitudeRef.current);
    persist(remaining, nextId);
    if (journalTab === "journal" && journalEntryIdFromPath(pathname)) {
      navigate(
        nextId
          ? `/journal/my/${encodeURIComponent(nextId)}`
          : JOURNAL_SECTION_HREF.journal,
      );
    } else if (
      journalTab === "gratitude" &&
      gratitudeEntryIdFromPath(pathname)
    ) {
      navigate(
        nextId
          ? `/journal/my/gratitudes/${encodeURIComponent(nextId)}`
          : JOURNAL_SECTION_HREF.gratitude,
      );
    }
  }, [journalTab, persist, pathname, navigate]);

  const applyEntrySelection = useCallback(
    (nextId: string) => {
      const leavingId = activeIdRef.current;
      flushSaveSync();
      // Drop empty stubs left behind (New entry is kept only while it is open).
      let list = entriesRef.current;
      if (leavingId && leavingId !== nextId) {
        const left = list.find((e) => e.id === leavingId);
        if (left && !journalEntryHasMeaningfulContent(left)) {
          list = list.filter((e) => e.id !== leavingId);
          entriesRef.current = list;
          setEntries(list);
          persist(list, nextId);
        }
      }
      setActiveEntryId(nextId);
      const next = list.find((e) => e.id === nextId);
      latestHtmlRef.current = next?.contentHtml ?? "<p></p>";
      latestTitleRef.current = next?.title ?? "";
      latestGratitudeRef.current = next?.gratitude ?? emptyGratitudeLines();
      setGratitudeDraft(latestGratitudeRef.current);
    },
    [flushSaveSync, persist],
  );

  const selectEntry = useCallback(
    (nextId: string) => {
      applyEntrySelection(nextId);
      const entry = entriesRef.current.find((e) => e.id === nextId);
      if (!entry) return;
      if (journalTab === "journal") {
        if (isGratitudeEntry(entry)) return;
        if (journalEntryIdFromPath(pathname) === nextId) return;
        navigate(`/journal/my/${encodeURIComponent(nextId)}`);
        return;
      }
      if (journalTab === "gratitude") {
        if (!isGratitudeEntry(entry)) return;
        if (gratitudeEntryIdFromPath(pathname) === nextId) return;
        navigate(
          `/journal/my/gratitudes/${encodeURIComponent(nextId)}`,
        );
      }
    },
    [applyEntrySelection, journalTab, pathname, navigate],
  );

  /** Deep-link / browser back: sync active entry from `/journal/:id`. */
  useEffect(() => {
    if (!hydrated || section !== "journal") return;
    if (!routeEntryId) return;
    const found = entriesRef.current.find(
      (e) => e.id === routeEntryId && !isGratitudeEntry(e),
    );
    if (!found) {
      navigate(JOURNAL_SECTION_HREF.journal, { replace: true });
      return;
    }
    if (activeIdRef.current !== routeEntryId) {
      applyEntrySelection(routeEntryId);
    }
  }, [hydrated, section, routeEntryId, entries, applyEntrySelection, navigate]);

  /** Deep-link / browser back: sync from `/journal/my/gratitudes/:id`. */
  useEffect(() => {
    if (!hydrated || section !== "gratitude") return;
    if (!routeGratitudeId) return;
    const found = entriesRef.current.find(
      (e) => e.id === routeGratitudeId && isGratitudeEntry(e),
    );
    if (!found) {
      navigate(JOURNAL_SECTION_HREF.gratitude, { replace: true });
      return;
    }
    if (activeIdRef.current !== routeGratitudeId) {
      applyEntrySelection(routeGratitudeId);
    }
  }, [
    hydrated,
    section,
    routeGratitudeId,
    entries,
    applyEntrySelection,
    navigate,
  ]);

  useEffect(() => {
    if (section !== "journal" || !routeEntryId) {
      clearJournalEntryLiveTitle();
      return;
    }
    const entry = entriesRef.current.find((e) => e.id === routeEntryId);
    const title =
      entry?.title?.trim() ||
      (entry ? deriveEntryTitle(entry.contentHtml) : "") ||
      "";
    setJournalEntryLiveTitle(routeEntryId, title);
    return () => clearJournalEntryLiveTitle(routeEntryId);
  }, [section, routeEntryId]);

  const moveActiveToFolder = useCallback(
    (folderId: string) => {
      if (folderId) {
        patchActive({ folderId });
      } else {
        patchActive({ folderId: undefined });
      }
    },
    [patchActive],
  );

  const applyJumpDate = useCallback(
    (value: string) => {
      setJumpDate(value);
      if (value) setSidebarMenu(null);
      if (!value) return;
      const match = tabEntries.find((e) => {
        if (localDateKeyFromIso(e.createdAt) !== value) return false;
        if (
          journalTab === "journal" &&
          selectedFolderId &&
          e.folderId !== selectedFolderId
        ) {
          return false;
        }
        return true;
      });
      if (match) selectEntry(match.id);
    },
    [journalTab, selectEntry, selectedFolderId, tabEntries],
  );

  const clearJumpDate = useCallback(() => {
    setJumpDate("");
    setSidebarMenu(null);
  }, []);

  const createEntry = useCallback(() => {
    flushSaveSync();
    const e = newJournalEntry(
      selectedFolderId ? { folderId: selectedFolderId } : undefined,
    );
    const next = [e, ...entriesRef.current];
    entriesRef.current = next;
    setEntries(next);
    persist(next, e.id);
    setActiveEntryId(e.id);
    latestHtmlRef.current = e.contentHtml;
    latestTitleRef.current = e.title;
    latestGratitudeRef.current = emptyGratitudeLines();
    setGratitudeDraft(latestGratitudeRef.current);
    navigate(`/journal/my/${encodeURIComponent(e.id)}`);
  }, [flushSaveSync, persist, selectedFolderId, navigate]);

  const generateMeditationFromActive = useCallback(() => {
    const entry = activeEntry;
    if (!entry || isGratitudeEntry(entry)) return;
    flushSaveSync();
    const payload = {
      v: 1 as const,
      at: new Date().toISOString(),
      segments: [
        {
          entryId: entry.id,
          title: entry.title.trim() || "Untitled",
          bodyPlain: journalEntryPlainForHandoff(
            latestHtmlRef.current || entry.contentHtml,
          ),
          createdAt: entry.createdAt,
        },
      ],
    };
    const json = JSON.stringify(payload);
    armJournalMeditationHandoffJson(json);
    try {
      sessionStorage.setItem(JOURNAL_MEDITATION_PAYLOAD_KEY, json);
    } catch {
      /* ignore */
    }
    navigate("/meditate/create?fromJournal=1");
  }, [activeEntry, flushSaveSync, navigate]);

  const openLifeAreaFromActive = useCallback(() => {
    if (activeLifeArea) {
      navigate(`/manifest/goal/${encodeURIComponent(activeLifeArea.id)}`);
      return;
    }
    navigate("/manifest/my");
  }, [activeLifeArea, navigate]);

  const createGratitudeEntry = useCallback(() => {
    flushSaveSync();
    const e = newGratitudeJournalEntry();
    const next = [e, ...entriesRef.current];
    entriesRef.current = next;
    setEntries(next);
    persist(next, e.id);
    setActiveEntryId(e.id);
    latestHtmlRef.current = e.contentHtml;
    latestTitleRef.current = e.title;
    latestGratitudeRef.current = e.gratitude ?? emptyGratitudeLines();
    setGratitudeDraft(latestGratitudeRef.current);
    navigate(`/journal/my/gratitudes/${encodeURIComponent(e.id)}`);
  }, [flushSaveSync, persist, navigate]);

  // Sidebar deep-links: `/journal/my?new=1` and `/journal/my/gratitudes?new=1`.
  const newEntryHandledRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") {
      newEntryHandledRef.current = false;
      return;
    }
    if (!hydrated || newEntryHandledRef.current) return;
    newEntryHandledRef.current = true;
    if (
      pathname === "/journal/my/gratitudes" ||
      pathname.startsWith("/journal/my/gratitudes/")
    ) {
      createGratitudeEntry();
      return;
    }
    createEntry();
  }, [pathname, hydrated, createEntry, createGratitudeEntry]);

  const commitImport = useCallback(
    (rows: JournalImportPreviewRow[], batchId: string) => {
      flushSaveSync();
      const imported = previewRowsToEntries(rows, batchId).map((e) =>
        selectedFolderId ? { ...e, folderId: selectedFolderId } : e,
      );
      if (!imported.length) return;
      const next = mergeImportedEntries(entriesRef.current, imported);
      entriesRef.current = next;
      setEntries(next);
      const first = imported[0];
      setActiveEntryId(first.id);
      latestHtmlRef.current = first.contentHtml;
      latestTitleRef.current = first.title;
      latestGratitudeRef.current = emptyGratitudeLines();
      setGratitudeDraft(emptyGratitudeLines());
      persist(next, first.id);
      setImportBatchId(batchId);
      setImportOpen(false);
      navigate(`/journal/my/${encodeURIComponent(first.id)}`);
      if (getMedimadeSessionJwt()) {
        void runJournalInsightsRemote().catch(() => {
          /* insights can catch up later */
        });
      }
    },
    [flushSaveSync, persist, selectedFolderId, navigate],
  );

  const addNamedFolder = useCallback(() => {
    const folder = newJournalFolder(newFolderName);
    if (!folder) return;
    const nextFolders = [...foldersRef.current, folder];
    foldersRef.current = nextFolders;
    setFolders(nextFolders);
    setSelectedFolderId(folder.id);
    setNamingFolder(false);
    setNewFolderName("");
    persist(entriesRef.current, activeIdRef.current, nextFolders);
    setSidebarMenu(null);
  }, [newFolderName, persist]);

  const onFolderSelect = useCallback(
    (value: string) => {
      setNamingFolder(false);
      setSelectedFolderId(value);
      setSidebarMenu(null);
      if (!value) return;
      const inFolder = entriesRef.current.filter(
        (e) => !isGratitudeEntry(e) && e.folderId === value,
      );
      const current = activeIdRef.current;
      if (current && inFolder.some((e) => e.id === current)) return;
      if (!inFolder[0]) return;
      // On the mobile list route, keep the list visible; only sync selection.
      if (section === "journal" && !journalEntryIdFromPath(pathname)) {
        applyEntrySelection(inFolder[0].id);
        return;
      }
      selectEntry(inFolder[0].id);
    },
    [applyEntrySelection, pathname, section, selectEntry],
  );

  const openTodayGratitude = useCallback(() => {
    flushSaveSync();
    const todayKey = localDateKey();
    const existing = findGratitudeEntryForLocalDate(
      entriesRef.current,
      todayKey,
    );
    if (existing) {
      setActiveEntryId(existing.id);
      latestHtmlRef.current = existing.contentHtml;
      latestTitleRef.current = existing.title;
      latestGratitudeRef.current = existing.gratitude ?? emptyGratitudeLines();
      setGratitudeDraft(latestGratitudeRef.current);
      return existing.id;
    }
    const e = newGratitudeJournalEntry();
    const next = [e, ...entriesRef.current];
    entriesRef.current = next;
    setEntries(next);
    persist(next, e.id);
    setActiveEntryId(e.id);
    latestHtmlRef.current = e.contentHtml;
    latestTitleRef.current = e.title;
    latestGratitudeRef.current = e.gratitude ?? emptyGratitudeLines();
    setGratitudeDraft(latestGratitudeRef.current);
    return e.id;
  }, [flushSaveSync, persist]);

  const openTodayGratitudeCompose = useCallback(() => {
    const id = openTodayGratitude();
    if (!id) return;
    if (gratitudeEntryIdFromPath(pathname) === id) return;
    navigate(`/journal/my/gratitudes/${encodeURIComponent(id)}`);
  }, [openTodayGratitude, pathname, navigate]);

  const activateJournalList = useCallback(() => {
    const free = entriesRef.current.filter((e) => !isGratitudeEntry(e));
    const freeId = mostRecentlyUpdatedId(free);
    if (!freeId) {
      setActiveEntryId(null);
      latestHtmlRef.current = "<p></p>";
      latestTitleRef.current = "";
      latestGratitudeRef.current = emptyGratitudeLines();
      setGratitudeDraft(latestGratitudeRef.current);
      return;
    }
    const freeEntry = free.find((e) => e.id === freeId)!;
    setActiveEntryId(freeId);
    latestHtmlRef.current = freeEntry.contentHtml;
    latestTitleRef.current = freeEntry.title;
    latestGratitudeRef.current = emptyGratitudeLines();
    setGratitudeDraft(latestGratitudeRef.current);
  }, []);

  const prevListSectionRef = useRef<JournalMainTab | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (section !== "journal" && section !== "gratitude") return;
    const prev = prevListSectionRef.current;
    prevListSectionRef.current = section;
    if (prev === null) {
      if (section === "gratitude" && !gratitudeEntryIdFromPath(pathname)) {
        openTodayGratitude();
      }
      return;
    }
    if (prev === section) return;
    if (section === "gratitude") {
      if (!gratitudeEntryIdFromPath(pathname)) openTodayGratitude();
      return;
    }
    activateJournalList();
  }, [hydrated, section, pathname, openTodayGratitude, activateJournalList]);

  useEffect(() => {
    if (!hydrated) return;
    if (journalTab !== "journal") return;
    const active = entriesRef.current.find((e) => e.id === activeIdRef.current);
    if (!active || !isGratitudeEntry(active)) return;
    const free = entriesRef.current.filter((e) => !isGratitudeEntry(e));
    const freeId = mostRecentlyUpdatedId(free);
    if (!freeId) {
      setActiveEntryId(null);
      latestHtmlRef.current = "<p></p>";
      latestTitleRef.current = "";
      latestGratitudeRef.current = emptyGratitudeLines();
      setGratitudeDraft(latestGratitudeRef.current);
      return;
    }
    const freeEntry = free.find((e) => e.id === freeId)!;
    setActiveEntryId(freeId);
    latestHtmlRef.current = freeEntry.contentHtml;
    latestTitleRef.current = freeEntry.title;
    latestGratitudeRef.current = emptyGratitudeLines();
    setGratitudeDraft(latestGratitudeRef.current);
    persist(entriesRef.current, freeId);
  }, [hydrated, journalTab, entries, persist]);

  const onGratitudeChange = useCallback(
    (lines: JournalGratitudeLines) => {
      setGratitudeDraft(lines);
      latestGratitudeRef.current = lines;
      latestHtmlRef.current = gratitudeLinesToHtml(lines);
      scheduleSave();
    },
    [scheduleSave],
  );

  const initialHtmlForEditor = activeEntry?.contentHtml ?? "<p></p>";
  const initialTitleForEditor = activeEntry?.title ?? "";
  const showGratitudeEditor =
    journalTab === "gratitude" && !insightsOpen && hydrated && Boolean(activeEntry);

  const journalComposeChrome =
    (journalTab === "journal" || journalTab === "gratitude") && !insightsOpen;

  return (
    <JournalLockGate>
    {/* Match Chat: sidebar + writing stay inside max-w-6xl; pattern gutter takes the right strip. */}
    <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-transparent">
    <div
      className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden ${
        !mobileJournalEditor &&
        !mobileGratitudeCompose &&
        !mobileInsightsLetter
          ? "journal-mobile-paisley-bg"
          : ""
      } ${
        journalComposeChrome
          ? "relative z-[1] max-w-6xl border-r-[0.5px] border-border px-0 pb-0 pt-0"
          : "mx-auto max-w-6xl px-4 pb-6 pt-2 sm:px-6 sm:pb-6 sm:pt-4"
      }`}
    >
      <div
        className={`shrink-0 ${
          journalComposeChrome ? "px-4 sm:px-6" : ""
        } ${mobileComposeChrome ? "max-sm:hidden" : ""} ${
          importBatchId
            ? "mb-3"
            : journalComposeChrome
              ? "mb-0"
              : "mb-3 md:mb-0"
        }`}
      >
        {/* SPA shell has no top-bar tab slot; keep section tabs in-page at all breakpoints. */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 py-1.5">
          <SegmentedPillTabs
            className="min-w-0 flex-1 shadow-md"
            equalWidth
            aria-label="Journal section"
            value={section}
            onChange={(id) => {
              flushSaveSync();
              navigate(JOURNAL_SECTION_HREF[id]);
            }}
            options={JOURNAL_SECTION_TABS}
          />
        </div>
        {importBatchId ? (
          <p className="mt-2 text-sm text-muted">
            Showing just-imported pages.{" "}
            <button
              type="button"
              className="cursor-pointer font-medium text-accent-link underline-offset-2 hover:underline"
              onClick={() => setImportBatchId(null)}
            >
              Show all
            </button>
          </p>
        ) : null}
      </div>

      {insightsMounted ? (
        <div
          className={
            insightsOpen
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden"
          }
          aria-hidden={!insightsOpen}
        >
          <JournalInsightsView />
        </div>
      ) : null}
      {!insightsOpen ? (
      <div
        className={`flex min-h-0 flex-1 overflow-hidden ${
          journalTab === "journal" || journalTab === "gratitude"
            ? "flex-col gap-0 md:flex-row"
            : "flex-col gap-6 lg:flex-row lg:gap-4"
        }`}
      >
        {journalTab === "journal" && sidebarCollapsed ? (
          <aside
            className="relative z-[1] hidden shrink-0 flex-col items-center gap-2 overflow-hidden border-r-[0.5px] border-border bg-surface-rail px-1.5 py-3 md:flex"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  'url("/patterns/hero/adobestock-2162625652.webp")',
                backgroundRepeat: "repeat",
                backgroundSize: "220px auto",
                backgroundPosition: "center top",
              }}
            />
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-label="Expand journal list"
              className="relative z-[1] flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
            >
              <JournalSidebarChevron dir="right" />
            </button>
            <button
              type="button"
              onClick={createEntry}
              aria-label="New entry"
              className="relative z-[1] flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl accent-fill-gradient text-sm font-bold text-on-accent"
            >
              +
            </button>
          </aside>
        ) : (
        <aside
          className={`flex shrink-0 flex-col ${
            journalTab === "journal" || journalTab === "gratitude"
              ? `relative z-[1] min-h-0 gap-3 overflow-hidden border-b-[0.5px] border-border bg-surface-rail px-3 pb-3 pt-3 md:w-[180px] md:shrink-0 md:self-stretch md:border-b-0 md:border-r-[0.5px] lg:w-[220px] xl:w-[260px] ${
                  mobileComposeChrome
                    ? "max-sm:hidden"
                    : "max-sm:h-fit max-sm:max-h-full max-sm:shrink-0 max-sm:overflow-y-auto max-sm:pb-5 max-sm:shadow-md"
                }`
              : `gap-3 overflow-visible border-b border-border pb-4 lg:max-h-none lg:w-64 lg:border-b-0 lg:pb-0 max-h-[22rem] ${
                  mobileComposeChrome ? "max-sm:hidden" : ""
                }`
          }`}
        >
          {journalTab === "journal" || journalTab === "gratitude" ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  'url("/patterns/hero/adobestock-2162625652.webp")',
                backgroundRepeat: "repeat",
                backgroundSize: "220px auto",
                backgroundPosition: "center top",
              }}
            />
          ) : null}
          {journalTab === "journal" ? (
            <div className="relative z-[1] flex flex-col gap-2">
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  aria-label="Collapse journal list"
                  className="hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground md:flex"
                >
                  <JournalSidebarChevron dir="left" />
                </button>
                <button
                  type="button"
                  onClick={createEntry}
                  className="min-w-0 flex-1 cursor-pointer rounded-xl accent-fill-gradient px-3 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
                >
                  + New entry
                </button>
              </div>
              <div className="flex items-center gap-2">
                <SearchInput
                  className="min-w-0 flex-1"
                  inputClassName="py-2"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search entries..."
                />
                {/* Mobile: folder + date between search and New */}
                <div ref={filtersMenuRef} className="relative shrink-0 sm:hidden">
                  <button
                    type="button"
                    aria-label="Folder and date filters"
                    aria-haspopup="menu"
                    aria-expanded={sidebarMenu === "filters"}
                    onClick={() => {
                      setSidebarMenu((m) =>
                        m === "filters" ? null : "filters",
                      );
                      setNamingFolder(false);
                    }}
                    className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                      selectedFolderId || jumpDate
                        ? "border-accent/40 bg-accent-soft/40 text-foreground"
                        : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                    }`}
                  >
                    <Folder aria-hidden className="size-4" strokeWidth={2} />
                  </button>
                  {sidebarMenu === "filters" ? (
                    <div
                      role="menu"
                      className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-border bg-card py-1 shadow-lg"
                    >
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Folder
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onFolderSelect(FOLDER_ALL)}
                        className={`block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/30 ${
                          !selectedFolderId
                            ? "font-semibold text-foreground"
                            : "text-muted"
                        }`}
                      >
                        All entries
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          role="menuitem"
                          onClick={() => onFolderSelect(f.id)}
                          className={`block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/30 ${
                            selectedFolderId === f.id
                              ? "font-semibold text-foreground"
                              : "text-muted"
                          }`}
                        >
                          {f.name}
                        </button>
                      ))}
                      <div className="border-t border-border px-2 py-1.5">
                        {namingFolder ? (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addNamedFolder();
                                }
                              }}
                              placeholder="Folder name"
                              autoFocus
                              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent/50"
                            />
                            <button
                              type="button"
                              onClick={addNamedFolder}
                              disabled={!newFolderName.trim()}
                              className="cursor-pointer rounded-lg accent-fill-gradient px-2 py-1 text-xs font-semibold text-on-accent disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setNamingFolder(true);
                              setNewFolderName("");
                            }}
                            className="block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-accent-soft/30 hover:text-foreground"
                          >
                            + New folder
                          </button>
                        )}
                      </div>
                      <div className="border-t border-border px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                          Jump to day
                        </p>
                        <input
                          type="date"
                          value={jumpDate}
                          onChange={(ev) => applyJumpDate(ev.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent/50"
                        />
                        {jumpDate ? (
                          <button
                            type="button"
                            className="mt-1.5 cursor-pointer text-xs font-medium text-accent-link underline-offset-2 hover:underline"
                            onClick={clearJumpDate}
                          >
                            Clear date
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <span className="sm:hidden">
                  <JournalChromeMoreMenu
                    onImport={() => setImportOpen(true)}
                    onSettings={() => setSettingsOpen(true)}
                  />
                </span>
                <button
                  type="button"
                  onClick={createEntry}
                  aria-label="New entry"
                  className="shrink-0 cursor-pointer rounded-xl accent-fill-gradient px-3 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 sm:hidden"
                >
                  + New
                </button>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                {/* sm+: folder + options */}
                <div className="hidden items-center gap-1.5 sm:flex">
                <div ref={folderMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    aria-label="Filter by folder"
                    aria-haspopup="menu"
                    aria-expanded={sidebarMenu === "folder"}
                    onClick={() => {
                      setSidebarMenu((m) => (m === "folder" ? null : "folder"));
                      setNamingFolder(false);
                    }}
                    className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                      selectedFolderId
                        ? "border-accent/40 bg-accent-soft/40 text-foreground"
                        : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                    }`}
                  >
                    <Folder aria-hidden className="size-4" strokeWidth={2} />
                  </button>
                  {sidebarMenu === "folder" ? (
                    <div
                      role="menu"
                      className="absolute left-0 z-30 mt-1 w-52 rounded-xl border border-border bg-card py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onFolderSelect(FOLDER_ALL)}
                        className={`block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/30 ${
                          !selectedFolderId
                            ? "font-semibold text-foreground"
                            : "text-muted"
                        }`}
                      >
                        All entries
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          role="menuitem"
                          onClick={() => onFolderSelect(f.id)}
                          className={`block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/30 ${
                            selectedFolderId === f.id
                              ? "font-semibold text-foreground"
                              : "text-muted"
                          }`}
                        >
                          {f.name}
                        </button>
                      ))}
                      <div className="border-t border-border px-2 py-1.5">
                        {namingFolder ? (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addNamedFolder();
                                }
                              }}
                              placeholder="Folder name"
                              autoFocus
                              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent/50"
                            />
                            <button
                              type="button"
                              onClick={addNamedFolder}
                              disabled={!newFolderName.trim()}
                              className="cursor-pointer rounded-lg accent-fill-gradient px-2 py-1 text-xs font-semibold text-on-accent disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setNamingFolder(true);
                              setNewFolderName("");
                            }}
                            className="block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-accent-soft/30 hover:text-foreground"
                          >
                            + New folder
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <JournalChromeMoreMenu
                  onImport={() => setImportOpen(true)}
                  onSettings={() => setSettingsOpen(true)}
                />
                </div>
              </div>
            </div>
          ) : (
            <div className="relative z-[1] flex flex-col gap-2">
              <button
                type="button"
                onClick={openTodayGratitudeCompose}
                className="w-full cursor-pointer rounded-xl accent-fill-gradient px-3 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                + Add a gratitude for today
              </button>
              <div className="flex items-center gap-2">
                <SearchInput
                  className="min-w-0 flex-1"
                  inputClassName="py-2"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search entries..."
                />
                <div ref={filtersMenuRef} className="relative shrink-0 sm:hidden">
                  <button
                    type="button"
                    aria-label="Jump to a specific day"
                    aria-haspopup="dialog"
                    aria-expanded={sidebarMenu === "filters"}
                    onClick={() =>
                      setSidebarMenu((m) =>
                        m === "filters" ? null : "filters",
                      )
                    }
                    className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                      jumpDate
                        ? "border-accent/40 bg-accent-soft/40 text-foreground"
                        : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                    }`}
                  >
                    <Calendar aria-hidden className="size-4" strokeWidth={2} />
                  </button>
                  {sidebarMenu === "filters" ? (
                    <div
                      className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-border bg-card p-2 shadow-lg"
                      role="dialog"
                      aria-label="Jump to a day"
                    >
                      <p className="text-sm font-medium text-foreground">
                        Jump to a day
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Pick a date to see the entry from that day.
                      </p>
                      <input
                        type="date"
                        value={jumpDate}
                        onChange={(ev) => applyJumpDate(ev.target.value)}
                        className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent/50"
                      />
                      {jumpDate ? (
                        <button
                          type="button"
                          className="mt-1.5 cursor-pointer text-xs font-medium text-accent-link underline-offset-2 hover:underline"
                          onClick={clearJumpDate}
                        >
                          Clear date
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <span className="sm:hidden">
                  <JournalChromeMoreMenu
                    onImport={() => setImportOpen(true)}
                    onSettings={() => setSettingsOpen(true)}
                  />
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <div className="hidden items-center gap-1.5 sm:flex">
                  <div ref={dateMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      title="Jump to a specific day."
                      aria-label="Jump to a specific day."
                      aria-haspopup="dialog"
                      aria-expanded={sidebarMenu === "date"}
                      onClick={() =>
                        setSidebarMenu((m) => (m === "date" ? null : "date"))
                      }
                      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                        jumpDate
                          ? "border-accent/40 bg-accent-soft/40 text-foreground"
                          : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                      }`}
                    >
                      <Calendar aria-hidden className="size-4" strokeWidth={2} />
                    </button>
                    {sidebarMenu === "date" ? (
                      <JumpToDayPopover
                        jumpDate={jumpDate}
                        onPick={applyJumpDate}
                        onClear={clearJumpDate}
                      />
                    ) : null}
                  </div>
                  <JournalChromeMoreMenu
                    onImport={() => setImportOpen(true)}
                    onSettings={() => setSettingsOpen(true)}
                  />
                </div>
              </div>
            </div>
          )}
          <nav
            className={`relative z-[1] min-h-0 space-y-5 pr-1 [scrollbar-gutter:stable] ${
              journalTab === "journal" || journalTab === "gratitude"
                ? "max-sm:grow-0 max-sm:overflow-visible flex-1 overflow-y-auto"
                : "flex-1 overflow-y-auto"
            }`}
            aria-label={
              journalTab === "gratitude" ? "Past gratitudes" : "Past entries"
            }
          >
            {!hydrated ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : sidebarGroups.length === 0 ? (
              <p className="text-sm text-muted">
                {jumpDate && !searchQuery.trim()
                  ? "No entry on this day."
                  : searchQuery.trim() || jumpDate
                    ? "No entries match."
                    : journalTab === "gratitude"
                    ? "No gratitudes yet."
                    : selectedFolderId
                      ? "This folder is empty."
                      : "No entries yet."}
              </p>
            ) : (
              sidebarGroups.map((group) => {
                const weekMoodDots =
                  journalTab === "journal"
                    ? group.entries
                        .map((e) => journalMoodDotColor(e.mood))
                        .filter((c): c is string => Boolean(c))
                    : [];
                return (
                <div key={group.id}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {group.label}
                    </h2>
                    {weekMoodDots.length > 0 ? (
                      <div
                        className="flex shrink-0 items-center gap-0.5"
                        aria-hidden
                      >
                        {weekMoodDots.map((color, i) => (
                          <span
                            key={`${group.id}-dot-${i}`}
                            className="inline-block size-1.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <ul className="space-y-1.5">
                    {group.entries.map((e) => {
                      const isActive = e.id === activeEntryId;
                      if (journalTab === "journal") {
                        const lifeArea = lifeAreaForJournalEntry(e, planDreams);
                        const metaMuted = isActive
                          ? "text-faint"
                          : "text-muted";
                        return (
                          <li key={e.id}>
                            <button
                              type="button"
                              onClick={() => selectEntry(e.id)}
                              className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
                                isActive
                                  ? "border-border border-l-[3px] border-l-accent bg-card text-foreground shadow-sm"
                                  : "border-border bg-card text-foreground hover:border-accent/40 dark:bg-background"
                              }`}
                            >
                              <span className="line-clamp-2 text-sm font-semibold">
                                {sidebarEntryTitle(e.title)}
                              </span>
                              <span className="mt-0.5 line-clamp-2 text-xs text-muted">
                                {entryPreview(e)}
                              </span>
                              <div
                                className={`mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[10px] leading-snug ${isActive ? "border-border-subtle" : "border-border"} ${metaMuted}`}
                              >
                                <span>
                                  Created{" "}
                                  <time dateTime={e.createdAt}>
                                    {formatJournalEntryDate(e.createdAt)}
                                  </time>
                                </span>
                                {lifeArea ? (
                                  <span className="min-w-0 truncate font-medium">
                                    {lifeArea.title}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          </li>
                        );
                      }
                      const metaMuted = isActive
                        ? "text-faint"
                        : "text-muted";
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => selectEntry(e.id)}
                            className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
                              isActive
                                ? "border-border border-l-[3px] border-l-accent bg-card text-foreground shadow-sm"
                                : "border-border bg-card text-foreground hover:border-accent/40 dark:bg-background"
                            }`}
                          >
                            <span className="line-clamp-2 text-sm font-semibold">
                              {sidebarEntryTitle(e.title)}
                            </span>
                            <span className="mt-0.5 line-clamp-2 text-xs text-muted">
                              {entryPreview(e)}
                            </span>
                            <div
                              className={`mt-2 border-t pt-2 text-[10px] leading-snug ${isActive ? "border-border-subtle" : "border-border"} ${metaMuted}`}
                            >
                              Created{" "}
                              <time dateTime={e.createdAt}>
                                {formatJournalEntryDate(e.createdAt)}
                              </time>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                );
              })
            )}
          </nav>
        </aside>
        )}

        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
            journalTab === "journal" || journalTab === "gratitude"
              ? "bg-transparent"
              : ""
          } ${
            (journalTab === "journal" && !mobileJournalEditor) ||
            (journalTab === "gratitude" && !mobileGratitudeCompose)
              ? "max-sm:hidden"
              : ""
          }`}
        >
          {jumpDate && filteredTabEntries.length === 0 ? (
            <div className="flex min-h-[12rem] flex-1 items-center bg-background p-6">
              <p className="text-sm text-muted">No entry on this day.</p>
            </div>
          ) : showGratitudeEditor && activeEntry ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <JournalGratitudeEditor
                createdAt={activeEntry.createdAt}
                lines={gratitudeDraft}
                onChange={onGratitudeChange}
                onDelete={
                  mobileGratitudeCompose ? undefined : deleteActive
                }
                footerNote={
                  mobileGratitudeCompose
                    ? undefined
                    : "Autosaves in this browser. Come back tomorrow for a fresh page; today’s three stay here."
                }
              >
                <JournalEntryMeta
                  mood={activeEntry.mood}
                  tags={activeEntry.tags}
                  onMoodChange={(mood) => patchActive({ mood })}
                  onTagsChange={(tags) => patchActive({ tags })}
                />
              </JournalGratitudeEditor>
            </div>
          ) : hydrated &&
            activeEntryId &&
            activeEntry &&
            !isGratitudeEntry(activeEntry) ? (
            <>
              <JournalRichEditor
                key={`${activeEntryId}-${editorExternalSyncKey}`}
                entryId={activeEntryId}
                initialHtml={initialHtmlForEditor}
                initialTitle={initialTitleForEditor}
                createdAt={activeEntry.createdAt}
                transcribeApiBase={getMedimadeApiBase()}
                hideCreatedDate
                entryMenuBefore={
                  folders.length > 0 ? (
                    <>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Move to folder
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => moveActiveToFolder("")}
                        className={`block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/30 ${
                          !activeEntry?.folderId
                            ? "font-semibold text-foreground"
                            : "text-muted"
                        }`}
                      >
                        No folder
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          role="menuitem"
                          onClick={() => moveActiveToFolder(f.id)}
                          className={`block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent-soft/30 ${
                            activeEntry?.folderId === f.id
                              ? "font-semibold text-foreground"
                              : "text-muted"
                          }`}
                        >
                          {f.name}
                        </button>
                      ))}
                      <div className="my-1 border-t border-border" />
                    </>
                  ) : null
                }
                onHtmlChange={(html) => {
                  latestHtmlRef.current = html;
                  scheduleSave();
                }}
                onTitleChange={(title) => {
                  latestTitleRef.current = title;
                  if (activeEntryId) {
                    setJournalEntryLiveTitle(activeEntryId, title);
                  }
                  scheduleSave();
                }}
                onDelete={deleteActive}
                onConnectLifeArea={openLifeAreaFromActive}
                connectLifeAreaLabel={
                  activeLifeArea
                    ? `Life area: ${activeLifeArea.title}`
                    : "Connect to life area"
                }
                onGenerateMeditation={generateMeditationFromActive}
                headerAfter={
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[12px] text-muted">
                    <time dateTime={activeEntry.createdAt}>
                      {formatJournalEntryDate(activeEntry.createdAt)}
                    </time>
                    <span aria-hidden>·</span>
                    <JournalEntryMeta
                      variant="inline"
                      mood={activeEntry.mood}
                      tags={activeEntry.tags}
                      onMoodChange={(mood) => patchActive({ mood })}
                      onTagsChange={(tags) => patchActive({ tags })}
                    />
                  </div>
                }
              >
                <JournalEntryMeta
                  variant="tags"
                  mood={activeEntry.mood}
                  tags={activeEntry.tags}
                  onMoodChange={(mood) => patchActive({ mood })}
                  onTagsChange={(tags) => patchActive({ tags })}
                />
              </JournalRichEditor>
            </>
          ) : (
            <div className="min-h-[12rem] flex-1 bg-background" />
          )}
        </section>
      </div>
      ) : null}
    </div>
    {journalComposeChrome ? (
      <div
        className="journal-editor-pattern-gutter pointer-events-none min-h-0 min-w-0 flex-1"
        aria-hidden
      />
    ) : null}
    </div>
    <JournalSettingsDialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      entries={entries}
      store={{
        version: 2,
        activeEntryId,
        entries,
        ...(folders.length ? { folders } : {}),
      }}
    />
    <JournalImportDialog
      open={importOpen}
      existing={entries}
      onClose={() => setImportOpen(false)}
      onCommit={commitImport}
    />
    </JournalLockGate>
  );
}
