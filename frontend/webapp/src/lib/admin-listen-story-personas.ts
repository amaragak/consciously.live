import type { AccountPronouns } from "@/lib/story-pronouns";

/** Three house personas for Admin Listen example stories (no new accounts). */
export type AdminListenStoryPersona = {
  id: string;
  firstName: string;
  pronouns: AccountPronouns;
  blurb: string;
};

export const ADMIN_LISTEN_STORY_PERSONAS: readonly AdminListenStoryPersona[] = [
  {
    id: "maya",
    firstName: "Maya",
    pronouns: "she_her",
    blurb: "Creative founder energy — warm, vivid, present-tense.",
  },
  {
    id: "jordan",
    firstName: "Jordan",
    pronouns: "they_them",
    blurb: "Ambitious builder — clear craft, steady confidence.",
  },
  {
    id: "marcus",
    firstName: "Marcus",
    pronouns: "he_him",
    blurb: "Grounded family / craft life — rich detail, soft power.",
  },
] as const;
