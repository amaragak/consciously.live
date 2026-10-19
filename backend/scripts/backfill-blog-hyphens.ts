/**
 * Replace em dashes in stored Read posts with a hyphen.
 * Leaves updatedAt alone so the public index order does not change.
 *
 *   AWS_PROFILE=mm AWS_REGION=eu-west-2 \
 *   VOICE_ADMIN_TABLE_NAME=… \
 *   npx tsx scripts/backfill-blog-hyphens.ts
 */
import { backfillBlogLongHyphens } from "../lambdas/_shared/blog";

async function main(): Promise<void> {
  const slugs = await backfillBlogLongHyphens();
  console.log(`updated ${slugs.length} post(s)`);
  for (const slug of slugs) console.log(slug);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
