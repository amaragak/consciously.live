
import { useEffect, useState } from "react";
import {
  defaultDevUiSettings,
  fetchDevUiSettings,
  type DevUiSettings,
} from "@/lib/medimade-api";

/** True on local/dev hosts where gated “dev UI” may appear when flags are on. */
export function isLocalDevHost(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * `flag` false → never. `flag` true → only on local/dev hosts.
 */
export function shouldRenderDevUi(flag: boolean): boolean {
  return flag === true && isLocalDevHost();
}

/** Loads public Dev UI flags (defaults false until fetch completes / fails). */
export function useDevUiSettings(): DevUiSettings {
  const [settings, setSettings] = useState<DevUiSettings>(defaultDevUiSettings);
  useEffect(() => {
    let cancelled = false;
    void fetchDevUiSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        if (!cancelled) setSettings(defaultDevUiSettings());
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}
