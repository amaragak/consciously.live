/**
 * Which daily to-dos the dashboard's Today list shows (Settings › Daily to-dos).
 * Saved with user settings; cached per account here so the list doesn't change
 * after the first paint.
 */
import { useEffect, useState } from "react";
import { getMedimadeSessionEmail, isMedimadeSessionActive } from "@/lib/auth-session";
import { fetchUserSettings } from "@/lib/settings-api";
import { defaultUserSettings, type UserSettingsV1 } from "@/lib/user-settings";

export type DailyTodoPrefs = UserSettingsV1["today"];

export const DAILY_TODOS_CHANGED_EVENT = "medimade-daily-todos-changed";

function cacheKey(): string {
  const email = getMedimadeSessionEmail()?.trim().toLowerCase();
  return `mm_daily_todos_v1:${email || "_anon"}`;
}

export function readCachedDailyTodos(): DailyTodoPrefs {
  const defaults = defaultUserSettings().today;
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DailyTodoPrefs>;
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof DailyTodoPrefs)[]) {
      if (typeof parsed[k] === "boolean") out[k] = parsed[k] as boolean;
    }
    return out;
  } catch {
    return defaults;
  }
}

export function cacheDailyTodos(prefs: DailyTodoPrefs): void {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(prefs));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(DAILY_TODOS_CHANGED_EVENT));
}

/** Cached prefs straight away, then the saved settings once they load. */
export function useDailyTodoPrefs(): DailyTodoPrefs {
  const [prefs, setPrefs] = useState<DailyTodoPrefs>(readCachedDailyTodos);

  useEffect(() => {
    let cancelled = false;
    const onChange = () => setPrefs(readCachedDailyTodos());
    window.addEventListener(DAILY_TODOS_CHANGED_EVENT, onChange);
    if (isMedimadeSessionActive()) {
      void fetchUserSettings()
        .then(({ settings }) => {
          if (!cancelled) cacheDailyTodos(settings.today);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      window.removeEventListener(DAILY_TODOS_CHANGED_EVENT, onChange);
    };
  }, []);

  return prefs;
}
