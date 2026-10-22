import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  HERO_PORTRAIT_AVIF,
  HERO_PORTRAIT_SIZES,
  HERO_WIDE_AVIF,
  HERO_WIDE_SIZES,
  isPhoneUserAgent,
} from "@/components/new-home/new-home-hero-art";
import { NewHomePage } from "@/components/new-home/new-home-page";

export const metadata: Metadata = {
  title: {
    absolute: "Consciously — become who you said you'd be",
  },
  description:
    "Get clear on the life you want, quiet the doubt in the way, and spend your days building it.",
};

export default async function HomePage() {
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
      <NewHomePage phone={phone} />
    </>
  );
}
