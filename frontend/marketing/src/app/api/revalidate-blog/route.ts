import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  BLOG_INDEX_TAG,
  blogPostTag,
} from "@/lib/public-blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand cache purge for /read (called by admin-blog Lambda after writes).
 *
 * Body: { secret, index?: boolean, slugs?: string[] }
 * Or header: x-blog-revalidate-secret
 */
export async function POST(request: Request) {
  const expected = process.env.BLOG_REVALIDATE_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "BLOG_REVALIDATE_SECRET is not configured" },
      { status: 503 },
    );
  }

  let body: {
    secret?: unknown;
    index?: unknown;
    slugs?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provided =
    (typeof body.secret === "string" ? body.secret.trim() : "") ||
    request.headers.get("x-blog-revalidate-secret")?.trim() ||
    "";
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const purgeIndex = body.index === true;
  const slugs = Array.isArray(body.slugs)
    ? body.slugs
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (!purgeIndex && slugs.length === 0) {
    return NextResponse.json(
      { error: "Provide index: true and/or slugs: string[]" },
      { status: 400 },
    );
  }

  // Immediate expiry — admin expects the next view to show the write.
  const expireNow = { expire: 0 } as const;
  const tags: string[] = [];
  const paths: string[] = [];

  if (purgeIndex) {
    revalidateTag(BLOG_INDEX_TAG, expireNow);
    tags.push(BLOG_INDEX_TAG);
    revalidatePath("/read");
    paths.push("/read");
  }

  for (const slug of slugs) {
    const tag = blogPostTag(slug);
    revalidateTag(tag, expireNow);
    tags.push(tag);
    const path = `/read/${encodeURIComponent(slug)}`;
    revalidatePath(path);
    paths.push(path);
  }

  return NextResponse.json({
    revalidated: true,
    tags,
    paths,
    now: Date.now(),
  });
}
