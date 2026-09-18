"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Authenticated Journal → Vite SPA. */
export default function JournalSpaRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
