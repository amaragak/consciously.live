import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import type { CreateFlowHealAttachment } from "@/lib/create-one-flow-state";
import {
  currentView,
  exercisesForItem,
  updatesForItem,
  type HealItem,
  type HealStoreV1,
} from "@/lib/heal-store";

/** Account-scoped map from a generated job to the Heal item or journal entry it came from. */
export const HEAL_MEDITATION_LINKS_KEY = "mm_heal_meditation_links_v1";

export type HealMeditationLink = {
  jobId: string;
  title: string;
  createdAt: string;
  healItemId?: string | null;
  viewId?: string | null;
  journalEntryId?: string | null;
};

export function healShapeOpeningLine(name: string): string {
  return `This is for ${name}. Do you want it to help you sit with how it feels, or move towards your good-day view?`;
}

function readLinks(): HealMeditationLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readAccountLocalStorage(HEAL_MEDITATION_LINKS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is HealMeditationLink =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as HealMeditationLink).jobId === "string",
    );
  } catch {
    return [];
  }
}

export function loadHealMeditationLinks(): HealMeditationLink[] {
  return readLinks();
}

export function rememberHealMeditationLink(link: HealMeditationLink): void {
  const jobId = link.jobId.trim();
  if (!jobId) return;
  const next = readLinks().filter((row) => row.jobId !== jobId);
  next.unshift({ ...link, jobId });
  writeAccountLocalStorage(HEAL_MEDITATION_LINKS_KEY, JSON.stringify(next.slice(0, 200)));
}

export function healMeditationsForItem(itemId: string): HealMeditationLink[] {
  return readLinks()
    .filter((row) => row.healItemId === itemId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function journalMeditationForEntry(entryId: string): HealMeditationLink | null {
  return (
    readLinks()
      .filter((row) => row.journalEntryId === entryId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null
  );
}

export function isHealLinkedJob(jobId: string | null | undefined): boolean {
  const id = jobId?.trim();
  if (!id) return false;
  return readLinks().some((row) => row.jobId === id && Boolean(row.healItemId));
}

function trimWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).join(" ");
}

/** Private writing for the generator. The token only ever shows the item name. */
export function healCreateAttachment(
  item: HealItem,
  store: HealStoreV1,
): CreateFlowHealAttachment {
  const good = currentView(store, item.id, "good");
  const bad = currentView(store, item.id, "bad");
  const update = updatesForItem(store, item.id)[0];
  const answers = exercisesForItem(store, item.id)
    .filter((row) => row.answeredEntryId)
    .slice(-3)
    .map((row) => store.entries.find((entry) => entry.id === row.answeredEntryId)?.text?.trim() || "")
    .filter(Boolean);
  const context = [
    trimWords(update?.text || "", 120),
    ...answers.map((answer) => `Answer: ${answer}`),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    itemId: item.id,
    title: item.title.trim() || "Untitled",
    kind: item.type,
    canDo: item.canDo ?? null,
    goodDay: good?.text?.trim() || "",
    badDay: bad?.text?.trim() || "",
    goodViewId: good?.id ?? null,
    context,
    focus: null,
  };
}
