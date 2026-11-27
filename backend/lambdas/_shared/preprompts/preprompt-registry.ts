/**
 * Registry of script-generation pre-prompts and style guides (Admin › Pre-prompts).
 *
 * Repo files are the DEFAULTS (deploy seeds them into Dynamo as versions).
 * - Pre-prompts: ./defaults/*.txt
 * - Style guides: ../style-instructions/*.md (not duplicated)
 *
 * This module is pure (no fs / no Dynamo) so Lambdas can import it freely.
 * Runtime fallback text lives in ./preprompt-defaults-data.ts.
 */

export type PrepromptGroup = "preprompt" | "style_guide" | "dataset";

export type PrepromptRegistryEntry = {
  id: string;
  name: string;
  /** One line: where this text is used. */
  description: string;
  group: PrepromptGroup;
  /** Path relative to backend/lambdas/_shared. */
  repoRelativePath: string;
  /** Tokens the code fills in, e.g. `{{speechMinLabel}}`. Saves must keep them. */
  requiredPlaceholders: string[];
  sortOrder: number;
  /** Style guides only: meditation type name (STYLE_GUIDE_BY_TYPE key). */
  meditationType?: string;
};

/** Stable ids for the pre-prompts the Create (silence-words) prompt reads. */
export const PREPROMPT_ID = {
  systemPrefix: "silence-words-system-prefix",
  personalization: "silence-words-personalization",
  gender: "silence-words-gender",
  pauseRules: "time-based-pause-prompt-rules",
  openSitsOptionDescription: "open-sits-option-description",
  skeletonTask: "skeleton-script-task",
} as const;

export type PrepromptIdKey = keyof typeof PREPROMPT_ID;

/** Harvester datasets (versioned like text entries, but JSON; no repo file). */
export const DATASET_ID = {
  pacingProfiles: "dataset-pacing-profiles",
  skeletonLibrary: "dataset-skeleton-library",
  deliveryFingerprints: "dataset-delivery-fingerprints",
} as const;

export type DatasetId = (typeof DATASET_ID)[keyof typeof DATASET_ID];

export function isDatasetId(id: string): id is DatasetId {
  return (Object.values(DATASET_ID) as string[]).includes(id);
}

export const OPEN_SITS_PLACEHOLDERS = [
  "{{speechMinLabel}}",
  "{{scriptMinLabel}}",
] as const;

export const SKELETON_TASK_PLACEHOLDERS = [
  "{{skeleton}}",
  "{{totalWords}}",
  "{{passageCount}}",
] as const;

export const STYLE_GUIDES: Array<{ type: string; slug: string }> = [
  { type: "Body scan", slug: "body-scan" },
  { type: "Visualization", slug: "visualization" },
  { type: "Breath-led", slug: "breath-led" },
  { type: "Manifestation", slug: "manifestation" },
  { type: "Affirmation loop", slug: "affirmation-loop" },
  { type: "Story", slug: "story" },
  { type: "Reflection", slug: "reflection" },
  { type: "Sleep", slug: "sleep" },
  { type: "Loving-kindness", slug: "loving-kindness" },
  { type: "Anxiety relief", slug: "anxiety-relief" },
  { type: "Movement meditation", slug: "movement-meditation" },
  { type: "Open awareness", slug: "open-awareness" },
];

/** Relative to backend/lambdas/_shared (like every repoRelativePath). */
export const HARVESTER_BUNDLE_REPO_PATH =
  "../../../tools/meditation-harvester/output/consciously-import.json";

export function styleGuideEntryId(slug: string): string {
  return `style-guide-${slug}`;
}

export const PREPROMPT_REGISTRY: PrepromptRegistryEntry[] = [
  {
    id: PREPROMPT_ID.systemPrefix,
    name: "Script writer: system rules",
    description:
      "Create script call, system prompt: scriptwriter role, product mentions, playful briefs, safety.",
    group: "preprompt",
    repoRelativePath: "preprompts/defaults/silence-words-system-prefix.txt",
    requiredPlaceholders: [],
    sortOrder: 10,
  },
  {
    id: PREPROMPT_ID.personalization,
    name: "Personalization rules",
    description:
      "Create script call, system prompt: keep the creator's concrete details in the spoken script.",
    group: "preprompt",
    repoRelativePath: "preprompts/defaults/silence-words-personalization.txt",
    requiredPlaceholders: [],
    sortOrder: 20,
  },
  {
    id: PREPROMPT_ID.gender,
    name: "Gender-neutral language rules",
    description:
      "Create script call, system prompt: no invented genders for the listener or imagery.",
    group: "preprompt",
    repoRelativePath: "preprompts/defaults/silence-words-gender.txt",
    requiredPlaceholders: [],
    sortOrder: 30,
  },
  {
    id: PREPROMPT_ID.pauseRules,
    name: "Pause marker rules",
    description:
      "Create script call, system prompt: how to write <N> and <x N> pauses, cues before silence, spoken timings.",
    group: "preprompt",
    repoRelativePath: "preprompts/defaults/time-based-pause-prompt-rules.txt",
    requiredPlaceholders: [],
    sortOrder: 40,
  },
  {
    id: PREPROMPT_ID.skeletonTask,
    name: "Skeleton script task",
    description:
      "Create script call, task block: write new words into the style's scaled skeleton (passages, roles, word targets, pauses).",
    group: "preprompt",
    repoRelativePath: "preprompts/defaults/skeleton-script-task.txt",
    requiredPlaceholders: [...SKELETON_TASK_PLACEHOLDERS],
    sortOrder: 45,
  },
  {
    id: PREPROMPT_ID.openSitsOptionDescription,
    name: "Open sit: delivery description",
    // Was: "Create script call, task block: how an open sit is shaped (opening, mostly silence, cues, close, tone)."
    description:
      "Not used by Create (pacing now comes from the style's skeleton). Kept for history and the legacy silence-words writer.",
    group: "preprompt",
    repoRelativePath: "preprompts/defaults/open-sits-option-description.txt",
    requiredPlaceholders: [...OPEN_SITS_PLACEHOLDERS],
    sortOrder: 50,
  },
  ...STYLE_GUIDES.map(
    ({ type, slug }, i): PrepromptRegistryEntry => ({
      id: styleGuideEntryId(slug),
      name: `${type} style guide`,
      description: `Create script call, system prompt: writer's guide appended when the style is "${type}".`,
      group: "style_guide",
      repoRelativePath: `style-instructions/${slug}.md`,
      requiredPlaceholders: [],
      sortOrder: 100 + i * 10,
      meditationType: type,
    }),
  ),
  {
    id: DATASET_ID.pacingProfiles,
    name: "Pacing profiles",
    description:
      "Create: per-style pacing from the harvester (fallback skeleton when a style has none). Read-only; imported.",
    group: "dataset",
    repoRelativePath: HARVESTER_BUNDLE_REPO_PATH,
    requiredPlaceholders: [],
    sortOrder: 300,
  },
  {
    id: DATASET_ID.skeletonLibrary,
    name: "Skeleton library",
    description:
      "Create: real meditation timelines per style (passages, roles, pauses). Each script follows one, scaled to length.",
    group: "dataset",
    repoRelativePath: HARVESTER_BUNDLE_REPO_PATH,
    requiredPlaceholders: [],
    sortOrder: 310,
  },
  {
    id: DATASET_ID.deliveryFingerprints,
    name: "Delivery fingerprints",
    description:
      "Create: how each style is delivered (usual opening/closing moves, delivery ratings, voice, phrase families). Compact version goes into the script call; also scores each script.",
    group: "dataset",
    repoRelativePath: HARVESTER_BUNDLE_REPO_PATH,
    requiredPlaceholders: [],
    sortOrder: 320,
  },
];

/**
 * Harvester style key → app meditation type. Keys are the registry slugs; also
 * accepts labels and snake/space variants. Null = unknown (rejected on import).
 */
export function meditationTypeForHarvesterKey(raw: string): string | null {
  const k = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (!k) return null;
  const hit = STYLE_GUIDES.find(
    (s) => s.slug === k || s.type.toLowerCase().replace(/\s+/g, "-") === k,
  );
  return hit?.type ?? null;
}

export function harvesterSlugForMeditationType(
  meditationType: string | null | undefined,
): string | null {
  const t = (meditationType ?? "").trim();
  return STYLE_GUIDES.find((s) => s.type === t)?.slug ?? null;
}

const BY_ID = new Map(PREPROMPT_REGISTRY.map((e) => [e.id, e]));

export function getRegistryEntry(id: string): PrepromptRegistryEntry | null {
  return BY_ID.get(id) ?? null;
}

/** Entry id for a canonical meditation type name (e.g. "Body scan"). */
export function styleGuideEntryIdForType(
  meditationType: string | null | undefined,
): string | null {
  const t = (meditationType ?? "").trim();
  if (!t) return null;
  const hit = PREPROMPT_REGISTRY.find(
    (e) => e.group === "style_guide" && e.meditationType === t,
  );
  return hit?.id ?? null;
}

/** Normalise text before hashing / storing / sending to the model. */
export function normalizePrepromptText(text: string): string {
  return (text ?? "").replace(/\r\n/g, "\n").trim();
}

/** Replace `{{name}}` tokens. Unknown tokens are left as-is. */
export function fillPrepromptPlaceholders(
  text: string,
  values: Record<string, string | number>,
): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : whole,
  );
}

/** Required placeholders missing from `text` (empty array = ok). */
export function missingRequiredPlaceholders(
  entry: Pick<PrepromptRegistryEntry, "requiredPlaceholders">,
  text: string,
): string[] {
  return entry.requiredPlaceholders.filter((p) => !text.includes(p));
}

/** Sample values for Admin preview (no model call). */
export const PREPROMPT_SAMPLE_PLACEHOLDERS: Record<string, string> = {
  speechMinLabel: "2:00",
  scriptMinLabel: "10",
  styleLabel: "Visualization",
  totalWords: "560",
  passageCount: "12",
  skeleton: "(scaled skeleton: blocks of numbered passages with role, phase, word target and the pause after each)",
};
