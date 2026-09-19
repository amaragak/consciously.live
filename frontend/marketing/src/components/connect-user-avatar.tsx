"use client";

import Link from "next/link";
import {
  connectUserHref,
  connectUsernameFromDisplayName,
  getConnectUser,
} from "@/lib/connect-users";
import {
  loadProfilePrefs,
  PROFILE_PREFS_CHANGED_EVENT,
} from "@/lib/profile-prefs";
import { useEffect, useState } from "react";

type Props = {
  /** Display name as shown in the forum (e.g. "Alex"). */
  name: string;
  size?: "sm" | "md" | "lg";
  /** Show name next to the avatar. */
  showName?: boolean;
  className?: string;
};

const SIZE_CLASS = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-14 text-lg",
} as const;

/**
 * Initials avatar linking to `/connect/user/[username]`.
 * Uses profile prefs colour when the name matches the signed-in member.
 */
export function ConnectUserAvatar({
  name,
  size = "sm",
  showName = false,
  className = "",
}: Props) {
  const username = connectUsernameFromDisplayName(name);
  const [hue, setHue] = useState(() => {
    const profile = getConnectUser(username);
    return profile?.avatarHue ?? 32;
  });
  const [label, setLabel] = useState(name);

  useEffect(() => {
    const sync = () => {
      const prefs = loadProfilePrefs();
      const profile = getConnectUser(username);
      const display = profile?.displayName ?? name;
      setLabel(display);
      if (
        prefs.username &&
        (prefs.username === username ||
          connectUsernameFromDisplayName(display) === prefs.username)
      ) {
        setHue(prefs.avatarHue);
      } else {
        setHue(profile?.avatarHue ?? 32);
      }
    };
    sync();
    window.addEventListener(PROFILE_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PROFILE_PREFS_CHANGED_EVENT, sync);
  }, [name, username]);

  const initial = (label.trim().charAt(0) || "?").toUpperCase();
  const href = connectUserHref(username);

  return (
    <Link
      href={href}
      className={`inline-flex min-w-0 items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent-link/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
      title={`View ${label}'s profile`}
    >
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-on-accent ${SIZE_CLASS[size]}`}
        style={
          hue < 0
            ? { background: "var(--accent-button)" }
            : { background: `hsl(${hue} 62% 58%)` }
        }
      >
        {initial}
      </span>
      {showName ? (
        <span className="truncate text-sm font-medium text-foreground">
          {label}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </Link>
  );
}
