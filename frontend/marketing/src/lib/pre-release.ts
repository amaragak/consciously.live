/**
 * Pre-release waitlist for the marketing homepage.
 * On unless NEXT_PUBLIC_PRE_RELEASE=0 (then rebuild). No code change required to turn it off.
 * Month is NEXT_PUBLIC_PRE_RELEASE_MONTH, defaulting to November.
 */
export const PRE_RELEASE = process.env.NEXT_PUBLIC_PRE_RELEASE !== "0";

export const PRE_RELEASE_MONTH =
  process.env.NEXT_PUBLIC_PRE_RELEASE_MONTH?.trim() || "November";
