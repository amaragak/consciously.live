import {
  CREATE_MEDITATE_ROOT,
  createMeditationHref,
  parseCreateMeditationPathname,
} from "@/lib/create-meditation-path";
import { loadAssistantChatStore } from "@/lib/assistant-chat-storage";
import { peekGuideTitle } from "@/content/guides";
import { libraryDetailIdFromPathname } from "@/lib/library-meditation-detail";
import { healItemById, loadHealStore } from "@/lib/heal-store";

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
        href: "/meditate/sounds/soundscapes",
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
            href: "/meditate/sounds/custom",
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
      {
        id: "entries",
        label: "Journal Entries",
        href: "/journal/entries",
        actionHref: "/journal/entries?new=1",
        actionAriaLabel: "New entry",
      },
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
      { id: "manifesto", label: "Manifesto", href: "/manifest" },
      { id: "story", label: "Story", href: "/manifest/story" },
      { id: "vision-board", label: "Vision board", href: "/manifest/vision-board" },
      { id: "tracker", label: "Tracker", href: "/manifest/tracker" },
      // Life areas are injected dynamically in AppSidebar (not static nav).
    ],
  },
  {
    id: "heal",
    label: "Heal",
    href: "/heal",
    children: [
      { id: "heal-home", label: "What you're carrying", href: "/heal" },
    ],
  },
  {
    id: "focus",
    label: "Focus",
    href: "/focus",
    children: [
      { id: "timer", label: "Timer", href: "/focus" },
      { id: "history", label: "History", href: "/focus/history" },
      { id: "insights", label: "Insights", href: "/focus/insights" },
    ],
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
/**
 * Distance from the viewport left edge to the start of the SPA header brand
 * (sun / wordmark / breadcrumb). Tuned ~2px left of the raw sidebar icon inset
 * (section row: outer px-2 + link px-2.5 = 18) so the fine-sun’s internal
 * whitespace lines up with the sidebar glyphs.
 */
export const APP_SIDEBAR_ICON_INSET_PX = 16;
/**
 * Distance from the viewport left edge to the start of sidebar item labels
 * (section row: icon inset + 18px icon + gap-2; sub-rows land on the same).
 */
export const APP_SIDEBAR_LABEL_INSET_PX = 42;

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
  // Meditate overview only — children (create / library / sounds / guides) are siblings.
  if (pathOnly === "/meditate") {
    return pathname === "/meditate";
  }
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
  // Sounds hub tabs — parent Sounds lands on Soundscapes; Custom is /sounds/custom (+ editors).
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
  if (pathOnly === "/meditate/sounds/custom") {
    if (
      pathname.startsWith("/meditate/sounds/soundscapes") ||
      pathname.startsWith("/meditate/sounds/voices")
    ) {
      return false;
    }
    return (
      pathname === "/meditate/sounds/custom" ||
      pathname.startsWith("/meditate/sounds/custom/") ||
      pathname === "/meditate/sounds/new" ||
      pathname.startsWith("/meditate/sounds/new/") ||
      pathname.startsWith("/meditate/sounds/mix/") ||
      pathname.startsWith("/meditate/sounds/preset/")
    );
  }
  if (pathOnly === "/meditate/sounds") {
    return (
      pathname === "/meditate/sounds" || pathname.startsWith("/meditate/sounds/")
    );
  }
  // Journal overview only — children (entries / gratitudes / insights / guides) are siblings.
  if (pathOnly === "/journal") {
    return pathname === "/journal";
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
    // Legacy `/journal/import` redirects to Entries + modal.
    if (pathname === "/journal/import" || pathname.startsWith("/journal/import/")) {
      return true;
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
    // Timer only — History / Insights are sibling links.
    return pathname === "/focus" || pathname === "/focus/";
  }
  if (pathOnly === "/focus/history") {
    return (
      pathname === "/focus/history" || pathname.startsWith("/focus/history/")
    );
  }
  if (pathOnly === "/focus/insights") {
    return (
      pathname === "/focus/insights" || pathname.startsWith("/focus/insights/")
    );
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
  if (pathname.startsWith("/heal")) return "heal";
  if (pathname.startsWith("/focus")) return "focus";
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
  if (sectionId === "ideate" && sub.id === "manifesto") {
    // Poster is part of Manifesto. #life-areas is the Life areas row, not Manifesto.
    if (hash === "#life-areas") return false;
    return pathname === "/manifest" || pathname === "/manifest/poster";
  }
  if (sectionId === "ideate" && sub.id === "story") {
    return pathname === "/manifest/story" || pathname.startsWith("/manifest/story/");
  }
  if (sectionId === "heal" && sub.id === "heal-home") {
    return pathname === "/heal";
  }
  if (sectionId === "heal" && sub.id === "heal-rested") {
    return pathname === "/heal/rested" || pathname.startsWith("/heal/rested/");
  }
  if (sectionId === "heal" && sub.id.startsWith("heal-item:")) {
    const id = sub.id.slice("heal-item:".length);
    return pathname === `/heal/${id}` || pathname.startsWith(`/heal/${id}/`);
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
 * Phone-only (&lt; md) leaf for Library / Sounds hubs — tabs are hidden there, so
 * the crumb shows the active child (e.g. “My Creations”) instead of the hub name.
 * Returns null on other routes.
 */
export function librarySoundsPhoneLeafLabel(pathname: string): string | null {
  // Meditation detail: phone crumb is Meditate › Library (see app-top-bar).
  if (libraryDetailIdFromPathname(pathname)) return null;
  if (pathname.startsWith("/meditate/library")) {
    const library = APP_NAV_MAIN.find((s) => s.id === "meditate")?.children?.find(
      (c) => c.id === "library",
    );
    const child =
      library?.children?.find((c) => pathMatchesHref(pathname, c.href)) ??
      library?.children?.[0];
    return child?.label ?? "Library";
  }
  if (pathname.startsWith("/meditate/sounds")) {
    const sounds = APP_NAV_MAIN.find((s) => s.id === "meditate")?.children?.find(
      (c) => c.id === "sounds",
    );
    const child =
      sounds?.children?.find(
        (c) => c.id !== "sounds-custom" && pathMatchesHref(pathname, c.href),
      ) ??
      sounds?.children?.find((c) => c.id === "sounds-custom");
    return child?.label ?? "Sounds";
  }
  return null;
}

export type AppBreadcrumbOpts = {
  lifeAreaTitle?: string | null;
  createMeditationStyle?: string | null;
  /** Random Script create path — show “Random” instead of “By Type”. */
  createRandomScript?: boolean;
  /** Selected program title on By Program chat / audio. */
  createProgramTitle?: string | null;
  /** Title for `/journal/entries/[entryId]` (mobile entry editor). */
  journalEntryTitle?: string | null;
  /** Tab leaf for meditation detail (My Creations / Community / Programs). */
  meditationFromCrumb?: { label: string; href: string } | null;
  /** Label for `/journal/gratitudes/[entryId]` — Today or entry date. */
  gratitudeEntryLabel?: string | null;
  hash?: string;
  search?: string;
};

export type AppHeaderLocation = {
  /** Section verb in the brand phrase (Meditate, Journal, …). Empty on dashboard. */
  verb: string;
  /** Section home — used for mobile back when trail is a single leaf. */
  href: string;
  /**
   * Trail after the brand phrase divider: sidebar leaf (Create, Library, …)
   * and any deeper levels. Empty on dashboard and section homes (Meditate,
   * Journal, Manifest, Focus) — the italic verb is enough; no "| Overview".
   */
  trail: AppBreadcrumbCrumb[];
};

/**
 * Brand phrase + optional trail for the logged-in header.
 * Built from the same route config as {@link buildAppBreadcrumbs}.
 * Section verb stays in the phrase; everything after it is the trail
 * (so Create / Library / Insights appear after the divider, not alone as
 * a second serif crumb). Dashboard (`/`) has wordmark only — no verb, no trail.
 * Settings is a noun (not a verb): no italic phrase — divider + "Settings"
 * as the first trail crumb at standard child size.
 */
export function resolveAppHeaderLocation(
  pathname: string,
  opts?: AppBreadcrumbOpts,
): AppHeaderLocation {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname || "/";
  if (path === "/") {
    return { verb: "", href: "/", trail: [] };
  }

  // Settings is not a verb — keep it in the trail (child size), never italic.
  if (path.startsWith("/settings") || path.startsWith("/account")) {
    const crumbs = buildAppBreadcrumbs(pathname, opts);
    let trail = crumbs.filter((c) => c.label !== "Home");
    if (trail[0]?.label !== "Settings") {
      trail = [
        { label: "Settings", href: "/settings/account" },
        ...trail.filter((c) => c.label !== "Settings"),
      ];
    }
    trail = trail.map((c) =>
      c.label === "Settings" &&
      (c.href === "/settings" || c.href === "/settings/" || !c.href)
        ? {
            ...c,
            // Bare /settings redirects; link the hub when a section is shown.
            href: trail.length > 1 ? "/settings/account" : null,
          }
        : c,
    );
    return { verb: "", href: "/settings/account", trail };
  }

  const crumbs = buildAppBreadcrumbs(pathname, opts);
  const sectionId = activeNavSectionId(pathname);
  const section =
    APP_NAV_MAIN.find((s) => s.id === sectionId) ??
    APP_NAV_ADMIN.find((s) => s.id === sectionId) ??
    null;

  const verb = section?.label ?? crumbs[0]?.label ?? "";
  const href = section?.href ?? (crumbs[0]?.href || "/");

  let trail = crumbs;
  if (verb && trail[0]?.label === verb) {
    trail = trail.slice(1);
  }
  // Never surface a lone "Home" crumb in the trail.
  trail = trail.filter((c) => c.label !== "Home");
  return { verb, href, trail };
}

/**
 * Build breadcrumb crumbs for the logged-in top bar (no brand).
 * `lifeAreaTitle` is used when on `/manifest/goal/[id]`.
 * `createMeditationStyle` is used on By Type questions / mix steps.
 * `createProgramTitle` is used on By Program chat / mix steps.
 */
export function buildAppBreadcrumbs(
  pathname: string,
  opts?: AppBreadcrumbOpts,
): AppBreadcrumbCrumb[] {
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
    // One-flow: Create › Shape / Sound from `?step=`.
    const createStep = new URLSearchParams(search).get("step")?.toLowerCase();
    if (
      (pathname === CREATE_MEDITATE_ROOT ||
        pathname === `${CREATE_MEDITATE_ROOT}/`) &&
      (createStep === "shape" || createStep === "sound")
    ) {
      crumbs.push({ label: "Create", href: CREATE_MEDITATE_ROOT });
      crumbs.push({
        label: createStep === "shape" ? "Shape" : "Sound",
        href: null,
      });
      return crumbs;
    }
    const parsed =
      pathname.startsWith("/meditate/create")
        ? parseCreateMeditationPathname(pathname)
        : { path: "pending" as const, styleStep: "type" as const, fromProgramStep: "pick" as const, mix: false, valid: true };
    // Match create-path cards (By Type, By Chat, From Goal, From Journal, One-Shot Prompt, Random, By Program).
    const pathLabel =
      parsed.path === "style"
        ? opts?.createRandomScript
          ? "Random"
          : "By Type"
        : parsed.path === "freeflow"
          ? "By Chat"
          : parsed.path === "goal"
            ? "From Goal"
            : parsed.path === "journalReflect"
              ? "From Journal"
              : parsed.path === "oneShot"
                ? "One-Shot Prompt"
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
  if (pathname.startsWith("/meditate/library")) {
    // Meditation detail (md+ trail after italic Meditate): Library only —
    // never the meditation title. Child tab is in the header select.
    // Phone uses Meditate › My Creations via top-bar.
    if (libraryDetailIdFromPathname(pathname)) {
      const fromHref =
        opts?.meditationFromCrumb?.href?.trim() ||
        "/meditate/library/creations";
      return [
        { label: "Meditate", href: "/meditate" },
        { label: "Library", href: fromHref },
      ];
    }
    // md+: hub name — centre tabs show the child. Phone trail swaps in the
    // child via {@link librarySoundsPhoneLeafLabel}.
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
  if (
    pathname === "/meditate/guides" ||
    pathname.startsWith("/meditate/guides/")
  ) {
    const slugMatch = /^\/meditate\/guides\/([^/]+)\/?$/.exec(pathname);
    if (slugMatch?.[1]) {
      const slug = decodeURIComponent(slugMatch[1]);
      const title = peekGuideTitle(slug, "meditate");
      return [
        { label: "Meditate", href: "/meditate" },
        { label: "Guides", href: "/meditate/guides" },
        { label: title, href: null },
      ];
    }
    return [
      { label: "Meditate", href: "/meditate" },
      { label: "Guides", href: null },
    ];
  }
  if (pathname === "/meditate" || pathname.startsWith("/meditate/")) {
    // Section home: verb alone in the brand phrase (no "| Overview" trail).
    return [{ label: "Meditate", href: "/meditate" }];
  }

  if (pathname.startsWith("/journal")) {
    if (
      pathname === "/journal/guides" ||
      pathname.startsWith("/journal/guides/")
    ) {
      const slugMatch = /^\/journal\/guides\/([^/]+)\/?$/.exec(pathname);
      if (slugMatch?.[1]) {
        const slug = decodeURIComponent(slugMatch[1]);
        const title = peekGuideTitle(slug, "journal");
        return [
          { label: "Journal", href: "/journal" },
          { label: "Guides", href: "/journal/guides" },
          { label: title, href: null },
        ];
      }
      return [
        { label: "Journal", href: "/journal" },
        { label: "Guides", href: null },
      ];
    }
    if (pathname === "/journal") {
      // Section home: verb alone in the brand phrase (no "| Overview" trail).
      return [{ label: "Journal", href: "/journal" }];
    }
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
    if (pathname === "/journal/entries" || pathname.startsWith("/journal/entries/")) {
      return [
        { label: "Journal", href: "/journal" },
        { label: "Entries", href: null },
      ];
    }
    return [{ label: "Journal", href: "/journal" }];
  }

  if (pathname.startsWith("/manifest/goal/")) {
    const title = opts?.lifeAreaTitle?.trim() || "Life area";
    return [
      { label: "Manifest", href: "/manifest" },
      { label: title, href: null },
    ];
  }
  if (pathname.startsWith("/manifest")) {
    if (
      pathname === "/manifest/guides" ||
      pathname.startsWith("/manifest/guides/")
    ) {
      const slugMatch = /^\/manifest\/guides\/([^/]+)\/?$/.exec(pathname);
      if (slugMatch?.[1]) {
        const slug = decodeURIComponent(slugMatch[1]);
        const title = peekGuideTitle(slug, "manifest");
        return [
          { label: "Manifest", href: "/manifest" },
          { label: "Guides", href: "/manifest/guides" },
          { label: title, href: null },
        ];
      }
      return [
        { label: "Manifest", href: "/manifest" },
        { label: "Guides", href: null },
      ];
    }
    if (pathname === "/manifest/tracker" || pathname.startsWith("/manifest/tracker/")) {
      return [
        { label: "Manifest", href: "/manifest" },
        { label: "Tracker", href: null },
      ];
    }
    if (pathname.startsWith("/manifest/vision-board")) {
      return [
        { label: "Manifest", href: "/manifest" },
        { label: "Vision board", href: null },
      ];
    }
    if (pathname === "/manifest/story" || pathname.startsWith("/manifest/story/")) {
      return [
        { label: "Manifest", href: "/manifest" },
        { label: "Story", href: null },
      ];
    }
    if (pathname === "/manifest/poster" || pathname.startsWith("/manifest/poster/")) {
      return [
        { label: "Manifest", href: "/manifest" },
        { label: "Poster", href: null },
      ];
    }
    if (
      pathname === "/manifest/insights" ||
      pathname.startsWith("/manifest/insights/")
    ) {
      return [
        { label: "Manifest", href: "/manifest" },
        { label: "Insights", href: null },
      ];
    }
    if (pathname.startsWith("/manifest")) {
      return [{ label: "Manifest", href: "/manifest" }];
    }
    return [{ label: "Manifest", href: null }];
  }

  if (pathname.startsWith("/focus")) {
    if (pathname.startsWith("/focus/history")) {
      return [
        { label: "Focus", href: "/focus" },
        { label: "History", href: null },
      ];
    }
    if (pathname.startsWith("/focus/insights")) {
      return [
        { label: "Focus", href: "/focus" },
        { label: "Insights", href: null },
      ];
    }
    return [{ label: "Focus", href: null }];
  }
  if (pathname.startsWith("/heal")) {
    return healBreadcrumbs(pathname);
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

function healBreadcrumbs(pathname: string): AppBreadcrumbCrumb[] {
  const home: AppBreadcrumbCrumb = { label: "Heal", href: "/heal" };
  if (pathname === "/heal" || pathname === "/heal/") {
    return [{ label: "Heal", href: null }];
  }
  if (pathname.startsWith("/heal/support")) {
    return [home, { label: "Support", href: null }];
  }
  if (pathname.startsWith("/heal/rested")) {
    return [home, { label: "Laid to rest", href: null }];
  }
  const parts = pathname.split("/").filter(Boolean);
  const itemId = parts[1] ?? "";
  let title = "Heal";
  if (typeof window !== "undefined" && itemId) {
    const item = healItemById(loadHealStore(), itemId);
    if (item?.title.trim()) title = item.title.trim();
  }
  if (parts[2] === "letter") {
    return [
      home,
      { label: title, href: itemId ? `/heal/${itemId}` : "/heal" },
      { label: "Letter", href: null },
    ];
  }
  return [home, { label: title, href: null }];
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
      // Nested hubs (Library / Sounds) start collapsed; path resolve opens them.
      if (sub.children?.length) next[sub.id] = false;
    }
  }
  next["life-areas"] = true;
  return next;
}

export function isLifeAreaGoalPath(pathname: string): boolean {
  return /^\/(?:manifest|ideate|dream|plan)\/goal\/[^/?#]+/.test(pathname);
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
  next["life-areas"] = stored["life-areas-open"] !== false;
  if (isLifeAreaGoalPath(pathname)) next["life-areas"] = true;
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

/** Section ids that have expandable children in the main nav. */
export function sidebarExpandableSectionIds(): string[] {
  return APP_NAV_MAIN.filter((s) => (s.children?.length ?? 0) > 0).map(
    (s) => s.id,
  );
}

/**
 * Mobile sidebar: keep enough vertical space by limiting open parents.
 * - On a tool section (e.g. Meditate): that section stays open; at most one
 *   other parent may be open (opening another closes the previous “other”).
 * - On the dashboard (no active tool section): at most one parent open.
 */
export function clampMobileSidebarExpandState(
  state: Record<string, boolean>,
  pathname: string,
): Record<string, boolean> {
  const expandable = sidebarExpandableSectionIds();
  const next: Record<string, boolean> = { ...state };
  const active = activeNavSectionId(pathname);
  const activePinned =
    active && expandable.includes(active) ? active : null;

  if (activePinned) {
    next[activePinned] = true;
    const othersOpen = expandable.filter(
      (id) => id !== activePinned && next[id],
    );
    // At most one non-pinned parent. If several are open (e.g. all-expanded
    // defaults from resolve), collapse them all — only an explicit toggle
    // should open a second parent.
    if (othersOpen.length > 1) {
      for (const id of othersOpen) next[id] = false;
    }
    return next;
  }

  const open = expandable.filter((id) => next[id]);
  for (let i = 1; i < open.length; i++) {
    next[open[i]!] = false;
  }
  return next;
}
