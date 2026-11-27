import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  HERO_PORTRAIT_AVIF,
  HERO_PORTRAIT_SIZES,
  HERO_WIDE_AVIF,
  HERO_WIDE_SIZES,
  isPhoneUserAgent,
} from "@/components/new-home/new-home-hero-art";
import { NewhomeStoryPage } from "@/components/newhome-story/newhome-story-page";

export const metadata: Metadata = {
  title: {
    absolute: "Consciously — become who you said you'd be",
  },
  description:
    "Get clear on the life you want, quiet the doubt in the way, and spend your days building it.",
  // Alternate homepage: keep it out of search while `/` is the live one.
  robots: { index: false, follow: false },
};

export default async function NewhomePage() {
  const phone = isPhoneUserAgent((await headers()).get("user-agent"));
  return (
    <>
      {phone ? (
        <link
          rel="preload"
          as="image"
          type="image/avif"
          media="(max-width: 767.98px)"
          imageSrcSet={HERO_PORTRAIT_AVIF}
          imageSizes={HERO_PORTRAIT_SIZES}
          fetchPriority="high"
        />
      ) : null}
      <link
        rel="preload"
        as="image"
        type="image/avif"
        media={phone ? "(min-width: 768px)" : undefined}
        imageSrcSet={HERO_WIDE_AVIF}
        imageSizes={HERO_WIDE_SIZES}
        fetchPriority="high"
      />
      <NewhomeStoryPage phone={phone} />
    </>
  );
}
