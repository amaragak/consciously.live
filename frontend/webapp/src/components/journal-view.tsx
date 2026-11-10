import { useLocation, useNavigate } from "react-router-dom";
import { useMvpFlags, mvpFlagsSnapshot } from "@/lib/mvp-flags";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JournalInsightsView } from "@/components/journal-insights-view";
import {
  DelayedPlaceholder,
  EmptyState,
  JournalListPlaceholder,
} from "@/components/loading-placeholder";
import { InsightsNeedSupportLink } from "@/components/insights-need-support-link";
import { scheduleJournalInsightsRefreshAfterLeavingEditor } from "@/components/journal-insights-autorefresh";
import { clearJournalRemoteSessionCache } from "@/lib/journal-remote-cache";
import {
  JOURNAL_APP_BACKGROUND_EVENT,
  JOURNAL_CLOUD_SAVE_EVENT,
  JOURNAL_STORE_APPLIED_EVENT,
  enqueueJournalDelete,
  enqueueJournalUpsert,
  flushJournalOutboxNow,
  getJournalCloudSaveStatus,
  installJournalSyncBootHooks,
  journalCloudSaveLabel,
  journalEntryNeedsSyncNote,
  retryJournalSyncNow,
  scheduleJournalOutboxFlush,
  syncJournal,
  type JournalCloudSaveStatus,
} from "@/lib/journal-sync";
import { JournalRichEditor } from "@/components/journal-rich-editor";
import { JournalVoiceAllowanceBar } from "@/components/journal-voice-allowance-bar";
import { JournalEntryListTitle } from "@/components/journal-prompt-question";
import { journalPromptBlockHtml } from "@/lib/journal-prompts";
import type { JournalPromptSources } from "@/components/journal-prompts-panel";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { loadHealStore } from "@/lib/heal-store";
import { JournalGratitudeEditor } from "@/components/journal-gratitude-editor";
import { JournalEntryMeta } from "@/components/journal-entry-meta";
import { JournalMobileEntryMeta } from "@/components/journal-mobile-entry-meta";
import { JournalSettingsDialog } from "@/components/journal-settings-dialog";
import { JournalImportWorkspace } from "@/components/journal-import-workspace";
import { SearchInput } from "@/components/search-input";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import {
  ArrowDownUp,
  Calendar,
  Check,
  ChevronDown,
  Folder,
  Pencil,
  Play,
  X,
} from "lucide-react";
import {
  JOURNAL_ENTRIES_SORT_CHANGED,
  readJournalEntriesSort,
  setJournalEntriesSort,
  syncJournalEntriesSortFromSettings,
  type JournalEntriesSort,
} from "@/lib/journal-entries-sort-pref";
import { healScreenRisk } from "@/lib/heal-ai";
import { journalMeditationForEntry } from "@/lib/heal-meditation-links";
import { JournalEntryLinks } from "@/components/journal-entry-links";
import {
  consumeReflectMeditationHandoff,
  findReflectionEntryForMeditation,
  reflectionTitleForMeditation,
  withoutReflectionTitlePrefix,
} from "@/lib/journal-meditation-reflect";
import { JournalLockGate } from "@/components/journal-lock-gate";
import { JournalMobileSectionTabs } from "@/components/journal-mobile-section-tabs";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  HEADER_SECTION_TABS_IDLE,
  HEADER_SECTION_TABS_SELECTED,
  HEADER_SECTION_TABS_TRACK,
} from "@/components/header-section-tabs";
import { AppPrimaryTabsDesktop } from "@/components/app-primary-tabs";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import {
  getMedimadeApiBase,
  runJournalInsightsRemote,
} from "@/lib/medimade-api";
import {
  sortByAlgoliaOrder,
  useUserContentSearchIds,
} from "@/lib/use-user-content-search";
import {
  emptyGratitudeLines,
  ensureJournalEntryUrlSlug,
  findJournalEntryByPathSlug,
  findRecentGratitudeWithinHours,
  formatJournalEditedStatus,
  formatJournalEntryDate,
  formatJournalEntryTime,
  formatJournalListEditedNote,
  gratitudeLinesToHtml,
  groupJournalEntriesByLastEdited,
  groupJournalEntriesByWeek,
  groupJournalEntriesForSidebar,
  deriveEntryTitle,
  isGratitudeEntry,
  journalEntryDateIso,
  journalEntryDraftChanged,
  journalEntryHasMeaningfulContent,
  journalEntryHref,
  journalEntryListTitle,
  journalEntryPlainForHandoff,
  journalEntryWasEditedLaterDay,
  armJournalMeditationHandoffJson,
  JOURNAL_MEDITATION_PAYLOAD_KEY,
  loadJournalStoreRaw,
  localDateKeyFromIso,
  mostRecentlyUpdatedId,
  newGratitudeJournalEntry,
  newJournalEntry,
  newJournalFolder,
  promoteJournalEntryForCloud,
  pruneEmptyJournalEntries,
  readJournalStoreSnapshot,
  saveJournalStore,
  subscribeJournalStore,
  stripHtmlToText,
  withoutDemoJournalEntries,
  type JournalEntry,
  type JournalFolder,
  type JournalLink,
  type JournalGratitudeLines,
  type JournalStoreV2,
} from "@/lib/journal-storage";
import { formatGratitudeCompactHeading } from "@/lib/journal-gratitudes";
import { looksLikeUuid } from "@/lib/readable-url";
import {
  clearJournalEntryLiveTitle,
  setJournalEntryLiveTitle,
} from "@/lib/journal-entry-live-title";
import {
  isJournalMoodId,
  journalMoodDotColor,
  journalMoodLabel,
  JOURNAL_MOOD_PILL,
} from "@/lib/journal-moods";
import { newJournalLink } from "@/lib/journal-links";
import { journalEntriesLinkedToLifeArea } from "@/lib/plan-life-area-links";
import { loadPlanDreamsStore, type PlanDream } from "@/lib/plan-dreams";
import { lifeAreaHref } from "@/lib/entity-href";
import { scheduleJournalEntryAnalysis } from "@/lib/journal-entry-analysis-scheduler";
import { themeSlug } from "@/lib/journal-history-insights";

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
  journal: "/journal/entries",
  gratitude: "/journal/gratitudes",
  insights: "/journal/insights",
} as const;

const JOURNAL_SECTION_TABS = [
  { id: "journal" as const, label: "Entries" },
  { id: "gratitude" as const, label: "Gratitudes" },
  { id: "insights" as const, label: "Insights" },
];

function journalSectionFromPath(pathname: string): JournalSection {
  if (
    pathname === "/journal/insights" ||
    pathname.startsWith("/journal/insights/")
  ) {
    return "insights";
  }
  if (
    pathname === "/journal/gratitudes" ||
    pathname.startsWith("/journal/gratitudes/") ||
    pathname === "/journal/gratitude" ||
    pathname.startsWith("/journal/gratitude/")
  ) {
    return "gratitude";
  }
  return "journal";
}

const JOURNAL_RESERVED = new Set([
  "entries",
  "gratitudes",
  "gratitude",
  "insights",
  "guides",
  "import",
  "my",
]);

/** Path slug (or legacy UUID) for a freeform journal entry. */
function journalEntrySlugFromPath(pathname: string): string | null {
  if (
    pathname === "/journal/entries" ||
    pathname === "/journal/entries/" ||
    pathname.startsWith("/journal/gratitude") ||
    pathname.startsWith("/journal/insights") ||
    pathname.startsWith("/journal/guides") ||
    pathname.startsWith("/journal/import")
  ) {
    return null;
  }
  const viaEntries = /^\/journal\/entries\/([^/]+)\/?$/.exec(pathname);
  const viaRoot = /^\/journal\/([^/]+)\/?$/.exec(pathname);
  const raw = viaEntries?.[1] ?? viaRoot?.[1] ?? null;
  if (!raw) return null;
  if (!viaEntries && JOURNAL_RESERVED.has(raw.toLowerCase())) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Path slug (or legacy UUID) for a gratitude entry. */
function gratitudeEntrySlugFromPath(pathname: string): string | null {
  const m =
    /^\/journal\/gratitude(?:s)?\/([^/]+)\/?$/.exec(pathname) ??
    /^\/journal\/gratitudes\/([^/]+)\/?$/.exec(pathname);
  if (!m?.[1]) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(m[1]);
  } catch {
    raw = m[1];
  }
  // Reserved: All list lives at `/journal/gratitudes/all`.
  if (raw.toLowerCase() === "all") return null;
  return raw;
}

/** @deprecated Prefer slug helpers — kept for call sites that still compare ids. */
function journalEntryIdFromPath(pathname: string): string | null {
  return journalEntrySlugFromPath(pathname);
}

function gratitudeEntryIdFromPath(pathname: string): string | null {
  return gratitudeEntrySlugFromPath(pathname);
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
  onRefresh,
  buttonClassName = "h-9 w-9",
}: {
  onImport: () => void;
  onSettings: () => void;
  onRefresh?: () => void;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showVoiceClips, setShowVoiceClips] = useState(true);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/journal-voice-clips-pref").then(async (m) => {
      setShowVoiceClips(m.readShowVoiceClips());
      try {
        const { fetchUserSettings } = await import("@/lib/settings-api");
        const { settings } = await fetchUserSettings();
        if (cancelled) return;
        m.syncShowVoiceClipsFromSettings(settings);
        setShowVoiceClips(m.readShowVoiceClips());
      } catch {
        /* local default */
      }
    });
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<{ show?: boolean }>).detail;
      if (typeof detail?.show === "boolean") setShowVoiceClips(detail.show);
    }
    window.addEventListener("mm-journal-voice-clips-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("mm-journal-voice-clips-changed", onChanged);
    };
  }, []);

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
        className={`flex cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted transition-colors hover:border-accent/40 hover:text-foreground ${buttonClassName}`}
      >
        <IconEntryMore />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[11rem] rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {onRefresh ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRefresh();
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-accent-soft/30"
            >
              Refresh
            </button>
          ) : null}
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
            aria-checked={showVoiceClips}
            onClick={() => {
              const next = !showVoiceClips;
              setShowVoiceClips(next);
              void import("@/lib/journal-voice-clips-pref").then((m) =>
                m.setShowVoiceClips(next),
              );
            }}
            className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-accent-soft/30"
          >
            {showVoiceClips ? "Hide voice clips" : "Show voice clips"}
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

function formatJournalListDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/** Mobile list: weekday + day number (+ month when not this month). */
function journalListDateParts(iso: string): {
  weekday: string;
  day: string;
  month: string | null;
} {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { weekday: "", day: "", month: null };
    const now = new Date();
    const showMonth =
      d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear();
    return {
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
      day: String(d.getDate()),
      month: showMonth
        ? d.toLocaleDateString("en-US", { month: "short" })
        : null,
    };
  } catch {
    return { weekday: "", day: "", month: null };
  }
}

function entryBodyPlain(entry: JournalEntry): string {
  if (isGratitudeEntry(entry)) {
    return (entry.gratitude ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" · ");
  }
  return stripHtmlToText(entry.contentHtml).trim();
}

function entryListIsEmpty(entry: JournalEntry): boolean {
  return !entry.title.trim() && !entryBodyPlain(entry);
}

function entryWordCount(entry: JournalEntry): number {
  const t = entryBodyPlain(entry);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Outlined link chips for the mobile entries list. */
function mobileLinkChipLabels(entry: JournalEntry): string[] {
  const labels: string[] = [];
  for (const link of entry.links ?? []) {
    const name = linkItemName(link);
    if (link.targetType === "heal_item") labels.push(`Heal: ${name}`);
    else labels.push(name);
  }
  if (
    !(entry.links ?? []).some((l) => l.targetType === "meditation") &&
    entry.meditationId
  ) {
    labels.push(entry.meditationSnapshot?.title?.trim() || "Meditation");
  }
  return labels;
}

function MobileJournalListChips({ entry }: { entry: JournalEntry }) {
  const moodId = isJournalMoodId(entry.mood) ? entry.mood : null;
  const mood = moodId ? journalMoodLabel(moodId) : null;
  const moodPill = moodId ? JOURNAL_MOOD_PILL[moodId] : null;
  const links = mobileLinkChipLabels(entry);
  const words = entryWordCount(entry);
  if (!mood && links.length === 0 && words === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {mood && moodPill ? (
        <span
          className="inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-semibold text-foreground"
          style={{ backgroundColor: moodPill.background }}
        >
          {mood}
        </span>
      ) : null}
      {links.map((label) => (
        <span
          key={label}
          className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-[12.5px] text-foreground/80"
        >
          {label}
        </span>
      ))}
      {words > 0 ? (
        <span className="inline-flex h-6 items-center text-[12.5px] text-muted">
          {words} {words === 1 ? "word" : "words"}
        </span>
      ) : null}
    </div>
  );
}

type JournalLinkKind = "Meditation" | "Manifest" | "Heal";

function linkItemName(link: JournalLink): string {
  return (
    link.label?.trim() ||
    link.meditationSnapshot?.title?.trim() ||
    (link.targetType === "meditation"
      ? "Meditation"
      : link.targetType === "heal_item"
        ? "Heal"
        : "Life area")
  );
}

function entryLinkGroups(
  entry: JournalEntry,
): { kind: JournalLinkKind; items: string[] }[] {
  const meds: string[] = [];
  const manifest: string[] = [];
  const heal: string[] = [];
  for (const link of entry.links ?? []) {
    if (link.targetType === "meditation") meds.push(linkItemName(link));
    else if (link.targetType === "life_area") manifest.push(linkItemName(link));
    else if (link.targetType === "heal_item") heal.push(linkItemName(link));
  }
  if (meds.length === 0 && entry.meditationId) {
    meds.push(entry.meditationSnapshot?.title?.trim() || "Meditation");
  }
  const groups: { kind: JournalLinkKind; items: string[] }[] = [];
  if (meds.length) groups.push({ kind: "Meditation", items: meds });
  if (manifest.length) groups.push({ kind: "Manifest", items: manifest });
  if (heal.length) groups.push({ kind: "Heal", items: heal });
  return groups;
}

function entryLinkedToMeditation(entry: JournalEntry): boolean {
  return (
    Boolean(entry.meditationId?.trim()) ||
    (entry.links ?? []).some((link) => link.targetType === "meditation")
  );
}

function LinkKindIcon({ kind }: { kind: JournalLinkKind }) {
  const props = {
    width: 11,
    height: 11,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "Manifest") {
    return (
      <svg {...props}>
        <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
      </svg>
    );
  }
  if (kind === "Heal") {
    return (
      <svg {...props}>
        <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <circle cx="12" cy="6" r="2" />
      <path d="M6 20c1-4 3-6 6-6s5 2 6 6M4 14l4-2M20 14l-4-2" />
    </svg>
  );
}

function JournalLinkChip({
  label,
  items,
  kind,
}: {
  label: string;
  items: string[];
  kind?: JournalLinkKind;
}) {
  return (
    <span className="group/chip relative inline-flex">
      <span className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border border-[#E6D3AE] bg-[#F6EEDD] px-2 text-[11.5px] font-semibold text-[#8A6424]">
        {kind ? <LinkKindIcon kind={kind} /> : null}
        {label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden min-w-[8rem] max-w-[220px] rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-[12px] font-medium text-foreground shadow-lg group-hover/chip:block"
      >
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="block truncate">
            {item}
          </span>
        ))}
      </span>
    </span>
  );
}

export function JournalListChips({
  entry,
  className = "",
  inline = false,
}: {
  entry: JournalEntry;
  className?: string;
  /** Chips sit on the same line as meta text (no top border). */
  inline?: boolean;
}) {
  const groups = entryLinkGroups(entry);
  /** Imported chip lives on the title row — only show other link chips here. */
  if (groups.length === 0) return null;
  const shown = groups.slice(0, 2);
  const rest = groups.slice(2);
  const restItems = rest.flatMap((group) => group.items);
  return (
    <span
      className={
        inline
          ? `inline-flex shrink-0 flex-nowrap gap-1 overflow-hidden ${className}`
          : `mt-1 flex flex-nowrap gap-1 overflow-hidden border-t border-border pt-2 ${className}`
      }
    >
      {shown.map((group) => (
        <JournalLinkChip
          key={group.kind}
          kind={group.kind}
          label={group.kind}
          items={group.items}
        />
      ))}
      {restItems.length > 0 ? (
        <JournalLinkChip label={`+${rest.length}`} items={restItems} />
      ) : null}
    </span>
  );
}

function JournalImportedTitle({
  entry,
  className = "",
}: {
  entry: JournalEntry;
  className?: string;
}) {
  const imported = Boolean(entry.importBatchId);
  if (!imported) {
    return <JournalEntryListTitle entry={entry} className={className} />;
  }
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <JournalLinkChip label="Imported" items={["Brought in from an import"]} />
      <JournalEntryListTitle
        entry={entry}
        className="min-w-0 truncate text-sm font-semibold"
      />
    </span>
  );
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
  // Keep whatever is open (gratitude or journal) so a hydrate/cloud pull
  // cannot swap today's blank gratitude for an unrelated journal entry.
  if (preferred && entries.some((e) => e.id === preferred)) {
    return preferred;
  }
  return mostRecentlyUpdatedId(entries.filter((e) => !isGratitudeEntry(e)));
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
        className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-base outline-none focus:border-accent/50"
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
    null | "folder" | "date" | "filters" | "sort"
  >(null);
  const [entriesSort, setEntriesSort] = useState<JournalEntriesSort>(() =>
    readJournalEntriesSort(),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [draftHasText, setDraftHasText] = useState(false);
  const [supportEntryId, setSupportEntryId] = useState<string | null>(null);
  const { pathname: pathnameRaw, search: locationSearch } = useLocation();
  const pathname = pathnameRaw || "/journal/entries";
  const navigate = useNavigate();
  const section = journalSectionFromPath(pathname);
  const routeEntryId = journalEntryIdFromPath(pathname);
  const routeGratitudeId = gratitudeEntryIdFromPath(pathname);
  /** Mobile journal: editor is its own full-screen route (`/journal/:id`). */
  const mobileJournalEditor =
    section === "journal" && Boolean(routeEntryId);
  /** Mobile gratitudes: day editor is `/journal/gratitudes/:slug`. */
  const mobileGratitudeCompose =
    section === "gratitude" && Boolean(routeGratitudeId);
  /**
   * Mobile insights sub-pages: theme (`/journal/insights/theme/:slug`) and all
   * themes (`/journal/insights/themes`). Legacy letter detail
   * (`/journal/insights/:weekKey`) is no longer routed.
   */
  const mobileInsightsLetter =
    section === "insights" &&
    Boolean(
      /^\/journal\/insights\/(theme\/[^/]+|themes)\/?$/.test(pathname),
    );
  const mobileComposeChrome =
    mobileJournalEditor || mobileGratitudeCompose || mobileInsightsLetter;
  const mvp = useMvpFlags();
  const insightsOpen = section === "insights" && mvp.journalInsights;
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
  /** Chip + filter for the most recent import batch. */
  const [lastImportChip, setLastImportChip] = useState<{
    batchId: string;
    count: number;
  } | null>(null);
  const [importFilterBatchId, setImportFilterBatchId] = useState<string | null>(
    null,
  );
  const listNavRef = useRef<HTMLElement | null>(null);
  const listScrollTopRef = useRef(0);
  const prevSectionRef = useRef<JournalSection | null>(null);
  /** After first journal sync attempt (or skip if no API URL). */
  const [remoteJournalChecked, setRemoteJournalChecked] = useState(false);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<JournalCloudSaveStatus>(
    () => getJournalCloudSaveStatus(),
  );
  /** "Saved" flashes briefly then hides so the date row stays quiet. */
  const [showSavedFlash, setShowSavedFlash] = useState(false);
  const entriesRef = useRef<JournalEntry[]>([]);
  const foldersRef = useRef<JournalFolder[]>([]);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const dateMenuRef = useRef<HTMLDivElement | null>(null);
  const filtersMenuRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const latestHtmlRef = useRef("<p></p>");
  const latestTitleRef = useRef("");
  const latestGratitudeRef = useRef<JournalGratitudeLines>(emptyGratitudeLines());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipCloudPushRef = useRef(false);
  const flushSaveSyncRef = useRef<() => void>(() => {});
  const pullStartYRef = useRef<number | null>(null);

  entriesRef.current = entries;
  foldersRef.current = folders;
  activeIdRef.current = activeEntryId;

  useEffect(() => {
    if (section === "journal" || section === "gratitude") {
      setListTab(section);
    }
    if (section === "insights") {
      if (!mvp.journalInsights) {
        navigate("/journal/entries", { replace: true });
        return;
      }
      setInsightsMounted(true);
    }
  }, [mvp.journalInsights, navigate, section]);

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
        sortMenuRef.current?.contains(t) ||
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

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/settings-api").then(async ({ fetchUserSettings }) => {
      try {
        const { settings } = await fetchUserSettings();
        if (cancelled) return;
        syncJournalEntriesSortFromSettings(settings);
        setEntriesSort(readJournalEntriesSort());
      } catch {
        /* local default */
      }
    });
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<{ sort?: JournalEntriesSort }>).detail;
      if (detail?.sort === "entryDate" || detail?.sort === "lastEdited") {
        setEntriesSort(detail.sort);
      }
    }
    window.addEventListener(JOURNAL_ENTRIES_SORT_CHANGED, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(JOURNAL_ENTRIES_SORT_CHANGED, onChanged);
    };
  }, []);

  /** Restore Entries list scroll after closing an entry on mobile. */
  useEffect(() => {
    if (mobileJournalEditor || mobileGratitudeCompose) return;
    const el = listNavRef.current;
    if (!el) return;
    const top = listScrollTopRef.current;
    if (top <= 0) return;
    requestAnimationFrame(() => {
      el.scrollTop = top;
    });
  }, [mobileJournalEditor, mobileGratitudeCompose, pathname]);

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
    // Keep the open entry even if still blank (e.g. today's new gratitude).
    const loaded = signedIn
      ? pruneEmptyJournalEntries(rawSignedIn!, rawSignedIn!.activeEntryId)
      : loadJournalStoreRaw();
    const stripped = withoutReflectionTitlePrefix(loaded.entries);
    const store = stripped.changed
      ? { ...loaded, entries: stripped.entries }
      : loaded;
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
      stripped.changed ||
      nextActive !== loaded.activeEntryId ||
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

  /** Local-first: paint from cache, then sync (delta pull if last pull > 60s). */
  useEffect(() => {
    if (!hydrated) return;
    installJournalSyncBootHooks();
    if (!signedIn || !getMedimadeApiBase()) {
      setRemoteJournalChecked(true);
      return;
    }
    let cancelled = false;
    void syncJournal({ reason: "journal-open" }).finally(() => {
      if (!cancelled) setRemoteJournalChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, signedIn]);

  /** Sync engine wrote the local store — refresh open UI. */
  useEffect(() => {
    if (!hydrated) return;
    const onApplied = (ev: Event) => {
      const store = (ev as CustomEvent<{ store?: JournalStoreV2 }>).detail
        ?.store;
      if (!store) return;
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
      } else if (openId && !store.entries.some((e) => e.id === openId)) {
        const nextActive = activeIdForJournalTab(
          store.entries,
          store.activeEntryId,
        );
        setActiveEntryId(nextActive);
      }
    };
    window.addEventListener(JOURNAL_STORE_APPLIED_EVENT, onApplied);
    return () =>
      window.removeEventListener(JOURNAL_STORE_APPLIED_EVENT, onApplied);
  }, [hydrated]);

  useEffect(() => {
    const onStatus = (ev: Event) => {
      const status = (ev as CustomEvent<{ status?: JournalCloudSaveStatus }>)
        .detail?.status;
      if (status) setCloudSaveStatus(status);
    };
    window.addEventListener(JOURNAL_CLOUD_SAVE_EVENT, onStatus);
    return () => window.removeEventListener(JOURNAL_CLOUD_SAVE_EVENT, onStatus);
  }, []);

  useEffect(() => {
    if (cloudSaveStatus !== "saved") {
      setShowSavedFlash(false);
      return;
    }
    setShowSavedFlash(true);
    const t = window.setTimeout(() => setShowSavedFlash(false), 2000);
    return () => window.clearTimeout(t);
  }, [cloudSaveStatus]);

  /** Flush draft + outbox on background. */
  useEffect(() => {
    if (!hydrated) return;

    const discardEmptyActiveIfLeaving = () => {
      const id = activeIdRef.current;
      if (!id) return;
      const open = entriesRef.current.find((e) => e.id === id);
      if (!open || journalEntryHasMeaningfulContent(open)) return;
      const next = entriesRef.current.filter((e) => e.id !== id);
      entriesRef.current = next;
      setEntries(next);
      setActiveEntryId(null);
      persist(next, null, foldersRef.current);
    };

    const onBackground = () => {
      flushSaveSyncRef.current();
      discardEmptyActiveIfLeaving();
      flushJournalOutboxNow();
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") onBackground();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(JOURNAL_APP_BACKGROUND_EVENT, onBackground);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(JOURNAL_APP_BACKGROUND_EVENT, onBackground);
    };
  }, [hydrated, persist]);

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
    const next = prev.map((e) => {
      if (e.id !== id) return e;
      return promoteJournalEntryForCloud({
        ...e,
        contentHtml: html,
        title,
        updatedAt: new Date().toISOString(),
        ...(isGratitudeEntry(e) ? { kind: "gratitude" as const, gratitude } : {}),
      });
    });
    entriesRef.current = next;
    setEntries(next);
    persist(next, id);
    const saved = next.find((e) => e.id === id);
    if (saved && journalEntryHasMeaningfulContent(saved)) {
      enqueueJournalUpsert(id);
      scheduleJournalOutboxFlush();
      scheduleJournalEntryAnalysis(saved);
    }
  }, [persist]);

  flushSaveSyncRef.current = flushSaveSync;

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
      const next = prev.map((e) => {
        if (e.id !== id) return e;
        return promoteJournalEntryForCloud({
          ...e,
          contentHtml: html,
          title,
          updatedAt: new Date().toISOString(),
          ...(isGratitudeEntry(e)
            ? { kind: "gratitude" as const, gratitude }
            : {}),
        });
      });
      entriesRef.current = next;
      setEntries(next);
      // Persist after setState — never inside an updater (notifies AppTopBar).
      persist(next, id);
      const saved = next.find((e) => e.id === id);
      if (saved && journalEntryHasMeaningfulContent(saved)) {
        enqueueJournalUpsert(id);
        scheduleJournalOutboxFlush();
        scheduleJournalEntryAnalysis(saved);
      }
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

  useEffect(() => {
    setDraftHasText(
      activeEntry ? stripHtmlToText(activeEntry.contentHtml).length > 0 : false,
    );
  }, [activeEntry]);

  useEffect(() => {
    if (!activeEntry || isGratitudeEntry(activeEntry)) {
      setSupportEntryId(null);
      return;
    }
    const text = stripHtmlToText(activeEntry.contentHtml);
    if (text.length < 8) {
      setSupportEntryId(null);
      return;
    }
    const entryId = activeEntry.id;
    let cancel = false;
    const timer = window.setTimeout(() => {
      void healScreenRisk(text).then((flagged) => {
        if (!cancel) setSupportEntryId(flagged ? entryId : null);
      });
    }, 600);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [activeEntry]);

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

  const meditationFilterId = useMemo(() => {
    try {
      return (
        new URLSearchParams(locationSearch).get("meditationId")?.trim() || null
      );
    } catch {
      return null;
    }
  }, [locationSearch]);

  const [unlinkUndo, setUnlinkUndo] = useState<{
    meditationId: string;
    meditationSource?: JournalEntry["meditationSource"];
    meditationSnapshot?: JournalEntry["meditationSnapshot"];
  } | null>(null);

  useEffect(() => {
    if (!unlinkUndo) return;
    const t = window.setTimeout(() => setUnlinkUndo(null), 8000);
    return () => window.clearTimeout(t);
  }, [unlinkUndo]);

  useEffect(() => {
    setUnlinkUndo(null);
  }, [activeEntryId]);

  const filteredTabEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = tabEntries.filter((e) => {
      if (
        jumpDate &&
        localDateKeyFromIso(journalEntryDateIso(e)) !== jumpDate
      ) {
        return false;
      }
      if (importFilterBatchId && e.importBatchId !== importFilterBatchId) {
        return false;
      }
      if (
        journalTab === "journal" &&
        selectedFolderId &&
        e.folderId !== selectedFolderId
      ) {
        return false;
      }
      if (
        journalTab === "journal" &&
        meditationFilterId &&
        e.meditationId !== meditationFilterId
      ) {
        return false;
      }
      if (!q) return true;
      if (algoliaIds) return algoliaIds.has(e.id);
      const hay = [
        journalEntryListTitle(e, ""),
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
    importFilterBatchId,
    journalTab,
    selectedFolderId,
    meditationFilterId,
    algoliaIds,
    algoliaOrderedIds,
  ]);

  const sidebarGroups = useMemo(() => {
    if (journalTab === "journal") {
      if (entriesSort === "lastEdited") {
        return groupJournalEntriesByLastEdited(filteredTabEntries);
      }
      return groupJournalEntriesByWeek(filteredTabEntries);
    }
    return groupJournalEntriesForSidebar(filteredTabEntries);
  }, [filteredTabEntries, journalTab, entriesSort]);

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

  const promptSources = useMemo((): JournalPromptSources => {
    const entry = activeEntry && !isGratitudeEntry(activeEntry) ? activeEntry : null;
    const linked = new Set<string>();
    const meditations: { id: string; title: string }[] = [];
    for (const link of entry?.links ?? []) {
      if (link.targetType === "meditation") {
        const title =
          link.label?.trim() || link.meditationSnapshot?.title?.trim() || "";
        if (title) meditations.push({ id: link.targetId, title });
        linked.add(link.targetId);
      } else {
        linked.add(link.targetId);
      }
    }
    if (entry?.meditationId) {
      linked.add(entry.meditationId);
      const title = entry.meditationSnapshot?.title?.trim() || "";
      if (title && !meditations.some((m) => m.id === entry.meditationId)) {
        meditations.push({ id: entry.meditationId, title });
      }
    }
    let values: { id: string; text: string }[] = [];
    let healItems: { id: string; title: string }[] = [];
    try {
      values = loadIdeateValuesStore().values.map((value) => ({
        id: value.id,
        text: value.text,
      }));
    } catch {
      values = [];
    }
    try {
      healItems = loadHealStore()
        .items.filter((item) => item.status !== "at_peace")
        .map((item) => ({ id: item.id, title: item.title }));
    } catch {
      healItems = [];
    }
    return {
      areas: planDreams.map((dream) => ({ id: dream.id, title: dream.title })),
      values,
      healItems,
      linkedRefIds: [...linked],
      meditations,
    };
  }, [activeEntry, planDreams]);

  const patchActive = useCallback(
    (partial: Partial<JournalEntry>) => {
      const id = activeIdRef.current;
      if (!id) return;
      const next = entriesRef.current.map((e) => {
        if (e.id !== id) return e;
        return promoteJournalEntryForCloud({
          ...e,
          ...partial,
          updatedAt: new Date().toISOString(),
        });
      });
      entriesRef.current = next;
      setEntries(next);
      persist(next, id);
      const saved = next.find((e) => e.id === id);
      if (saved && journalEntryHasMeaningfulContent(saved)) {
        enqueueJournalUpsert(id);
        scheduleJournalOutboxFlush();
        if (
          "contentHtml" in partial ||
          "title" in partial ||
          "mood" in partial
        ) {
          scheduleJournalEntryAnalysis(saved);
        }
      }
    },
    [persist],
  );

  const deleteActive = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    if (!window.confirm("Delete this entry from this device?")) return;
    enqueueJournalDelete(id);
    scheduleJournalOutboxFlush(200);
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
    if (journalTab === "journal" && journalEntrySlugFromPath(pathname)) {
      if (!nextId) {
        navigate(JOURNAL_SECTION_HREF.journal);
      } else {
        const ensured = ensureJournalEntryUrlSlug(remaining, nextId);
        const entry = ensured.entry;
        navigate(
          entry ? journalEntryHref(entry) : JOURNAL_SECTION_HREF.journal,
        );
      }
    } else if (
      journalTab === "gratitude" &&
      gratitudeEntrySlugFromPath(pathname)
    ) {
      if (!nextId) {
        navigate(JOURNAL_SECTION_HREF.gratitude);
      } else {
        const ensured = ensureJournalEntryUrlSlug(remaining, nextId);
        const entry = ensured.entry;
        navigate(
          entry ? journalEntryHref(entry) : JOURNAL_SECTION_HREF.gratitude,
        );
      }
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

  const navigateToEntry = useCallback(
    (entryId: string, opts?: { replace?: boolean }) => {
      const ensured = ensureJournalEntryUrlSlug(entriesRef.current, entryId);
      if (ensured.entries !== entriesRef.current) {
        entriesRef.current = ensured.entries;
        setEntries(ensured.entries);
        persist(ensured.entries, entryId);
      }
      const entry = ensured.entry;
      if (!entry) return;
      const href = journalEntryHref(entry);
      if (pathname === href) return;
      // Legacy UUID /entries paths → permanent-style replace to readable URL.
      // Also replace bare `/journal/gratitudes` so "open today" does not stack history.
      const replace =
        opts?.replace === true ||
        Boolean(journalEntrySlugFromPath(pathname) && looksLikeUuid(journalEntrySlugFromPath(pathname)!)) ||
        Boolean(gratitudeEntrySlugFromPath(pathname) && looksLikeUuid(gratitudeEntrySlugFromPath(pathname)!)) ||
        pathname.startsWith("/journal/entries/") ||
        pathname === "/journal/gratitudes" ||
        pathname === "/journal/gratitude" ||
        pathname.startsWith("/journal/gratitudes/") ||
        pathname.startsWith("/journal/gratitude/");
      navigate(href, { replace });
    },
    [navigate, pathname, persist],
  );

  const selectEntry = useCallback(
    (nextId: string) => {
      if (listNavRef.current) {
        listScrollTopRef.current = listNavRef.current.scrollTop;
      }
      applyEntrySelection(nextId);
      const entry = entriesRef.current.find((e) => e.id === nextId);
      if (!entry) return;
      if (journalTab === "journal") {
        if (isGratitudeEntry(entry)) return;
        navigateToEntry(nextId);
        return;
      }
      if (journalTab === "gratitude") {
        if (!isGratitudeEntry(entry)) return;
        navigateToEntry(nextId);
      }
    },
    [applyEntrySelection, journalTab, navigateToEntry],
  );

  const applyEntriesSort = useCallback((sort: JournalEntriesSort) => {
    setEntriesSort(sort);
    setJournalEntriesSort(sort);
    setSidebarMenu(null);
  }, []);

  const selectedFolderName = useMemo(() => {
    if (!selectedFolderId) return "All entries";
    return (
      folders.find((f) => f.id === selectedFolderId)?.name?.trim() || "Folder"
    );
  }, [folders, selectedFolderId]);

  /** Deep-link / browser back: sync active entry from readable (or legacy) path. */
  useEffect(() => {
    if (!hydrated || section !== "journal") return;
    if (!routeEntryId) return;
    const found = findJournalEntryByPathSlug(
      entriesRef.current,
      routeEntryId,
      "journal",
    );
    if (!found || isGratitudeEntry(found)) {
      navigate(JOURNAL_SECTION_HREF.journal, { replace: true });
      return;
    }
    if (activeIdRef.current !== found.id) {
      applyEntrySelection(found.id);
    }
    const canonical = journalEntryHref(
      ensureJournalEntryUrlSlug(entriesRef.current, found.id).entry ?? found,
    );
    if (pathname !== canonical) {
      navigateToEntry(found.id, { replace: true });
    }
  }, [
    hydrated,
    section,
    routeEntryId,
    entries,
    applyEntrySelection,
    navigate,
    navigateToEntry,
    pathname,
  ]);

  /** Deep-link / browser back: sync from gratitude path. */
  useEffect(() => {
    if (!hydrated || section !== "gratitude") return;
    if (!routeGratitudeId) return;
    const found = findJournalEntryByPathSlug(
      entriesRef.current,
      routeGratitudeId,
      "gratitude",
    );
    if (!found || !isGratitudeEntry(found)) {
      navigate(JOURNAL_SECTION_HREF.gratitude, { replace: true });
      return;
    }
    if (activeIdRef.current !== found.id) {
      applyEntrySelection(found.id);
    }
    const canonical = journalEntryHref(
      ensureJournalEntryUrlSlug(entriesRef.current, found.id).entry ?? found,
    );
    if (pathname !== canonical) {
      navigateToEntry(found.id, { replace: true });
    }
  }, [
    hydrated,
    section,
    routeGratitudeId,
    entries,
    applyEntrySelection,
    navigate,
    navigateToEntry,
    pathname,
  ]);

  useEffect(() => {
    if (section !== "journal" || !routeEntryId) {
      clearJournalEntryLiveTitle();
      return;
    }
    const found = findJournalEntryByPathSlug(
      entriesRef.current,
      routeEntryId,
      "journal",
    );
    if (!found) return;
    const title =
      found.title?.trim() ||
      deriveEntryTitle(found.contentHtml) ||
      "";
    setJournalEntryLiveTitle(found.id, title);
    return () => clearJournalEntryLiveTitle(found.id);
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
      // Multiple freeform entries can share a day — open the newest for that date.
      const match = tabEntries.find((e) => {
        if (localDateKeyFromIso(journalEntryDateIso(e)) !== value) return false;
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

  const createEntry = useCallback(
    (opts?: {
      title?: string;
      /** Plain text placed in the entry body. */
      body?: string;
      voice?: boolean;
      /** Inserts a prompt block. The title stays empty. */
      prompt?: { id: string; template: string; name?: string };
      meditationId?: string;
      meditationSource?: JournalEntry["meditationSource"];
      meditationSnapshot?: JournalEntry["meditationSnapshot"];
      link?: {
        targetType: "heal_item" | "life_area";
        targetId: string;
        label?: string;
      };
    }) => {
      flushSaveSync();
      const title = opts?.title?.trim() ?? "";
      const body = opts?.body?.trim() ?? "";
      const promptHtml = opts?.prompt
        ? journalPromptBlockHtml(opts.prompt)
        : "";
      const draft = newJournalEntry({
        ...(selectedFolderId ? { folderId: selectedFolderId } : {}),
        ...(title ? { title } : {}),
        ...(opts?.meditationId
          ? {
              meditationId: opts.meditationId,
              ...(opts.meditationSource
                ? { meditationSource: opts.meditationSource }
                : {}),
              ...(opts.meditationSnapshot
                ? { meditationSnapshot: opts.meditationSnapshot }
                : {}),
            }
          : {}),
        // Blank + New stays device-local until title/body/mood/tag/context exist.
        localOnly: true,
      });
      const links = [
        ...(opts?.meditationId
          ? [
              newJournalLink({
                entryId: draft.id,
                targetType: "meditation" as const,
                targetId: opts.meditationId,
                label: opts.meditationSnapshot?.title,
                reflecting: true,
                meditationSource: opts.meditationSource,
                meditationSnapshot: opts.meditationSnapshot,
              }),
            ]
          : []),
        ...(opts?.link?.targetId
          ? [
              newJournalLink({
                entryId: draft.id,
                targetType: opts.link.targetType,
                targetId: opts.link.targetId,
                label: opts.link.label,
              }),
            ]
          : []),
      ];
      const withLinks = links.length ? { ...draft, links } : draft;
      const seeded = promptHtml
        ? { ...withLinks, contentHtml: promptHtml }
        : body
        ? {
            ...withLinks,
            contentHtml: `<p>${body
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</p>`,
          }
        : withLinks;
      const e = promoteJournalEntryForCloud(seeded);
      if (opts?.prompt) {
        try {
          sessionStorage.setItem("journal-focus-prompt", "1");
        } catch {
          /* ignore */
        }
      }
      if (opts?.voice) {
        try {
          sessionStorage.setItem("journal-autostart-voice", "1");
        } catch {
          /* ignore */
        }
      }
      try {
        sessionStorage.setItem("journal-autofocus-body", "1");
      } catch {
        /* ignore */
      }
      const next = [e, ...entriesRef.current];
      entriesRef.current = next;
      setEntries(next);
      persist(next, e.id);
      setActiveEntryId(e.id);
      latestHtmlRef.current = e.contentHtml;
      latestTitleRef.current = e.title;
      latestGratitudeRef.current = emptyGratitudeLines();
      setGratitudeDraft(latestGratitudeRef.current);
      navigateToEntry(e.id);
    },
    [flushSaveSync, persist, selectedFolderId, navigateToEntry],
  );

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
          title:
            entry.title.trim() ||
            journalEntryListTitle(entry, "Untitled"),
          bodyPlain: journalEntryPlainForHandoff(
            latestHtmlRef.current || entry.contentHtml,
          ),
          createdAt: journalEntryDateIso(entry),
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
    navigate("/meditate/create?step=shape&fromJournal=1");
  }, [activeEntry, flushSaveSync, navigate]);

  const openLifeAreaFromActive = useCallback(() => {
    if (activeLifeArea) {
      navigate(lifeAreaHref(activeLifeArea));
      return;
    }
    navigate("/manifest");
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
    navigateToEntry(e.id);
  }, [flushSaveSync, persist, navigateToEntry]);

  // Sidebar / overview deep-links: `?new=1`, optional `title=` + `voice=1`.
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
      pathname === "/journal/gratitudes" ||
      pathname.startsWith("/journal/gratitudes/") ||
      pathname === "/journal/gratitude" ||
      pathname.startsWith("/journal/gratitude/")
    ) {
      createGratitudeEntry();
      return;
    }
    if (params.get("reflect") === "1") {
      const handoff = consumeReflectMeditationHandoff();
      if (handoff) {
        // One reflection entry per meditation — reopen instead of creating again.
        const existing = findReflectionEntryForMeditation(
          handoff.meditationId,
          entriesRef.current,
        );
        if (existing) {
          const next = entriesRef.current.map((e) => {
            if (e.id !== existing.id) return e;
            const already = (e.links ?? []).some(
              (link) =>
                link.targetType === "meditation" &&
                link.targetId === handoff.meditationId,
            );
            const links = already
              ? e.links
              : [
                  newJournalLink({
                    entryId: e.id,
                    targetType: "meditation",
                    targetId: handoff.meditationId,
                    label: handoff.snapshot.title,
                    reflecting: true,
                    meditationSource: handoff.meditationSource,
                    meditationSnapshot: handoff.snapshot,
                  }),
                  ...(e.links ?? []),
                ];
            return {
              ...e,
              links,
              meditationId: handoff.meditationId,
              meditationSource: handoff.meditationSource,
              meditationSnapshot: handoff.snapshot,
              updatedAt: new Date().toISOString(),
            };
          });
          entriesRef.current = next;
          setEntries(next);
          persist(next, existing.id);
          setActiveEntryId(existing.id);
          latestHtmlRef.current = existing.contentHtml;
          latestTitleRef.current = existing.title;
          latestGratitudeRef.current = emptyGratitudeLines();
          setGratitudeDraft(latestGratitudeRef.current);
          navigateToEntry(existing.id, { replace: true });
        } else {
          createEntry({
            title: reflectionTitleForMeditation(handoff.snapshot.title),
            meditationId: handoff.meditationId,
            meditationSource: handoff.meditationSource,
            meditationSnapshot: handoff.snapshot,
          });
        }
      }
      // Never fall through to a blank New entry — Strict Mode remounts can
      // re-run after the handoff was already consumed.
      return;
    }
    const promptTemplate = params.get("promptTemplate")?.trim() || "";
    const promptName = params.get("promptName")?.trim() || undefined;
    const promptId = params.get("promptId")?.trim() || "journal-prompt";
    const title = promptTemplate ? undefined : params.get("title")?.trim() || undefined;
    const body = params.get("body")?.trim() || undefined;
    const voice = params.get("voice") === "1";
    const heal = params.get("heal")?.trim();
    const area = params.get("area")?.trim();
    const link = heal
      ? {
          targetType: "heal_item" as const,
          targetId: heal,
          label: params.get("healTitle")?.trim() || undefined,
        }
      : area
        ? {
            targetType: "life_area" as const,
            targetId: area,
            label: params.get("areaTitle")?.trim() || undefined,
          }
        : undefined;
    createEntry({
      title,
      body,
      voice,
      link,
      ...(promptTemplate
        ? { prompt: { id: promptId, template: promptTemplate, name: promptName } }
        : {}),
    });
  }, [pathname, hydrated, createEntry, createGratitudeEntry]);

  // `?import=1` opens the import modal over Entries; `?imported=` applies the Last import filter.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") === "1") {
      setLastImportChip(null);
      setImportFilterBatchId(null);
      setImportOpen(true);
      params.delete("import");
      const qs = params.toString();
      navigate(`${pathname}${qs ? `?${qs}` : ""}`, { replace: true });
      return;
    }
    const imported = params.get("imported");
    if (!imported || !hydrated) return;
    const count = entriesRef.current.filter(
      (e) => e.importBatchId === imported,
    ).length;
    setLastImportChip({ batchId: imported, count });
    setImportFilterBatchId(imported);
    params.delete("imported");
    const qs = params.toString();
    navigate(`${pathname}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [hydrated, navigate, pathname]);

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
    const existing = findRecentGratitudeWithinHours(entriesRef.current, 24);
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
    navigateToEntry(id);
  }, [openTodayGratitude, navigateToEntry]);

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

    if (section === "gratitude") {
      // Hub is its own page (`JournalGratitudesHub`). Only honor `?new=1` here.
      if (gratitudeEntryIdFromPath(pathname)) return;
      if (
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("new") === "1"
      ) {
        return;
      }
      return;
    }

    if (prev === null || prev === section) return;
    activateJournalList();
  }, [hydrated, section, pathname, activateJournalList]);

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
    journalTab === "gratitude" &&
    !insightsOpen &&
    hydrated &&
    Boolean(activeEntry) &&
    isGratitudeEntry(activeEntry!);

  const journalComposeChrome =
    (journalTab === "journal" || journalTab === "gratitude") && !insightsOpen;
  /** Insights: flush rail + content like journal compose (no centred page padding). */
  const journalFlushChrome = journalComposeChrome || insightsOpen;

  const dismissLastImportChip = useCallback(() => {
    setLastImportChip(null);
    setImportFilterBatchId(null);
  }, []);

  const openImportModal = useCallback(() => {
    setLastImportChip(null);
    setImportFilterBatchId(null);
    setImportOpen(true);
  }, []);

  const lastImportChipEl =
    lastImportChip != null ? (
      <button
        type="button"
        aria-pressed={Boolean(importFilterBatchId)}
        aria-label={`Last import, ${lastImportChip.count} entries. Clear filter.`}
        onClick={dismissLastImportChip}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${
          importFilterBatchId
            ? "border-[#E6D3AE] bg-[#F6EEDD] text-[#8A6424]"
            : "border-border bg-card text-muted hover:text-foreground"
        }`}
      >
        Last import · {lastImportChip.count}
        <span
          aria-hidden
          className="ml-0.5 inline-flex size-5 items-center justify-center text-[18px] font-normal leading-none"
        >
          ×
        </span>
      </button>
    ) : null;

    return (
    <JournalLockGate>
    {/* Match Chat: sidebar + writing stay inside max-w-6xl; pattern gutter takes the right strip. */}
    <div
      className={`flex min-h-0 w-full min-w-0 flex-1 bg-transparent ${
        mobileJournalEditor || mobileGratitudeCompose
          ? "max-sm:overflow-visible sm:overflow-hidden"
          : "max-sm:overflow-visible overflow-hidden"
      }`}
    >
    <div
      className={`flex h-full min-h-0 w-full min-w-0 flex-col ${
        mobileJournalEditor || mobileGratitudeCompose
          ? "max-sm:overflow-visible sm:overflow-hidden"
          : "max-sm:overflow-visible overflow-hidden"
      } ${
        !mobileJournalEditor &&
        !mobileGratitudeCompose &&
        !mobileInsightsLetter
          ? "journal-mobile-paisley-bg"
          : ""
      } ${
        journalFlushChrome
          ? "relative z-[1] max-w-6xl border-r-[0.5px] border-border px-0 pb-0 pt-0"
          : "mx-auto max-w-6xl px-4 pb-6 pt-2 sm:px-6 sm:pb-6 sm:pt-4"
      }`}
    >
      <div
        className={`shrink-0 ${
          journalComposeChrome ? "px-4 sm:px-6" : ""
        } ${mobileComposeChrome ? "max-sm:hidden" : ""} ${
          journalFlushChrome ? "mb-0" : "mb-3 md:mb-0"
        }`}
      >
        {/* Desktop: section tabs in the top-bar centre (same as Library). */}
        <AppPrimaryTabsDesktop>
          <SegmentedPillTabs
            aria-label="Journal section"
            value={section}
            onChange={(id) => {
              flushSaveSync();
              navigate(JOURNAL_SECTION_HREF[id]);
            }}
            className={HEADER_SECTION_TABS_TRACK}
            idleClassName={HEADER_SECTION_TABS_IDLE}
            selectedClassName={HEADER_SECTION_TABS_SELECTED}
            options={JOURNAL_SECTION_TABS.filter(
              (tab) => tab.id !== "insights" || mvp.journalInsights,
            )}
          />
        </AppPrimaryTabsDesktop>
        {/*
          Mobile (previous): other Journal sub-nav / breadcrumb trail for
          Entries · Gratitudes · Insights. Replaced by CardSegmentTabs below
          the header (consciously-journal-tabs-v2).
        */}
        {/* Sub-pill under floating header — no in-page card spacing. */}
        {!mobileComposeChrome ? (
          <JournalMobileSectionTabs
            value={section}
            onBeforeNavigate={flushSaveSync}
            className="md:hidden"
          />
        ) : null}
      </div>

      {insightsMounted ? (
        <div
          className={
            insightsOpen
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "hidden"
          }
          aria-hidden={!insightsOpen}
        >
          <JournalInsightsView />
        </div>
      ) : null}
      {!insightsOpen ? (
      <div
        className={`flex min-h-0 flex-1 ${
          mobileJournalEditor
            ? "max-sm:overflow-visible sm:overflow-hidden"
            : journalTab === "journal" || journalTab === "gratitude"
              ? "max-sm:overflow-visible overflow-hidden"
              : "overflow-hidden"
        } ${
          journalTab === "journal" || journalTab === "gratitude"
            ? "flex-col gap-0 md:flex-row"
            : "flex-col gap-6 lg:flex-row lg:gap-4"
        }`}
      >
        {journalTab === "journal" && sidebarCollapsed ? (
          <aside
            className="relative z-[1] hidden shrink-0 flex-col items-center gap-2 overflow-hidden border-r-[0.5px] border-sidebar-border bg-surface-rail px-1.5 py-3 md:flex"
          >
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-label="Expand journal list"
              className="relative z-[1] flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground"
            >
              <JournalSidebarChevron dir="right" />
            </button>
            <PrimaryCreateButton
              variant="compact"
              onClick={() => createEntry()}
              aria-label="New entry"
              className="relative z-[1]"
            />
          </aside>
        ) : (
        <aside
          className={`flex shrink-0 flex-col ${
            journalTab === "journal" || journalTab === "gratitude"
              ? `relative z-10 min-h-0 gap-3 overflow-hidden max-sm:overflow-visible border-b-[0.5px] border-sidebar-border bg-surface-rail px-3 pb-3 pt-3 max-sm:border-transparent max-sm:bg-transparent md:w-[180px] md:shrink-0 md:self-stretch md:border-b-0 md:border-r-[0.5px] lg:w-[220px] xl:w-[260px] ${
                  mobileComposeChrome
                    ? "max-sm:hidden"
                    : "max-sm:h-fit max-sm:max-h-full max-sm:shrink-0 max-sm:overflow-visible max-sm:pb-5 max-sm:shadow-none"
                }`
              : `gap-3 overflow-visible border-b border-border pb-4 lg:max-h-none lg:w-64 lg:border-b-0 lg:pb-0 max-h-[22rem] ${
                  mobileComposeChrome ? "max-sm:hidden" : ""
                }`
          }`}
        >
          {journalTab === "journal" ? (
            <div className="relative z-30 flex flex-col gap-2 overflow-visible">
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  aria-label="Collapse journal list"
                  className="hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted hover:text-foreground md:flex"
                >
                  <JournalSidebarChevron dir="left" />
                </button>
                <PrimaryCreateButton
                  onClick={() => createEntry()}
                  className="min-w-0 flex-1"
                >
                  New entry
                </PrimaryCreateButton>
              </div>
              <div className="flex flex-col gap-2 overflow-visible max-sm:rounded-[18px] max-sm:border max-sm:border-border max-sm:bg-card max-sm:p-2.5">
                <div className="flex items-center gap-2">
                  <SearchInput
                    className="min-w-0 flex-1"
                    inputClassName="py-2 max-sm:h-[46px] max-sm:bg-[color:var(--surface)] max-sm:py-0"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search entries"
                  />
                  <PrimaryCreateButton
                    onClick={() => createEntry()}
                    aria-label="New entry"
                    className="h-[46px] shrink-0 py-0 sm:hidden"
                  >
                    New
                  </PrimaryCreateButton>
                </div>
                <div className="flex items-center gap-1.5">
                  <div ref={folderMenuRef} className="relative min-w-0 shrink">
                    <button
                      type="button"
                      aria-label="Filter by folder"
                      aria-haspopup="menu"
                      aria-expanded={sidebarMenu === "folder"}
                      onClick={() => {
                        setSidebarMenu((m) =>
                          m === "folder" ? null : "folder",
                        );
                        setNamingFolder(false);
                      }}
                      className={`flex h-[40px] max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[14px] font-semibold transition-colors sm:h-9 ${
                        selectedFolderId
                          ? "border-transparent bg-nav text-nav-foreground"
                          : "border-border bg-card text-foreground hover:border-accent/40 max-sm:bg-background"
                      }`}
                    >
                      <Folder
                        aria-hidden
                        className="size-4 shrink-0"
                        strokeWidth={1.8}
                      />
                      <span className="min-w-0 truncate">
                        {selectedFolderName}
                      </span>
                      {selectedFolderId ? (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Clear folder filter"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onFolderSelect(FOLDER_ALL);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              onFolderSelect(FOLDER_ALL);
                            }
                          }}
                          className="ml-0.5 flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/15"
                        >
                          <X
                            aria-hidden
                            className="size-3.5"
                            strokeWidth={2.2}
                          />
                        </span>
                      ) : (
                        <ChevronDown
                          aria-hidden
                          className="size-4 shrink-0 opacity-60"
                          strokeWidth={2}
                        />
                      )}
                    </button>
                    {sidebarMenu === "folder" ? (
                      <div
                        role="menu"
                        className="absolute left-0 z-50 mt-1 w-56 rounded-xl border border-border bg-card py-1 shadow-lg"
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
                                onChange={(e) =>
                                  setNewFolderName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addNamedFolder();
                                  }
                                }}
                                placeholder="Folder name"
                                autoFocus
                                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-base outline-none focus:border-accent/50"
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
                            className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-base outline-none focus:border-accent/50"
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
                  <div ref={sortMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Sort entries"
                      aria-haspopup="menu"
                      aria-expanded={sidebarMenu === "sort"}
                      onClick={() =>
                        setSidebarMenu((m) => (m === "sort" ? null : "sort"))
                      }
                      className="flex h-[40px] cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[14px] font-semibold text-foreground transition-colors hover:border-accent/40 max-sm:bg-background sm:h-9"
                    >
                      <ArrowDownUp
                        aria-hidden
                        className="size-4 shrink-0"
                        strokeWidth={1.8}
                      />
                      <span className="whitespace-nowrap">
                        {entriesSort === "lastEdited"
                          ? "Last edited"
                          : "Entry date"}
                      </span>
                      <ChevronDown
                        aria-hidden
                        className="size-4 shrink-0 opacity-60"
                        strokeWidth={2}
                      />
                    </button>
                    {sidebarMenu === "sort" ? (
                      <div
                        role="menu"
                        className="absolute left-0 z-50 mt-1 w-[14rem] rounded-xl border border-border bg-card py-1 shadow-lg"
                      >
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          Sort by
                        </p>
                        {(
                          [
                            ["entryDate", "Entry date"],
                            ["lastEdited", "Last edited"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={entriesSort === id}
                            onClick={() => applyEntriesSort(id)}
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-[15px] text-foreground hover:bg-accent-soft/30"
                          >
                            <span className="min-w-0 flex-1">{label}</span>
                            {entriesSort === id ? (
                              <Check
                                aria-hidden
                                className="size-4 shrink-0 text-[#8A6424]"
                                strokeWidth={2.4}
                              />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span className="ml-auto shrink-0">
                    <JournalChromeMoreMenu
                      onImport={openImportModal}
                      onSettings={() => setSettingsOpen(true)}
                      onRefresh={() => {
                        void syncJournal({
                          reason: "pull-to-refresh",
                          forcePull: true,
                        });
                      }}
                      buttonClassName="h-[40px] w-[40px] bg-[color:var(--surface)] sm:h-9 sm:w-9 sm:bg-background"
                    />
                  </span>
                </div>
              </div>
              <div className="max-sm:px-1 max-sm:pt-2">
                <JournalVoiceAllowanceBar compact />
              </div>
              {lastImportChipEl ? (
                <div className="flex items-center gap-1.5">{lastImportChipEl}</div>
              ) : null}
            </div>
          ) : (
            <div className="relative z-20 flex flex-col gap-2">
              <PrimaryCreateButton
                onClick={openTodayGratitudeCompose}
                className="w-full"
              >
                Add a gratitude for today
              </PrimaryCreateButton>
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
                      className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-border bg-card p-2 shadow-lg"
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
                        className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-base outline-none focus:border-accent/50"
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
                    onImport={openImportModal}
                    onSettings={() => setSettingsOpen(true)}
                    onRefresh={() => {
                      void syncJournal({
                        reason: "pull-to-refresh",
                        forcePull: true,
                      });
                    }}
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
                    onImport={openImportModal}
                    onSettings={() => setSettingsOpen(true)}
                    onRefresh={() => {
                      void syncJournal({
                        reason: "pull-to-refresh",
                        forcePull: true,
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          <nav
            ref={listNavRef}
            className={`relative z-0 min-h-0 space-y-5 pr-1 [scrollbar-gutter:stable] ${
              journalTab === "journal" || journalTab === "gratitude"
                ? "max-sm:grow-0 max-sm:overflow-visible flex-1 overflow-y-auto"
                : "flex-1 overflow-y-auto"
            }`}
            aria-label={
              journalTab === "gratitude" ? "Past gratitudes" : "Past entries"
            }
            onTouchStart={(ev) => {
              const el = listNavRef.current;
              if (!el || el.scrollTop > 0) {
                pullStartYRef.current = null;
                return;
              }
              pullStartYRef.current = ev.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(ev) => {
              const start = pullStartYRef.current;
              pullStartYRef.current = null;
              if (start == null) return;
              const end = ev.changedTouches[0]?.clientY ?? start;
              if (end - start < 72) return;
              if (!signedIn) return;
              void syncJournal({
                reason: "pull-to-refresh",
                forcePull: true,
              });
            }}
          >
            {!hydrated ? (
              <DelayedPlaceholder active>
                {/* <p className="text-sm text-muted">Loading…</p> */}
                <JournalListPlaceholder />
              </DelayedPlaceholder>
            ) : sidebarGroups.length === 0 ? (
              searchQuery.trim() || jumpDate ? (
                <EmptyState
                  message="Nothing matches these filters"
                  actionLabel="Clear filters"
                  onAction={() => {
                    setSearchQuery("");
                    clearJumpDate();
                  }}
                />
              ) : journalTab === "gratitude" ? (
                <EmptyState message="No gratitudes yet" />
              ) : selectedFolderId ? (
                <EmptyState message="This folder is empty." />
              ) : (
                <EmptyState
                  message="No entries yet"
                  actionLabel="New entry"
                  onAction={() => createEntry()}
                />
              )
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
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A6424] max-sm:text-[11.5px]">
                    {group.label}
                  </h2>
                    {weekMoodDots.length > 0 ? (
                      <div
                        className="hidden shrink-0 items-center gap-0.5 sm:flex"
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
                  {/* Mobile journal: one card per group with hairline rows. */}
                  {journalTab === "journal" ? (
                    <ul className="overflow-hidden rounded-[18px] border border-border bg-card px-3.5 sm:hidden">
                      {group.entries.map((e, index) => {
                        const iso = journalEntryDateIso(e);
                        const parts = journalListDateParts(iso);
                        const dayKey = localDateKeyFromIso(iso);
                        const prev = index > 0 ? group.entries[index - 1] : null;
                        const prevDayKey = prev
                          ? localDateKeyFromIso(journalEntryDateIso(prev))
                          : null;
                        const isFirstOfDay = dayKey !== prevDayKey;
                        const sameDayCount = group.entries.filter(
                          (other) =>
                            localDateKeyFromIso(journalEntryDateIso(other)) ===
                            dayKey,
                        ).length;
                        const timeLabel = formatJournalEntryTime(iso);
                        const empty = entryListIsEmpty(e);
                        const body = entryBodyPlain(e);
                        return (
                          <li
                            key={e.id}
                            className={
                              index > 0 ? "border-t border-border" : undefined
                            }
                          >
                            <button
                              type="button"
                              onClick={() => selectEntry(e.id)}
                              className="flex w-full cursor-pointer gap-3.5 bg-transparent py-3.5 text-left transition-colors"
                            >
                              <time
                                dateTime={iso}
                                className="flex w-11 shrink-0 flex-col items-center gap-0"
                              >
                                {isFirstOfDay ? (
                                  <>
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8A6424]">
                                      {parts.weekday}
                                    </span>
                                    <span className="font-display text-[26px] leading-none text-foreground">
                                      {parts.day}
                                    </span>
                                    {parts.month ? (
                                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                                        {parts.month}
                                      </span>
                                    ) : sameDayCount === 1 && timeLabel ? (
                                      <span className="mt-0.5 text-[10px] leading-none text-muted">
                                        {timeLabel}
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="pt-1 text-center text-[11px] leading-snug text-muted">
                                    {timeLabel}
                                  </span>
                                )}
                              </time>
                              <span className="flex min-w-0 flex-1 flex-col gap-1">
                                {empty ? (
                                  <span className="text-[15px] italic leading-snug text-muted">
                                    Nothing written yet. Tap to start.
                                  </span>
                                ) : (
                                  <>
                                    <JournalImportedTitle
                                      entry={e}
                                      className="text-[16px] font-semibold leading-snug text-foreground"
                                    />
                                    {body ? (
                                      <span className="line-clamp-2 text-[14px] leading-snug text-foreground/80">
                                        {body}
                                      </span>
                                    ) : null}
                                    <MobileJournalListChips entry={e} />
                                  </>
                                )}
                                {(() => {
                                  const editedNote = formatJournalListEditedNote(
                                    e,
                                    entriesSort,
                                  );
                                  return editedNote ? (
                                    <span className="flex items-center gap-1 pt-0.5 text-[12.5px] text-muted">
                                      <Pencil
                                        aria-hidden
                                        className="size-3 shrink-0"
                                        strokeWidth={1.8}
                                      />
                                      {editedNote}
                                    </span>
                                  ) : null;
                                })()}
                                {!empty && journalEntryNeedsSyncNote(e.id) ? (
                                  <span className="text-[12px] text-muted">
                                    Not synced yet
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <ul
                    className={
                      journalTab === "journal"
                        ? "hidden space-y-1.5 sm:block"
                        : "space-y-1.5"
                    }
                  >
                    {group.entries.map((e, index) => {
                      const isActive = e.id === activeEntryId;
                      if (journalTab === "journal") {
                      const iso = journalEntryDateIso(e);
                      const dayKey = localDateKeyFromIso(iso);
                      const prev = index > 0 ? group.entries[index - 1] : null;
                      const prevDayKey = prev
                        ? localDateKeyFromIso(journalEntryDateIso(prev))
                        : null;
                      const isFirstOfDay = dayKey !== prevDayKey;
                      const timeLabel = formatJournalEntryTime(iso);
                      const dateLabel = isFirstOfDay
                        ? formatJournalListDate(iso)
                        : timeLabel;
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => selectEntry(e.id)}
                              className={`flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                              isActive
                                  ? "border-border border-l-[3px] border-l-selected bg-card text-foreground shadow-sm"
                                  : "border-border bg-card text-foreground hover:border-accent/40 dark:bg-background"
                            }`}
                          >
                            <JournalImportedTitle
                              entry={e}
                              className="line-clamp-2 text-sm font-semibold"
                            />
                              <span className="truncate text-[12.5px] text-foreground/80">
                                <time dateTime={iso} className="text-muted">
                                  {dateLabel}
                                </time>
                                {isFirstOfDay && timeLabel ? (
                                  <>
                                    <span className="text-muted"> · </span>
                                    <span className="text-muted">{timeLabel}</span>
                                  </>
                                ) : null}
                                <span className="text-muted"> · </span>
                                {entryPreview(e)}
                              </span>
                              <JournalListChips entry={e} />
                              {(() => {
                                const editedNote = formatJournalListEditedNote(
                                  e,
                                  entriesSort,
                                );
                                return editedNote ? (
                                  <span className="flex items-center gap-1 text-[11px] text-muted">
                                    <Pencil
                                      aria-hidden
                                      className="size-3 shrink-0"
                                      strokeWidth={1.8}
                                    />
                                    {editedNote}
                                  </span>
                                ) : null;
                              })()}
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
                                ? "border-border border-l-[3px] border-l-selected bg-card text-foreground shadow-sm"
                                : "border-border bg-card text-foreground hover:border-accent/40 dark:bg-background"
                            }`}
                          >
                            <JournalImportedTitle
                              entry={e}
                              className="line-clamp-2 text-sm font-semibold"
                            />
                            <span className="mt-0.5 line-clamp-2 text-xs text-muted">
                              {entryPreview(e)}
                            </span>
                            <div
                              className={`mt-2 border-t-[0.5px] border-border-subtle pt-2 text-[10px] leading-snug ${metaMuted}`}
                            >
                              <time dateTime={journalEntryDateIso(e)}>
                                {formatJournalEntryDate(journalEntryDateIso(e))}
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
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${
            mobileJournalEditor
              ? "max-sm:overflow-visible sm:overflow-hidden"
              : "overflow-hidden"
          } ${
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
            <div className="flex min-h-[12rem] flex-1 items-center bg-[color:var(--journal-warm-bg)] p-6">
              <p className="text-sm text-muted">No entry on this day.</p>
            </div>
          ) : showGratitudeEditor && activeEntry ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <JournalGratitudeEditor
                createdAt={journalEntryDateIso(activeEntry)}
                lines={gratitudeDraft}
                onChange={onGratitudeChange}
                headingVariant="compact"
                compactHeading={formatGratitudeCompactHeading(
                  journalEntryDateIso(activeEntry),
                )}
                onDelete={
                  mobileGratitudeCompose ? undefined : deleteActive
                }
                footerNote={
                  mobileGratitudeCompose
                    ? journalCloudSaveLabel(cloudSaveStatus) ?? undefined
                    : journalCloudSaveLabel(cloudSaveStatus) ??
                      "Autosaves to your account. Come back tomorrow for a fresh page; today’s three stay here."
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
            <div
              className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${
                mobileJournalEditor
                  ? "max-sm:overflow-visible sm:overflow-hidden"
                  : "overflow-hidden"
              }`}
            >
              <JournalRichEditor
                key={`${activeEntryId}-${editorExternalSyncKey}`}
                entryId={activeEntryId}
                initialHtml={initialHtmlForEditor}
                initialTitle={initialTitleForEditor}
                entryDate={journalEntryDateIso(activeEntry)}
                createdAt={activeEntry.createdAt}
                updatedAt={activeEntry.updatedAt}
                onEntryDateChange={(iso) => patchActive({ entryDate: iso })}
                syncStatusLabel={(() => {
                  const emptyStub =
                    activeEntry &&
                    !journalEntryHasMeaningfulContent(activeEntry) &&
                    !journalEntryNeedsSyncNote(activeEntry.id);
                  // Empty new entries never show save errors.
                  if (emptyStub) return null;
                  if (cloudSaveStatus === "saving") {
                    return journalCloudSaveLabel("saving");
                  }
                  if (cloudSaveStatus === "offline") {
                    return journalCloudSaveLabel("offline");
                  }
                  if (cloudSaveStatus === "error") {
                    return journalCloudSaveLabel("error");
                  }
                  if (cloudSaveStatus === "saved" && showSavedFlash) {
                    return journalCloudSaveLabel("saved");
                  }
                  if (
                    activeEntry &&
                    journalEntryWasEditedLaterDay(activeEntry)
                  ) {
                    return formatJournalEditedStatus(
                      activeEntry.updatedAt || activeEntry.createdAt,
                    );
                  }
                  return null;
                })()}
                syncStatusCanRetry={
                  cloudSaveStatus === "error" &&
                  Boolean(
                    activeEntry &&
                      (journalEntryHasMeaningfulContent(activeEntry) ||
                        journalEntryNeedsSyncNote(activeEntry.id)),
                  )
                }
                onSyncRetry={() => retryJournalSyncNow()}
                highlightQuote={(() => {
                  try {
                    const q = new URLSearchParams(window.location.search).get(
                      "highlight",
                    );
                    return q?.trim() || null;
                  } catch {
                    return null;
                  }
                })()}
                fromTheme={(() => {
                  const name = new URLSearchParams(locationSearch)
                    .get("fromTheme")
                    ?.trim();
                  if (!name) return null;
                  return {
                    name,
                    onBack: () => {
                      flushSaveSync();
                      const idx = (
                        window.history.state as { idx?: number } | null
                      )?.idx;
                      if (typeof idx === "number" && idx > 0) navigate(-1);
                      else
                        navigate(
                          `/journal/insights/theme/${encodeURIComponent(themeSlug(name))}`,
                        );
                    },
                  };
                })()}
                transcribeApiBase={getMedimadeApiBase()}
                hideCreatedDate
                mobileCardLayout={mobileJournalEditor}
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
                  setDraftHasText(stripHtmlToText(html).length > 0);
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
                placeholder={
                  activeEntry.meditationId
                    ? "What came up for you?"
                    : "Write what's on your mind…"
                }
                promptSources={promptSources}
                emptyBodyPrompts={
                  activeEntry.meditationId
                    ? [
                        "What did you notice in your body?",
                        "Did anything shift?",
                        "What will you take into today?",
                      ]
                    : undefined
                }
                headerAfter={
                  <>
                    {mobileJournalEditor ? (
                      <div className="sm:hidden">
                        <JournalMobileEntryMeta
                          entry={activeEntry}
                          onMoodChange={(mood) => patchActive({ mood })}
                          onTagsChange={(tags) => patchActive({ tags })}
                          onChange={patchActive}
                        />
                      </div>
                    ) : null}
                    <div
                      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[12px] text-muted ${
                        mobileJournalEditor ? "hidden sm:flex" : ""
                      }`}
                    >
                      <span className="relative inline-flex items-center">
                        <button
                          type="button"
                          className="cursor-pointer text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline"
                          onClick={(ev) => {
                            const wrap = ev.currentTarget.parentElement;
                            const input = wrap?.querySelector(
                              'input[type="date"]',
                            ) as HTMLInputElement | null;
                            if (!input) return;
                            try {
                              input.showPicker?.();
                            } catch {
                              input.click();
                            }
                          }}
                        >
                          <time dateTime={journalEntryDateIso(activeEntry)}>
                            {formatJournalEntryDate(
                              journalEntryDateIso(activeEntry),
                            )}
                          </time>
                        </button>
                        <input
                          type="date"
                          value={localDateKeyFromIso(
                            journalEntryDateIso(activeEntry),
                          )}
                          onChange={(ev) => {
                            const v = ev.target.value;
                            if (!v) return;
                            const [ys, ms, ds] = v.split("-").map(Number);
                            if (!ys || !ms || !ds) return;
                            const d = new Date(ys, ms - 1, ds, 12, 0, 0, 0);
                            patchActive({ entryDate: d.toISOString() });
                          }}
                          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                          tabIndex={-1}
                          aria-label="Entry date"
                        />
                      </span>
                      {/* Previous stray "·" between date and mood pills. */}
                      <span aria-hidden>·</span>
                      <JournalEntryMeta
                        variant="inline"
                        mood={activeEntry.mood}
                        tags={activeEntry.tags}
                        onMoodChange={(mood) => patchActive({ mood })}
                        onTagsChange={(tags) => patchActive({ tags })}
                      />
                      {supportEntryId === activeEntry.id ? (
                        <InsightsNeedSupportLink className="ml-auto shrink-0" />
                      ) : null}
                    </div>
                  </>
                }
                belowHeader={
                  <div className={mobileJournalEditor ? "hidden sm:block" : undefined}>
                  {(() => {
                    const made = journalMeditationForEntry(activeEntry.id);
                    if (!made) return null;
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/meditate/library/creations?focus=pending:${encodeURIComponent(made.jobId)}&play=1`,
                          )
                        }
                        className="mb-2 inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold"
                      >
                        <Play className="size-3.5" aria-hidden />
                        Meditation · {made.title}
                      </button>
                    );
                  })()}
                  <JournalEntryLinks entry={activeEntry} onChange={patchActive} />
                  </div>
                }
              >
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1">
                    <JournalEntryMeta
                      variant="tags"
                      mood={activeEntry.mood}
                      tags={activeEntry.tags}
                      onMoodChange={(mood) => patchActive({ mood })}
                      onTagsChange={(tags) => patchActive({ tags })}
                    />
                  </div>
                  {draftHasText && !entryLinkedToMeditation(activeEntry) ? (
                    <button
                      type="button"
                      onClick={generateMeditationFromActive}
                      className="inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-[14px] font-semibold text-foreground"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="6" r="2" />
                        <path d="M6 20c1-4 3-6 6-6s5 2 6 6M4 14l4-2M20 14l-4-2" />
                      </svg>
                      Create meditation
                    </button>
                  ) : null}
                </div>
              </JournalRichEditor>
              {unlinkUndo ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
                  <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">
                    <span className="text-foreground">Meditation unlinked</span>
                    <button
                      type="button"
                      className="cursor-pointer font-semibold text-accent-link"
                      onClick={() => {
                        patchActive({
                          meditationId: unlinkUndo.meditationId,
                          meditationSource: unlinkUndo.meditationSource,
                          meditationSnapshot: unlinkUndo.meditationSnapshot,
                        });
                        setUnlinkUndo(null);
                      }}
                    >
                      Undo
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="min-h-[12rem] flex-1 bg-[color:var(--journal-warm-bg)]" />
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
    <JournalImportWorkspace
      open={importOpen}
      onClose={() => setImportOpen(false)}
      onImported={(summary) => {
        const store = withoutDemoJournalEntries(loadJournalStoreRaw());
        entriesRef.current = store.entries;
        setEntries(store.entries);
        setLastImportChip({
          batchId: summary.batchId,
          count: summary.imported,
        });
        setImportFilterBatchId(summary.batchId);
        const first = store.entries
          .filter(
            (e) =>
              e.importBatchId === summary.batchId && !isGratitudeEntry(e),
          )
          .sort(
            (a, b) =>
              new Date(journalEntryDateIso(b)).getTime() -
              new Date(journalEntryDateIso(a)).getTime(),
          )[0];
        if (first) applyEntrySelection(first.id);
        navigate(JOURNAL_SECTION_HREF.journal);
        requestAnimationFrame(() => {
          listNavRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        });
      }}
    />
    </JournalLockGate>
  );
}
