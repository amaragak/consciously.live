import {
  CREATE_MEDITATE_ROOT,
  createMeditationHref,
  parseCreateMeditationPathname,
} from "@/lib/create-meditation-path";
import { loadAssistantChatStore } from "@/lib/assistant-chat-storage";

/**
 * Logged-in sidebar navigation tree + breadcrumb helpers.
 */

export type AppNavSubItem = {
  id: string;
  label: string;
  href: string;
  /** Optional trailing control (e.g. Gratitudes “+”) with its own destination. */
  actionHref?: string;
  actionAriaLabel?: string;
};

export type AppNavSection = {
  id: string;
  label: string;
  /** Primary destination when the section label is clicked. */
  href: string;
  children?: AppNavSubItem[];
};

export const APP_NAV_MAIN: AppNavSection[] = [
  {
    id: "meditate",
    label: "Meditate",
    href: "/meditate/library/creations",
    children: [
      { id: "create", label: "Create", href: "/meditate/create" },
      { id: "library", label: "Library", href: "/meditate/library/creations" },
      { id: "sounds", label: "Sounds", href: "/meditate/sounds" },
    ],
  },
  {
    id: "journal",
    label: "Journal",
    href: "/journal/my", // Next redirects → frontend/webapp /journal/my
    children: [
      { id: "new", label: "New entry", href: "/journal/my?new=1" },
      {
        id: "gratitudes",
        label: "Gratitudes",
        href: "/journal/my/gratitudes",
        actionHref: "/journal/my/gratitudes?new=1",
        actionAriaLabel: "New gratitude",
      },
      { id: "insights", label: "Insights", href: "/journal/my/insights" },
    ],
  },
  {
    id: "ideate",
    label: "Manifest",
    href: "/manifest/my",
    children: [
      { id: "overview", label: "Overview", href: "/manifest/my" },
      { id: "vision-board", label: "Vision board", href: "/manifest/my/vision-board" },
      // Life areas are injected dynamically in AppSidebar (not static nav).
    ],
  },
  {
    id: "focus",
    label: "Focus",
    href: "/focus/my", // Next redirects → frontend/webapp /focus
  },
  {
    id: "chat",
    label: "Chat",
    href: "/chat/my",
  },
];

export const APP_NAV_ADMIN: AppNavSection[] = [
  { id: "admin", label: "Admin", href: "/admin" },
  { id: "api", label: "API", href: "/settings" },
];

export const SIDEBAR_EXPAND_STORAGE_KEY = "mm_sidebar_expand_v1";
export const APP_SIDEBAR_COLLAPSED_KEY = "mm_app_sidebar_collapsed_v1";
/** Desktop expanded rail width (px). */
export const APP_SIDEBAR_W_EXPANDED = 200;
/** Desktop collapsed icon rail width (px). */
export const APP_SIDEBAR_W_COLLAPSED = 56;

export function loadAppSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(APP_SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAppSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      APP_SIDEBAR_COLLAPSED_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    /* */
  }
}

export function appSidebarWidthPx(collapsed: boolean): number {
  return collapsed ? APP_SIDEBAR_W_COLLAPSED : APP_SIDEBAR_W_EXPANDED;
}

export function pathMatchesHref(pathname: string, href: string): boolean {
  const pathOnly = href.split("#")[0]?.split("?")[0] ?? href;
  if (pathOnly === "/") return pathname === "/";
  if (pathname === pathOnly) return true;
  // Library tabs share a prefix.
  if (pathOnly === "/meditate/library/creations") {
    return pathname.startsWith("/meditate/library");
  }
  if (pathOnly === "/meditate/create") {
    return pathname === "/meditate/create" || pathname.startsWith("/meditate/create/");
  }
  if (pathOnly === "/meditate/sounds") {
    return pathname === "/meditate/sounds" || pathname.startsWith("/meditate/sounds/");
  }
  if (pathOnly === "/journal/my") {
    // Exact journal list / freeform entries — not gratitudes or insights.
    if (
      pathname === "/journal/my/gratitudes" ||
      pathname.startsWith("/journal/my/gratitudes/") ||
      pathname === "/journal/my/insights" ||
      pathname.startsWith("/journal/my/insights/")
    ) {
      return false;
    }
    return pathname === "/journal/my" || pathname.startsWith("/journal/my/");
  }
  if (pathOnly === "/journal/my/gratitudes") {
    return (
      pathname === "/journal/my/gratitudes" ||
      pathname.startsWith("/journal/my/gratitudes/")
    );
  }
  if (pathOnly === "/journal/my/insights") {
    return (
      pathname === "/journal/my/insights" ||
      pathname.startsWith("/journal/my/insights/")
    );
  }
  if (pathOnly === "/manifest/my") {
    // Exact overview only — `/manifest/my/vision-board` is a sibling link.
    return pathname === "/manifest/my";
  }
  if (pathOnly === "/manifest/my/vision-board") {
    return (
      pathname === "/manifest/my/vision-board" ||
      pathname.startsWith("/manifest/my/vision-board/")
    );
  }
  if (pathOnly === "/chat/my") {
    return pathname === "/chat/my" || pathname.startsWith("/chat/my/");
  }
  if (pathOnly === "/focus/my") {
    return pathname === "/focus/my" || pathname.startsWith("/focus/my/");
  }
  if (pathOnly === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/");
  }
  return pathname.startsWith(`${pathOnly}/`);
}

export function activeNavSectionId(pathname: string): string | null {
  if (pathname === "/chat/my" || pathname.startsWith("/chat/my/")) {
    return "chat";
  }
  if (
    pathname.startsWith("/meditate") ||
    pathname.startsWith("/create") ||
    pathname.startsWith("/library")
  ) {
    return "meditate";
  }
  if (pathname.startsWith("/journal")) return "journal";
  if (
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/ideate") ||
    pathname.startsWith("/dream") ||
    pathname.startsWith("/plan")
  ) {
    return "ideate";
  }
  if (pathname.startsWith("/focus") || pathname.startsWith("/extension")) {
    return "focus";
  }
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/settings") || pathname.startsWith("/account")) {
    return "api";
  }
  return null;
}

export function isSubItemActive(
  pathname: string,
  hash: string,
  search: string,
  sub: AppNavSubItem,
  sectionId: string,
): boolean {
  if (sectionId === "journal" && sub.id === "new") {
    if (
      pathname.startsWith("/journal/my/gratitudes") ||
      pathname.startsWith("/journal/my/insights")
    ) {
      return false;
    }
    return (
      (pathname === "/journal/my" || pathname.startsWith("/journal/my/")) &&
      new URLSearchParams(search).get("new") === "1"
    );
  }
  if (sectionId === "journal" && sub.id === "gratitudes") {
    return (
      pathname === "/journal/my/gratitudes" ||
      pathname.startsWith("/journal/my/gratitudes/")
    );
  }
  if (sectionId === "journal" && sub.id === "insights") {
    return (
      pathname === "/journal/my/insights" ||
      pathname.startsWith("/journal/my/insights/")
    );
  }
  if (sectionId === "ideate" && sub.id === "overview") {
    // Exact overview only — vision-board and goals are sibling routes.
    if (
      pathname.startsWith("/manifest/my/vision-board") ||
      pathname.startsWith("/manifest/goal/")
    ) {
      return false;
    }
    return pathname === "/manifest/my";
  }
  if (sectionId === "ideate" && sub.id.startsWith("life-area:")) {
    const dreamId = sub.id.slice("life-area:".length);
    const m = pathname.match(/^\/(?:manifest|ideate|dream|plan)\/goal\/([^/?#]+)/);
    if (!m?.[1]) return false;
    try {
      return decodeURIComponent(m[1]) === dreamId;
    } catch {
      return m[1] === dreamId;
    }
  }
  return pathMatchesHref(pathname, sub.href);
}

export type AppBreadcrumbCrumb = {
  label: string;
  href: string | null;
};

/**
 * Build breadcrumb crumbs for the logged-in top bar (no brand).
 * `lifeAreaTitle` is used when on `/manifest/goal/[id]`.
 * `createMeditationStyle` is used on By Type questions / mix steps.
 * `createProgramTitle` is used on By Program chat / mix steps.
 */
export function buildAppBreadcrumbs(
  pathname: string,
  opts?: {
    lifeAreaTitle?: string | null;
    createMeditationStyle?: string | null;
    /** Random Script create path — show “Random” instead of “By Type”. */
    createRandomScript?: boolean;
    /** Selected program title on By Program chat / audio. */
    createProgramTitle?: string | null;
    /** Title for `/journal/my/[entryId]` (mobile entry editor). */
    journalEntryTitle?: string | null;
    /** Label for `/journal/my/gratitudes/[entryId]` — Today or entry date. */
    gratitudeEntryLabel?: string | null;
    hash?: string;
    search?: string;
  },
): AppBreadcrumbCrumb[] {
  const hash = opts?.hash ?? "";
  const search = opts?.search ?? "";

  if (pathname === "/chat/my" || pathname === "/chat/my/") {
    return [{ label: "Chat", href: null }];
  }
  if (pathname.startsWith("/chat/my/")) {
    const id = pathname.slice("/chat/my/".length).split("/")[0] ?? "";
    let title = "New chat";
    if (typeof window !== "undefined" && id) {
      try {
        const t = loadAssistantChatStore().threads.find(
          (x) => x.id === decodeURIComponent(id),
        );
        if (t?.title?.trim()) title = t.title.trim();
      } catch {
        /* */
      }
    }
    return [
      { label: "Chat", href: "/chat/my" },
      { label: title, href: null },
    ];
  }

  if (pathname.startsWith("/meditate/create") || pathname.startsWith("/create")) {
    const crumbs: AppBreadcrumbCrumb[] = [
      { label: "Meditate", href: "/meditate/library/creations" },
    ];
    const parsed =
      pathname.startsWith("/meditate/create")
        ? parseCreateMeditationPathname(pathname)
        : { path: "pending" as const, styleStep: "type" as const, fromProgramStep: "pick" as const, mix: false, valid: true };
    // Match create-path card eyebrows (By Type, Chat, Manifest, Journal, Direct, Random, By Program).
    const pathLabel =
      parsed.path === "style"
        ? opts?.createRandomScript
          ? "Random"
          : "By Type"
        : parsed.path === "freeflow"
          ? "Chat"
          : parsed.path === "goal"
            ? "Manifest"
            : parsed.path === "journalReflect"
              ? "Journal"
              : parsed.path === "oneShot"
                ? "Direct"
                : parsed.path === "fromProgram"
                  ? "By Program"
                  : null;
    if (pathLabel) {
      crumbs.push({ label: "Create", href: CREATE_MEDITATE_ROOT });
      const styleName = opts?.createMeditationStyle?.trim() || null;
      const programName = opts?.createProgramTitle?.trim() || null;
      if (parsed.path === "style") {
        const byTypeHref = createMeditationHref({ path: "style" });
        const questionsHref = createMeditationHref({
          path: "style",
          styleStep: "questions",
        });
        const stylePathLabel = opts?.createRandomScript ? "Random" : "By Type";
        if (parsed.mix) {
          // Audio settings — keep path / type name trail, then Audio.
          crumbs.push({ label: stylePathLabel, href: byTypeHref });
          // Random: style is not chosen until generate — omit type crumb.
          if (styleName && !opts?.createRandomScript) {
            crumbs.push({ label: styleName, href: questionsHref });
          }
          crumbs.push({ label: "Audio", href: null });
        } else if (parsed.styleStep === "questions") {
          // Always parent-link path label; type name is current when known.
          crumbs.push({ label: stylePathLabel, href: byTypeHref });
          crumbs.push({ label: styleName || "Questions", href: null });
        } else {
          // Type picker
          crumbs.push({ label: stylePathLabel, href: null });
        }
      } else if (parsed.path === "fromProgram") {
        const pickHref = createMeditationHref({
          path: "fromProgram",
          fromProgramStep: "pick",
        });
        const sessionsHref = createMeditationHref({
          path: "fromProgram",
          fromProgramStep: "sessions",
        });
        const chatHref = createMeditationHref({
          path: "fromProgram",
          fromProgramStep: "chat",
        });
        if (parsed.mix) {
          crumbs.push({ label: "By Program", href: pickHref });
          if (programName) {
            crumbs.push({ label: programName, href: sessionsHref });
          }
          crumbs.push({ label: "Audio", href: null });
        } else if (parsed.fromProgramStep === "chat") {
          crumbs.push({ label: "By Program", href: pickHref });
          if (programName) {
            crumbs.push({ label: programName, href: sessionsHref });
          }
          crumbs.push({ label: "Chat", href: null });
        } else if (parsed.fromProgramStep === "sessions") {
          crumbs.push({ label: "By Program", href: pickHref });
          crumbs.push({ label: programName || "Sessions", href: null });
        } else {
          crumbs.push({ label: "By Program", href: null });
        }
      } else if (parsed.mix) {
        crumbs.push({
          label: pathLabel,
          href: createMeditationHref({ path: parsed.path }),
        });
        crumbs.push({ label: "Audio", href: null });
      } else {
        crumbs.push({ label: pathLabel, href: null });
      }
    } else {
      crumbs.push({ label: "Create", href: null });
    }
    return crumbs;
  }
  if (pathname.startsWith("/meditate/library") || pathname.startsWith("/meditate/sounds")) {
    const leaf = pathname.startsWith("/meditate/sounds") ? "Sounds" : "Library";
    return [
      { label: "Meditate", href: "/meditate/library/creations" },
      { label: leaf, href: null },
    ];
  }
  if (pathname === "/meditate" || pathname.startsWith("/meditate/")) {
    return [
      { label: "Meditate", href: "/meditate/library/creations" },
      { label: "Overview", href: null },
    ];
  }

  if (pathname.startsWith("/journal")) {
    if (
      pathname === "/journal/my/gratitudes" ||
      pathname.startsWith("/journal/my/gratitudes/")
    ) {
      const isNew = new URLSearchParams(search).get("new") === "1";
      const gratitudeEntryMatch =
        /^\/journal\/my\/gratitudes\/([^/]+)\/?$/.exec(pathname);
      if (gratitudeEntryMatch?.[1]) {
        const label = opts?.gratitudeEntryLabel?.trim() || "Gratitude";
        return [
          { label: "Journal", href: "/journal/my" },
          { label: "Gratitudes", href: "/journal/my/gratitudes" },
          { label, href: null },
        ];
      }
      return [
        { label: "Journal", href: "/journal/my" },
        { label: isNew ? "New gratitude" : "Gratitudes", href: null },
      ];
    }
    if (
      pathname === "/journal/my/insights" ||
      pathname.startsWith("/journal/my/insights/")
    ) {
      return [
        { label: "Journal", href: "/journal/my" },
        { label: "Insights", href: null },
      ];
    }
    if (new URLSearchParams(search).get("new") === "1") {
      return [
        { label: "Journal", href: "/journal/my" },
        { label: "New entry", href: null },
      ];
    }
    const entryMatch = /^\/journal\/my\/([^/]+)\/?$/.exec(pathname);
    if (entryMatch?.[1]) {
      const title = opts?.journalEntryTitle?.trim() || "Entry";
      return [
        { label: "Journal", href: "/journal/my" },
        { label: title, href: null },
      ];
    }
    return [{ label: "Journal", href: null }];
  }

  if (pathname.startsWith("/manifest/goal/")) {
    const title = opts?.lifeAreaTitle?.trim() || "Life area";
    return [
      { label: "Manifest", href: "/manifest/my" },
      { label: title, href: null },
    ];
  }
  if (pathname.startsWith("/manifest")) {
    if (pathname.startsWith("/manifest/my/vision-board")) {
      return [
        { label: "Manifest", href: "/manifest/my" },
        { label: "Vision board", href: null },
      ];
    }
    if (pathname.startsWith("/manifest/my")) {
      return [
        { label: "Manifest", href: "/manifest/my" },
        { label: "Overview", href: null },
      ];
    }
    return [{ label: "Manifest", href: null }];
  }

  if (pathname.startsWith("/focus")) {
    return [{ label: "Focus", href: null }];
  }
  if (pathname.startsWith("/admin")) {
    return [{ label: "Admin", href: null }];
  }
  if (pathname.startsWith("/settings")) {
    return [{ label: "API", href: null }];
  }
  if (pathname.startsWith("/pro")) {
    return [{ label: "Pro", href: null }];
  }
  if (pathname.startsWith("/pricing")) {
    return [{ label: "Pricing", href: null }];
  }
  if (pathname.startsWith("/account")) {
    return [{ label: "Account", href: null }];
  }
  if (pathname === "/") {
    return [{ label: "Home", href: null }];
  }
  return [];
}

export function loadSidebarExpandState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SIDEBAR_EXPAND_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Default: every section with children is expanded (before localStorage merge). */
export function defaultSidebarExpandState(): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const section of [...APP_NAV_MAIN, ...APP_NAV_ADMIN]) {
    if (section.children?.length) next[section.id] = true;
  }
  return next;
}

/**
 * Merge stored prefs onto defaults. Missing keys stay expanded; explicit `false` sticks.
 * Active section is forced open unless the user explicitly collapsed it.
 */
export function resolveSidebarExpandState(
  pathname: string,
): Record<string, boolean> {
  const stored = loadSidebarExpandState();
  const next: Record<string, boolean> = {
    ...defaultSidebarExpandState(),
    ...stored,
  };
  const active = activeNavSectionId(pathname);
  if (
    active &&
    APP_NAV_MAIN.some((s) => s.id === active && s.children?.length)
  ) {
    if (stored[active] !== false) next[active] = true;
  }
  return next;
}

export function saveSidebarExpandState(state: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SIDEBAR_EXPAND_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    /* ignore */
  }
}
