/** Approved Nano Banana Pro hero. AVIF first, then WebP, then JPEG. */

export const HERO_WIDE_WIDTH = 3168;
export const HERO_WIDE_HEIGHT = 1344;
export const HERO_PORTRAIT_WIDTH = 1856;
export const HERO_PORTRAIT_HEIGHT = 2304;
export const HERO_WIDE_ALT = "A figure looking out over a valley at sunrise";

/** Rendered width of the wide image at the fixed stage height. Width changes crop the sides. */
export const HERO_WIDE_SIZES = `calc(min(720px, 100svh - 112px) * ${HERO_WIDE_WIDTH} / ${HERO_WIDE_HEIGHT})`;
export const HERO_PORTRAIT_SIZES = `calc(min(760px, 100svh - 112px) * ${HERO_PORTRAIT_WIDTH} / ${HERO_PORTRAIT_HEIGHT})`;

const WIDE_WIDTHS = [1280, 1920, 2560, 3168] as const;
const PORTRAIT_WIDTHS = [960, 1280, 1856] as const;

function srcSet(
  name: "hero-a-wide" | "hero-a-portrait",
  widths: readonly number[],
  ext: "avif" | "webp" | "jpg",
  fullWidth: number,
  original: string,
) {
  return widths
    .map((width) => {
      const file =
        ext === "jpg" && width === fullWidth
          ? original
          : `/new-home/${name}-${width}.${ext}`;
      return `${file} ${width}w`;
    })
    .join(", ");
}

export const HERO_WIDE_AVIF = srcSet("hero-a-wide", WIDE_WIDTHS, "avif", 3168, "/new-home/hero-a-wide.jpg");
export const HERO_WIDE_WEBP = srcSet("hero-a-wide", WIDE_WIDTHS, "webp", 3168, "/new-home/hero-a-wide.jpg");
export const HERO_WIDE_JPG = srcSet("hero-a-wide", WIDE_WIDTHS, "jpg", 3168, "/new-home/hero-a-wide.jpg");
export const HERO_WIDE_SRC = "/new-home/hero-a-wide.jpg";

export const HERO_PORTRAIT_AVIF = srcSet(
  "hero-a-portrait",
  PORTRAIT_WIDTHS,
  "avif",
  1856,
  "/new-home/hero-a-portrait.jpg",
);
export const HERO_PORTRAIT_WEBP = srcSet(
  "hero-a-portrait",
  PORTRAIT_WIDTHS,
  "webp",
  1856,
  "/new-home/hero-a-portrait.jpg",
);
export const HERO_PORTRAIT_JPG = srcSet(
  "hero-a-portrait",
  PORTRAIT_WIDTHS,
  "jpg",
  1856,
  "/new-home/hero-a-portrait.jpg",
);

/** Phones only. Tablets and resized desktop windows keep the wide image. */
export function isPhoneUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (/iPad|Tablet|PlayBook/i.test(ua)) return false;
  return /iPhone|iPod|Android.+Mobile|Windows Phone|IEMobile|Opera Mini|BlackBerry|webOS/i.test(ua);
}
