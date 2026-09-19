"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectUserAvatar } from "@/components/connect-user-avatar";
import {
  getConnectUser,
  type ConnectUserProfile,
} from "@/lib/connect-users";
import { PROFILE_PREFS_CHANGED_EVENT } from "@/lib/profile-prefs";

export function ConnectUserProfileView() {
  const params = useParams();
  const username =
    typeof params.username === "string" ? params.username : "";
  const [user, setUser] = useState<ConnectUserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setUser(getConnectUser(username));
      setReady(true);
    };
    sync();
    window.addEventListener(PROFILE_PREFS_CHANGED_EVENT, sync);
    window.addEventListener("medimade-session-changed", sync);
    return () => {
      window.removeEventListener(PROFILE_PREFS_CHANGED_EVENT, sync);
      window.removeEventListener("medimade-session-changed", sync);
    };
  }, [username]);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href="/connect"
          className="text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          ← Connect
        </Link>
        <h1 className="mt-8 font-display text-3xl font-medium text-foreground">
          Member not found
        </h1>
        <p className="mt-2 text-muted">
          This Connect profile isn&apos;t available.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/connect"
        className="text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        ← Connect
      </Link>

      <header className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <ConnectUserAvatar name={user.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {user.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted">@{user.username}</p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground">
            {user.bio}
          </p>
        </div>
      </header>

      <section className="mt-12">
        <h2 className="font-display text-xl font-medium tracking-tight text-foreground sm:text-2xl">
          Shared meditations
        </h2>
        <p className="mt-1 text-sm text-muted">
          Public sessions this member has chosen to share (placeholders for
          now).
        </p>

        {user.meditations.length === 0 ? (
          <p className="mt-6 text-sm text-muted">No shared meditations yet.</p>
        ) : (
          <ul className="mt-6 divide-y divide-border border-t border-border">
            {user.meditations.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg font-medium tracking-tight text-foreground">
                    {m.title}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-accent-link">
                    {m.typeLabel}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-muted">{m.durationLabel}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
