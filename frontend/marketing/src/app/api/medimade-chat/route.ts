import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for the coach chat Lambda.
 * Avoids browser extensions / CORS edge cases blocking `*.lambda-url.*.on.aws`.
 */
export async function POST(req: Request) {
  const upstream = process.env.NEXT_PUBLIC_MEDIMADE_CHAT_URL?.trim();
  if (!upstream) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_MEDIMADE_CHAT_URL is not set" },
      { status: 500 },
    );
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream chat unreachable";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") ?? "text/event-stream";
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
