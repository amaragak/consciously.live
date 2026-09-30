import {
  algoliaUserIdFromEmail,
  scheduleAlgolia,
  upsertRecords,
  type AlgoliaUserRecord,
} from "./algolia";

/** Public CDN URL for a media-bucket object key, or null. */
export function mediaImageUrlFromKey(
  key: string | null | undefined,
): string | null {
  const k = (key ?? "").trim();
  if (!k) return null;
  const cf = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!cf) return null;
  return `https://${cf}/${k}`;
}

export function scheduleIndexMeditation(opts: {
  email: string | undefined;
  sk: string;
  title?: string | null;
  description?: string | null;
  meditationStyle?: string | null;
  meditationType?: string | null;
  favourite?: boolean;
  updatedAt?: string | number;
  /** S3 key under the media bucket — preferred over raw imageUrl. */
  coverImageKey?: string | null;
  imageUrl?: string | null;
}): void {
  const userId = algoliaUserIdFromEmail(opts.email);
  const sk = opts.sk.trim();
  if (!sk) return;
  const title = (opts.title ?? "").trim() || "Meditation";
  const body = [
    (opts.description ?? "").trim(),
    (opts.meditationStyle ?? "").trim(),
    (opts.meditationType ?? "").trim(),
    opts.favourite ? "favourite" : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  const updatedAt =
    typeof opts.updatedAt === "number"
      ? opts.updatedAt
      : typeof opts.updatedAt === "string"
        ? Date.parse(opts.updatedAt) || Date.now()
        : Date.now();

  const imageUrl =
    mediaImageUrlFromKey(opts.coverImageKey) ||
    (typeof opts.imageUrl === "string" && opts.imageUrl.trim()
      ? opts.imageUrl.trim()
      : null);

  const record: AlgoliaUserRecord = {
    objectID: `meditation:${sk}`,
    userId,
    type: "meditation",
    title,
    body,
    href: `/meditate/library/creations?focus=${encodeURIComponent(sk)}`,
    updatedAt,
    ...(imageUrl ? { imageUrl } : {}),
  };

  scheduleAlgolia(async () => {
    await upsertRecords([record]);
  });
}
