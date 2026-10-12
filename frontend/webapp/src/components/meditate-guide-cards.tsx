import { Link } from "@/lib/spa-nav";
import {
  guidesBasePath,
  type Guide,
  type GuideArea,
} from "@/content/guides";

function GuideCategory({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link">
      {label}
    </span>
  );
}

function guideHref(area: GuideArea, slug: string): string {
  return `${guidesBasePath(area)}/${slug}`;
}

/** Desktop / index grid card. */
export function MeditateGuideCard({
  guide,
  area = "meditate",
}: {
  guide: Guide;
  area?: GuideArea;
}) {
  return (
    <Link
      href={guideHref(area, guide.slug)}
      className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-card transition-opacity hover:opacity-95"
    >
      <div className="h-[110px] w-full shrink-0 overflow-hidden bg-accent-soft/40">
        <img
          src={guide.image}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
        <GuideCategory label={guide.category} />
        <span className="line-clamp-2 font-display text-base leading-[1.3] text-foreground">
          {guide.title}
        </span>
        <span className="text-xs text-muted">{guide.readMinutes} min read</span>
      </div>
    </Link>
  );
}

/** Mobile list row (inside a shared card). */
export function MeditateGuideListRow({
  guide,
  area = "meditate",
  bordered,
}: {
  guide: Guide;
  area?: GuideArea;
  bordered?: boolean;
}) {
  return (
    <Link
      href={guideHref(area, guide.slug)}
      className={`flex items-center gap-3 px-3 py-2.5 transition-opacity hover:opacity-95 ${
        bordered ? "border-t border-border" : ""
      }`}
    >
      <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-accent-soft/40">
        <img
          src={guide.image}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <GuideCategory label={guide.category} />
        <span className="font-display text-[15px] leading-[1.3] text-foreground">
          {guide.title}
        </span>
        <span className="text-[11px] text-muted">
          {guide.readMinutes} min read
        </span>
      </span>
    </Link>
  );
}

export function MeditateGuidesGrid({
  guides,
  area = "meditate",
}: {
  guides: Guide[];
  area?: GuideArea;
}) {
  return (
    <>
      <div className="hidden grid-cols-4 gap-3.5 md:grid">
        {guides.map((g) => (
          <MeditateGuideCard key={g.slug} guide={g} area={area} />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card md:hidden">
        {guides.map((g, i) => (
          <MeditateGuideListRow
            key={g.slug}
            guide={g}
            area={area}
            bordered={i > 0}
          />
        ))}
      </div>
    </>
  );
}
