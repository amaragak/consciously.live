"use client";

import { useEffect, useState } from "react";
import { navigateToSpa } from "@/lib/spa-handoff";

/** Legacy /analytics → SPA admin analytics. */
export default function AnalyticsRedirectPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void navigateToSpa("/admin/analytics").then((ok) => {
      if (!cancelled && !ok) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-sm text-muted">
      {failed
        ? "Couldn’t open the app (session handoff unavailable)."
        : "Redirecting to app…"}
    </div>
  );
}
