/**
 * Pre-release waitlist copy for the marketing homepage. The waitlist itself is
 * switched on/off in Admin → Dev UI ("Homepage waitlist").
 * Month is NEXT_PUBLIC_PRE_RELEASE_MONTH, defaulting to November.
 */
export const PRE_RELEASE_MONTH =
  process.env.NEXT_PUBLIC_PRE_RELEASE_MONTH?.trim() || "November";
