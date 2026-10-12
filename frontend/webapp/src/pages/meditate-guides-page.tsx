import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { GuideBody, extractGuideHeadings } from "@/components/guide-body";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import {
  guidesBasePath,
  otherGuides,
  useGuide,
  useGuides,
  type Guide,
  type GuideArea,
} from "@/content/guides";
import { createOneFlowHref } from "@/lib/create-one-flow-state";
import { writeGuidePracticeBrief } from "@/lib/guide-practice-handoff";
import { votePublicGuideHelpful } from "@/lib/medimade-api";
import { Link } from "@/lib/spa-nav";

const PAGE_CLASS =
  "mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4";

const EYEBROW_CLASS =
  "text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link";

const RAIL_CARD_CLASS =
  "flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-[18px] py-4 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]";

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

export function AreaGuidesIndexPage({ area }: { area: GuideArea }) {
  const { guides, loading, error } = useGuides(area);
  return (
    <div className={PAGE_CLASS}>
      <h1 className="sr-only">Guides</h1>
      <div className="mb-3 flex items-baseline justify-between gap-3 max-md:mb-2.5">
        <h2 className="font-display text-[22px] text-foreground max-md:text-xl">
          Guides
        </h2>
      </div>
      {guides.length > 0 ? (
        <MeditateGuidesGrid guides={guides} area={area} />
      ) : loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : error ? (
        <p className="text-sm text-muted">
          Couldn’t load guides. Try again in a moment.
        </p>
      ) : (
        <p className="text-sm text-muted">No guides yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reader helpers
// ---------------------------------------------------------------------------

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
    p = p.parentElement;
  }
  return null;
}

/** Reading progress (0..1) + active heading id, driven by the page scroller. */
function useReadingProgress(
  articleRef: RefObject<HTMLElement | null>,
  headingIds: string[],
  resetKey: string,
) {
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const idsKey = headingIds.join("|");

  useEffect(() => {
    const art = articleRef.current;
    if (!art) return;
    const scroller = findScrollParent(art);
    const ids = idsKey ? idsKey.split("|") : [];

    const update = () => {
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewH = scroller ? scroller.clientHeight : window.innerHeight;
      const r = art.getBoundingClientRect();
      const scrolled = viewTop - r.top;
      const total = Math.max(1, r.height - viewH);
      setProgress(Math.min(1, Math.max(0, scrolled / total)));

      let active: string | null = ids[0] ?? null;
      for (const id of ids) {
        const h = document.getElementById(id);
        if (!h) continue;
        if (h.getBoundingClientRect().top - viewTop <= 140) active = id;
      }
      setActiveId(active);
    };

    update();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [articleRef, idsKey, resetKey]);

  return { progress, activeId };
}

function scrollToHeading(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function splitPracticeBrief(brief: string): { title: string; desc: string } {
  const lines = brief
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { title: lines[0] ?? "", desc: lines.slice(1).join(" ") };
}

function formatUpdated(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function helpfulStorageKey(area: GuideArea, slug: string): string {
  return `mm_guide_helpful_v1:${area}/${slug}`;
}

function readHelpfulVote(area: GuideArea, slug: string): boolean {
  try {
    return window.localStorage.getItem(helpfulStorageKey(area, slug)) != null;
  } catch {
    return false;
  }
}

/** Starts the practice flow for the guide's area. */
function usePracticeAction(guide: Guide, area: GuideArea) {
  const navigate = useNavigate();
  const brief = guide.practiceBrief?.trim() ?? "";
  const { title } = splitPracticeBrief(brief);
  return useCallback(() => {
    if (!brief) return;
    if (area === "meditate") {
      writeGuidePracticeBrief(brief);
      void navigate(createOneFlowHref("start"));
      return;
    }
    void navigate(`/journal/my?new=1&title=${encodeURIComponent(title)}`);
  }, [area, brief, navigate, title]);
}

// ---------------------------------------------------------------------------
// Reader pieces
// ---------------------------------------------------------------------------

function PracticeButton({
  area,
  onClick,
  className,
}: {
  area: GuideArea;
  onClick: () => void;
  className: string;
}) {
  return (
    <PrimaryCreateButton
      leadingPlus={false}
      onClick={onClick}
      className={`${className} w-full rounded-full!`}
    >
      {area === "meditate" ? "✦ Make this meditation" : "Write about this"}
    </PrimaryCreateButton>
  );
}

function HelpfulRow({ area, slug }: { area: GuideArea; slug: string }) {
  const [voted, setVoted] = useState(() => readHelpfulVote(area, slug));

  useEffect(() => {
    setVoted(readHelpfulVote(area, slug));
  }, [area, slug]);

  function vote(v: "yes" | "no") {
    setVoted(true);
    try {
      window.localStorage.setItem(helpfulStorageKey(area, slug), v);
    } catch {
      /* private mode — still thank the reader */
    }
    void votePublicGuideHelpful(area, slug, v).catch(() => {
      /* best effort */
    });
  }

  const pill =
    "h-[34px] cursor-pointer whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:border-accent/40";

  return (
    <div className="flex items-center gap-3 border-t border-border pt-[18px] text-sm text-foreground/80">
      {voted ? (
        <span>Thanks</span>
      ) : (
        <>
          Was this helpful?
          <button type="button" className={pill} onClick={() => vote("yes")}>
            Yes
          </button>
          <button type="button" className={pill} onClick={() => vote("no")}>
            Not really
          </button>
        </>
      )}
    </div>
  );
}

function MobileToc({
  headings,
}: {
  headings: { id: string; text: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (headings.length < 2) return null;
  return (
    <div className="rounded-xl border border-border bg-background md:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-3.5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-foreground">
          In this guide
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {headings.length} sections
          <ChevronDown
            aria-hidden
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </span>
      </button>
      {open ? (
        <div className="flex flex-col px-3.5 pb-3">
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => scrollToHeading(h.id)}
              className="cursor-pointer border-l-2 border-border py-1.5 pl-3 text-left text-sm text-foreground/80"
            >
              {h.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MoreGuidesRail({ guides, area }: { guides: Guide[]; area: GuideArea }) {
  if (!guides.length) return null;
  return (
    <div className={RAIL_CARD_CLASS}>
      <span className={EYEBROW_CLASS}>More guides</span>
      <div className="flex flex-col">
        {guides.map((g) => (
          <Link
            key={g.slug}
            href={`${guidesBasePath(area)}/${g.slug}`}
            className="flex items-center gap-2.5 border-t border-border py-2 transition-opacity hover:opacity-90"
          >
            <span className="block size-12 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
              <img src={g.image} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-sm leading-[1.3] text-foreground">
                {g.title}
              </span>
              <span className="text-[11px] text-muted">
                {g.category ? `${g.category} · ` : ""}
                {g.readMinutes} min
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className={PAGE_CLASS}>
      <div className="h-5 w-24 animate-pulse rounded bg-accent-soft" />
      <div className="mt-3.5 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-[280px] animate-pulse bg-accent-soft max-md:h-[180px]" />
        <div className="flex flex-col gap-4 px-11 pb-9 pt-8 max-md:px-[18px] max-md:pb-6 max-md:pt-5">
          <div className="h-3 w-20 animate-pulse rounded bg-accent-soft" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-accent-soft" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-accent-soft" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

export function AreaGuideArticlePage({ area }: { area: GuideArea }) {
  const { slug = "" } = useParams<{ slug: string }>();
  const base = guidesBasePath(area);
  const { guide, loading, notFound, error } = useGuide(area, slug);
  const { guides: areaGuides } = useGuides(area);

  if (notFound) return <Navigate to={base} replace />;
  if (!guide) {
    if (loading) return <ReaderSkeleton />;
    return (
      <div className={PAGE_CLASS}>
        <BackLink href={base} />
        <p className="mt-4 text-sm text-muted">
          {error
            ? "Couldn’t load this guide. Try again in a moment."
            : "Guide not found."}
        </p>
      </div>
    );
  }

  return (
    <GuideReader guide={guide} area={area} base={base} areaGuides={areaGuides} />
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-0.5 text-sm font-semibold text-accent-link transition-opacity hover:opacity-80"
    >
      <ChevronLeft aria-hidden className="size-4" strokeWidth={2} />
      All guides
    </Link>
  );
}

function GuideReader({
  guide,
  area,
  base,
  areaGuides,
}: {
  guide: Guide;
  area: GuideArea;
  base: string;
  areaGuides: Guide[];
}) {
  const body = guide.body ?? "";
  const headings = useMemo(() => extractGuideHeadings(body), [body]);
  const showToc = headings.length >= 2;
  const more = useMemo(
    () => otherGuides(areaGuides, guide.slug, guide.category, 3),
    [areaGuides, guide.slug, guide.category],
  );
  const articleRef = useRef<HTMLElement | null>(null);
  const { progress, activeId } = useReadingProgress(
    articleRef,
    showToc ? headings.map((h) => h.id) : [],
    guide.slug,
  );
  const startPractice = usePracticeAction(guide, area);
  const practice = splitPracticeBrief(guide.practiceBrief ?? "");
  const hasPractice = Boolean(practice.title);
  const updated = formatUpdated(guide.updatedAt);
  const isDraft = guide.status !== undefined && guide.status !== "published";

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-3.5 max-md:gap-3">
        <BackLink href={base} />

        {isDraft ? (
          <p
            role="status"
            className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-2.5 text-sm text-foreground"
          >
            <b className="font-semibold">Draft</b> — only admins can see this
            guide.
          </p>
        ) : null}

        <div className="flex items-start gap-5">
          <article
            ref={articleRef}
            className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]"
          >
            <div className="h-[280px] w-full overflow-hidden bg-accent-soft max-md:h-[180px]">
              <img
                src={guide.image}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex max-w-[760px] flex-col gap-[18px] px-11 pb-9 pt-8 max-md:gap-3.5 max-md:px-[18px] max-md:pb-6 max-md:pt-5">
              {guide.category ? (
                <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link max-md:text-[10px]">
                  {guide.category}
                </span>
              ) : null}
              <h1 className="m-0 font-display text-[40px] font-normal leading-[1.12] text-foreground max-md:text-[28px] max-md:leading-[1.15]">
                {guide.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2.5 text-[13px] text-muted max-md:text-xs">
                <span>{guide.readMinutes} min read</span>
                {guide.category ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{guide.category}</span>
                  </>
                ) : null}
                {updated ? (
                  <span className="max-md:hidden">
                    <span aria-hidden>·</span> Updated {updated}
                  </span>
                ) : null}
              </div>

              <MobileToc headings={showToc ? headings : []} />

              <div className="my-1.5 h-px bg-border max-md:hidden" />

              <GuideBody body={body} />

              {hasPractice ? (
                <div className="flex flex-col gap-2 rounded-[14px] border border-accent/40 bg-accent-soft p-4 md:hidden">
                  <span className={EYEBROW_CLASS}>Put it into practice</span>
                  <span className="font-display text-[17px] leading-[1.35] text-foreground">
                    {practice.title}
                  </span>
                  {practice.desc ? (
                    <span className="text-[13px] leading-[1.5] text-foreground/80">
                      {practice.desc}
                    </span>
                  ) : null}
                  <PracticeButton
                    area={area}
                    onClick={startPractice}
                    className="h-11"
                  />
                </div>
              ) : null}

              <HelpfulRow area={area} slug={guide.slug} />
            </div>
          </article>

          <aside className="sticky top-5 hidden w-[300px] shrink-0 flex-col gap-3.5 md:flex">
            {showToc ? (
              <div className={RAIL_CARD_CLASS}>
                <span className={EYEBROW_CLASS}>In this guide</span>
                <div
                  className="relative h-1 rounded-sm bg-border"
                  role="progressbar"
                  aria-label="Reading progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm bg-accent"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <nav className="flex flex-col" aria-label="In this guide">
                  {headings.map((h) => {
                    const active = h.id === activeId;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => scrollToHeading(h.id)}
                        aria-current={active ? "location" : undefined}
                        className={`block w-full cursor-pointer border-l-2 py-1.5 pl-3 text-left text-sm ${
                          active
                            ? "border-accent font-semibold text-foreground"
                            : "border-border font-normal text-foreground/80"
                        }`}
                      >
                        {h.text}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ) : null}

            {hasPractice ? (
              <div className={RAIL_CARD_CLASS}>
                <span className={EYEBROW_CLASS}>Put it into practice</span>
                <span className="font-display text-[17px] leading-[1.35] text-foreground">
                  {practice.title}
                </span>
                {practice.desc ? (
                  <span className="text-[13px] leading-[1.5] text-foreground/80">
                    {practice.desc}
                  </span>
                ) : null}
                <PracticeButton
                  area={area}
                  onClick={startPractice}
                  className="h-10"
                />
              </div>
            ) : null}

            <MoreGuidesRail guides={more} area={area} />
          </aside>
        </div>
      </div>

      {more.length > 0 ? (
        <section className="mt-6 md:hidden">
          <h2 className="mb-3 font-display text-xl text-foreground">
            More guides
          </h2>
          <MeditateGuidesGrid guides={more} area={area} />
        </section>
      ) : null}
    </div>
  );
}

export function MeditateGuidesIndexPage() {
  return <AreaGuidesIndexPage area="meditate" />;
}

export function MeditateGuideArticlePage() {
  return <AreaGuideArticlePage area="meditate" />;
}

export function JournalGuidesIndexPage() {
  return <AreaGuidesIndexPage area="journal" />;
}

export function JournalGuideArticlePage() {
  return <AreaGuideArticlePage area="journal" />;
}
