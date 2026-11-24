import { useCallback, useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native/native-bridge";
import {
  getOfflineCatalog,
  offlineDownloadsSummary,
  subscribeOfflineDownloads,
  type OfflineCatalog,
} from "@/lib/native/offline-downloads";

export function useOfflineDownloads() {
  const enabled = isNativeApp();
  const [catalog, setCatalog] = useState<OfflineCatalog>(() =>
    enabled ? getOfflineCatalog() : { meditations: {}, soundscapes: {} },
  );
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    if (!enabled) return;
    setCatalog(getOfflineCatalog());
    return subscribeOfflineDownloads(() => setCatalog(getOfflineCatalog()));
  }, [enabled]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const summary = useCallback(() => offlineDownloadsSummary(), [catalog]);

  return {
    enabled,
    online,
    catalog,
    summary: summary(),
    meditation: (sk: string) => catalog.meditations[sk.trim()] ?? null,
    soundscape: (key: string) => catalog.soundscapes[key.trim()] ?? null,
  };
}
