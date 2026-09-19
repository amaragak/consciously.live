"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
  saveMedimadeProfileDisplayName,
  setMedimadeSession,
} from "@/lib/medimade-api";
import { connectUserHref } from "@/lib/connect-users";
import {
  AVATAR_HUE_PRESETS,
  loadProfilePrefs,
  profileDisplayName,
  saveProfilePrefs,
  type ProfilePrefs,
} from "@/lib/profile-prefs";

function hasAppSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

function AvatarSwatch({
  hue,
  selected,
  onSelect,
  label,
}: {
  hue: number;
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className={`size-9 rounded-full transition-[box-shadow,transform] ${
        selected
          ? "ring-2 ring-accent-link ring-offset-2 ring-offset-background"
          : "hover:scale-105"
      }`}
      style={
        hue < 0
          ? { background: "var(--accent-button)" }
          : { background: `hsl(${hue} 62% 58%)` }
      }
    />
  );
}

/**
 * Account profile editor at `/profile` (Next marketing).
 */
export function ProfileSettingsPage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [prefs, setPrefs] = useState<ProfilePrefs>(() => loadProfilePrefs());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      const ok = hasAppSession();
      setSignedIn(ok);
      if (ok) {
        const loaded = loadProfilePrefs();
        if (!loaded.firstName && !loaded.lastName) {
          const sessionName = getMedimadeSessionDisplayName()?.trim() || "";
          const parts = sessionName.split(/\s+/).filter(Boolean);
          if (parts.length >= 1) {
            loaded.firstName = parts[0] ?? "";
            loaded.lastName = parts.slice(1).join(" ");
          }
        }
        if (!loaded.username) {
          const email = getMedimadeSessionEmail()?.trim() || "";
          const local = email.split("@")[0] || "member";
          loaded.username = local
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "")
            .slice(0, 32);
        }
        setPrefs(loaded);
      }
      setReady(true);
    };
    sync();
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  const onSave = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const saved = saveProfilePrefs(prefs);
      setPrefs(saved);
      const display = profileDisplayName(saved, getMedimadeSessionDisplayName() ?? "");
      if (display && getMedimadeSessionJwt()) {
        try {
          const { token, displayName } =
            await saveMedimadeProfileDisplayName(display);
          setMedimadeSession(token, getMedimadeSessionEmail(), displayName);
        } catch {
          /* Local prefs still saved if API name update fails. */
        }
      }
      setStatus("Profile saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }, [prefs]);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
          Profile
        </h1>
        <p className="mt-3 text-muted">Sign in to edit your profile.</p>
        <Link
          href="/login?next=%2Fprofile"
          className="mt-6 inline-flex rounded-full accent-fill-gradient px-6 py-2.5 text-sm font-semibold text-on-accent"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const publicHref = prefs.username
    ? connectUserHref(prefs.username)
    : "/connect";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        Profile
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
        How you appear on Connect and across Consciously.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted">
                First name
              </label>
              <input
                value={prefs.firstName}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, firstName: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent/25 focus:ring-2"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted">
                Last name
              </label>
              <input
                value={prefs.lastName}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, lastName: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent/25 focus:ring-2"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted">
              Username
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-muted">@</span>
              <input
                value={prefs.username}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    username: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, ""),
                  }))
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent/25 focus:ring-2"
                autoComplete="username"
                spellCheck={false}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Letters, numbers, and underscores. Used on your public Connect
              page.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted">Avatar colour</p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {AVATAR_HUE_PRESETS.map((opt) => (
                <AvatarSwatch
                  key={opt.label}
                  hue={opt.hue}
                  label={opt.label}
                  selected={prefs.avatarHue === opt.hue}
                  onSelect={() =>
                    setPrefs((p) => ({ ...p, avatarHue: opt.hue }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full accent-fill-gradient px-6 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save profile"}
            </button>
            {status ? (
              <p className="text-sm text-muted" role="status">
                {status}
              </p>
            ) : null}
          </div>
        </form>

        <aside className="space-y-6 border-t border-border pt-8 lg:border-t-0 lg:pt-0">
          <div>
            <h2 className="font-display text-lg font-medium text-foreground">
              Public profile
            </h2>
            <p className="mt-1 text-sm text-muted">
              How others see you on Connect.
            </p>
            <Link
              href={publicHref}
              className="mt-3 inline-flex text-sm font-semibold text-accent-link hover:underline"
            >
              View public profile →
            </Link>
          </div>

          <div>
            <h2 className="font-display text-lg font-medium text-foreground">
              Account
            </h2>
            <ul className="mt-3 divide-y divide-border border-t border-border">
              <li>
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-between py-3 text-left text-sm text-muted opacity-60"
                >
                  <span>Reset password</span>
                  <span className="text-xs">Soon</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-between py-3 text-left text-sm text-muted opacity-60"
                >
                  <span>Email preferences</span>
                  <span className="text-xs">Soon</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-between py-3 text-left text-sm text-muted opacity-60"
                >
                  <span>Download my data</span>
                  <span className="text-xs">Soon</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  disabled
                  className="flex w-full items-center justify-between py-3 text-left text-sm text-muted opacity-60"
                >
                  <span>Delete account</span>
                  <span className="text-xs">Soon</span>
                </button>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
