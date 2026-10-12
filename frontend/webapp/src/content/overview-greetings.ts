/**
 * Feature-specific greeting pools for Meditate / Journal overview pages.
 * One line per calendar day (deterministic). Edit freely.
 */

export type OverviewGreetingLine = {
  title: string;
  /** Desktop / default subline. */
  subline: string;
  /** Shorter mobile subline when different; omit to reuse `subline`. */
  sublineMobile?: string;
};

export const MEDITATE_OVERVIEW_GREETINGS: OverviewGreetingLine[] = [
  {
    title: "Ready to settle in, {name}?",
    subline: "Pick up where you left off, or make something new for today.",
    sublineMobile: "Pick up where you left off, or make something new.",
  },
  {
    title: "A few quiet minutes, {name}?",
    subline: "Play something you've made, or shape one for right now.",
  },
  {
    title: "Make some space today, {name}.",
    subline: "Your meditations, programs and sounds, all in one place.",
  },
  {
    title: "What would help right now, {name}?",
    subline: "Something to settle, or something to spark.",
  },
];

export const JOURNAL_OVERVIEW_GREETINGS: OverviewGreetingLine[] = [
  {
    title: "What's on your mind, {name}?",
    subline: "Write it, say it, or just note one good thing.",
    sublineMobile: "Write it, say it, or note one good thing.",
  },
  {
    title: "How's today really going, {name}?",
    subline: "A few honest lines is plenty.",
  },
  {
    title: "Room to think, {name}.",
    subline: "Get it out of your head and onto the page.",
  },
  {
    title: "What's worth remembering today, {name}?",
    subline: "Big or small, it all counts here.",
  },
];

/** Fixed greeting when Journal has no entries and no insights. */
export const JOURNAL_OVERVIEW_EMPTY_GREETING: OverviewGreetingLine = {
  title: "Your journal starts here, {name}.",
  subline: "A space to think out loud. Nothing here has to be polished.",
  sublineMobile: "A space to think out loud.",
};

/** Stable day key for rotation (local calendar date). */
export function overviewGreetingDayKey(date: Date = new Date()): number {
  return (
    date.getFullYear() * 10_000 +
    (date.getMonth() + 1) * 100 +
    date.getDate()
  );
}

export function pickOverviewGreeting(
  pool: OverviewGreetingLine[],
  date: Date = new Date(),
): OverviewGreetingLine {
  if (pool.length === 0) {
    return { title: "", subline: "" };
  }
  const i = overviewGreetingDayKey(date) % pool.length;
  return pool[i]!;
}

/** Insert first name, or drop the comma+name when missing. */
export function formatOverviewGreetingTitle(
  template: string,
  firstName: string | null,
): string {
  const name = firstName?.trim() || null;
  if (name) return template.split("{name}").join(name);
  return template
    .replace(/,\s*\{name\}/g, "")
    .replace(/\s*\{name\}/g, "")
    .split("{name}")
    .join("");
}
