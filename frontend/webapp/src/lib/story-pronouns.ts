/**
 * Story / manifesto third-person pronouns from account settings.
 */

export type AccountPronouns = "she_her" | "he_him" | "they_them" | "by_name";

export type StoryPronounBundle = {
  id: AccountPronouns;
  /** she / he / they (empty when by name) */
  subject: string;
  /** her / him / them */
  object: string;
  /** her / his / their */
  possessive: string;
  /** hers / his / theirs */
  possessivePronoun: string;
  /** herself / himself / themselves */
  reflexive: string;
  /** she/her · by name */
  label: string;
};

const BUNDLES: Record<AccountPronouns, StoryPronounBundle> = {
  she_her: {
    id: "she_her",
    subject: "she",
    object: "her",
    possessive: "her",
    possessivePronoun: "hers",
    reflexive: "herself",
    label: "she/her",
  },
  he_him: {
    id: "he_him",
    subject: "he",
    object: "him",
    possessive: "his",
    possessivePronoun: "his",
    reflexive: "himself",
    label: "he/him",
  },
  they_them: {
    id: "they_them",
    subject: "they",
    object: "them",
    possessive: "their",
    possessivePronoun: "theirs",
    reflexive: "themselves",
    label: "they/them",
  },
  by_name: {
    id: "by_name",
    subject: "",
    object: "",
    possessive: "",
    possessivePronoun: "",
    reflexive: "",
    label: "by name",
  },
};

export const ACCOUNT_PRONOUNS: AccountPronouns[] = [
  "she_her",
  "he_him",
  "they_them",
  "by_name",
];

/** Story setup choices — short spoken forms. */
export const STORY_PRONOUN_CHOICES: { id: AccountPronouns; label: string }[] = [
  { id: "she_her", label: "she" },
  { id: "he_him", label: "he" },
  { id: "they_them", label: "they" },
  { id: "by_name", label: "by name" },
];

export function isAccountPronouns(v: unknown): v is AccountPronouns {
  return typeof v === "string" && (ACCOUNT_PRONOUNS as string[]).includes(v);
}

export function storyPronounBundle(
  pronouns: AccountPronouns | null | undefined,
): StoryPronounBundle {
  if (pronouns && BUNDLES[pronouns]) return BUNDLES[pronouns];
  return BUNDLES.they_them;
}

export function pronounsLabel(pronouns: AccountPronouns): string {
  return storyPronounBundle(pronouns).label;
}

/** Prompt lines for compose / summarize — keep name + pronouns consistent. */
export function storyPronounComposeCue(
  firstName: string,
  pronouns: AccountPronouns | null | undefined,
): string {
  const name = firstName.trim() || "They";
  if (pronouns === "by_name") {
    return (
      `PRONOUNS (required): Refer to the person by name (“${name}”) only. ` +
      `Repeat the name instead of she/he/they. ` +
      `Example: “${name} wakes each morning… ${name} feels… friends describe ${name} as…”. ` +
      `Never guess gender from the name. Never use gendered pronouns.`
    );
  }
  const p = storyPronounBundle(pronouns);
  return (
    `PRONOUNS (required): Refer to ${name} with ${p.label} only ` +
    `(subject “${p.subject}”, object “${p.object}”, possessive “${p.possessive}” / “${p.possessivePronoun}”, ` +
    `reflexive “${p.reflexive}”). ` +
    `Example: “${name} wakes each morning… ${p.subject} feels… friends describe ${p.object} as…”. ` +
    `Never guess gender from the name. Never switch to other gendered pronouns.`
  );
}
