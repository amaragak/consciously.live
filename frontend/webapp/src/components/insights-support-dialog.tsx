import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  SUPPORT_RESOURCES,
  telHref,
  smsHref,
  type SupportContact,
  type SupportCountry,
} from "@/config/support-resources";
import {
  clientSupportResolveInput,
  listSupportCountries,
  readStoredSupportCountry,
  resolveSupportCountry,
  writeStoredSupportCountry,
} from "@/lib/support-country";

export function useSupportCountryState() {
  const resolveInput = useMemo(() => clientSupportResolveInput(), []);
  const [overrideCode, setOverrideCode] = useState<string | null>(() =>
    readStoredSupportCountry(),
  );

  const country = useMemo(() => {
    if (overrideCode) {
      const forced = resolveSupportCountry({
        ...resolveInput,
        storedCountry: overrideCode,
      });
      if (forced) return forced;
    }
    return resolveSupportCountry(resolveInput);
  }, [resolveInput, overrideCode]);

  const setCountryCode = useCallback((code: string) => {
    writeStoredSupportCountry(code);
    setOverrideCode(code.trim().toUpperCase());
  }, []);

  return { country, setCountryCode, resolveInput };
}

function ResourceLinks({ contact }: { contact: SupportContact }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {contact.phone ? (
        <a
          href={telHref(contact.phone)}
          className="font-medium text-accent-link underline-offset-2 hover:underline"
        >
          Call {contact.phone}
        </a>
      ) : null}
      {contact.sms ? (
        <a
          href={smsHref(contact.sms, contact.smsBody)}
          className="font-medium text-accent-link underline-offset-2 hover:underline"
        >
          Text {contact.sms}
        </a>
      ) : null}
      {contact.url ? (
        <a
          href={contact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-link underline-offset-2 hover:underline"
        >
          Website
        </a>
      ) : null}
    </div>
  );
}

function ResourceRow({ contact }: { contact: SupportContact }) {
  return (
    <li className="border-b border-border/60 py-3 last:border-b-0 last:pb-0">
      <p className="text-sm font-medium text-foreground">{contact.name}</p>
      <p className="mt-0.5 text-sm text-muted">{contact.description}</p>
      <p className="mt-0.5 text-xs text-muted">{contact.hours}</p>
      <ResourceLinks contact={contact} />
    </li>
  );
}

export function SupportResourcesList({
  country,
  className = "",
}: {
  country: SupportCountry | null;
  className?: string;
}) {
  const intl = SUPPORT_RESOURCES.international;

  if (!country) {
    return (
      <div className={className}>
        <p className="text-sm leading-relaxed text-muted">
          {intl.description}
        </p>
        <a
          href={intl.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-accent-link underline-offset-2 hover:underline"
        >
          {intl.name}
        </a>
        <p className="mt-3 text-sm text-muted">
          If you&apos;re in immediate danger,{" "}
          {SUPPORT_RESOURCES.fallbackEmergencyHint}.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <ul className="list-none p-0">
        {country.resources.map((r) => (
          <ResourceRow key={`${country.code}-${r.name}`} contact={r} />
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        If you&apos;re in immediate danger, call{" "}
        <a
          href={telHref(country.emergencyNumber)}
          className="font-medium text-accent-link underline-offset-2 hover:underline"
        >
          {country.emergencyNumber}
        </a>
        .
      </p>
    </div>
  );
}

export function SupportCountryPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
}) {
  const countries = useMemo(() => listSupportCountries(), []);
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
    >
      {countries.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function SupportResourcesFooter({
  country,
  countryPickerOpen,
  onToggleCountryPicker,
  onCountryChange,
  pickerId,
}: {
  country: SupportCountry | null;
  countryPickerOpen: boolean;
  onToggleCountryPicker: () => void;
  onCountryChange: (code: string) => void;
  pickerId?: string;
}) {
  const intl = SUPPORT_RESOURCES.international;
  const selectedCode =
    country?.code ?? readStoredSupportCountry() ?? listSupportCountries()[0]?.code ?? "GB";

  return (
    <footer className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs text-muted">
      <p>Consciously isn&apos;t a crisis service.</p>
      <p>
        {country ? (
          <>
            Not in {country.name}?{" "}
            <button
              type="button"
              onClick={onToggleCountryPicker}
              className="cursor-pointer font-medium text-accent-link underline-offset-2 hover:underline"
            >
              Change
            </button>
          </>
        ) : (
          <>
            Choose your country:{" "}
            <button
              type="button"
              onClick={onToggleCountryPicker}
              className="cursor-pointer font-medium text-accent-link underline-offset-2 hover:underline"
            >
              Select
            </button>
          </>
        )}
      </p>
      {countryPickerOpen ? (
        <SupportCountryPicker
          id={pickerId}
          value={selectedCode}
          onChange={(code) => {
            onCountryChange(code);
            onToggleCountryPicker();
          }}
        />
      ) : null}
      <p>
        <a
          href={intl.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-link underline-offset-2 hover:underline"
        >
          See services in other countries
        </a>
      </p>
    </footer>
  );
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
};

export function InsightsSupportDialog({ open, onClose }: DialogProps) {
  const titleId = useId();
  const pickerId = useId();
  const { country, setCountryCode } = useSupportCountryState();
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setCountryPickerOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-[rgba(27,34,48,0.38)] p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[min(92vh,36rem)] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[20px] border border-border bg-card shadow-[0_24px_60px_rgba(27,34,48,0.25)] outline-none sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div>
            <h2
              id={titleId}
              className="font-display text-lg font-normal text-foreground"
            >
              Support resources
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Free, confidential services you can reach out to.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg leading-none text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <SupportResourcesList country={country} />
          <SupportResourcesFooter
            country={country}
            countryPickerOpen={countryPickerOpen}
            onToggleCountryPicker={() => setCountryPickerOpen((v) => !v)}
            onCountryChange={setCountryCode}
            pickerId={pickerId}
          />
        </div>
      </div>
    </div>
  );
}
