"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Meditate Library (Creations / Programs / Community) → Vite SPA. */
export default function MeditateLibraryRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
