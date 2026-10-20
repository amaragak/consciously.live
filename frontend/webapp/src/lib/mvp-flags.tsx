import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { isOwnerAdminAccount } from "@/lib/app-nav";
import { getMedimadeSessionEmail } from "@/lib/auth-session";
import { isSessionAdmin } from "@/lib/session-privileges";
import { patchUserSettings } from "@/lib/settings-api";
import {
  getMedimadeApiBase,
  medimadeApiAuthHeaders,
  medimadeFetch,
} from "@/lib/medimade-api";

/**
 * Feature visibility for the MVP cut.
 * True means the feature is shown. Non-admins always get every flag off.
 * An admin sees everything unless that account's MVP mode is on.
 */
export type MvpFlags = {
  manifestInsights: boolean;
  journalInsights: boolean;
  whiteboard: boolean;
  chat: boolean;
};

const HIDDEN: MvpFlags = {
  manifestInsights: false,
  journalInsights: false,
  whiteboard: false,
  chat: false,
};

const SHOWN: MvpFlags = {
  manifestInsights: true,
  journalInsights: true,
  whiteboard: true,
  chat: true,
};

const CACHE_KEY = "mm_mvp_mode_v1";

function flagsFor(admin: boolean, mvpMode: boolean): MvpFlags {
  return admin && !mvpMode ? SHOWN : HIDDEN;
}

/** Owner account or a JWT admin. The owner session is often role "user". */
export function currentUserIsAdmin(): boolean {
  return isSessionAdmin() || isOwnerAdminAccount(getMedimadeSessionEmail());
}

let snapshot: MvpFlags = HIDDEN;

export function mvpFlagsSnapshot(): MvpFlags {
  return snapshot;
}

function readCachedMvpMode(): boolean {
  return readAccountLocalStorage(CACHE_KEY) === "1";
}

function writeCachedMvpMode(on: boolean) {
  writeAccountLocalStorage(CACHE_KEY, on ? "1" : "0");
}

type MvpContextValue = {
  flags: MvpFlags;
  mvpMode: boolean;
  isAdmin: boolean;
  setMvpMode: (on: boolean) => Promise<void>;
};

const MvpContext = createContext<MvpContextValue>({
  flags: HIDDEN,
  mvpMode: true,
  isAdmin: false,
  setMvpMode: async () => {},
});

export function useMvpFlags(): MvpFlags {
  return useContext(MvpContext).flags;
}

export function useMvpMode(): {
  mvpMode: boolean;
  isAdmin: boolean;
  setMvpMode: (on: boolean) => Promise<void>;
} {
  const ctx = useContext(MvpContext);
  return {
    mvpMode: ctx.mvpMode,
    isAdmin: ctx.isAdmin,
    setMvpMode: ctx.setMvpMode,
  };
}

/** Drop nav rows the current flags hide. Chat is a section; Journal Insights is a child. */
export function applyMvpNav<
  T extends { id: string; children?: ReadonlyArray<{ id: string }> | undefined },
>(sections: readonly T[], flags: MvpFlags): T[] {
  return sections.flatMap((section) => {
    if (section.id === "chat" && !flags.chat) return [];
    if (!section.children) return [section];
    const children = section.children.filter((child) => {
      if (
        section.id === "journal" &&
        child.id === "insights" &&
        !flags.journalInsights
      ) {
        return false;
      }
      return true;
    });
    return [{ ...section, children }];
  });
}

async function readServerMvpMode(): Promise<boolean | undefined> {
  const base = getMedimadeApiBase();
  if (!base) return undefined;
  const res = await medimadeFetch(`${base}/settings`, {
    headers: { ...medimadeApiAuthHeaders() },
  });
  if (!res.ok) return undefined;
  const data = (await res.json().catch(() => null)) as {
    settings?: { general?: { mvpMode?: unknown } };
  } | null;
  const general = data?.settings?.general;
  if (!general || typeof general !== "object" || !("mvpMode" in general)) {
    return undefined;
  }
  return general.mvpMode === true;
}

export function MvpFlagsProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState(currentUserIsAdmin);
  const [mvpMode, setMode] = useState(() =>
    currentUserIsAdmin() ? readCachedMvpMode() : true,
  );

  useEffect(() => {
    const syncAdmin = () => setAdmin(currentUserIsAdmin());
    syncAdmin();
    window.addEventListener("medimade-session-changed", syncAdmin);
    return () => window.removeEventListener("medimade-session-changed", syncAdmin);
  }, []);

  useEffect(() => {
    if (!admin) {
      snapshot = HIDDEN;
      setMode(true);
      return;
    }
    setMode(readCachedMvpMode());
    let cancelled = false;
    void readServerMvpMode()
      .then((server) => {
        if (cancelled || server === undefined) return;
        writeCachedMvpMode(server);
        setMode(server);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [admin]);

  const flags = flagsFor(admin, mvpMode);
  snapshot = flags;

  const value = useMemo<MvpContextValue>(
    () => ({
      flags,
      mvpMode,
      isAdmin: admin,
      setMvpMode: async (on: boolean) => {
        if (!admin) return;
        writeCachedMvpMode(on);
        setMode(on);
        snapshot = flagsFor(true, on);
        try {
          await patchUserSettings({ general: { mvpMode: on } });
        } catch {
          /* Local cache still holds the choice until the next successful save. */
        }
      },
    }),
    [admin, flags, mvpMode],
  );

  return <MvpContext.Provider value={value}>{children}</MvpContext.Provider>;
}
