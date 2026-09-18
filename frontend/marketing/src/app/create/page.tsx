"use client";

import { SpaRedirect } from "@/components/spa-redirect";

/** Legacy /create → SPA Create. */
export default function CreateRedirectPage() {
  return <SpaRedirect />;
}
