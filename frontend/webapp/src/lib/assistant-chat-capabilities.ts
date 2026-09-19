/**
 * Catalog of assistant-chat capabilities for the product control plane.
 * Includes live ACTION markers across get/list/put/navigate surfaces.
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
      "LLM opening offers in-app help vs talk-it-through; then reflect or run actions",
    status: "live",
  },

  // —— Live ——
  {
    id: "add_gratitude",
    action: "add_gratitude",
    verb: "put",
    domain: "journal",
    summary: "Add to today’s gratitudes (empty slots first; append beyond 3)",
    params: ["text", "line1?", "line2?", "line3?"],
    status: "live",
  },
  {
    id: "update_gratitude",
    action: "update_gratitude",
    verb: "put",
    domain: "journal",
    summary: "Replace a gratitude line by match text or 1-based index",
    params: ["text", "match?", "index?", "date?", "id?"],
    status: "live",
  },
  {
    id: "add_todo",
    action: "add_todo",
    verb: "put",
    domain: "ideate",
    summary: "Add a life-area goal + To Dos (agree concrete To Dos before creating a GOAL)",
    params: [
      "title",
      "lifeAreaId?",
      "lifeAreaTitle?",
      "parentTaskId?",
      "parentTaskTitle?",
    ],
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

  // —— Journal ——
  {
    id: "list_gratitudes",
    action: "list_gratitudes",
    verb: "list",
    domain: "journal",
    summary: "List recent gratitude entries",
    params: ["limit?"],
    status: "live",
  },
  {
    id: "get_gratitude",
    action: "get_gratitude",
    verb: "get",
    domain: "journal",
    summary: "Fetch one gratitude by id or date",
    params: ["id?", "date?"],
    status: "live",
  },
  {
    id: "list_journal_entries",
    action: "list_journal_entries",
    verb: "list",
    domain: "journal",
    summary: "List freeform journal entries",
    params: ["folderId?", "limit?"],
    status: "live",
  },
  {
    id: "get_journal_entry",
    action: "get_journal_entry",
    verb: "get",
    domain: "journal",
    summary: "Fetch a journal entry by id",
    params: ["id"],
    status: "live",
  },
  {
    id: "add_journal_entry",
    action: "add_journal_entry",
    verb: "create",
    domain: "journal",
    summary: "Create a freeform journal entry from chat",
    params: ["title?", "body"],
    status: "live",
  },
  {
    id: "update_journal_entry",
    action: "update_journal_entry",
    verb: "put",
    domain: "journal",
    summary: "Update a freeform journal entry title/body from chat",
    params: ["id?", "match?", "title?", "body"],
    status: "live",
  },
  {
    id: "get_journal_insights",
    action: "get_journal_insights",
    verb: "get",
    domain: "journal",
    summary: "Fetch journal insights snapshot",
    status: "live",
  },
  {
    id: "run_journal_insights",
    action: "run_journal_insights",
    verb: "run",
    domain: "journal",
    summary: "Regenerate journal insights",
    status: "live",
  },
  {
    id: "list_weekly_letters",
    action: "list_weekly_letters",
    verb: "list",
    domain: "journal",
    summary: "List weekly reflection letters",
    status: "live",
  },
  {
    id: "get_weekly_reflection",
    action: "get_weekly_reflection",
    verb: "get",
    domain: "journal",
    summary: "Fetch weekly reflection for a week",
    params: ["weekKey?"],
    status: "live",
  },

  // —— Ideate / Manifest ——
  {
    id: "list_life_areas",
    action: "list_life_areas",
    verb: "list",
    domain: "ideate",
    summary: "List Manifest life areas",
    status: "live",
  },
  {
    id: "get_life_area",
    action: "get_life_area",
    verb: "get",
    domain: "ideate",
    summary: "Fetch one life area + tasks",
    params: ["id?", "title?"],
    status: "live",
  },
  {
    id: "create_life_area",
    action: "create_life_area",
    verb: "create",
    domain: "ideate",
    summary: "Create a life area",
    params: ["title", "description?"],
    status: "live",
  },
  {
    id: "put_life_area",
    action: "put_life_area",
    verb: "put",
    domain: "ideate",
    summary: "Update life area fields",
    params: ["id", "title?", "description?"],
    status: "live",
  },
  {
    id: "list_todos",
    action: "list_todos",
    verb: "list",
    domain: "ideate",
    summary: "List tasks for a life area",
    params: ["lifeAreaId?", "lifeAreaTitle?", "openOnly?"],
    status: "live",
  },
  {
    id: "put_todo",
    action: "put_todo",
    verb: "put",
    domain: "ideate",
    summary: "Update/move a task (by todoId or title; parentTaskTitle to reparent)",
    params: ["todoId?", "match?", "title?", "checked?", "parentTaskTitle?", "lifeAreaId?"],
    status: "live",
  },
  {
    id: "delete_todo",
    action: "delete_todo",
    verb: "delete",
    domain: "ideate",
    summary: "Remove a task (by todoId or title)",
    params: ["todoId?", "title?", "parentTaskTitle?", "lifeAreaId?"],
    status: "live",
  },
  {
    id: "get_ideate_store",
    action: "get_ideate_store",
    verb: "get",
    domain: "ideate",
    summary: "Fetch full Manifest store (cloud/local)",
    status: "live",
  },
  {
    id: "put_ideate_store",
    action: "put_ideate_store",
    verb: "put",
    domain: "ideate",
    summary: "Push Manifest store to cloud",
    status: "live",
  },
  {
    id: "list_vision_board",
    action: "list_vision_board",
    verb: "list",
    domain: "ideate",
    summary: "List vision-board items",
    status: "live",
  },

  // —— Meditate / library ——
  {
    id: "list_library",
    action: "list_library",
    verb: "list",
    domain: "library",
    summary: "List library meditations",
    params: ["favouritesOnly?", "limit?"],
    status: "live",
  },
  {
    id: "get_meditation",
    action: "get_meditation",
    verb: "get",
    domain: "library",
    summary: "Fetch meditation metadata / script",
    params: ["sk"],
    status: "live",
  },
  {
    id: "put_meditation_favourite",
    action: "put_meditation_favourite",
    verb: "put",
    domain: "library",
    summary: "Favourite / unfavourite a meditation",
    params: ["sk", "favourite"],
    status: "live",
  },
  {
    id: "put_meditation_archived",
    action: "put_meditation_archived",
    verb: "put",
    domain: "library",
    summary: "Archive / restore a meditation",
    params: ["sk", "archived"],
    status: "live",
  },
  {
    id: "put_meditation_public",
    action: "put_meditation_public",
    verb: "put",
    domain: "library",
    summary: "Set meditation public flag",
    params: ["sk", "isPublic"],
    status: "live",
  },
  {
    id: "play_meditation",
    action: "play_meditation",
    verb: "run",
    domain: "library",
    summary: "Play a library meditation in the strip",
    params: ["sk"],
    status: "live",
  },
  {
    id: "list_programs",
    action: "list_programs",
    verb: "list",
    domain: "library",
    summary: "List meditation programs",
    status: "live",
  },
  {
    id: "navigate_create_by_type",
    action: "navigate_create_by_type",
    verb: "navigate",
    domain: "meditate",
    summary: "Open Create → By Type",
    params: ["style?"],
    status: "live",
  },
  {
    id: "navigate_create_from_journal",
    action: "navigate_create_from_journal",
    verb: "navigate",
    domain: "meditate",
    summary: "Open Create → from journal",
    params: ["entryId?"],
    status: "live",
  },
  {
    id: "navigate_create_from_idea",
    action: "navigate_create_from_idea",
    verb: "navigate",
    domain: "meditate",
    summary: "Open Create → from Manifest life area",
    params: ["lifeAreaId?"],
    status: "live",
  },

  // —— Sounds ——
  {
    id: "list_sounds",
    action: "list_sounds",
    verb: "list",
    domain: "sounds",
    summary: "List background sounds / categories",
    status: "live",
  },
  {
    id: "list_sound_mixes",
    action: "list_sound_mixes",
    verb: "list",
    domain: "sounds",
    summary: "List saved sound mixes",
    status: "live",
  },
  {
    id: "put_sound_mix",
    action: "put_sound_mix",
    verb: "put",
    domain: "sounds",
    summary: "Save or update a sound mix",
    params: ["id?", "name", "layers"],
    status: "live",
  },

  // —— Focus ——
  {
    id: "get_focus_session",
    action: "get_focus_session",
    verb: "get",
    domain: "focus",
    summary: "Get current focus timer state",
    status: "live",
  },
  {
    id: "start_focus",
    action: "start_focus",
    verb: "run",
    domain: "focus",
    summary: "Start a focus session",
    params: ["minutes?", "todoId?"],
    status: "live",
  },
  {
    id: "pause_focus",
    action: "pause_focus",
    verb: "run",
    domain: "focus",
    summary: "Pause the focus timer",
    status: "live",
  },
  {
    id: "stop_focus",
    action: "stop_focus",
    verb: "run",
    domain: "focus",
    summary: "Stop / reset the focus timer",
    status: "live",
  },

  // —— Nav / account ——
  {
    id: "navigate",
    action: "navigate",
    verb: "navigate",
    domain: "nav",
    summary: "Open an in-app route",
    params: ["href"],
    status: "live",
  },
  {
    id: "get_daily_status",
    action: "get_daily_status",
    verb: "get",
    domain: "account",
    summary: "Fetch dashboard daily status",
    status: "live",
  },
  {
    id: "put_daily_check",
    action: "put_daily_check",
    verb: "put",
    domain: "account",
    summary: "Mark a daily check item",
    params: ["key", "done"],
    status: "live",
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
