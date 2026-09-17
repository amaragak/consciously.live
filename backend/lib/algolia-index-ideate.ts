import {
  algoliaUserIdFromEmail,
  replaceUserRecords,
  scheduleAlgolia,
  type AlgoliaUserRecord,
} from "./algolia";

function asObj(x: unknown): Record<string, unknown> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  return x as Record<string, unknown>;
}

function str(x: unknown, max = 4000): string {
  return typeof x === "string" ? x.trim().slice(0, max) : "";
}

function ts(x: unknown): number {
  if (typeof x === "string") {
    const n = Date.parse(x);
    if (Number.isFinite(n)) return n;
  }
  return Date.now();
}

/** Flatten life areas / goals / todos / related text fields from an Ideate cloud bundle. */
export function ideateBundleToAlgoliaRecords(
  userId: string,
  bundle: unknown,
): AlgoliaUserRecord[] {
  const uid = userId.trim().toLowerCase();
  const root = asObj(bundle);
  if (!root) return [];
  const out: AlgoliaUserRecord[] = [];
  const ideate = asObj(root.ideate) ?? {};
  const dreams = Array.isArray(ideate.dreams) ? ideate.dreams : [];
  const subtasks = Array.isArray(ideate.subtasks) ? ideate.subtasks : [];
  const todos = Array.isArray(ideate.todos) ? ideate.todos : [];
  const resistance = Array.isArray(ideate.resistanceEntries)
    ? ideate.resistanceEntries
    : [];

  for (const d of dreams) {
    const o = asObj(d);
    if (!o || typeof o.id !== "string") continue;
    if (o.demo === true) continue;
    if (String(o.id).startsWith("demo-ideate-")) continue;
    const title = str(o.title) || "Life area";
    const body = [
      str(o.dreamText),
      str(o.obstacleText),
      str(o.visionText),
      str(o.firstThought),
      str(o.looseNotes),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
    out.push({
      objectID: `life_area:${o.id}`,
      userId: uid,
      type: "life_area",
      title,
      body,
      href: `/manifest/goal/${encodeURIComponent(o.id)}`,
      updatedAt: ts(o.updatedAt),
    });
  }

  for (const s of subtasks) {
    const o = asObj(s);
    if (!o || typeof o.id !== "string") continue;
    const projectId = str(o.projectId, 120);
    const title = str(o.title) || "Goal";
    const body = [str(o.dreamText), str(o.resistanceText), str(o.visionText)]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
    out.push({
      objectID: `goal:${o.id}`,
      userId: uid,
      type: "goal",
      title,
      body,
      href: projectId
        ? `/manifest/goal/${encodeURIComponent(projectId)}?tab=steps&task=${encodeURIComponent(o.id)}`
        : "/manifest/my",
      updatedAt: ts(o.updatedAt),
    });
  }

  for (const t of todos) {
    const o = asObj(t);
    if (!o || typeof o.id !== "string") continue;
    const title = str(o.title) || "To Do";
    out.push({
      objectID: `todo:${o.id}`,
      userId: uid,
      type: "todo",
      title,
      body: "",
      href: "/manifest/my",
      updatedAt: ts(o.updatedAt),
    });
  }

  for (const r of resistance) {
    const o = asObj(r);
    if (!o || typeof o.id !== "string") continue;
    const text = str(o.text);
    if (!text) continue;
    out.push({
      objectID: `resistance:${o.id}`,
      userId: uid,
      type: "resistance",
      title: str(o.category, 80) || "Resistance",
      body: text,
      href: "/manifest/my",
      updatedAt: ts(o.updatedAt),
    });
  }

  const values = asObj(root.values);
  const valueList = Array.isArray(values?.values) ? values!.values : [];
  for (const v of valueList) {
    const o = asObj(v);
    if (!o || typeof o.id !== "string") continue;
    const text = str(o.text) || str(o.label);
    if (!text) continue;
    out.push({
      objectID: `value:${o.id}`,
      userId: uid,
      type: "value",
      title: "Value",
      body: text,
      href: "/manifest/my",
      updatedAt: ts(o.updatedAt),
    });
  }

  const regrets = asObj(root.regrets);
  const regretList = Array.isArray(regrets?.regrets) ? regrets!.regrets : [];
  for (const r of regretList) {
    const o = asObj(r);
    if (!o || typeof o.id !== "string") continue;
    const text = str(o.statement) || str(o.text);
    if (!text) continue;
    out.push({
      objectID: `regret:${o.id}`,
      userId: uid,
      type: "regret",
      title: "Regret",
      body: text,
      href: "/manifest/my",
      updatedAt: ts(o.updatedAt),
    });
  }

  const quotes = asObj(root.quotes);
  const quoteList = Array.isArray(quotes?.quotes) ? quotes!.quotes : [];
  for (const q of quoteList) {
    const o = asObj(q);
    if (!o || typeof o.id !== "string") continue;
    const text = str(o.text);
    if (!text) continue;
    out.push({
      objectID: `quote:${o.id}`,
      userId: uid,
      type: "quote",
      title: str(o.attribution, 120) || "Quote",
      body: text,
      href: "/manifest/my",
      updatedAt: ts(o.updatedAt),
    });
  }

  const manifesto = asObj(root.manifesto);
  const manifestoText = str(manifesto?.text, 400);
  if (manifestoText) {
    out.push({
      objectID: `manifesto:main`,
      userId: uid,
      type: "manifesto",
      title: "Manifesto",
      body: manifestoText,
      href: "/manifest/my",
      updatedAt: ts(manifesto?.updatedAt),
    });
  }

  const vision = asObj(root.visionBoard);
  const items = Array.isArray(vision?.items) ? vision!.items : [];
  for (const it of items) {
    const o = asObj(it);
    if (!o || typeof o.id !== "string") continue;
    const title = str(o.label) || "Vision item";
    const body = str(o.prompt);
    out.push({
      objectID: `vision:${o.id}`,
      userId: uid,
      type: "vision",
      title,
      body,
      href: "/manifest/my/vision-board",
      updatedAt: ts(o.updatedAt),
    });
  }

  return out;
}

export const MANIFEST_ALGOLIA_TYPES = [
  "life_area",
  "goal",
  "todo",
  "value",
  "regret",
  "quote",
  "manifesto",
  "vision",
  "resistance",
] as const;

export function scheduleIndexIdeateBundle(
  email: string | undefined,
  bundle: unknown,
): void {
  const userId = algoliaUserIdFromEmail(email);
  scheduleAlgolia(async () => {
    const records = ideateBundleToAlgoliaRecords(userId, bundle);
    await replaceUserRecords({
      userId,
      types: [...MANIFEST_ALGOLIA_TYPES],
      records,
    });
  });
}
