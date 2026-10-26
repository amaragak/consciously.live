/**
 * Daily journal prompts. Named prompts follow Story: a {name} slot rendered
 * as the gold chip, one set per life area, value, or Heal item.
 */

export type JournalPromptTopicKey =
  | "today"
  | "feel"
  | "people"
  | "work"
  | "body"
  | "back";

export type JournalPromptTopicId = "all" | JournalPromptTopicKey;

export type JournalPromptBucket = "topic" | "area" | "value" | "heal" | "meditation";

export type JournalPromptTopic = {
  id: JournalPromptTopicId;
  label: string;
};

export const JOURNAL_PROMPT_TOPICS: readonly JournalPromptTopic[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "feel", label: "How you feel" },
  { id: "people", label: "People" },
  { id: "work", label: "Work" },
  { id: "body", label: "Body" },
  { id: "back", label: "Looking back" },
] as const;

export type JournalPrompt = {
  id: string;
  bucket: JournalPromptBucket;
  topic?: JournalPromptTopicKey;
  template: string;
  text: string;
  refId?: string;
  name?: string;
};

export type JournalPromptFilter =
  | { kind: "all" }
  | { kind: "topic"; topic: JournalPromptTopicKey }
  | { kind: "area"; refId: string }
  | { kind: "value"; refId: string }
  | { kind: "heal"; refId: string };

type TemplateDef = {
  id: string;
  bucket: JournalPromptBucket;
  topic?: JournalPromptTopicKey;
  template: string;
};

const TOPICS: readonly TemplateDef[] = [
  { id: "today-well", bucket: "topic", topic: "today", template: "What went well today?" },
  { id: "today-mind", bucket: "topic", topic: "today", template: "Where did your mind go today?" },
  { id: "today-easier", bucket: "topic", topic: "today", template: "What would make tomorrow easier?" },
  { id: "today-hope", bucket: "topic", topic: "today", template: "What are you hoping for this week?" },
  { id: "today-surprise", bucket: "topic", topic: "today", template: "What surprised you today?" },
  { id: "today-win", bucket: "topic", topic: "today", template: "What's one small win?" },
  { id: "feel-weighing", bucket: "topic", topic: "feel", template: "What's weighing on you?" },
  { id: "feel-avoiding", bucket: "topic", topic: "feel", template: "What are you avoiding?" },
  { id: "feel-replay", bucket: "topic", topic: "feel", template: "What's one thing you keep replaying?" },
  { id: "feel-heavy", bucket: "topic", topic: "feel", template: "What felt heavier than it needed to?" },
  { id: "feel-let-go", bucket: "topic", topic: "feel", template: "What do you want to let go of?" },
  { id: "feel-protect", bucket: "topic", topic: "feel", template: "What are you protecting yourself from?" },
  { id: "people-say", bucket: "topic", topic: "people", template: "What do you need to say out loud?" },
  { id: "people-with", bucket: "topic", topic: "people", template: "Who were you with, and how did that feel?" },
  { id: "people-friend", bucket: "topic", topic: "people", template: "What would you tell a friend in your place?" },
  { id: "people-unsaid", bucket: "topic", topic: "people", template: "What went unsaid today?" },
  { id: "work-moved", bucket: "topic", topic: "work", template: "What actually moved forward at work today?" },
  { id: "work-stuck", bucket: "topic", topic: "work", template: "Where did work get stuck today?" },
  { id: "work-enough", bucket: "topic", topic: "work", template: "What would be enough for work tomorrow?" },
  { id: "body-notice", bucket: "topic", topic: "body", template: "What did your body notice?" },
  { id: "body-ask", bucket: "topic", topic: "body", template: "What is your body asking for tonight?" },
  { id: "body-carry", bucket: "topic", topic: "body", template: "Where are you still carrying the day?" },
  { id: "back-grateful", bucket: "topic", topic: "back", template: "What are you grateful you got through?" },
  { id: "back-unfinished", bucket: "topic", topic: "back", template: "What's unfinished from yesterday?" },
  { id: "back-different", bucket: "topic", topic: "back", template: "What would you do differently about today?" },
];

const AREA_TEMPLATES: readonly TemplateDef[] = [
  { id: "area-moved", bucket: "area", template: "What moved forward on {name} today?" },
  { id: "area-way", bucket: "area", template: "What got in the way of {name} today?" },
  { id: "area-next", bucket: "area", template: "What's the next small step for {name}?" },
  { id: "area-notice", bucket: "area", template: "What did you notice about {name} today?" },
  { id: "area-easier", bucket: "area", template: "What would make {name} easier tomorrow?" },
];

const VALUE_TEMPLATES: readonly TemplateDef[] = [
  { id: "value-show", bucket: "value", template: "Where did {name} show up today?" },
  { id: "value-against", bucket: "value", template: "When did you act against {name} today, and why?" },
  { id: "value-ask", bucket: "value", template: "What did {name} ask of you today?" },
  { id: "value-change", bucket: "value", template: "Where could {name} have changed how today went?" },
];

const HEAL_TEMPLATES: readonly TemplateDef[] = [
  { id: "heal-come", bucket: "heal", template: "Did {name} come up today? How did you handle it?" },
  { id: "heal-body", bucket: "heal", template: "What did {name} feel like in your body today?" },
  { id: "heal-helped", bucket: "heal", template: "What helped when {name} showed up today?" },
  { id: "heal-remember", bucket: "heal", template: "What do you want to remember about {name} from today?" },
];

const MEDITATION_TEMPLATES: readonly TemplateDef[] = [
  { id: "med-bring", bucket: "meditation", template: "What did {name} bring up today?" },
  { id: "med-carry", bucket: "meditation", template: "What will you carry from {name} into the rest of today?" },
  { id: "med-body", bucket: "meditation", template: "What did your body do during {name}?" },
];

function renderTemplate(template: string, name?: string): string {
  if (!name) return template;
  return template.replaceAll("{name}", name);
}

function expandNamed(
  templates: readonly TemplateDef[],
  refs: readonly { id: string; name: string }[],
): JournalPrompt[] {
  const out: JournalPrompt[] = [];
  for (const ref of refs) {
    const name = ref.name.trim();
    if (!name) continue;
    for (const t of templates) {
      out.push({
        id: `${t.id}:${ref.id}`,
        bucket: t.bucket,
        template: t.template,
        text: renderTemplate(t.template, name),
        refId: ref.id,
        name,
      });
    }
  }
  return out;
}

function asPrompt(t: TemplateDef): JournalPrompt {
  return {
    id: t.id,
    bucket: t.bucket,
    topic: t.topic,
    template: t.template,
    text: t.template,
  };
}

export function buildJournalPromptLibrary(opts: {
  includeLifeAreas: boolean;
  includeValues: boolean;
  includeHeal: boolean;
  areas: readonly { id: string; title: string }[];
  values: readonly { id: string; text: string }[];
  healItems: readonly { id: string; title: string }[];
  meditations?: readonly { id: string; title: string }[];
}): JournalPrompt[] {
  const out: JournalPrompt[] = TOPICS.map(asPrompt);
  if (opts.includeLifeAreas) {
    out.push(
      ...expandNamed(
        AREA_TEMPLATES,
        opts.areas.map((a) => ({ id: a.id, name: a.title })),
      ),
    );
  }
  if (opts.includeValues) {
    out.push(
      ...expandNamed(
        VALUE_TEMPLATES,
        opts.values.map((v) => ({ id: v.id, name: v.text })),
      ),
    );
  }
  if (opts.includeHeal) {
    out.push(
      ...expandNamed(
        HEAL_TEMPLATES,
        opts.healItems.map((h) => ({ id: h.id, name: h.title })),
      ),
    );
  }
  out.push(
    ...expandNamed(
      MEDITATION_TEMPLATES,
      opts.meditations?.map((m) => ({ id: m.id, name: m.title })) ?? [],
    ),
  );
  return out;
}

export function journalPromptMatchesFilter(
  prompt: JournalPrompt,
  filter: JournalPromptFilter,
): boolean {
  if (filter.kind === "all") return true;
  if (filter.kind === "topic") return prompt.topic === filter.topic;
  if (filter.kind === "area") return prompt.bucket === "area" && prompt.refId === filter.refId;
  if (filter.kind === "value") return prompt.bucket === "value" && prompt.refId === filter.refId;
  return prompt.bucket === "heal" && prompt.refId === filter.refId;
}

/** Linked life areas, Heal items, and meditations come first. */
export function splitJournalPromptsForEntry(
  prompts: readonly JournalPrompt[],
  linkedRefIds: ReadonlySet<string>,
): { fromEntry: JournalPrompt[]; rest: JournalPrompt[] } {
  const fromEntry: JournalPrompt[] = [];
  const rest: JournalPrompt[] = [];
  for (const prompt of prompts) {
    const linked =
      prompt.bucket === "meditation" ||
      (prompt.refId ? linkedRefIds.has(prompt.refId) : false);
    if (linked && prompt.bucket !== "topic") fromEntry.push(prompt);
    else rest.push(prompt);
  }
  return { fromEntry, rest };
}

export function journalPromptBlockHtml(prompt: {
  id: string;
  template: string;
  name?: string;
}): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const name = prompt.name?.trim() ?? "";
  return `<p></p><div data-journal-prompt="1" data-prompt-id="${esc(prompt.id)}" data-template="${esc(prompt.template)}" data-name="${esc(name)}" data-collapsed="0"><p></p></div><p></p>`;
}
