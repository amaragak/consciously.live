import { brand } from "@consciously/common";
import { getLiveColorScheme, withAuthColorSchemeQuery } from "@/lib/color-scheme";
import { getMarketingOrigin, marketingHref } from "@/lib/origins";

/** Shown when the SPA has no session — send people to marketing magic-link login. */
export function LoggedOutShell() {
  const marketingHost = getMarketingOrigin().replace(/^https?:\/\//, "");
  const loginHref = marketingHref(
    withAuthColorSchemeQuery(
      `/login?next=${encodeURIComponent("/focus")}`,
      getLiveColorScheme(),
    ),
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-3xl tracking-tight">{brand.name}</h1>
      <p className="text-sm text-muted">
        Sign in on {marketingHost} to open your app.
      </p>
      <div className="flex flex-col gap-2 text-sm">
        <a
          href={loginHref}
          className="font-medium text-accent-link underline-offset-2 hover:underline"
        >
          Sign in →
        </a>
        <a
          href={marketingHref("/")}
          className="text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          View marketing site
        </a>
      </div>
    </main>
  );
}
