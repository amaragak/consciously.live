/**
 * Crisis / wellbeing support resources by country (Insights v7).
 *
 * lastVerified is null until a human checks each number/hours before shipping.
 * Production builds fail the companion test if any lastVerified is null or >12 months old.
 */

export type SupportContact = {
  name: string;
  description: string;
  /** E.164 or national dialling string for tel: links. */
  phone?: string;
  /** SMS short code / number for sms: links. */
  sms?: string;
  /** Prefill body for sms: links (e.g. SHOUT). */
  smsBody?: string;
  url?: string;
  hours: string;
  languages: string[];
  /** ISO date YYYY-MM-DD, or null until verified. */
  lastVerified: string | null;
};

export type SupportCountry = {
  code: string;
  name: string;
  emergencyNumber: string;
  resources: SupportContact[];
};

export type SupportResourcesConfig = {
  countries: Record<string, SupportCountry>;
  international: {
    name: string;
    description: string;
    url: string;
    lastVerified: string | null;
  };
  /** Shown when country is unknown. */
  fallbackEmergencyHint: string;
};

export const SUPPORT_RESOURCES: SupportResourcesConfig = {
  fallbackEmergencyHint: "contact your local emergency number",
  international: {
    name: "Find a Helpline",
    description: "Directory of free, confidential helplines worldwide",
    url: "https://findahelpline.com",
    lastVerified: null,
  },
  countries: {
    GB: {
      code: "GB",
      name: "United Kingdom",
      emergencyNumber: "999",
      resources: [
        {
          name: "Samaritans",
          description: "Call — free emotional support",
          phone: "116123",
          hours: "24/7",
          languages: ["en"],
          lastVerified: null,
        },
        {
          name: "Shout",
          description: "Text — free, confidential support",
          sms: "85258",
          smsBody: "SHOUT",
          hours: "24/7",
          languages: ["en"],
          lastVerified: null,
        },
        {
          name: "NHS 111",
          description: "Call — select the mental health option (England)",
          phone: "111",
          hours: "24/7",
          languages: ["en"],
          lastVerified: null,
        },
      ],
    },
    IE: {
      code: "IE",
      name: "Ireland",
      emergencyNumber: "112",
      resources: [
        {
          name: "Samaritans",
          description: "Call — free emotional support",
          phone: "116123",
          hours: "24/7",
          languages: ["en"],
          lastVerified: null,
        },
      ],
    },
    US: {
      code: "US",
      name: "United States",
      emergencyNumber: "911",
      resources: [
        {
          name: "988 Suicide & Crisis Lifeline",
          description: "Call or text 988",
          phone: "988",
          sms: "988",
          hours: "24/7",
          languages: ["en", "es"],
          lastVerified: null,
        },
      ],
    },
    CA: {
      code: "CA",
      name: "Canada",
      emergencyNumber: "911",
      resources: [
        {
          name: "988 Suicide Crisis Helpline",
          description: "Call or text 988",
          phone: "988",
          sms: "988",
          hours: "24/7",
          languages: ["en", "fr"],
          lastVerified: null,
        },
      ],
    },
    AU: {
      code: "AU",
      name: "Australia",
      emergencyNumber: "000",
      resources: [
        {
          name: "Lifeline",
          description: "Call — crisis support and suicide prevention",
          phone: "131114",
          hours: "24/7",
          languages: ["en"],
          lastVerified: null,
        },
      ],
    },
    NZ: {
      code: "NZ",
      name: "New Zealand",
      emergencyNumber: "111",
      resources: [
        {
          name: "1737",
          description: "Call or text — free counselling support",
          phone: "1737",
          sms: "1737",
          hours: "24/7",
          languages: ["en"],
          lastVerified: null,
        },
      ],
    },
  },
};

/** Max age for a verified resource before the production guard fails. */
export const SUPPORT_VERIFY_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export function listSupportCountries(): SupportCountry[] {
  return Object.values(SUPPORT_RESOURCES.countries).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getSupportCountry(code: string | null | undefined): SupportCountry | null {
  if (!code) return null;
  return SUPPORT_RESOURCES.countries[code.trim().toUpperCase()] ?? null;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function smsHref(sms: string, body?: string): string {
  const num = sms.replace(/[^\d+]/g, "");
  if (body?.trim()) {
    return `sms:${num}?&body=${encodeURIComponent(body.trim())}`;
  }
  return `sms:${num}`;
}

/**
 * Production guard: every seeded resource (and the international fallback)
 * must have a lastVerified date within the last 12 months.
 */
export function supportResourcesStaleReasons(
  now: Date = new Date(),
): string[] {
  const reasons: string[] = [];
  const check = (label: string, lastVerified: string | null) => {
    if (!lastVerified) {
      reasons.push(`${label}: lastVerified is null`);
      return;
    }
    const t = Date.parse(`${lastVerified}T00:00:00.000Z`);
    if (!Number.isFinite(t)) {
      reasons.push(`${label}: lastVerified is not a valid date`);
      return;
    }
    if (now.getTime() - t > SUPPORT_VERIFY_MAX_AGE_MS) {
      reasons.push(`${label}: lastVerified older than 12 months`);
    }
  };
  check("international", SUPPORT_RESOURCES.international.lastVerified);
  for (const country of Object.values(SUPPORT_RESOURCES.countries)) {
    for (const r of country.resources) {
      check(`${country.code}/${r.name}`, r.lastVerified);
    }
  }
  return reasons;
}
