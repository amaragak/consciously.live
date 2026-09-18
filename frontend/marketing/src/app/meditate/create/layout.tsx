"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Meditate Create → Vite SPA. */
export default function MeditateCreateRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
