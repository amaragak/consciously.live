"use client";

import { useEffect, useState } from "react";
import {
  COLOR_SCHEME_CHANGED_EVENT,
  getLiveColorScheme,
  withAuthColorSchemeQuery,
} from "@/lib/color-scheme";

/** Login URL that carries the mode currently showing on the site. */
export function useAuthLoginHref(path = "/login"): string {
  const [href, setHref] = useState(path);

  useEffect(() => {
    const sync = () =>
      setHref(withAuthColorSchemeQuery(path, getLiveColorScheme()));
    sync();
    window.addEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
  }, [path]);

  return href;
}
