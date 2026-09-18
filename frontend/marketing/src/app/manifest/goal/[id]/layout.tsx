"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Authenticated Manifest life-area workspace → Vite SPA. */
export default function ManifestGoalRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
