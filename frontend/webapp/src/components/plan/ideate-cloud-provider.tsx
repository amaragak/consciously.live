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
  pullIdeateStoreFromCloud,
  signedInIdeateMemoryHasContent,
  subscribeIdeateCloud,
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

/**
 * Signed-in: await GET /ideate/store, then ready.
 * Logged out: leave device stores alone (no demo seed), ready immediately.
 * Never cancels an in-flight pull by bumping epoch mid-request.
 */
export function IdeateCloudProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [ready, setReady] = useState(false);
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
        setReady(false);
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
    setReady(false);

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

      if (cloud) {
        let result = await pullIdeateStoreFromCloud({ force: true });
        if (
          alive &&
          !result.applied &&
          !signedInIdeateMemoryHasContent()
        ) {
          // Network / auth blip — one retry before painting empty.
          result = await pullIdeateStoreFromCloud({ force: true });
        }
        if (!alive) return;
        if (!result.applied && !signedInIdeateMemoryHasContent()) {
          console.error(
            "[ideate] cloud pull did not apply; UI may look empty",
            result,
          );
        }
      }
      // Signed out: leave device stores alone — never seed or wipe-fill demos.

      if (!alive) return;
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
