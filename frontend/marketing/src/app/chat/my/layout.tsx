"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Authenticated Chat → Vite SPA. */
export default function ChatSpaRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
