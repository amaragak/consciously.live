import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  CLAUDE_HAIKU_45_MODEL_ID,
  parseAnthropicMessageUsage,
} from "./_shared/anthropic-pricing";
import { optionalUserJson } from "./_shared/consciously-auth-http";
import {
  formatRangeWords,
  insightRangeKey,
  insightSortKey,
  isDateOnly,
  JOURNAL_TEXT_BUDGET_CHARS,
  migrateStoredPeriod,
  periodPhraseForPrompt,
  resolveInsightPeriod,
  trimTextsToBudget,
  weekBoundsForDate,
  type InsightPeriod,
  type InsightPeriodType,
} from "./_shared/insight-period";
import {
  formatInsightsDailyLimitMessage,
  parseWellbeingLevel,
  resolveInsightsDailyLimit,
  WELLBEING_LETTER_GUIDANCE,
  type WellbeingLevel,
} from "./_shared/insight-wellbeing";
import {
  coerceLetterMarkdown,
  extractLetterTitleFromModelOutput,
} from "./_shared/letter-markdown";
import {
  sourcesFromLegacy,
  verifyInsightSources,
  type InsightSourceRef,
  type LetterBodyPart,
} from "./_shared/insight-sources";
import {
  LEGACY_MEDITATION_PARTITION_PK,
  meditationGlobalUserPk,
  meditationUserPk,
} from "./_shared/meditation-user-pk";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const secrets = new SecretsManagerClient({});
let cachedClaudeKey: string | undefined;

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  contentHtml: string;
  mood?: string;
};

type WeeklyEmotionScore = {
  name: string;
  score: number;
  /** @deprecated Prefer sources with verified quotes. */
  examples?: string[];
  /** @deprecated Prefer sources. */
  entryIds?: string[];
  sources?: InsightSourceRef[];
};

type WeeklyArcDay = {
  date: string;
  value: number;
};

type WeeklyArc = {
  start: string;
  end: string;
  summary: string;
  days: WeeklyArcDay[];
};

type WeeklyCitedItem = {
  text: string;
  /** @deprecated Prefer sources. */
  entryIds?: string[];
  sources?: InsightSourceRef[];
};

type WeeklyRecurringThought = {
  text: string;
  count: number;
  /** Prior weeks where a matching thought appeared (YYYY-MM-DD week starts). */
  alsoOn?: string[];
  /** @deprecated Prefer sources. */
  entryIds?: string[];
  sources?: InsightSourceRef[];
};

type WeeklyActivityByEntry = {
  entryId: string;
  items: string[];
};

/** Allowed journal mood ids — must match the SPA journal mood picker. */
const JOURNAL_MOOD_IDS = ["calm", "good", "mixed", "low", "heavy"] as const;
type JournalMoodId = (typeof JOURNAL_MOOD_IDS)[number];

function isJournalMoodId(x: unknown): x is JournalMoodId {
  return (
    typeof x === "string" &&
    (JOURNAL_MOOD_IDS as readonly string[]).includes(x)
  );
}

/**
 * LLM-inferred mood for an entry that had no user mood tag.
 * Stored only on the insights reflection — never written back to the journal.
 */
type WeeklyEntryMood = {
  entryId: string;
  mood: JournalMoodId;
};

type LetterFeedback = {
  rating: "up" | "down";
  note?: string;
  at: string;
};

type LetterDocument = {
  greeting: string;
  preamble: LetterBodyPart[];
  sections: Array<{ heading: string; parts: LetterBodyPart[] }>;
  closing: LetterBodyPart[];
};

/** Which AI-generated surfaces were requested for this week. */
type WeeklyGeneratedParts = {
  letter: boolean;
  felt: boolean;
  moved: boolean;
  wins: boolean;
  thought: boolean;
};

type WeeklyPatternsSelection = {
  felt: boolean;
  moved: boolean;
  wins: boolean;
  thought: boolean;
};

type WeeklyGenerateSelection = {
  letter: boolean;
  patterns: WeeklyPatternsSelection;
};

type WeeklyReflection = {
  ownerId: string;
  /** v6: the period this insight covers. */
  periodType: InsightPeriodType;
  startDate: string;
  endDate: string;
  rangeKey: string;
  /**
   * Legacy fields, kept so older clients keep working: for `week` periods
   * `weekKey` is still the Monday; otherwise it is the period's start date.
   */
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  letterMarkdown: string;
  /** Structured letter with sourced spans (v8). */
  letterDocument?: LetterDocument;
  /**
   * LLM-written Insights page headline for this period (not a letter excerpt).
   */
  title?: string;
  /** First sentence preview for the letters list; derived from letterMarkdown. */
  preview?: string;
  /** 3–5 emotions scored 0–10 from the week's writing; omit if unavailable. */
  emotions?: WeeklyEmotionScore[];
  /** One-line plain-English mood summary for the week; omit if unavailable. */
  moodSummary?: string;
  arc?: WeeklyArc;
  wins?: WeeklyCitedItem[];
  promises?: WeeklyCitedItem[];
  recurringThought?: WeeklyRecurringThought;
  activities?: WeeklyActivityByEntry[];
  /**
   * Moods inferred for entries that had no user mood tag.
   * Insights-only — never written onto journal entries.
   */
  entryMoods?: WeeklyEntryMood[];
  generatedParts?: WeeklyGeneratedParts;
  wellbeing?: { level: WellbeingLevel };
  letterFeedback?: LetterFeedback;
  /** Speechify letter narration (Beatrice) — Insights listen button. */
  letterAudioUrl?: string;
  letterAudioStatus?: "none" | "generating" | "ready" | "failed";
  letterAudioError?: string;
  letterAudioProgress?: string;
  letterAudioGeneratedAt?: string;
  letterAudioVoiceId?: string;
  meta: {
    generatedAt: string;
    model: string;
    journalEntryCount: number;
    meditationChatCount: number;
    usage?: { input_tokens: number; output_tokens: number } | null;
  };
};

function parseGeneratedParts(raw: unknown): WeeklyGeneratedParts | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    letter: o.letter === true,
    felt: o.felt === true,
    moved: o.moved === true,
    wins: o.wins === true,
    thought: o.thought === true,
  };
}

function parseGenerateSelection(raw: Record<string, unknown>): WeeklyGenerateSelection {
  const patternsRaw =
    raw.patterns && typeof raw.patterns === "object"
      ? (raw.patterns as Record<string, unknown>)
      : {};
  const patterns: WeeklyPatternsSelection = {
    felt: patternsRaw.felt === true,
    moved: patternsRaw.moved === true,
    wins: patternsRaw.wins === true,
    thought: patternsRaw.thought === true,
  };
  // Legacy regenerate / missing selection → generate everything.
  const hasExplicit =
    typeof raw.letter === "boolean" ||
    Object.prototype.hasOwnProperty.call(raw, "patterns");
  if (!hasExplicit || raw.regenerate === true) {
    return {
      letter: true,
      patterns: { felt: true, moved: true, wins: true, thought: true },
    };
  }
  return {
    letter: raw.letter === true,
    patterns,
  };
}

function anyPatternSelected(p: WeeklyPatternsSelection): boolean {
  return p.felt || p.moved || p.wins || p.thought;
}

function mergeGeneratedParts(
  prev: WeeklyGeneratedParts | undefined,
  selection: WeeklyGenerateSelection,
): WeeklyGeneratedParts {
  const base = prev ?? {
    letter: false,
    felt: false,
    moved: false,
    wins: false,
    thought: false,
  };
  return {
    letter: selection.letter ? true : base.letter,
    felt: selection.patterns.felt ? true : base.felt,
    moved: selection.patterns.moved ? true : base.moved,
    wins: selection.patterns.wins ? true : base.wins,
    thought: selection.patterns.thought ? true : base.thought,
  };
}

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(payload),
  };
}

function options(): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    },
    body: "",
  };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|br)\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function inRange(iso: string, start: string, end: string): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(start).getTime() && t <= new Date(end).getTime();
}

/** `weekKey` stays the Monday for week periods; the start date otherwise. */
function weekKeyForPeriod(period: {
  periodType: InsightPeriodType;
  startDate: string;
}): string {
  return period.periodType === "week"
    ? weekBoundsForDate(period.startDate).startDate
    : period.startDate;
}

async function getClaudeApiKey(): Promise<string> {
  if (cachedClaudeKey) return cachedClaudeKey;
  const arn = process.env.CLAUDE_SECRET_ARN;
  if (!arn) throw new Error("CLAUDE_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Claude API key secret is empty");
  cachedClaudeKey = s;
  return cachedClaudeKey;
}

async function queryAllJournalItems(
  tableName: string,
  ownerId: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :p",
        ExpressionAttributeValues: { ":p": ownerId },
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const it of r.Items ?? []) items.push(it as Record<string, unknown>);
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

async function scanAllJournalItems(tableName: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const it of r.Items ?? []) items.push(it as Record<string, unknown>);
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

function journalItemsToWeekEntries(
  items: Record<string, unknown>[],
  weekStart: string,
  weekEnd: string,
): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const item of items) {
    const sk = item.sk;
    if (typeof sk !== "string" || !sk.startsWith("ENTRY#")) continue;
    const id = typeof item.id === "string" ? item.id : sk.slice("ENTRY#".length);
    const createdAt = safeIso(item.createdAt);
    const updatedAt = safeIso(item.updatedAt);
    const title = typeof item.title === "string" ? item.title : "";
    const contentHtml = typeof item.contentHtml === "string" ? item.contentHtml : "";
    if (!createdAt || !updatedAt) continue;
    if (!inRange(updatedAt, weekStart, weekEnd) && !inRange(createdAt, weekStart, weekEnd)) {
      continue;
    }
    const mood =
      typeof item.mood === "string" && item.mood.trim()
        ? item.mood.trim().slice(0, 32)
        : undefined;
    out.push({ id, createdAt, updatedAt, title, contentHtml, ...(mood ? { mood } : {}) });
  }
  out.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  return out;
}

async function queryAllMeditationItems(
  tableName: string,
  pk: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lek: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ScanIndexForward: false,
        ExclusiveStartKey: lek,
      }),
    );
    items.push(...((out.Items ?? []) as Record<string, unknown>[]));
    lek = out.LastEvaluatedKey;
  } while (lek);
  return items;
}

async function scanAllMeditationItems(tableName: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lek: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lek,
      }),
    );
    items.push(...((out.Items ?? []) as Record<string, unknown>[]));
    lek = out.LastEvaluatedKey;
  } while (lek);
  return items;
}

function parseDraftState(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function formatDraftChat(state: Record<string, unknown>): string {
  const lines: string[] = [];
  const messages = state.messages;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (!m || typeof m !== "object") continue;
      const row = m as Record<string, unknown>;
      if (row.variant === "script") continue;
      const role = row.role === "assistant" ? "Guide" : row.role === "user" ? "You" : null;
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!role || !text) continue;
      lines.push(`${role}: ${text}`);
    }
  }
  const claudeThread = state.claudeThread;
  if (Array.isArray(claudeThread) && lines.length === 0) {
    for (const m of claudeThread) {
      if (!m || typeof m !== "object") continue;
      const row = m as Record<string, unknown>;
      const role =
        row.role === "assistant" ? "Guide" : row.role === "user" ? "You" : null;
      const text = typeof row.content === "string" ? row.content.trim() : "";
      if (!role || !text) continue;
      lines.push(`${role}: ${text}`);
    }
  }
  return lines.join("\n");
}

type MeditationChatSource = {
  label: string;
  when: string;
  text: string;
};

function meditationRowsToWeekChats(
  rows: Record<string, unknown>[],
  weekStart: string,
  weekEnd: string,
): MeditationChatSource[] {
  const out: MeditationChatSource[] = [];
  for (const row of rows) {
    const createdAt = safeIso(row.createdAt);
    if (!createdAt || !inRange(createdAt, weekStart, weekEnd)) continue;

    const title =
      typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Meditation";
    const style =
      typeof row.meditationStyle === "string" && row.meditationStyle.trim()
        ? row.meditationStyle.trim()
        : null;
    const draftState = parseDraftState(row.draftState);
    const chat = draftState ? formatDraftChat(draftState) : "";
    if (chat.trim()) {
      out.push({
        label: `${title}${style ? ` (${style})` : ""}${row.isDraft === true ? " · draft" : ""}`,
        when: createdAt,
        text: chat.trim(),
      });
      continue;
    }
    const transcript =
      typeof row.transcript === "string" && row.transcript.trim()
        ? row.transcript.trim()
        : "";
    if (transcript) {
      out.push({ label: title, when: createdAt, text: transcript });
      continue;
    }
    const scriptText =
      typeof row.scriptText === "string" && row.scriptText.trim()
        ? row.scriptText.trim()
        : "";
    if (scriptText) {
      out.push({
        label: `${title} · generated script`,
        when: createdAt,
        text: scriptText.slice(0, 2500),
      });
    }
  }
  out.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  return out;
}

async function queryWeekJobTranscripts(
  tableName: string,
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<MeditationChatSource[]> {
  const out: MeditationChatSource[] = [];
  let lek: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression:
          "userId = :uid AND createdAt BETWEEN :start AND :end",
        ExpressionAttributeValues: {
          ":uid": userId,
          ":start": weekStart,
          ":end": weekEnd,
        },
        ExclusiveStartKey: lek,
      }),
    );
    for (const item of r.Items ?? []) {
      const createdAt = safeIso(item.createdAt);
      const transcript =
        typeof item.transcript === "string" ? item.transcript.trim() : "";
      if (!createdAt || !transcript) continue;
      const style =
        typeof item.meditationStyle === "string" && item.meditationStyle.trim()
          ? item.meditationStyle.trim()
          : null;
      out.push({
        label: `Create session${style ? ` (${style})` : ""}`,
        when: createdAt,
        text: transcript,
      });
    }
    lek = r.LastEvaluatedKey;
  } while (lek);
  out.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  return out;
}

async function scanWeekJobTranscripts(
  tableName: string,
  weekStart: string,
  weekEnd: string,
): Promise<MeditationChatSource[]> {
  const out: MeditationChatSource[] = [];
  let lek: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "createdAt BETWEEN :start AND :end",
        ExpressionAttributeValues: {
          ":start": weekStart,
          ":end": weekEnd,
        },
        ExclusiveStartKey: lek,
      }),
    );
    for (const item of r.Items ?? []) {
      const createdAt = safeIso(item.createdAt);
      const transcript =
        typeof item.transcript === "string" ? item.transcript.trim() : "";
      if (!createdAt || !transcript) continue;
      out.push({
        label: "Create session",
        when: createdAt,
        text: transcript,
      });
    }
    lek = r.LastEvaluatedKey;
  } while (lek);
  return out;
}

function dedupeChats(chats: MeditationChatSource[]): MeditationChatSource[] {
  const seen = new Set<string>();
  const out: MeditationChatSource[] = [];
  for (const c of chats) {
    const key = `${c.when}::${c.text.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Journal entries for the prompt, trimmed to the token budget. Long periods
 * shorten every entry proportionally instead of dropping any of them.
 */
function formatJournalForPrompt(entries: JournalEntry[]): string {
  if (!entries.length) return "(No journal entries in this period.)";
  const bodies = trimTextsToBudget(
    entries.map((e) => stripHtmlToText(e.contentHtml) || "(empty)"),
    JOURNAL_TEXT_BUDGET_CHARS,
  );
  return entries
    .map((e, i) => {
      const title = e.title.trim() || "Untitled";
      // Mood chips are listed separately — do not put them here so emotion
      // scores are read from the writing, not from the tags.
      return [
        `Entry id: ${e.id}`,
        `Entry · ${title}`,
        `Updated: ${e.updatedAt}`,
        bodies[i] ?? "(empty)",
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

function uniqueWritingDays(entries: JournalEntry[]): number {
  const days = new Set<string>();
  for (const e of entries) {
    const iso = safeIso(e.updatedAt) || safeIso(e.createdAt);
    if (!iso) continue;
    days.add(iso.slice(0, 10));
  }
  return days.size;
}

function normalizeThoughtKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoodTagsForPrompt(entries: JournalEntry[]): string {
  const tagged: string[] = [];
  const untagged: string[] = [];
  for (const e of entries) {
    const title = e.title.trim() || "Untitled";
    const when = (e.updatedAt || e.createdAt).slice(0, 10);
    const mood = e.mood?.trim();
    if (mood && isJournalMoodId(mood)) {
      tagged.push(`- ${when} · ${title} · id=${e.id}: ${mood}`);
    } else {
      untagged.push(`- ${when} · ${title} · id=${e.id}`);
    }
  }
  const parts: string[] = [];
  if (tagged.length) {
    parts.push("User-tagged moods (do NOT re-emit these in entry_moods):", ...tagged);
  } else {
    parts.push("User-tagged moods: (none)");
  }
  if (untagged.length) {
    parts.push(
      "Untagged entries — you MUST assign each exactly one mood in entry_moods:",
      ...untagged,
    );
  } else {
    parts.push("Untagged entries: (none — set entry_moods to [])");
  }
  return parts.join("\n");
}

function parseEntryMoods(
  raw: unknown,
  knownEntryIds: Set<string>,
  userMoodEntryIds: Set<string>,
): WeeklyEntryMood[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WeeklyEntryMood[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const entryIdRaw =
      (row as { entry_id?: unknown }).entry_id ??
      (row as { entryId?: unknown }).entryId;
    const entryId =
      typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
    if (!entryId || seen.has(entryId)) continue;
    if (knownEntryIds.size > 0 && !knownEntryIds.has(entryId)) continue;
    // Never overwrite or store a shadow for a user-tagged entry.
    if (userMoodEntryIds.has(entryId)) continue;
    const moodRaw =
      (row as { mood?: unknown }).mood ??
      (row as { mood_id?: unknown }).mood_id;
    if (!isJournalMoodId(moodRaw)) continue;
    seen.add(entryId);
    out.push({ entryId, mood: moodRaw });
    if (out.length >= 80) break;
  }
  return out.length > 0 ? out : undefined;
}

/** First readable sentence for sidebar preview (skips salutation). */
function letterPreviewFromMarkdown(letterMarkdown: string): string {
  const plain = letterMarkdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const withoutGreeting = plain
    .replace(/^Dear\s+(?:\[\[NAME\]\]|[^,]+),\s*/i, "")
    .trim();
  const source = withoutGreeting || plain;
  const sentence = source.match(/^(.{12,140}?[.!?])(?:\s|$)/);
  const clipped = (sentence?.[1] ?? source).trim().slice(0, 140);
  return clipped;
}

function parseEmotionExamples(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().replace(/\s+/g, " ");
    if (t.length < 8 || t.length > 220) continue;
    out.push(t);
    if (out.length >= 3) break;
  }
  return out.length > 0 ? out : undefined;
}

function filterEntryIds(
  raw: unknown,
  knownEntryIds: Set<string>,
  max = 3,
): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string") continue;
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    if (knownEntryIds.size > 0 && !knownEntryIds.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : undefined;
}

function entryTextById(entries: JournalEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    map.set(e.id, stripHtmlToText(e.contentHtml) || e.title || "");
  }
  return map;
}

function attachSources(
  entryIds: string[] | undefined,
  examples: string[] | undefined,
  explicitSources: unknown,
  entriesById: Map<string, string>,
  max = 3,
): InsightSourceRef[] | undefined {
  const fromExplicit = verifyInsightSources(explicitSources, entriesById, max);
  if (fromExplicit) return fromExplicit;
  return sourcesFromLegacy({
    entryIds,
    examples,
    entriesById,
    max,
  });
}

function parseEmotions(
  raw: unknown,
  knownEntryIds: Set<string> = new Set(),
  entriesById: Map<string, string> = new Map(),
): WeeklyEmotionScore[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WeeklyEmotionScore[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name =
      typeof (row as { name?: unknown }).name === "string"
        ? (row as { name: string }).name.trim()
        : "";
    const scoreRaw = (row as { score?: unknown }).score;
    const score =
      typeof scoreRaw === "number"
        ? scoreRaw
        : typeof scoreRaw === "string"
          ? Number(scoreRaw)
          : NaN;
    if (!name || name.length > 40) continue;
    if (!Number.isFinite(score)) continue;
    const clamped = Math.max(0, Math.min(10, Math.round(score)));
    const examples = parseEmotionExamples(
      (row as { examples?: unknown }).examples,
    );
    const entryIds = filterEntryIds(
      (row as { entry_ids?: unknown }).entry_ids ??
        (row as { entryIds?: unknown }).entryIds,
      knownEntryIds,
      3,
    );
    const sources = attachSources(
      entryIds,
      examples,
      (row as { sources?: unknown }).sources,
      entriesById.size > 0 ? entriesById : new Map([...knownEntryIds].map((id) => [id, ""])),
      3,
    );
    // Prefer sources; keep legacy fields for older clients when no verified quotes.
    out.push({
      name,
      score: clamped,
      ...(sources ? { sources } : {}),
      ...(!sources && examples ? { examples } : {}),
      ...(!sources && entryIds ? { entryIds } : {}),
      ...(sources
        ? { entryIds: sources.map((s) => s.entryId) }
        : {}),
    });
  }
  if (out.length < 1) return undefined;
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, 5);
}

function parseMoodSummary(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length < 8 || t.length > 220) return undefined;
  return t;
}

function parseArc(raw: unknown): WeeklyArc | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const start =
    typeof o.start === "string" ? o.start.trim().replace(/\s+/g, " ") : "";
  const end =
    typeof o.end === "string" ? o.end.trim().replace(/\s+/g, " ") : "";
  const summary =
    typeof o.summary === "string" ? o.summary.trim().replace(/\s+/g, " ") : "";
  if (!start || start.length > 24 || !end || end.length > 24) return undefined;
  if (!summary || summary.length < 12 || summary.length > 280) return undefined;
  if (!Array.isArray(o.days)) return undefined;
  const days: WeeklyArcDay[] = [];
  for (const row of o.days) {
    if (!row || typeof row !== "object") continue;
    const dateRaw = (row as { date?: unknown }).date;
    const date =
      typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim())
        ? dateRaw.trim()
        : "";
    const valueRaw = (row as { value?: unknown }).value;
    const value =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
          ? Number(valueRaw)
          : NaN;
    if (!date || !Number.isFinite(value)) continue;
    days.push({
      date,
      value: Math.max(-5, Math.min(5, Math.round(value))),
    });
  }
  if (days.length < 3) return undefined;
  days.sort((a, b) => a.date.localeCompare(b.date));
  // One point per day with an entry — up to a 90-day custom period.
  return { start, end, summary, days: days.slice(0, 90) };
}

function parseStringList(
  raw: unknown,
  opts: { minLen: number; maxLen: number; maxItems: number },
): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().replace(/\s+/g, " ");
    if (t.length < opts.minLen || t.length > opts.maxLen) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= opts.maxItems) break;
  }
  return out.length > 0 ? out : undefined;
}

function parseCitedItems(
  raw: unknown,
  knownEntryIds: Set<string>,
  opts: { minLen: number; maxLen: number; maxItems: number },
  entriesById: Map<string, string> = new Map(),
): WeeklyCitedItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WeeklyCitedItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim().replace(/\s+/g, " ");
      if (t.length < opts.minLen || t.length > opts.maxLen) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: t });
    } else if (item && typeof item === "object") {
      const textRaw =
        (item as { text?: unknown }).text ??
        (item as { item?: unknown }).item;
      const t =
        typeof textRaw === "string"
          ? textRaw.trim().replace(/\s+/g, " ")
          : "";
      if (t.length < opts.minLen || t.length > opts.maxLen) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const entryIds = filterEntryIds(
        (item as { entry_ids?: unknown }).entry_ids ??
          (item as { entryIds?: unknown }).entryIds,
        knownEntryIds,
        3,
      );
      const sources = attachSources(
        entryIds,
        undefined,
        (item as { sources?: unknown }).sources,
        entriesById.size > 0
          ? entriesById
          : new Map([...knownEntryIds].map((id) => [id, ""])),
        3,
      );
      out.push({
        text: t,
        ...(sources ? { sources, entryIds: sources.map((s) => s.entryId) } : {}),
        ...(!sources && entryIds ? { entryIds } : {}),
      });
    }
    if (out.length >= opts.maxItems) break;
  }
  return out.length > 0 ? out : undefined;
}

function parseRecurringThought(
  raw: unknown,
  knownEntryIds: Set<string> = new Set(),
  entriesById: Map<string, string> = new Map(),
): WeeklyRecurringThought | undefined {
  if (raw === null) return undefined;
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const text =
    typeof o.text === "string" ? o.text.trim().replace(/\s+/g, " ") : "";
  const countRaw = o.count;
  const count =
    typeof countRaw === "number"
      ? countRaw
      : typeof countRaw === "string"
        ? Number(countRaw)
        : NaN;
  if (!text || text.length < 6 || text.length > 160) return undefined;
  if (!Number.isFinite(count) || count < 2) return undefined;
  const entryIds = filterEntryIds(
    o.entry_ids ?? o.entryIds,
    knownEntryIds,
    6,
  );
  const sources = attachSources(
    entryIds,
    undefined,
    o.sources,
    entriesById.size > 0
      ? entriesById
      : new Map([...knownEntryIds].map((id) => [id, ""])),
    6,
  );
  return {
    text,
    count: Math.min(20, Math.round(count)),
    ...(sources ? { sources, entryIds: sources.map((s) => s.entryId) } : {}),
    ...(!sources && entryIds ? { entryIds } : {}),
  };
}

function parseActivities(
  raw: unknown,
  knownEntryIds: Set<string>,
): WeeklyActivityByEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WeeklyActivityByEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const entryIdRaw =
      (row as { entry_id?: unknown }).entry_id ??
      (row as { entryId?: unknown }).entryId;
    const entryId =
      typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
    if (!entryId || (knownEntryIds.size > 0 && !knownEntryIds.has(entryId))) {
      continue;
    }
    const itemsRaw = (row as { items?: unknown }).items;
    if (!Array.isArray(itemsRaw)) continue;
    const items: string[] = [];
    const seen = new Set<string>();
    for (const it of itemsRaw) {
      if (typeof it !== "string") continue;
      const t = it.trim().toLowerCase().replace(/\s+/g, " ");
      if (t.length < 2 || t.length > 40) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      items.push(t);
      if (items.length >= 4) break;
    }
    if (!items.length) continue;
    out.push({ entryId, items });
    if (out.length >= 40) break;
  }
  return out.length > 0 ? out : undefined;
}

function parsePatternsBlob(
  raw: unknown,
  knownEntryIds: Set<string>,
  entriesById: Map<string, string> = new Map(),
  userMoodEntryIds: Set<string> = new Set(),
): {
  arc?: WeeklyArc;
  wins?: WeeklyCitedItem[];
  promises?: WeeklyCitedItem[];
  recurringThought?: WeeklyRecurringThought;
  activities?: WeeklyActivityByEntry[];
  entryMoods?: WeeklyEntryMood[];
} {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const arc = parseArc(o.arc);
  const wins = parseCitedItems(
    o.wins,
    knownEntryIds,
    {
      minLen: 6,
      maxLen: 120,
      maxItems: 4,
    },
    entriesById,
  );
  const promises = parseCitedItems(
    o.promises,
    knownEntryIds,
    {
      minLen: 6,
      maxLen: 120,
      maxItems: 3,
    },
    entriesById,
  );
  const recurringThought =
    o.recurring_thought === null || o.recurringThought === null
      ? undefined
      : parseRecurringThought(
          o.recurring_thought ?? o.recurringThought,
          knownEntryIds,
          entriesById,
        );
  const activities = parseActivities(o.activities, knownEntryIds);
  const entryMoods = parseEntryMoods(
    o.entry_moods ?? o.entryMoods,
    knownEntryIds,
    userMoodEntryIds,
  );
  return {
    ...(arc ? { arc } : {}),
    ...(wins ? { wins } : {}),
    ...(promises ? { promises } : {}),
    ...(recurringThought ? { recurringThought } : {}),
    ...(activities ? { activities } : {}),
    ...(entryMoods ? { entryMoods } : {}),
  };
}

function formatChatsForPrompt(chats: MeditationChatSource[]): string {
  if (!chats.length) return "(No meditation create chats in this period.)";
  return chats
    .map((c) => [`${c.label} · ${c.when}`, c.text].join("\n"))
    .join("\n\n---\n\n");
}

/** Exported for the deploy-time Claude preprompts catalog (admin read-only). */
export function buildSystemPrompt(
  selection: WeeklyGenerateSelection,
  periodPhrase: string,
): string {
  const wantLetter = selection.letter;
  const wantMoved = selection.patterns.moved;
  const wantWins = selection.patterns.wins;
  const wantThought = selection.patterns.thought;
  const patternKeys: string[] = ["activities", "entry_moods"];
  if (wantMoved) patternKeys.push("arc");
  if (wantWins) patternKeys.push("wins", "promises");
  if (wantThought) patternKeys.push("recurring_thought");

  const parts: string[] = [
    "You help with journal insights for a meditation and journaling app.",
    `PERIOD: the writing covers ${periodPhrase}. Refer to it as "${periodPhrase}" — never call a month "this week" or a week "this month".`,
    "Do not diagnose. Do not give medical advice. Do not moralize. Do not invent facts.",
    "TIME & DURATION (critical): If they mention how long something has been going on, treat that as ongoing context — NOT as a completed chapter — unless they explicitly say it ended.",
    "WELLBEING (always required): After reading the journal and chats, set wellbeing.level to exactly one of: none | struggling | at_risk.",
    "struggling = sustained distress, hopelessness, exhaustion, panic, or grief.",
    "at_risk = any mention of suicidal thoughts, wanting not to be here, self-harm, or being unsafe — past or present.",
    "Rule out figures of speech ('killing it', 'die of embarrassment'), song lyrics, and fiction clearly marked as such. When genuinely unclear, choose the safer (higher) level.",
    "EMOTIONS (always required unless wellbeing is at_risk — still output the array, the app may hide it): From the journal entry text and meditation chats — not from mood tags — name exactly 3–5 short plain-English emotions (e.g. Hope, Self-doubt). Score each 0–10; sort high to low.",
      "For each emotion include sources: 1–3 objects { entryId, quote } — quote is a short verbatim passage (≤25 words) from that entry that supports the score. Prefer sources over bare examples/entry_ids.",
    "Optionally one plain-English moodSummary line (or NONE).",
    "PATTERNS JSON always includes activities: up to one object per journal entry { entry_id, items: [\"morning walk\", ...] } with 0–4 short lowercase labels. Omit entries with none. Never include activities the user marked as incorrect or hidden (see USER CORRECTIONS).",
    "PATTERNS JSON always includes entry_moods: [{ entry_id, mood }] for EVERY journal entry that has NO user mood tag. mood must be exactly one of: calm | good | mixed | low | heavy — inferred from that entry's writing alone. Do NOT include entries that already have a user mood tag. If every entry is tagged, use [].",
  ];
  if (wantMoved) {
    parts.push(
      "Also include arc: { start, end, summary, days:[{date:YYYY-MM-DD,value}] }. start/end are one-word mood labels. days only for days with entries; value -5..+5. If fewer than 3 entry days, arc: null.",
    );
  } else {
    parts.push("Set arc to null.");
  }
  if (wantWins) {
    parts.push(
      `Also include wins: 1–4 objects { text, sources:[{entryId,quote}] } — concrete actions they DID in ${periodPhrase}, second person without the word 'you'. Actions only. sources: 1–3 supporting entries with short verbatim quotes. Do NOT include a 'Wrote on N days' line.`,
      "Also include promises: 0–3 objects { text, sources:[{entryId,quote}] } for future intentions. Empty array if none.",
    );
  } else {
    parts.push("Set wins to [] and promises to [].");
  }
  if (wantThought) {
    parts.push(
      `Also include recurring_thought: { text, count, sources:[{entryId,quote}] } for a belief/phrase that repeats within ${periodPhrase} with count >= 2; sources for each supporting entry with a short verbatim quote; otherwise null.`,
    );
  } else {
    parts.push("Set recurring_thought to null.");
  }
  if (wantLetter) {
    parts.push(
      "LETTER: Write directly TO the reader in second person ('you'), warm and human — like a note from someone who read their week carefully.",
      "LETTER LENGTH (when wellbeing is none): about ~250 words total when there is enough journal/chat material; shorter is fine when the period is sparse. No hard maximum.",
      "LETTER OUTPUT (JSON only after <<<LETTER>>> — not freeform prose, not markdown):",
      '{"title":"A quiet kind of knowing","greeting":"Dear [[NAME]],","preamble":"…","sections":[{"heading":"What stood out","bodyParts":[{"text":"…"},{"text":"key phrase","sources":[{"entryId":"…","quote":"…"}]},{"text":"…"}]}],"closing":"…"}',
      "Rules: title is required — a complete Insights headline of about 4–10 words naming the emotional arc of the period. It must be a custom phrase, NOT a truncated sentence from the letter, and must NOT end with a dash, hyphen, or ellipsis.",
      "Rules: greeting must be exactly Dear [[NAME]], (literal [[NAME]] — never a real name).",
      "CRITICAL SHAPE: preamble and closing are mandatory non-empty strings. Jumping from the greeting straight into a section heading is WRONG. Ending on the last section body with no closing is WRONG.",
      "preamble: required — 2–4 warm opening sentences BEFORE any section header; set the tone and acknowledge them as a person.",
      "sections: 2 or 3 objects. Each heading is a short label (3–5 words). Prefer bodyParts (array of { text, sources? }) over a single body string — at most one sourced span per sentence; sources use { entryId, quote } with a short verbatim quote. If you use body instead of bodyParts, still attach section-level sources when you paraphrase a specific entry.",
      "closing: required — 2–3 warm closing sentences AFTER the last section; optional final sign-off line (e.g. With care,).",
      "In every section, mark 1–2 concrete phrases for bold with **double asterisks** inside text parts (required). No # headings inside body/preamble/closing. No code fence.",
      `When wellbeing is struggling, follow this tone (still use greeting/preamble/sections/closing JSON; length can stay nearer ~150–200 words): ${WELLBEING_LETTER_GUIDANCE.struggling}`,
      `When wellbeing is at_risk, follow this tone (same JSON shape; ~80–140 words total): ${WELLBEING_LETTER_GUIDANCE.at_risk}`,
      "If RECENT PROMISES are provided, mention one or two naturally in a section body — not as a checklist.",
      "If PRIOR RECURRING THOUGHTS are provided, reuse the same wording when the same belief shows up again.",
    );
  } else {
    parts.push("Do NOT write a letter. After <<<LETTER>>> output only the word NONE.");
  }
  parts.push(
    "OUTPUT FORMAT (exact — no JSON wrapper around the whole reply, no markdown fences around the whole reply):",
    "<<<WELLBEING>>>",
    '{"level":"none|struggling|at_risk"}',
    "<<<EMOTIONS>>>",
    "JSON array of emotions",
    "<<<MOOD_SUMMARY>>>",
    "one summary sentence, or the word NONE",
    "<<<PATTERNS>>>",
    `one JSON object with keys: ${patternKeys.join(", ")} (and null/[] for unused keys as instructed)`,
    "<<<LETTER>>>",
    wantLetter
      ? 'JSON only: {"title":"…","greeting":"Dear [[NAME]],","preamble":"…","sections":[{"heading":"…","body":"… **bold** …"},…],"closing":"…"} — title is a complete 4–10 word headline (no trailing dash); letter ~250 words when material allows.'
      : "NONE",
  );
  return parts.join(" ");
}

function buildUserPrompt(params: {
  periodLabel: string;
  periodPhrase: string;
  journalText: string;
  chatText: string;
  moodTagsText: string;
  selection: WeeklyGenerateSelection;
  lastWeekPromises?: string[];
  priorRecurringThoughts?: Array<{ text: string; label: string }>;
  corrections?: string[];
  letterRevision?: { feedback: string; priorLetterMarkdown: string };
}): string {
  const wantLetter = params.selection.letter;
  const promiseBlock =
    wantLetter &&
    params.lastWeekPromises &&
    params.lastWeekPromises.length > 0
      ? [
          "RECENT PROMISES (mention naturally in the letter if relevant):",
          ...params.lastWeekPromises.map((p) => `- ${p}`),
          "",
        ].join("\n")
      : "";
  const thoughtBlock =
    params.selection.patterns.thought &&
    params.priorRecurringThoughts &&
    params.priorRecurringThoughts.length > 0
      ? [
          "PRIOR RECURRING THOUGHTS (reuse wording when the same belief appears again):",
          ...params.priorRecurringThoughts.map(
            (t) => `- (${t.label}) ${t.text}`,
          ),
          "",
        ].join("\n")
      : "";
  const correctionsBlock =
    params.corrections && params.corrections.length > 0
      ? [
          "USER CORRECTIONS (honour these; do not repeat items marked incorrect or hidden):",
          ...params.corrections.slice(0, 10).map((c) => `- ${c}`),
          "",
        ].join("\n")
      : "";
  const revision = params.letterRevision;
  const revisionBlock =
    wantLetter &&
    revision?.feedback?.trim() &&
    revision?.priorLetterMarkdown?.trim()
      ? [
          "LETTER REWRITE REQUEST:",
          "The reader disliked the previous letter below. Write a fresh letter for the same period that addresses their feedback. Do not reuse the same structure, phrasing, or framing unless the feedback asks you to keep something. Still use the required LETTER JSON shape (greeting, preamble, sections, closing) and [[NAME]].",
          `USER FEEDBACK ON WHAT FELT OFF: ${revision.feedback.trim().slice(0, 800)}`,
          "PREVIOUS LETTER (do not repeat — improve against the feedback):",
          revision.priorLetterMarkdown.trim().slice(0, 6000),
          "",
        ].join("\n")
      : "";
  return [
    `PERIOD: ${params.periodLabel} — write about it as "${params.periodPhrase}"`,
    "",
    `REQUESTED: letter=${wantLetter ? "yes" : "no"}; patterns moved=${params.selection.patterns.moved ? "yes" : "no"} wins=${params.selection.patterns.wins ? "yes" : "no"} thought=${params.selection.patterns.thought ? "yes" : "no"} (emotions+activities always; wellbeing always)`,
    "",
    promiseBlock,
    thoughtBlock,
    correctionsBlock,
    revisionBlock,
    "JOURNAL ENTRIES IN THIS PERIOD (use Entry id in activities and entry_ids; long entries may be shortened with […]):",
    params.journalText,
    "",
    "MEDITATION CREATE CHATS IN THIS PERIOD:",
    params.chatText,
    "",
    "MOOD TAGS IN THIS PERIOD (for moodSummary + entry_moods — not for emotion scores):",
    params.moodTagsText,
    "",
    "Write the reply now in the exact <<<WELLBEING>>> / <<<EMOTIONS>>> / <<<MOOD_SUMMARY>>> / <<<PATTERNS>>> / <<<LETTER>>> format.",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJsonObjectFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{") && t.endsWith("}")) return t;
  const start = t.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < t.length; i += 1) {
    const ch = t[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return t.slice(start, i + 1).trim();
      if (depth < 0) return null;
    }
  }
  return null;
}

function extractJsonArrayFromText(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1).trim();
      if (depth < 0) return null;
    }
  }
  return null;
}

/** Prefer delimiter format; fall back to JSON / salvage emotions from a messy blob. */
function parseLetterModelOutput(
  outText: string,
  knownEntryIds: Set<string> = new Set(),
  entriesById: Map<string, string> = new Map(),
  userMoodEntryIds: Set<string> = new Set(),
): {
  letterMarkdown: string;
  title?: string;
  letterDocument?: LetterDocument;
  wellbeing: WellbeingLevel;
  emotions?: WeeklyEmotionScore[];
  moodSummary?: string;
  arc?: WeeklyArc;
  wins?: WeeklyCitedItem[];
  promises?: WeeklyCitedItem[];
  recurringThought?: WeeklyRecurringThought;
  activities?: WeeklyActivityByEntry[];
  entryMoods?: WeeklyEntryMood[];
} {
  const delimFull = outText.match(
    /<<<WELLBEING>>>\s*([\s\S]*?)\s*<<<EMOTIONS>>>\s*([\s\S]*?)\s*<<<MOOD_SUMMARY>>>\s*([\s\S]*?)\s*<<<PATTERNS>>>\s*([\s\S]*?)\s*<<<LETTER>>>\s*([\s\S]+)$/i,
  );
  const delimWithPatterns = !delimFull
    ? outText.match(
        /<<<EMOTIONS>>>\s*([\s\S]*?)\s*<<<MOOD_SUMMARY>>>\s*([\s\S]*?)\s*<<<PATTERNS>>>\s*([\s\S]*?)\s*<<<LETTER>>>\s*([\s\S]+)$/i,
      )
    : null;
  const delimLegacy = !delimFull && !delimWithPatterns
    ? outText.match(
        /<<<EMOTIONS>>>\s*([\s\S]*?)\s*<<<MOOD_SUMMARY>>>\s*([\s\S]*?)\s*<<<LETTER>>>\s*([\s\S]+)$/i,
      )
    : null;
  const delim = delimFull
    ? {
        wellbeing: delimFull[1],
        emotions: delimFull[2],
        mood: delimFull[3],
        patterns: delimFull[4],
        letter: delimFull[5],
      }
    : delimWithPatterns
      ? {
          wellbeing: null as string | null,
          emotions: delimWithPatterns[1],
          mood: delimWithPatterns[2],
          patterns: delimWithPatterns[3],
          letter: delimWithPatterns[4],
        }
      : delimLegacy
        ? {
            wellbeing: null as string | null,
            emotions: delimLegacy[1],
            mood: delimLegacy[2],
            patterns: null as string | null,
            letter: delimLegacy[3],
          }
        : null;
  if (delim) {
    let wellbeing: WellbeingLevel = "none";
    if (delim.wellbeing) {
      const wbRaw =
        extractJsonObjectFromText(delim.wellbeing) ?? delim.wellbeing.trim();
      try {
        wellbeing = parseWellbeingLevel(JSON.parse(wbRaw));
      } catch {
        wellbeing = parseWellbeingLevel(wbRaw);
      }
    }
    const emotionsRaw =
      extractJsonArrayFromText(delim.emotions ?? "") ?? delim.emotions?.trim();
    let emotions: WeeklyEmotionScore[] | undefined;
    if (emotionsRaw) {
      try {
        emotions = parseEmotions(JSON.parse(emotionsRaw), knownEntryIds, entriesById);
      } catch {
        emotions = parseEmotions(emotionsRaw, knownEntryIds, entriesById);
      }
    }
    const moodLine = (delim.mood ?? "").trim();
    const moodSummary =
      !moodLine || /^none$/i.test(moodLine)
        ? undefined
        : parseMoodSummary(moodLine);
    let patterns: ReturnType<typeof parsePatternsBlob> = {};
    if (delim.patterns) {
      const patternsRaw =
        extractJsonObjectFromText(delim.patterns) ?? delim.patterns.trim();
      if (patternsRaw) {
        try {
          patterns = parsePatternsBlob(
            JSON.parse(patternsRaw),
            knownEntryIds,
            entriesById,
            userMoodEntryIds,
          );
        } catch {
          /* ignore broken patterns — letter still saves */
        }
      }
    }
    const letterRaw = (delim.letter ?? "").trim();
    const letterIsNone = /^NONE$/i.test(letterRaw);
    // Keep literal NONE so callClaude can treat patterns-only as success;
    // coerce would otherwise collapse it to "" and drop patterns below.
    const letterMarkdown = letterIsNone
      ? "NONE"
      : coerceLetterMarkdown(letterRaw);
    const title = letterIsNone
      ? undefined
      : extractLetterTitleFromModelOutput(letterRaw);
    if (letterMarkdown || letterIsNone) {
      return {
        letterMarkdown,
        ...(title ? { title } : {}),
        wellbeing,
        emotions,
        moodSummary,
        ...patterns,
      };
    }
  }

  const jsonObj = extractJsonObjectFromText(outText);
  if (jsonObj) {
    try {
      const parsed = JSON.parse(jsonObj) as {
        letterMarkdown?: unknown;
        emotions?: unknown;
        moodSummary?: unknown;
        arc?: unknown;
        wins?: unknown;
        promises?: unknown;
        recurring_thought?: unknown;
        recurringThought?: unknown;
        activities?: unknown;
      };
      if (typeof parsed.letterMarkdown === "string" && parsed.letterMarkdown.trim()) {
        const patterns = parsePatternsBlob(
          parsed,
          knownEntryIds,
          entriesById,
          userMoodEntryIds,
        );
        const letterRaw = parsed.letterMarkdown.trim();
        const title =
          extractLetterTitleFromModelOutput(letterRaw) ??
          extractLetterTitleFromModelOutput(jsonObj);
        return {
          letterMarkdown: coerceLetterMarkdown(letterRaw),
          ...(title ? { title } : {}),
          wellbeing: parseWellbeingLevel(
            (parsed as { wellbeing?: unknown }).wellbeing,
          ),
          emotions: parseEmotions(parsed.emotions, knownEntryIds, entriesById),
          moodSummary: parseMoodSummary(parsed.moodSummary),
          ...patterns,
        };
      }
    } catch {
      /* salvage below */
    }
    // Unescaped newlines inside letterMarkdown often break JSON.parse — salvage emotions.
    const emotionsMatch = jsonObj.match(/"emotions"\s*:\s*(\[[\s\S]*?\])/);
    const moodMatch = jsonObj.match(/"moodSummary"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const letterMatch = jsonObj.match(
      /"letterMarkdown"\s*:\s*"((?:\\.|[^"\\])*)"/,
    );
    let emotions: WeeklyEmotionScore[] | undefined;
    if (emotionsMatch?.[1]) {
      try {
        emotions = parseEmotions(JSON.parse(emotionsMatch[1]), knownEntryIds);
      } catch {
        /* ignore */
      }
    }
    if (!emotions) {
      const arr = extractJsonArrayFromText(jsonObj);
      if (arr) {
        try {
          emotions = parseEmotions(JSON.parse(arr), knownEntryIds);
        } catch {
          /* ignore */
        }
      }
    }
    let letterMarkdown = "";
    if (letterMatch?.[1]) {
      try {
        letterMarkdown = JSON.parse(`"${letterMatch[1]}"`) as string;
      } catch {
        letterMarkdown = letterMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    }
    if (!letterMarkdown.trim()) {
      // Last resort: strip JSON-ish prefix and keep remaining prose.
      letterMarkdown = outText
        .replace(/^[\s\S]*?"letterMarkdown"\s*:\s*"/, "")
        .replace(/"\s*,\s*"(emotions|moodSummary|arc|wins|promises)"[\s\S]*$/, "")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .trim();
    }
    if (letterMarkdown.trim()) {
      const letterRaw = letterMarkdown.trim();
      const title =
        extractLetterTitleFromModelOutput(letterRaw) ??
        extractLetterTitleFromModelOutput(outText);
      return {
        letterMarkdown: coerceLetterMarkdown(letterRaw),
        ...(title ? { title } : {}),
        wellbeing: "none",
        emotions,
        moodSummary: moodMatch?.[1]
          ? parseMoodSummary(moodMatch[1].replace(/\\"/g, '"'))
          : undefined,
      };
    }
  }

  // Emotions array alone somewhere in the blob + letter as the rest.
  const arr = extractJsonArrayFromText(outText);
  let emotions: WeeklyEmotionScore[] | undefined;
  if (arr) {
    try {
      emotions = parseEmotions(JSON.parse(arr), knownEntryIds);
    } catch {
      /* ignore */
    }
  }
  let letterMarkdown = outText;
  if (arr) letterMarkdown = outText.replace(arr, "").trim();
  letterMarkdown = letterMarkdown
    .replace(/<<<WELLBEING>>>/gi, "")
    .replace(/<<<EMOTIONS>>>/gi, "")
    .replace(/<<<MOOD_SUMMARY>>>/gi, "")
    .replace(/<<<PATTERNS>>>/gi, "")
    .replace(/<<<LETTER>>>/gi, "")
    .replace(/^\{[\s\S]*$/, "")
    .trim();
  const letterRaw = letterMarkdown || outText;
  const title = extractLetterTitleFromModelOutput(letterRaw);
  return {
    letterMarkdown: coerceLetterMarkdown(letterRaw),
    ...(title ? { title } : {}),
    wellbeing: "none",
    emotions,
  };
}

async function callClaudeForLetter(params: {
  apiKey: string;
  system: string;
  user: string;
  knownEntryIds?: Set<string>;
  entriesById?: Map<string, string>;
  userMoodEntryIds?: Set<string>;
}): Promise<{
  letterMarkdown: string;
  title?: string;
  letterDocument?: LetterDocument;
  wellbeing: WellbeingLevel;
  emotions?: WeeklyEmotionScore[];
  moodSummary?: string;
  arc?: WeeklyArc;
  wins?: WeeklyCitedItem[];
  promises?: WeeklyCitedItem[];
  recurringThought?: WeeklyRecurringThought;
  activities?: WeeklyActivityByEntry[];
  entryMoods?: WeeklyEntryMood[];
  usage: { input_tokens: number; output_tokens: number } | null;
}> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_HAIKU_45_MODEL_ID,
      // Keep under API Gateway's 30s integration limit (letter + patterns).
      max_tokens: 2048,
      temperature: 0.5,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic request failed (${res.status}): ${text.slice(0, 600)}`);
  }
  const usage = parseAnthropicMessageUsage(text);
  try {
    const o = JSON.parse(text) as { content?: Array<{ type?: string; text?: string }> };
    const block = Array.isArray(o.content)
      ? o.content.find((b) => b?.type === "text")
      : undefined;
    const outText = typeof block?.text === "string" ? block.text.trim() : "";
    if (!outText) throw new Error("Empty Claude response");
    const known = params.knownEntryIds ?? new Set();
    const byId = params.entriesById ?? new Map();
    const userMoods = params.userMoodEntryIds ?? new Set();
    const parsed = parseLetterModelOutput(outText, known, byId, userMoods);
    const rawLetter = parsed.letterMarkdown.trim();
    // Patterns-only runs emit NONE — that is success, not an empty letter.
    if (/^NONE$/i.test(rawLetter)) {
      return { ...parsed, letterMarkdown: "", usage };
    }
    // Title may live on the raw JSON before coerce strips structure to markdown.
    const title =
      parsed.title ?? extractLetterTitleFromModelOutput(rawLetter);
    const letter = coerceLetterMarkdown(rawLetter);
    if (!letter) {
      throw new Error("Empty letter in model response");
    }
    return {
      ...parsed,
      letterMarkdown: letter,
      ...(title ? { title } : {}),
      usage,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid Anthropic JSON";
    throw new Error(msg);
  }
}


function parseLetterAudioStatus(
  raw: unknown,
): WeeklyReflection["letterAudioStatus"] | undefined {
  return raw === "none" ||
    raw === "generating" ||
    raw === "ready" ||
    raw === "failed"
    ? raw
    : undefined;
}

function letterAudioFieldsFromItem(
  item: Record<string, unknown>,
): Pick<
  WeeklyReflection,
  | "letterAudioUrl"
  | "letterAudioStatus"
  | "letterAudioError"
  | "letterAudioProgress"
  | "letterAudioGeneratedAt"
  | "letterAudioVoiceId"
> {
  const status = parseLetterAudioStatus(item.letterAudioStatus);
  const url =
    typeof item.letterAudioUrl === "string" && item.letterAudioUrl.trim()
      ? item.letterAudioUrl.trim()
      : undefined;
  const err =
    typeof item.letterAudioError === "string" && item.letterAudioError.trim()
      ? item.letterAudioError.trim()
      : undefined;
  const progress =
    typeof item.letterAudioProgress === "string" &&
    item.letterAudioProgress.trim()
      ? item.letterAudioProgress.trim()
      : undefined;
  const generatedAt =
    typeof item.letterAudioGeneratedAt === "string" &&
    item.letterAudioGeneratedAt.trim()
      ? item.letterAudioGeneratedAt.trim()
      : undefined;
  const voiceId =
    typeof item.letterAudioVoiceId === "string" &&
    item.letterAudioVoiceId.trim()
      ? item.letterAudioVoiceId.trim()
      : undefined;
  return {
    ...(url ? { letterAudioUrl: url } : {}),
    ...(status ? { letterAudioStatus: status } : {}),
    ...(err ? { letterAudioError: err } : {}),
    ...(progress ? { letterAudioProgress: progress } : {}),
    ...(generatedAt ? { letterAudioGeneratedAt: generatedAt } : {}),
    ...(voiceId ? { letterAudioVoiceId: voiceId } : {}),
  };
}

function itemToReflection(
  ownerId: string,
  item: Record<string, unknown> | undefined,
): WeeklyReflection | null {
  if (!item) return null;
  const period = migrateStoredPeriod(item);
  if (!period) return null;
  const letterMarkdown =
    typeof item.letterMarkdown === "string" ? item.letterMarkdown : "";
  const title =
    typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : undefined;
  const weekStart = safeIso(item.weekStart);
  const weekEnd = safeIso(item.weekEnd);
  const generatedAt = safeIso(item.generatedAt);
  if (!weekStart || !weekEnd || !generatedAt) return null;
  const generatedParts = parseGeneratedParts(item.generatedParts);
  const emotions = parseEmotions(item.emotions);
  const moodSummary = parseMoodSummary(item.moodSummary);
  const patterns = parsePatternsBlob(
    {
      arc: item.arc,
      wins: item.wins,
      promises: item.promises,
      recurring_thought: item.recurringThought ?? item.recurring_thought,
      activities: item.activities,
      entry_moods: item.entryMoods ?? item.entry_moods,
    },
    new Set(),
  );
  const hasLetter = Boolean(letterMarkdown.trim());
  const hasParts =
    Boolean(generatedParts) &&
    (generatedParts!.letter ||
      generatedParts!.felt ||
      generatedParts!.moved ||
      generatedParts!.wins ||
      generatedParts!.thought);
  const hasPatternsData = Boolean(
    patterns.arc ||
      patterns.wins ||
      patterns.promises ||
      patterns.recurringThought ||
      patterns.activities ||
      patterns.entryMoods ||
      emotions,
  );
  // Legacy rows always had a letter; patterns-only rows need generatedParts/data.
  if (!hasLetter && !hasParts && !hasPatternsData) return null;
  const previewStored =
    typeof item.preview === "string" && item.preview.trim()
      ? item.preview.trim()
      : hasLetter
        ? letterPreviewFromMarkdown(letterMarkdown)
        : undefined;
  const recurringThought = (() => {
    const base =
      patterns.recurringThought ??
      parseRecurringThought(item.recurringThought);
    if (!base) return undefined;
    const alsoRaw =
      item.recurringThought &&
      typeof item.recurringThought === "object"
        ? (item.recurringThought as { alsoOn?: unknown }).alsoOn
        : undefined;
    const alsoOn = Array.isArray(alsoRaw)
      ? alsoRaw
          .filter(
            (d): d is string =>
              typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
          )
          .slice(0, 8)
      : undefined;
    return alsoOn && alsoOn.length > 0 ? { ...base, alsoOn } : base;
  })();
  return {
    ownerId,
    periodType: period.periodType,
    startDate: period.startDate,
    endDate: period.endDate,
    rangeKey: insightRangeKey(period.startDate, period.endDate),
    weekKey: weekKeyForPeriod(period),
    weekStart,
    weekEnd,
    letterMarkdown,
    ...(title ? { title } : {}),
    ...(previewStored ? { preview: previewStored } : {}),
    ...(emotions ? { emotions } : {}),
    ...(moodSummary ? { moodSummary } : {}),
    ...(patterns.arc ? { arc: patterns.arc } : {}),
    ...(patterns.wins ? { wins: patterns.wins } : {}),
    ...(patterns.promises ? { promises: patterns.promises } : {}),
    ...(recurringThought ? { recurringThought } : {}),
    ...(patterns.activities ? { activities: patterns.activities } : {}),
    ...(patterns.entryMoods ? { entryMoods: patterns.entryMoods } : {}),
    ...(generatedParts ? { generatedParts } : {}),
    wellbeing: { level: parseWellbeingLevel(item.wellbeing) },
    ...(item.letterFeedback &&
    typeof item.letterFeedback === "object" &&
    ((item.letterFeedback as { rating?: unknown }).rating === "up" ||
      (item.letterFeedback as { rating?: unknown }).rating === "down")
      ? {
          letterFeedback: {
            rating: (item.letterFeedback as { rating: "up" | "down" }).rating,
            ...((item.letterFeedback as { note?: unknown }).note &&
            typeof (item.letterFeedback as { note?: unknown }).note === "string"
              ? { note: String((item.letterFeedback as { note: string }).note) }
              : {}),
            at:
              typeof (item.letterFeedback as { at?: unknown }).at === "string"
                ? String((item.letterFeedback as { at: string }).at)
                : generatedAt,
          },
        }
      : {}),
    ...letterAudioFieldsFromItem(item),
    meta: {
      generatedAt,
      model:
        typeof item.model === "string" ? item.model : CLAUDE_HAIKU_45_MODEL_ID,
      journalEntryCount:
        typeof item.journalEntryCount === "number" ? item.journalEntryCount : 0,
      meditationChatCount:
        typeof item.meditationChatCount === "number" ? item.meditationChatCount : 0,
      usage:
        item.usage &&
        typeof item.usage === "object" &&
        typeof (item.usage as { input_tokens?: unknown }).input_tokens === "number" &&
        typeof (item.usage as { output_tokens?: unknown }).output_tokens === "number"
          ? (item.usage as { input_tokens: number; output_tokens: number })
          : null,
    },
  };
}

/**
 * Read the insight for an exact range. New rows live at `RANGE#start#end`;
 * pre-v6 rows are still at `WEEKLY#monday`, so a Monday–Sunday range falls
 * back to the old key and is migrated on the way out.
 */
async function loadReflectionForPeriod(
  table: string,
  ownerId: string,
  period: { startDate: string; endDate: string },
): Promise<WeeklyReflection | null> {
  const r = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: ownerId, sk: insightSortKey(period.startDate, period.endDate) },
    }),
  );
  const direct = itemToReflection(ownerId, r.Item as Record<string, unknown>);
  if (direct) return direct;

  const week = weekBoundsForDate(period.startDate);
  if (week.startDate !== period.startDate || week.endDate !== period.endDate) {
    return null;
  }
  const legacy = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: ownerId, sk: `WEEKLY#${period.startDate}` },
    }),
  );
  return itemToReflection(ownerId, legacy.Item as Record<string, unknown>);
}

type WeeklyLetterSummary = {
  periodType: InsightPeriodType;
  startDate: string;
  endDate: string;
  rangeKey: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  preview?: string;
  emotions?: WeeklyEmotionScore[];
  activities?: WeeklyActivityByEntry[];
  promises?: string[];
  recurringThought?: WeeklyRecurringThought;
  generatedParts?: WeeklyGeneratedParts;
};

/** One stored row → list summary. Exported shape is shared by both key styles. */
export function itemToLetterSummary(
  item: Record<string, unknown>,
): WeeklyLetterSummary | null {
  const period = migrateStoredPeriod(item);
  if (!period) return null;
  const letterMarkdown =
    typeof item.letterMarkdown === "string" ? item.letterMarkdown : "";
  const weekStart = safeIso(item.weekStart);
  const weekEnd = safeIso(item.weekEnd);
  const generatedAt = safeIso(item.generatedAt);
  if (!weekStart || !weekEnd || !generatedAt) return null;
  const generatedParts = parseGeneratedParts(item.generatedParts);
  const emotions = parseEmotions(item.emotions);
  const patterns = parsePatternsBlob(
    {
      wins: item.wins,
      promises: item.promises,
      recurring_thought: item.recurringThought ?? item.recurring_thought,
      activities: item.activities,
    },
    new Set(),
  );
  const hasLetter = Boolean(letterMarkdown.trim());
  const hasParts =
    Boolean(generatedParts) &&
    (generatedParts!.letter ||
      generatedParts!.felt ||
      generatedParts!.moved ||
      generatedParts!.wins ||
      generatedParts!.thought);
  if (!hasLetter && !hasParts && !emotions && !patterns.activities) return null;
  const preview =
    typeof item.preview === "string" && item.preview.trim()
      ? item.preview.trim()
      : hasLetter
        ? letterPreviewFromMarkdown(letterMarkdown)
        : undefined;
  return {
    periodType: period.periodType,
    startDate: period.startDate,
    endDate: period.endDate,
    rangeKey: insightRangeKey(period.startDate, period.endDate),
    weekKey: weekKeyForPeriod(period),
    weekStart,
    weekEnd,
    generatedAt,
    ...(preview ? { preview } : {}),
    ...(emotions ? { emotions } : {}),
    ...(patterns.activities ? { activities: patterns.activities } : {}),
    ...(patterns.promises ? { promises: patterns.promises } : {}),
    ...(patterns.recurringThought
      ? { recurringThought: patterns.recurringThought }
      : {}),
    ...(generatedParts ? { generatedParts } : {}),
  };
}

/**
 * Newest first by end date. A `RANGE#` row always wins over a legacy `WEEKLY#`
 * row for the same dates, so migrated weeks never show twice.
 */
export function mergeLetterSummaries(
  rangeRows: WeeklyLetterSummary[],
  legacyRows: WeeklyLetterSummary[],
): WeeklyLetterSummary[] {
  const byRange = new Map<string, WeeklyLetterSummary>();
  for (const row of legacyRows) byRange.set(row.rangeKey, row);
  for (const row of rangeRows) byRange.set(row.rangeKey, row);
  return [...byRange.values()].sort((a, b) => {
    if (a.endDate !== b.endDate) return a.endDate < b.endDate ? 1 : -1;
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;
    return a.generatedAt < b.generatedAt ? 1 : -1;
  });
}

async function queryInsightRows(
  table: string,
  ownerId: string,
  prefix: string,
): Promise<WeeklyLetterSummary[]> {
  const out: WeeklyLetterSummary[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :p AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":p": ownerId, ":prefix": prefix },
        ScanIndexForward: false,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const raw of r.Items ?? []) {
      const row = itemToLetterSummary(raw as Record<string, unknown>);
      if (row) out.push(row);
    }
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return out;
}

async function listWeeklyReflections(
  table: string,
  ownerId: string,
): Promise<WeeklyLetterSummary[]> {
  const [rangeRows, legacyRows] = await Promise.all([
    queryInsightRows(table, ownerId, "RANGE#"),
    queryInsightRows(table, ownerId, "WEEKLY#"),
  ]);
  return mergeLetterSummaries(rangeRows, legacyRows);
}

function utcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Localhost / 127.0.0.1 origins — no daily generation cap while developing. */
function isDevClientRequest(event: APIGatewayProxyEventV2): boolean {
  const headers = event.headers ?? {};
  const pick = (name: string): string => {
    const want = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === want && typeof v === "string") return v.trim();
    }
    return "";
  };
  for (const raw of [pick("origin"), pick("referer")]) {
    if (!raw) continue;
    try {
      const host = new URL(raw).hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function insightsDailyLimitApplies(params: {
  event: APIGatewayProxyEventV2;
  role?: string;
}): number | null {
  const limit = resolveInsightsDailyLimit();
  if (limit == null) return null;
  if (params.role === "admin") return null;
  if (isDevClientRequest(params.event)) return null;
  return limit;
}

async function getDailyGenerationCount(
  table: string,
  ownerId: string,
  now = new Date(),
): Promise<number> {
  try {
    const r = await ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: ownerId, sk: `GENCOUNT#${utcDateKey(now)}` },
      }),
    );
    const count = (r.Item as { count?: unknown } | undefined)?.count;
    return typeof count === "number" && Number.isFinite(count)
      ? Math.max(0, Math.floor(count))
      : 0;
  } catch {
    return 0;
  }
}

async function incrementDailyGenerationCount(
  table: string,
  ownerId: string,
  usage: { input_tokens: number; output_tokens: number; rangeKey: string },
  now = new Date(),
): Promise<number> {
  const day = utcDateKey(now);
  const sk = `GENCOUNT#${day}`;
  const current = await getDailyGenerationCount(table, ownerId, now);
  const next = current + 1;
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: ownerId,
        sk,
        count: next,
        day,
        updatedAt: now.toISOString(),
        lastUsage: usage,
      },
    }),
  );
  return next;
}

async function saveWeeklyReflection(params: {
  table: string;
  reflection: WeeklyReflection;
}): Promise<void> {
  const { reflection } = params;
  await ddb.send(
    new PutCommand({
      TableName: params.table,
      Item: {
        pk: reflection.ownerId,
        sk: insightSortKey(reflection.startDate, reflection.endDate),
        periodType: reflection.periodType,
        startDate: reflection.startDate,
        endDate: reflection.endDate,
        weekKey: params.reflection.weekKey,
        weekStart: params.reflection.weekStart,
        weekEnd: params.reflection.weekEnd,
        letterMarkdown: params.reflection.letterMarkdown,
        ...(params.reflection.title
          ? { title: params.reflection.title }
          : {}),
        preview: params.reflection.preview,
        emotions: params.reflection.emotions,
        moodSummary: params.reflection.moodSummary,
        arc: params.reflection.arc,
        wins: params.reflection.wins,
        promises: params.reflection.promises,
        recurringThought: params.reflection.recurringThought,
        activities: params.reflection.activities,
        entryMoods: params.reflection.entryMoods,
        generatedParts: params.reflection.generatedParts,
        wellbeing: params.reflection.wellbeing ?? { level: "none" },
        letterFeedback: params.reflection.letterFeedback,
        ...(params.reflection.letterAudioUrl
          ? { letterAudioUrl: params.reflection.letterAudioUrl }
          : {}),
        ...(params.reflection.letterAudioStatus
          ? { letterAudioStatus: params.reflection.letterAudioStatus }
          : {}),
        ...(params.reflection.letterAudioError
          ? { letterAudioError: params.reflection.letterAudioError }
          : {}),
        ...(params.reflection.letterAudioProgress
          ? { letterAudioProgress: params.reflection.letterAudioProgress }
          : {}),
        ...(params.reflection.letterAudioGeneratedAt
          ? { letterAudioGeneratedAt: params.reflection.letterAudioGeneratedAt }
          : {}),
        ...(params.reflection.letterAudioVoiceId
          ? { letterAudioVoiceId: params.reflection.letterAudioVoiceId }
          : {}),
        generatedAt: params.reflection.meta.generatedAt,
        model: params.reflection.meta.model,
        journalEntryCount: params.reflection.meta.journalEntryCount,
        meditationChatCount: params.reflection.meta.meditationChatCount,
        usage: params.reflection.meta.usage ?? undefined,
      },
    }),
  );

  // A regenerated legacy week now lives at RANGE#; drop the old row so the
  // list does not have to keep de-duplicating it.
  const week = weekBoundsForDate(reflection.startDate);
  if (week.startDate === reflection.startDate && week.endDate === reflection.endDate) {
    try {
      await ddb.send(
        new DeleteCommand({
          TableName: params.table,
          Key: { pk: reflection.ownerId, sk: `WEEKLY#${week.startDate}` },
        }),
      );
    } catch {
      /* de-duplication on read still covers this */
    }
  }
}

async function collectWeekData(params: {
  journalTable: string;
  analyticsTable: string;
  jobsTable: string;
  ownerId: string;
  weekStart: string;
  weekEnd: string;
  allUsers: boolean;
}): Promise<{ entries: JournalEntry[]; chats: MeditationChatSource[] }> {
  let journalItems: Record<string, unknown>[];
  let meditationRows: Record<string, unknown>[];
  let jobChats: MeditationChatSource[];

  if (params.allUsers) {
    journalItems = await scanAllJournalItems(params.journalTable);
    meditationRows = await scanAllMeditationItems(params.analyticsTable);
    jobChats = await scanWeekJobTranscripts(
      params.jobsTable,
      params.weekStart,
      params.weekEnd,
    );
  } else {
    journalItems = await queryAllJournalItems(params.journalTable, params.ownerId);
    const userPk = meditationUserPk(params.ownerId);
    const globalPk = meditationGlobalUserPk();
    const legacyPk = LEGACY_MEDITATION_PARTITION_PK;
    const [userRows, globalRows, legacyRows] = await Promise.all([
      queryAllMeditationItems(params.analyticsTable, userPk),
      queryAllMeditationItems(params.analyticsTable, globalPk),
      queryAllMeditationItems(params.analyticsTable, legacyPk),
    ]);
    meditationRows = [...userRows, ...globalRows, ...legacyRows];
    jobChats = await queryWeekJobTranscripts(
      params.jobsTable,
      params.ownerId,
      params.weekStart,
      params.weekEnd,
    );
  }

  const entries = journalItemsToWeekEntries(
    journalItems,
    params.weekStart,
    params.weekEnd,
  );
  const draftChats = meditationRowsToWeekChats(
    meditationRows,
    params.weekStart,
    params.weekEnd,
  );
  const chats = dedupeChats([...draftChats, ...jobChats]);
  return { entries, chats };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return options();

  const journalTable = process.env.JOURNAL_TABLE_NAME?.trim();
  const insightsTable = process.env.JOURNAL_INSIGHTS_TABLE_NAME?.trim();
  const analyticsTable = process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim();
  const jobsTable = process.env.MEDITATION_JOBS_TABLE_NAME?.trim();
  if (!journalTable || !insightsTable || !analyticsTable || !jobsTable) {
    return json(500, { error: "Weekly reflection is not configured" });
  }

  const user = await optionalUserJson(event);
  if (!user?.sub?.trim()) {
    return json(401, { error: "Sign in to use weekly reflections" });
  }
  const ownerId = user.sub;
  const allUsers = false;
  const qs = event.queryStringParameters ?? {};

  if (method === "GET") {
    try {
      const listParam = qs.list?.trim();
      if (listParam === "1" || listParam === "true") {
        const letters = await listWeeklyReflections(insightsTable, ownerId);
        const current = resolveInsightPeriod(
          { periodType: "last7", timeZone: qs.timeZone },
        );
        return json(200, {
          letters,
          currentWeekKey: current.ok
            ? insightRangeKey(current.period.startDate, current.period.endDate)
            : "",
          currentRangeKey: current.ok
            ? insightRangeKey(current.period.startDate, current.period.endDate)
            : "",
        });
      }

      const previewParam = qs.preview?.trim();
      const resolved = resolveInsightPeriod({
        periodType: qs.periodType,
        startDate: qs.start ?? qs.startDate,
        endDate: qs.end ?? qs.endDate,
        week: qs.week,
        timeZone: qs.timeZone,
      });
      if (!resolved.ok) {
        return json(400, { error: resolved.error });
      }
      const period = resolved.period;

      if (previewParam === "1" || previewParam === "true") {
        const { entries, chats } = await collectWeekData({
          journalTable,
          analyticsTable,
          jobsTable,
          ownerId,
          weekStart: period.startIso,
          weekEnd: period.endIso,
          allUsers,
        });
        return json(200, {
          entryCount: entries.length,
          meditationCount: chats.length,
          startDate: period.startDate,
          endDate: period.endDate,
          periodType: period.periodType,
          rangeKey: insightRangeKey(period.startDate, period.endDate),
        });
      }

      const cached = await loadReflectionForPeriod(
        insightsTable,
        ownerId,
        period,
      );
      return json(200, {
        reflection: cached,
        weekKey: weekKeyForPeriod(period),
        weekStart: period.startIso,
        weekEnd: period.endIso,
        startDate: period.startDate,
        endDate: period.endDate,
        periodType: period.periodType,
        rangeKey: insightRangeKey(period.startDate, period.endDate),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Read failed";
      return json(500, { error: msg });
    }
  }

  if (method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let selection: WeeklyGenerateSelection = {
    letter: true,
    patterns: { felt: true, moved: true, wins: true, thought: true },
  };
  let correctionHints: string[] = [];
  let letterRevision:
    | { feedback: string; priorLetterMarkdown: string }
    | undefined;
  let postAction: string | undefined;
  let letterAudioVoiceId: string | undefined;
  let periodInput: {
    periodType?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    week?: unknown;
    timeZone?: unknown;
  } = {
    periodType: qs.periodType,
    startDate: qs.start ?? qs.startDate,
    endDate: qs.end ?? qs.endDate,
    week: qs.week,
    timeZone: qs.timeZone,
  };
  try {
    const bodyRaw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
      : (event.body ?? "");
    const parsed = JSON.parse(bodyRaw || "{}") as Record<string, unknown>;
    postAction =
      typeof parsed.action === "string" ? parsed.action.trim() : undefined;
    if (
      typeof parsed.voiceId === "string" &&
      parsed.voiceId.trim()
    ) {
      letterAudioVoiceId = parsed.voiceId.trim();
    }
    periodInput = {
      periodType: parsed.periodType ?? periodInput.periodType,
      startDate: parsed.startDate ?? parsed.start ?? periodInput.startDate,
      endDate: parsed.endDate ?? parsed.end ?? periodInput.endDate,
      week: parsed.week ?? periodInput.week,
      timeZone: parsed.timeZone ?? periodInput.timeZone,
    };
    if (postAction !== "generateLetterAudio") {
      selection = parseGenerateSelection(parsed);
    }
    if (Array.isArray(parsed.corrections)) {
      correctionHints = parsed.corrections
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim())
        .filter((c) => c.length >= 4 && c.length <= 240)
        .slice(0, 10);
    }
    const rev = parsed.letterRevision;
    if (rev && typeof rev === "object") {
      const feedback =
        typeof (rev as { feedback?: unknown }).feedback === "string"
          ? (rev as { feedback: string }).feedback.trim()
          : "";
      const priorLetterMarkdown =
        typeof (rev as { priorLetterMarkdown?: unknown }).priorLetterMarkdown ===
        "string"
          ? (rev as { priorLetterMarkdown: string }).priorLetterMarkdown.trim()
          : "";
      if (
        feedback.length >= 2 &&
        feedback.length <= 800 &&
        priorLetterMarkdown.length >= 20 &&
        priorLetterMarkdown.length <= 6000
      ) {
        letterRevision = { feedback, priorLetterMarkdown };
      }
    }
  } catch {
    /* ignore */
  }

  const resolved = resolveInsightPeriod(periodInput);
  if (!resolved.ok) {
    return json(400, { error: resolved.error });
  }
  const period = resolved.period;
  const rangeKey = insightRangeKey(period.startDate, period.endDate);
  const periodPhrase = periodPhraseForPrompt(period);
  const periodLabel = formatRangeWords(period.startDate, period.endDate);

  if (postAction === "generateLetterAudio") {
    try {
      const existing = await loadReflectionForPeriod(
        insightsTable,
        ownerId,
        period,
      );
      if (!existing?.letterMarkdown?.trim()) {
        return json(400, { error: "Generate a letter before listening" });
      }
      const fn = process.env.LETTER_NARRATE_FUNCTION_NAME?.trim();
      if (!fn) {
        return json(500, { error: "Letter narration is not configured" });
      }
      const sk = insightSortKey(period.startDate, period.endDate);
      await ddb.send(
        new UpdateCommand({
          TableName: insightsTable,
          Key: { pk: ownerId, sk },
          UpdateExpression:
            "SET letterAudioStatus = :st, letterAudioError = :err, letterAudioProgress = :prog, letterAudioStartedAt = :at, letterAudioVoiceId = :vid",
          ExpressionAttributeValues: {
            ":st": "generating",
            ":err": null,
            ":prog": "Queued — starting narration…",
            ":at": new Date().toISOString(),
            ":vid": letterAudioVoiceId ?? null,
          },
        }),
      );
      await new LambdaClient({}).send(
        new InvokeCommand({
          FunctionName: fn,
          InvocationType: "Event",
          Payload: Buffer.from(
            JSON.stringify({
              ownerId,
              startDate: period.startDate,
              endDate: period.endDate,
              ...(letterAudioVoiceId ? { voiceId: letterAudioVoiceId } : {}),
            }),
          ),
        }),
      );
      const refreshed = await loadReflectionForPeriod(
        insightsTable,
        ownerId,
        period,
      );
      return json(202, {
        reflection: refreshed ?? {
          ...existing,
          letterAudioStatus: "generating",
          letterAudioProgress: "Queued — starting narration…",
          ...(letterAudioVoiceId
            ? { letterAudioVoiceId }
            : {}),
        },
        weekKey: weekKeyForPeriod(period),
        weekStart: period.startIso,
        weekEnd: period.endIso,
        startDate: period.startDate,
        endDate: period.endDate,
        periodType: period.periodType,
        rangeKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start narration";
      return json(500, { error: msg });
    }
  }

  if (!selection.letter && !anyPatternSelected(selection.patterns)) {
    return json(400, { error: "Choose at least one: letter or patterns" });
  }

  const dailyLimit = insightsDailyLimitApplies({
    event,
    role: user.role,
  });
  if (dailyLimit != null) {
    const usedToday = await getDailyGenerationCount(insightsTable, ownerId);
    if (usedToday >= dailyLimit) {
      const { error, resetsAt } = formatInsightsDailyLimitMessage({
        timeZone:
          typeof periodInput.timeZone === "string"
            ? periodInput.timeZone
            : null,
      });
      return json(429, {
        error,
        code: "daily_limit",
        limit: dailyLimit,
        generationsRemaining: 0,
        resetsAt,
      });
    }
  }

  try {
    const existing = await loadReflectionForPeriod(
      insightsTable,
      ownerId,
      period,
    );

    const genStarted = Date.now();
    const { entries, chats } = await collectWeekData({
      journalTable,
      analyticsTable,
      jobsTable,
      ownerId: user?.sub ?? ownerId,
      weekStart: period.startIso,
      weekEnd: period.endIso,
      allUsers,
    });

    if (!entries.length && !chats.length) {
      return json(200, {
        reflection: null,
        weekKey: weekKeyForPeriod(period),
        weekStart: period.startIso,
        weekEnd: period.endIso,
        startDate: period.startDate,
        endDate: period.endDate,
        periodType: period.periodType,
        rangeKey,
        empty: true,
      });
    }

    console.info("insights.generate.start", {
      rangeKey,
      entryCount: entries.length,
      chatCount: chats.length,
      letter: selection.letter,
      patterns: selection.patterns,
    });

    const apiKey = await getClaudeApiKey();
    const priorLetters = (await listWeeklyReflections(insightsTable, ownerId))
      .filter((l) => l.endDate < period.startDate)
      .slice(0, 8);

    // Open promises from the most recent insight that ended before this one.
    const recentPromisesLetter = priorLetters.find(
      (l) => Array.isArray(l.promises) && l.promises.length > 0,
    );
    const lastWeekPromises = recentPromisesLetter?.promises?.map((p) =>
      typeof p === "string" ? p : p.text,
    );
    const priorRecurringThoughts = priorLetters
      .filter((l) => l.recurringThought?.text)
      .map((l) => ({
        text: l.recurringThought!.text,
        label: formatRangeWords(l.startDate, l.endDate),
      }));
    const knownEntryIds = new Set(entries.map((e) => e.id));
    const userMoodEntryIds = new Set(
      entries
        .filter((e) => isJournalMoodId(e.mood?.trim()))
        .map((e) => e.id),
    );
    let modelOut: Awaited<ReturnType<typeof callClaudeForLetter>>;
    try {
      modelOut = await callClaudeForLetter({
        apiKey,
        system: buildSystemPrompt(selection, periodPhrase),
        user: buildUserPrompt({
          periodLabel,
          periodPhrase,
          journalText: formatJournalForPrompt(entries),
          chatText: formatChatsForPrompt(chats),
          moodTagsText: formatMoodTagsForPrompt(entries),
          selection,
          ...(lastWeekPromises?.length ? { lastWeekPromises } : {}),
          ...(priorRecurringThoughts.length
            ? { priorRecurringThoughts }
            : {}),
          ...(correctionHints.length ? { corrections: correctionHints } : {}),
          ...(letterRevision ? { letterRevision } : {}),
        }),
        knownEntryIds,
        entriesById: entryTextById(entries),
        userMoodEntryIds,
      });
    } catch (e) {
      if (existing?.letterMarkdown?.trim()) {
        return json(502, {
          error: e instanceof Error ? e.message : "Generation failed",
          reflection: existing,
          weekKey: weekKeyForPeriod(period),
          weekStart: period.startIso,
          weekEnd: period.endIso,
          startDate: period.startDate,
          endDate: period.endDate,
          periodType: period.periodType,
          rangeKey,
        });
      }
      throw e;
    }

    const {
      letterMarkdown: modelLetter,
      title: modelTitle,
      letterDocument: modelLetterDocument,
      wellbeing: modelWellbeing,
      emotions,
      moodSummary,
      arc,
      wins: modelWins,
      promises,
      recurringThought: modelThought,
      activities,
      entryMoods: modelEntryMoods,
      usage,
    } = modelOut;

    const writingDays = uniqueWritingDays(entries);
    const wroteLine =
      writingDays > 0
        ? `Wrote on ${writingDays} day${writingDays === 1 ? "" : "s"} out of ${period.days}`
        : null;
    const wins = (() => {
      if (!selection.patterns.wins) return undefined;
      const base: WeeklyCitedItem[] = modelWins ? [...modelWins] : [];
      if (
        wroteLine &&
        !base.some((w) => /^wrote on \d+/i.test(w.text))
      ) {
        base.push({ text: wroteLine });
      }
      return base.length > 0 ? base.slice(0, 5) : undefined;
    })();

    const recurringThought = (() => {
      if (!selection.patterns.thought || !modelThought) return undefined;
      const key = normalizeThoughtKey(modelThought.text);
      const alsoOn: string[] = [];
      for (const prior of priorLetters) {
        const priorText = prior.recurringThought?.text;
        if (!priorText) continue;
        if (normalizeThoughtKey(priorText) === key) {
          alsoOn.push(prior.startDate);
        }
      }
      return alsoOn.length > 0
        ? { ...modelThought, alsoOn: alsoOn.slice(0, 4) }
        : modelThought;
    })();

    const letterMarkdown = selection.letter
      ? /^none$/i.test(modelLetter.trim())
        ? existing?.letterMarkdown ?? ""
        : modelLetter.trim()
      : (existing?.letterMarkdown ?? "");

    const title = selection.letter
      ? modelTitle?.trim() || undefined
      : existing?.title;

    const preview = letterMarkdown.trim()
      ? letterPreviewFromMarkdown(letterMarkdown)
      : existing?.preview;

    const generatedParts = mergeGeneratedParts(
      existing?.generatedParts,
      selection,
    );

    const now = new Date().toISOString();
    const reflection: WeeklyReflection = {
      ownerId,
      periodType: period.periodType,
      startDate: period.startDate,
      endDate: period.endDate,
      rangeKey,
      weekKey: weekKeyForPeriod(period),
      weekStart: period.startIso,
      weekEnd: period.endIso,
      letterMarkdown,
      ...(title ? { title } : {}),
      ...(selection.letter && modelLetterDocument
        ? { letterDocument: modelLetterDocument }
        : !selection.letter && existing?.letterDocument
          ? { letterDocument: existing.letterDocument }
          : {}),
      ...(preview ? { preview } : {}),
      ...(emotions
        ? { emotions }
        : existing?.emotions
          ? { emotions: existing.emotions }
          : {}),
      ...(moodSummary
        ? { moodSummary }
        : existing?.moodSummary
          ? { moodSummary: existing.moodSummary }
          : {}),
      ...(selection.patterns.moved
        ? arc
          ? { arc }
          : {}
        : existing?.arc
          ? { arc: existing.arc }
          : {}),
      ...(selection.patterns.wins
        ? {
            ...(wins ? { wins } : {}),
            ...(promises ? { promises } : {}),
          }
        : {
            ...(existing?.wins ? { wins: existing.wins } : {}),
            ...(existing?.promises ? { promises: existing.promises } : {}),
          }),
      ...(selection.patterns.thought
        ? recurringThought
          ? { recurringThought }
          : {}
        : existing?.recurringThought
          ? { recurringThought: existing.recurringThought }
          : {}),
      ...(activities
        ? { activities }
        : existing?.activities
          ? { activities: existing.activities }
          : {}),
      ...(modelEntryMoods
        ? { entryMoods: modelEntryMoods }
        : existing?.entryMoods
          ? { entryMoods: existing.entryMoods }
          : {}),
      wellbeing: { level: modelWellbeing },
      ...(letterRevision
        ? {}
        : existing?.letterFeedback
          ? { letterFeedback: existing.letterFeedback }
          : {}),
      // Keep narration when the letter text is unchanged; otherwise drop it.
      ...(selection.letter &&
      letterMarkdown.trim() &&
      letterMarkdown.trim() === (existing?.letterMarkdown ?? "").trim()
        ? {
            ...(existing?.letterAudioUrl
              ? { letterAudioUrl: existing.letterAudioUrl }
              : {}),
            ...(existing?.letterAudioStatus
              ? { letterAudioStatus: existing.letterAudioStatus }
              : {}),
            ...(existing?.letterAudioGeneratedAt
              ? { letterAudioGeneratedAt: existing.letterAudioGeneratedAt }
              : {}),
            ...(existing?.letterAudioVoiceId
              ? { letterAudioVoiceId: existing.letterAudioVoiceId }
              : {}),
          }
        : !selection.letter
          ? {
              ...(existing?.letterAudioUrl
                ? { letterAudioUrl: existing.letterAudioUrl }
                : {}),
              ...(existing?.letterAudioStatus
                ? { letterAudioStatus: existing.letterAudioStatus }
                : {}),
              ...(existing?.letterAudioGeneratedAt
                ? { letterAudioGeneratedAt: existing.letterAudioGeneratedAt }
                : {}),
              ...(existing?.letterAudioVoiceId
                ? { letterAudioVoiceId: existing.letterAudioVoiceId }
                : {}),
            }
          : {}),
      generatedParts,
      meta: {
        generatedAt: now,
        model: CLAUDE_HAIKU_45_MODEL_ID,
        journalEntryCount: entries.length,
        meditationChatCount: chats.length,
        usage,
      },
    };

    await saveWeeklyReflection({ table: insightsTable, reflection });
    await incrementDailyGenerationCount(insightsTable, ownerId, {
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      rangeKey,
    });

    console.info("insights.generate.ok", {
      rangeKey,
      ms: Date.now() - genStarted,
      letterChars: letterMarkdown.length,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
    });

    const appliedLimit = insightsDailyLimitApplies({
      event,
      role: user.role,
    });
    const usedAfter = await getDailyGenerationCount(insightsTable, ownerId);

    return json(200, {
      reflection,
      weekKey: reflection.weekKey,
      weekStart: reflection.weekStart,
      weekEnd: reflection.weekEnd,
      startDate: reflection.startDate,
      endDate: reflection.endDate,
      periodType: reflection.periodType,
      rangeKey: reflection.rangeKey,
      generationsRemaining:
        appliedLimit == null
          ? null
          : Math.max(0, appliedLimit - usedAfter),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Weekly reflection failed";
    console.error("insights.generate.fail", msg);
    return json(500, { error: msg });
  }
}
