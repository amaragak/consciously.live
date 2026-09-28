import { Link, useNavigate, useParams } from "react-router-dom";
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

function useIsMobileNav(): boolean {
  const [mobile, setMobile] = useState(false);
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

  // Desktop: `/settings` shows Account in place (no redirect). A navigate to
  // `/settings/account` used to race the catch-all `*` route and bounce home
  // when the section route wasn't registered yet (HMR / older bundles).
  const activeSection: SettingsSectionId | null = useMemo(() => {
    if (isMobile) return sectionParam;
    return sectionParam ?? "account";
  }, [isMobile, sectionParam]);

  const showList = isMobile && !sectionParam;
  const showSection = !isMobile || Boolean(sectionParam);

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
          Settings
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Changes save automatically. Everything starts at the most private
          option.
        </p>
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
      </div>
      {savedVisible ? (
        <p
          role="status"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground sm:self-auto"
        >
          <span aria-hidden="true">✓</span> Saved
        </p>
      ) : null}
    </div>
  );

  const nav = (
    <nav
      aria-label="Settings sections"
      className="flex h-full flex-col gap-0.5 border-border bg-background/60 px-3 py-6 md:w-56 md:shrink-0 md:border-r lg:w-60"
    >
      <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-widest text-muted">
        Settings
      </p>
      {SETTINGS_NAV.map((item) => {
        const active = activeSection === item.id;
        return (
          <Link
            key={item.id}
            to={`/settings/${item.id}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active
                ? "border border-border bg-card font-semibold text-foreground"
                : "text-muted hover:bg-card/80 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <div className="mt-4 border-t border-border pt-4">
        <Link
          to="/settings/general#settings-help"
          className="block rounded-xl px-3 py-2 text-sm text-muted hover:bg-card/80 hover:text-foreground"
        >
          Help & feedback
        </Link>
        <p className="px-3 py-2 font-mono text-xs text-muted">v{version}</p>
      </div>
    </nav>
  );

  let mainContent: ReactNode;
  if (loading || !settings) {
    mainContent = <p className="text-sm text-muted">Loading settings…</p>;
  } else if (showList) {
    mainContent = (
      <div className="space-y-6">
        {header}
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {SETTINGS_NAV.map((item) => (
            <li key={item.id}>
              <Link
                to={`/settings/${item.id}`}
                className="flex items-center justify-between px-4 py-4 text-sm font-medium text-foreground hover:bg-background/80"
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
              className="flex items-center justify-between px-4 py-4 text-sm font-medium text-foreground hover:bg-background/80"
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
      <div className="space-y-8">
        {isMobile ? (
          <button
            type="button"
            className="text-sm font-medium text-muted hover:text-foreground"
            onClick={() => navigate("/settings")}
          >
            ← All settings
          </button>
        ) : (
          header
        )}
        {isMobile ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-medium tracking-tight">
              {SETTINGS_NAV.find((n) => n.id === activeSection)?.label}
            </h1>
            {savedVisible ? (
              <p role="status" className="text-sm text-muted">
                ✓ Saved
              </p>
            ) : null}
            {saveError ? (
              <p role="alert" className="w-full text-sm text-danger">
                {saveError}
              </p>
            ) : null}
          </div>
        ) : null}
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
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 py-6 sm:px-6 md:py-10">
        <div className="w-full max-w-[760px]">{mainContent}</div>
      </div>
    </div>
  );
}
