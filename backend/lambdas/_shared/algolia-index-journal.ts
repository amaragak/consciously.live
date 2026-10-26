import {
  algoliaUserIdFromEmail,
  replaceUserRecords,
  scheduleAlgolia,
  stripHtmlToPlain,
  type AlgoliaUserRecord,
} from "./algolia";

type JournalEntryLike = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  contentHtml?: string;
  kind?: string;
  gratitude?: unknown;
  mood?: string;
  tags?: string[];
};

function gratitudeLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstJournalPromptQuestion(html: string): string {
  const re = /<div\b[^>]*\bdata-journal-prompt="1"[^>]*>/i;
  const match = re.exec(html);
  if (!match) return "";
  const tag = match[0];
  const attr = (name: string) => {
    const found = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
    if (!found) return "";
    return found[1]
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  };
  const template = attr("data-template").trim();
  const name = attr("data-name").trim();
  if (!template) return "";
  return name && template.includes("{name}")
    ? template.replaceAll("{name}", name).trim()
    : template;
}

export function journalEntriesToAlgoliaRecords(
  userId: string,
  entries: JournalEntryLike[],
): AlgoliaUserRecord[] {
  const uid = userId.trim().toLowerCase();
  const out: AlgoliaUserRecord[] = [];
  for (const e of entries) {
    if (!e?.id) continue;
    const updatedAt = Date.parse(e.updatedAt || e.createdAt || "") || Date.now();
    if (e.kind === "gratitude") {
      const lines = gratitudeLines(e.gratitude);
      out.push({
        objectID: `gratitude:${e.id}`,
        userId: uid,
        type: "gratitude",
        title: e.title?.trim() || "Gratitudes",
        body: lines.join("\n").slice(0, 4000),
        href: `/journal/my/gratitudes/${encodeURIComponent(e.id)}`,
        updatedAt,
      });
      continue;
    }
    const body = stripHtmlToPlain(e.contentHtml || "").slice(0, 4000);
    const tags = Array.isArray(e.tags)
      ? e.tags.filter((t): t is string => typeof t === "string").join(" ")
      : "";
    const savedTitle = e.title?.trim() || "";
    const promptTitle = savedTitle ? "" : firstJournalPromptQuestion(e.contentHtml || "");
    out.push({
      objectID: `journal:${e.id}`,
      userId: uid,
      type: "journal",
      title: savedTitle || promptTitle || "Journal entry",
      body: [body, e.mood, tags].filter(Boolean).join("\n").slice(0, 4000),
      href: `/journal/my/${encodeURIComponent(e.id)}`,
      updatedAt,
    });
  }
  return out;
}

export function scheduleIndexJournalStore(
  email: string | undefined,
  entries: JournalEntryLike[],
): void {
  const userId = algoliaUserIdFromEmail(email);
  scheduleAlgolia(async () => {
    const records = journalEntriesToAlgoliaRecords(userId, entries);
    await replaceUserRecords({
      userId,
      types: ["gratitude", "journal"],
      records,
    });
  });
}
