"use client";

import { useEffect } from "react";
import { navigateToSpa } from "@/lib/spa-handoff";

/** Legacy /analytics → SPA admin analytics. */
export default function AnalyticsRedirectPage() {
  useEffect(() => {
    void navigateToSpa("/admin/analytics");
  }, []);
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
      Redirecting to app…
    </div>
  );
}
