"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Admin → Vite SPA (password gate lives on the SPA). */
export default function AdminSpaRedirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SpaRedirect>{children}</SpaRedirect>;
}
