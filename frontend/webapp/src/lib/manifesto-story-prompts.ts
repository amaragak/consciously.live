/**
 * Manifesto Story prompt library — templates with optional {name} slots,
 * balanced unused order, and filter helpers.
 */

export type StoryPromptTopicKey =
  | "who"
  | "feel"
  | "people"
  | "home"
  | "work"
  | "body"
  | "money"
  | "rhythm";

export type StoryPromptTopicId = "all" | StoryPromptTopicKey;

export type StoryPromptBucket = "start" | "topic" | "area" | "value";

export type StoryPromptTopic = {
  id: StoryPromptTopicId;
  label: string;
};

export const STORY_PROMPT_TOPICS: readonly StoryPromptTopic[] = [
  { id: "all", label: "All" },
  { id: "who", label: "Who you are" },
  { id: "feel", label: "How you feel" },
  { id: "people", label: "People" },
  { id: "home", label: "Home" },
  { id: "work", label: "Work" },
  { id: "body", label: "Body" },
  { id: "money", label: "Money" },
  { id: "rhythm", label: "Daily rhythm" },
] as const;

export const STORY_TOPIC_KEYS: readonly StoryPromptTopicKey[] = [
  "who",
  "feel",
  "people",
  "home",
  "work",
  "body",
  "money",
  "rhythm",
] as const;

export type StoryPromptTemplate = {
  id: string;
  bucket: StoryPromptBucket;
  topic?: StoryPromptTopicKey;
  template: string;
};

/** One concrete prompt shown in the list (area/value templates expanded). */
export type StoryPrompt = {
  id: string;
  bucket: StoryPromptBucket;
  topic?: StoryPromptTopicKey;
  template: string;
  /** Rendered plain text (label text in the editor). */
  text: string;
  /** Life area or value id when bucket is area/value. */
  refId?: string;
  /** Display name that replaced `{name}`. */
  name?: string;
};

export type StoryPromptFilter =
  | { kind: "all" }
  | { kind: "topic"; topic: StoryPromptTopicKey }
  | { kind: "area"; refId: string }
  | { kind: "value"; refId: string };

type StoryPromptTemplateDef = {
  id: string;
  bucket: StoryPromptBucket;
  topic?: StoryPromptTopicKey;
  template: string;
};

const START: readonly StoryPromptTemplateDef[] = [
  {
    id: "start-here",
    bucket: "start",
    template:
      "Everything worked out, and then some. What does your life look like now?",
  },
];

const TOPICS: readonly StoryPromptTemplateDef[] = [
  { id: "who-1", bucket: "topic", topic: "who", template: "What are you known for?" },
  {
    id: "who-2",
    bucket: "topic",
    topic: "who",
    template: "How would your friends describe you now?",
  },
  { id: "who-3", bucket: "topic", topic: "who", template: "What are you proud of?" },
  {
    id: "who-4",
    bucket: "topic",
    topic: "who",
    template: "What do you no longer put up with?",
  },
  {
    id: "who-5",
    bucket: "topic",
    topic: "who",
    template: "What do you believe about yourself now?",
  },

  {
    id: "feel-1",
    bucket: "topic",
    topic: "feel",
    template: "How do you feel when you wake up?",
  },
  {
    id: "feel-2",
    bucket: "topic",
    topic: "feel",
    template: "How do you feel on a normal day?",
  },
  {
    id: "feel-3",
    bucket: "topic",
    topic: "feel",
    template: "What used to stress you that doesn't now?",
  },
  {
    id: "feel-4",
    bucket: "topic",
    topic: "feel",
    template: "When do you feel most at ease?",
  },
  {
    id: "feel-5",
    bucket: "topic",
    topic: "feel",
    template: "What makes you laugh these days?",
  },

  {
    id: "people-1",
    bucket: "topic",
    topic: "people",
    template: "Who are the people closest to you now?",
  },
  {
    id: "people-2",
    bucket: "topic",
    topic: "people",
    template: "How do you treat the people closest to you?",
  },
  {
    id: "people-3",
    bucket: "topic",
    topic: "people",
    template: "Who do you spend most of your time with?",
  },
  {
    id: "people-4",
    bucket: "topic",
    topic: "people",
    template: "What do people come to you for?",
  },
  {
    id: "people-5",
    bucket: "topic",
    topic: "people",
    template: "Who have you helped, and how?",
  },

  { id: "home-1", bucket: "topic", topic: "home", template: "Where do you live now?" },
  { id: "home-2", bucket: "topic", topic: "home", template: "Describe your home." },
  {
    id: "home-3",
    bucket: "topic",
    topic: "home",
    template: "What do you see when you look out of the window?",
  },
  {
    id: "home-4",
    bucket: "topic",
    topic: "home",
    template: "What's your favourite place at home?",
  },
  { id: "home-5", bucket: "topic", topic: "home", template: "Who lives with you?" },

  {
    id: "work-1",
    bucket: "topic",
    topic: "work",
    template: "What do you do for work now?",
  },
  {
    id: "work-2",
    bucket: "topic",
    topic: "work",
    template: "What does a normal working day look like?",
  },
  { id: "work-3", bucket: "topic", topic: "work", template: "Who do you work with?" },
  {
    id: "work-4",
    bucket: "topic",
    topic: "work",
    template: "What are you most proud of at work?",
  },
  {
    id: "work-5",
    bucket: "topic",
    topic: "work",
    template: "How much do you work, and when do you stop?",
  },

  {
    id: "body-1",
    bucket: "topic",
    topic: "body",
    template: "How does your body feel now?",
  },
  {
    id: "body-2",
    bucket: "topic",
    topic: "body",
    template: "What do you eat on a normal day?",
  },
  {
    id: "body-3",
    bucket: "topic",
    topic: "body",
    template: "How do you move your body each week?",
  },
  { id: "body-4", bucket: "topic", topic: "body", template: "How do you sleep?" },
  {
    id: "body-5",
    bucket: "topic",
    topic: "body",
    template: "What can your body do now that it couldn't before?",
  },

  {
    id: "money-1",
    bucket: "topic",
    topic: "money",
    template: "How much do you earn now?",
  },
  {
    id: "money-2",
    bucket: "topic",
    topic: "money",
    template: "What does money let you do now?",
  },
  {
    id: "money-3",
    bucket: "topic",
    topic: "money",
    template: "How do you feel when you check your bank balance?",
  },
  {
    id: "money-4",
    bucket: "topic",
    topic: "money",
    template: "What have you bought that you used to only want?",
  },
  {
    id: "money-5",
    bucket: "topic",
    topic: "money",
    template: "What do you give away, and to whom?",
  },

  {
    id: "rhythm-1",
    bucket: "topic",
    topic: "rhythm",
    template: "What does your morning look like?",
  },
  {
    id: "rhythm-2",
    bucket: "topic",
    topic: "rhythm",
    template: "What does a normal weekday look like, start to finish?",
  },
  {
    id: "rhythm-3",
    bucket: "topic",
    topic: "rhythm",
    template: "What do you do in the evenings?",
  },
  {
    id: "rhythm-4",
    bucket: "topic",
    topic: "rhythm",
    template: "What does a perfect weekend look like?",
  },
  {
    id: "rhythm-5",
    bucket: "topic",
    topic: "rhythm",
    template: "What do you do every day without fail?",
  },
];

const AREA_TEMPLATES: readonly StoryPromptTemplateDef[] = [
  {
    id: "area-achieved",
    bucket: "area",
    template: "What have you achieved in {name}?",
  },
  {
    id: "area-week",
    bucket: "area",
    template: "What does a normal week of {name} involve now?",
  },
  {
    id: "area-feel",
    bucket: "area",
    template: "How do you feel about {name} now?",
  },
  {
    id: "area-best",
    bucket: "area",
    template: "What's the best thing that's happened in {name} so far?",
  },
  {
    id: "area-who",
    bucket: "area",
    template: "Who else is involved in {name}, and what do they say about it?",
  },
];

const VALUE_TEMPLATES: readonly StoryPromptTemplateDef[] = [
  {
    id: "value-look",
    bucket: "value",
    template: "What does {name} look like in your life now?",
  },
  {
    id: "value-do",
    bucket: "value",
    template: "What do you do now because {name} matters to you?",
  },
  {
    id: "value-room",
    bucket: "value",
    template: "What did you change in your life to make room for {name}?",
  },
  {
    id: "value-work",
    bucket: "value",
    template: "How does {name} affect the way you work?",
  },
  {
    id: "value-people",
    bucket: "value",
    template: "How does {name} affect the way you treat people?",
  },
];

export function renderPromptTemplate(template: string, name?: string): string {
  if (!name) return template;
  return template.replaceAll("{name}", name);
}

function expandNamed(
  templates: readonly StoryPromptTemplateDef[],
  refs: readonly { id: string; name: string }[],
): StoryPrompt[] {
  const out: StoryPrompt[] = [];
  for (const ref of refs) {
    const name = ref.name.trim();
    if (!name) continue;
    for (const t of templates) {
      out.push({
        id: `${t.id}:${ref.id}`,
        bucket: t.bucket,
        topic: t.topic,
        template: t.template,
        text: renderPromptTemplate(t.template, name),
        refId: ref.id,
        name,
      });
    }
  }
  return out;
}

function asPrompt(t: StoryPromptTemplateDef): StoryPrompt {
  return {
    id: t.id,
    bucket: t.bucket,
    topic: t.topic,
    template: t.template,
    text: t.template,
  };
}

/** Pinned opener — seeded into a new draft. */
export const STORY_OPENER_PROMPT: StoryPrompt = asPrompt(START[0]!);

/** @deprecated Use StoryPrompt — kept for call sites that still say Seed. */
export type StoryPromptSeed = StoryPrompt;

/** Build the full enabled library (before used/filter). */
export function buildStoryPromptLibrary(opts: {
  includeLifeAreas: boolean;
  includeValues: boolean;
  areas: readonly { id: string; title: string }[];
  values: readonly { id: string; text: string }[];
}): StoryPrompt[] {
  const out: StoryPrompt[] = [
    ...START.map(asPrompt),
    ...TOPICS.map(asPrompt),
  ];
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
  return out;
}

function usedCountFor(
  prompts: readonly StoryPrompt[],
  used: ReadonlySet<string>,
  match: (p: StoryPrompt) => boolean,
): number {
  let n = 0;
  for (const p of prompts) {
    if (match(p) && used.has(p.id)) n += 1;
  }
  return n;
}

function sortGroupsByCoverage<T extends { key: string; index: number }>(
  groups: T[],
  usedCounts: Map<string, number>,
): T[] {
  return groups.slice().sort((a, b) => {
    const ua = usedCounts.get(a.key) ?? 0;
    const ub = usedCounts.get(b.key) ?? 0;
    const za = ua === 0 ? 0 : 1;
    const zb = ub === 0 ? 0 : 1;
    if (za !== zb) return za - zb;
    if (ua !== ub) return ua - ub;
    return a.index - b.index;
  });
}

/**
 * Balanced unused order for the All view (and filtered subsets of it).
 * Unknown / removed prompt ids in `usedIds` are ignored for coverage.
 */
export function orderUnusedStoryPrompts(opts: {
  library: readonly StoryPrompt[];
  usedIds: readonly string[];
  filter: StoryPromptFilter;
  areas: readonly { id: string; title: string }[];
  values: readonly { id: string; text: string }[];
  includeLifeAreas: boolean;
  includeValues: boolean;
}): StoryPrompt[] {
  const used = new Set(
    opts.usedIds.filter((id) => opts.library.some((p) => p.id === id)),
  );
  const byId = new Map(opts.library.map((p) => [p.id, p]));

  const matchesFilter = (p: StoryPrompt): boolean => {
    if (opts.filter.kind === "all") return true;
    if (opts.filter.kind === "topic") {
      return p.bucket === "topic" && p.topic === opts.filter.topic;
    }
    if (opts.filter.kind === "area") {
      return p.bucket === "area" && p.refId === opts.filter.refId;
    }
    return p.bucket === "value" && p.refId === opts.filter.refId;
  };

  const unused = opts.library.filter((p) => !used.has(p.id) && matchesFilter(p));
  if (unused.length === 0) return [];

  // Filtered views keep library / balanced order restricted to the filter.
  if (opts.filter.kind !== "all") {
    const orderedAll = balancedOrderAll({
      library: opts.library,
      used,
      areas: opts.areas,
      values: opts.values,
      includeLifeAreas: opts.includeLifeAreas,
      includeValues: opts.includeValues,
    });
    return orderedAll.filter((p) => matchesFilter(p) && !used.has(p.id));
  }

  return balancedOrderAll({
    library: opts.library,
    used,
    areas: opts.areas,
    values: opts.values,
    includeLifeAreas: opts.includeLifeAreas,
    includeValues: opts.includeValues,
  }).filter((p) => byId.has(p.id) && !used.has(p.id));
}

function balancedOrderAll(opts: {
  library: readonly StoryPrompt[];
  used: ReadonlySet<string>;
  areas: readonly { id: string; title: string }[];
  values: readonly { id: string; text: string }[];
  includeLifeAreas: boolean;
  includeValues: boolean;
}): StoryPrompt[] {
  const { library, used } = opts;
  const placed = new Set<string>();
  const out: StoryPrompt[] = [];

  const take = (p: StoryPrompt | undefined) => {
    if (!p || placed.has(p.id) || used.has(p.id)) return;
    placed.add(p.id);
    out.push(p);
  };

  const start = library.find((p) => p.id === "start-here");
  if (start && !used.has(start.id)) take(start);

  const areaIds = opts.includeLifeAreas
    ? opts.areas.filter((a) => a.title.trim()).map((a) => a.id)
    : [];
  const valueIds = opts.includeValues
    ? opts.values.filter((v) => v.text.trim()).map((v) => v.id)
    : [];

  const areaGroups = areaIds.map((id, index) => ({ key: id, index }));
  const valueGroups = valueIds.map((id, index) => ({ key: id, index }));
  const topicGroups = STORY_TOPIC_KEYS.map((key, index) => ({ key, index }));

  const areaUsed = new Map(
    areaGroups.map((g) => [
      g.key,
      usedCountFor(library, used, (p) => p.bucket === "area" && p.refId === g.key),
    ]),
  );
  const valueUsed = new Map(
    valueGroups.map((g) => [
      g.key,
      usedCountFor(
        library,
        used,
        (p) => p.bucket === "value" && p.refId === g.key,
      ),
    ]),
  );
  const topicUsed = new Map(
    topicGroups.map((g) => [
      g.key,
      usedCountFor(
        library,
        used,
        (p) => p.bucket === "topic" && p.topic === g.key,
      ),
    ]),
  );

  const nextFromArea = new Map<string, number>();
  const nextFromValue = new Map<string, number>();
  const nextFromTopic = new Map<string, number>();

  const areaPrompts = (refId: string) =>
    library.filter((p) => p.bucket === "area" && p.refId === refId);
  const valuePrompts = (refId: string) =>
    library.filter((p) => p.bucket === "value" && p.refId === refId);
  const topicPrompts = (topic: StoryPromptTopicKey) =>
    library.filter((p) => p.bucket === "topic" && p.topic === topic);

  const takeNext = (
    list: StoryPrompt[],
    cursor: Map<string, number>,
    key: string,
  ) => {
    let i = cursor.get(key) ?? 0;
    while (i < list.length) {
      const p = list[i]!;
      i += 1;
      cursor.set(key, i);
      if (!placed.has(p.id) && !used.has(p.id)) {
        take(p);
        return true;
      }
    }
    cursor.set(key, i);
    return false;
  };

  let guard = 0;
  const max = library.length + 4;
  while (out.length + used.size < library.length && guard < max) {
    guard += 1;
    let progressed = false;
    for (const g of sortGroupsByCoverage(areaGroups, areaUsed)) {
      if (takeNext(areaPrompts(g.key), nextFromArea, g.key)) progressed = true;
    }
    for (const g of sortGroupsByCoverage(valueGroups, valueUsed)) {
      if (takeNext(valuePrompts(g.key), nextFromValue, g.key)) progressed = true;
    }
    for (const g of sortGroupsByCoverage(topicGroups, topicUsed)) {
      if (
        takeNext(
          topicPrompts(g.key as StoryPromptTopicKey),
          nextFromTopic,
          g.key,
        )
      ) {
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  // Any leftovers (shouldn't happen) keep library order.
  for (const p of library) {
    if (!used.has(p.id) && !placed.has(p.id)) take(p);
  }

  return out;
}

/** Whether any prompt for this area/value has been used (known library ids only). */
export function promptGroupHasCoverage(
  library: readonly StoryPrompt[],
  usedIds: readonly string[],
  kind: "area" | "value",
  refId: string,
): boolean {
  const used = new Set(usedIds);
  return library.some(
    (p) => p.bucket === kind && p.refId === refId && used.has(p.id),
  );
}

/**
 * @deprecated Prefer `orderUnusedStoryPrompts`. Kept as a thin wrapper for
 * older call sites that still pass a topic id.
 */
export function pickStoryPrompts(opts: {
  topic: StoryPromptTopicId;
  includeLifeAreas: boolean;
  includeValues: boolean;
  areas: readonly { id: string; title: string }[];
  values: readonly { id: string; text: string }[];
  seed?: number;
  count?: number;
  usedIds?: readonly string[];
}): StoryPrompt[] {
  const library = buildStoryPromptLibrary(opts);
  const filter: StoryPromptFilter =
    opts.topic === "all"
      ? { kind: "all" }
      : { kind: "topic", topic: opts.topic };
  const ordered = orderUnusedStoryPrompts({
    library,
    usedIds: opts.usedIds ?? [],
    filter,
    areas: opts.areas,
    values: opts.values,
    includeLifeAreas: opts.includeLifeAreas,
    includeValues: opts.includeValues,
  });
  if (opts.count != null) return ordered.slice(0, opts.count);
  return ordered;
}

export function lifeAreaPromptSeeds(
  areas: readonly { id: string; title: string }[],
): StoryPrompt[] {
  return expandNamed(
    AREA_TEMPLATES,
    areas.map((a) => ({ id: a.id, name: a.title })),
  );
}

export function valuePromptSeeds(
  values: readonly { id: string; text: string }[],
): StoryPrompt[] {
  return expandNamed(
    VALUE_TEMPLATES,
    values.map((v) => ({ id: v.id, name: v.text })),
  );
}
