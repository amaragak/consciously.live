import type { HealType } from "@/lib/heal-store";

export const HEAL_TYPES: { id: HealType; label: string }[] = [
  { id: "grief", label: "Grief" },
  { id: "heartbreak", label: "Heartbreak" },
  { id: "regret", label: "Regret" },
  { id: "resentment", label: "Resentment" },
  { id: "pattern", label: "Pattern" },
  { id: "recurring_thought", label: "Thought" },
  { id: "belief", label: "Belief" },
  { id: "fear", label: "Fear" },
  { id: "shame", label: "Shame" },
  { id: "other", label: "Other" },
];

export function healTypeLabel(type: HealType): string {
  return HEAL_TYPES.find((row) => row.id === type)?.label ?? "Other";
}

export type HealPrompt = { key: string; label: string };

const PROMPTS: Record<HealType, HealPrompt[]> = {
  grief: [
    { key: "what_i_miss", label: "What I miss" },
    { key: "never_said", label: "What I never got to say" },
    { key: "grateful", label: "What I'm grateful for" },
    { key: "keep", label: "What I want to keep" },
  ],
  heartbreak: [
    { key: "what_i_miss", label: "What I miss" },
    { key: "wont_miss", label: "What I won't miss" },
    { key: "learned", label: "What I learned" },
    { key: "next_time", label: "What I want next time" },
  ],
  regret: [
    { key: "what_happened", label: "What happened" },
    { key: "differently", label: "What I'd do differently" },
    { key: "tell_myself", label: "What I'd tell myself then" },
    { key: "still_do", label: "What I can still do" },
  ],
  resentment: [
    { key: "what_happened", label: "What happened" },
    { key: "cost", label: "What it cost me" },
    { key: "let_go", label: "What I need to let go of" },
    { key: "want_now", label: "What I want for myself now" },
  ],
  pattern: [
    { key: "shows_up", label: "When it shows up" },
    { key: "protects", label: "What it protects me from" },
    { key: "started", label: "Where it started" },
    { key: "instead", label: "What I'd do instead" },
  ],
  recurring_thought: [
    { key: "comes_up", label: "When it comes up" },
    { key: "telling", label: "What it's telling me" },
    { key: "protects", label: "What it's trying to protect" },
    { key: "also_true", label: "What's also true" },
  ],
  belief: [
    { key: "learned", label: "Where I learned it" },
    { key: "cost", label: "What it's cost me" },
    { key: "wasnt_true", label: "Times it wasn't true" },
    { key: "instead", label: "What I'd believe instead" },
  ],
  fear: [
    { key: "afraid", label: "What I'm afraid of" },
    { key: "control", label: "What's in my control" },
    { key: "help", label: "What would help" },
  ],
  shame: [
    { key: "what_happened", label: "What happened" },
    { key: "tell_myself", label: "What I tell myself" },
    { key: "forgive", label: "What forgiveness would mean" },
    { key: "keep", label: "What I want to keep" },
  ],
  other: [
    { key: "afraid", label: "What I'm afraid of" },
    { key: "control", label: "What's in my control" },
    { key: "help", label: "What would help" },
  ],
};

export function promptsForType(type: HealType): HealPrompt[] {
  return PROMPTS[type];
}

export function promptLabel(type: HealType, key: string | null): string | null {
  if (!key) return null;
  if (key === "notice_name") return "Notice it, name it";
  if (key === "if_then") return "If-then plan";
  if (key === "evidence") return "Look at the evidence";
  if (key === "compassion") return "Self-compassion break";
  return promptsForType(type).find((row) => row.key === key)?.label ?? null;
}

/** Memory prompts never get a suggestion. */
export function promptAllowsSuggestion(key: string | null): boolean {
  if (!key) return false;
  return (
    key === "still_do" ||
    key === "want_now" ||
    key === "next_time" ||
    key === "help" ||
    key === "control"
  );
}

export type HealPractice = {
  id: "friend" | "compassion" | "write15" | "values" | "type" | "notice" | "ifthen";
  title: string;
  meta: string;
};

export function practicesForType(type: HealType): HealPractice[] {
  const specific: HealPractice =
    type === "grief"
      ? { id: "type", title: "Gratitude for them", meta: "A few lines" }
      : type === "heartbreak"
        ? { id: "type", title: "What I want next time", meta: "A few lines" }
        : type === "regret"
          ? { id: "type", title: "What I can still do", meta: "A few lines" }
          : type === "resentment"
            ? { id: "type", title: "What I want for myself now", meta: "A few lines" }
            : type === "pattern"
              ? { id: "notice", title: "Notice it, name it", meta: "3 min" }
              : { id: "type", title: "What's in my control", meta: "A few lines" };
  const rows: HealPractice[] = [
    { id: "friend", title: "If a friend were carrying this", meta: "5 min" },
    { id: "compassion", title: "Self-compassion break", meta: "3 min" },
    { id: "write15", title: "Write for 15 minutes", meta: "4 days" },
    specific,
  ];
  if (type === "pattern") {
    rows.push({ id: "ifthen", title: "If-then plan", meta: "2 min" });
  }
  return rows;
}

export function typePracticePrompt(type: HealType): HealPrompt {
  if (type === "grief") return { key: "grateful", label: "Gratitude for them" };
  if (type === "heartbreak") return { key: "next_time", label: "What I want next time" };
  if (type === "regret") return { key: "still_do", label: "What I can still do" };
  if (type === "resentment") return { key: "want_now", label: "What I want for myself now" };
  if (type === "pattern") return { key: "instead", label: "What I'd do instead" };
  return { key: "control", label: "What's in my control" };
}

export type CompassionStep = { title: string; body: string };

export function compassionSteps(type: HealType): CompassionStep[] {
  const sharedThird = {
    title: "What do I need right now? May I be kind to myself.",
    body: "You don't have to sort the whole thing out. Ask what would help in the next hour. May I be kind to myself.",
  };
  if (type === "grief") {
    return [
      {
        title: "This is really hard.",
        body: "Missing them, and the life you had with them, hurts. You don't have to make it smaller than it is.",
      },
      {
        title: "Other people feel this too.",
        body: "Losing someone you love, and wishing you'd done something differently, is one of the most common human experiences there is. You're not the only one feeling this right now.",
      },
      sharedThird,
    ];
  }
  if (type === "heartbreak") {
    return [
      {
        title: "This is really hard.",
        body: "A relationship ending can leave a hole that ordinary days fall into. It is allowed to hurt.",
      },
      {
        title: "Other people feel this too.",
        body: "Heartbreak, and the habit of reaching for someone who isn't there, is something a great many people are carrying right now.",
      },
      sharedThird,
    ];
  }
  if (type === "regret") {
    return [
      {
        title: "This is really hard.",
        body: "Wishing you had done something differently is a heavy thing to sit with.",
      },
      {
        title: "Other people feel this too.",
        body: "Almost everyone carries a moment they would redo. You are not the only one who wishes a day had gone another way.",
      },
      sharedThird,
    ];
  }
  if (type === "pattern" || type === "recurring_thought" || type === "belief") {
    return [
      {
        title: "This is really hard.",
        body:
          type === "belief"
            ? "Living inside a belief that holds you back is tiring. You don't have to pretend it isn't there."
            : type === "recurring_thought"
              ? "A thought that keeps coming back takes up a lot of room. You don't have to pretend you've already answered it."
              : "Falling into the same pattern again is discouraging. You don't have to pretend you've already left it behind.",
      },
      {
        title: "Other people feel this too.",
        body: "Falling back into old habits when you're under pressure is how people work. It doesn't mean you haven't changed.",
      },
      sharedThird,
    ];
  }
  if (type === "resentment") {
    return [
      {
        title: "This is really hard.",
        body: "Being hurt by someone, and still feeling it, takes up a lot of room.",
      },
      {
        title: "Other people feel this too.",
        body: "Plenty of people are living with anger that didn't get a fair ending. You are not strange for still feeling it.",
      },
      {
        title: sharedThird.title,
        body: "Letting go, if you choose it, is for your own sake. It doesn't mean what happened was fine. May I be kind to myself while this is still here.",
      },
    ];
  }
  return [
    {
      title: "This is really hard.",
      body: "Carrying this for a long time is tiring. You don't have to pretend it is light.",
    },
    {
      title: "Other people feel this too.",
      body: "Fear, and the things we can't quite put down, are part of a lot of people's days. You are not alone in this.",
    },
    sharedThird,
  ];
}

export function friendQuestion(type: HealType): string {
  return `What would you say to a friend who ${friendSituation(type)}?`;
}

export function friendSituation(type: HealType): string {
  if (type === "grief") return "had lost someone they love";
  if (type === "heartbreak") return "was heartbroken";
  if (type === "regret") return "was stuck in a regret";
  if (type === "pattern") return "kept falling into the same pattern";
  if (type === "recurring_thought") return "couldn't shake a thought that kept coming back";
  if (type === "belief") return "was held back by a belief";
  if (type === "resentment") return "was still angry about something that hurt them";
  if (type === "fear") return "was afraid of something that wouldn't leave them alone";
  return "was carrying something heavy";
}

export const HEAL_LENSES: { id: "kind" | "forgive" | "accept" | "gave"; label: string }[] = [
  { id: "kind", label: "Be kind to myself" },
  { id: "forgive", label: "Forgive" },
  { id: "accept", label: "Accept" },
  { id: "gave", label: "What it gave me" },
];
