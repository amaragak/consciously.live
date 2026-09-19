import {
  loadProfilePrefs,
  profileDisplayName,
} from "@/lib/profile-prefs";

/**
 * Demo Connect profiles until the forum user API exists.
 */

export type ConnectPublicMeditation = {
  id: string;
  title: string;
  durationLabel: string;
  typeLabel: string;
};

export type ConnectUserProfile = {
  username: string;
  displayName: string;
  bio: string;
  /** Soft accent for generated avatar initials. Use `-1` for app primary. */
  avatarHue: number;
  meditations: ConnectPublicMeditation[];
};

export const CONNECT_USERS: Record<string, ConnectUserProfile> = {
  alex: {
    username: "alex",
    displayName: "Alex",
    bio: "Writing and walking through questions of attention, enoughness, and how to live online without disappearing into it.",
    /** Matches light-mode CTA / brand fill (`--accent-button`). */
    avatarHue: -1,
    meditations: [
      {
        id: "m1",
        title: "Returning to the breath after scrolling",
        durationLabel: "12 min",
        typeLabel: "Focus",
      },
      {
        id: "m2",
        title: "Enough for today",
        durationLabel: "8 min",
        typeLabel: "Rest",
      },
    ],
  },
  priya: {
    username: "priya",
    displayName: "Priya",
    bio: "Body-first practice. Interested in how sensation teaches what rules can’t.",
    avatarHue: 340,
    meditations: [
      {
        id: "m3",
        title: "Listening for the edge of enough",
        durationLabel: "10 min",
        typeLabel: "Body",
      },
    ],
  },
  leo: {
    username: "leo",
    displayName: "Leo",
    bio: "Giving attention like a gift. Weather metaphors welcome.",
    avatarHue: 200,
    meditations: [
      {
        id: "m4",
        title: "One thing that deserves you",
        durationLabel: "15 min",
        typeLabel: "Focus",
      },
      {
        id: "m5",
        title: "Stepping out of the storm",
        durationLabel: "6 min",
        typeLabel: "Reset",
      },
    ],
  },
  maya: {
    username: "maya",
    displayName: "Maya",
    bio: "Journaling without a thesis. Trying to be a witness, not a manager.",
    avatarHue: 160,
    meditations: [
      {
        id: "m6",
        title: "Writing without fixing",
        durationLabel: "11 min",
        typeLabel: "Reflect",
      },
    ],
  },
  chris: {
    username: "chris",
    displayName: "Chris",
    bio: "Dropping the lessons-learned section. Change on its own schedule.",
    avatarHue: 45,
    meditations: [],
  },
  jordan: {
    username: "jordan",
    displayName: "Jordan",
    bio: "Learning to stay kind when the world is loud. Looking for lived answers.",
    avatarHue: 265,
    meditations: [
      {
        id: "m7",
        title: "Anger that is grief",
        durationLabel: "14 min",
        typeLabel: "Emotion",
      },
    ],
  },
  noor: {
    username: "noor",
    displayName: "Noor",
    bio: "Walks without podcasts. Motion before narrative.",
    avatarHue: 175,
    meditations: [
      {
        id: "m8",
        title: "Walking the heat out",
        durationLabel: "9 min",
        typeLabel: "Movement",
      },
    ],
  },
  ellis: {
    username: "ellis",
    displayName: "Ellis",
    bio: "Writes the unkind draft first, then asks what the anger is protecting.",
    avatarHue: 12,
    meditations: [],
  },
  sam: {
    username: "sam",
    displayName: "Sam",
    bio: "Freedom wearing a schedule — or a costume. Still sorting which is which.",
    avatarHue: 300,
    meditations: [
      {
        id: "m9",
        title: "Morning silence",
        durationLabel: "20 min",
        typeLabel: "Silence",
      },
    ],
  },
  river: {
    username: "river",
    displayName: "River",
    bio: "Structure that returns me to myself. Contemplative life without the performance.",
    avatarHue: 190,
    meditations: [
      {
        id: "m10",
        title: "Not a costume",
        durationLabel: "13 min",
        typeLabel: "Reflect",
      },
    ],
  },
  you: {
    username: "you",
    displayName: "You",
    bio: "Your public Connect profile will live here — bio, shared meditations, and threads.",
    avatarHue: 32,
    meditations: [
      {
        id: "m-you",
        title: "Placeholder shared session",
        durationLabel: "10 min",
        typeLabel: "Demo",
      },
    ],
  },
};

export function connectUsernameFromDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") || "you";
}

export function getConnectUser(
  username: string,
): ConnectUserProfile | null {
  const key = username.trim().toLowerCase();
  if (!key) return null;
  const demo = CONNECT_USERS[key];
  if (demo) return demo;

  if (typeof window === "undefined") return null;
  const prefs = loadProfilePrefs();
  if (prefs.username && prefs.username === key) {
    const display =
      profileDisplayName(prefs, prefs.username) || prefs.username;
    return {
      username: prefs.username,
      displayName: display,
      bio: "Your public Connect profile — bio and shared meditations will show here.",
      avatarHue: prefs.avatarHue,
      meditations: [
        {
          id: "m-you",
          title: "Placeholder shared session",
          durationLabel: "10 min",
          typeLabel: "Demo",
        },
      ],
    };
  }
  return null;
}

export function connectUserHref(displayNameOrUsername: string): string {
  const key = connectUsernameFromDisplayName(displayNameOrUsername);
  return `/connect/user/${encodeURIComponent(key)}`;
}
