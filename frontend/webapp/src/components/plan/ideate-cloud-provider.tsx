import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import {
  clearIdeateCloudSessionCache,
  hydrateIdeateFromDeviceCache,
  pullIdeateStoreFromCloud,
  signedInIdeateMemoryHasContent,
  subscribeIdeateCloud,
  wasIdeateStorePulledThisSession,
} from "@/lib/ideate-cloud";

type IdeateCloudContextValue = {
  ready: boolean;
  signedIn: boolean;
  /** Bumps when local/cloud Ideate data changes — remount readers. */
  revision: number;
  refresh: () => void;
};

const IdeateCloudContext = createContext<IdeateCloudContextValue>({
  ready: false,
  signedIn: false,
  revision: 0,
  refresh: () => {},
});

export function useIdeateCloud(): IdeateCloudContextValue {
  return useContext(IdeateCloudContext);
}

/** Cloud Ideate needs a real access JWT — sticky ACTIVE_KEY alone is not enough. */
function hasIdeateCloudSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

function canPaintStale(): boolean {
  return (
    wasIdeateStorePulledThisSession() ||
    signedInIdeateMemoryHasContent() ||
    hydrateIdeateFromDeviceCache()
  );
}

/**
 * Signed-in: GET /ideate/store (once per session force, then soft revalidate).
 * Paints immediately from memory / device cache when available (SWR).
 * Logged out: leave device stores alone, ready immediately.
 */
export function IdeateCloudProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => hasIdeateCloudSession());
  const [authEpoch, setAuthEpoch] = useState(0);
  const [ready, setReady] = useState(() => {
    if (!hasIdeateCloudSession()) return true;
    return canPaintStale();
  });
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => subscribeIdeateCloud(refresh), [refresh]);

  useEffect(() => {
    const syncAuth = () => {
      const next = hasIdeateCloudSession();
      setSignedIn((prev) => {
        if (prev === next) return prev;
        clearIdeateCloudSessionCache();
        // Do NOT wipe Ideate here. Explicit Log out already calls
        // wipeIdeateDeviceData via clearMedimadeSession. Transient JWT gaps
        // (refresh / race) must never destroy device data.
        setAuthEpoch((e) => e + 1);
        if (!next) setReady(true);
        else if (!canPaintStale()) setReady(false);
        return next;
      });
    };
    void import("@/lib/auth-session").then((m) =>
      m.ensureMedimadeSession().finally(syncAuth),
    );
    window.addEventListener("medimade-session-changed", syncAuth);
    return () =>
      window.removeEventListener("medimade-session-changed", syncAuth);
  }, []);

  useEffect(() => {
    let alive = true;

    void (async () => {
      await import("@/lib/auth-session").then((m) => m.ensureMedimadeSession());
      if (!alive) return;

      if (isMedimadeSessionActive() && !getMedimadeSessionJwt()) {
        await import("@/lib/auth-session").then((m) =>
          m.ensureMedimadeSession({ force: true }),
        );
        if (!alive) return;
      }

      const cloud = hasIdeateCloudSession();
      setSignedIn(cloud);

      if (!cloud) {
        if (alive) {
          setReady(true);
          setRevision((n) => n + 1);
        }
        return;
      }

      // Stale-while-revalidate: paint cached Ideate immediately.
      const stale = canPaintStale();
      if (stale && alive) {
        setReady(true);
        setRevision((n) => n + 1);
      } else if (alive) {
        setReady(false);
      }

      const alreadyPulled = wasIdeateStorePulledThisSession();
      let result = await pullIdeateStoreFromCloud({
        // First pull this JS session is forced; later visits soft-skip unless empty.
        force: !alreadyPulled,
      });
      if (
        alive &&
        !result.applied &&
        !signedInIdeateMemoryHasContent() &&
        !alreadyPulled
      ) {
        result = await pullIdeateStoreFromCloud({ force: true });
      }
      // Background revalidate when we painted from cache and already pulled once.
      if (alive && alreadyPulled && stale) {
        void pullIdeateStoreFromCloud({ force: true }).then(() => {
          if (alive) setRevision((n) => n + 1);
        });
      }
      if (!alive) return;
      if (!result.applied && !signedInIdeateMemoryHasContent()) {
        console.error(
          "[ideate] cloud pull did not apply; UI may look empty",
          result,
        );
      }
      setReady(true);
      setRevision((n) => n + 1);
    })();

    return () => {
      alive = false;
    };
  }, [authEpoch]);

  return (
    <IdeateCloudContext.Provider
      value={{ ready, signedIn, revision, refresh }}
    >
      {children}
    </IdeateCloudContext.Provider>
  );
}
