import {
  MeditateMarketingPage,
  type MeditateFeaturedProgram,
} from "@/components/home-v2/meditate-marketing-page";

export const metadata = {
  title: "Meditate",
  description:
    "Personalised guided meditations written from your words — goals, journal, and today’s worries — with voices and soundscapes that actually sound good.",
};

/** ISR — program covers / lesson counts refresh hourly. */
export const revalidate = 3600;

const FEATURED_PROGRAM_TITLES = [
  "Four Directions of Self-Compassion",
  "Confidence Rebuild",
  "Chakra Cleanse",
] as const;

type ProgramRow = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  days: unknown[];
};

function slugifyProgramTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function programUrlSlug(program: ProgramRow, all: ProgramRow[]): string {
  const base = slugifyProgramTitle(program.title);
  const collisions = all.filter((p) => slugifyProgramTitle(p.title) === base);
  if (collisions.length <= 1) return base;
  return `${base}-${program.id.slice(0, 8)}`;
}

function parsePrograms(raw: unknown): ProgramRow[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { programs?: unknown }).programs;
  if (!Array.isArray(list)) return [];
  const out: ProgramRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) continue;
    out.push({
      id,
      title: typeof o.title === "string" ? o.title : "Untitled program",
      coverImageUrl:
        typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
          ? o.coverImageUrl.trim()
          : null,
      days: Array.isArray(o.days) ? o.days : [],
    });
  }
  return out;
}

async function loadFeaturedPrograms(): Promise<MeditateFeaturedProgram[]> {
  const base = (process.env.NEXT_PUBLIC_MEDIMADE_API_URL || "").trim();
  if (!base) return [];
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/library/programs`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error("meditate featured programs", res.status);
      return [];
    }
    const programs = parsePrograms(await res.json());
    const byTitle = new Map(
      programs.map((p) => [p.title.trim().toLowerCase(), p] as const),
    );
    const featured: MeditateFeaturedProgram[] = [];
    for (const title of FEATURED_PROGRAM_TITLES) {
      const hit = byTitle.get(title.toLowerCase());
      if (!hit) continue;
      featured.push({
        id: hit.id,
        title: hit.title,
        lessonCount: hit.days.length,
        coverImageUrl: hit.coverImageUrl,
        href: `/meditate/library/programs/${encodeURIComponent(
          programUrlSlug(hit, programs),
        )}`,
      });
    }
    return featured;
  } catch (e) {
    console.error("meditate featured programs", e);
    return [];
  }
}

export default async function MeditatePage() {
  const featuredPrograms = await loadFeaturedPrograms();
  return <MeditateMarketingPage featuredPrograms={featuredPrograms} />;
}
