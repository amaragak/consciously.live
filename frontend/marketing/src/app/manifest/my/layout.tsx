"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Authenticated Manifest home + vision board → Vite SPA. */
export default function ManifestMyRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
