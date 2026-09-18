import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppChrome } from "@/components/app-chrome";
import { HAS_SESSION_HINT_COOKIE } from "@/lib/auth-hint-cookie";

/**
 * Server wrapper: read same-origin session hint cookie and pass to AppChrome
 * so SSR and the client's first paint agree on which shell to mount.
 */
export async function AppChromeHost({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const initialHasSessionHint =
    jar.get(HAS_SESSION_HINT_COOKIE)?.value === "1";

  return (
    <Suspense
      fallback={
        <>
          <div
            className="h-14 shrink-0 border-b border-border bg-nav"
            aria-hidden
          />
          <div className="min-h-0 flex-1" />
        </>
      }
    >
      <AppChrome initialHasSessionHint={initialHasSessionHint}>
        {children}
      </AppChrome>
    </Suspense>
  );
}
