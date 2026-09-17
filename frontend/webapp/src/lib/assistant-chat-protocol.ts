/**
 * Assistant Chat action protocol (separate from meditation coach [[READY]]).
 *
 * Model replies with normal prose, then zero or more markers:
 *   [[ACTION:name|key=value|key2=value2]]
 *
 * Values use URL-encoding for reserved chars (| = & [[ ]]).
 * Markers are stripped from the bubble before display; the client executes them.
 */

export type AssistantActionName =
  | "add_gratitude"
  | "update_gratitude"
  | "add_journal_entry"
  | "update_journal_entry"
  | "list_gratitudes"
  | "get_gratitude"
  | "list_journal_entries"
  | "get_journal_entry"
  | "get_journal_insights"
  | "run_journal_insights"
  | "list_weekly_letters"
  | "get_weekly_reflection"
  | "add_todo"
  | "list_life_areas"
  | "get_life_area"
  | "create_life_area"
  | "put_life_area"
  | "list_todos"
  | "put_todo"
  | "delete_todo"
  | "get_ideate_store"
  | "put_ideate_store"
  | "list_vision_board"
  | "create_meditation"
  | "list_library"
  | "get_meditation"
  | "put_meditation_favourite"
  | "put_meditation_archived"
  | "put_meditation_public"
  | "play_meditation"
  | "list_programs"
  | "navigate_create_by_type"
  | "navigate_create_from_journal"
  | "navigate_create_from_idea"
  | "list_sounds"
  | "list_sound_mixes"
  | "put_sound_mix"
  | "get_focus_session"
  | "start_focus"
  | "pause_focus"
  | "stop_focus"
  | "navigate"
  | "get_daily_status"
  | "put_daily_check";

export type AssistantAction =
  | {
      name: "add_gratitude";
      /** One or more new lines — fill empty slots first, then append (never overwrite). */
      lines: string[];
    }
  | {
      name: "update_gratitude";
      /** Substring / prior text to find today’s line. */
      match: string;
      /** Full replacement text for that line. */
      text: string;
    }
  | {
      name: "add_journal_entry";
      title?: string;
      body: string;
    }
  | {
      name: "update_journal_entry";
      id?: string;
      match?: string;
      title?: string;
      body: string;
    }
  | { name: "list_gratitudes"; limit?: number }
  | { name: "get_gratitude"; id?: string; date?: string }
  | {
      name: "list_journal_entries";
      folderId?: string;
      limit?: number;
    }
  | { name: "get_journal_entry"; id: string }
  | { name: "get_journal_insights" }
  | { name: "run_journal_insights" }
  | { name: "list_weekly_letters" }
  | { name: "get_weekly_reflection"; weekKey?: string }
  | {
      name: "add_todo";
      title: string;
      lifeAreaId?: string;
      lifeAreaTitle?: string;
      parentTaskId?: string;
      parentTaskTitle?: string;
    }
  | { name: "list_life_areas" }
  | { name: "get_life_area"; id?: string; title?: string }
  | {
      name: "create_life_area";
      title: string;
      description?: string;
    }
  | {
      name: "put_life_area";
      id: string;
      title?: string;
      description?: string;
    }
  | {
      name: "list_todos";
      lifeAreaId?: string;
      lifeAreaTitle?: string;
      openOnly?: boolean;
    }
  | {
      name: "put_todo";
      todoId: string;
      title?: string;
      checked?: boolean;
    }
  | { name: "delete_todo"; todoId: string }
  | { name: "get_ideate_store" }
  | { name: "put_ideate_store" }
  | { name: "list_vision_board" }
  | {
      name: "create_meditation";
      summary?: string;
      style?: string;
    }
  | {
      name: "list_library";
      favouritesOnly?: boolean;
      limit?: number;
    }
  | { name: "get_meditation"; sk: string }
  | {
      name: "put_meditation_favourite";
      sk: string;
      favourite: boolean;
    }
  | {
      name: "put_meditation_archived";
      sk: string;
      archived: boolean;
    }
  | {
      name: "put_meditation_public";
      sk: string;
      isPublic: boolean;
    }
  | { name: "play_meditation"; sk: string }
  | { name: "list_programs" }
  | { name: "navigate_create_by_type"; style?: string }
  | { name: "navigate_create_from_journal"; entryId?: string }
  | { name: "navigate_create_from_idea"; lifeAreaId?: string }
  | { name: "list_sounds" }
  | { name: "list_sound_mixes" }
  | {
      name: "put_sound_mix";
      id?: string;
      name: string;
      natureKey?: string;
      musicKey?: string;
      drumsKey?: string;
      noiseKey?: string;
      natureGain?: number;
      musicGain?: number;
      drumsGain?: number;
      noiseGain?: number;
    }
  | { name: "get_focus_session" }
  | {
      name: "start_focus";
      minutes?: number;
      todoId?: string;
    }
  | { name: "pause_focus" }
  | { name: "stop_focus" }
  | { name: "navigate"; href: string }
  | { name: "get_daily_status" }
  | {
      name: "put_daily_check";
      key: "gratitude" | "meditation" | "lifeArea";
      done: boolean;
    };

const ACTION_RE =
  /\[\[\s*ACTION\s*:\s*([a-z_]+)(?:\|([^\]]*))?\s*\]\]/gi;

function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function parseParams(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw?.trim()) return out;
  for (const part of raw.split("|")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = decodeParam(part.slice(eq + 1).trim());
    if (key) out[key] = value;
  }
  return out;
}

function optStr(params: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = (params[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function optInt(params: Record<string, string>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const raw = (params[k] ?? "").trim();
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return undefined;
}

function optBool(
  params: Record<string, string>,
  ...keys: string[]
): boolean | undefined {
  for (const k of keys) {
    const raw = (params[k] ?? "").trim().toLowerCase();
    if (!raw) continue;
    if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
      return true;
    }
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
      return false;
    }
  }
  return undefined;
}

function coerceAddGratitudeLines(params: Record<string, string>): string[] {
  const single = (params.text ?? params.line ?? "").trim();
  const fromNumbered = [
    params.line1 ?? params.l1,
    params.line2 ?? params.l2,
    params.line3 ?? params.l3,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (single) return [single, ...fromNumbered.filter((l) => l !== single)];
  return fromNumbered;
}

function coerceAction(
  name: string,
  params: Record<string, string>,
): AssistantAction | null {
  if (name === "add_gratitude") {
    const lines = coerceAddGratitudeLines(params);
    if (!lines.length) return null;
    return { name: "add_gratitude", lines };
  }
  if (name === "update_gratitude") {
    const match = optStr(params, "match", "prev", "from");
    const text = optStr(params, "text", "line", "to");
    if (!match || !text) return null;
    return { name: "update_gratitude", match, text };
  }
  if (
    name === "add_journal_entry" ||
    name === "create_journal_entry" ||
    name === "add_journal"
  ) {
    const body = optStr(params, "body", "text", "content", "entry");
    if (!body) return null;
    const title = optStr(params, "title");
    return {
      name: "add_journal_entry",
      body,
      ...(title ? { title } : {}),
    };
  }
  if (
    name === "update_journal_entry" ||
    name === "put_journal_entry" ||
    name === "update_journal"
  ) {
    const body = optStr(params, "body", "text", "content", "entry");
    if (!body) return null;
    const id = optStr(params, "id");
    const match = optStr(params, "match", "prev", "from");
    const title = optStr(params, "title");
    return {
      name: "update_journal_entry",
      body,
      ...(id ? { id } : {}),
      ...(match ? { match } : {}),
      ...(title ? { title } : {}),
    };
  }
  if (name === "list_gratitudes") {
    const limit = optInt(params, "limit");
    return {
      name: "list_gratitudes",
      ...(limit != null ? { limit } : {}),
    };
  }
  if (name === "get_gratitude") {
    const id = optStr(params, "id");
    const date = optStr(params, "date", "dateKey");
    if (!id && !date) return null;
    return {
      name: "get_gratitude",
      ...(id ? { id } : {}),
      ...(date ? { date } : {}),
    };
  }
  if (name === "list_journal_entries") {
    const folderId = optStr(params, "folderId", "folder_id");
    const limit = optInt(params, "limit");
    return {
      name: "list_journal_entries",
      ...(folderId ? { folderId } : {}),
      ...(limit != null ? { limit } : {}),
    };
  }
  if (name === "get_journal_entry") {
    const id = optStr(params, "id");
    if (!id) return null;
    return { name: "get_journal_entry", id };
  }
  if (name === "get_journal_insights") {
    return { name: "get_journal_insights" };
  }
  if (name === "run_journal_insights") {
    return { name: "run_journal_insights" };
  }
  if (name === "list_weekly_letters") {
    return { name: "list_weekly_letters" };
  }
  if (name === "get_weekly_reflection") {
    const weekKey = optStr(params, "weekKey", "week", "week_key");
    return {
      name: "get_weekly_reflection",
      ...(weekKey ? { weekKey } : {}),
    };
  }
  if (name === "add_todo") {
    const title = optStr(params, "title", "task");
    if (!title) return null;
    const lifeAreaId = optStr(params, "lifeAreaId", "life_area_id");
    const lifeAreaTitle = optStr(
      params,
      "lifeAreaTitle",
      "life_area",
      "area",
    );
    const parentTaskId = optStr(
      params,
      "parentTaskId",
      "parent_task_id",
      "taskId",
    );
    const parentTaskTitle = optStr(
      params,
      "parentTaskTitle",
      "parent_task",
      "parentTask",
    );
    return {
      name: "add_todo",
      title,
      ...(lifeAreaId ? { lifeAreaId } : {}),
      ...(lifeAreaTitle ? { lifeAreaTitle } : {}),
      ...(parentTaskId ? { parentTaskId } : {}),
      ...(parentTaskTitle ? { parentTaskTitle } : {}),
    };
  }
  if (name === "list_life_areas") {
    return { name: "list_life_areas" };
  }
  if (name === "get_life_area") {
    const id = optStr(params, "id");
    const title = optStr(params, "title", "name");
    if (!id && !title) return null;
    return {
      name: "get_life_area",
      ...(id ? { id } : {}),
      ...(title ? { title } : {}),
    };
  }
  if (name === "create_life_area") {
    const title = optStr(params, "title", "name");
    if (!title) return null;
    const description = optStr(params, "description", "desc", "dreamText");
    return {
      name: "create_life_area",
      title,
      ...(description ? { description } : {}),
    };
  }
  if (name === "put_life_area") {
    const id = optStr(params, "id");
    if (!id) return null;
    const title = optStr(params, "title", "name");
    const description = optStr(params, "description", "desc", "dreamText");
    return {
      name: "put_life_area",
      id,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    };
  }
  if (name === "list_todos") {
    const lifeAreaId = optStr(params, "lifeAreaId", "life_area_id");
    const lifeAreaTitle = optStr(
      params,
      "lifeAreaTitle",
      "life_area",
      "area",
    );
    const openOnly = optBool(params, "openOnly", "open_only");
    return {
      name: "list_todos",
      ...(lifeAreaId ? { lifeAreaId } : {}),
      ...(lifeAreaTitle ? { lifeAreaTitle } : {}),
      ...(openOnly != null ? { openOnly } : {}),
    };
  }
  if (name === "put_todo") {
    const todoId = optStr(params, "todoId", "id", "taskId");
    if (!todoId) return null;
    const title = optStr(params, "title");
    const checked = optBool(params, "checked", "done", "complete");
    return {
      name: "put_todo",
      todoId,
      ...(title ? { title } : {}),
      ...(checked != null ? { checked } : {}),
    };
  }
  if (name === "delete_todo") {
    const todoId = optStr(params, "todoId", "id", "taskId");
    if (!todoId) return null;
    return { name: "delete_todo", todoId };
  }
  if (name === "get_ideate_store") {
    return { name: "get_ideate_store" };
  }
  if (name === "put_ideate_store") {
    return { name: "put_ideate_store" };
  }
  if (name === "list_vision_board") {
    return { name: "list_vision_board" };
  }
  if (name === "create_meditation") {
    const summary = optStr(params, "summary", "prompt");
    const style = optStr(params, "style");
    return {
      name: "create_meditation",
      ...(summary ? { summary } : {}),
      ...(style ? { style } : {}),
    };
  }
  if (name === "list_library") {
    const favouritesOnly = optBool(
      params,
      "favouritesOnly",
      "favourites",
      "favoritesOnly",
    );
    const limit = optInt(params, "limit");
    return {
      name: "list_library",
      ...(favouritesOnly != null ? { favouritesOnly } : {}),
      ...(limit != null ? { limit } : {}),
    };
  }
  if (name === "get_meditation") {
    const sk = optStr(params, "sk", "id", "s3Key");
    if (!sk) return null;
    return { name: "get_meditation", sk };
  }
  if (name === "put_meditation_favourite") {
    const sk = optStr(params, "sk", "id");
    const favourite = optBool(params, "favourite", "favorite");
    if (!sk || favourite == null) return null;
    return { name: "put_meditation_favourite", sk, favourite };
  }
  if (name === "put_meditation_archived") {
    const sk = optStr(params, "sk", "id");
    const archived = optBool(params, "archived");
    if (!sk || archived == null) return null;
    return { name: "put_meditation_archived", sk, archived };
  }
  if (name === "put_meditation_public") {
    const sk = optStr(params, "sk", "id");
    const isPublic = optBool(params, "isPublic", "public");
    if (!sk || isPublic == null) return null;
    return { name: "put_meditation_public", sk, isPublic };
  }
  if (name === "play_meditation") {
    const sk = optStr(params, "sk", "id");
    if (!sk) return null;
    return { name: "play_meditation", sk };
  }
  if (name === "list_programs") {
    return { name: "list_programs" };
  }
  if (name === "navigate_create_by_type") {
    const style = optStr(params, "style");
    return {
      name: "navigate_create_by_type",
      ...(style ? { style } : {}),
    };
  }
  if (name === "navigate_create_from_journal") {
    const entryId = optStr(params, "entryId", "id");
    return {
      name: "navigate_create_from_journal",
      ...(entryId ? { entryId } : {}),
    };
  }
  if (name === "navigate_create_from_idea") {
    const lifeAreaId = optStr(params, "lifeAreaId", "id");
    return {
      name: "navigate_create_from_idea",
      ...(lifeAreaId ? { lifeAreaId } : {}),
    };
  }
  if (name === "list_sounds") {
    return { name: "list_sounds" };
  }
  if (name === "list_sound_mixes") {
    return { name: "list_sound_mixes" };
  }
  if (name === "put_sound_mix") {
    const mixName = optStr(params, "name", "title");
    if (!mixName) return null;
    const id = optStr(params, "id");
    const natureKey = optStr(params, "natureKey", "nature");
    const musicKey = optStr(params, "musicKey", "music");
    const drumsKey = optStr(params, "drumsKey", "drums");
    const noiseKey = optStr(params, "noiseKey", "noise");
    // Optional `layers` JSON: {natureKey,musicKey,...} or array of {channel,key,gain}
    const layersRaw = optStr(params, "layers");
    let fromLayers: Partial<{
      natureKey: string;
      musicKey: string;
      drumsKey: string;
      noiseKey: string;
      natureGain: number;
      musicGain: number;
      drumsGain: number;
      noiseGain: number;
    }> = {};
    if (layersRaw) {
      try {
        const parsed = JSON.parse(layersRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const o = parsed as Record<string, unknown>;
          fromLayers = {
            ...(typeof o.natureKey === "string" ? { natureKey: o.natureKey } : {}),
            ...(typeof o.musicKey === "string" ? { musicKey: o.musicKey } : {}),
            ...(typeof o.drumsKey === "string" ? { drumsKey: o.drumsKey } : {}),
            ...(typeof o.noiseKey === "string" ? { noiseKey: o.noiseKey } : {}),
            ...(typeof o.natureGain === "number" ? { natureGain: o.natureGain } : {}),
            ...(typeof o.musicGain === "number" ? { musicGain: o.musicGain } : {}),
            ...(typeof o.drumsGain === "number" ? { drumsGain: o.drumsGain } : {}),
            ...(typeof o.noiseGain === "number" ? { noiseGain: o.noiseGain } : {}),
          };
        } else if (Array.isArray(parsed)) {
          for (const row of parsed) {
            if (!row || typeof row !== "object") continue;
            const r = row as Record<string, unknown>;
            const ch = String(r.channel ?? r.cat ?? "").toLowerCase();
            const key = typeof r.key === "string" ? r.key : "";
            const gain =
              typeof r.gain === "number" && Number.isFinite(r.gain)
                ? r.gain
                : undefined;
            if (ch === "nature" || ch === "ambience") {
              if (key) fromLayers.natureKey = key;
              if (gain != null) fromLayers.natureGain = gain;
            } else if (ch === "music") {
              if (key) fromLayers.musicKey = key;
              if (gain != null) fromLayers.musicGain = gain;
            } else if (ch === "drums") {
              if (key) fromLayers.drumsKey = key;
              if (gain != null) fromLayers.drumsGain = gain;
            } else if (ch === "noise") {
              if (key) fromLayers.noiseKey = key;
              if (gain != null) fromLayers.noiseGain = gain;
            }
          }
        }
      } catch {
        /* ignore bad layers JSON */
      }
    }
    return {
      name: "put_sound_mix",
      name: mixName,
      ...(id ? { id } : {}),
      ...(natureKey || fromLayers.natureKey
        ? { natureKey: natureKey || fromLayers.natureKey }
        : {}),
      ...(musicKey || fromLayers.musicKey
        ? { musicKey: musicKey || fromLayers.musicKey }
        : {}),
      ...(drumsKey || fromLayers.drumsKey
        ? { drumsKey: drumsKey || fromLayers.drumsKey }
        : {}),
      ...(noiseKey || fromLayers.noiseKey
        ? { noiseKey: noiseKey || fromLayers.noiseKey }
        : {}),
      ...(fromLayers.natureGain != null
        ? { natureGain: fromLayers.natureGain }
        : {}),
      ...(fromLayers.musicGain != null ? { musicGain: fromLayers.musicGain } : {}),
      ...(fromLayers.drumsGain != null ? { drumsGain: fromLayers.drumsGain } : {}),
      ...(fromLayers.noiseGain != null ? { noiseGain: fromLayers.noiseGain } : {}),
    };
  }
  if (name === "get_focus_session") {
    return { name: "get_focus_session" };
  }
  if (name === "start_focus") {
    const minutes = optInt(params, "minutes", "mins");
    const todoId = optStr(params, "todoId", "taskId", "subtaskId");
    return {
      name: "start_focus",
      ...(minutes != null ? { minutes } : {}),
      ...(todoId ? { todoId } : {}),
    };
  }
  if (name === "pause_focus") {
    return { name: "pause_focus" };
  }
  if (name === "stop_focus") {
    return { name: "stop_focus" };
  }
  if (name === "navigate") {
    const href = optStr(params, "href", "path", "url");
    if (!href) return null;
    return { name: "navigate", href };
  }
  if (name === "get_daily_status") {
    return { name: "get_daily_status" };
  }
  if (name === "put_daily_check") {
    const keyRaw = optStr(params, "key", "pillar").toLowerCase();
    const done = optBool(params, "done", "checked");
    if (done == null) return null;
    const key =
      keyRaw === "gratitude" || keyRaw === "meditation" || keyRaw === "lifearea"
        ? keyRaw === "lifearea"
          ? "lifeArea"
          : (keyRaw as "gratitude" | "meditation")
        : null;
    if (!key) return null;
    return { name: "put_daily_check", key, done };
  }
  return null;
}

export function parseAssistantDisplayText(raw: string): {
  text: string;
  actions: AssistantAction[];
} {
  const actions: AssistantAction[] = [];
  let s = raw.replace(ACTION_RE, (_full, name: string, paramsRaw?: string) => {
    const action = coerceAction(
      String(name || "").toLowerCase(),
      parseParams(paramsRaw),
    );
    if (action) actions.push(action);
    return "";
  });
  // Drop any other [[…]] markers and incomplete trailing opens (streaming).
  s = s.replace(/\[\[[^\]]*\]\]/g, "");
  const open = s.lastIndexOf("[[");
  if (open !== -1 && !s.slice(open).includes("]]")) {
    s = s.slice(0, open);
  }
  if (s.endsWith("[")) s = s.slice(0, -1);
  s = s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  return { text: s.trimEnd(), actions };
}

export function encodeAssistantAction(action: AssistantAction): string {
  const enc = (v: string) => encodeURIComponent(v);
  const parts: string[] = [];
  const add = (k: string, v: string | number | boolean | undefined) => {
    if (v === undefined || v === "") return;
    parts.push(`${k}=${enc(String(v))}`);
  };

  switch (action.name) {
    case "add_gratitude":
      if (action.lines.length === 1) {
        return `[[ACTION:add_gratitude|text=${enc(action.lines[0]!)}]]`;
      }
      return `[[ACTION:add_gratitude|${action.lines
        .map((line, i) => `line${i + 1}=${enc(line)}`)
        .join("|")}]]`;
    case "update_gratitude":
      return `[[ACTION:update_gratitude|match=${enc(action.match)}|text=${enc(action.text)}]]`;
    case "add_journal_entry":
      add("title", action.title);
      add("body", action.body);
      return `[[ACTION:add_journal_entry|${parts.join("|")}]]`;
    case "update_journal_entry":
      add("id", action.id);
      add("match", action.match);
      add("title", action.title);
      add("body", action.body);
      return `[[ACTION:update_journal_entry|${parts.join("|")}]]`;
    case "list_gratitudes":
      add("limit", action.limit);
      return parts.length
        ? `[[ACTION:list_gratitudes|${parts.join("|")}]]`
        : `[[ACTION:list_gratitudes]]`;
    case "get_gratitude":
      add("id", action.id);
      add("date", action.date);
      return `[[ACTION:get_gratitude|${parts.join("|")}]]`;
    case "list_journal_entries":
      add("folderId", action.folderId);
      add("limit", action.limit);
      return parts.length
        ? `[[ACTION:list_journal_entries|${parts.join("|")}]]`
        : `[[ACTION:list_journal_entries]]`;
    case "get_journal_entry":
      return `[[ACTION:get_journal_entry|id=${enc(action.id)}]]`;
    case "get_journal_insights":
      return `[[ACTION:get_journal_insights]]`;
    case "run_journal_insights":
      return `[[ACTION:run_journal_insights]]`;
    case "list_weekly_letters":
      return `[[ACTION:list_weekly_letters]]`;
    case "get_weekly_reflection":
      add("weekKey", action.weekKey);
      return parts.length
        ? `[[ACTION:get_weekly_reflection|${parts.join("|")}]]`
        : `[[ACTION:get_weekly_reflection]]`;
    case "add_todo":
      add("title", action.title);
      add("lifeAreaId", action.lifeAreaId);
      add("lifeAreaTitle", action.lifeAreaTitle);
      add("parentTaskId", action.parentTaskId);
      add("parentTaskTitle", action.parentTaskTitle);
      return `[[ACTION:add_todo|${parts.join("|")}]]`;
    case "list_life_areas":
      return `[[ACTION:list_life_areas]]`;
    case "get_life_area":
      add("id", action.id);
      add("title", action.title);
      return `[[ACTION:get_life_area|${parts.join("|")}]]`;
    case "create_life_area":
      add("title", action.title);
      add("description", action.description);
      return `[[ACTION:create_life_area|${parts.join("|")}]]`;
    case "put_life_area":
      add("id", action.id);
      add("title", action.title);
      add("description", action.description);
      return `[[ACTION:put_life_area|${parts.join("|")}]]`;
    case "list_todos":
      add("lifeAreaId", action.lifeAreaId);
      add("lifeAreaTitle", action.lifeAreaTitle);
      add("openOnly", action.openOnly);
      return parts.length
        ? `[[ACTION:list_todos|${parts.join("|")}]]`
        : `[[ACTION:list_todos]]`;
    case "put_todo":
      add("todoId", action.todoId);
      add("title", action.title);
      add("checked", action.checked);
      return `[[ACTION:put_todo|${parts.join("|")}]]`;
    case "delete_todo":
      return `[[ACTION:delete_todo|todoId=${enc(action.todoId)}]]`;
    case "get_ideate_store":
      return `[[ACTION:get_ideate_store]]`;
    case "put_ideate_store":
      return `[[ACTION:put_ideate_store]]`;
    case "list_vision_board":
      return `[[ACTION:list_vision_board]]`;
    case "create_meditation":
      add("summary", action.summary);
      add("style", action.style);
      return parts.length
        ? `[[ACTION:create_meditation|${parts.join("|")}]]`
        : `[[ACTION:create_meditation]]`;
    case "list_library":
      add("favouritesOnly", action.favouritesOnly);
      add("limit", action.limit);
      return parts.length
        ? `[[ACTION:list_library|${parts.join("|")}]]`
        : `[[ACTION:list_library]]`;
    case "get_meditation":
      return `[[ACTION:get_meditation|sk=${enc(action.sk)}]]`;
    case "put_meditation_favourite":
      return `[[ACTION:put_meditation_favourite|sk=${enc(action.sk)}|favourite=${action.favourite}]]`;
    case "put_meditation_archived":
      return `[[ACTION:put_meditation_archived|sk=${enc(action.sk)}|archived=${action.archived}]]`;
    case "put_meditation_public":
      return `[[ACTION:put_meditation_public|sk=${enc(action.sk)}|isPublic=${action.isPublic}]]`;
    case "play_meditation":
      return `[[ACTION:play_meditation|sk=${enc(action.sk)}]]`;
    case "list_programs":
      return `[[ACTION:list_programs]]`;
    case "navigate_create_by_type":
      add("style", action.style);
      return parts.length
        ? `[[ACTION:navigate_create_by_type|${parts.join("|")}]]`
        : `[[ACTION:navigate_create_by_type]]`;
    case "navigate_create_from_journal":
      add("entryId", action.entryId);
      return parts.length
        ? `[[ACTION:navigate_create_from_journal|${parts.join("|")}]]`
        : `[[ACTION:navigate_create_from_journal]]`;
    case "navigate_create_from_idea":
      add("lifeAreaId", action.lifeAreaId);
      return parts.length
        ? `[[ACTION:navigate_create_from_idea|${parts.join("|")}]]`
        : `[[ACTION:navigate_create_from_idea]]`;
    case "list_sounds":
      return `[[ACTION:list_sounds]]`;
    case "list_sound_mixes":
      return `[[ACTION:list_sound_mixes]]`;
    case "put_sound_mix":
      add("id", action.id);
      add("name", action.name);
      add("natureKey", action.natureKey);
      add("musicKey", action.musicKey);
      add("drumsKey", action.drumsKey);
      add("noiseKey", action.noiseKey);
      return `[[ACTION:put_sound_mix|${parts.join("|")}]]`;
    case "get_focus_session":
      return `[[ACTION:get_focus_session]]`;
    case "start_focus":
      add("minutes", action.minutes);
      add("todoId", action.todoId);
      return parts.length
        ? `[[ACTION:start_focus|${parts.join("|")}]]`
        : `[[ACTION:start_focus]]`;
    case "pause_focus":
      return `[[ACTION:pause_focus]]`;
    case "stop_focus":
      return `[[ACTION:stop_focus]]`;
    case "navigate":
      return `[[ACTION:navigate|href=${enc(action.href)}]]`;
    case "get_daily_status":
      return `[[ACTION:get_daily_status]]`;
    case "put_daily_check":
      return `[[ACTION:put_daily_check|key=${enc(action.key)}|done=${action.done}]]`;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function assistantChatBubbles(text: string): string[] {
  return text
    .split(/\n{2,}/g)
    .map((s) => s.replace(/[ \t]*\n+[ \t]*/g, " ").trim())
    .filter(Boolean);
}

export {
  buildAssistantChatSystemPrompt,
  ASSISTANT_SESSION_OPEN,
} from "@/lib/assistant-chat-system-prompt";
import { buildAssistantChatSystemPrompt } from "@/lib/assistant-chat-system-prompt";

export const ASSISTANT_CHAT_SYSTEM_PROMPT = buildAssistantChatSystemPrompt();
