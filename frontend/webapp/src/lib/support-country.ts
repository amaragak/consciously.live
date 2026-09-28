/**
 * Resolve which support-resources country to show (Insights v7).
 * Order: account → stored preference → timezone → browser locale → null (fallback UI).
 */

import {
  getSupportCountry,
  listSupportCountries,
  type SupportCountry,
} from "@/config/support-resources";

const PREF_KEY = "mm_support_country_v1";

/** Common IANA zones → ISO country (best-effort; never blocks the banner). */
const TZ_TO_COUNTRY: Record<string, string> = {
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Anchorage": "US",
  "Pacific/Honolulu": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Pacific/Auckland": "NZ",
};

export function readStoredSupportCountry(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PREF_KEY)?.trim().toUpperCase();
    return v && getSupportCountry(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredSupportCountry(code: string): void {
  if (typeof window === "undefined") return;
  try {
    const c = code.trim().toUpperCase();
    if (!getSupportCountry(c)) return;
    window.localStorage.setItem(PREF_KEY, c);
  } catch {
    /* ignore */
  }
}

export function countryFromTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone?.trim()) return null;
  const direct = TZ_TO_COUNTRY[timeZone.trim()];
  if (direct && getSupportCountry(direct)) return direct;
  return null;
}

export function countryFromLocale(locale: string | null | undefined): string | null {
  if (!locale?.trim()) return null;
  const m = /[-_]([A-Za-z]{2})\b/.exec(locale.trim());
  if (!m?.[1]) return null;
  const code = m[1].toUpperCase();
  return getSupportCountry(code) ? code : null;
}

export type ResolveSupportCountryInput = {
  /** Account profile country, if the product stores one. */
  accountCountry?: string | null;
  timeZone?: string | null;
  locale?: string | null;
  /** Injected preference (tests); defaults to localStorage. */
  storedCountry?: string | null;
};

export function resolveSupportCountryCode(
  input: ResolveSupportCountryInput = {},
): string | null {
  const stored =
    input.storedCountry !== undefined
      ? input.storedCountry
      : readStoredSupportCountry();
  const candidates = [
    input.accountCountry,
    stored,
    countryFromTimeZone(input.timeZone),
    countryFromLocale(input.locale),
  ];
  for (const c of candidates) {
    const code = typeof c === "string" ? c.trim().toUpperCase() : "";
    if (code && getSupportCountry(code)) return code;
  }
  return null;
}

export function resolveSupportCountry(
  input: ResolveSupportCountryInput = {},
): SupportCountry | null {
  return getSupportCountry(resolveSupportCountryCode(input));
}

export function clientSupportResolveInput(): ResolveSupportCountryInput {
  let timeZone: string | null = null;
  let locale: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    /* ignore */
  }
  try {
    locale = typeof navigator !== "undefined" ? navigator.language : null;
  } catch {
    /* ignore */
  }
  return { timeZone, locale };
}

export { listSupportCountries, getSupportCountry };
