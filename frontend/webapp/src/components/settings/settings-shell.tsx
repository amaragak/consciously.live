import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  SETTINGS_NAV,
  SettingsSectionContent,
  type SettingsSectionId,
} from "@/components/settings/settings-sections";
import type { UserSettingsV1 } from "@/lib/user-settings";

const SECTION_IDS = new Set<string>(SETTINGS_NAV.map((n) => n.id));

export function parseSettingsSection(
  raw: string | undefined,
): SettingsSectionId | null {
  if (!raw) return null;
  return SECTION_IDS.has(raw) ? (raw as SettingsSectionId) : null;
}

/** `null` until the first media query sync — avoids desktop redirect on mobile. */
function useIsMobileNav(): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}

export function SettingsShell({
  settings,
  loading,
  loadError,
  saveError,
  savedVisible,
  onPatch,
}: {
  settings: UserSettingsV1 | null;
  loading: boolean;
  loadError: string | null;
  saveError: string | null;
  savedVisible: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const navigate = useNavigate();
  const params = useParams<{ section?: string }>();
  const isMobile = useIsMobileNav();
  const sectionParam = parseSettingsSection(params.section);
  const version =
    (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() ||
    "0.1.0";

  const activeSection: SettingsSectionId | null = useMemo(() => {
    if (isMobile === true) return sectionParam;
    if (isMobile === false) return sectionParam ?? "account";
    return sectionParam;
  }, [isMobile, sectionParam]);

  // Wait for viewport; then desktop bare `/settings` → account in the URL.
  if (isMobile === null) {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center px-3 py-3 text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (!isMobile && !sectionParam) {
    return <Navigate to="/settings/account" replace />;
  }

  const showList = isMobile && !sectionParam;
  const showSection = !isMobile || Boolean(sectionParam);

  const statusBanner =
    loadError || saveError || savedVisible ? (
      <div className="flex flex-wrap items-center gap-2">
        {loadError ? (
          <p className="text-sm text-danger" role="alert">
            {loadError}
          </p>
        ) : null}
        {saveError ? (
          <p className="text-sm text-danger" role="alert">
            {saveError}
          </p>
        ) : null}
        {savedVisible ? (
          <p
            role="status"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            <span aria-hidden="true">✓</span> Saved
          </p>
        ) : null}
      </div>
    ) : null;

  const nav = (
    <nav
      aria-label="Settings sections"
      className="flex h-full flex-col gap-0.5 border-border bg-background/60 px-3 py-4 md:w-56 md:shrink-0 md:border-r lg:w-60"
    >
      {SETTINGS_NAV.map((item) => {
        const active = activeSection === item.id;
        return (
          <Link
            key={item.id}
            to={`/settings/${item.id}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-r-xl px-3 py-2.5 text-base transition-colors ${
              active
                ? "border-l-2 border-l-[color:var(--header-gold,var(--gold))] bg-card font-semibold text-foreground"
                : "border-l-2 border-l-transparent text-muted hover:bg-card/80 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <div className="mt-4 border-t border-border pt-4">
        <Link
          to="/settings/general#settings-help"
          className="block rounded-xl px-3 py-2 text-base text-muted hover:bg-card/80 hover:text-foreground"
        >
          Help & feedback
        </Link>
        <p className="px-3 py-2 font-mono text-sm text-muted">v{version}</p>
      </div>
    </nav>
  );

  let mainContent: ReactNode;
  if (loading || !settings) {
    mainContent = <p className="text-sm text-muted">Loading settings…</p>;
  } else if (showList) {
    mainContent = (
      <div className="space-y-4">
        {statusBanner}
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {SETTINGS_NAV.map((item) => (
            <li key={item.id}>
              <Link
                to={`/settings/${item.id}`}
                className="flex items-center justify-between px-4 py-4 text-base font-medium text-foreground hover:bg-background/80"
              >
                {item.label}
                <span className="text-muted" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/settings/general#settings-help"
              className="flex items-center justify-between px-4 py-4 text-base font-medium text-foreground hover:bg-background/80"
            >
              Help & feedback
              <span className="text-muted" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        </ul>
        <p className="font-mono text-xs text-muted">Version {version}</p>
      </div>
    );
  } else if (showSection && activeSection) {
    mainContent = (
      <div className="space-y-4">
        {isMobile ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="text-sm font-medium text-muted hover:text-foreground"
              onClick={() => navigate("/settings")}
            >
              ← All settings
            </button>
            {statusBanner}
          </div>
        ) : (
          statusBanner
        )}
        <SettingsSectionContent
          section={activeSection}
          settings={settings}
          onPatch={onPatch}
        />
      </div>
    );
  } else {
    mainContent = null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {!isMobile ? nav : null}
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-3 py-3 pb-10 sm:px-4 sm:pb-12 md:justify-start md:px-3 md:pt-4 md:pb-14 lg:px-4 lg:pb-16">
        <div className="w-full max-w-[760px]">{mainContent}</div>
      </div>
    </div>
  );
}
