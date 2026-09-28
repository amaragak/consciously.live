import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsShell } from "@/components/settings/settings-shell";
import { clearMedimadeSession } from "@/lib/auth-session";
import { getStoredColorScheme, setColorScheme } from "@/lib/color-scheme";
import { fetchUserSettings, patchUserSettings } from "@/lib/settings-api";
import {
  readFocusDefaults,
  readMeditateDefaults,
  syncFocusDefaultsFromSettings,
  syncMeditateDefaultsFromSettings,
} from "@/lib/settings-local-defaults";
import {
  applyUserSettingsPatch,
  defaultUserSettings,
  type UserSettingsV1,
} from "@/lib/user-settings";

const SAVED_FLASH_MS = 2500;

export function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettingsV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const settingsRef = useRef<UserSettingsV1 | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  settingsRef.current = settings;

  const flashSaved = useCallback(() => {
    setSavedVisible(true);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => {
      setSavedVisible(false);
      savedTimerRef.current = null;
    }, SAVED_FLASH_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchUserSettings()
      .then(({ settings: s, persisted }) => {
        if (cancelled) return;
        const localTheme = getStoredColorScheme();
        let next = s;
        if (!persisted && s.general.theme !== localTheme) {
          next = {
            ...s,
            general: { ...s.general, theme: localTheme },
          };
          void patchUserSettings({ general: { theme: localTheme } });
        } else {
          setColorScheme(s.general.theme);
        }
        setSettings(next);
        syncMeditateDefaultsFromSettings(next);
        syncFocusDefaultsFromSettings(next);
      })
      .catch((e) => {
        if (cancelled) return;
        const fallback = defaultUserSettings();
        // Keep the device theme / local defaults — don't clobber them when the
        // API is unreachable (e.g. before the settings route is deployed).
        setSettings({
          ...fallback,
          general: {
            ...fallback.general,
            theme: getStoredColorScheme(),
          },
          meditate: {
            ...fallback.meditate,
            ...(() => {
              const d = readMeditateDefaults();
              return {
                defaultVoiceId: d.defaultVoiceId,
                defaultLengthMinutes: d.defaultLengthMinutes,
                defaultType: d.defaultType,
              };
            })(),
          },
          focus: {
            ...fallback.focus,
            ...readFocusDefaults(),
          },
        });
        setLoadError(
          e instanceof Error ? e.message : "Could not load settings",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onSignOut = () => {
      clearMedimadeSession();
      navigate("/login", { replace: true });
    };
    window.addEventListener("settings-sign-out", onSignOut);
    return () => window.removeEventListener("settings-sign-out", onSignOut);
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  const onPatch = useCallback(
    (patch: Record<string, unknown>) => {
      const prev = settingsRef.current ?? defaultUserSettings();
      const next = applyUserSettingsPatch(prev, patch);
      setSettings(next);
      setSaveError(null);

      if (patch.general && typeof patch.general === "object") {
        const theme = (patch.general as { theme?: string }).theme;
        if (theme === "light" || theme === "dark" || theme === "hybrid" || theme === "v2") {
          setColorScheme(theme);
        }
      }
      syncMeditateDefaultsFromSettings(next);
      syncFocusDefaultsFromSettings(next);

      void patchUserSettings(patch)
        .then((saved) => {
          setSettings(saved);
          syncMeditateDefaultsFromSettings(saved);
          syncFocusDefaultsFromSettings(saved);
          flashSaved();
        })
        .catch((e) => {
          setSettings(prev);
          setColorScheme(prev.general.theme);
          syncMeditateDefaultsFromSettings(prev);
          syncFocusDefaultsFromSettings(prev);
          setSaveError(
            e instanceof Error ? e.message : "Could not save settings",
          );
        });
    },
    [flashSaved],
  );

  return (
    <SettingsShell
      settings={settings}
      loading={loading}
      loadError={loadError}
      saveError={saveError}
      savedVisible={savedVisible}
      onPatch={onPatch}
    />
  );
}
