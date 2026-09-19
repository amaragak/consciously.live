import {
  algoliaUserIdFromEmail,
  scheduleAlgolia,
  upsertRecords,
  type AlgoliaUserRecord,
} from "./algolia";

export function scheduleIndexMeditation(opts: {
  email: string | undefined;
  sk: string;
  title?: string | null;
  description?: string | null;
  meditationStyle?: string | null;
  meditationType?: string | null;
  favourite?: boolean;
  updatedAt?: string | number;
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

  const record: AlgoliaUserRecord = {
    objectID: `meditation:${sk}`,
    userId,
    type: "meditation",
    title,
    body,
    href: `/meditate/library/creations?focus=${encodeURIComponent(sk)}`,
    updatedAt,
  };

  scheduleAlgolia(async () => {
    await upsertRecords([record]);
  });
}
