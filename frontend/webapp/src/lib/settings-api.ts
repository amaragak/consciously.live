import {
  getMedimadeApiBase,
  medimadeApiAuthHeaders,
  medimadeFetch,
} from "@/lib/medimade-api";
import {
  defaultUserSettings,
  normalizeUserSettings,
  type UserSettingsV1,
} from "@/lib/user-settings";

function settingsJsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...medimadeApiAuthHeaders() };
}

export type FetchUserSettingsResult = {
  settings: UserSettingsV1;
  /** False when the user has never saved settings (server returned defaults). */
  persisted: boolean;
};

export async function fetchUserSettings(): Promise<FetchUserSettingsResult> {
  const base = getMedimadeApiBase();
  if (!base) {
    return { settings: defaultUserSettings(), persisted: false };
  }
  const res = await medimadeFetch(`${base}/settings`, {
    headers: settingsJsonHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    settings?: unknown;
    persisted?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    settings: normalizeUserSettings(data.settings),
    persisted: data.persisted === true,
  };
}

export async function patchUserSettings(
  patch: Partial<UserSettingsV1> | Record<string, unknown>,
): Promise<UserSettingsV1> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/settings`, {
    method: "PATCH",
    headers: settingsJsonHeaders(),
    body: JSON.stringify({ settings: patch }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    settings?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return normalizeUserSettings(data.settings);
}
