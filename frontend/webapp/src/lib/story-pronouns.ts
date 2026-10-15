/**
 * Story / manifesto third-person pronouns from account settings.
 */

export type AccountPronouns = "she_her" | "he_him" | "they_them";

export type StoryPronounBundle = {
  id: AccountPronouns;
  /** she / he / they */
  subject: string;
  /** her / him / them */
  object: string;
  /** her / his / their */
  possessive: string;
  /** hers / his / theirs */
  possessivePronoun: string;
  /** herself / himself / themselves */
  reflexive: string;
  /** she/her */
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
};

export const ACCOUNT_PRONOUNS: AccountPronouns[] = [
  "she_her",
  "he_him",
  "they_them",
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
  const p = storyPronounBundle(pronouns);
  return (
    `PRONOUNS (required): Refer to ${name} with ${p.label} only ` +
    `(subject “${p.subject}”, object “${p.object}”, possessive “${p.possessive}” / “${p.possessivePronoun}”, ` +
    `reflexive “${p.reflexive}”). ` +
    `Example: “${name} wakes each morning… ${p.subject} feels… friends describe ${p.object} as…”. ` +
    `Never guess gender from the name. Never switch to other gendered pronouns.`
  );
}
