/**
 * Catalog of assistant-chat capabilities for the product control plane.
 * Includes live ACTION markers and planned get/list/put surfaces.
 */

export type AssistantCapabilityStatus = "live" | "planned";

export type AssistantCapabilityVerb =
  | "get"
  | "list"
  | "put"
  | "create"
  | "update"
  | "delete"
  | "navigate"
  | "run";

export type AssistantCapability = {
  id: string;
  /** ACTION marker name when applicable (live) or proposed name (planned). */
  action: string;
  verb: AssistantCapabilityVerb;
  domain:
    | "coach"
    | "journal"
    | "ideate"
    | "meditate"
    | "focus"
    | "library"
    | "sounds"
    | "account"
    | "nav";
  summary: string;
  /** Example params for ACTION markers / future tools. */
  params?: string[];
  status: AssistantCapabilityStatus;
};

export const ASSISTANT_CHAT_CAPABILITIES: readonly AssistantCapability[] = [
  // —— Life coach (conversational; no ACTION) ——
  {
    id: "life_coach_reflect",
    action: "(conversation)",
    verb: "run",
    domain: "coach",
    summary:
      "Wise, compassionate life / spiritual coaching — personal questions, reflection, meaning",
    status: "live",
  },

  // —— Live ——
  {
    id: "add_gratitude",
    action: "add_gratitude",
    verb: "put",
    domain: "journal",
    summary: "Add or fill today’s gratitude lines",
    params: ["line1", "line2", "line3"],
    status: "live",
  },
  {
    id: "add_todo",
    action: "add_todo",
    verb: "put",
    domain: "ideate",
    summary: "Add a task under a life area",
    params: ["title", "lifeAreaId?", "lifeAreaTitle?"],
    status: "live",
  },
  {
    id: "create_meditation",
    action: "create_meditation",
    verb: "navigate",
    domain: "meditate",
    summary: "Open Create Meditation (from-chat)",
    params: ["summary?", "style?"],
    status: "live",
  },

  // —— Journal (planned) ——
  {
    id: "list_gratitudes",
    action: "list_gratitudes",
    verb: "list",
    domain: "journal",
    summary: "List recent gratitude entries",
    params: ["limit?"],
    status: "planned",
  },
  {
    id: "get_gratitude",
    action: "get_gratitude",
    verb: "get",
    domain: "journal",
    summary: "Fetch one gratitude by id or date",
    params: ["id?", "date?"],
    status: "planned",
  },
  {
    id: "list_journal_entries",
    action: "list_journal_entries",
    verb: "list",
    domain: "journal",
    summary: "List freeform journal entries",
    params: ["folderId?", "limit?"],
    status: "planned",
  },
  {
    id: "get_journal_entry",
    action: "get_journal_entry",
    verb: "get",
    domain: "journal",
    summary: "Fetch a journal entry by id",
    params: ["id"],
    status: "planned",
  },
  {
    id: "create_journal_entry",
    action: "create_journal_entry",
    verb: "create",
    domain: "journal",
    summary: "Create a new journal entry (optional body)",
    params: ["title?", "body?"],
    status: "planned",
  },
  {
    id: "put_journal_entry",
    action: "put_journal_entry",
    verb: "put",
    domain: "journal",
    summary: "Update journal entry title/body",
    params: ["id", "title?", "body?"],
    status: "planned",
  },
  {
    id: "get_journal_insights",
    action: "get_journal_insights",
    verb: "get",
    domain: "journal",
    summary: "Fetch journal insights snapshot",
    status: "planned",
  },
  {
    id: "run_journal_insights",
    action: "run_journal_insights",
    verb: "run",
    domain: "journal",
    summary: "Regenerate journal insights",
    status: "planned",
  },
  {
    id: "list_weekly_letters",
    action: "list_weekly_letters",
    verb: "list",
    domain: "journal",
    summary: "List weekly reflection letters",
    status: "planned",
  },
  {
    id: "get_weekly_reflection",
    action: "get_weekly_reflection",
    verb: "get",
    domain: "journal",
    summary: "Fetch weekly reflection for a week",
    params: ["weekKey?"],
    status: "planned",
  },

  // —— Ideate (planned) ——
  {
    id: "list_life_areas",
    action: "list_life_areas",
    verb: "list",
    domain: "ideate",
    summary: "List Ideate life areas",
    status: "planned",
  },
  {
    id: "get_life_area",
    action: "get_life_area",
    verb: "get",
    domain: "ideate",
    summary: "Fetch one life area + tasks",
    params: ["id?", "title?"],
    status: "planned",
  },
  {
    id: "create_life_area",
    action: "create_life_area",
    verb: "create",
    domain: "ideate",
    summary: "Create a life area",
    params: ["title", "description?"],
    status: "planned",
  },
  {
    id: "put_life_area",
    action: "put_life_area",
    verb: "put",
    domain: "ideate",
    summary: "Update life area fields",
    params: ["id", "title?", "description?"],
    status: "planned",
  },
  {
    id: "list_todos",
    action: "list_todos",
    verb: "list",
    domain: "ideate",
    summary: "List tasks for a life area",
    params: ["lifeAreaId?", "lifeAreaTitle?", "openOnly?"],
    status: "planned",
  },
  {
    id: "put_todo",
    action: "put_todo",
    verb: "put",
    domain: "ideate",
    summary: "Update a task (title / checked)",
    params: ["todoId", "title?", "checked?"],
    status: "planned",
  },
  {
    id: "delete_todo",
    action: "delete_todo",
    verb: "delete",
    domain: "ideate",
    summary: "Remove a task",
    params: ["todoId"],
    status: "planned",
  },
  {
    id: "get_ideate_store",
    action: "get_ideate_store",
    verb: "get",
    domain: "ideate",
    summary: "Fetch full Ideate store (cloud/local)",
    status: "planned",
  },
  {
    id: "put_ideate_store",
    action: "put_ideate_store",
    verb: "put",
    domain: "ideate",
    summary: "Push Ideate store to cloud",
    status: "planned",
  },
  {
    id: "list_vision_board",
    action: "list_vision_board",
    verb: "list",
    domain: "ideate",
    summary: "List vision-board items",
    status: "planned",
  },

  // —— Meditate / library (planned) ——
  {
    id: "list_library",
    action: "list_library",
    verb: "list",
    domain: "library",
    summary: "List library meditations",
    params: ["favouritesOnly?", "limit?"],
    status: "planned",
  },
  {
    id: "get_meditation",
    action: "get_meditation",
    verb: "get",
    domain: "library",
    summary: "Fetch meditation metadata / script",
    params: ["sk"],
    status: "planned",
  },
  {
    id: "put_meditation_favourite",
    action: "put_meditation_favourite",
    verb: "put",
    domain: "library",
    summary: "Favourite / unfavourite a meditation",
    params: ["sk", "favourite"],
    status: "planned",
  },
  {
    id: "put_meditation_archived",
    action: "put_meditation_archived",
    verb: "put",
    domain: "library",
    summary: "Archive / restore a meditation",
    params: ["sk", "archived"],
    status: "planned",
  },
  {
    id: "put_meditation_public",
    action: "put_meditation_public",
    verb: "put",
    domain: "library",
    summary: "Set meditation public flag",
    params: ["sk", "isPublic"],
    status: "planned",
  },
  {
    id: "play_meditation",
    action: "play_meditation",
    verb: "run",
    domain: "library",
    summary: "Play a library meditation in the strip",
    params: ["sk"],
    status: "planned",
  },
  {
    id: "list_programs",
    action: "list_programs",
    verb: "list",
    domain: "library",
    summary: "List meditation programs",
    status: "planned",
  },
  {
    id: "navigate_create_by_type",
    action: "navigate_create_by_type",
    verb: "navigate",
    domain: "meditate",
    summary: "Open Create → By Type",
    params: ["style?"],
    status: "planned",
  },
  {
    id: "navigate_create_from_journal",
    action: "navigate_create_from_journal",
    verb: "navigate",
    domain: "meditate",
    summary: "Open Create → from journal",
    params: ["entryId?"],
    status: "planned",
  },
  {
    id: "navigate_create_from_idea",
    action: "navigate_create_from_idea",
    verb: "navigate",
    domain: "meditate",
    summary: "Open Create → from Ideate life area",
    params: ["lifeAreaId?"],
    status: "planned",
  },

  // —— Sounds (planned) ——
  {
    id: "list_sounds",
    action: "list_sounds",
    verb: "list",
    domain: "sounds",
    summary: "List background sounds / categories",
    status: "planned",
  },
  {
    id: "list_sound_mixes",
    action: "list_sound_mixes",
    verb: "list",
    domain: "sounds",
    summary: "List saved sound mixes",
    status: "planned",
  },
  {
    id: "put_sound_mix",
    action: "put_sound_mix",
    verb: "put",
    domain: "sounds",
    summary: "Save or update a sound mix",
    params: ["id?", "name", "layers"],
    status: "planned",
  },

  // —— Focus (planned) ——
  {
    id: "get_focus_session",
    action: "get_focus_session",
    verb: "get",
    domain: "focus",
    summary: "Get current focus timer state",
    status: "planned",
  },
  {
    id: "start_focus",
    action: "start_focus",
    verb: "run",
    domain: "focus",
    summary: "Start a focus session",
    params: ["minutes?", "todoId?"],
    status: "planned",
  },
  {
    id: "pause_focus",
    action: "pause_focus",
    verb: "run",
    domain: "focus",
    summary: "Pause the focus timer",
    status: "planned",
  },
  {
    id: "stop_focus",
    action: "stop_focus",
    verb: "run",
    domain: "focus",
    summary: "Stop / reset the focus timer",
    status: "planned",
  },

  // —— Nav / account (planned) ——
  {
    id: "navigate",
    action: "navigate",
    verb: "navigate",
    domain: "nav",
    summary: "Open an in-app route",
    params: ["href"],
    status: "planned",
  },
  {
    id: "get_daily_status",
    action: "get_daily_status",
    verb: "get",
    domain: "account",
    summary: "Fetch dashboard daily status",
    status: "planned",
  },
  {
    id: "put_daily_check",
    action: "put_daily_check",
    verb: "put",
    domain: "account",
    summary: "Mark a daily check item",
    params: ["key", "done"],
    status: "planned",
  },
] as const;

export function assistantCapabilitiesByDomain(): Map<
  AssistantCapability["domain"],
  AssistantCapability[]
> {
  const map = new Map<AssistantCapability["domain"], AssistantCapability[]>();
  for (const cap of ASSISTANT_CHAT_CAPABILITIES) {
    const list = map.get(cap.domain) ?? [];
    list.push(cap);
    map.set(cap.domain, list);
  }
  return map;
}

export function isAssistantChatDevHost(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}
