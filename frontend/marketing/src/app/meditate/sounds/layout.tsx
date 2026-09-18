"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Meditate Sounds → Vite SPA. */
export default function MeditateSoundsRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
