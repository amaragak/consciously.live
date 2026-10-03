import Link from "next/link";
import { ReadPostIndex } from "@/components/read-post-index";
import { fetchPublishedBlogIndex } from "@/lib/public-blog";

export const metadata = {
  title: "Read",
  description:
    "Notes on living consciously — practice, product, and the craft of attention.",
};

/** Cached until admin purge (`POST /api/revalidate-blog`). Dev uses `no-store` in `public-blog`. */
export const revalidate = false;

export default async function ReadIndexPage() {
  const { posts, authorPhotoUrl, authorPhotoEnabled } =
    await fetchPublishedBlogIndex();
  const showPhoto = authorPhotoEnabled && Boolean(authorPhotoUrl);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-6 sm:py-16">
      <div className="w-full min-w-0">
        <h1 className="home-v2-display m-0 text-[1.75rem] font-normal leading-relaxed text-[var(--hv2-ivory)] sm:text-[2.125rem]">
          Essays on consciousness, travel and practice, written by hand.
        </h1>
        <div className="mt-6 flex items-center gap-3.5 sm:gap-4">
          {showPhoto ? (
            <img
              key={authorPhotoUrl!}
              src={authorPhotoUrl!}
              alt=""
              width={112}
              height={112}
              className="size-28 shrink-0 rounded-full border-2 border-[color-mix(in_srgb,var(--hv2-gold)_45%,transparent)] object-cover sm:size-32"
            />
          ) : (
            <span
              aria-hidden
              className="size-28 shrink-0 rounded-full border-2 border-[color-mix(in_srgb,var(--hv2-gold)_45%,transparent)] bg-[rgba(246,241,231,0.12)] sm:size-32"
            />
          )}
          <div className="min-w-0">
            <p className="m-0 text-lg leading-snug sm:text-[1.25rem]">
              <span className="font-semibold text-[var(--hv2-hero-fg)]">
                Alex Maragakis
              </span>
              <span className="text-[var(--hv2-hero-muted)]">
                {" "}
                · Creator of{" "}
                <Link
                  href="/"
                  className="text-[#c3d2e8] transition-colors hover:text-[var(--hv2-gold)]"
                >
                  consciously.live
                </Link>
              </span>
            </p>
            <p className="m-0 mt-1 text-lg leading-snug text-[var(--hv2-hero-muted)] sm:text-[1.25rem]">
              Some of this leans into ideas science hasn&apos;t caught up with.
              You&apos;re welcome to disagree.
            </p>
          </div>
        </div>
      </div>

      <ReadPostIndex posts={posts} />
    </div>
  );
}
