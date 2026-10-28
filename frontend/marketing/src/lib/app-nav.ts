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
  /**
   * Nested destinations (e.g. Library / Sounds hub tabs). When present, the
   * sidebar renders this row as a group label with these as nested links.
   */
  children?: AppNavSubItem[];
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
    href: "/meditate",
    children: [
      { id: "create", label: "Create", href: "/meditate/create" },
      {
        id: "library",
        label: "Library",
        href: "/meditate/library/creations",
        children: [
          {
            id: "library-creations",
            label: "My Creations",
            href: "/meditate/library/creations",
          },
          {
            id: "library-community",
            label: "Community",
            href: "/meditate/library/community",
          },
          {
            id: "library-programs",
            label: "Programs",
            href: "/meditate/library/programs",
          },
        ],
      },
      {
        id: "sounds",
        label: "Sounds",
        href: "/meditate/sounds",
        children: [
          {
            id: "sounds-soundscapes",
            label: "Soundscapes",
            href: "/meditate/sounds/soundscapes",
          },
          {
            id: "sounds-voices",
            label: "Voices",
            href: "/meditate/sounds/voices",
          },
          {
            id: "sounds-custom",
            label: "Custom sounds",
            href: "/meditate/sounds",
          },
        ],
      },
    ],
  },
  {
    id: "journal",
    label: "Journal",
    href: "/journal",
    children: [
      { id: "new", label: "New entry", href: "/journal/entries?new=1" },
      {
        id: "gratitudes",
        label: "Gratitudes",
        href: "/journal/gratitudes",
        actionHref: "/journal/gratitudes?new=1",
        actionAriaLabel: "New gratitude",
      },
      { id: "insights", label: "Insights", href: "/journal/insights" },
    ],
  },
  {
    id: "ideate",
    label: "Manifest",
    href: "/manifest",
    children: [
      { id: "overview", label: "Overview", href: "/manifest" },
      { id: "vision-board", label: "Vision board", href: "/manifest/vision-board" },
      // Life areas are injected dynamically in AppSidebar (not static nav).
    ],
  },
  {
    id: "focus",
    label: "Focus",
    href: "/focus", // Next redirects → frontend/webapp /focus
  },
  {
    id: "chat",
    label: "Chat",
    href: "/chat",
  },
];

export const APP_NAV_ADMIN: AppNavSection[] = [];

/** Owner account that sees Admin in the app header. */
export const OWNER_ADMIN_EMAIL = "alexmaragakis@hotmail.co.uk";

export function isOwnerAdminAccount(email?: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e === OWNER_ADMIN_EMAIL.toLowerCase();
}

export const SIDEBAR_EXPAND_STORAGE_KEY = "mm_sidebar_expand_v1";
export const APP_SIDEBAR_COLLAPSED_KEY = "mm_app_sidebar_collapsed_v1";
/** Desktop expanded rail width (px). */
export const APP_SIDEBAR_W_EXPANDED = 200;
/** Desktop collapsed icon rail width (px). */
export const APP_SIDEBAR_W_COLLAPSED = 56;
/** Matches `transition-[width] duration-200` on the SPA sidebar. */
export const APP_SIDEBAR_WIDTH_TRANSITION_MS = 200;

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
  // Overview roots only — children are siblings.
  if (pathOnly === "/meditate" || pathOnly === "/journal") {
    return pathname === pathOnly;
  }
  // Library tabs share a prefix.
  // Library hub tabs — match each leaf precisely (not the whole /library tree).
  if (pathOnly === "/meditate/library/creations") {
    return (
      pathname === "/meditate/library/creations" ||
      pathname === "/meditate/library" ||
      pathname === "/meditate/library/" ||
      (pathname.startsWith("/meditate/library/") &&
        !pathname.startsWith("/meditate/library/community") &&
        !pathname.startsWith("/meditate/library/programs"))
    );
  }
  if (pathOnly === "/meditate/library/community") {
    return (
      pathname === "/meditate/library/community" ||
      pathname.startsWith("/meditate/library/community/")
    );
  }
  if (pathOnly === "/meditate/library/programs") {
    return (
      pathname === "/meditate/library/programs" ||
      pathname.startsWith("/meditate/library/programs/")
    );
  }
  if (pathOnly === "/meditate/create") {
    return pathname === "/meditate/create" || pathname.startsWith("/meditate/create/");
  }
  // Sounds hub tabs — Custom is the bare /sounds root (not soundscapes/voices).
  if (pathOnly === "/meditate/sounds/soundscapes") {
    return (
      pathname === "/meditate/sounds/soundscapes" ||
      pathname.startsWith("/meditate/sounds/soundscapes/")
    );
  }
  if (pathOnly === "/meditate/sounds/voices") {
    return (
      pathname === "/meditate/sounds/voices" ||
      pathname.startsWith("/meditate/sounds/voices/")
    );
  }
  if (pathOnly === "/meditate/sounds") {
    if (
      pathname.startsWith("/meditate/sounds/soundscapes") ||
      pathname.startsWith("/meditate/sounds/voices")
    ) {
      return false;
    }
    return (
      pathname === "/meditate/sounds" || pathname.startsWith("/meditate/sounds/")
    );
  }
  if (pathOnly === "/journal/entries") {
    // Exact journal list / freeform entries — not gratitudes or insights.
    if (
      pathname === "/journal/gratitudes" ||
      pathname.startsWith("/journal/gratitudes/") ||
      pathname === "/journal/insights" ||
      pathname.startsWith("/journal/insights/")
    ) {
      return false;
    }
    return pathname === "/journal/entries" || pathname.startsWith("/journal/entries/");
  }
  if (pathOnly === "/journal/gratitudes") {
    return (
      pathname === "/journal/gratitudes" ||
      pathname.startsWith("/journal/gratitudes/")
    );
  }
  if (pathOnly === "/journal/insights") {
    return (
      pathname === "/journal/insights" ||
      pathname.startsWith("/journal/insights/")
    );
  }
  if (pathOnly === "/manifest") {
    // Exact overview only — `/manifest/vision-board` is a sibling link.
    return pathname === "/manifest";
  }
  if (pathOnly === "/manifest/vision-board") {
    return (
      pathname === "/manifest/vision-board" ||
      pathname.startsWith("/manifest/vision-board/")
    );
  }
  if (pathOnly === "/chat") {
    return pathname === "/chat" || pathname.startsWith("/chat/");
  }
  if (pathOnly === "/focus") {
    return pathname === "/focus" || pathname.startsWith("/focus/");
  }
  if (pathOnly === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/");
  }
  return pathname.startsWith(`${pathOnly}/`);
}

export function activeNavSectionId(pathname: string): string | null {
  if (pathname === "/chat" || pathname.startsWith("/chat/")) {
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
      pathname.startsWith("/journal/gratitudes") ||
      pathname.startsWith("/journal/insights")
    ) {
      return false;
    }
    return (
      (pathname === "/journal/entries" || pathname.startsWith("/journal/entries/")) &&
      new URLSearchParams(search).get("new") === "1"
    );
  }
  if (sectionId === "journal" && sub.id === "gratitudes") {
    return (
      pathname === "/journal/gratitudes" ||
      pathname.startsWith("/journal/gratitudes/")
    );
  }
  if (sectionId === "journal" && sub.id === "insights") {
    return (
      pathname === "/journal/insights" ||
      pathname.startsWith("/journal/insights/")
    );
  }
  if (sectionId === "ideate" && sub.id === "overview") {
    // Exact overview only — vision-board and goals are sibling routes.
    if (
      pathname.startsWith("/manifest/vision-board") ||
      pathname.startsWith("/manifest/goal/")
    ) {
      return false;
    }
    return pathname === "/manifest";
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
 */
export function buildAppBreadcrumbs(
  pathname: string,
  opts?: {
    lifeAreaTitle?: string | null;
    createMeditationStyle?: string | null;
    /** Random Script create path — show “Random” instead of “By Type”. */
    createRandomScript?: boolean;
    /** Title for `/journal/entries/[entryId]` (mobile entry editor). */
    journalEntryTitle?: string | null;
    /** Label for `/journal/gratitudes/[entryId]` — Today or entry date. */
    gratitudeEntryLabel?: string | null;
    hash?: string;
    search?: string;
  },
): AppBreadcrumbCrumb[] {
  const hash = opts?.hash ?? "";
  const search = opts?.search ?? "";

  if (pathname === "/chat" || pathname === "/chat/") {
    return [{ label: "Chat", href: null }];
  }
  if (pathname.startsWith("/chat/")) {
    const id = pathname.slice("/chat/".length).split("/")[0] ?? "";
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
      { label: "Chat", href: "/chat" },
      { label: title, href: null },
    ];
  }

  if (pathname.startsWith("/meditate/create") || pathname.startsWith("/create")) {
    const crumbs: AppBreadcrumbCrumb[] = [
      { label: "Meditate", href: "/meditate" },
    ];
    const parsed =
      pathname.startsWith("/meditate/create")
        ? parseCreateMeditationPathname(pathname)
        : { path: "pending" as const, styleStep: "type" as const, mix: false, valid: true };
    // Match create-path card eyebrows (By Type, Chat, Manifest, Journal, Direct, Random).
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
                : null;
    if (pathLabel) {
      crumbs.push({ label: "Create", href: CREATE_MEDITATE_ROOT });
      const styleName = opts?.createMeditationStyle?.trim() || null;
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
  if (pathname.startsWith("/meditate/library")) {
    return [
      { label: "Meditate", href: "/meditate" },
      { label: "Library", href: null },
    ];
  }
  if (pathname.startsWith("/meditate/sounds")) {
    return [
      { label: "Meditate", href: "/meditate" },
      { label: "Sounds", href: null },
    ];
  }
  if (pathname === "/meditate" || pathname.startsWith("/meditate/")) {
    // Section home: verb alone in the brand phrase (no "| Overview" trail).
    return [{ label: "Meditate", href: "/meditate" }];
  }

  if (pathname.startsWith("/journal")) {
    if (
      pathname === "/journal/gratitudes" ||
      pathname.startsWith("/journal/gratitudes/")
    ) {
      const isNew = new URLSearchParams(search).get("new") === "1";
      const gratitudeEntryMatch =
        /^\/journal\/gratitudes\/([^/]+)\/?$/.exec(pathname);
      if (gratitudeEntryMatch?.[1]) {
        const label = opts?.gratitudeEntryLabel?.trim() || "Gratitude";
        return [
          { label: "Journal", href: "/journal" },
          { label: "Gratitudes", href: "/journal/gratitudes" },
          { label, href: null },
        ];
      }
      return [
        { label: "Journal", href: "/journal" },
        { label: isNew ? "New gratitude" : "Gratitudes", href: null },
      ];
    }
    if (
      pathname === "/journal/insights" ||
      pathname.startsWith("/journal/insights/")
    ) {
      return [
        { label: "Journal", href: "/journal" },
        { label: "Insights", href: null },
      ];
    }
    if (new URLSearchParams(search).get("new") === "1") {
      return [
        { label: "Journal", href: "/journal" },
        { label: "New entry", href: null },
      ];
    }
    const entryMatch = /^\/journal\/entries\/([^/]+)\/?$/.exec(pathname);
    if (entryMatch?.[1]) {
      const title = opts?.journalEntryTitle?.trim() || "Entry";
      return [
        { label: "Journal", href: "/journal" },
        { label: title, href: null },
      ];
    }
    return [{ label: "Journal", href: null }];
  }

  if (pathname.startsWith("/manifest/goal/")) {
    const title = opts?.lifeAreaTitle?.trim() || "Life area";
    return [
      { label: "Manifest", href: "/manifest" },
      { label: title, href: null },
    ];
  }
  if (pathname.startsWith("/manifest")) {
    if (pathname.startsWith("/manifest/vision-board")) {
      return [
        { label: "Manifest", href: "/manifest" },
        { label: "Vision board", href: null },
      ];
    }
    if (pathname.startsWith("/manifest")) {
      // Section home: verb alone in the brand phrase (no "| Manifesto" trail).
      return [{ label: "Manifest", href: "/manifest" }];
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
    const sectionId = pathname.split("/").filter(Boolean)[1];
    if (sectionId) {
      const sectionLabel =
        (
          {
            account: "Account",
            ai: "AI & data",
            privacy: "Privacy",
            notifications: "Notifications",
            email: "Email",
            meditate: "Meditate",
            focus: "Focus",
            general: "General",
          } as Record<string, string>
        )[sectionId] ?? sectionId;
      return [
        { label: "Settings", href: "/settings" },
        { label: sectionLabel, href: null },
      ];
    }
    return [{ label: "Settings", href: null }];
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
    for (const sub of section.children ?? []) {
      if (sub.children?.length) next[sub.id] = false;
    }
  }
  return next;
}

/**
 * Merge stored prefs onto defaults. Missing keys stay expanded; explicit `false` sticks.
 * Active section is forced open unless the user explicitly collapsed it.
 * Nested hubs (Library / Sounds) open when their routes are active.
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
  if (pathname.startsWith("/meditate/library")) {
    if (stored.library !== false) next.library = true;
  }
  if (pathname.startsWith("/meditate/sounds")) {
    if (stored.sounds !== false) next.sounds = true;
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
