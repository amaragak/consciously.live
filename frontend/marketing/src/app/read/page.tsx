import Link from "next/link";
import { Suspense } from "react";
import { ListenBriefBand } from "@/components/listen/listen-brief-band";
import { ReadPostIndex } from "@/components/read-post-index";
import { fetchPublishedBlogIndex } from "@/lib/public-blog";

export const metadata = {
  title: "Read",
  description:
    "Essays on consciousness, travel and practice.",
  openGraph: {
    title: "Read · Consciously",
    description:
      "Essays on consciousness, travel and practice.",
    type: "website",
    url: "https://consciously.live/read",
  },
};

/** Cached until admin purge (`POST /api/revalidate-blog`). Dev uses `no-store` in `public-blog`. */
export const revalidate = false;

/** Same portrait as the homepage Founder band. */
const FOUNDER_PHOTO = "/new-home/founder-alex.jpg";

export default async function ReadIndexPage() {
  const { posts } = await fetchPublishedBlogIndex();

  return (
    <div className="home-v2 min-h-full bg-[var(--hv2-page)] text-[var(--hv2-ink)]">
      <section className="px-5 pb-2 pt-10 md:px-6 md:pt-16">
        <div className="mx-auto w-full max-w-[1100px]">
          <h1 className="home-v2-display m-0 text-[1.75rem] font-normal leading-relaxed tracking-[-0.4px] text-[var(--hv2-ink)] sm:text-[2.125rem] md:text-[2.5rem]">
            Essays on consciousness, travel and practice.
          </h1>
          <div className="mt-6 flex items-center gap-3.5 sm:gap-4">
            <img
              src={FOUNDER_PHOTO}
              alt="Alex Maragakis"
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="m-0 text-[15px] leading-snug text-[var(--hv2-body)] md:text-[16px]">
                <span className="font-semibold text-[var(--hv2-ink)]">
                  Alex Maragakis
                </span>
                <span>
                  {" "}
                  · Creator of{" "}
                  <Link
                    href="/"
                    className="text-[var(--hv2-tan-text)] transition-colors hover:text-[var(--hv2-ink)]"
                  >
                    consciously.live
                  </Link>
                </span>
              </p>
              <p className="m-0 mt-1 text-[15px] leading-snug text-[var(--hv2-body)] md:text-[16px]">
                Some of this leans into ideas science hasn&apos;t caught up
                with. You&apos;re welcome to disagree.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <ReadPostIndex posts={posts} />
      </Suspense>

      <ListenBriefBand
        headline="Make a meditation from your own words."
        body="A few words about what you need is enough. Consciously writes a guided meditation for you."
      />
    </div>
  );
}
